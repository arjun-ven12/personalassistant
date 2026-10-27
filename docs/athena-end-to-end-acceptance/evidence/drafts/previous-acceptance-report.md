# End-to-end autonomous engineering acceptance report

2026-10-27 · Overall decision: **BLOCKED for real Android → Mac acceptance**.

The existing engineering system is substantial and reusable. This run traces its integration, defines a concrete disposable scenario and fault program, and implements the first safety prerequisite: critical test/development-toolchain remediation. It does **not** claim a dependable phone-to-Mac workflow has been demonstrated. No new execution service, mobile authority or alternate native transport was created.

## Revision, environment and preserved work

Latest fetched GitHub `main` and new worktree base: **`90c77ecceb35682e0b64bcc512b8d83ae23a78d1`**. Candidate work is uncommitted on `engineering/e2e-acceptance-2026-10-27` in `/tmp/athena-e2e-acceptance`. The original dirty checkout at `7ee28be` and uncommitted MCP-1B candidate at `/tmp/athena-mcp-1b` are preserved independently. `evidence/source-manifest.json` records inherited MCP-1B and this run's candidate hashes. The source cannot be identified by HEAD alone.

Toolchain: Node **22.16.0**, pnpm **11.17.0**, Vitest **4.1.12** after the prerequisite update, Linux, Java **21**. Disposable PostgreSQL **18.6** with pgvector **0.8.7** was created for this run with private Unix socket only, TCP disabled, an unprivileged process, 60 connections and `max_locks_per_transaction=1024`. No ambient production database URL, provider account, credential or permission was used. Subprocess environments were allowlisted, live-provider flags disabled and implicit `.env` loading prevented.

## Investigation and actual integration findings

The trace covers sixteen transitions from Android input/authentication through planning, assignment, Agent OS, task/workspace leases, deterministic authorization, signed Mac execution, registered validation, independent integration review, guarded local merge and Android canonical status/notifications. Each transition has source paths, contracts, persistence, authority, agent/model dependencies, failure/cancellation behavior, audit ownership, tests and missing evidence in `evidence/transition-register.json`.

Two flows must not be conflated: signed general objective creation uses the mobile executive routes and ObjectiveService/Workforce Runtime; Android engineering creation uses EngineeringDeliveryService/EngineeringManagerService through the existing CSRF-protected engineering API. The latter request is not a device-signed envelope. Engineering reuses workforce ranking/assignments and Agent OS sessions, but owns its task graph. No new bridge or parallel coding subsystem was invented.

Existing repository/workspace profiles, finite structured proposals, current policy/approval, existing signed execution channel, native dispatcher, task and integration receipts, independent reviewer, candidate/head binding, result outbox, foreground Android refresh and owner controls are reused in the scenario design. Their presence is not live acceptance. Delivery DONE means readiness under its service semantics, not proof of push, deployment or local merge.

## What was implemented

Only **E2E-0**, a separately reviewable safety prerequisite relative to inherited MCP-1B:

- Pin the parent Vitest package to **4.1.12**, removing the vulnerable tinypool dependency path without forcing an incompatible transitive major beneath Vitest 3.
- Resolve the concurrently launcher's existing shell-quote range to patched **1.11.0**.
- Correct one existing mock type and explicitly reset setup call history at two recovery observation points for Vitest 4. The assertions still prohibit reexecution of completed tasks during recovery; no production runtime behavior was changed.
- Add four pure-data security regressions in `apps/mac-agent/electron/toolchain-security.test.ts` through the actual launcher's dependency resolution. The inherited library rejects zero of four dangerous line-terminator cases; the patched library rejects all four. Quoted text is never executed.
- Create the twelve requested program documents, sixteen-transition machine-readable trace, test/audit/provenance evidence, scenario/runbook and independent prerequisite patch.

There are no new endpoints, execution operations, device grants, model permissions, migrations or production settings. Existing MCP-1B changes are inherited, explicitly distinguished from the new prerequisite delta. The parent migration initially exposed one type error and five mock-history-dependent recovery failures; those were corrected without weakening the assertions. Initial failures remain recorded separately from final results.

## Verification

