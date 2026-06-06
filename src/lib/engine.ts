import { pipeline, env, WhisperTextStreamer } from '@huggingface/transformers'
import type { CatalogModel, EngineDevice, PrimaryLanguage } from './types'
import { evictModel } from './models'
import { CancelledError, isCancelled, throwIfCancelled } from './cancel'

export { isCancelled } from './cancel'

// Remote HF models only; Transformers.js caches weights in Cache Storage.
env.allowLocalModels = false

const LANG_NAMES: Record<string, string> = {
  en: 'english',
  zh: 'chinese',
  yue: 'cantonese',
  ja: 'japanese',
  tl: 'tagalog',
}

export function languageName(
  primary: PrimaryLanguage,
  englishOnly: boolean,
): string | undefined {
  // English-only models must NOT receive a language/task (Transformers.js throws).
  if (englishOnly) return undefined
  if (primary === 'auto') return undefined
  return LANG_NAMES[primary]
}

const WHISPER_SAMPLE_RATE = 16000
const MAX_DIRECT_TRANSCRIBE_SECONDS = 30
const MANUAL_CHUNK_SECONDS = 25

// Transformers.js ASR pipeline type is complex; alias loosely.
export type ASR = Awaited<ReturnType<typeof pipeline>> & {
  (audio: Float32Array, opts?: Record<string, unknown>): Promise<ASRResult>
  tokenizer: unknown
  dispose?: () => Promise<void>
}

export interface ASRChunk {
  text: string
  timestamp: [number, number | null]
}
export interface ASRResult {
  text: string
  chunks?: ASRChunk[]
}

export interface TranslationSingle {
  translation_text: string
  generated_text?: string
}
export type TranslationOutput = TranslationSingle[]
export type Translator = Awaited<ReturnType<typeof pipeline>> & {
  (text: string | string[], opts?: Record<string, unknown>): Promise<unknown>
  dispose?: () => Promise<void>
}
export type EnginePipeline = ASR | Translator

function dtypeFor(model: CatalogModel, device: EngineDevice): unknown {
  if (model.task === 'translation') {
    // NLLB's q8 export produces good text for both Mandarin and Cantonese. The q4f16 WebGPU
    // export can decode to an empty string without throwing, so keep Translation on q8 and let
    // the WebGPU loader fall back to WASM if that execution provider rejects the quantized graph.
    const dtype = 'q8'
    return { model: dtype, encoder_model: dtype, decoder_model_merged: dtype }
  }

  const large = model.family === 'large-v3-turbo'
  if (device === 'webgpu') {
    // large-v3-turbo: fp16 encoder + 4-bit decoder. (The onnx-community fp16 *merged decoder* trips
    // onnxruntime-web's graph validator — "outer scope value ... add an Identity node" — but q4,
    // quantized from fp32 rather than float16-converted, loads cleanly.) Small: uniform fp16 is fine
    // on the Xenova export.
    return large ? { encoder_model: 'fp16', decoder_model_merged: 'q4' } : 'fp16'
  }
  // WASM. Whisper is "extremely sensitive to quantization, especially of the encoder" (HF docs): an
  // int8 ENCODER is what makes small spiral into the "I'm I'm so so" repetition loop on hard audio.
  // Keep the encoder full precision and quantize only the decoder (q8 tolerates int8 fine). large is
  // WebGPU-only in practice; fp16 encoder here avoids dragging in its multi-GB fp32 weight.
  if (large) {
    return { encoder_model: 'fp16', decoder_model_merged: 'q8' }
  }
  return { encoder_model: 'fp32', decoder_model_merged: 'q8' }
}

interface Loaded {
  key: string
  engine: EnginePipeline
}
let current: Loaded | null = null
/** Monotonic load id; bumping it abandons any in-flight load (used for cancel + supersede). */
let loadToken = 0

