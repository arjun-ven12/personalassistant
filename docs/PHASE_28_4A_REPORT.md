# Phase 28.4A Railway infrastructure continuation

## Current isolation decision — 2026-10-04

**RAILWAY_INSUFFICIENT_FOR_REQUIRED_WORKER_ISOLATION** with currently exposed
controls. [Isolation audit](PHASE_28_4A_ISOLATION_AUDIT.md) supersedes any
checkpoint-only activation guidance below. No runtime bypass, READY transition,
production API/web modification, or Phase 28.5 work occurred in this audit.


Date: 2026-10-04 (Asia/Singapore).

**PHASE 28.4 CONDITIONALLY COMPLETE — FIX REMAINING MOBILE/CLOUD ENGINEERING BLOCKERS**

This verdict is conditional. The genuine phone → cloud → patch → validation →
HTTPS preview → independent review → candidate scenario has not been run.
Infrastructure probes and unit tests are not Engineering acceptance evidence.

## Secure provider setup continuation — October 4

Both production API secret variables are now present and nonempty. A server-side
read verified GitHub repository-list access (HTTP 200) and Railway Sandbox list
access in the exact production environment. Raw values were never printed,
persisted in these artifacts or submitted to the browser/model. Private repository
write/create permissions are not inferred from successful public repository reads.

The owner is signed into Athena with Default Company active. Company credential references and integration bindings were registered through
the authenticated owner mutation with CSRF and explicit company scope after the
owner confirmed both registrations. The existing Companies → Integrations view
now has finite GitHub/Railway setup controls. GitHub exposes list/register only;
Railway exposes the governed provisioning capability. Shared API schemas, existing
routes and deterministic company/provider record IDs preserve retry isolation.
No raw credential input or new authority endpoint was introduced.

A production reload exposed an existing synchronous cross-device schema exception
on `/companies`. Presence now maps unregistered routes to null using the shared
route schema, preserving the finite remote-navigation allowlist. The minimal
frontend rollout succeeded: `d2b93ea6-f12b-4be3-b346-703e1a8a4e9c`.

Real VM probe `ea19fd23-fba3-4382-87d1-f53dff046e6f` requested 2 CPU / 4 decimal GB
and reported 2 available CPUs and 4,251,213,824 bytes of memory, within the canonical
4096 MiB ceiling. The adapter request is corrected locally from 4.294967296 to 4
GB; actual worker preflight remains mandatory. Docker exists at `/usr/local/bin/docker`,
not the runner's reviewed `/usr/bin/docker`. The base VM lacks `/workspace` and
root `pids.max`/`memory.max` evidence. It is **not** a reviewed Engineering runtime.
The probe was destroyed. Earlier two failed probes were also destroyed.

The immutable artifact remains REVIEW_REQUIRED. A provider checkpoint must install
that exact artifact, preload reviewed execution images, use the reviewed binary
paths, and verify process/disk containment before workload authentication. No
administrator setup commands or containment bypass were used. No checkpoint is
claimed published. The owner selected `arjun-ven12/personalassistant` (GitHub repository ID
1312934774) for acceptance. Exact profile/checkpoint configuration and governed tool activation are still pending. The SDK checkpoint
list returned zero checkpoints in the production environment.
The real portfolio objective and acceptance timings/costs remain NOT_RUN/UNKNOWN.

Both company credential references and finite bindings are READY:
GitHub `fd02d43d-6eaf-451a-ae26-f1a2446e8043` (`github-primary`, list/register)
and Railway `1e7bc878-b177-4540-abe4-b2b75fad2dea`
(`railway-engineering-primary`, governed provisioning). Raw secret values remain
server-only. The first registration attempt failed with HTTP 415 before persistence:
case-variant duplicate JSON Content-Type headers were combined by fetch. The
headers now use the existing canonical casing; an explicit JSON/CSRF/company-scope
regression test passes. Frontend deployment
`29b41dd5-e74a-4fe8-897d-0c8e7c8c87d2` succeeded and both saves were verified in
the authenticated owner UI and production storage. Exactly one reference and one
binding per provider exist in the company scope. The audit read returned two
SUCCESS `COMPANY_CREDENTIAL_CHANGED` events and two SUCCESS
`COMPANY_INTEGRATION_CONNECTED` events. The same deterministic record IDs are
reused on retry.
This closes credential-reference setup; tool review/recent-auth and runtime trust
are independent controls and remain required.

