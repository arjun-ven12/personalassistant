# MCP-1A and program acceptance matrix

> Program v0.1 · 2026-10-26 · Scope: local development/test read-only fixture only.

| Gate                           | Actual evidence                                                                                                                         | Status                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Pinned handshake               | SDK 1.32.2 client/server, exact 2025-11-25 negotiation; older revision rejected                                                         | LOCAL_PASS                                   |
| Discovery                      | Exactly one reviewed tool and exact input/output schemas; extra/unknown tools, refs, weakening and paging denied                        | LOCAL_PASS                                   |
| Invocation                     | Real stdio child and signed API exchange return independently validated static structured health                                        | LOCAL_PASS                                   |
| Authority                      | Existing session/company/workspace/integration/device/signature/origin/CSRF/network gates; missing/foreign/revoked/expired state denied | LOCAL_PASS                                   |
| Policy and approval            | Existing persisted evaluations; stronger permission/approval requirements are not weakened                                              | LOCAL_PASS                                   |
| Stop/revocation                | Mid-flight stop suppresses success; permission revocation cancels bounded active work; each protocol step rechecks authority            | LOCAL_PASS                                   |
| Budgets/lifecycle              | Frame/aggregate/message/depth limits, per-process concurrency/rate, deadlines, cancel/shutdown and awaited process cleanup              | LOCAL_PASS                                   |
| Adversarial data               | Descriptions never authority; injected/unstructured/malformed content and server authority/change notifications denied                  | LOCAL_PASS                                   |
| Audit                          | Attributable start/policy/outcome; audit persistence failure prevents operation/success; sensitive payloads omitted                     | LOCAL_PASS                                   |
| PostgreSQL                     | Provider CHECK migration 0111 and gated store isolation/revocation/audit reconstruction test exist                                      | NOT_RUN                                      |
| Focused tests                  | 47 passed, 0 failed, 1 PostgreSQL test skipped across six files                                                                         | PASS_WITH_EXCLUSION                          |
| Full suite                     | 1,139 passed, 0 failed, 59 skipped across 203 files                                                                                     | PASS_WITH_EXCLUSIONS                         |
| Typecheck/lint/build           | All pass on supported Node/pnpm; Linux native helper build explicitly skips macOS                                                       | PORTABLE_PASS                                |
| API security/config invariants | Selected repository scanner and private/cloud example config checks pass                                                                | LOCAL_PASS                                   |
| Dependency audit               | 1 high, 4 moderate, 5 low advisory entries in inherited package versions; SDK adds paths to some                                        | FAIL_OPEN_GATE                               |
| Formatting                     | Targeted new/clean files checked; repository-wide pre-existing gate recorded separately                                                 | TARGETED_PASS / 445_EXISTING_FORMAT_FAILURES |

## Other foundations

AthenaCoder and model lifecycle have architecture/phased plans only. No ingestion, training, artifact registry, simulated deployment or promotion was implemented. Quantum runtime has a bounded classical design/conversion convention, but no solver, experiment or quantum result was run. Distillation remains a separate future research capability. Their acceptance gates are not satisfied by MCP tests.

## Release decision

**REQUIRES_ADDITIONAL_VALIDATION.** MCP-1A has actual local compatibility and security-regression evidence, but no PostgreSQL acceptance or passing dependency-security gate. Keep production enablement prohibited. No merge/publication/deployment/promotion is authorized.

See `implementation-logs/acceptance-results.json`, `dependency-audit.json` and `03_COMPLETION_REPORT.md`.
