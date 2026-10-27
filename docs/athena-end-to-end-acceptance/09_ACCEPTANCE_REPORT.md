# Signed engineering draft acceptance report

2026-10-27 · **E2E-1 backend slice: READY_FOR_REVIEW.** Overall real Android → trusted Mac engineering acceptance remains **BLOCKED**.

An authorized owner can now submit a signed, company-bound request for an existing registered repository and receive one persistent, non-executable engineering draft. Equivalent retries return the same objective/delivery; changed content under the same key conflicts. No code, model, task, Mac operation, merge or deployment is started. This is backend protocol/persistence acceptance with fixture signing keys, not real Android Keystore or device acceptance.

## Exact source and preserved work

Base HEAD and latest fetched GitHub main: **`90c77ecceb35682e0b64bcc512b8d83ae23a78d1`**. Work is uncommitted on `engineering/signed-drafts-2026-10-27` in `/tmp/athena-engineering-drafts`. `evidence/drafts/source-manifest.json` records the candidate file hashes and the exact new delta relative to the preserved E2E-0 candidate. HEAD alone is not the candidate identity.

The original dirty checkout, MCP-1B worktree and E2E-0 acceptance worktree were snapshotted before work and remain unchanged. Their pending changes were inherited in this new worktree rather than reset, overwritten, stashed or silently published. The prior acceptance report is retained as [historical evidence](evidence/drafts/previous-acceptance-report.md). Historical audit references and source-change flags are preserved; they are not assumed current merely because a report exists.

## Implemented boundary and why it is safe to review

`POST /api/v1/device/engineering-drafts` uses current owner/session and company resolution, exact trusted origin/CSRF, registered device/signature/nonce validation and network verification. Shared `EngineeringDraftCreateOperationSchema` reuses the bounded engineering request but requires an existing repository, no development-root initialization, no preview and no authority/command fields. A signed company must match the authenticated company. Source-owned policy tool `engineering.draft.create` uses the existing policy engine; stronger risk/approval requirements deny.

`EngineeringDraftService` is a small ingress adapter to the existing delivery/manager services. PostgreSQL is mandatory. Its existing unit of work and unique owner/company/key constraint serialize submissions; a complete normalized canonical digest binds content and scope. Authority and registry rows are checked under shared locks, including current session/device/company/membership/workspace/repository/stop state and the live verified-envelope expiry. Exact tool/workspace policy snapshots cannot change unnoticed. Policy evaluation/audit is persisted independently; objective, delivery, digest and completion audit commit together. Failure or expiry before commit rolls partial business metadata back and allows a safe fresh-envelope retry.

The objective is persisted as `DRAFT` with a server-owned `draftOnly` marker; the delivery has `DRAFT` and `draftRequestDigest`. Manager creation returns before decomposition, assignment, Agent OS sessions or model work. Existing execution-producing lookups reject immutable draft markers. Run, pause/resume, recovery, instructions, preview and integration cannot turn them into executable work. Draft cancellation exits before preview controls and terminal continuation listeners, so it cannot wake another workflow. Reads and metadata cancellation remain possible; a canceled draft is not resurrected by retry. Every accepted response explicitly says `executionState: "NOT_STARTED"`.

No new executor, native channel, policy authority or generic idempotency platform was introduced. Existing registered repository and workspace boundaries remain in force. Direct generic execution does not gain an operation merely because this descriptive policy tool exists. The [API reference](13_SIGNED_DRAFT_API.md) documents exact contracts, errors, retry semantics, authority ordering and reader/rollback considerations.

## Source changes

New source: shared `engineering-draft.ts`; narrow `engineering-delivery/drafts.ts`; finite `routes/engineering-drafts.ts`. New tests: shared draft contract and `engineering-delivery/drafts.integration.test.ts`.

Modified source: API composition/context; finite governance tool metadata; shared delivery/objective draft fields/statuses and export; existing delivery/manager draft creation and centralized execution guards; integration guard. Existing delivery audits now carry explicit company/device attribution and truthful draft wording. All modifications preserve earlier local changes in their original worktrees.

**Migration requirement: none.** Existing engineering status columns are unconstrained text, records are JSON, and the owner/company/idempotency unique constraint already exists. All 119 current migrations apply normally to the disposable schemas. Shared schemas give old records non-draft semantics. Coordinated API/shared-reader upgrade is required for new fields/statuses; older strict readers must fail closed. Rollback stops new ingress and retains draft markers/audit rather than reinterpreting a draft as runnable or deleting evidence.

## Verification and evidence

Environment: Linux, Node **22.16.0**, pnpm **11.17.0**, Vitest **4.1.12**, PostgreSQL **18.6**, pgvector **0.8.7**. Database access used only a newly created empty disposable cluster, unprivileged process, private Unix socket, **TCP disabled**, 60 connections and `max_locks_per_transaction=1024`. No ambient production URL or provider credentials were supplied. Test environments allowlist variables, disable implicit env-file loading and keep live-provider acceptance off. Fixture shutdown and worktree preservation are recorded separately. After an initial shutdown, a targeted rerun encountered the stopped socket. An intermediate fixture restart without its private socket options failed before readiness; the same owned cluster was restarted with explicit Unix-only options and the final checks were repeated. No other database or fallback was used; these setup failures are separated from accepted results.

