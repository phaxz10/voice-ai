import { create } from 'zustand'

/**
 * Playback state for the Transcript view, split into two stores so high-frequency time
 * updates never touch the word list (ADR-0009).
 *
 * - `usePlayhead` updates ~60fps (rAF) and is read ONLY by the Player (scrubber + clock).
 * - `useActiveWord` updates only when the highlighted word actually changes (a few times/sec),
 *   and is read by SegmentRows, so each tick re-renders at most the 1 or 2 segments whose
 *   active state flipped, never the whole transcript.
 */

interface PlayheadState {
  currentTime: number
  duration: number
  playing: boolean
  set: (p: Partial<Pick<PlayheadState, 'currentTime' | 'duration' | 'playing'>>) => void
  reset: () => void
}

export const usePlayhead = create<PlayheadState>((set) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  set: (p) => set(p),
  reset: () => set({ currentTime: 0, duration: 0, playing: false }),
}))

interface ActiveWordState {
  segId: string | null
  wordId: string | null
  /** No-op when the active word is unchanged, so subscribers aren't re-notified. */
  set: (segId: string | null, wordId: string | null) => void
}

export const useActiveWord = create<ActiveWordState>((set) => ({
  segId: null,
  wordId: null,
  set: (segId, wordId) => set((s) => (s.wordId === wordId ? s : { segId, wordId })),
}))

export interface FlatWord {
  segId: string
  wordId: string
  start: number
  end: number
}

/** Flatten Edit-layer segments into a start-sorted index for O(log n) active-word lookup. */
export function buildFlatWords(
  segments: { id: string; words: { id: string; start: number; end: number }[] }[],
): FlatWord[] {
  const flat: FlatWord[] = []
  for (const seg of segments)
    for (const w of seg.words)
      flat.push({ segId: seg.id, wordId: w.id, start: w.start, end: w.end })
  flat.sort((a, b) => a.start - b.start)
  return flat
}

/** Rightmost word whose [start,end) contains t (binary search). Null in gaps. */
export function findActiveWord(flat: FlatWord[], t: number): FlatWord | null {
  let lo = 0
  let hi = flat.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (flat[mid].start <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans >= 0 && t < flat[ans].end ? flat[ans] : null
}