### Secure setup validation

The first full run overlapped the live memory-request correction: its collected
adapter implementation retained the old value while the test expectation had
changed, producing one adapter mismatch (231 files/1300 tests passed, one failed,
four skipped, 633.03 seconds). The affected provider/preflight focused run then
passed 14/14. The complete settled rerun passed **233 files / 1,302 tests**, four
opt-in files/tests skipped, **411.58 seconds**, exit 0. The additional media-type
regression file was added after that suite collected files and passed separately
**1/1**; it is not included in that full-suite count. Setup/route focused checks
passed **4/4**. After correcting a lint-only test body narrowing issue, all three
web regression files passed **5/5**. The closure `pnpm typecheck` and complete
`pnpm build` passed; six preexisting generated Mac artifacts were restored and
verified byte-for-byte. API `security:check` and `git diff --check` passed. The final lint rerun passed with zero errors and one Fast Refresh helper-export
warning. No Android code changed in this continuation. The provider memory-request change is
local/tested and not yet part of the deployed API image. Logs are under
`node_modules/.cache/phase28_4a_secure/`.


Scoped production reads resolved Default Company to
`c2ac447f-0747-4b78-80f1-2cc4fff8d82f`, with capability profile
`company:c2ac447f-0747-4b78-80f1-2cc4fff8d82f:capabilities`.
There are twelve ACTIVE existing Engineering command profiles and zero GitHub
repository registrations in that scope. No arbitrary profile was chosen, and no
registration/config was inserted directly into the database.

Exact runtime prerequisite: a reviewed Railway checkpoint must establish its
process cgroup limit and bounded writable `/workspace` plus Docker storage on
**every boot**, not merely during snapshot creation. Provider resource arguments
currently supply CPU/RAM only. The default VM's successful startup, preinstalled
Docker and filesystem checkpoint do not establish the missing process/disk
controls. Privileged host setup is prohibited by AGENTS.md rule 19; an operator
must supply this reviewed boot environment or Railway must expose equivalent
provider-native controls. Worker preflight must pass before signed handshake. The concrete operator review
notes and immutable artifact checksums are in
`.local/engineering-worker/phase28_4a/CHECKPOINT_REVIEW.md` and `manifest.json`.


## Production closure on 2026-10-04

Applied migrations 0110–0114 through the transactional runner: 116 applied,
zero pending. The GitHub registry and cloud workspace tables now exist.

API-only deployment `ff53e14d-555e-47e0-892f-31a65f6d5362` succeeded after correcting
workspace contract resolution in the backend/standalone worker bundlers. The
frontend remained unchanged. The exact private hostname was added alongside the
existing public/healthcheck allowed hosts. Both public and real private VM health
requests returned HTTP 200. The temporary probe VM was destroyed.

The Linux amd64 worker image build passed against official pinned base
`node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`.
Its manifest is `sha256:2bf71fba2671a5f91273711704937a902bbe33fe578e1cf3288923dd1aedf4db`.
The package smoke check verified Node v24.21.0, Git, Docker and Python. Ordinary
container startup correctly denied execution without the dedicated VM containment.
Local review artifacts are in `.local/engineering-worker/phase28_4a/`:
`worker.js`, `start-engineering-worker`, `worker-image.tar` and `manifest.json`.
The archive is 316,958,208 bytes, SHA-256
`1989a622c48f28b61930e13089c175e9b326868a9bcc5b536cac5f855b9b7e09`.
The existing Node execution-image recipe also built for Linux amd64, with
manifest `sha256:7b73704244c8e8e50c82b63249560a1436444b6402d3155a05076ee830138d2a`.
Its offline smoke check returned pnpm 11.17.0; `node-execution-image.tar` and its
checksum are included in the local artifact manifest. These artifacts are
**REVIEW_REQUIRED**, not published or approved. The checkpoint
must additionally preload approved execution images and enforce the fixed
2 CPU / 4096 MiB RAM / 10240 MiB writable disk / 512 process / 3600-second runtime /
300-second idle limits. Provider RUNNING and image build success are not READY.
Runtime checkpoint publication and resource enforcement remain unverified.

