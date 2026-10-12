# Phase 28.4 cloud Engineering deployment boundary

> Current Railway activation is blocked by the required isolation evidence.
> See [Phase 28.4A isolation audit](PHASE_28_4A_ISOLATION_AUDIT.md).
> The VM/Docker requirements below describe the existing adapter, not a claim
> that nested Docker or host-owned tmpfs checks are universal provider requirements.
> An equivalent provider-native execution boundary may replace them after review.


## Phase 28.4A current provider path

The current Railway continuation is documented in `PHASE_28_4A_REPORT.md` and
`PHASE_28_HANDOFF.md`. Use the existing project/API and the new scoped provisioned
Linux worker. The manual v1 bootstrap description below is historical; it is not
the live 28.4A deployment path. CLOUD_WORKER execution now requires an unexpired
server-issued workload lease. The October 4 closure applied migrations 0110–0114 and updated only the existing
API service. Public and private API health returned HTTP 200. See the current
handoff for the locally built worker artifact and remaining secure setup.

`RailwayCloudWorkspaceProvider` creates a private isolated VM from a reviewed
checkpoint; it cannot label provider RUNNING as Athena READY. Workload identity,
nonce, exact repo/workspace binding, governed Git checkout and signed repository
readiness must succeed first. The current stock VM fails the required runtime
containment check. Company credential references, a prepared checkpoint, minimal
API migration/private-host configuration and the real Engineering run remain open.

See the handoff for actual Railway IDs/hostname, secret locators and secure setup.
Never copy broad provider credentials into the worker, model context or Android.

The Android command center uses the canonical Engineering delivery, objective,
manager, integration, approval and company APIs. GitHub operations are finite
reviewed Universal Tool Gateway handlers, never a general HTTP or shell tool.

## GitHub setup

Supply `GITHUB_ENGINEERING_ACCESS_TOKEN` through the server secret manager; do
not paste it into Android, a prompt, source, audit metadata or this document.
The bootstrap resolver accepts the fixed locator `github-primary`. Register a
READY company credential reference with provider `github` and a READY integration
binding exposing only the desired `github.repository.list`,
`github.repository.register`, and/or `github.repository.create` capabilities.

The default provider ID is `engineering.github`, source API, version 1.
For multiple companies owned by one owner, configure distinct reviewed IDs in
`GITHUB_ENGINEERING_PROVIDER_IDS` (comma separated, e.g.
`engineering.github.company_a,engineering.github.company_b`) and use each ID as
that company binding's integrationId. Each provider has its own company credential
review. IDs outside this server bootstrap allowlist have no finite handler. Use the existing
finite-provider registration, discovery, exact schema review and activation
routes. Tools start disabled; no setup implicitly grants execution. Each mutation
uses the existing `universal.external_publish` governance authority, high risk,
recent authentication, exact request digest and UUID invocation idempotency.
The handler checks the argument credential against the reviewed provider's current
credential reference as well as company binding. Creation claims persist before
the GitHub request; uncertain outcomes are never automatically replayed.

A GitHub registration is an association with remote provider identity. It is not
itself a canonical runnable Engineering repository. Its linkage must point to an
ACTIVE canonical repository whose registered workspace has been provisioned and
whose exact remote origin has been verified by the reviewed host provisioner.
No public link or arbitrary clone URL endpoint is exposed.

## Worker bootstrap

`pnpm --filter @alexa-control/api build` produces `dist/engineering-worker.js`.
Run the worker only in a reviewed **dedicated company Linux VM**, with no owner
Mac filesystem or other company's volumes, Docker socket, data or credentials
shared into it. Docker is the VM's daemon, not a mounted owner-host socket.
The existing finite Engineering runtime performs repository operations and uses
its existing network-isolated command containers and restricted dependency
containers. AI-generated shell text is never executed.

The operator supplies a root-owned, non-writable-by-group/world configuration at
`/run/athena/engineering-worker.json`. It contains only:

```json
{
  "schemaVersion": "1",
  "isolation": "DEDICATED_COMPANY_LINUX_VM",
  "apiBaseUrl": "https://your-reviewed-private-api.example/",
  "deviceId": "registered-workload-uuid",
  "companyId": "registered-company-uuid",
  "repositoryId": "canonical-repository-uuid",
  "workspaceLocatorId": "registered-workspace-id",
  "serverPublicKeyX": "registered-server-public-key-x",
  "publicKeyX": "registered-workload-public-key-x"
}
```

Values above are explanatory placeholders, not a runnable credential or identity.
The secret manager supplies DER PKCS8 workload key bytes through file descriptor 3. The entry point bounds that input, checks its public key against the registered
pin, imports a non-extractable signing key, closes the descriptor and zeros input
buffers. No private keys are accepted through config JSON, environment variables,
HTTP requests or disk files. Secret-manager encryption and workload attestation
are provider rollout requirements, not implied by the config's isolation label.

The repository must already exist at `/workspace/repositories/<repository UUID>`;
the worktree root is fixed at `/workspace/worktrees`. The reviewed VM must have the
existing reviewed command/dependency images and `/usr/bin/docker`. Missing images,
repository or configuration fail closed. The provisioner must establish resource
limits, egress policy, durable storage, quota and workspace cleanup before trust.
The entry point does not provision a VM, clone with credentials, register/trust a
workload, or claim isolation based on an unverified client flag.

The signed device record must be owner-scoped, TRUSTED and type CLOUD_WORKER, with
companyId, repositoryId, workspaceLocatorId and executionScope ENGINEERING_ONLY.
Public pairing explicitly rejects CLOUD_WORKER. Provisioning must use a reviewed
server bootstrap path with owner authorization and identity audit.

## Execution and previews

The same existing server-signed envelope, nonce, expiry, claim, lifecycle,
heartbeat, device-signed result and emergency-stop channel is reused. Server and
worker both check exact company/repository/workspace binding. Only finite
`engineering.repository_capability` requests are accepted. Native provider status
and other tool types are denied. Canonical MAC_NATIVE tasks route to the Mac path;
portable GitHub work cannot silently fall back when its cloud worker is absent.

The existing runtime's local HTTP preview is not phone-ready. Android opens only
RUNNING, PASS, unexpired HTTPS previews. A reviewed HTTPS preview host/proxy with
workspace/tenant isolation and TTL revocation is still required before live
acceptance. No arbitrary target-URL proxy has been added.

## Current acceptance boundary

No live GitHub credential, reviewed cloud provider, provisioned trusted workload,
HTTPS preview origin or real phone-to-cloud run has been verified in this session.
Provider-backed provisioning/clone/linkage, cache lifecycle, HTTPS preview hosting
and workspace cost accounting remain implementation/acceptance blockers. Do not
report these as completed merely because the signed worker adapter is present.
Production migrations/security rollout remain Phase 28.6 carry-over unless needed
for an earlier live test. Benchmark values must come from actual governed runs.

## Mobile project inputs

The owner can select PNG/JPEG images (up to 256 KiB) or TXT/Markdown requirements
(up to 16 KiB) from Android's document picker. The API checks company/objective
scope, filename, encoding, MIME signature, size and common secret patterns in text.
Inputs use the existing Engineering artifact store, with owner-uploaded/untrusted
provenance, a content digest and a durable input receipt. Changed-content replay
is denied. In-memory insertion and PostgreSQL objective-row locking enforce
12 files / 1 MiB per objective under concurrency. Nothing becomes a repository
path, executable, tool registration or approval from an uploaded file.

Text excerpts are bounded to 4,000 characters and labeled untrusted in Engineering
context. Images remain stored reference artifacts; encoded image bytes are omitted
from model context and normal objective responses. This phase does not claim that
the model interprets mockup images. Uploads emit bounded canonical events for the
existing Android state-invalidation poll, without logging filename or content.
