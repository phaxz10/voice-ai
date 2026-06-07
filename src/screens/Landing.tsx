import {
  ArrowRight,
  FileAudio,
  History as HistoryIcon,
  Mic,
  WifiOff,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { NoModelState } from '@/components/NoModelState'
import { FeaturePoint, WorkspacePreview } from '@/components/WorkspacePreview'
import { SupportCard } from '@/components/Support'

export function Landing() {
  const activeModel = useApp((s) => s.activeModel)
  const setView = useApp((s) => s.setView)

  if (!activeModel) {
    return <NoModelState onSetup={() => setView('onboarding')} />
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">LocalTranscribeAI</h2>
        <p className="text-sm text-muted-foreground">
          Local-first transcription in this browser. Current model:{' '}
          <span className="text-foreground">{activeModel.label}</span>.
        </p>
      </div>

      <div className="grid max-w-5xl overflow-hidden rounded-lg border bg-card md:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]">
        <div className="flex flex-col justify-between gap-8 p-5 md:p-6">
          <div className="space-y-5">
            <FeaturePoint
              icon={WifiOff}
              title="Stays on your device"
              body="Audio never leaves this browser — the model runs locally."
            />
            <FeaturePoint
              icon={FileAudio}
              title="Files or live mic"
              body="Drop in audio and video, or record straight from the mic."
            />
            <FeaturePoint
              icon={HistoryIcon}
              title="Edit, replay, export"
              body="Refine the transcript, then export it in a click."
            />
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row">
            <Button variant="glow" onClick={() => setView('workspace')}>
              <Mic className="size-4" />
              Transcribe
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setView('history')}>
              <HistoryIcon className="size-4" />
              History
            </Button>
          </div>
        </div>

        <div className="border-t bg-background p-4 md:border-l md:border-t-0 md:p-6">
          <WorkspacePreview />
        </div>
      </div>

      <div className="max-w-5xl">
        <SupportCard />
      </div>
    </div>
  )
}
