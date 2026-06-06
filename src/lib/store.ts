import { create } from 'zustand'
import type {
  CapabilityReport,
  CatalogModel,
  EditLayer,
  EngineDevice,
  PrimaryLanguage,
  TranscriptRecord,
} from './types'
import { detectCapability, estimateEta } from './capability'
import { buildCatalog, recommendModel } from './catalog'
import {
  getMediaAsset,
  getSetting,
  listTranscripts,
  saveMediaAsset,
  saveTranscript,
  setSetting,
} from './db'
import {
  disposeEngine,
  isCancelled,
  languageName,
  transcribeWithEngine,
} from './engine'
import { buildAsrLayer, deriveEditLayer } from './asr'
import { decodeToFloat32 } from './ffmpeg'
import { uid } from './utils'
import { evictModel, markProvisioned as persistProvisioned, reconcileProvisioned } from './models'

/** Max undo steps kept per open transcript (Edit-layer time machine). */
const HISTORY_LIMIT = 100

export type View = 'landing' | 'onboarding' | 'workspace' | 'transcript' | 'history'

const VIEW_HASH: Record<View, string> = {
  landing: '#/',
  onboarding: '#/models',
  workspace: '#/transcribe',
  transcript: '#/transcript',
  history: '#/history',
}

export function viewFromHash(hash = typeof window !== 'undefined' ? window.location.hash : ''): View | null {
  const normalized = hash || '#/'
  return (Object.entries(VIEW_HASH).find(([, h]) => h === normalized)?.[0] as View | undefined) ?? null
}

function writeViewHash(view: View): void {
  if (typeof window === 'undefined') return
  const next = VIEW_HASH[view]
  if (window.location.hash !== next) window.location.hash = next
}

export type JobKind = 'file' | 'rerun'
export type JobPhase = 'decoding' | 'loading' | 'transcribing' | 'cancelling'

/** A single in-flight transcription, owned by the store so it survives view changes. */
export interface ActiveJob {
  kind: JobKind
  phase: JobPhase
  /** 0..100 progress within the current phase. */
  pct: number
  /** Source filename — what the user recognises the job by. */
  label: string
  device: EngineDevice
  /** Live streaming preview text. */
  partial: string
  etaSec: number | null
}

/** Post-job banner: the result is ready (click to open) or the run failed (optionally retry). */
export interface JobNotice {
  kind: 'done' | 'error'
  label: string
  recordId?: string
  message?: string
  retry?: JobKind
}

// The abort handle and last-file live OUTSIDE reactive state on purpose: mutating them must not
// trigger renders, and the running job closure has to outlive the component that started it —
// that decoupling is exactly what makes a job survive navigating away from its origin screen.
let jobAbort: AbortController | null = null
let lastFile: File | null = null

interface AppState {
  ready: boolean
  view: View
  capability: CapabilityReport | null
  catalog: CatalogModel[]
  /** Catalog ids whose weights are present in Cache Storage, reconciled on init. */
  provisioned: string[]
  primaryLanguage: PrimaryLanguage
  /** The provisioned, active Transcription Model (downloaded + selected). */
  activeModel: CatalogModel | null
  record: TranscriptRecord | null
  /** Transient object URL for the current session's media (never persisted). */
  mediaUrl: string | null
  history: TranscriptRecord[]
  /** Undo/redo stacks of Edit layers for the open transcript (a basic time machine). */
  past: EditLayer[]
  future: EditLayer[]
  /** The single in-flight transcription job (null when idle). Lives here so navigation is safe. */
  job: ActiveJob | null
  /** Post-job banner shown when the user isn't already looking at the result. */
  jobNotice: JobNotice | null

