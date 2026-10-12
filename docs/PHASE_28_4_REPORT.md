# Phase 28.4 implementation and acceptance report

Updated: 2026-10-03. Repository verification passed; this document does not claim
live cloud acceptance. Earlier-phase architecture remains closed as requested.

## 1. Executive Summary

Implemented Android Engineering controls, company GitHub operations through the
Universal Tool Gateway, bounded project inputs, scoped cloud placement and a Linux
worker entry point reusing the signed execution channel. The phase remains
conditional: provider provisioning, canonical cloud repository preparation,
HTTPS preview hosting and real phone/cloud acceptance are not complete.

## 2. Existing Athena Architecture Reused

Canonical Engineering delivery/objective/task/runtime/integration stores and
services, FAST/FULL orchestration, AIRouter worker, company credential bindings,
Universal Tool Gateway, signed device execution, existing approval/recent-auth
flows, Android session/CSRF/company handling and existing foreground sync.
No second task, agent, approval, memory or execution authority was introduced.

## 3. Android Engineering Command Center

Engineering navigation exposes active/completed/history, projects/repositories,
previews and approvals; search, feature state, agents, elapsed/progress, validation,
blockers, review evidence and recorded model cost. Offline state is labeled and
mutations are disabled. Cached state is scoped to trusted device and company,
requires a session, and sensitive Engineering projections clear on lock, logout,
revocation and company changes. Cost fields without evidence remain unknown.

## 4. Repository / Project Management

ACTIVE canonical repositories can be selected from company projects. The GitHub
screen uses READY company connections, lists authorized repositories and requests
explicit registration. A remote registration with no canonical repository link
is clearly shown as needing workspace preparation. It cannot silently become a
runnable workspace. Provider-backed clone and canonical linkage remain open.

## 5. GitHub Integration

Finite list/register/create handlers and exact schemas are server registered.
Each invocation validates the reviewed provider's credential, READY company
credential/binding and current GitHub permissions. Remote writes use high risk,
recent authentication and the existing exact Gateway approval/audit/receipt path.
Creation claims persist before remote mutation; changed retries and uncertain
creation replay deny. Redirects, response size and duration are bounded.
Distinct bootstrap-reviewed provider IDs support multiple companies per owner.
Raw tokens never enter Android requests, models or audit metadata.

## 6. New Project Creation

Android can request private repository creation through the governed GitHub
handler, and software/self-improvement objectives through existing APIs. Exact
approved retries reuse durable IDs. Repository creation is not yet an automatic
cloud scaffold/clone/build pipeline; that path awaits a reviewed host provider.
Existing canonical local project initialization remains unchanged.

## 7. Existing Mac Repository Support

Existing registered Mac repository/workspace IDs and signed Mac execution remain
available. No owner checkout is implicitly copied to cloud. Canonical MAC_NATIVE
tasks use the Mac path; absent/unregistered local context does not grant access.

## 8. Execution Router

Registered GitHub-to-canonical repository association selects only a fresh TRUSTED
CLOUD_WORKER with exact owner/company/repository/workspace metadata. Revoked remote
access, missing canonical task, stale/future worker presence or missing worker deny.
Portable cloud work does not silently fall back to Mac when its worker is absent.
The shared deterministic routing projection covers Mac-native/local/device cases.
Cloud placement is not claimed for an unprepared GitHub association.

## 9. Cloud Engineering Worker

The Linux bootstrap loads root-owned bounded non-secret configuration, receives
an ephemeral workload key through fd 3, verifies its registered public-key pin,
imports a non-extractable signing key and zeros input buffers. The existing finite
Engineering runtime operates in a dedicated company VM and uses its reviewed
isolated command/dependency containers. Public CLOUD_WORKER pairing is rejected.
The entry point is built; no live trusted workload has been provisioned or run.

## 10. Workspace Lifecycle / Isolation

Existing canonical workspace records, leases, signed execution lifecycle,
heartbeat, cancellation and result verification are reused. The worker requires
an already provisioned dedicated company VM and canonical repository path. A
configuration label does not attest isolation. Reviewed host provisioning,
resource limits, durable volume setup, egress and lifecycle cleanup remain open.
No owner-host Docker socket or filesystem should be shared into the worker VM.

