# Native Translate Flutter spike scaffold

**Status:** accepted

Native Translate starts as a `native_translate/` Flutter source subtree in this repo while the web app remains Web Transcribe. The scaffold owns the Flutter UI, domain model, local Conversation Log persistence, and a provider-neutral engine interface; Android-native audio capture and inference plug in through the `native_translate/inference` method channel.

## Consequences

- Flutter renders the Active Travel Language selector, Current Turn, hidden Conversation Log, typed fallback, and Me/Them Hold-to-Talk controls.
- Flutter does not perform inference. It calls a `NativeTranslateEngine` interface that can be backed by a fake engine for UI work or by the Android native inference core for the S23 Ultra spike.
- The first runnable source defaults to the fake engine via `USE_FAKE_ENGINE=true` because the Android native core is not wired yet.
- The Android platform folder is generated in `native_translate/android/` so the spike can build and run as an Android app immediately.
