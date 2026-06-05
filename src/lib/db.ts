import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { TranscriptRecord } from './types'

export interface MediaAsset {
  id: string
  blob: Blob
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: number
}

interface LTDB extends DBSchema {
  transcripts: {
    key: string
    value: TranscriptRecord
    indexes: { 'by-updated': number }
  }
  media: {
    key: string
    value: MediaAsset
  }
  settings: { key: string; value: unknown }
}

let dbp: Promise<IDBPDatabase<LTDB>> | null = null

function db(): Promise<IDBPDatabase<LTDB>> {
  if (!dbp) {
    dbp = openDB<LTDB>('local-transcribe', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const t = d.createObjectStore('transcripts', { keyPath: 'id' })
          t.createIndex('by-updated', 'updatedAt')
          d.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          d.createObjectStore('media', { keyPath: 'id' })
        }
      },
    })
  }
  return dbp
}

export async function saveTranscript(r: TranscriptRecord): Promise<void> {
  await (await db()).put('transcripts', r)
}

async function getTranscript(id: string): Promise<TranscriptRecord | undefined> {
  return (await db()).get('transcripts', id)
}

export async function listTranscripts(): Promise<TranscriptRecord[]> {
  const all = await (await db()).getAllFromIndex('transcripts', 'by-updated')
  return all.reverse() // newest first
}

export async function deleteTranscript(id: string): Promise<void> {
  const d = await db()
  const rec = await d.get('transcripts', id)
  await d.delete('transcripts', id)
  const mediaId = rec?.source.mediaId
  if (!mediaId) return
  const remaining = await d.getAll('transcripts')
  if (!remaining.some((r) => r.source.mediaId === mediaId)) {
    await d.delete('media', mediaId)
  }
}

export async function saveMediaAsset(asset: MediaAsset): Promise<void> {
  await (await db()).put('media', asset)
}

export async function getMediaAsset(id: string): Promise<MediaAsset | undefined> {
  return (await db()).get('media', id)
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db()).get('settings', key) as Promise<T | undefined>
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', value, key)
}

/** Wipe ALL local data: our history/settings, the engine's cached models, and Cache Storage. */
export async function wipeEverything(): Promise<void> {
  const d = await db()
  await d.clear('transcripts')
  await d.clear('media')
  await d.clear('settings')
  try {
    indexedDB.deleteDatabase('whisper-web')
  } catch {
    /* ignore */
  }
  try {
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k)
    }
  } catch {
    /* ignore */
  }
}