## 11. Dependency / Repo Caching

Existing restricted dependency containers remain reusable. This phase has not
implemented or verified a provider-backed company cache with lockfile/version
invalidation, quotas and lifecycle cleanup. Repository cloning, cache population
and provider storage isolation depend on the selected reviewed host adapter.

## 12. Engineering FAST / FULL Paths

Existing complexity/risk routing and FAST/FULL task decomposition are preserved.
Self-improvement requests still resolve the approved Athena binding on the server.
No manually implemented Codex feature is presented as Athena acceptance evidence.

## 13. Model Routing / Cost Strategy

Existing AIRouter, model policy, budget/usage records and escalation remain the
source of model behavior. Android displays recorded usage cost, not estimates
substituted for actual runs. No new learned model router or AthenaCoder exists.

## 14. Git Operations / Governance

Existing registered finite repository operations, protected paths/branches,
validation and integration flows remain authoritative. Remote repository writes
require exact governed approval and durable receipts. No generic Git/shell URL
or executable endpoint, automatic push, deployment or force-push path was added.

## 15. Preview Infrastructure

Android opens only RUNNING/PASS/unexpired HTTPS previews and rejects local/unsafe
schemes and embedded credentials. Existing local runtime HTTP preview is not
phone-ready. A reviewed tenant/workspace-isolated HTTPS host/proxy with health,
TTL and revocation is still required. No arbitrary-target proxy was introduced.

## 16. Android Realtime State

Existing signed foreground poll carries a bounded Engineering revision derived
from canonical delivery and latest objective event IDs. Changes invalidate the
read projection; background/offline polling stops. PostgreSQL now returns the
latest bounded event window in chronological order, matching in-memory semantics.
This is existing polling-based synchronization, not a new push/SSE transport.
Completion notifications target Engineering builds. Live multi-device latency has
not been measured.

## 17. Clarification / Mid-Build Instructions

Android answers canonical clarification IDs and sends bounded idempotent
instructions through existing APIs. Owner-selected PNG/JPEG/TXT/Markdown inputs
reuse Engineering artifacts with untrusted provenance, digest, immutable receipt,
strict type/size/filename checks and 12-file / 1-MiB objective quotas. PostgreSQL
quota checks serialize on the objective row. Binary bytes stay out of model
context; bounded text excerpts are explicitly untrusted. Image interpretation is
not claimed. No uploaded content grants tool, identity or approval authority.

## 18. Pause / Resume / Retry / Cancel

Finite controls reuse canonical delivery/manager transitions. Cancellation asks
for confirmation; recovery availability comes from the server. Existing leases,
worktrees and lifecycle remain responsible for preserving recoverable work.
No offline command queue or client-selected executor was added.

## 19. Candidate Review / Approval

Android shows changed files, validation/review findings, warnings and exact-head
candidate state. Reviewability requires READY and matching validated/reviewed head.
Merge uses existing canonical approval and biometric inbox; rejection uses the
existing integration service. GitHub approval retries are checked against exact
server authority. No client/model/voice gesture approval shortcut was added.

## 20. Security / Tenant Isolation

Shared Zod boundaries, registered IDs, company context, auth, CSRF, trusted origin,
network verification, exact Gateway reviews, signed envelopes and emergency stop
remain in force. Both server and worker deny cross-company/repository/workspace
scope. Uploads are inert artifact data, not executable files or paths. Production
workload attestation, encryption, isolation and security rollout are not inferred
from test fixtures; they remain prerequisites for live acceptance.

## 21. Crash / Recovery / Idempotency

Android intent IDs persist in encrypted cache under trusted device/company and a
hashed request fingerprint. Canonical server idempotency remains authoritative.
GitHub creation claims prevent replay after uncertain remote outcomes. Input
receipts reject changed-content retries and concurrent quota overflow. Existing
signed nonce/expiry/results and Engineering lease fencing are reused. Provider
VM crash/re-provision recovery has not been live-validated.

