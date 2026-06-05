import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Search,
  Scissors,
  Combine,
  Trash2,
  Plus,
  Paperclip,
  Pencil,
  Undo2,
  Redo2,
  Eye,
  RotateCcw,
  Square,
  X,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { getMediaAsset, saveMediaAsset, saveTranscript } from '@/lib/db'
import {
  editWordText,
  deleteWord,
  insertWordAfter,
  splitSegment,
  mergeSegmentWithNext,
  findReplaceAll,
} from '@/lib/edit-ops'
import { exportTranscript, downloadText } from '@/lib/exporters'
import type { AsrSegment, EditSegment, ExportFormat, ExportLayer } from '@/lib/types'
import {
  usePlayhead,
  useActiveWord,
  buildFlatWords,
  findActiveWord,
  type FlatWord,
} from '@/lib/playback'
import { cn, formatTime, uid } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const FORMATS: ExportFormat[] = ['txt', 'srt', 'vtt', 'json', 'md']


interface Controller {
  seek: (t: number) => void
  toggle: () => void
}

function WordInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(v)
        else if (e.key === 'Escape') onCancel()
      }}
      style={{ width: `${Math.max(2, v.length)}ch` }}
      className="rounded bg-primary/10 px-0.5 text-foreground outline-none ring-1 ring-primary"
    />
  )
}

