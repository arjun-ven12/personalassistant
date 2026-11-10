# Phase 28 readiness repair

Assessment date: 2026-10-13. Baseline: [system autonomy audit](system-autonomy-audit-2026-10-13.md) at commit `7ee28be`. This report uses its 0–10 maturity scale and 30/20/20/10/10/10 weights. Scores describe implementation readiness, not successful live deployment.

## Critical defects repaired

- **Emergency stop:** Business dispatch now checks durable governance security state at request entry, final provider boundary, and each retry. External draft writes are covered. Unknown security state denies. A stop after approval, a stop during provider health checking, and a stop between retries produce no subsequent provider call. Denied dispatch is audited and a current policy evaluation is persisted. The already-dispatched attempt is marked uncertain for reconciliation instead of being replayed.
- **Expired or revoked approval:** The shared approval lookup returns only a current `APPROVED` record, bound to owner, company, canonical action digest, and stored action. Business dispatch checks the exact approval ID and required recent-authentication class again before the provider call and retry. Approved requests can now be cancelled. High-risk email/support actions require recent-authenticated approval. Production recent-authentication grants remain enforced by the existing approval route; direct unit-test approval calls are fixtures, not proof of a live grant.
- **Cross-company cache:** Gmail and Stripe result caches include company, credential binding, provider, capability, and idempotency identity, with an action-digest collision check. Gmail's OAuth token cache also includes company. Stripe sends a scoped hashed provider idempotency key. The shared Redis cache now requires both owner and company scope and refuses private reads/writes without it. Two-company tests prove distinct provider calls, receipts, and cached values for the same client key.
- **Stripe verification:** The test-mode adapter re-reads the approved payment intent and checks its version, amount, and currency before mutation. It maps terminal `succeeded` to verified, failed/cancelled states to failed, and `requires_action`, `processing`, missing or unknown status to uncertain. Refund evidence must match approved payment, amount, and currency; mismatched or malformed post-mutation receipts remain uncertain. Neither a refund list nor a later resource lookup can prove the exact earlier mutation during reconciliation. No live charge was made.
- **Retry/idempotency and output safety:** Storage now atomically claims a waiting business execution before provider dispatch; a late waiting record cannot overwrite `EXECUTING`. Provider outputs are validated with a strict Zod result schema. Malformed write responses become uncertain and untrusted extra fields do not enter audits. Business audit metadata no longer includes idempotency keys or external references.

The first milestone is **implemented and passing locally, but not yet accepted for unattended operation**. PostgreSQL-backed concurrency/restart acceptance, real recent-authentication lifecycle at dispatch, and cross-process emergency-stop race testing require a configured database and deployment. The mandatory regression matrix is not fully closed; no unattended business execution is being asserted.

## Original five test failures

The original four corpus failures all came from one hardcoded developer Downloads path. A versioned, deterministic fixture now exercises all seven profiles, ambiguity, response templates, and a non-executable negative example. The fifth failure was a macOS application-discovery test on Linux; it now runs only on macOS. The macOS release workflow still runs the test on macOS. The portable Electron build no longer invokes Swift on Linux; native helpers still build on macOS.

Tightening high-risk approval surfaced three later Phase 26 fixture failures. Their direct-service test approvals now explicitly model a verified recent-authentication grant; production grants still use the existing route. No failing test was hidden. The full local suite result is recorded below.

## Dependency security

The prior lockfile had `@grpc/grpc-js@1.14.4` through `@opentelemetry/sdk-node@0.217.0` and its OTLP gRPC exporters. [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) affects 1.14.0 through 1.14.4 when a gRPC server uses `getAuthContext` with optional client certificates for authentication. Athena has no direct `getAuthContext` or `requireClientCertificate` call in application code; the locked path is telemetry export. The patched 1.14.5 is compatible and now pinned transitively. This upgrade also clears [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4). `pnpm audit --prod --json` reports **0 high and 0 critical** advisories, and 0 remaining advisories at any severity at the time of this check.

## Capability changes

