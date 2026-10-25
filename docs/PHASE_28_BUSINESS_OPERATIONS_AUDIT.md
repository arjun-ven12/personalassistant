# Phase 28 business operations audit

Status: **IN PROGRESS — BUSINESS_OPERATIONS_NOT_READY — IMPLEMENTATION DEFECTS REMAIN**.
Audit began 2026-10-19. One real market-research campaign reached PACKAGE_READY on 2026-10-24; its artifacts remain drafts.
Fixtures, passing unit tests and configured credentials are not live acceptance.
Prior Phase 28.4/28.5 conditional verdicts remain conditional.

## Live environment observations

- Railway project `modest-clarity`, production environment: existing API and web retained.
- Public API health returned HTTP 200 and `status: ok`. This proves health only.
- Migration recovery and API/web deployment completed on 2026-10-19 (receipt below). On 2026-10-24, hosted health again returned 200 and an authenticated owner session was observed in Default Company. This does not establish live business completion.
- Opened Athena owner login for authenticated dry runs. Owner reports hosted sign-in complete. Latest direction is localhost first, hosted rollout afterwards. Local browser automation is disabled in Codex Work settings; local owner sign-in/UI verification requested.
- OpenAI credential presence confirmed without disclosing its value. Provider activation, exact company scope and real calls are not yet verified.
- Approved migration reconciliation and API/web deployment were performed on 2026-10-19. No publishing, ad spend, external customer communication or cloud provisioning has been performed by this business audit.

## Defects under repair

| Finding | Repair/evidence state |
| --- | --- |
| Marketing research could be generated without retrieved sources | New finite `athena.business-research:research_market` handler routes search through AIRouter and binds every observation to provider search receipts. Requires existing reviewed Tool Gateway activation; no automatic activation. Focused tests in progress. |
| Specialist model context omitted actual campaign/upstream artifacts | Company/product and bounded current dependencies supplied as untrusted context. Exact artifact version/digest checked. Tests in progress. |
| Reconciliation could expose secret-shaped provider recovery output or accept revocation races | Reconciliation validates output secrets, emergency stop and current review/provider binding before/after provider await. Regression suite passed 13 tests initially; final rerun pending. |
| Draft artifacts lacked explicit model/agent/tool provenance | Optional historical-compatible provenance contract; new drafts attributed to owner, AIRouter, Workforce or governed research receipt. Validation in progress. |
| Landing preview alone released campaign dependencies | Require canonical Engineering candidate, validation/build and independent review as well as healthy preview. Real cloud acceptance remains unverified. |
| Direct package route bypassed required approvals | Checks current dependency and artifact evidence plus required/rejected approvals. Tests in progress. |
| Upstream revisions could silently leave stale downstream work | Reject revisions once dependent work/artifacts exist; require a revised campaign. No destructive invalidation or mutation replay. Tests in progress. |
| Draft persistence/audit could partially commit | Wrap canonical draft persistence in existing PostgreSQL unit of work. Database rollback test pending. |
| Brand memory could mix different products within one company | Generation requests now retrieve approved brand context for the exact product label. Tests pending. |
| Calendar generation stopped for manual draft | Repaired with bounded calendar contract, finite specialist generation and owner approval; publishing remains disabled. |
| Phone business objective/campaign controls | Added Athena Business/Campaigns controls for intake, status, blockers, artifacts, approvals, costs, pause/resume/cancel and bounded retries. Android unit/build validation running; no device acceptance. |
| Business improvement and campaign iteration | Added finite improvement/iteration plans, accepted-source campaign linkage and approved strategy initiative drafts in the existing Objective Engine. Real analytics/provider acceptance pending. |
| Creative provider implementations | No actual production image/video handler verified; implementation and provider prerequisites must be distinguished. |

## Canonical live acceptance matrix

| Scenario | State | Evidence needed |
| --- | --- | --- |
| A market research | LIVE PIPELINE VERIFIED; draft synthesis/content review outstanding | PACKAGE_READY; 18 observations, 58 provider-retrieved URLs, two artifacts, settled model ledger; dated evidence below |
| B brand direction | LIVE APPROVAL / MEMORY / PACKAGE VERIFIED | Exact approved artifact, one scoped semantic memory, PACKAGE_READY; no publication |
| C launch campaign | LIVE RUN BLOCKED; REPAIR VALIDATING | Output truncation then missing citation evidence; bounded provider-evidence prioritization repair |
| D product page | NOT RUN | Canonical repository, trusted cloud worker, patch, validation, review, candidate; preview conditional |
| E multi-department launch | NOT RUN | One canonical parent objective and all departmental handoffs; primary acceptance |
| F business improvement | DRAFT CREATED; EXECUTION PENDING | Company evidence, competitor research, prioritized initiatives and governed sub-objectives |
| G campaign iteration | NOT RUN | Actual scoped analytics, diagnosis, revision and owner review |

## Readiness matrix (local checkpoint; live acceptance outstanding)

Live verification is scenario-specific below; no overall production-readiness claim.
Passing local contracts do not satisfy unfinished A–G acceptance.

