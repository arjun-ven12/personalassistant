# Phase 28.4A Railway isolation audit

Date: 2026-10-04. Verdict: **RAILWAY_INSUFFICIENT_FOR_REQUIRED_WORKER_ISOLATION**
with the currently exposed provider controls and current trusted-worker execution
layout. This is not a claim that Railway could never supply a bespoke equivalent
boundary. The worker remains untrusted; no READY transition or live build occurred.
Existing production API/web services were only inspected, not changed or deployed.

## Evidence and scope

Inspected `RailwayCloudWorkspaceProvider`, `runtime-preflight.ts`,
`provisioned-worker.ts`, signed worker verification, existing Engineering runners,
shared resource limits, lifecycle reconciliation, and AGENTS.md rule 19.

Authenticated read-only Railway GraphQL inspection at
`https://backboard.railway.com/graphql/v2` used the company provider secret inside
the server environment, without printing the secret. Sanitized local evidence:
`node_modules/.cache/phase28_4a_isolation/provider-schema.json`,
`provider-controls.json`, and `service-limits.json`.

At 2026-10-04T05:56:05.942Z, `serviceInstanceLimits` in environment
`39b05b7b-ad0d-4465-b4bf-a49e7116b05b` returned this for both existing services:

```json
{"containers":{"cpu":8,"memoryBytes":8000000000,"pidLimit":1000}}
```

API service: `b258a862-9a6e-4356-89ae-7a1d6eacbeee`.
Web service: `b314ccfc-5a56-40b4-b82a-7077b86da037`.
These are existing service ceilings, not the configuration of a new worker.
`ServiceInstanceLimitsUpdateInput` exposes `environmentId`, `serviceId`,
`vCPUs`, and `memoryGB`; no PID or disk setting. This corrects an earlier inference:
Railway DOES expose a provider process limit. The observed 1,000 ceiling does not
meet Athena's 512 limit, and this API cannot lower it.

Sandbox introspection at 05:52:46 UTC exposed CPU and memoryGB only in
`SandboxResourcesInput`. Create supports environment, idle timeout, network mode,
region, source/template, domains and variables; no disk quota, PID quota, absolute
lifetime or child sandbox security profile. Returned Sandbox metadata does not
include CPU/RAM/disk/PID resource attestation. Do not infer undocumented settings
from service limits or assume a Sandbox VM shares service limits.

## Comparison

| Required property | Existing design | Railway-native direct worker result |
| --- | --- | --- |
| Company/repository/workspace identity | Exact signed bootstrap, generation, proof, envelope and result binding | Reusable without Docker; provider status never substitutes for handshake |
| CPU/RAM ceiling | Requested 2 CPU / 4 decimal GB plus VM preflight | Provider configuration can be authority; existing service ceilings cannot be reused as worker evidence |
| Writable storage <=10 GiB | Preflight demands bounded task/Docker tmpfs mounts | No matching per-workspace quota exposed by inspected APIs |
| Processes <=512 | VM cgroup preflight; command containers <=256 | Service API reports 1,000 and exposes no PID update; Sandbox PID limit unknown |
| No provider-host filesystem access | Dedicated VM plus task-only mounts | Provider outer isolation is relevant evidence; it does not separate repository code from the trusted worker's filesystem |
| Trusted signer/bootstrap/preview grants inaccessible to repository code | Task containers have separate mounts and minimal environment | Same-worker direct children would share the worker filesystem and OS identity; no equivalent separation established |
| Finite commands | Registered IDs, fixed executable maps, shell:false | Reusable, but a finite test command still executes repository-controlled code |
| Validation network isolation | Command container --network none | Worker needs API/network; direct children would inherit access unless separately isolated |
| Dependencies and previews | Separate bounded containers; preview internal network and fixed relay | Outer service isolation alone does not replace these inner restrictions |
| Broad provider/GitHub secrets absent | Provider secret server-only; governed Git credential resolution | Must remain server-only; no additional secret injection authorized |
| Runtime/idle TTL and destruction | Worker timer, durable expiry, 30-second API reconciliation, provider destroy | Existing cleanup remains useful; idle expiry is not an absolute active-worker deadline |
| Tenant isolation/redaction/replay/emergency stop | Existing company scope, fences, signed transport and redaction | Preserved; cannot authorize missing infrastructure controls |

The direct model has a concrete unresolved boundary: untrusted repository tests,
package code and preview apps would execute alongside the component signing Athena
results and holding preview authorization state. Non-extractable CryptoKeys and
minimal child environment do not establish filesystem/process isolation from that
component. This is a boundary analysis, not a demonstrated exploit.

## Which host checks are actually necessary?