## 22. Engineering Speed Benchmark

No genuine phone-to-cloud build has run. Time to provision, clone/setup, first
Engineering action, first model call, first patch, preview, validation, review and
candidate are unavailable. No sandbox/mock timestamps are offered as performance
evidence. The ≤1.25× Codex, 3–7 minute preview and 5–10 minute completion targets
remain unverified. Owner Codex timings have not been supplied or invented.

## 23. Model / Workspace Cost Benchmark

Live model/provider, model/tool calls, tokens, agent count, retries, API cost,
workspace compute/storage/network cost and owner interventions are unavailable.
Unknown cost is not reported as zero. Provider metering/reconciliation remains
open until a reviewed host and governed run exist.

## 24. End-to-End Phone → Cloud Build Scenario

Client controls and server boundary tests exist. A real scenario remains blocked
by: reviewed company GitHub credential/provider activation; reviewed cloud host;
trusted scoped workload; provisioned/linked canonical repository; HTTPS preview
host; real AIRouter and phone acceptance run. No external repository creation,
credential registration, workload trust or deployment has been performed here.

## 25. Test / Build Results

All required repository gates passed:

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | Passed, exit 0 |
| `pnpm lint` | Passed, exit 0 |
| `pnpm test --no-file-parallelism` | 225 files / 1,249 tests passed; four live integration tests skipped; exit 0; 376.71 seconds |
| `pnpm build` | Passed, exit 0; worker entry point included |
| `git diff --check` | Passed |
| Android `testDebugUnitTest`, `lintDebug`, `assembleDebug` | Passed, exit 0; 24 unit tests, zero failures/errors/skips |

Evidence logs are under `node_modules/.cache/phase28_4/`. The full suite includes
the PostgreSQL concurrent input-quota/reconstruction test and latest-event-window
regression. Earlier interrupted/failed runs are not counted as acceptance.
Six pre-existing Mac build artifacts were restored byte-for-byte after build
and verified against saved SHA-256 digests. Build warnings about existing web
bundle size/runtime-config remain non-fatal. Static/integration gates are not
substitutes for the missing genuine phone/cloud acceptance and benchmarks.

## 26. Remaining Limitations

Provider-backed provision/clone/canonical linkage, company cache lifecycle,
resource/egress attestation, HTTPS previews, workspace cost metering and genuine
phone/cloud acceptance remain open. PNG/JPEG files are attached as references,
not interpreted by the model. PDF and arbitrary binary uploads are unsupported.
Android uses existing bounded foreground polling rather than true push state.
No real Engineering speed or cost comparison is available.

## 27. Phase 28 Carry-Over

28.1: real governed company GA4 read, trusted Mac/native acceptance and formal
live evidence remain carry-over where not already demonstrated.
28.2: reviewed company creative-provider invocation/artifact/receipt acceptance
and genuine landing-page Engineering benchmark remain live acceptance only.
28.3: ACTIVE owner/company Athena repository binding, genuine FAST self-improvement
via AIRouter and signed runtime, actual patch/validation/integration/independent
review/update candidate, real metrics, later 3 trivial/3 small/2 medium benchmark
set and owner-entered Codex comparisons remain live acceptance only.
Do not reopen earlier architecture except for an actual defect.
Production migration/security rollout defers to 28.6 unless required earlier.

## 28. Phase 28 Handoff

Continue from this implementation. Obtain reviewed host/provider and company
credential IDs (never raw tokens/keys), then implement the specific provisioning,
clone/linkage, cache, HTTPS preview and metering adapter through existing authority.
Register/activate exact finite GitHub handlers through existing owner review.
Run real phone/cloud acceptance and record all genuine milestones and costs.
28.5 AthenaCoder/training/learned routing and automatic deployment remain excluded.
See `cloud-engineering.md` and `PHASE_28_HANDOFF.md` for deployment boundaries.

## 29. Final Verdict

PHASE 28.4 CONDITIONALLY COMPLETE — FIX REMAINING MOBILE/CLOUD ENGINEERING BLOCKERS
