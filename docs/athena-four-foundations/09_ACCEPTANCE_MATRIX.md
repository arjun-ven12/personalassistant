# MCP-1A / MCP-1B acceptance matrix

2026-10-26 · Candidate based on `90c77ecceb35682e0b64bcc512b8d83ae23a78d1` · Local development/test read-only fixture only.

| Gate                           | Current evidence                                                                                                                                                | Status                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Pinned handshake/discovery     | SDK 1.32.2, exact 2025-11-25, actual child plus strict poisoning/downgrade/schema fault tests                                                                   | PASS_WITHIN_SCOPE             |
| Read-only execution            | Real SDK stdio through signed finite API; no arbitrary registration or invocation surface                                                                       | PASS_WITHIN_SCOPE             |
| Identity and scope             | PostgreSQL-backed owner/session/device/company/workspace/grant checks; two legitimate same-owner companies isolated                                             | PASS_WITHIN_SCOPE             |
| Approval integrity             | Canonical action digest, wrong-workspace mismatch, durable expiry; stronger explicit approval remains denied by this slice                                      | PASS_WITHIN_SCOPE             |
| Replay and duplicate races     | Atomic stored nonce checks; API/pool reconstruction and two API instances racing same envelope or operation ID                                                  | PASS_WITHIN_SCOPE             |
| Stop and revocation            | Persisted session/device/permission revocation; actual child paused before call, then stopped/revoked/cancelled/timed out, with child exit and no success audit | PASS_WITHIN_SCOPE             |
| Audit                          | Persisted attributable policy and start/outcome records; isolated company views; bounded metadata without signature/input/output payloads                       | PASS_WITHIN_SCOPE             |
| Migrations                     | All 119 migration files digest-current on fresh synthetic schema; chronological pre-0118 → 0118 with preserved existing data and unknown-provider rejection     | DISPOSABLE_POSTGRES_PASS      |
| Durable MCP tests              | 16 PostgreSQL assertions, including 15 new durable cases and existing store test; PostgreSQL 18.6 / pgvector 0.8.7                                              | PASS                          |
| Focused MCP/config tests       | 63 passed, zero failed, zero skipped across seven files                                                                                                         | PASS                          |
| Full regression                | 1,499 passed, six failed, 104 skipped; all six failures reproduced on unchanged base source with same patched dependencies                                      | PRE_EXISTING_FAILURES         |
| Typecheck/lint                 | Supported Node 22.16.0 / pnpm 11.17.0; whole-workspace checks pass                                                                                              | PASS                          |
| Build                          | API build including fixture passes; root build reaches existing Mac native step and fails because Swift/macOS frameworks are unavailable                        | API_PASS / FULL_BUILD_BLOCKED |
| Security/configuration         | API invariant scanner and example production-config checks pass; no deployed configuration accepted                                                             | LOCAL_PASS                    |
| Historical dependency findings | Ten Zod/Fastify/fast-uri entries removed through compatible same-major updates                                                                                  | RESOLVED_TARGETED_FINDINGS    |
| Whole dependency audit         | 82 entries remain: 3 critical, 37 high, 32 moderate, 10 low; no suppressions                                                                                    | FAIL_OPEN_GATE                |
| Remote/third-party/production  | Not connected, enabled or tested; production flag remains prohibited                                                                                            | NOT_ACCEPTED                  |

The whole-suite regression command intentionally omits database URLs; database skips there are covered only where the separate focused disposable-PostgreSQL command actually ran. No skip is counted as verified. Protocol mocks inject errors; they are not live external provider acceptance.

## Release decision

**REQUIRES_ADDITIONAL_VALIDATION.** Durable local-fixture acceptance is established within the exact scope above. The dependency, whole-regression and full native-build gates remain non-green. Do not broaden MCP authority or enable production from these results.

See [the acceptance report](implementation-logs/mcp-1b/ACCEPTANCE_REPORT.md), [commands and exit codes](implementation-logs/mcp-1b/commands.json), [test evidence](implementation-logs/mcp-1b/mcp-test-results.json), and [dependency assessment](implementation-logs/mcp-1b/DEPENDENCY_ASSESSMENT.md). Historical MCP-1A records remain in the implementation logs; their older counts are not current results.

## Other foundations

This increment implements no AthenaCoder ingestion/training, model promotion, solver, quantum execution, remote transport or side-effect tool. Earlier program designs remain proposals against their recorded baseline. GitHub has newer adjacent engineering/dataset/model-control modules; their existence does not satisfy these program gates and should be investigated before subsequent implementation.
