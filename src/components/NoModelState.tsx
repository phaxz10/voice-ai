import { ArrowRight, Download, FileAudio, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FeaturePoint, WorkspacePreview } from '@/components/WorkspacePreview'

export function NoModelState({
  onSetup,
}: {
  onSetup: () => void
}) {
  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">LocalTranscribeAI</h2>
        <p className="text-sm text-muted-foreground">
          Offline-first transcription for audio, video, and mic recordings.
        </p>
      </div>

      <div className="grid max-w-5xl overflow-hidden rounded-lg border bg-card md:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]">
        <div className="flex flex-col justify-between gap-8 p-5 md:p-6">
          <div className="space-y-5">
            <FeaturePoint
              icon={WifiOff}
              title="Offline first"
              body="After setup, the model is cached in this browser."
            />
            <FeaturePoint
              icon={Download}
              title="Load a model"
              body="Choose the model size and language before starting."
            />
            <FeaturePoint
              icon={FileAudio}
              title="Transcribe"
              body="Upload a file or record from the mic, then edit and export."
            />
          </div>

          <div className="border-t pt-5">
            <Button variant="glow" onClick={onSetup}>
              Load Transcription Model
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="border-t bg-background p-4 md:border-l md:border-t-0 md:p-6">
          <WorkspacePreview />
        </div>
      </div>
    </div>
  )
}
