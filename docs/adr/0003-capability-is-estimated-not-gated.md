# Device capability is estimated (benchmark-driven), never gated

**Status:** accepted

We never show a binary "your device is/isn't powerful enough" gate — capability is unknowable from feature flags alone and a gate both wrongly blocks capable devices and wrongly admits slow ones. Instead: (1) cheap signals (`hardwareConcurrency`, `deviceMemory`, mobile flag, `storage.estimate()`) give an instant first guess and Capability Tier; (2) the **only** hard block is the **Fit-check** — refuse a Model whose memory/storage footprint won't fit, because that is a real crash; (3) a short on-device benchmark measures the device's **Realtime Factor**, which we multiply by the file's duration to show a truthful **ETA** before any long job. The **Recommended Model is computed per device**, not hardcoded.

## Consequences

- A few seconds of benchmark runs before the first/long jobs; in exchange the ETA reflects the device's *current* thermal/load state, not a guess.
- The Catalog's recommendation differs across devices (a phone may get `base`, a laptop `large-v3-turbo`).
- `deviceMemory` is coarse and missing in Safari/Firefox, so it informs but never decides — the benchmark and Fit-check carry the real weight.