  init: () => Promise<void>
  setView: (v: View) => void
  setPrimaryLanguage: (l: PrimaryLanguage) => void
  setActiveModel: (m: CatalogModel) => void
  /** Record that a model's weights are now cached (after a successful Download). */
  markProvisioned: (id: string) => void
  /** Evict a model from Cache Storage; clears Active Model + disposes engine if it was active. */
  evict: (m: CatalogModel) => Promise<void>
  setCapability: (c: CapabilityReport) => void
  setRecord: (r: TranscriptRecord | null) => void
  setMediaUrl: (url: string | null) => void
  /** Apply an edit to the open transcript: push the prior Edit layer onto undo, clear redo, autosave. */
  commitEdit: (edit: EditLayer) => void
  undo: () => void
  redo: () => void
  refreshHistory: () => Promise<void>
  recommended: () => CatalogModel | null
  /** Transcribe a dropped/chosen file as a nav-safe background job. */
  runFileJob: (file: File) => Promise<void>
  /** Re-transcribe the open record with the Active Model as a nav-safe background job. */
  runRerunJob: () => Promise<void>
  /** Abort the in-flight job. */
  stopActiveJob: () => void
  /** Re-dispatch the last failed job. */
  retryJob: () => void
  dismissJobNotice: () => void
  /** Open a transcript by id (loads its media). Used by History and the ready-banner. */
  openTranscript: (id: string) => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  view: 'landing',
  capability: null,
  catalog: [],
  provisioned: [],
  primaryLanguage: 'en',
  activeModel: null,
  record: null,
  mediaUrl: null,
  history: [],
  past: [],
  future: [],
  job: null,
  jobNotice: null,

  init: async () => {
    const [capability, history] = await Promise.all([
      detectCapability(),
      listTranscripts().catch(() => [] as TranscriptRecord[]),
    ])
    const catalog = buildCatalog()
    const savedLang = (await getSetting<PrimaryLanguage>('primaryLanguage').catch(() => undefined)) ?? 'en'
    const savedModelId = await getSetting<string>('activeModelId').catch(() => undefined)

    // Reconcile the provisioned-id hint against Cache Storage truth (ADR-0008).
    const idToHf = new Map(catalog.map((m) => [m.id, m.hfId]))
    const resolveHf = (id: string): string | null => idToHf.get(id) ?? null
    const provisioned = await reconcileProvisioned(resolveHf).catch(() => [] as string[])

    // Restore the Active Model only if its weights are still cached.
    let activeModel: CatalogModel | null = savedModelId
      ? catalog.find((m) => m.id === savedModelId) ?? null
      : null
    if (activeModel && !provisioned.includes(activeModel.id)) activeModel = null

    const hashView = viewFromHash()
    const initialView = hashView ?? (activeModel ? 'workspace' : 'landing')
    if (!hashView && typeof window !== 'undefined' && window.location.hash) {
      writeViewHash(initialView)
    }
    set({
      capability,
      catalog,
      history,
      provisioned,
      primaryLanguage: savedLang,
      activeModel,
      ready: true,
      view: initialView,
    })
  },

  setView: (view) => {
    writeViewHash(view)
    set({ view })
  },
  setPrimaryLanguage: (l) => {
    void setSetting('primaryLanguage', l)
    set({ primaryLanguage: l })
  },
  setActiveModel: (m) => {
    void setSetting('activeModelId', m.id)
    set({ activeModel: m })
  },
  markProvisioned: (id) => {
    void persistProvisioned(id)
    set((s) => ({
      provisioned: s.provisioned.includes(id) ? s.provisioned : [...s.provisioned, id],
    }))
  },
  evict: async (m) => {
    await evictModel(m.hfId, m.id)
    const wasActive = get().activeModel?.id === m.id
    if (wasActive) {
      await disposeEngine()
      if (wasActive) void setSetting('activeModelId', '')
    }
    set((s) => ({
      provisioned: s.provisioned.filter((x) => x !== m.id),
      activeModel: wasActive ? null : s.activeModel,
    }))
  },
  setCapability: (capability) => set({ capability }),
  setRecord: (record) =>
    set((s) => {
      // Opening / closing / replacing a different transcript resets the time machine.
      const changed = (record?.id ?? null) !== (s.record?.id ?? null)
      return changed ? { record, past: [], future: [] } : { record }
    }),
  setMediaUrl: (mediaUrl) => set({ mediaUrl }),
  commitEdit: (edit) => {
    const { record } = get()
    if (!record) return
    const updated = { ...record, edit, updatedAt: Date.now() }
    set((s) => ({
      record: updated,
      past: [...s.past, record.edit].slice(-HISTORY_LIMIT),
      future: [],
    }))
    void saveTranscript(updated).then(() => get().refreshHistory())
  },
  undo: () => {
    const { record, past, future } = get()
    if (!record || past.length === 0) return
    const prev = past[past.length - 1]
    const updated = { ...record, edit: prev, updatedAt: Date.now() }
    set({
      record: updated,
      past: past.slice(0, -1),
      future: [record.edit, ...future].slice(0, HISTORY_LIMIT),
    })
    void saveTranscript(updated).then(() => get().refreshHistory())
  },
  redo: () => {
    const { record, past, future } = get()
    if (!record || future.length === 0) return
    const next = future[0]
    const updated = { ...record, edit: next, updatedAt: Date.now() }
    set({
      record: updated,
      past: [...past, record.edit].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })
    void saveTranscript(updated).then(() => get().refreshHistory())
  },
  refreshHistory: async () => set({ history: await listTranscripts() }),
  recommended: () => {
    const s = get()
    return s.capability ? recommendModel(s.catalog, s.capability, s.primaryLanguage) : null
  },

