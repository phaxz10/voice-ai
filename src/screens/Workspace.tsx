import { Upload, Mic } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useApp } from '@/lib/store'
import { FileTranscriber } from '@/components/FileTranscriber'
import { LiveMic } from '@/components/LiveMic'
import { NoModelState } from '@/components/NoModelState'

export function Workspace() {
  const activeModel = useApp((s) => s.activeModel)
  const setView = useApp((s) => s.setView)

  if (!activeModel) {
    return <NoModelState onSetup={() => setView('onboarding')} />
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Current model: <span className="text-foreground">{activeModel.label}</span>. Files are
          processed in this browser.
        </p>
      </div>

      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file">
            <Upload className="size-4" /> Upload a file
          </TabsTrigger>
          <TabsTrigger value="live">
            <Mic className="size-4" /> Live mic
          </TabsTrigger>
        </TabsList>
        <TabsContent value="file">
          <FileTranscriber />
        </TabsContent>
        <TabsContent value="live">
          <LiveMic />
        </TabsContent>
      </Tabs>
    </div>
  )
}
