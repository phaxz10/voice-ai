# Audio/video is decoded with ffmpeg.wasm, not the native WebAudio stack

**Status:** accepted

Whisper needs 16 kHz mono PCM from arbitrary user files. We decode exclusively with **ffmpeg.wasm** (multi-threaded core, enabled by the cross-origin isolation from ADR-0001) rather than the browser's `decodeAudioData`/`OfflineAudioContext`. This buys exact desktop parity (`-ar 16000 -ac 1`) and universal container/codec coverage (incl. `.mkv`, `.avi`, exotic codecs the browser can't decode), at the cost of a ~30 MB one-time (cached) WASM payload and slower decode for small files.

## Consequences

- The ~30 MB ffmpeg core is fetched once and persisted (Cache API), so the cost is paid on first use, not per transcription.
- Very large inputs must be mounted via **WORKERFS** (reference the `File` directly) instead of being written into MEMFS, to avoid OOM-ing the tab.
- ffmpeg runs in a Web Worker, keeping decode off the main thread.
