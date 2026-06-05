# VOICE AI

*(working name — "VOICE AI" is a placeholder; see **Brand**)* A local-first, in-browser **voice toolkit**. Everything runs on the user's own device; no audio, text, or file ever leaves the client. Free, installable (PWA), works offline once a Model is present. The product has two **Sections** that share one engine, Catalog, capability check, and privacy guarantee:

- **Transcribe** — audio/video → a timestamped, editable Transcript (the original app).
- **Translate** — type a phrase → get it back as text **and spoken aloud** in another language, for back-and-forth conversation (e.g. travel). No microphone: text in, text + voice out.

**Brand** *(open)*: "VOICE AI" is deliberately generic — but so generic it is hard to make ownable or searchable. Treat as a placeholder pending a naming pass before launch.

## Language

**Section**:
One of the two top-level tools — **Transcribe** or **Translate** — each on its own path. Sections share the engine, Catalog, Provisioning/Evict, and capability machinery but are distinct flows with distinct Models.
_Avoid_: tab, page, mode (those name UI mechanics, not the tool).

**Model**:
An ONNX checkpoint loaded by HuggingFace repo id, powering exactly one **Task**. Either a **Transcription Model** (a Whisper ASR checkpoint, e.g. `Xenova/whisper-small`) or a **Translation Model** (a text machine-translation checkpoint, e.g. `Xenova/nllb-200-distilled-600M`). Must be present locally (Provisioned) before its Task can run.
_Avoid_: weights, AI, the network.

**Task**:
What a Model does — **Transcription** (speech → text) or **Translation** (text → text). A Model serves one Task; Catalog, Provisioning, Evict, and capability machinery are shared across both.
_Avoid_: type, mode, pipeline (that names the engine internal, not the role).

**Provision** (a Model):
To make a Model available in the browser's cache so it can be used offline. Happens by Download (from the Catalog) or Sideload (any HF id).
_Avoid_: load, install (those name the mechanics, not the act).

**Download** (a Model):
Provisioning by picking a Model from the Catalog; the engine fetches its ONNX weights from HuggingFace and caches them on first use.
_Avoid_: using "sideload" for this — reserve that for a user-supplied HF id.

**Sideload** (a Model):
Provisioning by supplying any HuggingFace repo id that ships ONNX weights (e.g. a language-specialized fine-tune) via the "load custom model" field.
_Avoid_: upload (nothing goes to a server); "BYO file" (it's an id, not a file).

**Evict** (a Model):
Removing a provisioned Model's weights from the device to free storage — the inverse of Provision. The Model stays in the Catalog and can be Downloaded again; Transcripts and settings are untouched.
_Avoid_: delete (reserve for Transcripts/data), uninstall, "clear cache" (that names the mechanism, not the act).

**Model Catalog**:
The curated set of Models the app offers for Download, each tagged with its size and rough device requirements.
_Avoid_: model list, model store.

**Recommended Model**:
The Model the app suggests as the best default *for the current device and Primary Language*, computed from Fit-check + benchmark ×RT + Language Profile — not a fixed pick. The user still chooses.
_Avoid_: default model.

**Active Model**:
The single provisioned Model currently selected to run transcription. The user changes it from the Catalog; switching is immediate when the target is already provisioned.
_Avoid_: current model, selected model (those name UI state, not the role); default model (that's the Recommended Model).

**Language Profile**:
Per-Model metadata describing which languages it handles and how well (multilingual vs English-only, plus curated quality ratings), used to render badges and steer the Recommended Model.
_Avoid_: language list, locale support.

**Primary Language**:
The language the user declares at onboarding, used to steer the Recommended Model (e.g. English → an `.en` Model).
_Avoid_: locale, default language.

**Capability Tier**:
A coarse classification of the current device's transcription ability (e.g. Low / Medium / High), derived from cheap signals plus the benchmark, used to pick the Recommended Model and shape warnings.
_Avoid_: device class, performance level.

**Realtime Factor** (×RT):
How many seconds of audio a device transcribes per second of wall-clock with a given Model (e.g. 3×RT ⇒ a 10-minute file in ~3.3 minutes). Measured by the benchmark; the basis for every ETA.
_Avoid_: speed, throughput.

**Fit-check**:
The hard pre-Download test that a Model's memory + storage footprint fits the device. The only hard block in the app — failing it would mean a real crash.
_Avoid_: capability check (that's the soft, ETA-based assessment).

**Engine**:
The warm Transformers.js ASR pipeline with the active Model loaded on the chosen device (WebGPU or WASM), kept alive across both transcription modes.
_Avoid_: worker, runner, backend (there is no server backend).

**Transcript**:
The timestamped, editable text result of transcribing audio. First-class and mutable — users correct it and re-export; edits persist locally.
_Avoid_: output, captions (SRT/VTT are *export formats* of a Transcript, not the Transcript itself).

**Transcription Job**:
A single file → Transcript run — the upload/batch mode.
_Avoid_: task, upload.

**Live Session**:
A microphone → Transcript run that streams interim results in near real-time — the live mode.
_Avoid_: recording, stream.

**Translate** (the Section) / **Translation** (its result):
Typing a phrase in one language and getting it back as on-screen text **and** synthesized speech in another, to hold a back-and-forth conversation. Powered by a Translation Model (text → text) plus a **Built-in Voice** for the spoken output. Conversational and meaning-first (not literal); distinct from a Transcript.
_Not_: Whisper's `translate` task (`AsrLayer.task`), which only goes *foreign speech → English text* and lives in the **Transcribe** Section. The **Translate** Section is text-first and bidirectional.
_Avoid_: interpret, localize.

**Built-in Voice**:
A text-to-speech voice supplied by the user's own device/OS via the browser Web Speech API, used to speak a Translation aloud. The app never bundles or downloads voices and prefers offline (`localService`) voices so nothing leaves the device. Availability is per-device — notably Cantonese needs a `zh-HK` pack the user installs in OS settings.
_Avoid_: TTS Model, synth (a Built-in Voice is explicitly *not* a Provisioned Model).

**Voice Check**:
The runtime probe of which Built-in Voices the device exposes for the wanted languages — used to confirm spoken output will work and to prompt installing a missing language pack. The speech-side analogue of the Fit-check.
_Avoid_: voice list.

**Segment**:
A phrase-level unit of a Transcript (~a sentence) with start/end times, containing Words. What Whisper emits natively and what exports like SRT are built from.
_Avoid_: line, caption, phrase.

**Word**:
The atomic timestamped unit nested in a Segment — `{ text, start, end, confidence }`. Drives highlight, click-to-seek, and precise editing.
_Avoid_: token (a token is a model-internal sub-word fragment; one Word may merge several tokens).

**ASR Layer**:
The original, immutable transcription captured straight from the Engine (Segments → Words with timings + confidence). Never edited; the base every correction maps back to.
_Avoid_: raw transcript (it is a *layer* of a Transcript), source text.

**Edit Layer**:
The user-facing, mutable correction layer derived from the ASR Layer, mapping each edited Word back to its origin Word(s) for timing.
_Avoid_: overrides, diff, patch.
