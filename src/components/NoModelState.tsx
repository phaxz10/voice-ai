import { ArrowRight, Download, FileAudio, Mic2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

function Point({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof WifiOff
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export function NoModelState({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Local Transcribe</h2>
        <p className="text-sm text-muted-foreground">
          Offline-first transcription for audio, video, and mic recordings.
        </p>
      </div>

      <div className="grid max-w-5xl overflow-hidden rounded-lg border bg-card md:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]">
        <div className="flex flex-col justify-between gap-8 p-5 md:p-6">
          <div className="space-y-5">
            <Point
              icon={WifiOff}
              title="Offline first"
              body="After setup, the model is cached in this browser."
            />
            <Point
              icon={Download}
              title="Load a model"
              body="Choose the model size and language before starting."
            />
            <Point
              icon={FileAudio}
              title="Transcribe"
              body="Upload a file or record from the mic, then edit and export."
            />
          </div>

          <div className="border-t pt-5">
            <Button variant="glow" onClick={onSetup}>
              Load model
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="border-t bg-background p-4 md:border-l md:border-t-0 md:p-6">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-secondary text-secondary-foreground">
                  <Mic2 className="size-4" />
                </span>
                <span className="truncate font-medium">Transcript workspace</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">00:00</span>
            </div>

            <div className="space-y-5 p-4">
              <div className="flex h-20 items-center gap-1 rounded-md border bg-background px-4">
                {[18, 30, 42, 26, 54, 68, 34, 46, 22, 58, 72, 38, 30, 48, 64, 28, 20].map(
                  (h, i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-full bg-primary/70"
                      style={{ height: `${h}%` }}
                    />
                  ),
                )}
              </div>

              <div className="space-y-3">
                <div className="h-3 w-11/12 rounded-full bg-secondary" />
                <div className="h-3 w-4/5 rounded-full bg-secondary" />
                <div className="h-3 w-9/12 rounded-full bg-secondary" />
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <span className="h-8 w-20 rounded-md border bg-background" />
                <span className="h-8 w-16 rounded-md border bg-background" />
                <span className="h-8 w-24 rounded-md border bg-background" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
