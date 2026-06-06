# No backend: pure static web app, zero telemetry, content-scoped privacy

**Status:** accepted

The web app ships as a **static SPA + service worker with no server of its own**. All transcription compute is client-side; Models are fetched directly from HuggingFace; there is **no analytics or telemetry of any kind** in v1. The privacy guarantee is therefore *content-scoped and absolute* — **audio, video, and Transcripts never leave the device** — while the single disclosed network egress is the first-time model fetch from HuggingFace (user IP + model name only).

## Consequences

- Hostable on any static host; nothing to operate, scale, or secure server-side. "There is no server" is a literal, defensible marketing claim.
- We are **blind to usage and errors by design.** Revisit only via *self-hosted, content-exempt* privacy analytics if product insight ever justifies the infra — never third-party scripts (COEP + the trust story both forbid it).
- Public messaging must say "your audio, video, and transcripts never leave your device," **not** "nothing touches the network" — the HF model fetch must be disclosed, not hidden.
- Native Translate is split out by ADR-0012 and needs its own privacy/deployment decision if it diverges from the same content-scoped guarantee.
- Adding any backend later is a deliberate reversal of this trust posture and should get its own superseding ADR.
