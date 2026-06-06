import { ModelCard } from '@/components/ModelCard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fitCheck } from '@/lib/capability'
import { recommendModel } from '@/lib/catalog'
import { benchmark, getEngine, isCancelled, type LoadStatus } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { PRIMARY_LANGUAGES, type CatalogModel, type PrimaryLanguage } from '@/lib/types'
import { formatMb } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  Download,
  HardDrive,
  Info,
  Loader2,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

type Phase = 'idle' | 'downloading' | 'calibrating' | 'error' | 'cancelled'

export function Onboarding() {
  const catalog = useApp((s) => s.catalog)
  const capability = useApp((s) => s.capability)
  const primaryLanguage = useApp((s) => s.primaryLanguage)
  const setPrimaryLanguage = useApp((s) => s.setPrimaryLanguage)
  const setActiveModel = useApp((s) => s.setActiveModel)
  const setCapability = useApp((s) => s.setCapability)
  const setView = useApp((s) => s.setView)
  const provisioned = useApp((s) => s.provisioned)
  const activeModel = useApp((s) => s.activeModel)
  const markProvisioned = useApp((s) => s.markProvisioned)
  const evict = useApp((s) => s.evict)

  const changing = !!activeModel

  const recommended = useMemo(
    () => (capability ? recommendModel(catalog, capability, primaryLanguage) : null),
    [catalog, capability, primaryLanguage],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = catalog.find((m) => m.id === selectedId) ?? activeModel ?? recommended

  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<LoadStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [evictTarget, setEvictTarget] = useState<CatalogModel | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const busy = phase === 'downloading' || phase === 'calibrating'

  const selectedActive = !!selected && activeModel?.id === selected.id
  const selectedProvisioned = !!selected && provisioned.includes(selected.id)

  const storageFree =
    capability?.storageQuotaMb != null && capability?.storageUsageMb != null
      ? capability.storageQuotaMb - capability.storageUsageMb
      : null

  function switchTo(m: CatalogModel) {
    setActiveModel(m)
    setView('workspace')
  }

  async function provision() {
    if (!selected || !capability) return
    setError(null)
    const fc = fitCheck(selected, capability)
    if (!fc.supported) {
      setError(fc.reason ?? 'This model cannot run on your device.')
      setPhase('error')
      return
    }
    const ac = new AbortController()
    abortRef.current = ac
    setStatus(null)
    setPhase('downloading')
    try {
      const asr = await getEngine(selected, capability.device, {
        signal: ac.signal,
        onProgress: setStatus,
      })
      markProvisioned(selected.id)
      setActiveModel(selected)
      setPhase('calibrating')
      try {
        const rtf = await benchmark(asr)
        setCapability({ ...capability, benchmarkRtf: rtf })
      } catch {
        /* optional */
      }
      setView('workspace')
    } catch (e) {
      if (isCancelled(e)) {
        setPhase('cancelled')
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  function cancelDownload() {
    abortRef.current?.abort()
  }

  async function confirmEvict() {
    const t = evictTarget
    setEvictTarget(null)
    if (t) await evict(t)
  }

  const pct = Math.round((status?.ratio ?? 0) * 100)

  return (
    <div className="space-y-8 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <button
            onClick={() => setView(changing ? 'workspace' : 'landing')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {changing ? 'workspace' : 'back'}
          </button>
          <h2 className="text-2xl font-semibold tracking-tight">
            {changing ? 'Transcription Models' : 'Choose a transcription model'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {changing
              ? 'Switch models, add another one, or clear cached model files. Local data stays on this device.'
              : 'Pick a language, cache one model, and start transcribing. You can change this later.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lang">Primary language</Label>
          <Select
            value={primaryLanguage}
            disabled={busy}
            onValueChange={(v) => {
              setPrimaryLanguage(v as PrimaryLanguage)
              setSelectedId(null)
            }}
          >
            <SelectTrigger id="lang" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIMARY_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {capability && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium">Browser capability check</h3>
              <p className="text-xs text-muted-foreground">
                Used for model suggestions. These are browser hints, not a full hardware spec.
              </p>
            </div>
            <span className="text-xs capitalize text-muted-foreground">
              Recommendation tier: {capability.tier}
            </span>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <span>{capability.webgpu ? 'WebGPU available' : 'CPU fallback'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-muted-foreground" />
              <span>{capability.cores} browser threads reported</span>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              <span>
                {storageFree != null
                  ? `${formatMb(storageFree)} model cache estimate`
                  : 'Storage estimate unavailable'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            recommended={recommended?.id === m.id}
            selected={selected?.id === m.id}
            provisioned={provisioned.includes(m.id)}
            active={activeModel?.id === m.id}
            busy={busy}
            onSelect={(mm) => setSelectedId(mm.id)}
            onEvict={busy ? undefined : (mm) => setEvictTarget(mm)}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg sm:sticky sm:bottom-4">
        {busy ? (
          phase === 'downloading' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Downloading {selected?.label}...
                </span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <Progress value={pct} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {status && status.totalBytes > 0
                    ? `${formatMb(status.loadedBytes / 1e6)} / ${formatMb(
                        status.totalBytes / 1e6,
                      )}, file ${status.fileIndex}/${status.fileCount}`
                    : 'Starting...'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelDownload}
                  className="text-destructive"
                >
                  <X className="size-4" /> Cancel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Downloads cannot resume. Cancelling means starting over next time.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" /> Calibrating your browser...
            </div>
          )
        ) : phase === 'error' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null)
                  setPhase('idle')
                }}
              >
                Choose another
              </Button>
              <Button variant="glow" size="sm" onClick={provision}>
                <RotateCcw className="size-4" /> Retry
              </Button>
            </div>
          </div>
        ) : phase === 'cancelled' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>Download cancelled. Retrying starts the download over. There is no resume.</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPhase('idle')}>
                Choose another
              </Button>
              <Button variant="glow" size="sm" onClick={provision}>
                <RotateCcw className="size-4" /> Retry download
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="text-sm">
              <div className="font-medium">{selected?.label ?? 'Select a model'}</div>
              <div className="text-xs text-muted-foreground">
                {selected
                  ? selectedActive
                    ? 'Currently active on this device'
                    : selectedProvisioned
                      ? 'Downloaded. Switch instantly'
                      : `${formatMb(selected.sizeMb)}. Cached after first download`
                  : 'Pick a model to continue'}
              </div>
            </div>
            {selected &&
              (selectedActive ? (
                <Button
                  variant="glow"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => setView('workspace')}
                >
                  Open workspace <ArrowRight className="size-4" />
                </Button>
              ) : selectedProvisioned ? (
                <Button
                  variant="glow"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => switchTo(selected)}
                >
                  <Check className="size-4" /> Switch to this model
                </Button>
              ) : (
                <Button variant="glow" size="lg" className="w-full sm:w-auto" onClick={provision}>
                  <Download className="size-4" /> Download &amp; continue
                </Button>
              ))}
          </div>
        )}
      </div>

      <Dialog open={!!evictTarget} onOpenChange={(o) => !o && setEvictTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {evictTarget?.label} from this device?</DialogTitle>
            <DialogDescription>
              This frees its storage
              {evictTarget && activeModel?.id === evictTarget.id
                ? ' and unloads it as your active model'
                : ''}
              . Your transcripts and settings are kept, and you can download it again anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEvictTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmEvict}>
              Remove from device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