| Category | Implemented | Locally tested | Live verified | Blocked/remaining |
| --- | --- | --- | --- | --- |
| Research | Finite Gateway + AIRouter retrieval provenance | Yes: source, tenant, secret, receipt contracts | Yes: draft research/package pipeline | Individual factual claim review remains outstanding |
| Strategy | Improvement/iteration DAG, evidenced initiatives | Yes: contracts and PostgreSQL idempotency | No | Real company context, coherence and child-objective acceptance |
| Brand | Full generated direction + approved product memory | Yes: version/digest, review, product isolation | Yes: bounded real generation, owner approval, package | Large Workforce coordination remains pending |
| Creative | Finite reviewed tool contract; unavailable providers exposed | Yes: unavailable/failure/recovery contracts | No | No actual reviewed production image/video provider verified |
| Marketing | Existing coordinator with canonical parent/dependency repairs | Yes: campaign, coordinator, route, persistence | No | Real launch orchestration and package |
| Social | Copy/calendar drafts with approvals | Yes: bounded output/dependency contracts | No | Real draft scenario; publishing not accepted |
| Engineering | Existing conditional cloud path; stronger completion gate | Yes: signed runtime/provider/validation suites | No | Reviewed EC2 image/READY worker/cloud build; HTTPS deferred |
| Analytics | Governed GA4 read and iteration dependency | Yes: scoped adapters/receipts/metric contracts | No | Reviewed company GA4 credential/source/read |
| Tool Runtime | Existing registry/Gateway + reconciliation hardening | Yes: Gateway/auth/schema/PostgreSQL suites | No | Actual reviewed providers/health/calls |
| Agent Coordination | Shared company/product/dependency contracts + one parent | Yes: coordinated fixture and restart projection | No | Real multi-department run |
| Memory | Approved brand context, exact product/source linkage | Yes: memory and tenant suites | Yes: exact approved brand persisted once | Actual downstream generation reuse still pending |
| Approval | Exact artifact version/content digest and package gate | Yes: rejection, mutation, auth and review contracts | Yes: exact brand owner approval | High-risk recent-auth scenario remains unverified |
| Cost Accounting | Existing canonical ledgers; known/unknown projection | Yes: economics concurrency/rollback and telemetry | No | Actual costs and campaign aggregate budget semantics still under audit |
| Android Control | Athena Business/Campaigns UI and finite client actions | 29 unit tests; APK build/UI-test compilation pass | No | Owner local UI and real phone/device acceptance |
| Recovery | Explicit retry, receipt recovery and stale-attempt fencing | Yes: restart/idempotency/failure suites | No | Actual interrupted-provider recovery |
| Security | Existing controls + server-owned company routing | Yes: full local suite and privacy regressions | No | Hosted config/migration and authenticated live verification |

## Continuation

Finish repairs and focused tests, then full lint/typecheck/serial tests/build/diff checks. Run PostgreSQL tests with the isolated test database. Run Android tests/build if Android changes. Never classify implementation gaps as external setup blockers. Record actual run identities, timings, costs, retries and interventions only after authenticated live runs. This is a working audit, not a completion report.

## Local-first verification checkpoint — 2026-10-19

The owner explicitly requested local repair/verification before hosted deployment.
The normal local `.env` points at production Neon. It was **not** used for local
schema changes. An isolated, loopback-only PostgreSQL 17 + pgvector container now
serves `athena_business_test` on port 55433. All 118 migrations applied with
`state: current` and no pending versions. API listens on 127.0.0.1:3001; web on
localhost:5173; actual local `/health` returned HTTP 200.

- Focused business suite: 14 files / 84 tests passed.
- Follow-up router/service/route regression: 3 files, 41 tests passed.
- Full serial suite now targets only the isolated local test database; running.
- Workspace lint and full typecheck pass. Build and Android gates still require clean final runs.
- Automated UI check could not open a local tab: Codex reported
  `Local browser use is disabled in Work settings`. Owner local sign-in and
  browser access requested; no UI success claimed.
- No production reconciliation/migration/deploy performed at this checkpoint.

Additional repairs in this checkpoint:

1. Approved strategy initiatives now include a clearly identified 30-day draft
   review horizon and binary owner acceptance metric. Previously the canonical
   Objective Engine returned clarifications instead of creating the child.
   These drafts remain inert and require owner confirmation/metric review.
2. The canonical AIRouter now resolves company routing policy server-side for
   every company-bound inference, including departments that omit dataPolicy.
   Caller restrictions can only strengthen it; approved-provider sets intersect;
   missing/invalid server policy fails before inference. Unclassified company
   requests are at least INTERNAL. New regression tests pass.
3. Fixed the creative availability fixture to cover the full new launch DAG.
   Fixtures are not creative-provider acceptance.

Still under audit: campaign aggregate budget semantics, actual finite creative
provider availability, live source quality/coherence, canonical initiative
integration evidence and all A–G live objectives. These are not represented as
completed or automatically classified as external blockers.


### Local test infrastructure correction

The first full run hit setup timeouts under concurrent compilers. The next run
then hit an OOM-killed checkpointer because repeated migrations grew the tmpfs
WAL/storage footprint; affected suites failed during database setup. Both runs
were interrupted and **are not clean full-suite evidence**. Regression tests now
use an independent disk-backed local PostgreSQL/pgvector volume at 127.0.0.1:55434,
`athena_regression_test`, 2 CPU/768 MiB, 128 MiB max WAL/64 MiB shared buffers.
The localhost app continues using its separate database on 55433. All network
bindings remain loopback-only. Runtime/EC2 worker limits were not modified.

Observed local HTTP checks: web 200, API health 200, unauthenticated campaign
listing 401. This verifies reachability/auth rejection only, not a completed
business/provider workflow. Clean serial rerun is in progress.

### Local clean serial gate — 2026-10-19

`TEST_DATABASE_URL` explicitly targeted the isolated disk-backed local regression
database. `pnpm test --no-file-parallelism` completed with exit 0: **256 files /
1,496 tests passed; 4 opt-in live files/tests skipped (260 files / 1,500 tests
collected), 271.23 seconds**. This is the clean complete run; prior interrupted
RAM-backed attempts are not acceptance evidence. Workspace lint and final full
typecheck pass. Workspace build and Android final validation are still running.

The local app now uses the separate persistent `athena_business_local` database
on port 55434. It was empty (no owners) before switching; all 118 migrations are
current. Both original temporary database containers are stopped and retained;
the active disk-backed volume is `athena-business-regression-pgdata`. Production
Neon was not used for any local schema changes.

### Completed automated local checkpoint; hosted rollout still blocked

Final gates: full serial **256 files / 1,496 tests passed; 4 opt-in live files/tests
skipped**, lint PASS, typecheck PASS, workspace build PASS (large web bundle
warnings), Android **29 tests across 14 files, zero failures/errors/skips**,
assembleDebug PASS, Android UI-test Kotlin compilation PASS, git diff --check
PASS. No Android physical/emulator UI execution or browser acceptance claimed.
Production config invariant profiles also pass. Six generated Mac outputs were
restored from digest-verified pre-build backups; fresh outputs are archived
locally rather than mixed into the source changes.

