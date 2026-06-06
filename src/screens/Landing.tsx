import { ArrowRight, History as HistoryIcon, Languages, Mic } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { NoModelState } from '@/components/NoModelState'

export function Landing() {
  const activeModel = useApp((s) => s.activeModel)
  const activeTranslationModel = useApp((s) => s.activeTranslationModel)
  const setView = useApp((s) => s.setView)
  const setModelSetupTask = useApp((s) => s.setModelSetupTask)

  if (!activeModel && !activeTranslationModel) {
    return (
      <NoModelState
        onSetup={() => {
          setModelSetupTask('transcription')
          setView('onboarding')
        }}
      />
    )
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">VOICE AI</h2>
        <p className="text-sm text-muted-foreground">
          Local-first transcription and phrase translation in this browser.
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="glow" onClick={() => setView('workspace')}>
            <Mic className="size-4" />
            Transcribe
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setView('translate')}>
            <Languages className="size-4" />
            Translate
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
