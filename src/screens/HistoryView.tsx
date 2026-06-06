import {
  FileText,
  Mic,
  Trash2,
  Clock,
  ChevronRight,
  ShieldAlert,
  Inbox,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { deleteTranscript, wipeEverything } from '@/lib/db'
import { formatTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'

function wordCount(rec: { edit: { segments: { words: unknown[] }[] } }): number {
  return rec.edit.segments.reduce((n, s) => n + s.words.length, 0)
}

export function HistoryView() {
  const history = useApp((s) => s.history)
  const activeModel = useApp((s) => s.activeModel)
  const setView = useApp((s) => s.setView)
  const setModelSetupTask = useApp((s) => s.setModelSetupTask)
  const refreshHistory = useApp((s) => s.refreshHistory)
  const openTranscript = useApp((s) => s.openTranscript)

  async function open(id: string) {
    await openTranscript(id)
  }

  async function remove(id: string) {
    await deleteTranscript(id)
    await refreshHistory()
  }

  async function wipe() {
    await wipeEverything()
    window.location.reload()
  }

  return (
    <div className="space-y-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">History</h2>
          <p className="text-sm text-muted-foreground">
            Transcripts are stored in this browser. Media is not kept, so reattach a file to replay.
          </p>
        </div>
        {/* Always available: downloaded models live in the cache even when there are
            zero transcripts, so this is the only way to reclaim that storage here. */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              <ShieldAlert className="size-4" /> Wipe everything
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Erase all local data?</DialogTitle>
              <DialogDescription>
                This deletes every transcript, your settings, and the downloaded
                models from this browser. It cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" onClick={wipe}>
                Erase everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Inbox className="size-8" />
            <p>No transcripts yet. Your work will appear here.</p>
            <Button
              variant="glow"
              onClick={() => {
                if (!activeModel) setModelSetupTask('transcription')
                setView(activeModel ? 'workspace' : 'onboarding')
              }}
            >
              Start transcribing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {history.map((rec) => (
            <Card key={rec.id} className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-3 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {rec.source.hash.startsWith('live:') ? (
                    <Mic className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <button onClick={() => void open(rec.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-medium">{rec.source.filename}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" /> {formatTime(rec.source.durationSec)}
                    </span>
                    <span>{wordCount(rec)} words</span>
                    <span>{rec.model}</span>
                    <span>{new Date(rec.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(rec.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
                <button onClick={() => void open(rec.id)}>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