After local automated gates, a read-only check of the actual Railway production
environment validated cloud/PostgreSQL configuration, enabled log redaction and
disabled privileged execution. Production migration status remains unknown with
116 applied entries, three pending migrations (0115–0117),
UNEXPECTED_APPLIED_VERSION and REVIEWED_HISTORY_REQUIRED. The approved manifest
still contains 115 canonical entries with **zero current-source hash mismatches**;
it references `br-green-star-azqy7jsy`, whose retention remains unconfirmed.
No production history/schema mutation or deployment was performed.

The owner has been given exact Neon branch/expiration steps and asked to return
only the retained branch ID. Local browser sign-in/automation access is also
pending. The local app remains available at localhost:5173, backed by the
persistent local `athena_business_local` database on port 55434. Existing
production secrets were never printed or moved into the local database.

Machine-readable evidence with changed source digests:
`docs/evidence/PHASE_28_BUSINESS_LOCAL_VALIDATION_20261019.json`.
This checkpoint is **not** the final business-readiness verdict. The full A–G
live audit, campaign aggregate budget semantics and provider availability review
remain open; do not misclassify those unfinished audits as completed features.


## 2026-10-19 — Retained recovery confirmed; migration fix executed

Owner confirmed `br-green-star-azqy7jsy` auto-deletion OFF and explicitly
requested approved migration reconciliation/deployment, plus a localhost login
repair. Owner attestation is recorded; no recovery restore drill is claimed.

- Approved manifest: 115 canonical SQL hashes still match; no replacement or
  broad lineage bypass. Fixed history reconciliation committed. Its exit 1 was
  expected `outdated` status with 0115–0117 pending and no lineage issues.
- Fixed migration deploy succeeded: **current, 119 applied ledger entries,
  zero pending migrations, zero issues**. That includes the retained annotated
  historical diagnostic row; canonical migration count remains 118.
- Reviewed 0115–0117 are additive tables/indexes/identity constraints. No canonical
  data rows or migration history were deleted. Pre-deploy migration checks stay.
- Local database had zero owners: hosted credentials cannot authenticate locally.
  Owner must use Create the initial owner for the separate local database.
- Fixed a real rate-limit error: the Fastify error builder returned a nested
  response object without top-level statusCode/message, so error normalization
  converted rate exhaustion into generic 500. It now returns ApiSecurityError
  429/RATE_LIMITED. Authentication limits and recent-auth/CSRF controls unchanged.
- New regression verifies first five bad logins 401, sixth request 429 with
  Retry-After and no session cookie. API test file: **26 tests pass**.

Latest full rerun is **not clean**: host disk dropped to roughly 115 MiB free,
Docker's local database exited with I/O errors, and dependent PostgreSQL cases
failed during setup. Do not report this run as acceptance. Docker volume/local
source preserved; no cleanup/prune/factory reset performed. Free space later
fluctuated by several GiB as the host recovered. Automatic Docker restart has not
confirmed Engine running; owner asked to inspect Docker Desktop. The local API
cannot authenticate against an unavailable database.

Continue validation with the already configured isolated Neon TEST_DATABASE_URL
(distinct test endpoint; never production DATABASE_URL). Full suite, lint,
typecheck and final build pending for the new rate-limit patch. Existing clean
1496-test run predates this small patch. Do not claim a new clean result yet.
No new Railway application deployment has been started at this checkpoint.

### Local database/API recovered without data removal

Docker required a force-stop/restart of its unresponsive desktop processes after
ENOSPC; no factory reset, prune, image removal or volume deletion was performed.
Restarted the existing `athena-business-test-pgvector` container and verified
PostgreSQL accepting connections. The local owner and default-company linkage
both survived (one owner, one non-null default-company reference; no private
owner fields read or printed). API had independently exited because its logger
could not write to the full disk. It was restarted in a detached development
session with its log at ignored `.local/athena-local-api.log`. Local API and web
again return HTTP 200; actual owner password login still requires owner/browser
verification and is not claimed from these health checks.

The ignored local API `.env` now defaults explicitly to
`athena_business_local` on 127.0.0.1:55434, PostgreSQL/development mode and the
same tested loopback/origin settings. This prevents normal local starts from
accidentally targeting production Neon. Existing test endpoint remains separate.
The previous environment is backed up privately (0600) under ignored
`apps/api/.local/env-before-local-database-20261019`; do not print or commit it.
No provider secret values or production application rows were copied into the
local database. Railway production environment was not changed by this step.

Fresh workspace typecheck completed serially with exit 0. Full test suite is
running on the existing separate Neon test endpoint; all cases reached so far
pass, including real PostgreSQL budget/restart/lineage protections. This is
persistence testing with fixture model providers, not live model acceptance.
Final lint/build, application deployment and hosted verification remain pending.


### Fresh release gates passed; API deployment started

Fresh complete serial suite on the existing isolated Neon test endpoint passed
with exit 0: **256 files / 1,497 tests passed, 4 opt-in live files/tests skipped
(260 files / 1,501 collected), 959.24 seconds**. This supersedes the failed local
Docker-outage attempt. Skipped live providers remain unverified. New login
regression file passed all 26 tests. Workspace typecheck (serial), lint (zero
errors, one existing Fast Refresh warning), full workspace build (existing
runtime-config/large-chunk notices only) and git diff --check pass. Six generated
Mac outputs restored from digest-verified baseline; fresh outputs retained under
ignored `.local/business-build-output-20261019-deploy`.

API source uploaded to the existing Railway production service. Deployment ID:
`5a8d047e-7c09-472e-b611-46274344fcee`. Its build was observed progressing through
successful bundle build and production package deployment. Application deployment
health/pre-deploy result and frontend rollout are still pending at this entry.
No production migration guard or service security configuration was bypassed.

Machine-readable release evidence:
`docs/evidence/PHASE_28_DEPLOYMENT_20261019.json` (in progress until both services
are verified). Source includes existing uncommitted Documents/business repairs;
CLI upload is not a Git commit or GitHub push. Business A–G live acceptance,
physical Android acceptance and cloud-worker/preview acceptance remain open.


