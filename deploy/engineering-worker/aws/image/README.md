# Trusted EC2 image payload — review required

This is an infrastructure build payload, **not a published or verified AMI**.
Preview and runtime permissions remain disabled. Do not run privileged setup from
Codex: repository rule 19 prohibits administrator operations. Use a reviewed Linux
image-building workflow with a separate infrastructure principal. The runtime IAM
user cannot build images, change networking or create SSM documents.

## Primary reviewed production path

Use `../image-builder/image-builder.cloudformation.json` and
`docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md`. Image Builder consumes the
checksummed payload and reviewed tooling lock/archive, installs exact offline
DEBs and Node/SSM artifacts, fetches only a digest-pinned Docker base, builds both
task images, reboots into the PID ceiling, executes this fixed install/seal recipe,
cleans build material, tests the booted private image and exports pending evidence.
The separate build role never reuses an Athena runtime credential or role.
The manual operator runbook remains fallback/audit documentation. Build success
never means RELEASED or READY; the independent live release gate remains mandatory.

## Artifact assembly (unprivileged)

Build with `pnpm --filter @alexa-control/api exec tsup --config tsup.worker.config.ts`.
The output contains the worker, EC2 helper, and registry proxy. Package those three
bundles with this directory and the two sibling SSM document JSON files. No owner
credential, runtime bootstrap, `.env`, repository checkout or private key belongs
in the payload. All runtime entry points use fixed paths and finite operations.
Run `python3 deploy/engineering-worker/aws/package-image-payload.py` to assemble the
fixed allowlisted archive and SHA256SUMS under `.local/engineering-worker/phase28_4a_ec2`.
That checksum identifies the delivery payload; it is not the sealed runtime digest.
Worker entries are built without shared chunks. The packager requires current
esbuild output metadata and rejects missing entries or local module dependencies;
do not copy a split build into the image or omit this packaging gate.

## Reviewed Linux bake inputs

Use an owner-reviewed, patched x86_64 Linux base AMI with systemd, cgroup v2,
Node **24** at `/usr/local/bin/node`, Git, Python, Docker at `/usr/bin/docker`,
iptables and SSM Agent **3.3.2746.0 or later**, supporting parameter `ENV_VAR`
interpolation. Older agents fail closed; there is no shell-substitution fallback.
All tooling is installed once during this separate image bake; never at task boot.
Pin the base AMI, package versions and vendor checksums in the build record.
No base AMI or package checksum has been invented here.

Use an encrypted **10 GiB** EBS root, no other volumes, no swap and no extra writable
mounts. The workspace and Docker store share that filesystem. `/run` is protected
RAM storage. Container scratch is bounded RAM tmpfs, within the VM memory ceiling.
Require systemd cgroups, Docker's default seccomp profile, IPv6 disabled, no Docker
TCP listener, no SSH listener in the resulting worker, and no repository scripts
executed on the host. Disable automatic root-volume growth beyond 10 GiB.

Build `task-node.Dockerfile` with an operator-reviewed `node@sha256:...` base;
tag the resulting local image `alexa-engineering-node:1`. Build
`registry-proxy.Dockerfile` with the same pinned base and the actual proxy bundle;
tag it `athena-registry-proxy:1`. Supply a reviewed SHA-256-verified pnpm11.17.0 tarball at
`/opt/athena-build/image/pnpm.tgz` before the task image build. Docker build context
is `/opt/athena-build`, including the reviewed proxy bundle; build RUN steps use
`--network=none`. No registry pnpm download occurs during container construction.
Record both resulting immutable image IDs.
No image is pulled during Engineering. This first image supports reviewed npm/pnpm
profiles only; Python/Gradle task images are absent and those commands fail closed.
Review the build's registry traffic separately; task installs accept npm registry
CONNECT only and suppress package lifecycle scripts.

Copy the payload to `/opt/athena-build` in the isolated builder, then review and
execute the fixed `install-image` recipe through the infrastructure build process.
It refuses missing tooling/images, installs only fixed files and seals their
hashes plus Docker IDs. Its output is the **runtime digest**, not an AMI ID or proof
of isolation. Do not start the worker in the bake. Remove build/SSH credentials,
cloud-init state, build payloads, logs and caches before capturing the image.
Never include `/run/athena/bootstrap.json`, `lifetime.json` or a workload signing key.
Capture a private account-owned AMI and record its actual AMI/root snapshot IDs.

## Boot and measured evidence

Cloud-init writes only two root-only data files. The AMI-owned watchdog reads them,
persists nonsecret exact scope, verifies the sealed artifact, arms an absolute
systemd deadline and starts the worker. It uses monotonic and wall deadlines.
Signed, scope-verified work updates the idle clock; heartbeat cannot do so.
Bounded task/dependency container activity is inspected independently. Idle cleanup
starts conservatively before 300s. Watchdog or worker failure triggers power-off;
the provider uses instance-initiated shutdown **terminate**. A 55-minute Scheduler
termination is an additional independent control, not the hard-deadline proof.

The measurement helper checks live kernel CPU/memory/PID/storage, trusted files,
image hashes, actual Docker container flags/images/mounts/networks, IPv6 state,
actual firewall chains, root watchdog process and fresh state, active systemd
units and the exact loaded deadline drop-in. No constant manifest booleans alone
can produce evidence. A missing, malformed, changed or stale check denies READY.
Live `/proc` and cgroup v2 checks also measure UID, capabilities, no-new-privileges,
seccomp, actual PID/memory/CPU quotas, mount read-only state and scratch capacity.
The timer's effective monotonic deadline is read from systemd over D-Bus. A low
`pid_max` alone is insufficient if any existing PID/thread already exceeds it.
The worker runs these checks **before** workload authentication; the API runs the
pinned evidence document separately before granting trust.

Task networks are internal. Host INPUT denies Docker-source traffic. A trusted
proxy occupies fixed addresses and is the only allowed container egress, limited
to public IPv4 HTTPS through a fixed npm hostname with validated/pinned DNS.
Control-plane, metadata and private destinations are blocked. The worker SG must
also have a reviewed constrained supervisor/proxy HTTPS destination; it currently
allows loopback only. DNS resolution relies on the provider resolver; an SG does
not enforce domain identity. Live packet tests must verify actual Docker/firewall
behavior and that registry access works under the eventual reviewed SG rules.

Create `AthenaEngineeringEvidenceV1` version 1 from `evidence-document.json` only
through the infrastructure principal, company-tagged. Record AWS's actual SHA256
document hash. There are no command/path parameters. The preview-grant document
remains inactive; its bounded input is passed as an environment variable, never
interpolated into shell. Do not substitute generic SSM documents or StartSession.

## Mandatory live image release gate

Before any READY worker, independently test the actual AMI: PID/CPU/memory/disk
exhaustion; readonly root, scratch quotas and seccomp; mount traversal and signing
material access; metadata/private-control-plane/network denial; registry-only
install; offline validation; watchdog/worker death; idle and hard expiry; Scheduler
termination/reconciliation; image/SSM hash mismatch and secret redaction. Verify
shutdown actually terminates EC2 and cleans its EBS. Test signed identity/replay and
repo generation binding through Athena. Keep measurements as genuine live evidence.
No package-script or mock result may stand in for this release gate.

No AMI has been built, no SSM document published, no production configuration
activated, no repository task run, and no live economics collected by this payload.
Secure HTTPS preview remains an additional full Phase 28.4 acceptance prerequisite.

Sources for infrastructure review:
[SSM parameter interpolation requirements](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-troubleshooting.html),
[systemd timer scheduling](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml).
