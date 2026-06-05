import { createPortal } from 'react-dom'
import { Loader2, Square, X, CircleCheck, TriangleAlert } from 'lucide-react'
import { useApp } from '@/lib/store'
import type { JobPhase } from '@/lib/store'
import { Button } from '@/components/ui/button'

const PHASE_TEXT: Record<JobPhase, string> = {
  decoding: 'Decoding',
  loading: 'Loading model',
  transcribing: 'Transcribing',
  cancelling: 'Stopping',
}

/**
 * Global, always-mounted job surface (lives in the TopBar). Because the job is owned by the store,
 * this keeps showing progress + a Stop control after the user navigates away from the screen that
 * started it, and a completion/failure banner replaces the old forced jump to the transcript view.
 */
export function JobIndicator() {
  const job = useApp((s) => s.job)
  const notice = useApp((s) => s.jobNotice)
  const stopActiveJob = useApp((s) => s.stopActiveJob)
  const dismissJobNotice = useApp((s) => s.dismissJobNotice)
  const retryJob = useApp((s) => s.retryJob)
  const openTranscript = useApp((s) => s.openTranscript)

  return (
    <>
      {job && (
        <div
          className="flex items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs"
          title={`${job.label} — ${PHASE_TEXT[job.phase]}`}
        >
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span className="hidden text-muted-foreground sm:inline">{PHASE_TEXT[job.phase]}</span>
          {job.phase !== 'cancelling' && (
            <span className="tabular-nums font-medium">{job.pct}%</span>
          )}
          <button
            onClick={stopActiveJob}
            disabled={job.phase === 'cancelling'}
            title="Stop transcription"
            className="grid size-5 place-items-center rounded-full text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Square className="size-3 fill-current" />
          </button>
        </div>
      )}

      {notice &&
        // Portal to <body>: the TopBar's backdrop-filter would otherwise act as the containing
        // block for this fixed element and pin it to the header instead of the viewport.
        createPortal(
          <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          {notice.kind === 'done' ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          ) : (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {notice.kind === 'done' ? 'Transcript ready' : 'Transcription failed'}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={notice.kind === 'error' ? notice.message : notice.label}
            >
              {notice.kind === 'done' ? notice.label : notice.message}
            </p>
            <div className="mt-2 flex gap-2">
              {notice.kind === 'done' && notice.recordId && (
                <Button size="sm" variant="glow" onClick={() => void openTranscript(notice.recordId!)}>
                  Open
                </Button>
              )}
              {notice.kind === 'error' && notice.retry && (
                <Button size="sm" variant="outline" onClick={retryJob}>
                  Retry
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={dismissJobNotice}>
                Dismiss
              </Button>
            </div>
          </div>
          <button
            onClick={dismissJobNotice}
            title="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          </div>,
          document.body,
        )}
    </>
  )
}
