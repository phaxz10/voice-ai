# Native Translate offline-first with optional frontier cloud integration

**Status:** accepted

Native Translate is offline-first: local ASR, local Translation, local Conversation Log, and local settings are the default product path. The app may also support **Frontier Cloud Integration** as an optional user-configured **Translation Provider** for higher-quality Translation, but cloud calls must not become the required path for a normal Spoken Turn.

## Consequences

- The resident local ASR + MT pipeline remains the first implementation gate and the baseline user experience.
- When Frontier Cloud Integration is selected, only the Translation task moves to a frontier model. Transcription and natural audio output stay local.
- The frontier Translation Provider receives recognized or typed text, Speaker Side, Active Travel Language, and any needed tone/context instructions; it returns translated text.
- Frontier providers are configurable. Do not hardcode one vendor or one model name into the product architecture.
- Translation Provider selection is conversation-level, not per-turn. Every Me/Them Spoken Turn and typed fallback uses the Active Translation Provider until the user changes it.
- The UI must make the Active Translation Provider understandable: local by default, frontier only when selected, with a small provider badge on the Current Turn.