export interface LoadStatus {
  /** Monotonic 0..1 overall ratio (byte-weighted across files). */
  ratio: number
  /** File currently downloading. */
  file: string
  loadedBytes: number
  totalBytes: number
  fileIndex: number
  fileCount: number
}
export type LoadProgress = (s: LoadStatus) => void

interface RawProgress {
  status?: string
  file?: string
  name?: string
  loaded?: number
  total?: number
  progress?: number
  files?: Record<string, { loaded: number; total: number }>
}

/**
 * Byte-weighted download progress.
 *
 * We deliberately IGNORE Transformers.js's synthetic `progress_total` event. That aggregate is
 * summed over every file the loader *touches* — including ones it only size-probes but never
 * downloads. A model that ships a self-contained fp16 weight beside an fp32 weight with external
 * data poisons it: whisper-large-v3-turbo loads `encoder_model_fp16.onnx` (~1.2 GB) but the repo
 * also has `encoder_model.onnx` + a 2.4 GB `encoder_model.onnx_data`, which the aggregate counts —
 * showing ~4 GB while the real download is ~1.5 GB. Instead we track only files that enter the
 * real download lifecycle (an `initiate` event from getModelFile) and sum their byte totals.
 */
function makeReporter(onProgress?: LoadProgress) {
  // Only files that fired `initiate` (a real fetch) are tracked — phantoms never do.
  const files = new Map<string, { loaded: number; total: number }>()
  let shown = 0
  let currentFile = 'model'

  function sums() {
    let loaded = 0
    let total = 0
    let done = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
      if (f.total > 0 && f.loaded >= f.total) done++
    }
    return { loaded, total, done }
  }

  function emit(file: string) {
    const { loaded, total, done } = sums()
    const fileCount = files.size
    const fileIndex = fileCount > 0 ? Math.min(done + 1, fileCount) : 0
    const ratio = total > 0 ? loaded / total : 0
    // Never report 100% until the engine says `ready`; a not-yet-sized file could still register.
    shown = Math.max(shown, Math.min(ratio, 0.994))
    onProgress?.({ ratio: shown, file, loadedBytes: loaded, totalBytes: total, fileIndex, fileCount })
  }

  return (info: RawProgress) => {
    if (!onProgress) return
    const status = info.status ?? ''

    if (status === 'ready') {
      const { loaded, total } = sums()
      onProgress({
        ratio: 1,
        file: currentFile,
        loadedBytes: loaded || total,
        totalBytes: total,
        fileIndex: files.size,
        fileCount: files.size,
      })
      return
    }

    // Phantom-inflated aggregate (see the function doc) — ignore it entirely.
    if (status === 'progress_total') return

    const file = info.file || info.name || 'model'

    if (status === 'initiate') {
      currentFile = file
      if (!files.has(file)) files.set(file, { loaded: 0, total: 0 })
      emit(file)
      return
    }

    // Count progress only for files that began a real download (fired `initiate`).
    if (!files.has(file)) return
    if (status !== 'progress' && status !== 'done' && status !== 'download') return

    currentFile = file
    const prev = files.get(file) ?? { loaded: 0, total: 0 }
    const total = info.total ?? prev.total
    const loaded =
      status === 'done' ? Math.max(prev.loaded, total) : Math.max(prev.loaded, info.loaded ?? 0)
    files.set(file, { loaded, total })
    emit(file)
  }
}

function buildPipeline(
  model: CatalogModel,
  device: EngineDevice,
  report: (info: RawProgress) => void,
): Promise<EnginePipeline> {
  const task = model.task === 'translation' ? 'translation' : 'automatic-speech-recognition'
  const make = (dev: EngineDevice) =>
    pipeline(task, model.hfId, {
      device: dev,
      dtype: dtypeFor(model, dev) as never,
      progress_callback: report as never,
    }) as unknown as Promise<EnginePipeline>
  return make(device).catch((e) => {
    if (device === 'webgpu') return make('wasm') // graceful fallback
    throw e
  })
}

export interface GetEngineOpts {
  signal?: AbortSignal
  onProgress?: LoadProgress
}