At this earlier checkpoint production had neither provider secret nor company credential reference or integration binding; provider secrets are now verified as recorded above. Config remains disabled pending those verified records and
a prepared runtime checkpoint. Authentication and high-risk approval are not
substituted by the operator's Railway CLI session. The owner sign-in handoff is
open. No genuine portfolio run or benchmark exists yet.

The sections below retain October 3 implementation evidence and limitations;
the production migration and host/deployment blockers above are now closed.

### October 4 validation

`pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`, API security
invariants and the deployed cloud configuration validator passed. Worker and Node
execution Docker image builds and offline package smoke checks passed. The six
preexisting generated Mac files were restored and verified byte-for-byte.

The initial full suite had one PostgreSQL setup-hook timeout: 230 files passed,
one file failed, four files skipped; 1,287 tests passed and 15 skipped. The affected
file then passed **11/11** in 34.17 seconds without changing its timeout or tests.
The complete rerun passed with exit 0: **231 files / 1,298 tests passed**, four
opt-in live files/tests skipped, **413.71 seconds**. No skipped test counts as
live acceptance. Logs are under `node_modules/.cache/phase28_4a_live/`.
No Android source was changed in this closure, so Android validation was not rerun.

## Reused authority and records

The new finite GitHub `prepare_workspace` handler is registered behind the existing
Universal Tool Gateway, exact schema review, company credential, high-risk approval,
recent authentication and invocation idempotency. No public provider registration,
arbitrary Git URL, command, executable, workspace path or preview target is added.
`WorkspaceProvisioningService` owns infrastructure state only. The existing
Engineering manager, AIRouter worker, signed execution, integration/review and
candidate services retain planning/execution authority.

Canonical repository IDs are deterministic per existing GitHub registration.
PostgreSQL workspace claims are unique per owner/company/repository and use CAS.
An uncertain provider create is reconciled before any repeat; absence alone does
not authorize a duplicate. Resource identity is persisted before worker boot.
READY requires scoped bootstrap proof, nonce verification, exact base commit
preparation, signed lifecycle evidence, governance workspace registration and audit.
The worker is PENDING until READY; its signing key is ephemeral/non-extractable.
No GitHub or Railway provider credential enters the worker or model context.

## Provider and runtime

`apps/api/src/cloud-engineering/railway-provider.ts` implements provision,
reconcile, status, stop/destroy, connection metadata and usage behind the canonical
provider interface. The adapter uses isolated Railway Sandbox VMs in the existing
production environment, a reviewed prebuilt checkpoint and fixed 2 CPU / requested
4 GiB resource settings. Railway stop maps to destruction of ephemeral compute;
it does not delete durable Engineering records. Unknown costs/usage are null.

The separate worker artifact is built with `tsup.worker.config.ts`. The reviewed
image recipe requires a pinned Node base digest and includes Git, Python tooling,
build essentials and Docker. It contains the Linux worker entry point, not the
Mac Agent application. Missing Docker, approved images, bounded writable storage
or process limit prevents authentication. Runtime/provider resource enforcement
has not been verified on a prepared Railway worker.

A real temporary provider VM was created at 2026-10-03 08:09:27 UTC, ID
`fa7e447b-06eb-41f6-b47a-7f595f1fa7e7`, with private networking and a five-minute
idle TTL. It reported 2 CPUs, 4,519,649,280 memory bytes, Node v24.21.0, no Docker,
no workspace mount and no configured cgroup process limit. It was explicitly
removed after read-only probes. No provider/API cost or Engineering timing is
inferred from this probe. No worker image/checkpoint was published.

## Git preparation and caches

The server resolves the exact authorized GitHub repository and current reviewed
company credential. A finite read-only smart-HTTP broker permits only refs and
upload-pack, caps request/response size, rejects redirects and rechecks access.
The worker receives a three-minute broker credential, uses a fixed canonical
workspace path, disables hooks/submodules, checks out the server-resolved commit
and verifies HEAD/clean checkout. Broker credentials are scrubbed and are never
written to Git config.

