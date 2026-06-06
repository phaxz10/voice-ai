# Translate Section: speech-first conversation, text-MT Models, and platform voices

**Status:** superseded by [ADR-0012](./0012-split-web-transcription-native-translation.md)

This ADR is retained as the exploration that led to the native split. Do not implement this as a Translate Section inside the web app; translation now belongs to the separate native mobile app.

The app is being rebranded from "Local Transcribe" to a generic voice toolkit (*working name* "VOICE AI") with two **Sections**: the existing **Transcribe** and a new **Translate** on its own path. Translate is a travel conversation tool: **speak or type a phrase, get it back as on-screen text and spoken aloud** in another language, both directions. Speech input is primary; text input remains the fallback. The motivating case is buying things in Hong Kong (English ↔ Cantonese), extending to Mandarin, Japanese, Korean, Thai, Malay — all running **on a Samsung S23-class phone**, and **meaning-first, not word-for-word**.

## Decision

1. **Generalize, don't fork.** Add a `Task` dimension (`'transcription' | 'translation'`) to the Model/Catalog so Translation Models (NLLB, Qwen) reuse the existing Provisioning, cancellable Download, **Evict**, provisioned-index, and capability machinery (ADR-0006/0008). The engine's hard-coded `'automatic-speech-recognition'` pipeline becomes Task-dispatched (`translation` / `text-generation`). One engine surface, two Sections.
2. **Translate = spoken or typed phrase → Translation → Built-in Voice.** A spoken turn first uses the active Transcription Model to hear the phrase, then the active Translation Model to translate it; typed fallback skips Transcription. Default Translation Model **`Xenova/nllb-200-distilled-600M`** (200 languages incl. Cantonese `yue_Hant`, meaning-faithful); offer an LLM-style model as a "more natural / tone-aware" alternative only if it fits the S23 Ultra resource budget and is smart enough on Travel Language Pair turns.
3. **Speech output starts as a platform capability, not a Model.** Spoken output uses the device's own local voices via the Web Speech API (`speechSynthesis`), filtered to offline `localService` voices. A **Voice Check** enumerates available voices and prompts the user to install a missing language pack. A more natural offline Voice Model is a stretch goal after ASR + MT latency is solved.
4. **Defer Hokkien/Fukkien.** No on-device MT covers it; route Singapore/Malaysia through Mandarin + Malay + English instead of shipping something bad.

## Why these choices

- **Cantonese speech output is the binding constraint.** MMS-TTS has **no `yue` voice** and Kokoro-82M is **English-only**, so no *bundled* model can speak Cantonese on-device. The phone's own local `zh-HK` voice (Web Speech) is the only path — hence TTS-as-platform-capability rather than a Catalog Model. This keeps the download light and preserves the privacy/offline promise.
- **NLLB as the dedicated-MT baseline** — breadth + reliability for a travel tool that must not produce nonsense. An LLM-style Translation Model is allowed if it fits the resource budget and beats the Travel Language Pair quality bar, especially for naturalness and meaning.
- **Travel Language Pairs over generic benchmarks** — model evaluation prioritizes short spoken turns for English ↔ Cantonese first, then Mandarin, Japanese, Korean, Thai, Malay, and Tagalog. Broad MT benchmark scores are secondary to these concrete travel cases.
- **Search-informed shortlist before local eval** — model candidates come from real-world offline translation/speech stacks and current mobile-runtime recommendations before we spend time benchmarking. The current shortlist is Large v3 Turbo or optimized Whisper-family ASR; NLLB 200 Distilled as the proven Cantonese-capable MT baseline; TranslateGemma 4B as the mobile-optimized high-quality translation candidate only if Cantonese/Hong Kong phrase quality is verified; SeamlessM4T as the direct speech-translation candidate if it can fit; Built-in Voice first, then Piper/Sherpa-style local TTS as a later Voice Model path.
- **Generalize over fork** — the Catalog, Evict, honest-progress Download, and capability check are exactly what a second Model Task needs; duplicating them would double the surface for no benefit.

## Why not the alternatives