## 2026-10-19 — Migration recovery and API/web deployment COMPLETE

This receipt supersedes earlier pending-deployment notes for the login/recovery
subtask; it does not close the broader business-readiness audit.

- Production reconciliation and migrations: **current**, 119 ledger entries,
  zero pending migrations, zero issues. Unknown historical SQL remains explicitly
  unverified; the annotated diagnostic record was preserved.
- Existing Railway API deployment **SUCCESS**:
  `5a8d047e-7c09-472e-b611-46274344fcee`.
  Fresh deployment metadata confirms `node dist/database.js deploy` retained.
  Direct API health 200/ok; unauthenticated campaign access 401. Post-deploy
  database status rechecked current with no issues.
- Existing Railway frontend deployment **SUCCESS**:
  `efbda7f6-dc45-487f-b759-87119762f939`.
  Hosted root 200; runtime-config 200 with same-origin API and no-store;
  frontend-proxied health 200/ok; session/campaign requests without cookies 401.
  New `/assets/index-KEvqnF5M.js` returns 200 and contains new launch/iteration
  contracts. These are actual hosted smoke checks, not owner-login acceptance.
- Fresh release validation: **1,497 tests / 256 files pass; 4 opt-in live
  tests/files skipped**, serial workspace typecheck PASS, lint zero errors/one
  existing Fast Refresh warning, full workspace build PASS (existing warnings),
  diff check PASS. No Android code changed in the final login patch; previous
  29 Android unit tests/APK/UI-test compilation remain the recorded mobile gate.
- Local owner/default-company records survived the disk/Docker outage. Local
  API/web restored, rate-limit error now 429 rather than generic 500, and ignored
  local API environment defaults to the isolated local database. Owner must use
  the local account locally; no password or token was requested/read.
- No worker marked READY, no preview enabled, no live cloud baseline, teacher
  example/dataset acceptance, publishing or ads performed by this deployment.
- Source remains uncommitted. CLI upload is an actual deployment, not a GitHub
  push; commit reviewed source before continuing from another checkout/device.

Final release evidence and source digests:
`docs/evidence/PHASE_28_DEPLOYMENT_20261019.json`.
Exact next business-audit task: authenticated owner verification on the hosted
release, intended company/product confirmation, remaining budget/provider audits
and available real A–G dry runs. Keep the overall business verdict IN PROGRESS /
NOT_READY while those implementation audits and live acceptance remain open.

## 2026-10-24 — Business audit resumed

Owner selected **Athena personal assistant / Default Company** for draft-only
research, brand and launch acceptance. Authenticated hosted UI was observed:
company ACTIVE, GitHub and Railway governed integration bindings READY, no
connected information source, and zero campaign drafts. No provider secret or
session credential was read. Hosted proxied health returned HTTP 200.

Confirmed implementation findings and changes:

- Specialist dispatch previously assigned up to the entire campaign credit
  allowance to every child. It now shares the exact canonical per-deliverable
  allocation used by the Objective Engine projection. Zero allocation fails
  before task creation; stable task idempotency and existing Workforce
  reservations remain authoritative. This is an internal-credit repair, not a
  claim that campaign USD/model/tool aggregate budgets are closed. Those
  semantics remain under audit.
- Hosted Marketing was read-only and had no campaign intake/start path. Added
  bounded research/brand/launch/improvement intake and explicit start/pause
  controls through existing API routes. Shared schema validation, session/CSRF,
  company binding, draft idempotency and approval gates are retained. Defaults
  are 20 internal credits, zero tool/ad allowance and draft-only constraints.
  This change is local source until a fresh reviewed release is deployed.
- Focused marketing service/coordinator suites: **36 tests / 3 files PASS**.
  Focused API-client/service suites after browser controls: **41 tests / 2
  files PASS**. These overlap and must not be summed. Full release gates running.
- Initiative bridge repaired: newly generated outcomes require at least 20
  trimmed characters, matching the existing Objective Engine. Historical short
  drafts remain readable; attempting to draft one returns bounded HTTP 400
  `INITIATIVE_OUTCOME_CLARIFICATION_REQUIRED` before objective creation.
  API-client/service regression checkpoint: **42 tests / 2 files PASS**.
- Additional implementation audit still open: aggregate model/tool budgeting;
  reviewed research provider activation/control surface and actual provider
  availability. No paid model cost is inferred from internal credits.

Local API/web were not running at resumption. Docker Desktop startup requested
without administrator commands; preserved local database is the only intended
local target. No production migration was rerun and no worker marked READY.

A–G acceptance remains NOT RUN; repository/provider tests are not live business
evidence. Verdict remains **BUSINESS_OPERATIONS_NOT_READY — IMPLEMENTATION
DEFECTS REMAIN** until the implementation audit and real scenarios are closed.

### Owner-approved fresh local account setup

Owner chose a fresh development database after the preserved October 19 account
rejected the supplied password. Created `athena_business_local_20261024` on the
existing loopback-only PostgreSQL container; **118 migrations applied, zero
owners** before registration. Switched only local API configuration and restarted
local API; health 200. Original `athena_business_local`, account and records remain
intact. No password reset, auth bypass, production database change or deletion.
Local registration screen prepared; owner must enter and submit credentials.
Private configuration backup is ignored under `apps/api/.local`; never publish it.

### Read-only hosted model/economics observations

Hosted AI Usage UI showed economic authority READY / POSTGRESQL, an enabled
OpenAI provider budget of USD 15 monthly with require-approval overflow, and
GPT-5.6 Luna assigned to the remote interpretation/reasoning/writing/coding roles.
These are configured/read-model observations, not a successful fresh inference.
Displayed USD 0.013574 spend / five cloud requests are historical and must not be
attributed to this audit. No budget or provider permissions changed.

Found a display defect: absent global budget produced misleading remaining USD 0.
Local AI page now labels global budget/remaining UNKNOWN when no global limit is
known; unavailable spend/projections likewise remain UNKNOWN. Provider policy
and enforcement are unchanged. Fresh post-change typecheck/lint remains required.

