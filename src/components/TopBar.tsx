import {
  Mic,
  History as HistoryIcon,
  Cpu,
  CircleDot,
  ChevronsUpDown,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { JobIndicator } from '@/components/JobIndicator'
import { cn } from '@/lib/utils'

export function TopBar() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const activeModel = useApp((s) => s.activeModel)
  const capability = useApp((s) => s.capability)
  const isolated = capability?.crossOriginIsolated

  return (
    <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
        <button
          onClick={() => setView(activeModel ? 'workspace' : 'landing')}
          className="flex items-center gap-2"
        >
          <span className="grid size-7 place-items-center rounded-md bg-foreground text-background dark:bg-primary dark:text-primary-foreground">
            <Mic className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">VOICE AI</span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <JobIndicator />
          {activeModel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('onboarding')}
              title="Change model or manage downloads"
              className="hidden gap-1 md:inline-flex"
            >
              <Cpu className="size-3" /> {activeModel.label}
              <ChevronsUpDown className="size-3 opacity-60" />
            </Button>
          )}
          <Button
            variant={view === 'workspace' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('workspace')}
          >
            <Mic className="size-4" /> Transcribe
          </Button>
          <Button
            variant={view === 'history' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('history')}
          >
            <HistoryIcon className="size-4" /> History
          </Button>
          <span
            title={
              isolated
                ? 'Cross-origin isolated. Multi-thread engine active.'
                : 'Not cross-origin isolated. Engine limited.'
            }
            className={cn(
              'ml-1 hidden items-center gap-1 text-xs sm:flex',
              isolated ? 'text-primary' : 'text-destructive',
            )}
          >
            <CircleDot className="size-3.5" />
          </span>
        </div>
      </div>
    </header>
  )
}