| Command / scope                                                                                   | Exit | Current result                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-scripts`                                                 | 0    | Reviewed candidate lockfile accepted without lifecycle scripts                                                                        |
| Pure-data launcher security + durable-execution + engineering delivery recovery tests             | 0    | **44 passed, zero failed**                                                                                                            |
| Focused MCP and engineering/workforce PostgreSQL regression                                       | 0    | **69 passed, zero failed, zero skipped** across eleven files                                                                          |
| `pnpm typecheck`                                                                                  | 0    | Whole workspace passes                                                                                                                |
| `pnpm lint`                                                                                       | 0    | Whole configured lint passes                                                                                                          |
| `pnpm test`                                                                                       | 1    | **1,503 passed, six failed, 104 skipped**; all failures independently reproduced on unchanged base source with candidate dependencies |
| Targeted baseline rerun of the three failing files                                                | 1    | Same six failures, no new migration/runner failure after scoped mock fixes                                                            |
| `pnpm --filter @alexa-control/api build`                                                          | 0    | API and fixed MCP fixture bundle build                                                                                                |
| `pnpm build`                                                                                      | 1    | Existing Mac native build requires unavailable `swiftc` and macOS frameworks                                                          |
| `bash apps/android/gradlew -p apps/android :app:testDebugUnitTest :app:assembleDebug --no-daemon` | 1    | Android SDK location absent; Android tests/build did not execute                                                                      |
| API `security:check`                                                                              | 0    | Selected repository security invariants pass                                                                                          |
| `pnpm verify:production-config`                                                                   | 0    | Example-profile invariants pass; no deployed configuration accepted                                                                   |
| `pnpm audit --json`                                                                               | 1    | **82 → 76** entries; critical **3 → 0**; 37 high, 29 moderate and ten low remain                                                      |

Exact arguments, exit codes and durations are in `evidence/commands.json`; actual assertions are in `evidence/test-results.json`. The full suite deliberately has no database URL. Its database skips are not acceptance; the separate focused command exercises only the disposable cluster. No external model/provider, real Android, macOS permissions, biometric approval or push delivery is accepted by those tests.

The six baseline failures are four unavailable developer-local corpus tests, one nonportable Mac discovery fixture on Linux and one worker-image fixture requiring Python's `hashlib.file_digest`, absent in the installed Python 3.10. They remain failed rather than being suppressed or recategorized as passes. Tracked artifacts generated during build are restored in this worktree; existing work in the other worktrees remains unchanged.

## Durable and security evidence

The 69-test command includes the original **63 MCP assertions**, of which **16** exercise actual disposable PostgreSQL, plus **six engineering/workforce PostgreSQL assertions**. Thus **22** assertions use real PostgreSQL; the remaining 47 are local SDK/API or controlled fault fixtures. All normal migrations apply to the disposable schemas. Engineering runtime/workspace/task leases and integration state are tested with actual persistence and race/fencing assertions. These results do not prove real Mac effects, crash recovery across the entire product, or real mobile signing.

MCP's actual local stdio, signed API, permission/session/device denial, two-company isolation, replay/duplicate checks, approval digest/expiry, in-flight stop/cancellation, child cleanup and persistence tests remain passing under the new runner. The fixed local fixture remains production-prohibited and default-off. Its success neither grants agents new capabilities nor is required as a shortcut in the native engineering path.

The current audit reports no remaining critical entries, but does not pass. Remaining findings include Electron client runtime and packaging/development dependencies. Audit paths and public advisory ranges are preserved in both complete registers. No suppression, broad audit-fix, arbitrary command execution or exploitable-provider claim was used. Static reachability is not a full exploitability analysis.

## Acceptance gate and limits

**Overall: BLOCKED.** No real signed Android engineering request was joined to a persisted engineering objective, real authorized Agent OS/workforce delegation, actual trusted Mac operations and validation receipts, separate reviewer, enforced owner approval and terminal Android evidence. Android SDK/device and macOS execution environments are unavailable. Joined cancellation/revocation/restart and no-subsequent-effect boundaries remain unaccepted. Source and fixture evidence must not be advertised as that outcome.

**E2E-0 prerequisite: suitable for scoped review**, with critical-path remediation and passing local/durable checks. Repository-wide regression/build/audit limitations remain explicit; this is not a production release recommendation. Existing institutional capability IDs and broad maturity levels are preserved. Selected current PostgreSQL evidence and the blocked real-device gate are attached without upgrading Android or autonomous engineering to verified.

## Exact next slice

**E2E-1: signed, company-bound, existing-repository engineering draft with durable duplicate semantics and no dispatch.** Reuse Android signing and shared schemas, existing middleware/company/approval/audit, delivery/manager persistence and an internal deferred-drive boundary. Prove one durable objective/delivery under replay, changed-body conflict, concurrent duplicate, interruption/restart and revoked state. Explicitly show “persisted; execution not started” on Android. Obtain actual Android signing/build evidence before calling ingress accepted. Exclude new-project initialization, self-improvement, worker launch, merge, push or deployment.

Then accept explicit activation/cancellation and real Mac receipts in a separate slice. Do not automatically begin them. No commit, push, deployment, account connection, credential change, permission expansion or unsafe sandbox enablement was performed in this run.
