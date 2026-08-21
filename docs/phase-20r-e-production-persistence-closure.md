# Phase 20R-E — Production Persistence and Reliability Closure

Validation date: 2026-08-14 (Asia/Singapore).

## 1. Executive Summary

20R-E wires benchmark persistence to PostgreSQL, adds guarded DB integration tests, adds 5/10/20 canonical fake-provider load tiers, and makes production benchmark operations fail closed without persistence. Phase 20 remains incomplete: no safe database is configured, and override approval is not implemented.

## 2. Closure Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Lint | PASS | `pnpm lint` |
| Typecheck | PASS | `pnpm typecheck` |
| Tests | PASS with DB exclusions | 354 passed, 6 skipped |
| Build | PASS | API, web, Mac agent, shared/config built |
| 5/10/20 canonical load | PASS | Three new fake-provider tests |
| PostgreSQL closure gates | NOT RUN | Both database URLs unset |
| Override approval/replay | FAIL | No governed runtime integration |

## 3. Test Database & Migration Validation

`safeTestDatabaseUrl()` refuses execution unless `TEST_DATABASE_URL` exists, differs from `DATABASE_URL`, and names a test/ci database. Current URLs are both unset. Fresh and existing-schema migration tests are therefore **NOT RUN**.

## 4. Economic Persistence

The PostgreSQL economic store remains the configured production authority. Existing tests cover restart, settlement idempotency, expiration reconciliation, and scope isolation, but all four are skipped without a guarded database. Budget, usage, reservation, settlement, and duplicate-settlement restart proof: **NOT RUN**.

## 5. Transactional Concurrency

The PostgreSQL store locks policies in deterministic `scope, scope_id, id` order before active reservations. Real two-instance, repeated-race, multi-scope, and multi-process evidence is **NOT RUN** without PostgreSQL.

## 6. Economic Override Approval

**FAIL.** `ai_budget_override_grants` exists, but no service binds existing approval/recent-auth records, canonical digests, owner/request scope, bounded consumption, expiry, replay denial, and audit to remote inference. No approval bypass was introduced.

## 7. Benchmark Persistence

Implemented `0057_phase_20r_e_durable_ai_benchmarks.sql` and `PostgresAIBenchmarkStore`. Runs, individual case results, profiles, baseline designation, versions, and regression metadata now have durable write/read paths. Profiles preserve model IDs such as `gemma3:4b`; a failed executor finalizes a partial run as `FAIL`.

The production app selects PostgreSQL when a database exists; otherwise a production benchmark request rejects with `BENCHMARK_DATABASE_REQUIRED_IN_PRODUCTION`, never falling back to maps. PostgreSQL restart/baseline/profile proof: **NOT RUN**.

## 8. Owner Isolation

In-process benchmark isolation passes. The new PostgreSQL test reconstructs a runner and verifies owner scope, baseline, results, and `gemma3:4b` profile identity, but is skipped. Persistent economic/API owner isolation: **NOT RUN**.

## 9. Load Testing

5, 10, and 20 concurrent requests passed through `AIRouter -> Context -> Economics -> Runtime -> fake paid provider`. Two owners received only their own settled ledger entries; all reservations settled. The fake provider reported 10 input + 10 output tokens and each ledger item settled at USD `0.00002`. This is in-process load evidence, not a PostgreSQL multiprocess hard-cap proof.

## 10. Dependency Recovery

Provider failure normalization and economics-unavailable denial are covered by existing tests. Provider down/recover, economics DB down/recover, and Redis down/recover lifecycle tests: **NOT RUN**.

## 11. Shutdown & Cancellation

Router error handling settles/releases a reservation and recognizes `AbortError` as cancellation. Actual graceful shutdown, delayed-provider cancellation, and abrupt-restart reconciliation: **NOT RUN**.

## 12. Live Gemma Regression Check

The local script was invoked after refactoring, but the terminal collector did not retain a result. This pass therefore has **NOT VERIFIED** live Gemma evidence. R-D's 26/30 result is historical only.