CPU/RAM constraints need enforcement evidence, not necessarily `os.totalmem()` or
`availableParallelism()`: container readings may describe host capacity. Likewise,
reading root `/sys/fs/cgroup/pids.max` may inspect the wrong hierarchy. A missing
root file does not prove a missing provider limit. Correct container attestation
would resolve the effective process hierarchy or use authenticated provider evidence.

Exact tmpfs paths and filesystem type are implementation choices, not universal
security requirements. Provider-enforced writable quotas and an immutable base
could replace them if their actual resource ID, generation, policy and ceilings
were verified by Athena. No such disk evidence is available here. Therefore this
audit does not add a bypass or change the current fail-closed preflight.

The comment that the root image is immutable is not proof of a read-only root.
Current task containers do not universally set `--read-only`; their user can be
root when the worker runs as root. Dependency containers use bridge networking,
not a verified registry-only firewall. These limitations also require review before
claiming the existing design fully contained; keeping Docker alone is insufficient.

## Docker and checkpoints

Docker is not a fundamental requirement. A provider execution adapter with
verified equivalent filesystem, process, network and resource isolation could
replace it while retaining the finite Engineering capability interface.
The CURRENT adapter needs its inner container boundary. Removing it without an
equivalent adapter weakens that boundary.

The adapter provisions Railway Sandbox VMs, not ordinary Railway service
containers. Railway documents Sandbox VM isolation, while ordinary service
containers do not support privileged Docker-in-Docker workflows. These are different
products; the latter limitation does not establish that a Sandbox cannot run Docker.
[Sandbox documentation](https://docs.railway.com/sandboxes),
[service container limitation](https://docs.railway.com/guides/github-actions-runners).

A checkpoint restores disk, not processes; its name can be replaced. It cannot
attest live mounts/cgroup configuration or immutable contents by name alone. Idle
teardown is deferred by active sessions. `ISOLATED` still has outbound internet;
`PRIVATE` additionally reaches environment services. These modes cannot replace
validation's network-none boundary.
[Railway Sandbox lifecycle and networking](https://docs.railway.com/sandboxes).

Railway documents plan-level ephemeral storage limits and possible forced
stop/redeployment; that is not evidence of the required configurable 10 GiB quota.
[Service storage](https://docs.railway.com/services).

## Minimum acceptable provider/runtime evidence

To reuse CloudWorkspaceProvider without changing Engineering architecture:

1. Isolated per-company/repository/workspace resource, no host mounts or daemon
   socket, authenticated resource/generation/image digest and policy evidence.
2. Enforce <=2 CPU, <=4096 MiB RAM, <=10240 MiB writable storage across task,
   cache and execution layers, <=512 total processes, and reviewed subtask limits.
3. Separate trusted supervisor/signer/gate from repository-controlled execution:
   filesystem allowlist, no signer/config/grant access, no privilege escalation,
   bounded process trees, and capability/security policy enforcement.
4. Offline validation; constrained dependency network; fixed authorized preview
   ingress; no repository code access to control-plane private services or broad
   secrets. Provider-native sandbox jobs can satisfy this instead of nested Docker.
5. Durable idempotent provision/reconcile/stop/destroy and resource evidence;
   expiration cleanup independently enforced if the worker dies. A provider hard
   lifetime or separately durable reaper must cover control-plane outage behavior;
   command timeout and idle timeout alone are insufficient evidence.
6. Reviewed immutable artifact; signed scoped short-lived workload authentication
   and results; bounded redacted output, tenant caches, and unknown cost as UNKNOWN.

No administrator/cgroup/mount setup is proposed or executed: AGENTS.md rule 19
prohibits administrator operations. Publishing a checkpoint alone does not close
this blocker. Minimum next action on Railway is provider confirmation/evidence of
the missing quota and isolated-execution primitives. If those cannot be provided,
select a worker provider satisfying the list above; keep Railway API/web in place.
Do not start Phase 28.5 or claim a real cloud benchmark until acceptance completes.

## Validation

- Focused cloud, signed gateway and Engineering runtime suite: **14 files / 92 tests passed**, 30.26 seconds, exit 0.
- Complete `pnpm test --no-file-parallelism`: **234 files / 1,303 tests passed**, four opt-in files/tests skipped, 588.35 seconds, exit 0.
- `pnpm lint`: exit 0; zero errors, one existing Fast Refresh helper-export warning.
- `pnpm typecheck`, full `pnpm build`, and `git diff --check`: exit 0.
- Six preexisting generated Mac artifacts were restored and SHA-256 verified after build. No Android changes were made in this audit.

Logs are under `node_modules/.cache/phase28_4a_isolation/`. Tests verify the existing
contracts; they do not establish live provider quota enforcement or a successful
acceptance run. No production security controls or runtime code were changed.