  runFileJob: async (file) => {
    const { activeModel, primaryLanguage, capability, job } = get()
    if (!activeModel || activeModel.task !== 'transcription' || job) return // single-job invariant: one shared engine at a time
    const patch = (p: Partial<ActiveJob>) =>
      set((s) => (s.job ? { job: { ...s.job, ...p } } : {}))
    lastFile = file
    jobAbort?.abort()
    const ac = new AbortController()
    jobAbort = ac
    const device = capability?.device ?? 'wasm'
    set({
      jobNotice: null,
      mediaUrl: URL.createObjectURL(file),
      job: { kind: 'file', phase: 'decoding', pct: 0, label: file.name, device, partial: '', etaSec: null },
    })
    try {
      const { wave, durationSec } = await decodeToFloat32(
        file,
        (r) => patch({ pct: Math.round(r * 100) }),
        ac.signal,
      )
      patch({ phase: 'loading', pct: 0, etaSec: estimateEta(durationSec, capability?.benchmarkRtf ?? null) })
      const language = languageName(primaryLanguage, activeModel.englishOnly)
      const out = await transcribeWithEngine(activeModel, device, wave, {
        signal: ac.signal,
        language,
        englishOnly: activeModel.englishOnly,
        onLoadProgress: (s) => patch({ pct: Math.round(s.ratio * 100) }),
        onDeviceReady: (d) => patch({ device: d, phase: 'transcribing', pct: 0 }),
        onFallback: (d) => patch({ device: d, phase: 'loading', pct: 0, partial: '' }),
        onProgress: (s) => patch({ pct: Math.round(s.ratio * 100) }),
        onPartial: (t) => patch({ partial: t }),
      })
      const asrLayer = buildAsrLayer(out, language ?? 'auto')
      const now = Date.now()
      const mediaId = uid('media_')
      const record: TranscriptRecord = {
        id: uid('tr_'),
        source: {
          filename: file.name,
          sizeBytes: file.size,
          durationSec,
          hash: `${file.name}:${file.size}:${file.lastModified}`,
          mediaId,
          mimeType: file.type || 'application/octet-stream',
        },
        model: activeModel.label,
        primaryLanguage,
        createdAt: now,
        updatedAt: now,
        asr: asrLayer,
        edit: deriveEditLayer(asrLayer),
      }
      await saveMediaAsset({
        id: mediaId,
        blob: file,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        createdAt: now,
      })
      await saveTranscript(record)
      jobAbort = null
      lastFile = null
      set({ job: null })
      await get().refreshHistory()
      // Nav-safe completion: if they're still on the workspace, open the result as before;
      // if they wandered off, don't yank the view — drop a banner they can click.
      if (get().view === 'workspace') {
        get().setRecord(record)
        set({ view: 'transcript' })
      } else {
        set({ jobNotice: { kind: 'done', label: file.name, recordId: record.id } })
      }
    } catch (e) {
      jobAbort = null
      if (isCancelled(e)) {
        set({ job: null })
      } else {
        set({
          job: null,
          jobNotice: {
            kind: 'error',
            label: file.name,
            message: e instanceof Error ? e.message : String(e),
            retry: 'file',
          },
        })
      }
    }
  },

