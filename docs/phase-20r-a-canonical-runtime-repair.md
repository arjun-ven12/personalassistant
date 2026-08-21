# Phase 20R-A canonical runtime repair

Phase 20R-A consolidates ordinary inference behind one provider-neutral path. It does not complete durable economics or Phase 19 cognitive-source integration.

```text
Human / Voice / Agent
        |
Human Understanding (deterministic safety first)
        |
     AIRouter
        |
CognitiveContextService (minimal/degraded when no sources exist)
        |
 PromptPlan -> AIPromptCompiler -> AIInferenceRequest
        |
in-memory governance/economic hook (durability deferred to 20R-B)
        |
 AIRuntimeService -> AIProvider -> Ollama or OpenAI
```

Ordinary diagnostic inference and the deprecated `/api/ai/local/test` compatibility endpoint use `AIRouter`; they no longer invoke `AIRuntimeService` or `LocalAIService` inference directly. `LocalAIService` remains temporarily for legacy local model administration and old unit contracts, but production Human Understanding does not depend on it. The API process shares one `OllamaLocalRuntime` transport between that compatibility administration surface and `OllamaProvider`.

Provider capability metadata describes implemented transport only. Vision and streaming remain disabled for both current inference adapters. OpenAI reasoning effort is mapped when requested, and detailed cached/reasoning usage is normalized when returned.

Local provider unavailability, timeout, and invalid structured output are fallback-eligible. Candidate iteration remains bounded by router policy. Disabled and unconfigured providers are excluded before invocation. Model role mappings and model locality metadata—not provider names—drive router ordering and local/cloud classification.

Negated, hypothetical, educational, and quoted action references are classified as deterministic non-execution before launch/delete patterns. This safety rule does not depend on optional personality-corpus import.

Semantic embeddings now flow through `EmbeddingRuntimeService` and `EmbeddingProvider`. OpenAI is an optional adapter; when no embedding provider is available, semantic retrieval degrades while deterministic and lexical paths remain available. PostgreSQL plus pgvector remains the vector persistence design.

Readiness is intentionally truthful: zero registered cognitive sources is `DEGRADED` with `NO_SOURCES_REGISTERED`, not full cognitive readiness.

Deferred work:

- Phase 20R-B: transactional PostgreSQL budgets, reservations, ledger, and mandatory paid-inference enforcement.
- Phase 20R-C: owner-scoped Phase 19 context adapters and provider-bound context recomposition.
- Phase 20R-D: model-quality benchmarking, live cloud validation, cancellation hardening, and production load/failure validation.
