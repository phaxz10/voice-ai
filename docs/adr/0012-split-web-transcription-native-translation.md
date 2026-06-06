# Split web transcription from native mobile translation

**Status:** accepted

The existing web app stays focused on **Web Transcribe** only: local-first browser transcription, transcript editing, history, exports, and transcription Model management. Spoken travel translation moves to a separate **Native Translate** mobile app because repeated conversation turns need resident ASR, Translation, and eventually voice sessions on the Samsung S23 Ultra; the PWA already works well for transcription but is the wrong place to optimize simultaneous mobile inference.

## Consequences

- Remove the Translate Section, translation Catalog entries, translation Engine paths, and browser voice output from this web app.
- Web routes stay transcription-oriented (`#/transcribe`, `#/models`, `#/history`); there is no `#/translate` route in this repo.
- Native Translate owns spoken and typed Translation, Travel Language Pair evaluation, resident-session memory budgets, voice output, and the S23 Ultra latency target.
- Translation model research can live as reference material, but it must not imply those Models are part of the web Catalog.
- The PWA remains a useful ASR benchmark and a proven transcription workflow, not a translation prototype.
