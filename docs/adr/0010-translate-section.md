# Translate Section: one multi-task engine, text-MT Models, and platform (not bundled) voices

**Status:** proposed — extends [ADR-0006](./0006-model-catalog.md) (Catalog), [ADR-0008](./0008-model-lifecycle-management.md) (lifecycle), builds on [ADR-0007](./0007-switch-to-transformers-js.md) (Transformers.js)

The app is being rebranded from "Local Transcribe" to a generic voice toolkit (*working name* "VOICE AI") with two **Sections**: the existing **Transcribe** and a new **Translate** on its own path. Translate is a travel phrasebook-style tool: **type a phrase, get it back as on-screen text and spoken aloud** in another language, both directions, no microphone. The motivating case is buying things in Hong Kong (English ↔ Cantonese), extending to Mandarin, Japanese, Korean, Thai, Malay — all running **on a Samsung S23-class phone**, and **meaning-first, not word-for-word**.

## Decision

1. **Generalize, don't fork.** Add a `Task` dimension (`'transcription' | 'translation'`) to the Model/Catalog so Translation Models (NLLB, Qwen) reuse the existing Provisioning, cancellable Download, **Evict**, provisioned-index, and capability machinery (ADR-0006/0008). The engine's hard-coded `'automatic-speech-recognition'` pipeline becomes Task-dispatched (`translation` / `text-generation`). One engine, two Sections.
2. **Translate = MT → text → Built-in Voice.** No ASR in the Translate path (the user chose text input). Default Translation Model **`Xenova/nllb-200-distilled-600M`** (200 languages incl. Cantonese `yue_Hant`, meaning-faithful); offer **`onnx-community/Qwen2.5-0.5B-Instruct`** as a "more natural / tone-aware (experimental)" alternative.
3. **Speech output is a platform capability, not a Model.** Spoken output uses the device's own voices via the Web Speech API (`speechSynthesis`), filtered to offline `localService` voices. A **Voice Check** enumerates available voices and prompts the user to install a missing language pack.
4. **Defer Hokkien/Fukkien.** No on-device MT covers it; route Singapore/Malaysia through Mandarin + Malay + English instead of shipping something bad.

## Why these choices

- **Cantonese speech is the binding constraint.** MMS-TTS has **no `yue` voice** and Kokoro-82M is **English-only**, so no *bundled* model can speak Cantonese on-device. The phone's own `zh-HK` voice (Web Speech) is the only path — hence TTS-as-platform-capability rather than a Catalog Model. This keeps the download light and preserves the privacy/offline promise (no voice data leaves the device when filtered to `localService`).
- **NLLB over Qwen as default** — breadth + reliability for a travel tool that must not produce nonsense; Qwen is the upgrade for register/tone, gated like other heavy Models. Both are swappable/Evictable, so the default is low-stakes.
- **Generalize over fork** — the Catalog, Evict, honest-progress Download, and capability check are exactly what a second Model Task needs; duplicating them would double the surface for no benefit.

## Why not the alternatives

- **SeamlessM4T v2** (best Cantonese, only real Hokkien, direct speech↔speech) — ~2.3 B; the ONNX port targets server ONNXRuntime, not a mobile browser. Reserved for an eventual backend/native app, not v1.
- **Bundled MMS-TTS / Kokoro for output** — would guarantee offline voice, but **misses Cantonese entirely** (the one language most needed) while adding download weight everywhere else. A bundled-voice path that can't speak your primary language is the wrong default.
- **Adding mic/ASR to Translate now** — explicitly out per the user; the Whisper engine already exists, so speech-input can be bolted on later without rework. Reverse-direction ("vice-versa") means the other party types, or hands the phone over, for v1.

## Consequences

- `CatalogModel` gains a `task` field (default `'transcription'` to keep existing entries valid); `recommendModel` and the Fit-check run per-Section. Custom **Sideload-by-id** extends to MT repos.
- The engine keeps **one warm pipeline**; switching Sections may dispose/reload (an MT Model and a Whisper Model are different pipelines). Memory budget assumes **not** holding both resident on mobile.
- New **Voice Check** UI in the Translate Section (parallel to the capability check). Cantonese spoken output is **best-effort**: works only if the user installs a `zh-HK` pack — surfaced honestly rather than silently failing.
- Privacy guarantee (ADR-0004) holds: MT runs on-device; voices filtered to `localService`. The one caveat to document is that a user who *opts into* a cloud voice would send text to that OS vendor.

## Open (to confirm before build)

- **Routing**: the app currently uses a `view` state-machine in the store, not URLs. A second Section on "a different path" argues for lightweight hash routing (`#/transcribe`, `#/translate`) for PWA back-button/bookmark behaviour — vs. just extending the `view` enum. *Leaning hash-router; reversible.*
- **Brand name**: "VOICE AI" is a placeholder (generic → hard to make searchable/ownable).
- **MT default**: NLLB vs Qwen as the *Recommended* Translation Model (above leans NLLB).