### Fresh local UI and release gates verified

Owner completed normal registration in the fresh local database. Actual browser
flow saved campaign `cbc9c9a1-a9a3-466f-bfd7-8b33ae6ae68a`, company
`5138ae65-4b79-40a5-8d3e-8e53e047d8bc`, canonical objective
`b5733ced-88ef-430a-8c21-9abe12d11384` at 2026-10-24T03:35:56.976Z.
PostgreSQL verifies one DRAFT v1, two deliverables, zero artifacts. Canonical
Objectives UI shows the same ID, AWAITING_CONFIRMATION, zero active agents.

Attempting Start was denied with `CAMPAIGN_AUTHORITY_UNAVAILABLE` while the
local emergency stop remained active. No stop was cleared and no task, model
call, research evidence or completion was fabricated. The fresh local tool
registry has zero records for `athena.business-research:research_market`.
Research registration/review/activation and owner-authorized runtime readiness
remain necessary before actual research. Intake verification is not scenario A
provider acceptance.

Additional observed UI gap: campaign-bound Objectives still display generic
activate/replan/modify controls and cancelled historical generic plan rows.
Server campaign-control guards remain authoritative; review UI alignment before
claiming a complete owner workflow. No generic activation was attempted.

Release gates: **1,500 tests / 256 files PASS**, four opt-in live tests/files
skipped, 622.85 seconds; workspace build PASS; final serial typecheck PASS; final
lint zero errors/one existing Fast Refresh warning; diff check PASS. Sixteen
tracked generated Mac outputs match the digest-verified pre-build state.
No Android source changed this continuation, so Android gates were not rerun.

Fresh production preflight: 119 ledger entries, state current, no pending
migrations; actual production environment passes existing security schema and
cloud/PostgreSQL profile checks. API deployment requested:
`c1d17816-6cef-47a5-8485-58c998b9dfa9`. Deployment results pending.

Evidence: `docs/evidence/PHASE_28_BUSINESS_CONTINUATION_20261024.json`.
Local screenshot: `docs/evidence/PHASE_28_LOCAL_CAMPAIGN_20261024.jpg`.

### First continuation release deployed; hosted intake exposes a real defect

API deployment `c1d17816-6cef-47a5-8485-58c998b9dfa9` and frontend
`a59b523d-bb38-40f5-9800-5c8d8444229d` both SUCCESS. Root/runtime-config/health
200; unauthenticated session/campaign access 401. Runtime config retains same-origin
API/no-store. New bundle `/assets/index-NElpMJc0.js` contains campaign controls.

Authenticated hosted owner created one real draft in Default Company:
campaign `3358ea01-29d9-47de-8cff-5ff61f949977`, objective
`1dabab48-eb1b-44ed-96ef-e3401bfbd532`, created 2026-10-24T03:45:00.578Z.
Start persisted ACTIVE but no deliverable ran: the coordinator unconditionally
required PRIVATE_NETWORK even though server transport explicitly permits the
cloud profile. This is an **implementation defect**, not an AWS/provider
credential blocker. Owner-authorized UI Pause was applied; scoped READ ONLY
PostgreSQL lookup confirms PAUSED v3, two deliverables, zero artifacts and zero
registered research tool records. No session was fabricated or credential read.

Repair uses one existing SecurityMiddleware transport predicate for HTTP and
background coordination. Explicit private profiles continue to reject UNKNOWN;
cloud profiles retain the actual UNKNOWN state for downstream policy. No verifier
state is upgraded, no private/native/workload check removed, no Mac dependency
added. Focused private/cloud/Gateway tests PASS (9 tests / 3 files).

Added a read-only registered-tool inspection endpoint with exact owner/company/
provider/review matching, shared Zod response contract, and finite research setup
controls using existing lifecycle register/review/activate APIs. Activation remains
a separate owner action, not an inference side effect. New focused route/client
checkpoint PASS (15 tests / 3 files, overlapping earlier counts). Full new release
gates running against the isolated local test database. No research acceptance yet.

### Coordinator/research control release gates PASS

Fresh full suite on the isolated local regression database: **1,502 tests /
256 files PASS**, four opt-in live tests/files skipped, 396.15 seconds. Final
serial typecheck, lint (zero errors/one existing warning), workspace build and
diff check PASS. These are validation timings, not a cloud/model benchmark.

Local UI verifies the research adapter is absent and Review/Activate disabled;
no local emergency stop was released. Tool inspection regression rejects missing
authentication, wrong company selection and inconsistent provider company binding
without exposing schema metadata. Existing Gateway authority and signed/runtime
tests are included in the complete suite. No new endpoint can execute a tool.

Second release requested: API `908844a6-71d0-4f2b-a77c-258f69be60a6`, frontend
`15a1da1b-1008-4295-a0cb-b629bdf4219f`. Wait for actual SUCCESS/health before
owner review/activation. The hosted audit draft remains PAUSED.

## Live research activation and denied attempt — 2026-10-24

Both follow-up deployments succeeded: API `908844a6-71d0-4f2b-a77c-258f69be60a6`,
web `15a1da1b-1008-4295-a0cb-b629bdf4219f`. The owner explicitly approved
`athena.business-research:research_market` version 1, schema SHA-256
`02c35661a266a30216794295a6bb38c1740da3e382f6118bbed88c67c0a3d75d`.
The authenticated company UI then activated the reviewed capability.

The same campaign `3358ea01-29d9-47de-8cff-5ff61f949977` was started at client
click time `2026-10-24T04:07:52.797Z`. The research attempt was blocked before
receipt reservation or model invocation. Scoped read-only production inspection
confirmed audit `EXECUTION_AUTHORITY_DENIED`, policy `NETWORK_NOT_VERIFIED`
(actual network state UNKNOWN), zero matching receipts and zero matching model
usage rows. No cost-zero or provider-success claim follows from missing rows.
The campaign persisted BLOCKED, version 6 at `2026-10-24T04:07:53.225Z`.

