# Test and acceptance matrix

Evidence classes: **STATIC** (source composition), **UNIT/FAULT** (controlled fake dependencies), **LOCAL_SYSTEM** (real local Git/stdio/runtime code on Linux), **DISPOSABLE_POSTGRES** (real isolated database), **REAL_ANDROID_MAC** (required final product gate). Never promote one class into another.

| Area                                | Existing tests / evidence                                                                                              | Required final product assertion                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Signing, session, company, approval | `security-api.test.ts`, `governance-api.test.ts`, MCP API/durable cases                                                | Real Android key signs a bounded engineering request; missing/revoked/foreign state cannot start work                |
| Objective/DAG/delegation            | `objectives/service.test.ts`, `engineering-orchestration/service.test.ts`, `agent-os-gateway.test.ts`, workforce tests | Persisted engineering objective and real agent/session lineage are joined to the phone operation                     |
| Repository/workspace leases         | Engineering runtime/orchestration PostgreSQL tests                                                                     | Simultaneous workers and expired leases cannot create stale Mac effects                                              |
| Signed native transport             | `engineering-runtime/transport.e2e.test.ts`, `signed-gateway.test.ts`, Mac execution-client tests                      | Real trusted Mac verifies/polls/executes finite envelope and signs attributable receipt                              |
| Registered commands and validation  | Mac validation-runner and engineering-runtime tests; worker tests                                                      | Actual lint/typecheck/test/build receipts on the candidate head; no missing command reported PASS                    |
| Integration/review/merge            | Integration service/evidence/AI-reviewer/PostgreSQL tests                                                              | Different authorized reviewer; stale head or expired approval blocks actual merge                                    |
| Android lifecycle and controls      | Existing foreground-sync, app-lock, canonical JSON, notification-policy tests and UI source                            | Background/foreground/reconnect, duplicate submit, approve/reject/cancel/revise and terminal evidence on real device |
| Notification projection             | Notification service/policy and foreground source                                                                      | Correct company/object/deep link; no effect from notification itself                                                 |
| Dependency prerequisite             | New `toolchain-security.test.ts`, existing recovery tests adapted to Vitest 4                                          | Actual launcher dependency rejects all four advisory line terminators without executing any quoted text              |
| Durable MCP regression              | Existing MCP-1B full focused suite, real PostgreSQL/local stdio                                                        | Preserve narrow local-fixture scope under new runner; no production/remote enablement                                |

## Current execution scope

The current disposable-database run includes MCP plus engineering runtime, orchestration, integration and workforce PostgreSQL suites. All schemas are fresh disposable fixtures and use the normal migrator. It proves the assertions actually executed, not complete objective execution, a real mobile request or live model/Mac behavior.

The full suite is run without database URLs; its intentional database skips are reported separately from the focused database run. Android Gradle test/build tasks were attempted but cannot resolve an Android SDK. Linux host/runtime tests cannot accept macOS permission, packaging, biometric or physical device behavior.

The acceptance report and `evidence/test-results.json` record final counts, actual assertion names and evidence class. No failed test is converted to a skip to obtain acceptance. No live external provider flag or production database is enabled.
