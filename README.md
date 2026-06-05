# Local Transcribe

Private, on-device speech-to-text. Drop in audio/video → get a timestamped, editable
transcript powered by **Whisper running entirely in your browser** (whisper.cpp → WASM).
No uploads, no servers, no accounts. Your audio and transcripts never leave the tab.

## Run

```bash
pnpm install      # also copies ffmpeg core + coi-serviceworker into public/
pnpm dev          # http://localhost:5173  (sets COOP/COEP headers for threads)
pnpm build && pnpm preview   # production build
```

> The dev/preview servers set the cross-origin isolation headers required for
> `SharedArrayBuffer` (multi-threaded WASM). For static hosting, serve with
> `COOP: same-origin` + `COEP: require-corp`, or rely on the bundled
> `coi-serviceworker` fallback (already wired in `index.html`).

## How it works

| Concern | Choice |
|---|---|
| Inference | **Transformers.js** (ONNX, WebGPU + WASM fallback) — ADR-0007 (supersedes ADR-0001) |
| Audio decode | `ffmpeg.wasm` → 16 kHz mono PCM — ADR-0002 |
| Models | ONNX Catalog by HF id + custom-id Sideload, from HuggingFace — ADR-0006/0007 |
| Capability | Estimated (heuristics + benchmark), never gated except Fit-check — ADR-0003 |
| Transcript | Immutable ASR layer + derived Edit layer — ADR-0005 |
| Storage | Engine caches models (IndexedDB); history/settings via `idb`; transient media only |
| Backend | None. Pure static + zero telemetry — ADR-0004 |

Design docs: [`CONTEXT.md`](./CONTEXT.md) (glossary) · [`docs/adr/`](./docs/adr) (decisions) ·
[`docs/v1-scope.md`](./docs/v1-scope.md) (scope & build plan).

## Features

- Model-first onboarding with a **device-adaptive Recommended Model** + per-language quality badges
- **Model management** from the Catalog: switch the Active Model instantly, add more, or **Evict** any model to reclaim its storage — your transcripts stay (ADR-0008)
- **Cancellable downloads** with honest, monotonic progress (file/MB labelled; no fake resume) (ADR-0008)
- File transcription (any container via ffmpeg) with live streaming segments + ETA
- **Live mic** mode (interim preview → final transcript)
- Transcript **editor**: click-to-seek, word highlight, in-place fix, delete, insert,
  split/merge, find & replace — all on the Edit layer, autosaved
- **Undo / redo time machine** for edits (⌘Z / ⇧⌘Z) — a per-transcript history kept in the zustand store
- **Original vs Corrected** toggle: flips both the on-screen transcript and exports between your edits and the read-only machine original
- Low-confidence words underlined (confidence preserved from the ASR layer)
- Exports: TXT · SRT · VTT · JSON · Markdown (raw or corrected)
- Local **history** (transcript-only) + one-click wipe-everything
- Installable **PWA**

## Engine notes / current limits

- Engine: **Transformers.js (ONNX)** on **WebGPU** where available, WASM fallback (ADR-0007).
- Catalog spans `tiny → small` (±`.en`) plus **`large-v3-turbo`** (WebGPU-gated). **Advanced → "load any HuggingFace model"** accepts any HF id shipping ONNX weights (language fine-tunes, distil, etc.).
- Per-token **confidence isn't exposed** by this engine, so the low-confidence highlight is inert.
- The Transcript view **isolates the playback highlight** (memoized segments + a change-only active-word store) so long transcripts stay at full framerate; list windowing is deferred behind a length threshold (ADR-0009). **react-scan** is wired as a dev-only profiler and stripped from the prod bundle.
- Downloads **can't resume** — the Cache API has no range support, so cancelling Evicts the partial and a retry restarts (ADR-0008).
- Inference runs on the **main thread** — moving it to a Web Worker is a known follow-up.
- Live mic uses bounded interim re-transcription, not full VAD endpointing (deferred branch).

## Stack

React 19 · Vite 8 · TypeScript · Tailwind v4 · shadcn-style UI (Radix) · zustand · zod · idb
