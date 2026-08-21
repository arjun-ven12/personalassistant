# Phase 20A Local AI Runtime

Local AI is an optional capability provider behind `LocalAIService`. The service
uses deterministic Phase 19 understanding first; it never becomes the Intent
Engine, Planner, policy engine, or executor. Ollama is the first runtime and
models are selected by registered role, not by callers.

The default deployment is one concurrent request, bounded prompts, explicit
timeouts, one structured-output retry, and graceful unavailability when Ollama
or the registered model is missing.
