# MCP-1B durable acceptance and release readiness

2026-10-26 · Decision: **REQUIRES_ADDITIONAL_VALIDATION**.

The existing source-owned read-only MCP fixture passes current local protocol, signed API and disposable PostgreSQL acceptance. This closes the bounded MCP durability evidence gap. It does not establish remote compatibility, production readiness or a clean repository-wide release gate.

## Revision, reconciliation and preservation

Latest fetched GitHub `main` and acceptance-worktree HEAD: **`90c77ecceb35682e0b64bcc512b8d83ae23a78d1`**. Candidate source changes are uncommitted and recorded with SHA-256 in `source-manifest.json`; a base commit alone does not identify the modified candidate. Acceptance worktree: `/tmp/athena-mcp-1b`, branch `foundation/mcp-1b-acceptance-2026-10-26`.

The original `/workspace/personalassistant` checkout remains at `7ee28be9de093a0446dfbe95b7145278b9087ea9`, divergent from GitHub, with existing tracked and untracked work including the older MCP migration name. It was not reset, stashed, overwritten, merged or used as the acceptance source. A new checkout under `/workspace` initially failed because that filesystem lacked space; the successful isolated worktree uses `/tmp`. See `reconciliation.json` and the final workspace-preservation evidence.

The actual merged MCP is in `apps/api/src/mcp/{service,protocol,transport,fixture-server}.ts`, finite `routes/mcp.ts`, shared `packages/shared/src/mcp.ts`, bootstrap/config and existing integration/policy stores. Migration **0118**, not the historical uncommitted 0111, is authoritative for the merged fixture. All 119 current migration files were applied by the normal migrator to disposable schemas. No migration or new database schema is added by MCP-1B.

Earlier audit descriptions of absent MCP and unrun PostgreSQL acceptance are historical. The program docs and capability register now point to this bounded increment. Historical source hashes remain intact; differences against newer GitHub code are flagged for review rather than silently reapproved. Two historical references are absent from this merged tree: `apps/api/src/launch-workflow/service.ts` and `docs/phase-28-acceptance-matrix-2026-10-14.md`. The launch-workflow capability is therefore classified **UNKNOWN for the current merged tree**; its historical local audit evidence is retained. A total of 129 changed historical evidence references are explicitly flagged. This is not a new comprehensive audit of every adjacent subsystem.

## Implementation delta

Added `apps/api/src/mcp/durability.integration.test.ts`: 15 durable acceptance cases using existing PostgreSQL adapters, normal API composition, real signed envelopes and actual SDK stdio. The existing gated PostgreSQL test also runs, giving 16 database assertions. There are no new endpoints, credentials, stores, migrations, server registrations or runtime capabilities.

Dependency changes: raise direct Zod minimums in five manifests to 4.6.6, Fastify to 5.12.6, and the existing fast-uri 3.x/4.x overrides to 3.1.9/4.2.3. The lockfile includes compatible Fastify dependency-closure changes. MCP SDK 1.32.2 and wire revision 2025-11-25 are unchanged. Production denial and default-off behavior remain unchanged.

## Environment and database provenance

Node **22.16.0**, pnpm **11.17.0**, Linux x86_64; PostgreSQL **18.6**, pgvector **0.8.7**. The shell's default Node 20/pnpm 9 were not used. Test subprocesses receive an allowlisted environment, no production database or provider credentials, disabled live-provider flags, and a preload preventing implicit `.env` loading.

A new empty `initdb` cluster was created solely for this run by a child that dropped privileges before PostgreSQL startup. It listens on a private Unix socket with **TCP disabled** and uses synthetic fixture records only. No configured database URL or existing database/service was used. `max_connections=60`; `max_locks_per_transaction=1024` accommodates the large disposable-schema teardown. The first baseline assertion passed but teardown failed at default lock capacity; only the disposable cluster was restarted with the larger limit, and the baseline then passed. Final cluster shutdown is recorded separately.

## Verification and precise evidence

