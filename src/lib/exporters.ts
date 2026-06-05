import type { TranscriptRecord, ExportFormat, ExportLayer } from './types'
import { timestamp } from './utils'

interface SegView {
  start: number
  end: number
  text: string
}

function joinWords(texts: string[]): string {
  return texts
    .join(' ')
    .replace(/\s+([,.!?;:’'”)\]])/g, '$1')
    .replace(/([(\[“])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function segmentsView(record: TranscriptRecord, layer: ExportLayer): SegView[] {
  if (layer === 'raw') {
    return record.asr.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: joinWords(s.words.map((w) => w.text)),
    }))
  }
  return record.edit.segments
    .map((s) => {
      const ws = s.words
      return {
        start: ws[0]?.start ?? 0,
        end: ws[ws.length - 1]?.end ?? ws[0]?.start ?? 0,
        text: joinWords(ws.map((w) => w.text)),
      }
    })
    .filter((s) => s.text.length > 0)
}

function toText(r: TranscriptRecord, l: ExportLayer): string {
  return segmentsView(r, l)
    .map((s) => s.text)
    .join('\n')
}

function toSrt(r: TranscriptRecord, l: ExportLayer): string {
  return segmentsView(r, l)
    .map(
      (s, i) =>
        `${i + 1}\n${timestamp(s.start, ',')} --> ${timestamp(s.end, ',')}\n${s.text}\n`,
    )
    .join('\n')
}

function toVtt(r: TranscriptRecord, l: ExportLayer): string {
  return (
    'WEBVTT\n\n' +
    segmentsView(r, l)
      .map((s) => `${timestamp(s.start, '.')} --> ${timestamp(s.end, '.')}\n${s.text}\n`)
      .join('\n')
  )
}

function toMarkdown(r: TranscriptRecord, l: ExportLayer): string {
  const head =
    `# ${r.source.filename}\n\n` +
    `- **Model:** ${r.model}\n` +
    `- **Duration:** ${timestamp(r.source.durationSec, '.')}\n` +
    `- **Language:** ${r.asr.language}\n\n---\n\n`
  return (
    head +
    segmentsView(r, l)
      .map((s) => `**[${timestamp(s.start, '.')}]** ${s.text}`)
      .join('\n\n')
  )
}

export function exportTranscript(
  record: TranscriptRecord,
  format: ExportFormat,
  layer: ExportLayer,
): { text: string; mime: string; ext: string } {
  switch (format) {
    case 'txt':
      return { text: toText(record, layer), mime: 'text/plain', ext: 'txt' }
    case 'srt':
      return { text: toSrt(record, layer), mime: 'application/x-subrip', ext: 'srt' }
    case 'vtt':
      return { text: toVtt(record, layer), mime: 'text/vtt', ext: 'vtt' }
    case 'md':
      return { text: toMarkdown(record, layer), mime: 'text/markdown', ext: 'md' }
    case 'json':
      return { text: JSON.stringify(record, null, 2), mime: 'application/json', ext: 'json' }
  }
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