Root cause: the shared policy accepted only PRIVATE_NETWORK or a trusted signed
cloud device, including for reviewed read-only external research from an
ordinary authenticated cloud browser. The narrow repair adds an internal
Gateway-derived assertion for the exact server-reviewed `universal.external_read`
binding, matching authenticated session, company and READ/session/read_only
semantics, only when private networking is not required. UNAVAILABLE verification
still denies. It does not fabricate private-network/device/signature state.
Private deployments, unrelated tools, writes and device-required execution keep
the existing restrictions. Policy audit records identify the cloud READ rule;
policy itself remains non-executing and the exact expiring Gateway grant remains
mandatory. There is no request-body field for the assertion.

The web UI now exposes the persisted blocker code and the existing bounded
research recovery route. Recovery is explicit; start does not silently replay a
blocked attempt. Full validation and deployment of this repair are pending at
this checkpoint. No research artifact or live provider acceptance is claimed.

### Cloud READ repair release result

Validation completed: 256 files / **1,510 tests PASS**, four live provider
files/tests SKIPPED, 355.58 seconds. Full typecheck PASS; lint PASS (one existing
Fast Refresh warning); build PASS; diff check PASS. Production security config
validation PASS; migration status current, no pending migrations. Both existing
Railway services deployed successfully: API
`0fb54d8e-cc3c-42d2-917a-11202f2f12fe`, web
`a00d2f56-0745-4923-9b84-01920f230cdf`.

Codex browser access became disabled during this continuation. A setting-change
request is pending with the owner. No owner-authenticated recovery/resume was
performed after release; the original BLOCKED campaign and attempt history are
preserved. The approved capability remains enabled, but activation is not live
research acceptance. Next action is restore browser access, inspect current
campaign, recover research explicitly, then resume and read receipt/artifact/
ledger evidence. The full audit remains NOT READY; other implementation and
provider/device acceptance gaps remain listed above.

## Genuine research acceptance — 2026-10-24

Browser access was restored; the owner signed in after session expiry. The
existing blocked research draft was explicitly recovered to version 2, then the
same campaign/objective resumed through authenticated, CSRF-protected UI.
No replacement objective, manual output or direct provider invocation was used.

- Campaign `3358ea01-29d9-47de-8cff-5ff61f949977`, objective
  `1dabab48-eb1b-44ed-96ef-e3401bfbd532`: PACKAGE_READY, campaign version 12.
- Successful invocation `c68762d8-0bbe-438d-a874-1d1f821d4c2c`; completed SUCCEEDED
  receipt and matching successful audit event.
- Research artifact `782572ce-2fa8-4c0a-a45b-b140f323a0f0`, version 2, digest
  `c508b6007d3915a3b412b8549c91e0ece012c276c102bdb83bc11f8c961504a7`.
  One research artifact and one package artifact; no duplicate artifact writes.
- 18 sourced observations; 58 provider-retrieved source URLs retained in
  provenance with fetch timestamp, model request/provider/model and invocation.
- OpenAI / GPT-5.6 Luna, one settled model request, 33,826 input + 3,245 output =
  37,071 provider-reported tokens. Recorded model cost USD **0.06627600**.
  Search/tool fees UNKNOWN, not zero.
- Successful Gateway elapsed 36.225s; resume-click to persisted package 36.539s;
  model-ledger interval 34.643s. These exclude earlier setup/blocked time and
  are not cloud Engineering/AthenaCoder/Codex performance evidence.
- Provider retry count 0. One earlier denied attempt and one explicit draft
  recovery preserved. Owner activation approval and session reauthentication
  occurred; no content approval or publishing was performed.

This verifies real governed retrieval, persistence, source provenance and model
accounting. Individual claims remain draft synthesis, not independently verified
facts. Do not promote draft privacy, pricing or performance assertions into
approved brand memory. See `docs/evidence/PHASE_28_LIVE_RESEARCH_20261024.json`.

## Brand live failure and contract repair — 2026-10-24

Campaign `2ca1e39e-c8f5-4554-b65c-ed30ef57ca67`, canonical objective
`c9180b3c-c456-4ac0-a21a-b04fc312a497` was created and started through hosted UI.
Research completed and persisted. Brand request
`6c50f3c6-150d-4b4c-9358-8242d8f8f314` returned ROUTING_FAILED /
REJECTED_INVALID_OUTPUT / OUTPUT_VALIDATION_FAILED after the existing structured
repair attempt. No brand artifact exists. Brand deliverable persisted BLOCKED.

Root cause: direct Marketing generation passed a Zod validator but omitted
`jsonSchema` and did not enumerate its fields in the prompt. OpenAI received
only generic JSON-object mode. The repair sends the exact existing generated
contract via AIRouter; URI annotation handling matches Workforce's reviewed path.
No validation is weakened and no brand content is hand-authored. A regression
asserts nested required brand fields reach the provider and incomplete content
still creates no artifact. Focused 37 tests / three files PASS. Full gates running.
Web recovery now exposes the existing guarded draft recovery for eligible types;
Engineering/creative/package/rejected artifacts retain their dedicated paths.

Brand research cost USD 0.05399500 (27,499 reported tokens). Failed brand call
has no reported usage and ledger source ESTIMATED; billing remains UNKNOWN even
though the failed row stores a zero actual-cost placeholder. Do not sum it as a
free invocation. No blind retry was performed.

Follow-up repairs from the live failure:

- Campaign telemetry now treats `usage.source=ESTIMATED` as unknown cost even
  when a FAILED row contains a zero actual-cost placeholder. This preserves the
  original ledger and excludes unsupported amounts from known totals.
- Authenticated router activity previously exposed the shared in-process event
  list without owner/company filtering. It now requires company context and
  filters on the trusted scope captured at completion. Unscoped events stay
  hidden; retained activity is bounded to 1,000 entries. Cross-owner/company
  and missing-context regression tests pass. No public registration or model
  execution surface was added.
- Focused service/router/telemetry checks: 47 tests / three files PASS.

### Brand/schema/accounting/diagnostic isolation final gates

