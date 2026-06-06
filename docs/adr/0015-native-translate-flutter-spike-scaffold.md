# Native Translate Flutter spike scaffold

**Status:** accepted

Native Translate starts as a `native_translate/` Flutter source subtree in this repo while the web app remains Web Transcribe. The scaffold owns the Flutter UI, domain model, local Conversation Log persistence, and a provider-neutral engine interface. The first device-engine APK uses Android speech recognition, downloadable ML Kit on-device translation models, and Android TTS while the heavier custom local inference core remains a later replacement behind the same interface.

## Consequences

- Flutter renders the Active Travel Language selector, Current Turn, hidden Conversation Log, typed fallback, and Me/Them Hold-to-Talk controls.
- Flutter calls a `NativeTranslateEngine` interface that can be backed by the device engine, a fake engine for UI work, or a later Android native inference core for the S23 Ultra spike.
- The runnable source defaults to the device engine. The fake engine is opt-in via `USE_FAKE_ENGINE=true`.
- The app must present a model-download gate before translation is enabled.
- The current device engine uses ML Kit's Chinese translation model for Cantonese preview behavior because ML Kit does not expose a distinct Cantonese translation model.
- The Android platform folder is generated in `native_translate/android/` so the spike can build and run as an Android app immediately.