  runRerunJob: async () => {
    const { record, activeModel, primaryLanguage, capability, job } = get()
    if (!record || !activeModel || activeModel.task !== 'transcription' || job) return
    const patch = (p: Partial<ActiveJob>) =>
      set((s) => (s.job ? { job: { ...s.job, ...p } } : {}))
    const originId = record.id
    const mediaId = record.source.mediaId
    if (!mediaId) {
      set({ jobNotice: { kind: 'error', label: record.source.filename, message: 'Attach the source media once before rerunning this transcript.' } })
      return
    }
    const asset = await getMediaAsset(mediaId).catch(() => undefined)
    if (!asset) {
      set({ jobNotice: { kind: 'error', label: record.source.filename, message: 'Stored media is missing. Attach the source media again to rerun.' } })
      return
    }
    jobAbort?.abort()
    const ac = new AbortController()
    jobAbort = ac
    const device = capability?.device ?? 'wasm'
    const file = new File([asset.blob], asset.filename, {
      type: asset.mimeType || record.source.mimeType || 'application/octet-stream',
    })
    set({
      jobNotice: null,
      job: { kind: 'rerun', phase: 'decoding', pct: 0, label: record.source.filename, device, partial: '', etaSec: null },
    })
    try {
      const { wave, durationSec } = await decodeToFloat32(
        file,
        (r) => patch({ pct: Math.round(r * 100) }),
        ac.signal,
      )
      patch({ phase: 'loading', pct: 0, etaSec: estimateEta(durationSec, capability?.benchmarkRtf ?? null) })
      const language = languageName(primaryLanguage, activeModel.englishOnly)
      const out = await transcribeWithEngine(activeModel, device, wave, {
        signal: ac.signal,
        language,
        englishOnly: activeModel.englishOnly,
        onLoadProgress: (s) => patch({ pct: Math.round(s.ratio * 100) }),
        onDeviceReady: (d) => patch({ device: d, phase: 'transcribing', pct: 0 }),
        onFallback: (d) => patch({ device: d, phase: 'loading', pct: 0, partial: '' }),
        onProgress: (s) => patch({ pct: Math.round(s.ratio * 100) }),
        onPartial: (t) => patch({ partial: t }),
      })
      const asrLayer = buildAsrLayer(out, language ?? 'auto')
      const now = Date.now()
      const next: TranscriptRecord = {
        id: uid('tr_'),
        source: {
          ...record.source,
          durationSec,
          mediaId,
          mimeType: asset.mimeType || record.source.mimeType,
        },
        model: activeModel.label,
        primaryLanguage,
        createdAt: now,
        updatedAt: now,
        asr: asrLayer,
        edit: deriveEditLayer(asrLayer),
      }
      await saveTranscript(next)
      jobAbort = null
      set({ job: null })
      await get().refreshHistory()
      // If they're still viewing the record they reran, swap it in place; else drop a banner.
      // (Never clobber a *different* transcript the user has since opened.)
      if (get().record?.id === originId) {
        get().setRecord(next)
        set({ mediaUrl: URL.createObjectURL(asset.blob) })
      } else {
        set({ jobNotice: { kind: 'done', label: record.source.filename, recordId: next.id } })
      }
    } catch (e) {
      jobAbort = null
      if (isCancelled(e)) {
        set({ job: null })
      } else {
        set({
          job: null,
          jobNotice: {
            kind: 'error',
            label: record.source.filename,
            message: e instanceof Error ? e.message : String(e),
            retry: 'rerun',
          },
        })
      }
    }
  },

  stopActiveJob: () => {
    jobAbort?.abort()
    set((s) => (s.job ? { job: { ...s.job, phase: 'cancelling' } } : {}))
  },
  retryJob: () => {
    const notice = get().jobNotice
    if (!notice || notice.kind !== 'error') return
    set({ jobNotice: null })
    if (notice.retry === 'file' && lastFile) void get().runFileJob(lastFile)
    else if (notice.retry === 'rerun') void get().runRerunJob()
  },
  dismissJobNotice: () => set({ jobNotice: null }),
  openTranscript: async (id) => {
    const s = get()
    const rec = s.history.find((r) => r.id === id) ?? (s.record?.id === id ? s.record : null)
    if (!rec) return
    set({ mediaUrl: null, jobNotice: null })
    s.setRecord(rec)
    set({ view: 'transcript' })
    if (rec.source.mediaId) {
      const asset = await getMediaAsset(rec.source.mediaId).catch(() => undefined)
      if (asset) set({ mediaUrl: URL.createObjectURL(asset.blob) })
    }
  },
}))
