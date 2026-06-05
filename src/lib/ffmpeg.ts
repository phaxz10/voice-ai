import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { CancelledError, throwIfCancelled } from './cancel'

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null
let progressCb: ((ratio: number) => void) | null = null

/**
 * ffmpeg.wasm (multi-threaded core, self-hosted from /public/ffmpeg so it loads
 * same-origin and satisfies COEP). Universal container/codec coverage (ADR-0002).
 */
async function getFFmpeg(signal?: AbortSignal): Promise<FFmpeg> {
  if (instance) return instance
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const ff = new FFmpeg()
    ff.on('progress', ({ progress }) => {
      if (progressCb) progressCb(Math.min(1, Math.max(0, progress)))
    })
    // Load the self-hosted core via blob URLs so Vite doesn't try to transform
    // the emscripten glue as an ES module (the `?import` interception bug).
    const base = '/ffmpeg'
    await ff.load(
      {
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript'),
      },
      { signal },
    )
    instance = ff
    return ff
  })()
  return loadPromise
}

function preloadFFmpeg(): Promise<unknown> {
  return getFFmpeg()
}

function isFFmpegLoaded(): boolean {
  return instance !== null
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(-60) || 'input'
}

function resetFFmpeg(ff: FFmpeg): void {
  ff.terminate()
  if (instance === ff) instance = null
  loadPromise = null
}

async function mountInput(
  ff: FFmpeg,
  file: File,
  signal?: AbortSignal,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const mountPoint = `/input_${Date.now()}`
  try {
    await ff.createDir(mountPoint, { signal })
    await ff.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint)
    return {
      path: `${mountPoint}/${file.name}`,
      cleanup: async () => {
        try {
          await ff.unmount(mountPoint)
          await ff.deleteDir(mountPoint)
        } catch {
          /* ignore */
        }
      },
    }
  } catch {
    try {
      await ff.deleteDir(mountPoint, { signal })
    } catch {
      /* ignore */
    }
  }

  const inName = 'in_' + sanitize(file.name)
  await ff.writeFile(inName, await fetchFile(file), { signal })
  return {
    path: inName,
    cleanup: async () => {
      try {
        await ff.deleteFile(inName)
      } catch {
        /* ignore */
      }
    },
  }
}

/** Decode any audio/video File into 16 kHz mono Float32 PCM. */
export async function decodeToFloat32(
  file: File,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ wave: Float32Array; durationSec: number }> {
  throwIfCancelled(signal, 'Transcription stopped')
  const ff = await getFFmpeg(signal)
  const outName = 'out.f32le'
  let input: { path: string; cleanup: () => Promise<void> } | null = null

  progressCb = onProgress ?? null
  const onAbort = () => resetFFmpeg(ff)
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    throwIfCancelled(signal, 'Transcription stopped')
    input = await mountInput(ff, file, signal)
    // Mono, 16 kHz, 32-bit float little-endian raw PCM (matches whisper input).
    await ff.exec(
      [
        '-i', input.path,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        outName,
      ],
      -1,
      { signal },
    )
    throwIfCancelled(signal, 'Transcription stopped')
    const data = (await ff.readFile(outName, 'binary', { signal })) as Uint8Array
    const usableLen = Math.floor(data.byteLength / 4)
    const view = new Float32Array(data.buffer, data.byteOffset, usableLen)
    // Copy out of ffmpeg-owned memory so it survives cleanup.
    const wave = new Float32Array(view)
    return { wave, durationSec: wave.length / 16000 }
  } catch (e) {
    if (signal?.aborted) throw new CancelledError('Transcription stopped')
    throw e
  } finally {
    signal?.removeEventListener('abort', onAbort)
    progressCb = null
    await input?.cleanup()
    try {
      await ff.deleteFile(outName)
    } catch {
      /* ignore */
    }
  }
}
