# Phase 20F — AI Runtime Benchmarking and Validation

Phase 20F adds a bounded benchmark harness around the existing AI runtime. The
harness is observational: benchmark cases produce structured results and never
grant execution authority or bypass router, policy, approval, privacy, or audit
boundaries.

## Current surface (Phase 20R-D)

- Thirteen versioned Alexa suites contain 110 interpretation, routing,
  clarification, privacy, non-execution, context, economics, resilience,
  agent, coding, and business-analysis cases.
- `DRY_RUN` never calls an inference executor.
- `LIVE_PAID` requires both request opt-in and `AI_BENCHMARK_ALLOW_PAID=true`.
- Production non-dry runs use the governed Human Understanding or
  Router -> Context -> Economics -> Runtime path and never execute actions.
- Gold expectations are stripped before a case reaches the executor.
- Evaluators report case status, latency/context metrics, provider/model
  identity, safety-critical failures, and pass-rate regressions. A case with no
  deterministic acceptance criteria is `NEEDS_REVIEW`, never an automatic
  pass.
- Authenticated benchmark APIs are available under `/api/ai/benchmarks/*`.
- `pnpm ai:benchmark:list`, `pnpm ai:benchmark:run`, and
  `pnpm ai:benchmark:regressions` expose the CLI diagnostics.
- Runtime readiness is exposed at `/api/ai/runtime-health` and in Runtime
  Studio.

## Persistence and execution boundary

Migration `0055_phase_20f_ai_benchmarks.sql` defines owner-scoped benchmark
tables for suites, runs, case results, and profiles. The current runner remains
process-local, so run history, baselines, regressions, and model profiles do not
survive an API restart. This is a production-readiness blocker until a reviewed
PostgreSQL persistence adapter is wired and restart/multi-instance behavior is
tested. The API does inject a reviewed production executor; persistence is the
remaining boundary.

## Validation

The repository validation includes dry-run safety, provider failure
containment, paid opt-in gating, owner isolation, concurrent-run isolation,
gold-data separation, corpus-size validation, subjective-result truthfulness,
and regression detection. Live paid-provider values are not claimed or
synthesized without explicit opt-in. Phase 20R-D also includes a bounded local
Gemma validation script for the canonical local path.