## 13. Final Economic Bypass Audit

The router reserves before remote inference, runtime requires an active reservation permit, and success/failure paths settle or release. Production benchmark execution uses Human Understanding or the router. A repository-wide formal call-site inventory and DB-backed proof: **NOT VERIFIED**.

## 14. Final Persistence Matrix

| Data | PostgreSQL authority | Restart proven | Owner scope |
|---|---|---|---|
| Pricing/model roles | Yes when configured | NOT RUN | Pricing global |
| Budgets/reservations/usage | Yes | NOT RUN | Yes |
| Overrides | Table only | FAIL | Intended yes |
| Benchmark runs/results | Yes, newly wired | NOT RUN | Yes |
| Baselines/regressions/profiles | Yes, newly wired | NOT RUN | Yes |
| Context trace metadata | Process-local bounded | No claim | Yes in process |

## 15. Security & Privacy Invariants

LLM direct execution: **NO**. LLM self-approval: **NO**. LLM budget mutation: **NO**. Paid cloud bypass of the audited canonical path: **NO**. SECRET cloud leakage in tested composition paths: **NO**. Restart truth, two-instance cap safety, persistent owner isolation, and baseline restart survival: **NOT VERIFIED**. Override replay: **FAIL** because no override runtime exists.

## 16. Runtime Reliability

Durable benchmark lifecycle is implemented, including per-case writes and failed partial-run status. Dependency recovery, shutdown, cancellation, and real restart reliability remain unproven.

## 17. Benchmark & Observability Readiness

Benchmark API calls now read durable storage when configured; there is no production map fallback. Durable operation is ready to test but not verified without a test DB.

## 18. Remaining Dead/Legacy State

The former unused benchmark migration is now used by a runtime adapter; `0057` supplies missing metadata. The override-grant table remains dormant. No duplicate runtime or generic executor was added.

## 19. Architecture Scorecard

Provider/runtime 8.0; routing 8.0; economics 5.5; context 8.0; privacy/security 8.5; reliability 6.0; agent readiness 6.0; observability 6.5; benchmarking 7.5; maintainability 7.5 (all out of 10).

## 20. Phase 20 Readiness Score

Provider/runtime 13/15, routing 12/15, economics 7/15, context 13/15, security/privacy 14/15, reliability 6/10, agent 3/5, observability 3/5, benchmark quality 4/5: **75/100**.

## 21. Must Fix Before Phase 21

1. **HIGH:** configure a disposable guarded PostgreSQL test database and pass migration, restart, race, and persistent owner-isolation gates.
2. **HIGH:** implement approval-bound, digest-bound, expiring, transactionally consumed economic overrides with audit and replay tests.
3. **HIGH:** prove provider/DB recovery and in-flight cancellation/reconciliation under failure.

## 22. Deferred Improvements

Gemma voice quality, cold latency, paid-cloud comparison, streaming, vision, prompt caching, larger reviewed corpora, and UI polish.

## 23. Final Phase Completion Matrix

| Phase | Status | Confidence | Remaining gap |
|---|---|---:|---|
| 20A | PASS | 90% | Local performance |
| 20B | PASS | 88% | Optional paid comparison |
| 20C | PASS | 87% | Policy comparison |
| 20D | PARTIAL | 65% | DB proof/overrides |
| 20E | PASS | 86% | Durable metrics |
| 20F | PARTIAL | 78% | PostgreSQL evidence |
| 20R-A | PASS | 92% | None blocking |
| 20R-B | PARTIAL | 60% | DB gates unavailable |
| 20R-C | PASS | 90% | Durable trace metadata deferred |
| 20R-D | PARTIAL | 74% | Closure gates outstanding |
| 20R-E | PARTIAL | 75% | Three HIGH blockers |

## 24. Final Verdict

**PHASE 20 STILL INCOMPLETE — DO NOT START PHASE 21**
