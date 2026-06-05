# Curated Models — Transcribe + Translate

A grounded shortlist of HuggingFace models for both Sections, filtered for **on-device use on a mid-range phone (Samsung S23 class)** and **meaning-first (not literal) translation**. Everything here runs in the browser via Transformers.js (ONNX, WebGPU → WASM fallback), the same engine the app already uses.

> The hard constraint is a three-way squeeze:
> **"runs on the S23 browser"** (small/quantized only) ✕ **"Cantonese + Hokkien"** (the good models are big) ✕ **"conveys tone, not word-for-word"** (favours larger neural models / LLMs). The picks below are where those three overlap; the honest gaps are called out explicitly.

---

## 1. Transcribe (speech → text) — Whisper family

Already supported by the engine; these are Catalog drop-ins.

| Need | HF id | ~Size | Device | Notes |
|---|---|---|---|---|
| Default multilingual | `Xenova/whisper-base` · `Xenova/whisper-small` | 210 / 480 MB | WASM ok | Handles zh/ja/ko/th well at `small`+ |
| English, fast | `Xenova/whisper-base.en` · `Xenova/whisper-small.en` | 210 / 480 MB | WASM ok | `.en` builds, sharper on English |
| Max multilingual | `onnx-community/whisper-large-v3-turbo_timestamped` | ~1.5 GB | **WebGPU only** | Desktop / high-end tier. Must be the **`_timestamped`** export (plain repo lacks cross-attentions → word timestamps throw). Load `encoder_model`=**fp16** + `decoder_model_merged`=**q4**; the fp32 encoder drags in a 2.4 GB `.onnx_data` |
| **Cantonese ASR** | `alvanlii/whisper-small-cantonese` | ~480 MB | WASM ok | Common Voice `yue` fine-tune — the realistic on-device pick |
| Cantonese, lower latency | `alvanlii/distil-whisper-small-cantonese` | ~330 MB | WASM ok | Distilled = faster on the S23 |
| Cantonese, max quality | `khleeloo/whisper-large-v3-cantonese` · `simonl0909/whisper-large-v2-cantonese` | ~1.5 GB | **WebGPU only** | Desktop tier |

Note: base multilingual Whisper can already do **Cantonese speech → English text** today (its `translate` task). But Whisper's translate **only ever targets English** — it can never produce English → Cantonese. That asymmetry is the whole reason Translate needs its own Section with a real MT Model, not a Whisper flag.

---

## 2. Translate (text → text) — on-device MT Models

**Tier A — ship on the S23 now:**

| HF id | ~Size (quant) | Best for | Trade-off |
|---|---|---|---|
| `Xenova/nllb-200-distilled-600M` | ~600 MB (q8) | **Breadth + meaning-faithful.** 200 languages incl. Cantonese | Heaviest Tier-A pick on mobile; no explicit tone control |
| `onnx-community/Qwen2.5-0.5B-Instruct` | ~0.5 B (q4) | **Tone/register-aware + strongest CJK** (prompt "polite/casual") | Small LLM → can hallucinate on colloquial Cantonese |
| Helsinki-NLP **Opus-MT** pairs, e.g. `Xenova/opus-mt-en-zh`, `Xenova/opus-mt-zh-en` | ~75–300 MB each | **Tiny + fast** for one fixed pair | One Model per direction; weak Cantonese/Hokkien |

**NLLB FLORES-200 codes** (for whoever wires it): English `eng_Latn` · Cantonese `yue_Hant` · Mandarin `zho_Hans`/`zho_Hant` · Japanese `jpn_Jpan` · Korean `kor_Hang` · Thai `tha_Thai` · Malay `zsm_Latn`.

**Recommended default:** `nllb-200-distilled-600M` for coverage + reliability; offer `Qwen2.5-0.5B-Instruct` as a "more natural / tone-aware (experimental)" alternative — the same Recommended-Model + alternatives pattern the Catalog already uses.

---

## 3. Speech output — Built-in Voices, not a Model

Decision: spoken output uses the **phone's own voices** via the Web Speech API (`speechSynthesis`), filtered to offline `localService` voices. Nothing is bundled or downloaded. Reasons, grounded in research:

