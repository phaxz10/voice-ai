# Model lifecycle: switchable Active Model, per-model Eviction, cancellable Downloads

**Status:** accepted — extends [ADR-0006](./0006-model-catalog.md) / [ADR-0007](./0007-switch-to-transformers-js.md)

The app provisioned exactly one Model at onboarding and then stranded it: no way to switch the Active Model, no way to reclaim a Model's storage short of "Wipe everything", and no way to cancel a Download in flight (a mis-clicked 1.6 GB model just ran to completion). We make the model lifecycle fully manageable from the **Catalog** — the onboarding screen, now reachable any time by clicking the top-bar Active-Model badge — so the user can switch the **Active Model** instantly between provisioned Models, **Evict** any single Model to free its storage without touching Transcripts, and **Cancel** an in-progress Download.

## Decisions

- **Surface = the reused Catalog, not a new screen.** The existing onboarding Catalog becomes dual-purpose (first-run *and* change-model); the top-bar Active-Model badge opens it. Least new UI, and it is already the one place that renders every Model with Fit-check and language badges.
- **Provisioned tracking = index + reconcile.** A `provisionedModelIds` list in IndexedDB settings is the fast index that powers "Downloaded ✓ / Active" badges and instant switching; **Cache Storage is the source of truth**, reconciled on load so a browser-evicted entry self-corrects. Eviction deletes every Cache Storage entry whose request URL matches the Model's `hfId`.
- **Downloads are cancellable, not resumable.** An `AbortController` backs a Cancel control; cancel / error / navigating away aborts the fetch, **Evicts** any partial weights, and resets the Engine singleton to a clean retry. The Cache API has no HTTP range/resume, so a retry restarts from zero — we *say so* rather than fake a resume. Progress is made monotonic and labelled ("file X of Y", MB) so a healthy multi-file download never appears to run backward.

## Consequences

- Introduces a coupling to Transformers.js's cache layout + the HuggingFace URL scheme: Eviction matches cached requests by `hfId` substring, so if the library changes how it names/keys cached weights, the matcher must follow. The provisioned index is a *hint*, never trusted without reconciliation against Cache Storage.
- **"Wipe everything" (ADR-0004) stays the nuclear option; Eviction is the surgical one.** Transcripts and settings are never collateral damage of freeing a model.
- One mechanism, two callers: the per-model Evict primitive is reused for the interrupted-Download cleanup — purging a broken partial is just an Eviction of the model being fetched.
- **True resume rejected for this pass** (custom per-shard fetch+cache) as brittle against the high-level pipeline loader and high-cost; reserved as a later enhancement.