- **Business operations:** Current policy evaluations and audits are produced at the final dispatch boundary; permission, approval, stop, provider health, scoped credentials, receipt verification, and atomic execution claim are checked. GA4 now emits a canonical metric only for one unsegmented, finite, source-period value. Segmented or empty metric queries remain uncertain rather than inventing an aggregate. Production CRM/support/documents/projects/GitHub providers are still unavailable in the inspected bootstrap.
- **Branding:** A registered objective can queue a research task, then a branding task through the existing workforce runtime. A bounded brand contract requires positioning, audience, value proposition, voice, messaging pillars, visual direction, typography, colors, and asset brief. It persists provider/task provenance, cost, duration, evidence, company scope, and immutable versions. Image asset generation is explicitly `BLOCKED_PROVIDER`.
- **Marketing:** The same canonical launch package queues a marketing task only after sourced research and branding pass validation. Its contract includes strategy, channel plan, copy variants, landing-page plan, creative requests, and analytics instrumentation. The output is owner-reviewed and does not authorize spend or publication. A landing-page build request is represented as a plan; no actual site build is claimed.
- **Social media:** Owner-selected channels lead to bounded post concepts, captions, media references, schedule proposals, preview through the package read route, and exact-digest review. Edits invalidate approval; cancellation keeps history. Company identity and credential reference remain null until a real registered account/provider exists. Every post remains `BLOCKED_PROVIDER` for live publication; there is no auto-post route, scheduler, or fabricated provider receipt.
- **Research:** Existing web-search/source-verification routing remains. Launch research requires the workforce task's `RESEARCH_VERIFIED` status and HTTPS source receipts; unsourced or malformed output blocks the package. Contradictory-source analysis and a live quality benchmark remain open.
- **Autonomous engineering:** Existing Phase 27/28 delivery paths were not changed. Linux build portability improved without claiming native Mac or EC2 acceptance.

The cross-department fixture runs one company-scoped objective through research → branding → marketing → social → owner review. It verifies task routing, provenance, immutable versions, replay behavior, edit invalidation, company isolation, and no external publication. It uses fixture workforce results; it is **not** evidence that live providers generated the artifacts.

## Security regression matrix

| Scenario                                                                             | Local evidence                                             | Remaining acceptance                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------- |
| Stop before dispatch, after approval, between retries, across service reconstruction | Business runtime tests; provider call count checked        | PostgreSQL process restart and cross-process race |
| Expired/revoked/wrong-scope approval and changed action                              | Approval lookup and business tests; existing company tests | Live recent-auth grant lifetime at dispatch       |
| Two-company cache and cross-company invocation                                       | Gmail/Stripe collision tests; Phase 26 binding test        | Connected-account acceptance                      |
| Stripe requires-action, timeout, stale resource, malformed receipt and lookup         | Stripe state and reconciliation tests                      | Test-account acceptance without live money        |
| Duplicate retry, claim collision, workflow replay, stale version                     | Business claim and launch fixture tests                    | PostgreSQL concurrency suite                      |
| Malformed provider output and secret redaction                                       | Strict Zod boundary and audit assertion                    | Actual MCP response poisoning test                |
| Rate-limit handling                                                                  | Existing business rate/circuit tests                       | Provider-specific rate-limit acceptance           |
| Audit persistence                                                                    | In-memory policy/audit assertions                          | PostgreSQL audit durability after restart         |
| Credential-reference isolation                                                       | Phase 26 company binding test; social refs remain null     | Registered social provider/account contract       |

## Readiness before and after

| Area                   | Before | After | Evidence                                                                         | Remaining blocker                                                 |
| ---------------------- | -----: | ----: | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Autonomous engineering |   7/10 |  7/10 | Existing reviewed local delivery; portable Linux build                           | Trusted Mac/cloud acceptance                                      |
| Research               |   7/10 |  7/10 | Real search path; source-verified launch gate                                    | Live quality, contradiction, freshness benchmark                  |
| Business operations    |   4/10 |  5/10 | Dispatch policy/stop/approval, scoped caches, receipts, atomic claim, GA4 metric | PostgreSQL/live acceptance and provider breadth                   |
| Branding               |   3/10 |  4/10 | Versioned, provenance-bound brand contract and workforce task                    | Live creative provider and quality review                         |
| Marketing              |   3/10 |  4/10 | Governed strategy/copy/channel/analytics review package                          | Live campaign and landing-page execution                          |
| Social media           |   1/10 |  3/10 | Reviewable channel/post/schedule package with edit/cancel/version history        | Registered account, scheduler, reviewed publisher, reconciliation |

Weighted implementation readiness: **50/100 → 56/100** using the audit's original weights. This is a judgment-based maturity assessment under the same scale, supported by implementation and local fixture tests. **Live deployment success: UNKNOWN.** It is not counted as zero or as a successful acceptance run. Business, marketing, and social external actions remain supervised or blocked.

## Validation and limits

On supported Node 22 and pnpm 11, `pnpm typecheck`, `pnpm lint`, `pnpm test --no-file-parallelism`, `pnpm build`, the API security invariant check, production configuration validation, production dependency audit, and `git diff --check` passed. The complete local suite reported **1,089 passed, 0 failed, 54 skipped** across 195 test files. The skips are gated PostgreSQL/live-account suites and one macOS-only native discovery test; the latter still runs on the macOS release workflow. The new cross-department fixture and focused business/security/provider tests pass within that count.

The local environment has no PostgreSQL test URL, so migration `0110` and durable concurrency/audit acceptance were not run here. The Android `testDebugUnitTest assembleDebug` command was attempted because shared contracts changed, but it stopped immediately because Java and the Android SDK are absent; Android CI must run it. `pnpm format:check` reports 445 repository files with style differences; a repository-wide reformat was outside this repair scope. Deployment requires the new migration and production-security validation before activation.
