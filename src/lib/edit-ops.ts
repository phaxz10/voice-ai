import type { EditLayer, EditSegment, EditWord } from './types'
import { uid } from './utils'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mapSeg(
  edit: EditLayer,
  segId: string,
  fn: (s: EditSegment) => EditSegment,
): EditLayer {
  return { segments: edit.segments.map((s) => (s.id === segId ? fn(s) : s)) }
}

export function editWordText(
  edit: EditLayer,
  segId: string,
  wordId: string,
  text: string,
): EditLayer {
  return mapSeg(edit, segId, (s) => ({
    ...s,
    words: s.words.map((w) => (w.id === wordId ? { ...w, text } : w)),
  }))
}

export function deleteWord(edit: EditLayer, segId: string, wordId: string): EditLayer {
  return {
    segments: edit.segments
      .map((s) =>
        s.id !== segId ? s : { ...s, words: s.words.filter((w) => w.id !== wordId) },
      )
      .filter((s) => s.words.length > 0),
  }
}

/** Insert a user word after `afterWordId` (or at start if null); timing interpolated. */
export function insertWordAfter(
  edit: EditLayer,
  segId: string,
  afterWordId: string | null,
  text: string,
): EditLayer {
  return mapSeg(edit, segId, (s) => {
    const idx = afterWordId ? s.words.findIndex((w) => w.id === afterWordId) : -1
    const prev = s.words[idx]
    const next = s.words[idx + 1]
    const start = prev?.end ?? next?.start ?? 0
    const end = next?.start ?? start + 0.3
    const nw: EditWord = {
      id: uid('ew_'),
      text,
      origin: null,
      start,
      end: Math.max(end, start + 0.05),
      timing: 'interpolated',
    }
    const words = [...s.words]
    words.splice(idx + 1, 0, nw)
    return { ...s, words }
  })
}

/** Split a segment so `wordId` begins a new segment. */
export function splitSegment(edit: EditLayer, segId: string, wordId: string): EditLayer {
  const segs: EditSegment[] = []
  for (const s of edit.segments) {
    if (s.id !== segId) {
      segs.push(s)
      continue
    }
    const idx = s.words.findIndex((w) => w.id === wordId)
    if (idx <= 0) {
      segs.push(s)
      continue
    }
    segs.push({ id: s.id, words: s.words.slice(0, idx), speakerId: s.speakerId })
    segs.push({ id: uid('es_'), words: s.words.slice(idx), speakerId: s.speakerId })
  }
  return { segments: segs }
}

/** Merge a segment with the one after it. */
export function mergeSegmentWithNext(edit: EditLayer, segId: string): EditLayer {
  const segs = [...edit.segments]
  const i = segs.findIndex((s) => s.id === segId)
  if (i < 0 || i + 1 >= segs.length) return edit
  const merged: EditSegment = {
    id: segs[i].id,
    words: [...segs[i].words, ...segs[i + 1].words],
    speakerId: segs[i].speakerId,
  }
  segs.splice(i, 2, merged)
  return { segments: segs }
}

export function findReplaceAll(
  edit: EditLayer,
  find: string,
  replace: string,
  caseSensitive = false,
): { edit: EditLayer; count: number } {
  if (!find) return { edit, count: 0 }
  let count = 0
  const re = new RegExp(escapeRegExp(find), caseSensitive ? 'g' : 'gi')
  const segments = edit.segments.map((s) => ({
    ...s,
    words: s.words.map((w) => {
      re.lastIndex = 0
      if (!re.test(w.text)) return w
      re.lastIndex = 0
      const text = w.text.replace(re, () => {
        count++
        return replace
      })
      return { ...w, text }
    }),
  }))
  return { edit: { segments }, count }
}

/** Flatten the edit layer to plain words for highlight/seek lookups. */
function flatWords(edit: EditLayer): Array<EditWord & { segId: string }> {
  return edit.segments.flatMap((s) => s.words.map((w) => ({ ...w, segId: s.id })))
}
