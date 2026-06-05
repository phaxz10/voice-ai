import { useEffect, useRef, useState } from 'react'
import { Upload, FileAudio, Loader2, Clock, Cpu, Square } from 'lucide-react'
import { useApp } from '@/lib/store'
import { cn, formatTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'

export function FileTranscriber() {
  const activeModel = useApp((s) => s.activeModel)
  const job = useApp((s) => s.job)
  const runFileJob = useApp((s) => s.runFileJob)
  const stopActiveJob = useApp((s) => s.stopActiveJob)

  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const liveBoxRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // The job lives in the store, so it survives navigating away (the global TopBar indicator
  // covers it then). This component just renders the rich, on-screen progress for a file job.
  const fileJob = job && job.kind === 'file' ? job : null
  const partial = fileJob?.partial ?? ''

  // Tail the streaming preview: keep it pinned to the newest text, but stand down while the
  // user has scrolled up to re-read (re-arms when they return to the bottom).
  useEffect(() => {
    const el = liveBoxRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [partial])

  function handleFile(file: File) {
    if (!activeModel) return
    stickToBottom.current = true
    void runFileJob(file)
  }

  if (fileJob) {
    const statusText =
      fileJob.phase === 'decoding'
        ? 'Decoding audio with ffmpeg...'
        : fileJob.phase === 'loading'
          ? 'Loading model...'
          : fileJob.phase === 'cancelling'
            ? 'Stopping transcription...'
            : 'Transcribing in this browser...'
    return (
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                {statusText}
              </span>
              {fileJob.phase !== 'cancelling' && (
                <span className="tabular-nums text-muted-foreground">{fileJob.pct}%</span>
              )}
            </div>
            {fileJob.phase === 'cancelling' ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            ) : (
              <Progress value={fileJob.pct} />
            )}
            {fileJob.phase === 'transcribing' && fileJob.etaSec != null && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" /> ~{formatTime(fileJob.etaSec)} estimated
              </p>
            )}
            {(fileJob.phase === 'loading' || fileJob.phase === 'transcribing') && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cpu className="size-3" /> {fileJob.device === 'webgpu' ? 'WebGPU' : 'WASM'}.
                {fileJob.phase === 'loading'
                  ? ' First run downloads the model, then it is cached.'
                  : ' Runs in bounded chunks — you can leave this page, it keeps going.'}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={stopActiveJob}
            disabled={fileJob.phase === 'cancelling'}
            className="w-fit"
          >
            <Square className="size-3.5 fill-current" /> Stop
          </Button>
          {partial && (
            <div
              ref={liveBoxRef}
              onScroll={(e) => {
                const el = e.currentTarget
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
              }}
              className="max-h-48 overflow-y-auto rounded-lg border bg-background/50 p-3 text-sm leading-relaxed text-muted-foreground"
            >
              {partial}
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // A different job (a rerun) is running in the background — don't offer a dead dropzone.
  if (job) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          A transcription is already running. It finishes in the background — watch its progress
          up top, or wait here.
        </CardContent>
      </Card>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files?.[0]
        if (f) void handleFile(f)
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-14 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <Upload className="size-7" />
      </span>
      <div>
        <p className="font-medium">Drop an audio or video file</p>
        <p className="text-sm text-muted-foreground">
          MP3, WAV, M4A, MP4, MOV, or MKV. The file stays in this browser.
        </p>
      </div>
      <Button onClick={() => inputRef.current?.click()}>
        <FileAudio className="size-4" /> Choose file
      </Button>
      <p className="text-xs text-muted-foreground">
        Edit the transcript afterward. Corrections autosave locally.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
