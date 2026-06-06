# Flutter shell with native mobile inference core

**Status:** accepted

The spoken Translate app will not be architected as a Flutter/Dart inference app. Flutter owns the product UI and orchestration surface, while ASR, Translation, and future Voice Model execution live in a native mobile inference core behind a narrow bridge. This keeps app development portable while letting the latency-critical path use Android-native runtimes, hardware acceleration, resident sessions, and memory instrumentation on the Samsung S23 Ultra.

## Consequences

- The inference core must expose stable concepts such as Provisioned Models, Active Models, Spoken Turns, resident-session status, memory usage, and timing metrics without leaking runtime-specific details into Flutter.
- The native core is runtime-pluggable. Google AI Edge / LiteRT / MediaPipe is the preferred Android lane for optimized S23 Ultra inference, while ONNX Runtime Mobile remains available for models that do not convert cleanly or are better maintained as ONNX.
- Runtime and Model choices are judged on short spoken Travel Language Pair turns, not generic model benchmarks. Dedicated MT and LLM-style Translation Models are both valid if they fit the resident-memory and latency budget.
- Model candidates are chosen from observed real-world offline Android usage and current official mobile-runtime support before local benchmarking.
- The PWA remains useful as the current product and benchmark, but it is no longer the assumed long-term architecture for the spoken conversation experience.
