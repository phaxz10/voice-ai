# Switch the inference engine to Transformers.js (ONNX + WebGPU)

**Status:** accepted — **supersedes ADR-0001**

ADR-0001 chose whisper.cpp → WASM, implemented via `@remotion/whisper-web`. In practice that wrapper **hardcodes six models** (`tiny/base/small` ±`.en`) with no API to load anything larger or any community fine-tune, and whisper.cpp has no production in-browser WebGPU. Once "support many HF models — larger and language-specialized — and run fast" became a hard requirement, that engine no longer fit. We switch to **Transformers.js (`@huggingface/transformers`)**: ONNX Whisper models loaded **by HuggingFace id**, **WebGPU** acceleration with a WASM fallback, word-level timestamps, and automatic browser-Cache model storage.

## Why

- **Open model range.** Loads `large-v3-turbo`, `distil-whisper`, and the large ecosystem of pre-converted ONNX Whisper models (`onnx-community/`, `Xenova/`) by id — plus a **Sideload-by-id** path for any HF model shipping ONNX weights (e.g. a Tagalog/Cantonese fine-tune, once converted).
- **Speed + headroom.** WebGPU is far faster than our CPU-only WASM and makes larger models practical.

## Consequences

- **Model format is ONNX, not ggml.** The Catalog references HF ids; "download" = first pipeline load (Transformers.js caches to Cache Storage).
- **Corrects ADR-0006's ceiling claim.** medium / `large-v3-turbo` (quantized) run fine in-browser; only *full* large-v3 was ever the real ceiling. The Catalog now spans larger models, gated by **WebGPU availability**, not a blanket WASM limit.
- **Confidence is no longer exposed.** The ASR pipeline doesn't surface per-token probabilities, so the low-confidence highlight (ADR-0005) degrades to *unavailable* under this engine. The two-layer Transcript model otherwise stands — original word timestamps are still preserved.
- **Still standing:** ffmpeg.wasm decode (ADR-0002), two-layer Transcript (ADR-0005), no-backend/zero-telemetry (ADR-0004).
- **Cross-origin isolation** (ADR-0001's COOP/COEP) is retained — needed for WASM threads and harmless for WebGPU — but is no longer strictly required for the WebGPU path.
- `@remotion/whisper-web` is removed.