/**
 * Get (or load + warm) the pipeline for a model on a device. WebGPU→WASM fallback.
 * Cancellable via `opts.signal`: on abort the load is abandoned and any partial weights are
 * Evicted so a retry starts clean. The Cache API has no resume. Rejects
 * `CancelledError` on abort; on a genuine load failure the partial is Evicted and the error rethrown.
 */
export async function getEngine(
  model: CatalogModel,
  device: EngineDevice,
  opts: GetEngineOpts = {},
): Promise<EnginePipeline> {
  const key = `${model.task}|${model.hfId}|${device}`
  if (current?.key === key) return current.engine
  if (current) await disposeEngine()

  const token = ++loadToken
  const report = makeReporter(opts.onProgress)
  const build = buildPipeline(model, device, report)

  // Background settle: commit if still the active load; otherwise dispose + Evict (clean slate).
  const settle: Promise<EnginePipeline | null> = build.then(
    async (engine) => {
      if (token !== loadToken) {
        try {
          await engine.dispose?.()
        } catch {
          /* ignore */
        }
        await evictModel(model.hfId).catch(() => {})
        return null
      }
      current = { key, engine }
      return engine
    },
    async (e) => {
      if (token === loadToken) await evictModel(model.hfId).catch(() => {}) // purge partial
      throw e
    },
  )

  const { signal } = opts
  if (!signal) {
    const asr = await settle
    if (!asr) throw new CancelledError('Download cancelled')
    return asr
  }
  return await new Promise<EnginePipeline>((resolve, reject) => {
    const onAbort = () => {
      loadToken++ // abandon the in-flight load; settle() disposes + Evicts when it finishes
      reject(new CancelledError('Download cancelled'))
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    settle.then(
      (engine) => {
        signal.removeEventListener('abort', onAbort)
        if (engine) resolve(engine)
        else reject(new CancelledError('Download cancelled'))
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

export async function getAsrEngine(
  model: CatalogModel,
  device: EngineDevice,
  opts: GetEngineOpts = {},
): Promise<ASR> {
  if (model.task !== 'transcription') {
    throw new Error(`${model.label} is a Translation Model, not a Transcription Model.`)
  }
  return (await getEngine(model, device, opts)) as ASR
}

export async function getTranslationEngine(
  model: CatalogModel,
  device: EngineDevice,
  opts: GetEngineOpts = {},
): Promise<Translator> {
  if (model.task !== 'translation') {
    throw new Error(`${model.label} is a Transcription Model, not a Translation Model.`)
  }
  return (await getEngine(model, device, opts)) as Translator
}

function loadedKey(): string | null {
  return current?.key ?? null
}

/** Dispose the warm pipeline (e.g. after Evicting the Active Model). */
export async function disposeEngine(): Promise<void> {
  if (!current) return
  const c = current
  current = null
  try {
    await c.engine.dispose?.()
  } catch {
    /* ignore */
  }
}

export interface TranscribeOpts {
  language?: string
  task?: 'transcribe' | 'translate'
  /** English-only models reject language/task. */
  englishOnly?: boolean
  onPartial?: (text: string) => void
  onProgress?: (s: TranscribeProgress) => void
  signal?: AbortSignal
}

export interface TranscribeProgress {
  ratio: number
  chunkIndex: number
  chunkCount: number
  completedSeconds: number
  totalSeconds: number
}

export interface TranscribeWithEngineOpts extends TranscribeOpts {
  onLoadProgress?: LoadProgress
  onDeviceReady?: (device: EngineDevice) => void
  onFallback?: (device: EngineDevice) => void
}

interface PlannedChunk {
  index: number
  startSample: number
  endSample: number
  startSeconds: number
  endSeconds: number
}

function plannedChunks(wave: Float32Array): PlannedChunk[] {
  const samplesPerChunk = MANUAL_CHUNK_SECONDS * WHISPER_SAMPLE_RATE
  const chunks: PlannedChunk[] = []
  for (let startSample = 0; startSample < wave.length; startSample += samplesPerChunk) {
    const endSample = Math.min(startSample + samplesPerChunk, wave.length)
    chunks.push({
      index: chunks.length,
      startSample,
      endSample,
      startSeconds: startSample / WHISPER_SAMPLE_RATE,
      endSeconds: endSample / WHISPER_SAMPLE_RATE,
    })
  }
  return chunks
}

function attachAbortDisposal(engine: EnginePipeline, signal?: AbortSignal): () => void {
  if (!signal) return () => {}
  const onAbort = () => {
    if (current?.engine === engine) current = null
    void engine.dispose?.().catch(() => {})
  }
  if (signal.aborted) onAbort()
  signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}

function offsetResult(out: ASRResult, offsetSeconds: number): ASRResult {
  return {
    text: out.text ?? '',
    chunks: out.chunks?.map((chunk) => ({
      text: chunk.text,
      timestamp: [
        (chunk.timestamp?.[0] ?? 0) + offsetSeconds,
        chunk.timestamp?.[1] == null ? null : chunk.timestamp[1] + offsetSeconds,
      ],
    })),
  }
}

function mergeResults(results: ASRResult[]): ASRResult {
  return {
    text: results.map((r) => r.text?.trim()).filter(Boolean).join(' '),
    chunks: results.flatMap((r) => r.chunks ?? []),
  }
}

function normalizePartial(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Heuristic for Whisper's repetition-hallucination: a chunk dominated by a handful of repeated
 * tokens (e.g. "I'm, I'm, so, so, so..."). Over a reasonable span, real speech keeps introducing
 * new words; a degenerate loop has very few unique tokens. This stands in for Whisper's
 * compression-ratio gate, which transformers.js v4.2.0 does not implement.
 */
function looksDegenerate(text: string): boolean {
  const toks = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (toks.length < 16) return false
  return new Set(toks).size / toks.length < 0.35
}

function hasDetectableSignal(wave: Float32Array): boolean {
  let peak = 0
  for (let i = 0; i < wave.length; i += 16) {
    peak = Math.max(peak, Math.abs(wave[i]))
    if (peak >= 0.0008) return true
  }
  return false
}

function reportTranscribeProgress(
  opts: TranscribeOpts,
  chunk: PlannedChunk,
  chunkCount: number,
  totalSeconds: number,
): void {
  opts.onProgress?.({
    ratio: totalSeconds > 0 ? Math.min(chunk.endSeconds / totalSeconds, 1) : 1,
    chunkIndex: chunk.index + 1,
    chunkCount,
    completedSeconds: Math.min(chunk.endSeconds, totalSeconds),
    totalSeconds,
  })
}

async function transcribeOne(
  asr: ASR,
  wave: Float32Array,
  opts: TranscribeOpts,
  offsetSeconds: number,
  committedText: string,
): Promise<ASRResult> {
  throwIfCancelled(opts.signal, 'Transcription stopped')

  // Fresh streamer per attempt, so a failed-then-retried run doesn't double the live partial.
  const run = async (extra: Record<string, unknown>): Promise<ASRResult> => {
    let streamer: WhisperTextStreamer | undefined
    if (opts.onPartial) {
      let acc = ''
      streamer = new WhisperTextStreamer(asr.tokenizer as never, {
        callback_function: (t: string) => {
          acc += t
          opts.onPartial!(normalizePartial(`${committedText} ${acc}`))
        },
      })
    }
    const params: Record<string, unknown> = {
      force_full_sequences: false,
      max_new_tokens: 160,
      // Hard loop-breaker: forbid any 3-gram from repeating, which is what kills Whisper's
      // "I'm I'm so so so" repetition-hallucination. This is the decode safety-net the installed
      // transformers.js (v4.2.0) actually supports — the Python thresholds (compression_ratio /
      // logprob / no_speech) are NOT implemented in this build, so passing them would be ignored.
      no_repeat_ngram_size: 3,
      ...(streamer ? { streamer } : {}),
      ...extra,
    }
    const out = (await asr(wave, params)) as ASRResult
    throwIfCancelled(opts.signal, 'Transcription stopped')
    return offsetResult(out, offsetSeconds)
  }

  // English-only models reject language/task; 'auto' passes language: undefined.
  const multilingual: Record<string, unknown> = opts.englishOnly
    ? {}
    : { language: opts.language, task: opts.task ?? 'transcribe' }

  let extra: Record<string, unknown> = { ...multilingual, return_timestamps: 'word' }
  let escalated = false
  for (;;) {
    try {
      const out = await run(extra)
      // Manual temperature fallback: transformers.js has no built-in compression-ratio retry, so if
      // greedy decoding still collapsed into a degenerate repetition loop, re-decode this chunk ONCE
      // with light sampling (and a tighter n-gram block) to jolt it out — Whisper's temperature
      // fallback, by hand. The fresh-streamer-per-attempt design means the retry re-streams cleanly.
      if (!escalated && looksDegenerate(out.text)) {
        escalated = true
        extra = { ...extra, do_sample: true, temperature: 0.4, no_repeat_ngram_size: 2 }
        continue
      }
      return out
    } catch (e) {
      if (opts.signal?.aborted) throw new CancelledError('Transcription stopped')
      const msg = String((e as Error)?.message ?? e)
      // (1) Model rejects language+task -> drop them and retry (English-only .en builds).
      if (msg.includes('English-only') && ('language' in extra || 'task' in extra)) {
        const next = { ...extra }
        delete next.language
        delete next.task
        extra = next
        continue
      }
      // (2) Defensive: a decoder exported without cross-attentions can't do word timestamps ->
      // degrade to chunk-level timing (buildAsrLayer re-segments either granularity) instead of
      // failing. The catalog turbo uses the *_timestamped export so it never lands here.
      if (/cross attentions|output_attentions/i.test(msg) && extra.return_timestamps === 'word') {
        extra = { ...extra, return_timestamps: true }
        continue
      }
      throw e
    }
  }
}

export async function transcribe(
  asr: ASR,
  wave: Float32Array,
  opts: TranscribeOpts = {},
): Promise<ASRResult> {
  throwIfCancelled(opts.signal, 'Transcription stopped')
  const detachAbort = attachAbortDisposal(asr, opts.signal)
  const totalSeconds = wave.length / WHISPER_SAMPLE_RATE
  try {
    if (totalSeconds <= MAX_DIRECT_TRANSCRIBE_SECONDS) {
      const only = await transcribeOne(asr, wave, opts, 0, '')
      opts.onProgress?.({
        ratio: 1,
        chunkIndex: 1,
        chunkCount: 1,
        completedSeconds: totalSeconds,
        totalSeconds,
      })
      return only
    }

    const results: ASRResult[] = []
    const chunks = plannedChunks(wave)
    for (const chunk of chunks) {
      throwIfCancelled(opts.signal, 'Transcription stopped')
      const slice = wave.subarray(chunk.startSample, chunk.endSample)
      if (hasDetectableSignal(slice)) {
        const out = await transcribeOne(
          asr,
          new Float32Array(slice),
          opts,
          chunk.startSeconds,
          results.map((r) => r.text?.trim()).filter(Boolean).join(' '),
        )
        results.push(out)
      }
      reportTranscribeProgress(opts, chunk, chunks.length, totalSeconds)
    }
    return mergeResults(results)
  } finally {
    detachAbort()
  }
}

function isWebGpuRuntimeError(e: unknown): boolean {
  const message = String((e as Error)?.message ?? e)
  return /WebGPU|GPUBuffer|OrtRun|MapAsyncStatus|external Instance|Failed to download data from buffer/i.test(
    message,
  )
}

export async function transcribeWithEngine(
  model: CatalogModel,
  preferredDevice: EngineDevice,
  wave: Float32Array,
  opts: TranscribeWithEngineOpts = {},
): Promise<ASRResult> {
  const loadOpts = { signal: opts.signal, onProgress: opts.onLoadProgress }
  const asr = await getAsrEngine(model, preferredDevice, loadOpts)
  opts.onDeviceReady?.(preferredDevice)
  try {
    return await transcribe(asr, wave, opts)
  } catch (e) {
    if (isCancelled(e)) throw e
    if (
      preferredDevice === 'webgpu' &&
      !model.requiresWebGPU &&
      isWebGpuRuntimeError(e) &&
      !opts.signal?.aborted
    ) {
      await disposeEngine()
      opts.onFallback?.('wasm')
      const fallback = await getAsrEngine(model, 'wasm', loadOpts)
      opts.onDeviceReady?.('wasm')
      return await transcribe(fallback, wave, opts)
    }
    throw e
  }
}

export interface TranslateWithEngineOpts {
  signal?: AbortSignal
  onLoadProgress?: LoadProgress
  onDeviceReady?: (device: EngineDevice) => void
  onFallback?: (device: EngineDevice) => void
}

export async function translateWithEngine(
  model: CatalogModel,
  preferredDevice: EngineDevice,
  text: string,
  pair: { srcLang: string; tgtLang: string },
  opts: TranslateWithEngineOpts = {},
): Promise<string> {
  const loadOpts = { signal: opts.signal, onProgress: opts.onLoadProgress }
  const translator = await getTranslationEngine(model, preferredDevice, loadOpts)
  opts.onDeviceReady?.(preferredDevice)
  const run = async (engine: Translator) => {
    throwIfCancelled(opts.signal, 'Translation stopped')
    const detachAbort = attachAbortDisposal(engine, opts.signal)
    try {
      const out = await engine(text, {
        src_lang: pair.srcLang,
        tgt_lang: pair.tgtLang,
        max_new_tokens: 160,
      })
      throwIfCancelled(opts.signal, 'Translation stopped')
      return extractTranslationText(out)
    } finally {
      detachAbort()
    }
  }

  try {
    const translated = await run(translator)
    if (translated) return translated
    if (preferredDevice === 'webgpu' && !opts.signal?.aborted) {
      await disposeEngine()
      opts.onFallback?.('wasm')
      const fallback = await getTranslationEngine(model, 'wasm', loadOpts)
      opts.onDeviceReady?.('wasm')
      const retried = await run(fallback)
      if (retried) return retried
    }
    throw new Error('The model returned an empty translation.')
  } catch (e) {
    if (isCancelled(e)) throw e
    if (
      preferredDevice === 'webgpu' &&
      !model.requiresWebGPU &&
      isWebGpuRuntimeError(e) &&
      !opts.signal?.aborted
    ) {
      await disposeEngine()
      opts.onFallback?.('wasm')
      const fallback = await getTranslationEngine(model, 'wasm', loadOpts)
      opts.onDeviceReady?.('wasm')
      return await run(fallback)
    }
    throw e
  }
}

function extractTranslationText(out: unknown): string {
  const queue: unknown[] = Array.isArray(out) ? [...out] : [out]
  while (queue.length > 0) {
    const item = queue.shift()
    if (typeof item === 'string' && item.trim()) return item.trim()
    if (Array.isArray(item)) {
      queue.push(...item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    for (const key of ['translation_text', 'generated_text', 'text']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (Array.isArray(value)) queue.push(value)
    }
  }
  return ''
}

/** Quick ×realtime benchmark using the already-loaded pipeline. */
export async function benchmark(asr: ASR): Promise<number> {
  const secs = 4,
    sr = 16000
  const wave = new Float32Array(secs * sr)
  for (let i = 0; i < wave.length; i++) wave[i] = 0.04 * Math.sin(i * 0.06)
  const t0 = performance.now()
  await asr(wave, { language: 'english', chunk_length_s: 30 })
  const el = (performance.now() - t0) / 1000
  return el > 0 ? secs / el : 0
}
