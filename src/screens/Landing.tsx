import { ArrowRight, History as HistoryIcon } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { NoModelState } from '@/components/NoModelState'

export function Landing() {
  const activeModel = useApp((s) => s.activeModel)
  const setView = useApp((s) => s.setView)

  if (!activeModel) {
    return <NoModelState onSetup={() => setView('onboarding')} />
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Local Transcribe</h2>
        <p className="text-sm text-muted-foreground">
          Current model: <span className="text-foreground">{activeModel.label}</span>.
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="glow" onClick={() => setView('workspace')}>
            Open workspace
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setView('history')}>
            <HistoryIcon className="size-4" />
            History
          </Button>
        </div>
      </div>
    </div>
  )
}
