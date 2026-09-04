# Phase 25.7H management intelligence hardening

## Outcome

Phase 25.7 management intelligence now fails closed when company scope, metric quality, telemetry, economic policy evidence, bilateral service policy, or durable execution authority is unavailable. The full validation matrix passes: 153 test files and 785 tests.

## Hardening results

| Requirement                             | Result              | Evidence                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company query scope                     | Pass                | Management establishes the requested owner/company scope around Objective, Executive plan/KPI/decision/history, Workforce, and Agent Economy reads. Portfolio output is explicitly reduced to the requested company.          |
| UNKNOWN, stale, and conflicting metrics | Pass                | STALE, CONFLICT, and UNAVAILABLE observations produce UNKNOWN KPI state, insufficient-data forecasts, and UNKNOWN company health. No unavailable evidence becomes a healthy state.                                            |
| Review idempotency                      | Pass                | The request requires an idempotency key. Review and history IDs are deterministic, retries return the original review, and sequential retries create one history and one audit record.                                        |
| Root-cause precedence                   | Pass                | Diagnoses are ordered DATA, SYSTEM, AI_QUALITY, BUSINESS, UNKNOWN. Business-performance diagnosis is suppressed while higher-precedence evidence is degraded.                                                                 |
| Company switch cache isolation          | Pass                | Only authentication and company-list queries survive a switch. Management, company data, portfolio, Services, objectives, agents, and memory caches are evicted.                                                              |
| Services bilateral policy               | Pass                | Missing peer policy, disabled external transfer, and destination rejection all deny before execution or activity. Existing revocation checks remain active.                                                                   |
| Scheduler recovery                      | Pass                | A reconstructed scheduler reclaims an expired lease with generation increment and no duplicate claim. PostgreSQL concurrent claims remain duplicate-free.                                                                     |
| Phase 20R assumptions                   | Pass                | Direct SQL test owners now receive an explicit default company/membership fixture. Production company-context enforcement was not relaxed.                                                                                    |
| PostgreSQL migration regression         | Pass                | An idempotent `0077a` repair migration restores the cross-device tables before Phase 25 migrations. Legacy integration suites now use migrated isolated schemas instead of a shared drifting schema.                          |
| Authenticated browser acceptance        | Environment-blocked | No existing signed-in browser tab or safe test credentials were available. The real application correctly reached its authentication boundary and returned 401 when unauthenticated; no owner or credentials were fabricated. |
| Missing telemetry behavior              | Pass                | A missing company telemetry summary produces UNKNOWN with unverified external evidence, never a synthetic healthy status.                                                                                                     |
| Full validation                         | Pass                | Lint, strict typecheck, full tests, production build, migration status, and diff whitespace checks pass.                                                                                                                      |

## Security behavior

- Management reads are owner-scoped and company-scoped before context-dependent repositories are queried.
- Review retries cannot silently create a different review for the same company and idempotency key.
- Stale, conflicted, missing, or unavailable KPI evidence cannot authorize a healthy management conclusion or a numerical forecast.
- Paid remote inference now converts unavailable economic-policy evidence into a structural `ECONOMICS_UNAVAILABLE` deny. It does not call the provider and does not expose the database error.
- Services requires bilateral policy, permitted transfer, destination acceptance, and the existing runtime authority before work begins.
- Cached company-specific management and operational state is discarded when the active company changes.
- Test fixture repairs preserve the production database triggers requiring company context; they do not weaken tenancy enforcement.

## PostgreSQL and durability

The previously reported migration failures were caused by shared test-schema drift: the migration ledger could say Phase 24.6 had run while its cross-device tables were absent, causing Phase 25 foreign-key migrations to fail. The new repair migration runs immediately after 0077 and is safe on both intact and drifted schemas.

Legacy Phase 20R, Executive, Voice, and Reflection PostgreSQL suites now create a unique schema, run the complete migration set, provision explicit test company context, and drop the schema after the suite. This removes cross-suite mutation and validates the same tenancy constraints used in production.

The 100-company durable claim benchmark completed with 200 runnable executions, 64 bounded claims, zero duplicate claims, 517.99 ms claim latency, and 967.22 ms total elapsed time during the final full-suite run. Additional bounded claim rounds absorb connection contention without reducing the duplicate-prevention or time-limit assertions.

## Validation record

- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all five workspace projects.
- Focused management/Services/cache/scheduler tests: 5 files, 32 tests passed.
- Focused Phase 20R-F4 closure: 11 tests passed.
- Focused Phase 20R-B/F3/F4 regression matrix: 17 tests passed.
- Repaired Executive/Voice/Reflection PostgreSQL suites: 4 files, 8 tests passed.
- `pnpm test`: 153 files, 785 tests passed.
- `pnpm build`: passed for shared/config, API, Mac agent, native Swift helpers, and web. Vite retains the known runtime-config and large-chunk advisory warnings.
- `pnpm db:status`: current, with no pending migrations.
- `git diff --check`: passed.

## Remaining limitations

- Authenticated visual browser acceptance still requires an existing safe signed-in session or explicit test credentials.
- Deterministic review IDs prevent duplicate stored review/history records. A truly simultaneous retry in separate API processes can still race far enough to attempt duplicate audit writes before the database uniqueness result is observed; exact sequential and normal API retries are covered.
- The local development database migration ledger contains an earlier applied repair label from the interrupted diagnostic attempt in addition to `0077a`; there are no pending migrations, and fresh databases receive only the checked-in `0077a` repair.
- The web production bundle still reports pre-existing chunk-size advisories. This does not affect correctness or isolation but remains a performance optimization opportunity.