Final frozen-source validation: 256 files / **1,513 tests PASS**, four live
provider files/tests SKIPPED, 211.59s. Full typecheck, lint (one existing Fast
Refresh warning), build and diff check PASS. The earlier in-progress validation
was not a final release gate: diagnostics changed while it was running and its
new isolation test loaded an older cached implementation. The complete final
run above is clean. No runtime code changed after this final run began.
Sixteen tracked generated Mac artifacts were restored to their preserved baseline;
fresh build output retained privately. Existing API/web release requested.

## Brand generation live repair result — 2026-10-24

Release API `1947f461-a538-439c-9ceb-4f6d9d48f573` and web
`3c15e9d1-82b7-40c4-b936-61027ead037c` both SUCCESS. Existing brand deliverable
was explicitly recovered and resumed; its research artifact/invocation was reused.
Schema-controlled generation succeeded with one new settled Luna request
`ff0881a6-ce92-42e6-95ca-3fb01bb83569`: 6,198 input + 1,551 output = 7,749 tokens,
USD 0.02170800. One brand artifact was stored, with full direction/palette/fonts/
naming/ICP/prohibited claims and original source context. No manual content or
fake model output. This is generated/validated draft acceptance, not owner approval.

Campaign then safely blocked before approval. The detector treated the sentence
“Avoid imagery that implies surveillance, magical autonomy, or guaranteed privacy.”
as a positive sensitive claim. The repair recognizes only complete unambiguous
prohibitions with a finite grammar; mixed, quoted, conditional and positive
sensitive assertions still require the existing high-risk path. Adversarial tests
cover positive claims, conditionals, semicolon mixtures and separate assertions.

Cloud ordinary artifact review additionally needs its own authenticated transport
semantics: added a service-owned assertion after exact company/current artifact/
version/digest checks for `marketing.review_artifact` only. It can create an explicit
approval record or honor its exact matching owner decision; policy remains
non-executing. UNAVAILABLE, emergency stop, private deployments, missing identity,
unrelated tools and sensitive claims retain denial. No native/device signature or
publishing boundary is relaxed. Full validation is running before deployment.

### Review repair final verification

Finite advisory phrase allowlist and exact cloud artifact review: clean serial
suite 256 files / **1,516 tests PASS**, four live provider files/tests SKIPPED,
222.03s. Typecheck, lint (one existing Fast Refresh warning), focused lint of
final finite-phrase refinement, build and diff check PASS. Final runtime source
was frozen for the clean run. Earlier validation while tightening the phrase
matcher was superseded, not counted as release success. API-only release
requested; web remains on successful `3c15e9d1-82b7-40c4-b936-61027ead037c`.

## Owner-approved brand and memory-boundary recovery

Owner explicitly approved exact brand artifact v1/digest
`b5159a32c8ca44240d6422058b5a492c15d4629d301e93a5621e460be370cb20` in this chat.
The authenticated Approvals UI saved request
`0c50387b-d6c0-4402-b52e-7c78931f240a` as APPROVED; brand artifact and deliverable
became APPROVED/COMPLETED. No other expired approval was acted on. Owner approval
is draft/brand-memory approval, not independent feature verification or publishing.

A subsequent genuine blocker was confirmed: stable brand snapshot exceeds the
hardcoded 4,000-character promotion bound (SQL normalized representation 5,788
characters), despite the canonical memory contract allowing 10,000 characters.
The repair shares one 8,000-character bound for brand persistence and aggregate
approved context retrieval. The existing 12,000-character Marketing request guard
remains unchanged. No approved text or prohibited claims are truncated. Oversized
snapshots still deny. Regression lifecycle covers a >4,000-character brand, exact
approval, idempotent promotion, complete-field retrieval, source revision/rejection,
tenant denial and >8,000-character refusal. Twelve focused tests PASS.

The existing authenticated/CSRF/company `/brand-memory` route is exposed as a
finite “Save approved brand to memory” UI action, checked against the selected
approved digest. This permits recovery after promotion fails following successful
approval; it does not approve a source or regenerate content. Full gates running.

## Hosted brand memory and package completion — October 24, 2026

Browser access restored. The authenticated Default Company Marketing action saved
the exact owner-approved brand digest without another approval or generation.
Read-only PostgreSQL verification confirms exactly one semantic memory
`ec011647-c7ba-4f58-b0e0-607a866116bf`, 5,707 characters, company/campaign/digest
tags and source artifact/version digest provenance, observed 09:00:32.053Z.

Resuming the same campaign produced PACKAGE_READY v17, 100% in the UI. Package
`29e79ec4-33f5-4aff-80de-1c344d44c35b` persisted 09:00:36.921Z, 0.216 seconds
after the resume click. Research and approved brand were reused; ledger remains
exactly the prior three requests, with no new model calls or research invocation.
Known settled model cost remains USD 0.07570300; failed-call billing and search
fees remain UNKNOWN. This successful recovery interval excludes prior repairs.

Package is a reviewable draft, with public actions still pending approval. The
package deliverable retains historical COORDINATION_REVIEW_REQUIRED metadata
despite DRAFT_READY; campaign/UI correctly report PACKAGE_READY. No publishing,
preview or full business-operations acceptance is claimed. No runtime source
changed this recovery; deployed source retains the previous clean 1,516-test,
typecheck/lint/build validation. Full audit and cloud acceptance remain conditional.

Evidence: `docs/evidence/PHASE_28_LIVE_BRAND_20261024.json` and
`docs/evidence/PHASE_28_BRAND_PACKAGE_COMPLETE_20261024.jpg`.

## Launch audit continuation and evidence/cost repair — October 24, 2026

Real launch campaign `ba9c9527-ff94-4bc4-9397-c56499d8286b`, objective
`996a6378-87f2-449f-8130-0c618e08de37`, created through authenticated Marketing UI.
Twelve canonical deliverables planned. First research model output exceeded its
output token limit; the Gateway preserved an INDETERMINATE receipt and no draft.
The next attempt succeeded at AIRouter (20 observations, 46,473 tokens, known
USD 0.07622700) but failed handler citation grounding: eight cited URLs were
absent from the retained first-60 source evidence. No fabricated artifact saved.
Failed first-call billing and unreported search fees remain UNKNOWN.

