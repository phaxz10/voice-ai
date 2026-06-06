# Native Translate first spike gate

**Status:** accepted

The first Native Translate spike must prove complete **Spoken Turns** on the Samsung S23 Ultra with a selectable **Active Travel Language**: capture speech with **Hold-to-Talk**, transcribe it with a resident ASR session, translate it with a resident Translation session, show both texts, and capture timing plus resident-memory metrics. It also includes a minimal typed fallback that uses the same Me/Them direction model and resident Translation session. Polished UI, voice output, and higher-quality model experiments wait until this baseline proves that resident ASR + MT can survive repeated turns without session swapping.

## Consequences

- Flutter UI for the spike can stay minimal; the native inference core and measurements are the point.
- The first spike is local-only. Frontier Cloud Integration and provider switching wait until resident local ASR + local MT is stable and measured.
- Prefer one resident multilingual local ASR Model for all selected Travel Languages. Use separate ASR Models only if the multilingual ASR Model fails quality or runtime gates.
- Prefer one resident multilingual local Translation Model for all selected Travel Languages. Use separate pair-specific Translation Models only if the multilingual Model fails quality or runtime gates.
- The first speech input controls are two Hold-to-Talk buttons: **Me** captures English and translates to the Active Travel Language; **Them** captures the Active Travel Language and translates back to English.
- Typed fallback is included in the first spike as a minimal text box plus the same **Me** and **Them** actions; typed text does not auto-run. The user enters text, then presses Me or Them to commit direction. It skips ASR but uses the same Translation session, language selector, result display, and metrics path.
- The first spike includes an Active Travel Language selector so the same Me/Them controls can cover Cantonese, Mandarin, Japanese, Thai, and other travel languages the selected Model supports.
- The primary screen focuses on the **Current Turn** only. Prior turns are kept in a hidden **Conversation Log** that the user can open to revisit the conversation.
- The Conversation Log persists locally on the device. It is not cloud-synced, not uploaded, not telemetry, and not the main interaction surface for the first spike.
- Press and hold to capture, release to commit the Spoken Turn and immediately start the ASR → MT pipeline.
- Turn latency is measured from Hold-to-Talk release to translated text visible on screen.
- For the hard Cantonese gate, warm repeated-turn latency must be p50 under 2.5 seconds and p95 under 5 seconds for short travel phrases.
- The hard Cantonese gate runs at least 30 warm Spoken Turns: 15 Me turns and 15 Them turns.
- Resident memory is recorded before and after each Spoken Turn and typed fallback.
- The spike hard-fails if app resident memory exceeds 6 GB during the 30-turn Cantonese gate.
- The spike hard-fails if Android kills the app or if the ASR or Translation session must be unloaded/evicted between turns.
- The spike hard-fails if the S23 Ultra enters sustained thermal throttling during the 30-turn Cantonese gate.
- The 30-turn Cantonese gate uses a fixed benchmark phrase pack: 15 English phrases and 15 Cantonese phrases covering buying, directions, food, hotel, transport, and polite clarification.
- Each benchmark turn gets a simple quality check: meaning preserved, direction correct, and travel-useful. Fast nonsense does not pass.
- The Cantonese quality gate requires at least 27 of 30 benchmark turns to be acceptable, with zero direction failures.
- There is no cancel/retry window between release and inference. Retry is a separate action after the Translation result or failure.
- Cantonese is the hard pass/fail Travel Language Pair for the first spike.
- Mandarin, Japanese, Thai, and other selected languages are smoke tests for selector/model routing, not full quality gates yet.
- Each selected Travel Language Pair is bidirectional; proving only English → selected language is not enough.
- Automatic source-language detection and generic language-swap controls are out of scope for the first spike.
- Automatic voice activity detection and separate start/stop recording controls are out of scope for the first spike.
- The benchmark phrase pack comes from short travel scenarios, not generic model benchmarks.
- Voice output is not part of the first gate; add it after the resident ASR + MT path is stable.