- **MMS-TTS** (Meta, ~1,100 languages) — **has no Cantonese (`yue`) voice.** It even ships Min Nan (`mms-tts-nan`) and Korean (`mms-tts-kor`), but Cantonese is a known gap.
- **Kokoro-82M** (best small browser TTS) — **English-only** today; multilingual still in progress.
- **Web Speech API** — the **only** path that can speak Cantonese on the S23, *if* a `zh-HK` voice is installed. Availability is per-device; some voices are cloud-backed (filter to `localService` to stay private/offline).

A **Voice Check** (enumerate `speechSynthesis.getVoices()`) confirms what the device can speak and nudges the user to install a missing pack — the speech-side analogue of the capability/Fit-check.

---

## 4. Off-device tier — best quality, but NOT on the S23 browser

| HF id | Why it's great | Why it's out |
|---|---|---|
| `facebook/seamless-m4t-v2-large` | Direct speech↔speech, best Cantonese, and the **only** credible **Hokkien** path (grew out of Meta's Hokkien speech-translation work) | ~2.3 B; the ONNX port (`fabio-sim/Fast-SeamlessM4T-ONNX`) targets server ONNXRuntime, not mobile browsers |

Reserved for an eventual tiny backend or a native app.

---

## 5. Coverage & honest verdicts (English ↔ target)

| Destination / language | Text MT on-device | Spoken output on-device | Verdict |
|---|---|---|---|
| Hong Kong — **Cantonese** | ✅ NLLB `yue_Hant` / Qwen | ⚠️ only via installed `zh-HK` Built-in Voice | **Ship.** Strong text; speech depends on a voice pack |
| China / Taiwan — **Mandarin** | ✅ NLLB / Qwen / Opus | ✅ common `zh-CN`/`zh-TW` voices | **Ship** |
| Japan — **Japanese** | ✅ | ✅ `ja-JP` common | **Ship** |
| Korea — **Korean** | ✅ | ✅ `ko-KR` common | **Ship** |
| Thailand — **Thai** | ✅ | ⚠️ `th-TH` varies | **Ship** (voice may need install) |
| Malaysia / Singapore — **Malay** | ✅ NLLB `zsm_Latn` | ⚠️ `ms-MY` varies | **Ship** |
| Singapore — **Hokkien / Fukkien** | ❌ no on-device MT (NLLB lacks it) | (MMS `nan` *could* speak it) | **Defer.** Route Singapore/Malaysia via Mandarin + Malay + English |

**On "not literal":** every Tier-A Model translates *meaning*, not word-for-word, so the bar is cleared. But *register/politeness* control is realistically only via **Qwen prompting** (best-effort). Fully *expressive* tone-preserving translation (SeamlessExpressive) is off-device.

---

## Sources

- [Transformers.js docs](https://huggingface.co/docs/transformers.js/index) · [Transformers.js v4 / WebGPU](https://github.com/huggingface/transformers.js/)
- MT: [`Xenova/nllb-200-distilled-600M`](https://huggingface.co/Xenova/nllb-200-distilled-600M) · [NLLB-200 (Meta)](https://ai.meta.com/research/no-language-left-behind/) · [`onnx-community/Qwen2.5-1.5B`](https://huggingface.co/onnx-community/Qwen2.5-1.5B) · Opus-MT (Helsinki-NLP)
- Cantonese ASR: [`alvanlii/whisper-small-cantonese`](https://huggingface.co/alvanlii/whisper-small-cantonese) · [`alvanlii/distil-whisper-small-cantonese`](https://huggingface.co/alvanlii/distil-whisper-small-cantonese) · [`khleeloo/whisper-large-v3-cantonese`](https://huggingface.co/khleeloo/whisper-large-v3-cantonese)
- TTS: [`facebook/mms-tts`](https://huggingface.co/facebook/mms-tts) (no `yue`) · [Kokoro TTS (Xenova)](https://huggingface.co/posts/Xenova/503648859052804) · [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- Off-device: [`facebook/seamless-m4t-v2-large`](https://huggingface.co/facebook/seamless-m4t-v2-large) · [Fast-SeamlessM4T-ONNX](https://github.com/fabio-sim/Fast-SeamlessM4T-ONNX)