| Check                                                                                                      | Exit   | Exact result                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Frozen dependency installation, lifecycle scripts disabled                                                 | 0      | Inherited reviewed lockfile; no dependency change in E2E-1                              |
| Final focused contracts + signed drafts + MCP/engineering/workforce regressions with disposable PostgreSQL | 0      | **96 passed, zero failed, zero skipped** across thirteen files                          |
| New slice assertions within that run                                                                       | 0      | **20 PostgreSQL API cases + seven contract cases**                                      |
| `pnpm typecheck`                                                                                           | 0      | Whole strict TypeScript workspace passes                                                |
| `pnpm lint`                                                                                                | 0      | Whole configured lint passes                                                            |
| `pnpm test` without any database URL                                                                       | 1      | **1,510 passed, six failed, 124 skipped**; same six deterministic pre-existing failures |
| Three consecutive targeted reproductions of the failing files                                              | 1 each | Same six failures and seven passing assertions each time                                |
| API build                                                                                                  | 0      | API and fixed fixture bundle build                                                      |
| Full workspace build                                                                                       | 1      | Existing Mac native helper build needs unavailable Swift/macOS frameworks               |
| API security invariant checks                                                                              | 0      | Selected source security invariants pass                                                |
| Production example configuration checks                                                                    | 0      | Parser/invariant checks pass; no production configuration changed                       |
| Dependency audit                                                                                           | 1      | Inherited **0 critical, 37 high, 29 moderate, ten low** entries remain; no suppressions |

The full suite intentionally omits database URLs; its database skips are not passing evidence. The focused run contains **42 actual PostgreSQL assertions** (20 new + 22 preserved), plus 54 shared/local-API/stdio/fault cases. It uses real authenticated API composition, cryptography, SQL transactions and adapters. Synthetic keys and controlled storage/audit/timing faults are declared fixtures. They do not replace real Android/Mac acceptance. See [commands](evidence/drafts/commands.json), [test results](evidence/drafts/test-results.json), [source manifest](evidence/drafts/source-manifest.json) and [failure investigation](12_EXISTING_FAILURE_INVESTIGATION.md).

## What the new PostgreSQL cases establish

- **Persistence and attribution:** one objective/delivery/digest, current policy ID and bounded company/device audit; zero tasks, workspaces, validation reports, integration runs or execution requests.
- **Duplicate protection:** four concurrent submissions across two API instances create one objective/delivery; altered criteria, constraints, name or brief under the same key return conflict. New business keys remain distinct owner intentions.
- **Restart and acknowledgment loss:** close/reconstruct API and database pool; the same envelope is still a replay denial, while a newly signed equivalent retry returns the same draft. No orphan objective or duplicated delivery is created.
- **Isolation and authority:** two legitimate companies have separate drafts even with the same business key. Signed/header company mismatch, foreign repository, missing identity/origin/CSRF, tampering, expiry, extra execution/approval fields, revoked session/device/workspace/repository, active stop and stronger policy deny.
- **No activation bypass:** injected brief instructions remain inert; existing run/resume/pause/recovery/instruction/preview/integration paths deny a marked draft. Cancellation remains inert and durable on retry and never calls the registered terminal continuation hook. Non-durable API composition returns 503.
- **Atomic failure behavior:** injected delivery-save or required completion-audit failure rolls objective/delivery metadata back; retained policy evidence explains the operation, and a fresh retry succeeds once.
- **Concurrent revocation ordering:** an in-progress creation holding shared authority locks commits before a waiting revoke/stop update; the update then commits and future requests deny. If revoke/stop is already committed, creation denies. This is explicit database ordering for inert metadata, not an instantaneous distributed stop guarantee.
- **Live expiry:** an envelope expiring at a deterministic pre-commit barrier causes metadata rollback, no success and a safe fresh-envelope retry.

Restart evidence is API/pool reconstruction and transactional rollback, not abrupt host loss or production backup restoration. No queued native work exists to reconcile in this slice.

## Six pre-existing failures: environmental, flaky or defective?

All six reproduce identically in three consecutive reruns and the full suite. No observed flakiness is used as an explanation.

Four corpus tests depend on a hard-coded external developer Downloads file: a genuine **non-hermetic test design defect**, with deterministic missing-fixture failure here, not demonstrated compiler breakage. The Mac discovery test builds a Linux-home fixture outside the unchanged macOS path allowlist; direct schema probes confirm correct product denial and acceptance of canonical Mac roots. The image-builder harness calls host Python 3.10, lacking `hashlib.file_digest`, while reviewed tooling targets 3.12: an environment/toolchain-preflight gap. No source guards were weakened, fixtures silently imported, assertions hidden or tests skipped to make these pass. The separate investigation gives evidence and bounded remediation proposals.

## Capability status and next dependency

Added **`ATHENA.ENGINEERING.SIGNED_DRAFTS`**, verified only for the exact inert backend scope and 27 new passing assertions. Existing IDs are preserved. Broad engineering, Android, workforce and Mac execution claims are not upgraded. Historical source drift remains explicitly flagged for review.

**Next dependency: Android signed draft submission.** Reuse its existing key/session/company/CSRF architecture; preserve a stable business key over timeout/retry, bind signed company/repository/request, call this finite endpoint, and show “saved; execution not started.” Do not fall back to the old auto-driving engineering-create route. Obtain supported SDK unit/build and an actual trusted Android request before accepting that client path.

**Subsequent separate slice:** reviewed activation of an exact draft/version, current policy/approval and real recent authentication where required, delegated scope and trusted Mac finite operations with actual validation/review/cancellation/revocation receipts. The current immutable markers cannot be removed by existing public controls. Activation must not be smuggled into Android submission.

Backend slice recommendation: **READY_FOR_REVIEW**. Overall Android/Mac workflow and production release remain **BLOCKED / REQUIRES_ADDITIONAL_VALIDATION** on device, native-build, dependency and portability gates. No commit, push, merge, deployment, production permission/configuration change or external account connection was performed.

Publication hygiene: credential-shaped values interpolated into security-test titles are redacted in committed test evidence. Assertion outcomes and counts are unchanged.