| Command                                                                                                | Exit  | Result                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-scripts`                                                      | 0     | Candidate lockfile accepted without lifecycle scripts                                              |
| `pnpm exec vitest run apps/api/src/mcp packages/config/src/mcp.test.ts` with owned disposable test URL | 0     | **63 passed, zero failed, zero skipped**, seven files; includes 16 actual PostgreSQL assertions    |
| `pnpm typecheck`                                                                                       | 0     | Workspace strict TypeScript passes                                                                 |
| `pnpm lint`                                                                                            | 0     | Full configured lint passes                                                                        |
| `pnpm test` without database URLs                                                                      | 1     | **1,499 passed, six failed, 104 skipped**                                                          |
| Baseline targeted rerun of the three failing test files on clean `90c77ec` source                      | 1     | Same six failures reproduced with the patched dependency installation; seven other assertions pass |
| `pnpm build`                                                                                           | 1     | Existing Mac native helper step requires unavailable `swiftc`/macOS frameworks                     |
| `pnpm --filter @alexa-control/api build`                                                               | 0     | API plus bundled `mcp-fixture.js` builds                                                           |
| `pnpm --filter @alexa-control/api security:check`                                                      | 0     | Selected repository security invariants pass                                                       |
| `pnpm verify:production-config`                                                                        | 0     | Example config invariants pass; no production configuration changed                                |
| `pnpm audit --json` before / after                                                                     | 1 / 1 | 92 → 82 advisory entries; targeted ten removed, whole gate remains failing                         |

`commands.json` records exact arguments, exits and durations. `mcp-test-results.json` records every focused assertion and its result. `regression-summary.json` distinguishes failures/skips from verified assertions. Reports omit signatures, keys, tokens, connection strings and raw provider data. Development test-construction failures are retained separately from final acceptance, including corrected fixture assumptions/types/cleanup and an earlier approval-case timeout; the final complete focused rerun has no retries and passes all 63 assertions.

The six full-suite failures concern four unavailable developer-local corpus assertions, one nonportable Mac discovery fixture and one existing worker-image test requiring Python's `hashlib.file_digest`, absent in Python 3.10.12. All reproduce on unchanged base source. These are not recategorized as passing. The Mac build limitation is likewise retained, not skipped through a source change. Relevant tracked build outputs in the isolated checkout were restored after verification.

## Durable acceptance results

- **Migrations:** fresh digest-current application of all current migrations, vector availability, chronological pre-0118 migration followed by existing synthetic integration records and normal 0118 application. Old records survive unchanged; MCP provider is rejected before and accepted after; unknown providers remain rejected. Reapplication preserves existing provider records.
- **Isolation:** two legitimate companies owned by the same human receive independent integration grants; the second cannot read the first workspace or audit evidence. Foreign/unknown company headers and unauthorized workspaces are denied. Session/device/owner/company context remains server-derived.
- **Authority and approval:** unknown server/tool, write operation, extra approval fields, tampered signatures and revoked grants are denied. The durable approval record binds to the canonical action digest; changing workspace fails matching, expiry persists, and explicit approval requirements never elevate this slice into an executor.
- **Replay/concurrency:** persistent signed nonce checks survive API and database-pool reconstruction. Two API instances race an identical signed envelope and independently signed envelopes sharing one operation ID. Exactly one completion is accepted in each race; later replay remains denied.
- **Stop/revocation/cancellation:** permission/session/device revocation is read from PostgreSQL after service reconstruction. A test-only barrier pauses a real initialized child before its tool call; stop, grant/session revoke, caller cancel and timeout all suppress success, terminate the child and retain no completion event. Further calls after stop remain denied.
- **Evidence:** attributable company/device/operation audit and policy evaluation records persist; company views are isolated; lifecycle metadata is bounded and does not contain arguments, output or envelope signatures. Existing audit-unavailable fail-closed tests also pass.
- **Adversarial protocol/resource checks:** existing scripted fault tests cover changed/invalid schemas, downgrade, unknown tools, external schema refs, injection and unsolicited authority notifications; byte/frame/depth and concurrency/rate bounds, timeout and cleanup tests pass. These are fault-injection tests, not an external server acceptance claim.

## Dependency exposure and remaining risk

The historical one-high/four-moderate/five-low findings are resolved for Zod/Fastify/fast-uri. The current feed contains additional inherited findings and remains at **3 critical, 37 high, 32 moderate, 10 low**. `DEPENDENCY_ASSESSMENT.md` and both complete JSON registers document paths, affected/patched ranges and reachability limits. No advisory was suppressed or security policy weakened.

Remaining critical paths include Vitest → tinypool and Mac concurrently → shell-quote. Electron findings affect the shipped desktop runtime despite its development-dependency placement. Other build/packaging findings require compatible parent updates and their own acceptance. Their presence is not proof of a remotely exploitable MCP endpoint, nor grounds for dismissing the failed overall gate.

Restart evidence covers API/pool reconstruction with retained database state, not abrupt host failure or backup/restore. Protocol corruption uses scripted transports; timing faults use a real child with a test-only barrier. Quotas are per API process, not a distributed fleet reservation. Replay and operation-ID retention follow the existing nonce/envelope lifetimes; no permanent deduplication or write-idempotency guarantee is claimed. Initial policy/audit database latency is not a newly certified end-to-end service latency bound. No remote tool, production account, native-device effect, paid compute or production database was exercised.

## Capability maturity and next release gate

`ATHENA.MCP.LOCAL_READ_ONLY` remains **IMPLEMENTED_AND_VERIFIED only within the stated local/disposable scope**, now at revision 2 with current test/source references. `ATHENA.UNKNOWN.MCP_UNIVERSAL` remains partial. Other foundations and broader platform claims are not promoted.

Decision: **REQUIRES_ADDITIONAL_VALIDATION**. Keep production fixture enablement prohibited. Before widening MCP, take a bounded release-hardening slice: review compatible test-runner/tinypool and Mac launcher/packaging updates, remediate remaining material dependency findings, fix the independently reproduced portable fixture/Python gates, and obtain real supported-macOS native-build evidence. Repeat signed/durable/stop/replay acceptance after any relevant upgrade. Do not override an incompatible transitive major or automatically begin MCP-2.

No commit, push, deployment, external account connection or production permission/configuration change is performed by this acceptance task.
