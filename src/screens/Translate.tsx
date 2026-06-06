import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Check,
  Clipboard,
  Cpu,
  Languages,
  Loader2,
  Mic,
  Radio,
  Settings,
  Square,
  Trash2,
  User,
  Users,
  Volume2,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import {
  isCancelled,
  transcribeWithEngine,
  translateWithEngine,
  type LoadStatus,
} from '@/lib/engine'
import {
  TRANSLATE_LANGUAGES,
  type TranslateLanguage,
  type TranslateLanguageCode,
} from '@/lib/types'
import { decodeToFloat32 } from '@/lib/ffmpeg'
import { findVoice, loadVoices, speechSupported, speakText, stopSpeech } from '@/lib/voices'
import { formatMb, formatTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { NoModelState } from '@/components/NoModelState'

type Phase =
  | 'idle'
  | 'recording'
  | 'decoding'
  | 'loading-asr'
  | 'transcribing'
  | 'loading'
  | 'translating'
  | 'speaking'
  | 'error'
type VoiceDirection = 'me' | 'them'

const ASR_LANGUAGE_NAMES: Record<TranslateLanguageCode, string> = {
  en: 'english',
  yue: 'cantonese',
  zh: 'chinese',
  ja: 'japanese',
  ko: 'korean',
  th: 'thai',
  ms: 'malay',
  tl: 'tagalog',
}

const LANG_BY_CODE = new Map<TranslateLanguageCode, TranslateLanguage>(
  TRANSLATE_LANGUAGES.map((l) => [l.code, l]),
)

function getLang(code: TranslateLanguageCode): TranslateLanguage {
  return LANG_BY_CODE.get(code) ?? TRANSLATE_LANGUAGES[0]
}

export function Translate() {
  const activeModel = useApp((s) => s.activeModel)
  const activeTranslationModel = useApp((s) => s.activeTranslationModel)
  const capability = useApp((s) => s.capability)
  const job = useApp((s) => s.job)
  const setView = useApp((s) => s.setView)
  const setModelSetupTask = useApp((s) => s.setModelSetupTask)

  const [source, setSource] = useState<TranslateLanguageCode>('en')
  const [target, setTarget] = useState<TranslateLanguageCode>('yue')
  const [inputLangCode, setInputLangCode] = useState<TranslateLanguageCode>('en')
  const [outputLangCode, setOutputLangCode] = useState<TranslateLanguageCode>('yue')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<LoadStatus | null>(null)
  const [decodePct, setDecodePct] = useState(0)
  const [transcribePct, setTranscribePct] = useState(0)
  const [device, setDevice] = useState(capability?.device ?? 'wasm')
  const [error, setError] = useState<string | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [localOnly, setLocalOnly] = useState(true)
  const [copied, setCopied] = useState(false)
  const [recordingDirection, setRecordingDirection] = useState<VoiceDirection | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef('audio/webm')
  const elapsedRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const recordingDirectionRef = useRef<VoiceDirection | null>(null)

  const sourceLang = getLang(source)
  const targetLang = getLang(target)
  const inputLang = getLang(inputLangCode)
  const outputLang = getLang(outputLangCode)
  const busy =
    phase === 'recording' ||
    phase === 'decoding' ||
    phase === 'loading-asr' ||
    phase === 'transcribing' ||
    phase === 'loading' ||
    phase === 'translating' ||
    phase === 'speaking'
  const pct = Math.round((status?.ratio ?? 0) * 100)
  const voiceMatch = useMemo(
    () => findVoice(voices, outputLang.speechLangs, localOnly),
    [localOnly, outputLang.speechLangs, voices],
  )
  const canTranslate = !!activeTranslationModel && !!input.trim() && !busy && !job
  const canRecord = !!activeModel && !!activeTranslationModel && !busy && !job

  useEffect(() => {
    void loadVoices().then(setVoices)
    return () => {
      abortRef.current?.abort()
      cleanupRecording()
      stopSpeech()
    }
  }, [])

  function manageModels(task: 'transcription' | 'translation' = 'translation') {
    setModelSetupTask(task, 'translate')
    setView('onboarding')
  }

  function swapLanguages() {
    setSource(target)
    setTarget(source)
    if (output.trim()) {
      setInput(output)
      setOutput('')
    }
    setError(null)
  }

  function cleanupRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    timerRef.current = null
    streamRef.current = null
    recorderRef.current = null
  }

  function cancel() {
    abortRef.current?.abort()
    if (phase === 'recording') {
      recordingDirectionRef.current = null
      setRecordingDirection(null)
      void stopRecorder().then(() => setPhase('idle'))
      return
    }
    stopSpeech()
    setPhase('idle')
  }

  function voiceFor(lang: TranslateLanguage) {
    return findVoice(voices, lang.speechLangs, localOnly)
  }

  async function speak(value = output, lang = outputLang) {
    const text = value.trim()
    if (!text) return
    const match = voiceFor(lang)
    if (localOnly && !match.voice) {
      setError(`No local ${lang.label} voice is available in this browser.`)
      setPhase('error')
      return
    }
    setError(null)
    setPhase('speaking')
    try {
      await speakText({
        text,
        lang: lang.speechLangs[0],
        voice: match.voice,
      })
      setPhase('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  async function translate() {
    if (!activeTranslationModel || !input.trim() || job) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setStatus(null)
    setError(null)
    setOutput('')
    setCopied(false)
    setInputLangCode(source)
    setOutputLangCode(target)
    setPhase('loading')
    try {
      const translated = await translateWithEngine(
        activeTranslationModel,
        capability?.device ?? 'wasm',
        input.trim(),
        { srcLang: sourceLang.nllb, tgtLang: targetLang.nllb },
        {
          signal: ac.signal,
          onLoadProgress: setStatus,
          onDeviceReady: (d) => {
            setDevice(d)
            setPhase('translating')
          },
          onFallback: (d) => {
            setDevice(d)
            setPhase('loading')
          },
        },
      )
      setOutput(translated)
      setPhase('idle')
      await speak(translated, targetLang)
    } catch (e) {
      if (isCancelled(e)) {
        setPhase('idle')
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  function supportsSpeechInput(code: TranslateLanguageCode): boolean {
    return !!activeModel && (!activeModel.englishOnly || code === 'en')
  }

  function guardVoice(direction: VoiceDirection): boolean {
    const spokenCode = direction === 'me' ? source : target
    const spokenLang = getLang(spokenCode)
    if (!activeModel) {
      setError('Choose a Transcription Model before using voice input.')
      return false
    }
    if (!activeTranslationModel) {
      setError('Choose a Translation Model before translating speech.')
      return false
    }
    if (!supportsSpeechInput(spokenCode)) {
      setError(`${activeModel.label} only transcribes English. Choose a multilingual Transcription Model for ${spokenLang.label}.`)
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not available in this browser.')
      return false
    }
    return true
  }

  async function startVoice(direction: VoiceDirection) {
    if (!guardVoice(direction) || busy || job) return
    abortRef.current?.abort()
    stopSpeech()
    setError(null)
    setInput('')
    setOutput('')
    setCopied(false)
    setDecodePct(0)
    setTranscribePct(0)
    setStatus(null)
    setRecordingDirection(direction)
    recordingDirectionRef.current = direction
    const spokenCode = direction === 'me' ? source : target
    const translatedCode = direction === 'me' ? target : source
    setInputLangCode(spokenCode)
    setOutputLangCode(translatedCode)
    chunksRef.current = []
    elapsedRef.current = 0
    setElapsed(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      mimeRef.current = mime
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250)
      recorderRef.current = recorder
      setPhase('recording')
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1
        setElapsed(elapsedRef.current)
      }, 1000)
    } catch (e) {
      cleanupRecording()
      setRecordingDirection(null)
      recordingDirectionRef.current = null
      setError(e instanceof Error ? `Microphone unavailable: ${e.message}` : 'Microphone unavailable')
      setPhase('error')
    }
  }

  async function stopRecorder(): Promise<Blob | null> {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupRecording()
      return null
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: mimeRef.current }) : null
    cleanupRecording()
    return blob
  }

  async function stopVoice() {
    const direction = recordingDirectionRef.current
    setRecordingDirection(null)
    recordingDirectionRef.current = null
    const blob = await stopRecorder()
    if (!blob || !direction || !activeModel || !activeTranslationModel) {
      setPhase('idle')
      return
    }
    const spokenCode = direction === 'me' ? source : target
    const translatedCode = direction === 'me' ? target : source
    const spokenLang = getLang(spokenCode)
    const translatedLang = getLang(translatedCode)
    const ac = new AbortController()
    abortRef.current = ac
    setDecodePct(0)
    setTranscribePct(0)
    setStatus(null)
    setPhase('decoding')

    try {
      const file = new File([blob], 'phrase.webm', { type: mimeRef.current })
      const { wave } = await decodeToFloat32(
        file,
        (ratio) => setDecodePct(Math.round(ratio * 100)),
        ac.signal,
      )
      setStatus(null)
      setPhase('loading-asr')
      const out = await transcribeWithEngine(activeModel, capability?.device ?? 'wasm', wave, {
        signal: ac.signal,
        language: ASR_LANGUAGE_NAMES[spokenCode],
        englishOnly: activeModel.englishOnly,
        onLoadProgress: setStatus,
        onDeviceReady: (d) => {
          setDevice(d)
          setPhase('transcribing')
        },
        onFallback: (d) => {
          setDevice(d)
          setPhase('loading-asr')
        },
        onProgress: (s) => setTranscribePct(Math.round(s.ratio * 100)),
        onPartial: (text) => setInput(text),
      })
      const heard = out.text?.replace(/\s+/g, ' ').trim()
      if (!heard) throw new Error(`Could not hear a ${spokenLang.label} phrase.`)
      setInput(heard)
      setInputLangCode(spokenCode)
      setOutputLangCode(translatedCode)
      setStatus(null)
      setPhase('loading')
      const translated = await translateWithEngine(
        activeTranslationModel,
        capability?.device ?? 'wasm',
        heard,
        { srcLang: spokenLang.nllb, tgtLang: translatedLang.nllb },
        {
          signal: ac.signal,
          onLoadProgress: setStatus,
          onDeviceReady: (d) => {
            setDevice(d)
            setPhase('translating')
          },
          onFallback: (d) => {
            setDevice(d)
            setPhase('loading')
          },
        },
      )
      setOutput(translated)
      setPhase('idle')
      await speak(translated, translatedLang)
    } catch (e) {
      if (isCancelled(e)) {
        setPhase('idle')
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  async function copyOutput() {
    if (!output.trim()) return
    await navigator.clipboard?.writeText(output)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  if (!activeTranslationModel) {
    return (
      <NoModelState
        section="translation"
        onSetup={() => {
          setModelSetupTask('translation')
          setView('onboarding')
        }}
      />
    )
  }

  const voiceStatus = !speechSupported()
    ? 'Speech unavailable'
    : voiceMatch.voice
      ? `${voiceMatch.voice.name} · ${voiceMatch.voice.localService ? 'local' : 'network'}`
      : `No ${localOnly ? 'local ' : ''}${outputLang.label} voice`
  const phaseLabel =
    phase === 'recording'
      ? 'Recording'
      : phase === 'decoding'
        ? 'Decoding speech'
        : phase === 'loading-asr'
          ? 'Loading transcription model'
          : phase === 'transcribing'
            ? 'Transcribing speech'
            : phase === 'loading'
              ? 'Loading translation model'
              : phase === 'translating'
                ? 'Translating'
                : phase === 'speaking'
                  ? 'Speaking'
                  : ''
  const activeRecordingLabel =
    recordingDirection === 'me'
      ? `${sourceLang.label} → ${targetLang.label}`
      : recordingDirection === 'them'
        ? `${targetLang.label} → ${sourceLang.label}`
        : ''

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Languages className="size-6 text-primary" /> Translate
          </h2>
          <p className="text-sm text-muted-foreground">
            Current model: <span className="text-foreground">{activeTranslationModel.label}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => manageModels('translation')}>
          <Settings className="size-4" /> Models
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="source-lang">You speak</Label>
                <Select
                  value={source}
                  disabled={busy}
                  onValueChange={(v) => {
                    const next = v as TranslateLanguageCode
                    setSource(next)
                    if (!input.trim()) setInputLangCode(next)
                  }}
                >
                  <SelectTrigger id="source-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSLATE_LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={swapLanguages}
                disabled={busy}
                title="Swap languages"
                className="self-end"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="target-lang">They speak</Label>
                <Select
                  value={target}
                  disabled={busy}
                  onValueChange={(v) => {
                    const next = v as TranslateLanguageCode
                    setTarget(next)
                    if (!output.trim()) setOutputLangCode(next)
                  }}
                >
                  <SelectTrigger id="target-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSLATE_LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Button
                variant={recordingDirection === 'me' ? 'destructive' : 'outline'}
                onClick={() => void startVoice('me')}
                disabled={!canRecord || !supportsSpeechInput(source)}
                title={!supportsSpeechInput(source) ? 'Choose a multilingual Transcription Model' : undefined}
                className="justify-start"
              >
                {recordingDirection === 'me' ? (
                  <Radio className="size-4 animate-pulse" />
                ) : (
                  <User className="size-4" />
                )}
                Me
              </Button>
              <Button
                variant={recordingDirection === 'them' ? 'destructive' : 'outline'}
                onClick={() => void startVoice('them')}
                disabled={!canRecord || !supportsSpeechInput(target)}
                title={!supportsSpeechInput(target) ? 'Choose a multilingual Transcription Model' : undefined}
                className="justify-start"
              >
                {recordingDirection === 'them' ? (
                  <Radio className="size-4 animate-pulse" />
                ) : (
                  <Users className="size-4" />
                )}
                Them
              </Button>
              {phase === 'recording' && (
                <Button variant="destructive" onClick={() => void stopVoice()}>
                  <Square className="size-3.5 fill-current" /> Stop
                </Button>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="phrase">Phrase · {inputLang.label}</Label>
              <textarea
                id="phrase"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
                rows={5}
                className="min-h-32 w-full resize-y rounded-md border bg-background px-3 py-2 text-base leading-7 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
                placeholder={inputLangCode === source ? 'How much is this?' : ''}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="glow" onClick={() => void translate()} disabled={!canTranslate}>
                {phase === 'loading' || phase === 'translating' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Languages className="size-4" />
                )}
                Translate
              </Button>
              {busy && phase !== 'recording' && (
                <Button variant="outline" onClick={cancel}>
                  <Square className="size-3.5 fill-current" /> Stop
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setInput('')
                  setOutput('')
                  setError(null)
                }}
                disabled={busy || (!input && !output)}
              >
                <Trash2 className="size-4" /> Clear
              </Button>
            </div>

            {busy && phase !== 'recording' && phase !== 'speaking' && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    {phaseLabel}
                  </span>
                  {(phase === 'loading' || phase === 'loading-asr') && <span className="tabular-nums">{pct}%</span>}
                  {phase === 'decoding' && <span className="tabular-nums">{decodePct}%</span>}
                  {phase === 'transcribing' && <span className="tabular-nums">{transcribePct}%</span>}
                </div>
                {(phase === 'loading' || phase === 'loading-asr') && <Progress value={pct} />}
                {phase === 'decoding' && <Progress value={decodePct} />}
                {phase === 'transcribing' && <Progress value={transcribePct} />}
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Cpu className="size-3" /> {device === 'webgpu' ? 'WebGPU' : 'WASM'}
                  {status?.totalBytes
                    ? ` · ${formatMb(status.loadedBytes / 1e6)} / ${formatMb(status.totalBytes / 1e6)}`
                    : ''}
                </p>
              </div>
            )}

            {phase === 'recording' && (
              <div className="mt-4 flex items-center justify-between rounded-md border bg-background p-3 text-sm">
                <span className="flex items-center gap-2 text-destructive">
                  <Radio className="size-4 animate-pulse" /> {activeRecordingLabel}
                </span>
                <span className="font-mono tabular-nums">{formatTime(elapsed)}</span>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Translation · {outputLang.label}</Label>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => void speak()} disabled={!output.trim() || busy} title="Speak">
                  <Volume2 className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void copyOutput()} disabled={!output.trim()} title="Copy">
                  {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="mt-3 min-h-32 rounded-md border bg-background p-3 text-lg leading-8">
              {output ? (
                output
              ) : (
                <span className="text-sm text-muted-foreground">Translation appears here.</span>
              )}
              {phase === 'speaking' && (
                <span className="ml-2 inline-flex items-center gap-1 text-sm text-primary">
                  <Volume2 className="size-4" /> Speaking
                </span>
              )}
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h3 className="text-sm font-medium">Transcription Model</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeModel
                  ? `${activeModel.label}${activeModel.englishOnly ? ' · English only' : ' · multilingual'}`
                  : 'Not selected'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => manageModels('transcription')}
              >
                <Mic className="size-4" /> Transcription Models
              </Button>
            </div>
            <div>
              <h3 className="text-sm font-medium">Voice Check</h3>
              <p className="mt-1 text-xs text-muted-foreground">{voiceStatus}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="local-voices" className="text-sm">
                Local voices only
              </Label>
              <Switch id="local-voices" checked={localOnly} onCheckedChange={setLocalOnly} />
            </div>
            <div className="rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
              Output speech locale: <span className="text-foreground">{outputLang.speechLangs[0]}</span>
            </div>
            {job && (
              <div className="rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
                A transcription job is running, so translation waits for the shared engine.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
