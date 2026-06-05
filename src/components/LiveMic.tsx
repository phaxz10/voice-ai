import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, AlertTriangle, Radio } from 'lucide-react'
import { useApp } from '@/lib/store'
import { decodeToFloat32 } from '@/lib/ffmpeg'
import { getEngine, transcribe, languageName } from '@/lib/engine'
import { buildAsrLayer, deriveEditLayer } from '@/lib/asr'
import { saveMediaAsset, saveTranscript } from '@/lib/db'
import { cn, formatTime, uid } from '@/lib/utils'
import type { TranscriptRecord } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const MAX_SECONDS = 300
const INTERIM_EVERY_MS = 8000
const INTERIM_UNTIL_SEC = 120 // pause live updates past this (still records fully)

type Phase = 'idle' | 'recording' | 'finalizing' | 'error'

export function LiveMic() {
  const activeModel = useApp((s) => s.activeModel)
  const job = useApp((s) => s.job)
  const primaryLanguage = useApp((s) => s.primaryLanguage)
  const capability = useApp((s) => s.capability)
  const setRecord = useApp((s) => s.setRecord)
  const setView = useApp((s) => s.setView)
  const setMediaUrl = useApp((s) => s.setMediaUrl)
  const refreshHistory = useApp((s) => s.refreshHistory)

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [liveText, setLiveText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string>('audio/webm')
  const timerRef = useRef<number | null>(null)
  const interimRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const elapsedRef = useRef(0)

  useEffect(() => () => cleanup(), [])

  function cleanup() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (interimRef.current) window.clearInterval(interimRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    timerRef.current = null
    interimRef.current = null
  }

  const device = capability?.device ?? 'wasm'
  const language = () => languageName(primaryLanguage, activeModel?.englishOnly ?? false)

  async function start() {
    if (!activeModel || job) return // one shared engine: don't collide with a running file/rerun job
    setError(null)
    setLiveText('')
    setElapsed(0)
    elapsedRef.current = 0
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      mimeRef.current = mime
      const mr = new MediaRecorder(stream, { mimeType: mime })
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start(1000)
      recorderRef.current = mr
      setPhase('recording')

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1
        setElapsed(elapsedRef.current)
        if (elapsedRef.current >= MAX_SECONDS) void stop()
      }, 1000)
      interimRef.current = window.setInterval(() => void interim(), INTERIM_EVERY_MS)
    } catch (e) {
      setError(e instanceof Error ? `Microphone unavailable: ${e.message}` : 'Microphone unavailable')
      setPhase('error')
    }
  }

  async function interim() {
    if (runningRef.current || elapsedRef.current > INTERIM_UNTIL_SEC) return
    if (chunksRef.current.length === 0 || !activeModel) return
    runningRef.current = true
    try {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      const { wave } = await decodeToFloat32(new File([blob], 'live.webm', { type: mimeRef.current }))
      const asr = await getEngine(activeModel, device)
      const out = await transcribe(asr, wave, {
        language: language(),
        englishOnly: activeModel.englishOnly,
      })
      if (out.text?.trim()) setLiveText(out.text.replace(/\s+/g, ' ').trim())
    } catch {
      /* interim best-effort */
    } finally {
      runningRef.current = false
    }
  }

  async function stop() {
    cleanup()
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') {
      await new Promise<void>((res) => {
        mr.onstop = () => res()
        mr.stop()
      })
    }
    if (!activeModel || chunksRef.current.length === 0) {
      setPhase('idle')
      return
    }
    setPhase('finalizing')
    try {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      setMediaUrl(URL.createObjectURL(blob))
      const { wave, durationSec } = await decodeToFloat32(
        new File([blob], 'live.webm', { type: mimeRef.current }),
      )
      const asr = await getEngine(activeModel, device)
      const out = await transcribe(asr, wave, {
        language: language(),
        englishOnly: activeModel.englishOnly,
      })
      const asrLayer = buildAsrLayer(out, language() ?? 'auto')
      const edit = deriveEditLayer(asrLayer)
      const now = Date.now()
      const mediaId = uid('media_')
      const filename = `Live recording ${new Date(now).toLocaleString()}`
      const record: TranscriptRecord = {
        id: uid('tr_'),
        source: {
          filename,
          sizeBytes: blob.size,
          durationSec,
          hash: `live:${now}`,
          mediaId,
          mimeType: mimeRef.current,
        },
        model: activeModel.label,
        primaryLanguage,
        createdAt: now,
        updatedAt: now,
        asr: asrLayer,
        edit,
      }
      await saveMediaAsset({
        id: mediaId,
        blob,
        filename,
        mimeType: mimeRef.current,
        sizeBytes: blob.size,
        createdAt: now,
      })
      await saveTranscript(record)
      await refreshHistory()
      setRecord(record)
      setPhase('idle')
      setView('transcript')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 p-10 text-center">
        {phase === 'error' ? (
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="text-left">
              <p className="font-medium">Could not record</p>
              <p className="text-sm opacity-90">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setPhase('idle')}>
                Back
              </Button>
            </div>
          </div>
        ) : phase === 'finalizing' ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" /> Finishing transcript...
          </div>
        ) : (
          <>
            <span
              className={cn(
                'grid size-20 place-items-center rounded-full transition-all',
                phase === 'recording'
                  ? 'bg-destructive/15 text-destructive ring-4 ring-destructive/20'
                  : 'bg-primary/15 text-primary',
              )}
            >
              {phase === 'recording' ? (
                <Radio className="size-9 animate-pulse" />
              ) : (
                <Mic className="size-9" />
              )}
            </span>

            {phase === 'recording' ? (
              <>
                <div className="font-mono text-2xl tabular-nums">{formatTime(elapsed)}</div>
                <Button variant="destructive" onClick={() => void stop()}>
                  <Square className="size-4" /> Stop &amp; transcribe
                </Button>
                <div className="min-h-12 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  {liveText || <span className="opacity-60">Listening... speak now.</span>}
                  {elapsed > INTERIM_UNTIL_SEC && (
                    <p className="mt-1 text-xs opacity-60">
                      Live preview paused. Full transcript on stop.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="font-medium">Record from your microphone</p>
                  <p className="text-sm text-muted-foreground">
                    Live preview as you talk; full transcript when you stop. Up to{' '}
                    {MAX_SECONDS / 60} min.
                  </p>
                </div>
                <Button
                  variant="glow"
                  size="lg"
                  onClick={() => void start()}
                  disabled={!!job}
                  title={job ? 'A transcription is already running' : undefined}
                >
                  <Mic className="size-4" /> Start recording
                </Button>
                {job && (
                  <p className="text-xs text-muted-foreground">
                    A transcription is running. Recording is available once it finishes.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
