export interface VoiceMatch {
  voice: SpeechSynthesisVoice | null
  exact: boolean
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return []
  const synth = window.speechSynthesis
  const current = synth.getVoices()
  if (current.length) return current

  return await new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish)
    window.setTimeout(finish, 900)
  })
}

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace('_', '-')
}

export function findVoice(
  voices: SpeechSynthesisVoice[],
  wantedLangs: readonly string[],
  localOnly: boolean,
): VoiceMatch {
  const candidates = localOnly ? voices.filter((v) => v.localService) : voices
  const wanted = wantedLangs.map(normalizeLang)
  const exact = candidates.find((v) => wanted.includes(normalizeLang(v.lang)))
  if (exact) return { voice: exact, exact: true }

  const prefix = candidates.find((v) => {
    const lang = normalizeLang(v.lang)
    return wanted.some((w) => lang.startsWith(`${w}-`) || w.startsWith(`${lang}-`))
  })
  return { voice: prefix ?? null, exact: false }
}

export async function speakText({
  text,
  lang,
  voice,
}: {
  text: string
  lang: string
  voice: SpeechSynthesisVoice | null
}): Promise<void> {
  if (!speechSupported()) throw new Error('Speech output is not available in this browser.')
  const synth = window.speechSynthesis
  synth.cancel()
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    if (voice) utterance.voice = voice
    utterance.rate = 0.92
    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(new Error(e.error || 'Speech output failed.'))
    synth.speak(utterance)
  })
}

export function stopSpeech(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}