- **SeamlessM4T v2** (best Cantonese, only real Hokkien, direct speech↔speech) — ~2.3 B; the ONNX port targets server ONNXRuntime, not a mobile browser. Reserved for an eventual backend/native app, not v1.
- **Bundled MMS-TTS / Kokoro for output** — would guarantee offline voice, but **misses Cantonese entirely** (the one language most needed) while adding download weight everywhere else. A bundled-voice path that can't speak your primary language is the wrong default.
- **Text-only Translate** — rejected because the product is now a spoken conversation tool. Text input remains as the fallback when speaking is awkward, unavailable, or fails.

## Consequences

- `CatalogModel` gains a `task` field (default `'transcription'` to keep existing entries valid); `recommendModel` and the Fit-check run per-Section. Custom **Sideload-by-id** extends to MT repos.
- A spoken turn needs both an active Transcription Model and an active Translation Model. The current engine keeps **one warm pipeline**; switching between ASR and MT may dispose/reload because the mobile memory budget still assumes **not** holding both resident.
- New **Voice Check** UI in the Translate Section (parallel to the capability check). Cantonese spoken output is **best-effort**: works only if the user installs a `zh-HK` pack — surfaced honestly rather than silently failing.
- Privacy guarantee (ADR-0004) holds: ASR and MT run on-device; voices are filtered to `localService`. Cloud voices are not offered in v1.
- The Samsung S23 Ultra is the benchmark phone for spoken Translate latency and stability. Migrating out of PWA is allowed only if a native spike shows both Models can stay resident for repeated Spoken Turns, eliminates the session-creation error, and makes a short spoken phrase reach translated speech at least 2x faster than the PWA after recording stops. Cold start and first-run model initialization are secondary; warm turn-to-turn conversation performance is the migration gate. The first resident pair to test is Large v3 Turbo for Transcription plus NLLB 200 Distilled for Translation, matching the current Catalog and the desired "good model for both" baseline. The spike tests the current PWA Models first to isolate runtime benefit; only after that may it test higher-quality mobile-capable Models if the phone has headroom. The S23 Ultra's ability to run Gemma-class Google AI Edge workloads is treated as confidence-building evidence that 4+ GB on-device inference is plausible, but not a substitute for testing simultaneous ASR + MT sessions. Disk size is not treated as resident memory: even quantized ~2 GB Models may allocate extra RAM/GPU buffers, decoder state, and runtime workspace. The spike records app resident memory, uses 6 GB as an upper warning line, and must survive repeated turns without OS kills, major thermal throttling, or cleanup/reload between turns. If extra headroom exists, spend it first on more natural, meaning-faithful Translation while keeping Transcription good enough for short spoken phrases.
- A Voice Model is not part of the native migration gate. Test it only after resident ASR + MT meet the repeated Spoken Turn target on the S23 Ultra.

## Open (to confirm before build)

- **Routing**: the app currently uses a `view` state-machine in the store, not URLs. A second Section on "a different path" argues for lightweight hash routing (`#/transcribe`, `#/translate`) for PWA back-button/bookmark behaviour — vs. just extending the `view` enum. *Leaning hash-router; reversible.*
- **Brand name**: "VOICE AI" is a placeholder (generic → hard to make searchable/ownable).
- **MT default**: NLLB vs Qwen as the *Recommended* Translation Model (above leans NLLB).
- **Native migration gate**: run a Flutter/native ONNX spike against the PWA and decide whether the measured S23 Ultra improvement justifies replacing the delivery model.
- **Mobile-capable upgrade Models**: after same-model benchmarking, identify whether the S23 Ultra can run higher-quality ASR and MT Models without losing the Spoken Turn latency target, using measured resident memory rather than download size as the limiting signal.
- **Search-informed model research**: keep checking real-world offline Android translator projects, GitHub usage, model cards, and mobile-runtime docs before adding benchmark candidates.
- **Offline natural Voice Model**: after ASR + MT meet the latency target, identify whether an offline Voice Model can improve naturalness without breaking resident-memory or turn-latency budgets.