The provider evidence collector now prioritizes cited URLs only when exact URLs
exist in actual provider retrieval metadata, then fills the same 60-URL bound.
Model-only citations remain excluded. Research asks for 8–12 concise observations
and a <=200-word summary within the unchanged output budget. No schema, trust,
approval, tool activation or external-read authority broadened.

Also repaired completed-draft blocker cleanup, and wired the existing canonical
telemetry projection into the Marketing cost panel using one shared strict Zod
contract. Unknown costs stay explicit; known recorded costs are not called totals.
No new ledger, pricing estimate or USD-to-internal-credit conversion introduced.
Authenticated localhost cost panel verified against the preserved local draft.
No local tool activated or E-stop disabled.

Final validation: 67 focused tests; full clean serial suite 256 files / 1,518 tests
PASS, 4 opt-in live files/tests SKIPPED, 237.50 seconds. Lint PASS with existing
Fast Refresh warning; typecheck/build/diff check PASS. Earlier full run interrupted
when the citation defect was found, not counted as passing. Build outputs preserved
privately, 16 generated files restored by pre-build SHA-256. No Android source
changed this continuation; Android gates not rerun.

API deployment `6b7ad540-4c8e-43c9-b7f5-234d754279ce` SUCCESS.
Web deployment `9643b884-c6e4-4085-86d2-cd022c99ae69` SUCCESS. Production config
parse PASS: cloud/PostgreSQL, redaction enabled, privileged execution disabled.
Pre-deploy migration validation retained. Public health 200; unauthenticated
session/campaign routes 401. Same research deliverable explicitly recovered to
v3 using ordinary owner controls; final bounded retry running, no reset/bypass.

Default Company Gateway metadata confirms only the reviewed research provider
and READ capability enabled. No company image/video capability is registered.
Other integration records marked installed do not prove credential readiness or
live execution. Growth-strategy scenario draft created, execution pending.
Full business verdict remains NOT_READY; cloud/preview/analytics/creative live
requirements remain unmet, and aggregate campaign budget semantics still need audit.

### Bounded citation synthesis recovery — release validating

Final launch v3 attempt also failed grounding: one unsupported citation, although
the provider model completed (36,849 tokens, USD 0.05819700). Launch is BLOCKED
v12 with zero artifacts; all three research attempts retained and retry cap
preserved. Total known launch model cost USD 0.13442400; failed first billing and
search fees UNKNOWN. The growth-strategy campaign
`6f9ab9f2-4613-4d4f-9d19-36a555fb53c0`, objective
`f1f629e7-e5a4-47bd-8596-f922fdfecd07`, similarly rejected one unsupported citation:
37,181 tokens, USD 0.05737700, no artifact. Neither rejection is live completion.

A single bounded repair is now implemented through existing AIRouter: server
retains only observations with exact provider retrieval evidence, excludes the
unsupported observations and original summary from repair context, and asks for
only a new summary. The repair cannot mutate observation fields or add sources.
Original and repair model request IDs are bound to the existing company audit;
both are charged through the same canonical task ledger; Gateway retryCount=1.
No new search/tool call, generic execution, authority, source, ledger, schema
activation or campaign retry grant exists. Revalidate company/campaign/version,
active status and live emergency stop; missing audit/security dependency denies.
A failure or audit write failure yields no accepted result.

Focused final regression: four files / 27 tests PASS, including paused/stale scope,
emergency stop, failed repair, extra observation rejection, audit failure and
canonical attribution. Full final typecheck/lint PASS (one existing warning);
clean serial suite running. The earlier 1,518-test release remains valid for its
source, not evidence for the new bounded-repair source. No second release yet.

Completed-draft blockerCode clears on persistence; UI also hides historical codes
when a deliverable is no longer BLOCKED, covering pre-existing completed records
without direct production data edits.

Current company credential references: GitHub READY (1), Railway READY (1).
No GA4/creative/AWS company reference in actual hosted records. Environment secret
presence is not credential-reference readiness. Keep AWS image/runtime acceptance
and HTTPS preview deferred; no new registration or runtime permission activated.

### Final grounded-recovery/context release checkpoint

Measured retained research: 5,491 characters (growth) / 5,912 (launch), plus the
5,707-character approved brand and a summary/metadata, demonstrating downstream
12,000-character context pressure. Existing direct and Workforce generation now
share a deterministic projection over canonical dependencies/source campaigns.
Only whole lower-confidence research observations can be omitted, with explicit
contextOmittedObservationCount; source artifact/version and full approved brand,
prohibited claims, retained observations and summary remain intact. Canonical
stored reports are never changed. Keep at least one source observation; deny
if the unchanged 12,000-character bound cannot be met. Models are told not to
infer omitted evidence. No new storage/context architecture or raised bound.

Final clean suite: **257 files / 1,528 tests PASS**, four opt-in live files/tests
SKIPPED, 221.65s. Full typecheck and final web typecheck PASS; full lint plus
focused final UI lint PASS (one existing warning); workspace build and diff check
PASS. Context/service focused set: 48 tests. Grounding/route/Gateway set: 27 tests.
Prior 1,524-test run predates context projection; it is superseded for release.
Sixteen generated outputs restored by verified pre-build hashes after archiving
fresh outputs privately. No Android changes in this continuation.

The existing finite SOCIAL_CAMPAIGN request is exposed as a Social campaign draft
option; it reuses canonical intake/approval/ledger and cannot publish. It allows
copy/calendar verification separately from the exhausted launch research retry.
Historical blocker labels are hidden for completed draft records; READY/RUNNING
review blockers remain visible. No production data backfill or deletion.

Railway accepted both uploads despite CLI network errors. Reconciliation found
API `01aa9391-2aab-4c9c-98e0-e178bc73e2a8` FAILED with no associated build; only
then retried. New API `3d4efce2-3bc9-4b86-8cba-660e63cd0637` BUILDING; web
`d228ae8a-9ba3-47d8-948d-40e494afb016` SUCCESS. Do not run recovery until the
new API succeeds. Prior successful API still serves. No duplicate web deployment.