/* ── Player: the ONLY subscriber to the 60fps playhead, so the word list never re-renders on a tick ── */
const Player = memo(function Player({
  controller,
  fallbackDuration,
}: {
  controller: Controller
  fallbackDuration: number
}) {
  const currentTime = usePlayhead((s) => s.currentTime)
  const duration = usePlayhead((s) => s.duration)
  const playing = usePlayhead((s) => s.playing)
  const total = duration || fallbackDuration

  return (
    <>
      <Button variant="glow" size="icon" onClick={controller.toggle}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={total || 0}
        step={0.1}
        value={currentTime}
        onChange={(e) => controller.seek(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(total)}
      </span>
    </>
  )
})

/* ── SegmentRow: subscribes only to the active-word store; memoized with a segment-scoped comparator ── */
interface SegmentRowProps {
  seg: EditSegment
  selectedWordId: string | null
  editingId: string | null
  confidence: Map<string, number>
  controller: Controller
  onSelectWord: (segId: string, wordId: string) => void
  onStartEdit: (wordId: string) => void
  onCommitEdit: (segId: string, wordId: string, text: string) => void
  onCancelEdit: () => void
}

function segHasWord(seg: EditSegment, id: string | null): boolean {
  return id != null && seg.words.some((w) => w.id === id)
}

function rowPropsEqual(prev: SegmentRowProps, next: SegmentRowProps): boolean {
  if (
    prev.seg !== next.seg ||
    prev.controller !== next.controller ||
    prev.confidence !== next.confidence ||
    prev.onSelectWord !== next.onSelectWord ||
    prev.onStartEdit !== next.onStartEdit ||
    prev.onCommitEdit !== next.onCommitEdit ||
    prev.onCancelEdit !== next.onCancelEdit
  ) {
    return false
  }
  // Re-render for selection/editing only when the change touches THIS segment.
  const selTouches =
    prev.selectedWordId !== next.selectedWordId &&
    (segHasWord(next.seg, prev.selectedWordId) || segHasWord(next.seg, next.selectedWordId))
  const editTouches =
    prev.editingId !== next.editingId &&
    (segHasWord(next.seg, prev.editingId) || segHasWord(next.seg, next.editingId))
  return !selTouches && !editTouches
}

const SegmentRow = memo(function SegmentRow({
  seg,
  selectedWordId,
  editingId,
  confidence,
  controller,
  onSelectWord,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: SegmentRowProps) {
  const activeWordId = useActiveWord((s) => (s.segId === seg.id ? s.wordId : null))
  const segStart = seg.words[0]?.start ?? 0
  return (
    <div className="group flex gap-3">
      <button
        onClick={() => controller.seek(segStart)}
        className="mt-1 h-fit shrink-0 font-mono text-xs text-muted-foreground opacity-60 transition-opacity hover:text-primary group-hover:opacity-100"
      >
        {formatTime(segStart)}
      </button>
      <p className="flex-1">
        {seg.words.map((w) => {
          const conf = w.origin?.[0] ? confidence.get(w.origin[0]) : undefined
          const low = w.timing === 'exact' && conf != null && conf < 0.6
          if (editingId === w.id) {
            return (
              <WordInput
                key={w.id}
                initial={w.text}
                onCommit={(v) => onCommitEdit(seg.id, w.id, v)}
                onCancel={onCancelEdit}
              />
            )
          }
          return (
            <span
              key={w.id}
              onClick={() => {
                onSelectWord(seg.id, w.id)
                controller.seek(w.start)
              }}
              onDoubleClick={() => onStartEdit(w.id)}
              className={cn(
                'cursor-pointer rounded px-0.5 transition-colors hover:bg-secondary',
                activeWordId === w.id && 'word-active',
                selectedWordId === w.id && 'ring-1 ring-primary',
                low && 'word-low-confidence',
                w.origin === null && 'italic text-accent',
              )}
            >
              {w.text}{' '}
            </span>
          )
        })}
      </p>
    </div>
  )
}, rowPropsEqual)

/* ── RawBody: read-only original ASR transcript (the "Original" view) ── */
const RawBody = memo(function RawBody({
  segments,
  controller,
}: {
  segments: AsrSegment[]
  controller: Controller
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6 text-[15px] leading-8">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5" /> Original transcript from the model — read-only. Switch to
          Corrected to edit.
        </p>
        {segments.map((seg) => (
          <div key={seg.id} className="flex gap-3">
            <button
              onClick={() => controller.seek(seg.start)}
              className="mt-1 h-fit shrink-0 font-mono text-xs text-muted-foreground opacity-60 transition-opacity hover:text-primary"
            >
              {formatTime(seg.start)}
            </button>
            <p className="flex-1">
              {seg.words.map((w) => (
                <span
                  key={w.id}
                  onClick={() => controller.seek(w.start)}
                  className="cursor-pointer rounded px-0.5 transition-colors hover:bg-secondary"
                >
                  {w.text}{' '}
                </span>
              ))}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
})

export function TranscriptView() {
  const record = useApp((s) => s.record)
  const mediaUrl = useApp((s) => s.mediaUrl)
  const setMediaUrl = useApp((s) => s.setMediaUrl)
  const setRecord = useApp((s) => s.setRecord)
  const setView = useApp((s) => s.setView)
  const activeModel = useApp((s) => s.activeModel)
  const job = useApp((s) => s.job)
  const runRerunJob = useApp((s) => s.runRerunJob)
  const stopActiveJob = useApp((s) => s.stopActiveJob)
  const commitEdit = useApp((s) => s.commitEdit)
  const undo = useApp((s) => s.undo)
  const redo = useApp((s) => s.redo)
  const refreshHistory = useApp((s) => s.refreshHistory)
  const canUndo = useApp((s) => s.past.length > 0)
  const canRedo = useApp((s) => s.future.length > 0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<{ segId: string; wordId: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showFind, setShowFind] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [replaceCount, setReplaceCount] = useState<number | null>(null)
  const [layer, setLayer] = useState<ExportLayer>('corrected')

  // Latest record without re-binding callbacks (keeps SegmentRow memo stable while typing).
  const recordRef = useRef(record)
  recordRef.current = record

  const confidence = useMemo(() => {
    const m = new Map<string, number>()
    record?.asr.segments.forEach((s) => s.words.forEach((w) => m.set(w.id, w.confidence)))
    return m
  }, [record])

  const flat = useMemo<FlatWord[]>(
    () => (record ? buildFlatWords(record.edit.segments) : []),
    [record],
  )

  const controller = useMemo<Controller>(
    () => ({
      seek(t) {
        const a = audioRef.current
        if (!a) return
        a.currentTime = t
        usePlayhead.getState().set({ currentTime: t })
        const w = findActiveWord(flat, t)
        useActiveWord.getState().set(w?.segId ?? null, w?.wordId ?? null)
      },
      toggle() {
        const a = audioRef.current
        if (!a) return
        if (a.paused) void a.play()
        else a.pause()
      },
    }),
    [flat],
  )

  // Single rAF-throttled audio listener feeds both stores; the word list isn't a subscriber to time.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    let raf = 0
    const onTime = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const t = a.currentTime
        usePlayhead.getState().set({ currentTime: t })
        const w = findActiveWord(flat, t)
        useActiveWord.getState().set(w?.segId ?? null, w?.wordId ?? null)
      })
    }
    const onMeta = () => usePlayhead.getState().set({ duration: a.duration || 0 })
    const onPlay = () => usePlayhead.getState().set({ playing: true })
    const onPause = () => usePlayhead.getState().set({ playing: false })
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    return () => {
      cancelAnimationFrame(raf)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
    }
  }, [flat, mediaUrl])

  // Reset playback stores when the open transcript changes (and on unmount).
  useEffect(() => {
    usePlayhead.getState().reset()
    useActiveWord.getState().set(null, null)
    return () => {
      usePlayhead.getState().reset()
      useActiveWord.getState().set(null, null)
    }
  }, [record?.id])

  // All edit ops route through the store's time machine (push undo, clear redo, autosave).
  const apply = commitEdit

  const doUndo = useCallback(() => {
    setSelected(null)
    setEditingId(null)
    undo()
  }, [undo])
  const doRedo = useCallback(() => {
    setSelected(null)
    setEditingId(null)
    redo()
  }, [redo])

  // Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redo — only on the editable corrected layer,
  // and never while typing in a field so native text-undo keeps working there.
  useEffect(() => {
    if (layer !== 'corrected') return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        doUndo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        doRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layer, doUndo, doRedo])

  // Switching to the read-only Original view clears edit-only UI state.
  useEffect(() => {
    if (layer === 'raw') {
      setSelected(null)
      setEditingId(null)
      setShowFind(false)
    }
  }, [layer])

  useEffect(() => {
    if (!record?.source.mediaId || mediaUrl) return
    let cancelled = false
    void getMediaAsset(record.source.mediaId)
      .then((asset) => {
        if (!cancelled && asset) setMediaUrl(URL.createObjectURL(asset.blob))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mediaUrl, record?.source.mediaId, setMediaUrl])

  const onSelectWord = useCallback(
    (segId: string, wordId: string) => setSelected({ segId, wordId }),
    [],
  )
  const onStartEdit = useCallback((wordId: string) => setEditingId(wordId), [])
  const onCancelEdit = useCallback(() => setEditingId(null), [])
  const onCommitEdit = useCallback(
    (segId: string, wordId: string, text: string) => {
      const r = recordRef.current
      const seg = r?.edit.segments.find((s) => s.id === segId)
      const w = seg?.words.find((x) => x.id === wordId)
      if (r && w && text.trim() && text.trim() !== w.text) {
        apply(editWordText(r.edit, segId, wordId, text.trim()))
      }
      setEditingId(null)
    },
    [apply],
  )

  async function attachMediaFile(file: File) {
    if (!record) return
    const mediaId = record.source.mediaId ?? uid('media_')
    const updated = {
      ...record,
      source: {
        ...record.source,
        mediaId,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      },
      updatedAt: Date.now(),
    }
    await saveMediaAsset({
      id: mediaId,
      blob: file,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      createdAt: Date.now(),
    })
    await saveTranscript(updated)
    setRecord(updated)
    await refreshHistory()
    setMediaUrl(URL.createObjectURL(file))
  }

  if (!record) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No transcript open.
        <div className="mt-4">
          <Button onClick={() => setView('workspace')}>Back to workspace</Button>
        </div>
      </div>
    )
  }

  function runReplace() {
    const { edit, count } = findReplaceAll(record!.edit, findText, replaceText)
    setReplaceCount(count)
    if (count > 0) apply(edit)
  }

  function doExport(fmt: ExportFormat) {
    const { text, mime, ext } = exportTranscript(record!, fmt, layer)
    const base = record!.source.filename.replace(/\.[^.]+$/, '') || 'transcript'
    downloadText(`${base}.${ext}`, text, mime)
  }

  // The rerun job (if any) lives in the store now, so it survives leaving this view.
  const rerunJob = job && job.kind === 'rerun' ? job : null
  const rerunLabel =
    rerunJob?.phase === 'decoding'
      ? 'Decoding source media...'
      : rerunJob?.phase === 'loading'
        ? 'Loading model...'
        : rerunJob?.phase === 'cancelling'
          ? 'Stopping rerun...'
          : 'Rerunning transcript...'

  return (
    <div className="space-y-5 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <button
            onClick={() => setView('workspace')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> workspace
          </button>
          <h2 className="max-w-xl truncate text-xl font-semibold tracking-tight">
            {record.source.filename}
          </h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{record.model}</span>
            <span>{record.asr.language}</span>
            <span>{formatTime(record.source.durationSec)}</span>
          </div>
        </div>

        {/* Export controls */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Label htmlFor="layer" className="text-muted-foreground">
              {layer === 'corrected' ? 'Corrected · editable' : 'Original · read-only'}
            </Label>
            <Switch
              id="layer"
              checked={layer === 'corrected'}
              onCheckedChange={(c) => setLayer(c ? 'corrected' : 'raw')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!!job || !activeModel}
              onClick={() => void runRerunJob()}
              title={
                job
                  ? 'A transcription is already running'
                  : activeModel
                    ? `Create a new transcript with ${activeModel.label}`
                    : 'Choose a model before rerunning'
              }
            >
              <RotateCcw className="size-4" /> Rerun
            </Button>
            <Download className="mr-1 size-4 text-muted-foreground" />
            {FORMATS.map((f) => (
              <Button key={f} variant="outline" size="sm" onClick={() => doExport(f)}>
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Player */}
      <Card>
        <CardContent className="flex items-center gap-3 p-3">
          {mediaUrl ? (
            <>
              <audio ref={audioRef} src={mediaUrl} preload="metadata" className="hidden" />
              <Player controller={controller} fallbackDuration={record.source.durationSec} />
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>Attach the original file to enable playback and click to seek.</span>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="size-4" /> Attach audio
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void attachMediaFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          {layer === 'corrected' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canUndo}
                onClick={doUndo}
                title="Undo (Cmd/Ctrl+Z)"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canRedo}
                onClick={doRedo}
                title="Redo (Shift+Cmd/Ctrl+Z)"
              >
                <Redo2 className="size-4" />
              </Button>
              <Button
                variant={showFind ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setShowFind((v) => !v)}
                title="Find & replace"
              >
                <Search className="size-4" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {rerunJob && (
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <RotateCcw className="size-4 animate-spin text-primary" />
                {rerunLabel}
              </span>
              {rerunJob.phase !== 'cancelling' && (
                <span className="tabular-nums text-muted-foreground">{rerunJob.pct}%</span>
              )}
            </div>
            {rerunJob.phase === 'cancelling' ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            ) : (
              <Progress value={rerunJob.pct} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={stopActiveJob}
              disabled={rerunJob.phase === 'cancelling'}
              className="w-fit"
            >
              <Square className="size-3.5 fill-current" /> Stop
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Find & replace */}
      {showFind && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <input
              value={findText}
              onChange={(e) => {
                setFindText(e.target.value)
                setReplaceCount(null)
              }}
              placeholder="Find..."
              className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <Button size="sm" onClick={runReplace} disabled={!findText}>
              Replace all
            </Button>
            {replaceCount != null && (
              <span className="text-xs text-muted-foreground">{replaceCount} replaced</span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected-word toolbar */}
      {selected && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2 text-sm shadow-lg">
          <span className="px-1 text-xs text-muted-foreground">Edit word:</span>
          <Button size="sm" variant="outline" onClick={() => setEditingId(selected.wordId)}>
            <Pencil /> Rename
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const t = window.prompt('Insert word after:')
              if (t && t.trim())
                apply(insertWordAfter(record.edit, selected.segId, selected.wordId, t.trim()))
            }}
          >
            <Plus className="size-3.5" /> Insert after
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply(splitSegment(record.edit, selected.segId, selected.wordId))}
          >
            <Scissors className="size-3.5" /> Split here
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply(mergeSegmentWithNext(record.edit, selected.segId))}
          >
            <Combine className="size-3.5" /> Merge next
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => {
              apply(deleteWord(record.edit, selected.segId, selected.wordId))
              setSelected(null)
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setSelected(null)}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Transcript body */}
      {layer === 'corrected' ? (
        <Card>
          <CardContent className="space-y-4 p-6 text-[15px] leading-8">
            {record.edit.segments.map((seg) => (
              <SegmentRow
                key={seg.id}
                seg={seg}
                selectedWordId={selected?.wordId ?? null}
                editingId={editingId}
                confidence={confidence}
                controller={controller}
                onSelectWord={onSelectWord}
                onStartEdit={onStartEdit}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <RawBody segments={record.asr.segments} controller={controller} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        {layer === 'corrected'
          ? 'Click a word to seek · double-click to edit · ⌘Z / ⇧⌘Z undo · autosaved locally'
          : 'Viewing the original machine transcript · click a word to seek'}
      </p>
    </div>
  )
}