No cross-company source cache exists. Repo mirror optimization and provider-backed
lockfile/version-aware package caches are not implemented yet. Ordinary cold clones
and ephemeral dependency installs remain. Worker failure revokes authority and
preserves durable state, but automatic replacement/checkpoint reconstruction is
still incomplete; completed mutations are not blindly replayed.

## HTTPS preview and telemetry

The signed local preview must report a living process/local health on the fixed
port 4173. The provider maps only its registered workspace ingress on port 8080.
A cryptographically random owner capability links to an HTTPS route; only its hash
is written to the VM. The gate binds company/workspace/generation, uses a secure
HttpOnly cookie, expiry and revocation, strips cookies/auth/forwarding headers
before the fixed localhost app and allows GET/HEAD only. External route health must
pass before the canonical RUNNING/PASS HTTPS result is published and audited.
Stopping the preview revokes its route; grant expiry denies access automatically.
Durable separate preview status and automatic completion/cancellation cleanup still
need closure before acceptance. URLs are owner-scoped capabilities and must not
enter model prompts or logs.

`GET /api/cloud-workspaces/:workspaceId/telemetry/:deliveryId` joins existing
Engineering delivery/objective/integration, execution and AI economics records.
It exposes actual available milestones, models, calls, tokens, cost attribution,
retries/interventions and nullable provider usage. Missing evidence stays unknown.
Existing owner-entered Codex comparison contracts remain; no comparison is invented.
Complete timing duration/capture instrumentation remains an acceptance gap.

## Live blockers and required setup

The real deployed API is the existing `personalassistant` service in Railway
project `modest-clarity`, production environment. Private hostname discovery and
VM networking were real: requesting
`http://personalassistant.railway.internal:3001/health` returned HTTP 400. The exact
private host must be added to `ALLOWED_HOSTS`. Keep existing public host entries.
The deployed environment passes the current cloud production-config validator.
No frontend/API service was redeployed or production migration applied here.

Production secure integration records contain no company-scoped GitHub/Railway
credential references or bindings. The deployed database lacks migration 0113's
GitHub registry; new infrastructure migration 0114 is also required. See
`PHASE_28_HANDOFF.md` for exact secret locators, owner setup and continuation order.
Configure server-owned `RAILWAY_ENGINEERING_CONFIG` only from actual reviewed IDs.
It remains empty/disabled by default. Do not invent company, profile, credential,
checkpoint or backend IDs, mark unverified credentials READY, or bypass existing
recent-authentication/tool review to close a live check.

## Security limitations

Railway Sandbox APIs are experimental. The provider credential is server-only,
but its underlying Railway permissions must be reviewed. Private networking is
connectivity, not worker authority; proof/signature/scope/replay/expiry checks remain
mandatory. Initial egress is not a complete domain firewall: dependencies can use
outbound network, while validation uses the existing isolated command runner.
Workers contain no broad owner credentials. Recovery, caches, lifecycle cleanup,
real resource enforcement and full benchmark capture remain blockers, not promises.

## Validation

Focused provider/cloud + reused telemetry checks: **13 files / 73 tests passed**,
including real PostgreSQL migration/CAS/nonce binding, cryptographic workload
proofs, tenant/replay/expiry/capability denial, provisioning uncertainty, resource
containment, preview target/tenant/health/expiry and secret-redaction checks.

`pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`, API
`security:check`, production configuration invariant validation and validation of
the deployed environment passed. Six preexisting generated Mac artifacts were
restored byte-for-byte after build. The worker artifact build passed; its startup
smoke check failed closed on macOS as intended. Docker image build/live Linux
worker execution have not been verified. No Android source changed during 28.4A;
its earlier 24-test validation is recorded in the Phase 28.4 report.

Complete `pnpm test --no-file-parallelism` result: **231 files / 1,298 tests passed**,
with four opt-in live files/tests skipped, in **390.62 seconds**, exit 0.
Logs are in `node_modules/.cache/phase28_4a/`. No skipped test is live acceptance.

## Next task

Finish the missing runtime/provider acceptance pieces listed above and complete
the one real cloud baseline. Only then proceed to Phase 28.5 using measured
latency/cost/evidence. Keep 28.1–28.3 live carry-over and 28.6 hardening boundaries.
