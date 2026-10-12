# Human operator runbook: Athena EC2 Engineering AMI

Primary image-production path: `ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md`.
This manual procedure is retained as the reviewed fallback/audit path.

2026-10-05 compatibility notice: the current Ubuntu24.04 candidate uses the
primary **retained Snap SSM** path described in
`ATHENA_EC2_IMAGE_BUILDER_INPUT_APPROVAL.md`. Historical DEB installation steps
below are not permission to remove or convert the active Snap agent. The original
payload remains an audit artifact; the Snap-compatible candidate requires its own
input approval. Use a complete schema2 tooling lock and provide the sealed SSM
installation record before invoking the current fixed install/seal recipe.

Date: 2026-10-04. Account: **737073451069**. Region: **ap-southeast-1 (Singapore)**.

This document is an operator procedure, not evidence that an AMI exists or that
containment passed. Phase 28.4 remains conditional. Preview stays disabled. No
Phase 28.5 features, training, or Phase 28.6 work is authorized by this runbook.

Source of truth: `deploy/engineering-worker/aws/image/README.md`, the fixed image
recipes and `deploy/engineering-worker/aws/evidence-document.json`.

Reviewed delivery payload:
`.local/engineering-worker/phase28_4a_ec2/athena-ec2-image-payload.tar`

Expected payload SHA-256:
`2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689`.

**That is the payload hash, NOT the sealed runtime hash or AWS document hash.**

## Principals and command labels

| Label            | Where / principal                                                                      | Authority                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| OPERATOR         | Operator workstation, AWS CLI v2, existing approved infrastructure SSO/assumed role    | Build instance, image, snapshot and exact SSM document management in this account/region |
| BUILDER          | SSH session to temporary image-builder, Linux user `ubuntu`                            | Read/download/verify reviewed build materials                                            |
| BUILDER ROOT     | Same temporary instance; explicitly shown `sudo` commands                              | Human administrator performing image installation/cleanup                                |
| RELEASE OPERATOR | Existing approved security-test infrastructure principal, disposable release instances | Independent destructive isolation tests; never an agent/model executor                   |
| ATHENA           | Existing scoped API/provider and signed Engineering flows                              | Genuine workload identity, canonical repo, handshake, finite capabilities and results    |

**Every AWS CLI command below uses the OPERATOR profile**, unless a release step
explicitly names RELEASE OPERATOR. The profile names are local aliases, not new
IAM roles. Do not create a policy or change an attachment to make a command work.
Stop on AccessDenied and have the account's infrastructure administrator review
its existing operator authority. Never use `athena-engineering`,
`AWS_ENGINEERING_CREDENTIAL`, the worker role or reaper role as the image-builder
principal. Never copy AWS, Railway or GitHub keys into the builder. No IAM instance
profile is needed on the builder: downloads are public vendor artifacts and the
payload is copied over SSH. No worker bootstrap/signing key belongs in this image.

Commands are instructions for a human. Codex has not executed any `sudo`, root,
AWS mutation, image build or destructive release command. AGENTS.md rule 19 prohibits
Codex administrator operations. Commands use Bash on the operator workstation or
Ubuntu builder. Replace `REPLACE_...` values with reviewed non-secret values before
execution. Do not paste private keys, credentials or workload user-data into chat.

## 0. Open the build record and verify authority

**OPERATOR — workstation:** Use an existing approved short-lived SSO profile named
`athena-infrastructure-operator`. If your approved profile has another name, use it.

```bash
export AWS_PROFILE=athena-infrastructure-operator
export AWS_REGION=ap-southeast-1
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_PAGER=''
aws sso login --profile "$AWS_PROFILE"
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
```

Require account `737073451069` and the approved infrastructure role ARN. An SSO
login is unnecessary if your existing approved assumed-role session is already valid.
Use MFA through the normal account workflow. No new access keys.

Create a local non-secret evidence directory; keep the operator credential store
separate. Establish an independent operator alarm/reminder to stop the builder in
**two hours**, and record its instance ID as soon as created. The builder is not
protected by the future workload TTL until the reviewed runtime is active.

```bash
mkdir -p athena-image-release-v1
cd athena-image-release-v1
```

Record reviewer, time, source revision, payload hash, base AMI metadata, package
versions/checksums, Docker image IDs, image/snapshot/document hashes and release
results. Do not record raw user-data, tokens, signed bootstrap or private keys.
The existing builder subnet route is not assumed functional: verify before launch.

## 1. Select and pin the Linux base AMI

Chosen build family: **Canonical Ubuntu Server 24.04 LTS, amd64/x86_64, HVM, gp3**.
This is a selection procedure, not approval of whichever image a moving alias returns.
The operator/reviewer must approve the actual AMI ID and its package/security state.
Canonical documents the public parameter lookup in [Find Ubuntu images](https://ubuntu.com/aws/docs/aws-how-to/instances/find-ubuntu-images/).

**OPERATOR — workstation:**

```bash
aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/noble/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter --output json > base-parameter.json
BASE_AMI_ID=$(python3 -c 'import json; print(json.load(open("base-parameter.json"))["Value"])')
aws ec2 describe-images --image-ids "$BASE_AMI_ID" \
  --owners 099720109477 --output json > base-image.json
python3 - <<'PY'
import json
images=json.load(open('base-image.json'))['Images']
assert len(images)==1
v=images[0]
assert v['OwnerId']=='099720109477' and v['Architecture']=='x86_64'
assert v['State']=='available' and v['RootDeviceType']=='ebs'
assert v['VirtualizationType']=='hvm'
assert len(v['BlockDeviceMappings'])==1
assert v['BlockDeviceMappings'][0]['Ebs']['VolumeSize']<=10
print(v['ImageId'], v['Name'], v['CreationDate'], v['RootDeviceName'])
PY
ROOT_DEVICE=$(python3 -c 'import json; print(json.load(open("base-image.json"))["Images"][0]["RootDeviceName"])')
```

Console alternative: Region **Asia Pacific (Singapore)** → **EC2 → AMIs → Public
images** → search the resolved AMI ID → verify owner `099720109477`, x86_64, HVM,
EBS, available and root size <=10 GiB. Record the literal AMI ID. Use that ID in all
later launches; do not use `resolve:ssm:` again. Stop if the source volume exceeds
10 GiB: an EBS snapshot cannot simply be shrunk during launch/capture.

**Approval checkpoint:** independently review the base image and current security
advisories. If rejected, repeat discovery/review with another compatible approved
base; never substitute an unreviewed marketplace image.

## 2. Create the temporary isolated image-builder

**OPERATOR — Console; existing infrastructure role:**

1. **EC2 → Security Groups → Create security group**.
2. Name and description: `athena-engineering-image-builder-v1`.
3. VPC: `vpc-04179b719aaccf907` only if the operator confirms this is the intended
   isolated build network. Use a separate approved build subnet/VPC if company
   policy prohibits build traffic in that VPC; do not alter production networking.
4. Inbound: SSH TCP22 from **the operator's fixed public IP /32 only**. No IPv6 or
   `0.0.0.0/0`. No API, Docker, app or preview inbound ports.
5. Outbound: remove the default unrestricted rule. Add HTTPS TCP443 and, only if
   the reviewed Ubuntu mirror uses it, HTTP TCP80 to the reviewed build-source
   CIDRs/proxy. This temporary build SG is separate from
   worker `sg-0b77b637346ef5065` and preview `sg-065e5d49d32634451`.
   Required sources: approved Ubuntu mirrors, Node vendor, AWS SSM package endpoint,
   Docker Hub authentication/registry/layer endpoints, npm registry. Use an existing
   reviewed build egress proxy where available. **There is no universal safe fixed
   CIDR list for these services.** Have the network operator record the actual
   destination rules; do not replace them with all-egress to overcome a failure.
6. Save the SG ID. No existing SG/policy is broadened.
7. **EC2 → Key Pairs → Create key pair**, name
   `athena-engineering-image-builder-v1`, RSA, PEM. Keep its private file on the
   operator workstation only, mode0600. Reuse an existing approved temporary key
   instead if your organization requires it. The final worker has no SSH server.
8. **EC2 → Instances → Launch instances**. Name:
   `athena-engineering-image-builder-v1`.
9. Choose the literal pinned base AMI from step1; type **t3.medium** (2vCPU/4GiB).
10. Select the temporary build key. Select the approved build subnet. Existing
    `subnet-0c35a5bf3347d05ce` may be used only after verifying its route through
    `rtb-08c9c017691e1b4a0` and `igw-0b96c42de697a4d46`. Do not change routes here.
    For this SSH procedure, a reachable public IPv4 is needed; use a preapproved
    private bastion instead if that is the network policy.
11. Select **only** the temporary builder SG.
12. Storage: **one 10GiB gp3 root**, encrypted, approved EBS KMS key (the existing
    account EBS default is acceptable if reviewed), **Delete on termination**.
    No additional volume, instance store, swap or filesystem mount.
13. Advanced details: IAM profile **None**; user-data **empty**; metadata IMDSv2
    **required**, hop limit **1**, metadata tags disabled; CPU credit **Standard**;
    shutdown behavior **Stop** for the builder. Do not use worker shutdown terminate
    while preparing a capture. No termination protection or hibernation.
14. Launch **one** instance. Record instance ID, public IP, root volume ID and SG ID.

**OPERATOR — workstation:**

```bash
BUILDER_ID=REPLACE_BUILDER_INSTANCE_ID
BUILDER_ADDRESS=REPLACE_BUILDER_PUBLIC_IP_OR_APPROVED_BASTION_TARGET
BUILDER_KEY=REPLACE_OPERATOR_LOCAL_PEM_PATH
chmod 600 "$BUILDER_KEY"
aws ec2 describe-instances --instance-ids "$BUILDER_ID" \
  --query 'Reservations[0].Instances[0].{Id:InstanceId,Image:ImageId,Type:InstanceType,Profile:IamInstanceProfile,Volumes:BlockDeviceMappings,Metadata:MetadataOptions,Groups:SecurityGroups}' \
  --output json > builder-instance.json
ROOT_VOLUME_ID=$(aws ec2 describe-instances --instance-ids "$BUILDER_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)
aws ec2 describe-volumes --volume-ids "$ROOT_VOLUME_ID" \
  --query 'Volumes[0].{Id:VolumeId,SizeGiB:Size,Encrypted:Encrypted,Type:VolumeType,KmsKeyId:KmsKeyId}' \
  --output json > builder-root-volume.json
ssh -i "$BUILDER_KEY" "ubuntu@$BUILDER_ADDRESS"
```

Require encrypted10GiB gp3, only one volume, pinned AMI, t3.medium and no profile.
Validate SSH host fingerprint through the organization's trusted console/instance
identity workflow before accepting it. Do not disable StrictHostKeyChecking.

## 3. Copy and verify the reviewed payload

**OPERATOR — workstation:** Set the actual repository directory on the workstation.
It may be any trusted machine; the deployed worker will not depend on that machine.

```bash
REPO_DIR=REPLACE_OPERATOR_REPOSITORY_DIRECTORY
PAYLOAD="$REPO_DIR/.local/engineering-worker/phase28_4a_ec2/athena-ec2-image-payload.tar"
python3 - "$PAYLOAD" <<'PY'
import hashlib,sys
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()=='2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689'
print('Payload digest verified')
PY
scp -i "$BUILDER_KEY" "$PAYLOAD" "ubuntu@$BUILDER_ADDRESS:/home/ubuntu/athena-ec2-image-payload.tar"
```

**BUILDER — unprivileged:** Verify before extracting. This confirms contents/hashes,
not the safety of the recipes; review their text independently.

```bash
python3 - <<'PY'
import hashlib,json,tarfile,pathlib
p='/home/ubuntu/athena-ec2-image-payload.tar'
assert hashlib.sha256(open(p,'rb').read()).hexdigest()=='2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689'
with tarfile.open(p) as t:
    m=t.getmembers()
    assert len(m)==20 and all(v.isfile() and not v.name.startswith('/') and '..' not in pathlib.PurePosixPath(v.name).parts for v in m)
    manifest=json.load(t.extractfile('payload-manifest.json'))
    assert manifest['status']=='REVIEW_REQUIRED_NOT_AN_AMI'
    assert manifest['previewEnabled'] is False and manifest['runtimePermissionsActivated'] is False
    assert set(v.name for v in m)==set(manifest['files'])|{'payload-manifest.json'}
    for name,digest in manifest['files'].items():
        assert hashlib.sha256(t.extractfile(name).read()).hexdigest()==digest
print('20 fixed regular files and all hashes verified')
PY
```

**BUILDER ROOT — requires sudo:**

```bash
sudo install -d -m 0700 /opt/athena-build
sudo tar --extract --file=/home/ubuntu/athena-ec2-image-payload.tar \
  --directory=/opt/athena-build --no-same-owner
sudo chown -R root:root /opt/athena-build
sudo cat /opt/athena-build/image/install-image
sudo cat /opt/athena-build/image/configure-network
```

Do not execute either recipe yet. Record reviewed payload/source identity.

## 4. Install only approved pinned tooling

This stage requires an infrastructure reviewer to pin actual Ubuntu package
versions and all transitive downloads. No invented package version or checksum is
provided. **Discovery is not approval.** No `curl | sh`, unversioned installer,
`apt upgrade`, runtime boot installation or copied workstation credential.

### 4a. Ubuntu packages and kernel

**BUILDER ROOT — requires sudo; repository metadata discovery only:**

```bash
sudo apt-get update
apt-cache policy git python3 docker.io containerd runc iptables \
  ca-certificates curl xz-utils gnupg build-essential cloud-init systemd linux-aws
```

Operator reviews candidates against patched base/security advisories and records
literal package versions. Debian/Ubuntu signed repository metadata must verify;
do not use `--allow-unauthenticated` or disable expiry/signature checks. Include
kernel, systemd, cloud-init and container runtime dependencies in the approved
build record. The distro `docker.io` package is the selected host Docker source;
do not mix it with Docker CE packages or Docker Desktop.

**BUILDER — fill reviewed literal versions:**

```bash
GIT_VERSION=REPLACE_APPROVED_GIT_VERSION
PYTHON_VERSION=REPLACE_APPROVED_PYTHON3_VERSION
DOCKER_VERSION=REPLACE_APPROVED_DOCKER_IO_VERSION
CONTAINERD_VERSION=REPLACE_APPROVED_CONTAINERD_VERSION
RUNC_VERSION=REPLACE_APPROVED_RUNC_VERSION
IPTABLES_VERSION=REPLACE_APPROVED_IPTABLES_VERSION
CA_VERSION=REPLACE_APPROVED_CA_CERTIFICATES_VERSION
CURL_VERSION=REPLACE_APPROVED_CURL_VERSION
XZ_VERSION=REPLACE_APPROVED_XZ_UTILS_VERSION
GPG_VERSION=REPLACE_APPROVED_GNUPG_VERSION
BUILD_VERSION=REPLACE_APPROVED_BUILD_ESSENTIAL_VERSION
KERNEL_VERSION=REPLACE_APPROVED_LINUX_AWS_VERSION
```

**BUILDER ROOT — requires sudo:** Download first, then review ALL `.deb` filenames,
versions, SHA256 and transitive packages before installing that exact cached set.
If review finds a problem, stop rather than re-resolving versions during install.

```bash
sudo apt-get --download-only --no-install-recommends install \
  "git=$GIT_VERSION" "python3=$PYTHON_VERSION" "docker.io=$DOCKER_VERSION" \
  "containerd=$CONTAINERD_VERSION" "runc=$RUNC_VERSION" "iptables=$IPTABLES_VERSION" \
  "ca-certificates=$CA_VERSION" "curl=$CURL_VERSION" "xz-utils=$XZ_VERSION" \
  "gnupg=$GPG_VERSION" "build-essential=$BUILD_VERSION" "linux-aws=$KERNEL_VERSION"
sudo sha256sum /var/cache/apt/archives/*.deb
sudo apt-get --no-download --no-install-recommends install \
  "git=$GIT_VERSION" "python3=$PYTHON_VERSION" "docker.io=$DOCKER_VERSION" \
  "containerd=$CONTAINERD_VERSION" "runc=$RUNC_VERSION" "iptables=$IPTABLES_VERSION" \
  "ca-certificates=$CA_VERSION" "curl=$CURL_VERSION" "xz-utils=$XZ_VERSION" \
  "gnupg=$GPG_VERSION" "build-essential=$BUILD_VERSION" "linux-aws=$KERNEL_VERSION"
dpkg-query -W -f='${Package}\t${Version}\t${Architecture}\n'
```

Preserve package inventory/checksums externally, not build logs in the final image.
Keep baseline kernel/security updates deterministic; if existing base packages need
patches, explicitly pin those reviewed replacements too before continuing.

### 4b. Node24 at the fixed path

Proposed pin: **v24.21.0 linux-x64**, published by Node. Operator must approve its
security state; this runbook does not silently select latest. The
[official checksum file](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt)
identifies the x64 `.tar.xz` as
`fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`.

**BUILDER — unprivileged download/check:**

```bash
mkdir -p /home/ubuntu/athena-tooling
cd /home/ubuntu/athena-tooling
curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  https://nodejs.org/download/release/v24.21.0/node-v24.21.0-linux-x64.tar.xz \
  --output node-v24.21.0-linux-x64.tar.xz
printf '%s  %s\n' \
  fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 \
  node-v24.21.0-linux-x64.tar.xz | sha256sum --check -
```

**BUILDER ROOT — requires sudo:**

```bash
sudo tar --extract --xz --file=node-v24.21.0-linux-x64.tar.xz \
  --directory=/usr/local --strip-components=1 --no-same-owner
/usr/local/bin/node --version
```

Require `v24.21.0` and executable `/usr/local/bin/node`. Record binary SHA256.

### 4c. SSM Agent — exactly one Debian installation

The recipe expects **amazon-ssm-agent.service**. Ubuntu images may preinstall a
Snap agent with a different service name. AWS recommends Snap for these Ubuntu
releases; this existing recipe deliberately requires a reviewed Debian deployment.
Do not create a misleading service alias or run both agents. Review this choice
and perform the supported package conversion while SSH access is still available.
[Ubuntu SSM guidance](https://docs.aws.amazon.com/systems-manager/latest/userguide/agent-install-ubuntu-64-snap.html).

Required minimum: **3.3.2746.0**; proposed reviewed release **3.3.5390.0** (AWS
release2026-09-17). Use the actual approved package and detached signature, frozen
as local artifacts. The AWS download alias is mutable: download for discovery,
verify version/signature/hash, and do not redownload after approval.

**BUILDER — unprivileged:**

```bash
cd /home/ubuntu/athena-tooling
curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  https://s3.ap-southeast-1.amazonaws.com/amazon-ssm-ap-southeast-1/latest/debian_amd64/amazon-ssm-agent.deb \
  --output amazon-ssm-agent.deb
curl --fail --show-error --location --proto '=https' --tlsv1.2 \
  https://s3.ap-southeast-1.amazonaws.com/amazon-ssm-ap-southeast-1/latest/debian_amd64/amazon-ssm-agent.deb.sig \
  --output amazon-ssm-agent.deb.sig
dpkg-deb --field amazon-ssm-agent.deb Package Version Architecture
sha256sum amazon-ssm-agent.deb amazon-ssm-agent.deb.sig
```

Require package `amazon-ssm-agent`, architecture `amd64` and approved version
`3.3.5390.0`; if alias has moved, stop and obtain/review that specific release, or
approve a new version explicitly. Never approve solely because version >=minimum.
Copy the public signing key (NOT a secret) from
[AWS signature verification](https://docs.aws.amazon.com/systems-manager/latest/userguide/verify-agent-signature.html)
into `amazon-ssm-agent.gpg`. For versions3.3.4851.0+, AWS currently specifies
fingerprint `1C5B395CBE5E74E2F1CA21592784DBF388D19D46`.

```bash
gpg --import amazon-ssm-agent.gpg
gpg --fingerprint 2784DBF388D19D46
gpg --verify amazon-ssm-agent.deb.sig amazon-ssm-agent.deb
```

Require exact independent fingerprint and Good signature; reject expired/bad or
unexpected signatures. Record approved `.deb` SHA256 and signature result.

**BUILDER ROOT — requires sudo:** If `snap list amazon-ssm-agent` shows a Snap agent,
run the first two lines; otherwise omit them. Do not purge all Snap packages.

```bash
sudo snap stop amazon-ssm-agent
sudo snap remove --purge amazon-ssm-agent
sudo dpkg --install /home/ubuntu/athena-tooling/amazon-ssm-agent.deb
sudo systemctl enable amazon-ssm-agent.service
sudo systemctl start amazon-ssm-agent.service
/usr/bin/amazon-ssm-agent -version
sudo systemctl is-enabled amazon-ssm-agent.service
```

The builder has no IAM profile: agent registration/connectivity need not succeed
here. A real release worker must use the existing limited worker profile and
actually register. No broad instance role is added to make builder registration pass.
Disable unattended package/Snap refresh on this immutable worker image through
the approved image policy; security updates require a new reviewed bake. Record
that operational obligation; do not disable security monitoring.

## 5. Build the two reviewed container images

Host packages are now pinned. Container base approval is a separate checkpoint.
Use **official Node24 Debian bookworm-slim amd64**, resolve its immutable registry
digest and review the exact image before building. Do not use an unpinned `FROM`.

**BUILDER ROOT — requires sudo / Docker host administration:**

```bash
sudo systemctl start docker.service
sudo docker pull --platform linux/amd64 node:24.21.0-bookworm-slim
sudo docker image inspect node:24.21.0-bookworm-slim \
  --format '{{json .RepoDigests}} {{.Architecture}} {{.Os}} {{.Id}}'
sudo docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges --user 65532:65532 \
  node:24.21.0-bookworm-slim /usr/local/bin/node --version
```

Reviewer records literal **node@sha256:64hex** repository digest, linux/amd64,
Nodeversion, scan findings and approval. No actual registry digest is invented here.
The current reviewed Dockerfile consumes a local, checksummed pnpm11.17.0 npm
artifact and suppresses lifecycle scripts; it no longer downloads pnpm during
build. Obtain the artifact and upstream integrity in the infrastructure review,
copy it to the temporary builder, and use the approved SHA-256 below. This is
additional tooling, not part of the signed-runtime payload archive.

**BUILDER ROOT — requires sudo; substitute only reviewed non-secret pins:**

```bash
PNPM_SHA256=REPLACE_WITH_REVIEWED_64_HEX_SHA256
printf '%s' "$PNPM_SHA256" | grep -Eq '^[a-f0-9]{64}$'
printf '%s  %s\n' "$PNPM_SHA256" /tmp/reviewed-pnpm.tgz | sha256sum --check
sudo install -m 0444 /tmp/reviewed-pnpm.tgz /opt/athena-build/image/pnpm.tgz
```

```bash
REVIEWED_NODE_IMAGE=REPLACE_WITH_APPROVED_NODE_AT_SHA256_DIGEST
printf '%s' "$REVIEWED_NODE_IMAGE" | grep -Eq '^node@sha256:[a-f0-9]{64}$'
sudo docker build --platform linux/amd64 --pull=false --network=none \
  --build-arg "REVIEWED_NODE_IMAGE=$REVIEWED_NODE_IMAGE" \
  --file /opt/athena-build/image/task-node.Dockerfile \
  --tag alexa-engineering-node:1 /opt/athena-build
sudo docker build --platform linux/amd64 --pull=false --network=none \
  --build-arg "REVIEWED_NODE_IMAGE=$REVIEWED_NODE_IMAGE" \
  --file /opt/athena-build/image/registry-proxy.Dockerfile \
  --tag athena-registry-proxy:1 /opt/athena-build
sudo docker image inspect alexa-engineering-node:1 athena-registry-proxy:1 \
  --format '{{.Id}} {{.Architecture}} {{.Os}}'
sudo docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges --user 65532:65532 \
  alexa-engineering-node:1 /usr/local/bin/pnpm --version
```

Require pnpm11.17.0 and preserve BOTH output image IDs (`sha256:...`). The proxy
bundle must be copied from the reviewed payload, not rebuilt from other source.
Package build network is temporary builder-only; task dependency network will be
proxy-only. No Python/Gradle execution image is included. Host Python is measurement
and infrastructure tooling, not permission to execute Python tasks.

Offline alternative for an approved image-building facility: export its reviewed
images with `docker save`, hash the tar externally, copy over SSH, verify those
hashes on builder and use `sudo docker load --input REVIEWED_TAR`. Compare actual
IDs to the approved record; do not merely trust image tags.

## 6. Execute the fixed install-image recipe

Before sealing, configure only the already-reviewed whole-VM sysctl file and boot
once to test the PID constraint. Lowering `pid_max` on a busy existing boot does
not remove older high-numbered PIDs/TIDs. **This check can reject the chosen base.**

**BUILDER ROOT — requires sudo:**

```bash
sudo install -m 0444 /opt/athena-build/image/90-athena.conf /etc/sysctl.d/90-athena.conf
sudo swapoff --all
swapon --show
sudo reboot
```

Ensure no swap fstab entry/service will recreate swap; remove only the identified
builder swap configuration under operator review. Reconnect via SSH after reboot.
No Athena units are installed yet, so the deadline is not active at this stage.
Check all PID/TID values are below512 with step7's checker before proceeding.
If Ubuntu boot produces higher identifiers before sysctl applies, stop: do not
claim a low current sysctl is proof, ignore that rejection or patch the runtime.
A compatible reviewed early-boot image must be supplied and retested separately.

**BUILDER ROOT — requires sudo; exact fixed recipe:**

```bash
sudo sh /opt/athena-build/image/install-image
```

It must exit0 and print a **64-character lowercase hexadecimal runtime digest**.
Record it immediately outside the builder. It installs fixed reviewed paths and
seals fourteen runtime-file hashes plus both Docker image IDs in
`/etc/athena/image-manifest.json`. It enables watchdog/deadline units but does not
start the worker in the bake. Do not rerun sealing after a change: the manifest is
create-once; changed artifacts require a fresh reviewed builder/bake.

**Important:** do not reboot the builder after this point. A subsequent boot starts
the enabled3500-second deadline and may power off the builder. Do not disable or
modify that timer to keep an image build alive. Finish static checks, clean, stop
and capture; run runtime checks on disposable release instances afterwards.

## 7. Verify the image before capture

### 7a. Tooling, resources and boot prerequisites

**BUILDER — read-only except commands explicitly marked sudo:**

```bash
uname -m
/usr/local/bin/node --version
/usr/bin/git --version
/usr/bin/python3 --version
/usr/bin/docker --version
/usr/bin/amazon-ssm-agent -version
stat -fc %T /sys/fs/cgroup
cat /proc/sys/kernel/pid_max
cat /proc/swaps
findmnt -no SOURCE,FSTYPE,SIZE,TARGET /
findmnt -no SOURCE,FSTYPE,SIZE,TARGET /run
lsblk --bytes --output NAME,SIZE,TYPE,MOUNTPOINTS
sudo docker info --format '{{.CgroupVersion}} {{.CgroupDriver}}'
sudo systemctl is-enabled amazon-ssm-agent.service athena-watchdog.service athena-deadline.timer
sudo systemd-analyze verify /etc/systemd/system/athena-worker.service \
  /etc/systemd/system/athena-watchdog.service /etc/systemd/system/athena-network.service \
  /etc/systemd/system/athena-expire.service /etc/systemd/system/athena-deadline.timer
sudo ss -lntp
```

Require x86_64, Node24 exactpin, fixed tool paths, SSM approved version >=3.3.2746.0,
cgroup2fs, Docker cgroupVersion2/systemd driver, PID<=512, empty swap, single root
filesystem <=10GiB, /run RAM-backed, no Docker TCP2375/2376. Disk encryption is
verified by AWS DescribeVolumes (step2), not guessed from lsblk. On release,
`/workspace` and `/var/lib/docker` must be the same root device, not unbounded mounts.
Builder SSH22 is temporary; it is removed in step8. No installed worker may run:

```bash
sudo systemctl is-active athena-worker.service
sudo test ! -e /run/athena/bootstrap.json
sudo test ! -e /run/athena/lifetime.json
```

`is-active` must return inactive/nonzero. Do not interpret that expected result as
an installation failure. No scope/signing identity is fabricated on the builder.

**BUILDER ROOT — read-only PID/TID and sealed-file checker:**

```bash
sudo /usr/bin/python3 - <<'PY'
import pathlib,json,hashlib,subprocess,stat
limit=int(pathlib.Path('/proc/sys/kernel/pid_max').read_text())
assert 1<=limit<=512
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit(): continue
    try:
        assert int(p.name)<limit
        assert all(int(t.name)<limit for t in (p/'task').iterdir())
    except FileNotFoundError: pass
m=json.loads(pathlib.Path('/etc/athena/image-manifest.json').read_text())
for name,digest in m['files'].items():
    p=pathlib.Path(name); s=p.lstat()
    assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022
    assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
for tag,digest in m['images'].items():
    actual=subprocess.check_output(['/usr/bin/docker','image','inspect','--format','{{.Id}}',tag],text=True).strip()
    assert actual=='sha256:'+digest
print('PID/TID and sealed file/image checks passed')
PY
sudo /usr/local/bin/node -e 'const fs=require("node:fs");const crypto=require("node:crypto");const m=JSON.parse(fs.readFileSync("/etc/athena/image-manifest.json","utf8"));console.log(crypto.createHash("sha256").update(JSON.stringify(m)).digest("hex"));'
```

The Node command recomputes the same manifest digest as the helper. Require exact
match to step6. Do not use SHA256 of the archive, pretty-printed JSON or Docker tag
as the runtime digest. Export this non-secret manifest and inventory to the release
record before cleanup (`sudo cat` over the already trusted SSH channel is sufficient).

### 7b. Network and validation checks are live release checks

Review `/etc/athena/task-firewall.rules`, `/opt/athena/configure-network`, Docker
config and units against payload hashes. Do not run network setup on the builder:
it creates persistent Docker networks/firewall state and is intentionally not
idempotent. Capture with no runtime containers or networks beyond Docker defaults.

Step13 must establish: internal dependency/preview/relay networks, fixed proxy,
registry-only dependency traffic, no direct/private/metadata/control-plane traffic,
offline validation and fresh independent watchdog/kernel deadline evidence.
`ec2-helper.js evidence` on this unbootstrapped builder **must not be called a PASS**;
it requires genuine scope/lifetime/watchdog records and active units.

## 8. Remove build access, state and payloads

Export the non-secret build record first. The following cleanup is **human ROOT
on this disposable builder only**. Verify its instance ID; never run on a worker,
API server, owner workstation or a durable Engineering repository. Do not delete
`/opt/athena`, sealed manifest, required images or systemd unit files.

Keep the current SSH connection open until the final shutdown. Purging SSH and
removing keys prevents new connections. If the session closes early, stop the
builder using EC2 Console; do not capture an incompletely cleaned image.

**BUILDER ROOT — requires sudo:**

```bash
sudo systemctl stop amazon-ssm-agent.service
sudo systemctl disable --now ssh.socket ssh.service
sudo systemctl mask ssh.socket ssh.service
sudo apt-get purge --yes openssh-server
sudo install -m 0444 /dev/null /etc/cloud/cloud.cfg.d/98-athena-no-ssh.cfg
printf 'ssh_deletekeys: true\nssh_genkeytypes: []\nallow_public_ssh_keys: false\n' | sudo tee /etc/cloud/cloud.cfg.d/98-athena-no-ssh.cfg >/dev/null
sudo find /etc/ssh -maxdepth 1 -type f -name 'ssh_host_*' -delete
sudo find /root /home/ubuntu -type f \( -name authorized_keys -o -name .bash_history \) -delete
sudo rm -rf /root/.aws /root/.config/gcloud /root/.docker /root/.npm /root/.cache \
  /home/ubuntu/.aws /home/ubuntu/.docker /home/ubuntu/.npm /home/ubuntu/.cache \
  /home/ubuntu/.gnupg /home/ubuntu/athena-tooling
sudo docker builder prune --all --force
sudo docker image ls --no-trunc
sudo docker ps --all
sudo apt-get clean
sudo rm -rf /opt/athena-build /home/ubuntu/athena-ec2-image-payload.tar
sudo rm -rf /var/lib/amazon/ssm /var/log/amazon/ssm
sudo cloud-init clean --logs --machine-id --seed
sudo journalctl --rotate
sudo journalctl --vacuum-time=1s
sudo find /var/log -type f -exec truncate --size=0 {} +
sudo find /tmp /var/tmp -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
sudo test ! -e /run/athena/bootstrap.json
sudo test ! -e /run/athena/lifetime.json
sudo test ! -e /usr/sbin/sshd
sudo ss -lntp
sudo sync
sudo shutdown -h now
```

Do not blanket `docker system prune --all`: it can remove the required images.
No task/temporary containers may remain; remove only named disposable build/test
containers if present before this sequence. Remove unused base tags by exact name
only after confirming the two required image IDs still exist. Keep required layers.
SSM service remains enabled and its state is recreated on next worker boot.
[Cloud-init documents these clean options](https://docs.cloud-init.io/en/latest/reference/cli.html).

The new no-SSH cloud-init config is an operator image-hardening addition, recorded
in the external AMI build record; the existing runtime manifest does not hash this
extra file or all OS/tool binaries. **The sealed runtime hash is not whole-OS
attestation.** The exact AMI/snapshot binding, package inventory and independent
release gate must verify those too. Do not assert a broader seal than implemented.

After SSH disconnects, use the operator workstation for AWS actions. Never put a
cleanup private key or root password into the resulting image. EBS deletion is not
proof of cryptographic overwrite; the volume was encrypted and broad secrets were
never copied in. If a real credential was accidentally installed, do not publish:
quarantine the builder, rotate through the secure owner process, and rebake cleanly.

## 9. Create a private AMI from the stopped builder

**OPERATOR — workstation:**

```bash
aws ec2 wait instance-stopped --instance-ids "$BUILDER_ID"
SEALED_RUNTIME_SHA256=REPLACE_64_HEX_DIGEST_FROM_STEP_6
COMPANY_ID=REPLACE_ACTUAL_ATHENA_COMPANY_UUID
AMI_NAME=athena-engineering-ec2-v1-20261004
AMI_ID=$(aws ec2 create-image --instance-id "$BUILDER_ID" \
  --name "$AMI_NAME" \
  --description 'Reviewed Athena finite Engineering worker; preview disabled; release gate pending' \
  --tag-specifications \
  "ResourceType=image,Tags=[{Key=Name,Value=$AMI_NAME},{Key=athena:company,Value=$COMPANY_ID},{Key=athena:runtime,Value=$SEALED_RUNTIME_SHA256},{Key=athena:release,Value=PENDING}]" \
  "ResourceType=snapshot,Tags=[{Key=Name,Value=$AMI_NAME},{Key=athena:company,Value=$COMPANY_ID},{Key=athena:runtime,Value=$SEALED_RUNTIME_SHA256},{Key=athena:release,Value=PENDING}]" \
  --query ImageId --output text)
aws ec2 wait image-available --image-ids "$AMI_ID"
```

No `--no-reboot` on a running instance. We explicitly stop/sync first; AWS permits
CreateImage on a stopped EBS instance. Encryption must already exist on its root
volume; CreateImage does not change it.
[AWS CreateImage reference](https://docs.aws.amazon.com/cli/latest/reference/ec2/create-image.html).

Console alternative: **EC2 → Instances → stopped builder → Actions → Image and
templates → Create image** → name above → root10GiB, delete-on-termination → add
exact company/runtime/release=PENDING tags for image and snapshot → Create image.
Then **EC2 → AMIs → Owned by me** → wait Available. Do not share permissions.

## 10. Obtain AMI ID, root snapshot and sealed digest

**OPERATOR — workstation:**

```bash
aws ec2 describe-images --owners 737073451069 --image-ids "$AMI_ID" \
  --output json > published-image.json
ROOT_SNAPSHOT_ID=$(python3 - <<'PY'
import json
v=json.load(open('published-image.json'))['Images'][0]
assert v['OwnerId']=='737073451069' and v['State']=='available' and not v['Public']
assert v['Architecture']=='x86_64' and len(v['BlockDeviceMappings'])==1
b=v['BlockDeviceMappings'][0]
assert b['DeviceName']==v['RootDeviceName'] and b['Ebs']['VolumeSize']==10
assert b['Ebs']['DeleteOnTermination']
print(b['Ebs']['SnapshotId'])
PY
)
aws ec2 describe-snapshots --snapshot-ids "$ROOT_SNAPSHOT_ID" \
  --query 'Snapshots[0].{Id:SnapshotId,Owner:OwnerId,State:State,SizeGiB:VolumeSize,Encrypted:Encrypted,KmsKeyId:KmsKeyId}' \
  --output json > published-root-snapshot.json
aws ec2 describe-image-attribute --image-id "$AMI_ID" \
  --attribute launchPermission --output json > image-sharing.json
printf 'AMI_ID=%s\nROOT_SNAPSHOT_ID=%s\nSEALED_RUNTIME_SHA256=%s\n' \
  "$AMI_ID" "$ROOT_SNAPSHOT_ID" "$SEALED_RUNTIME_SHA256"
```

Require encrypted completed10GiB account-owned snapshot, private AMI, no external
launch permissions. Snapshot sharing must also remain private (EC2 → Snapshots →
select → Permissions). Console AMI Storage tab lists the root snapshot ID.
This is a **candidate image**, not a passed release. Do not set Athena READY.

## 11. Create AthenaEngineeringEvidenceV1, version1

**OPERATOR — workstation / existing infrastructure principal:** Use the exact
reviewed source from the payload, unchanged. No generic shell document, parameters,
StartSession document, preview document or extra execution authority.

```bash
DOCUMENT_SOURCE="$REPO_DIR/deploy/engineering-worker/aws/evidence-document.json"
python3 - "$PAYLOAD" "$DOCUMENT_SOURCE" <<'PY'
import tarfile,sys
with tarfile.open(sys.argv[1]) as t:
    assert t.extractfile('evidence-document.json').read()==open(sys.argv[2],'rb').read()
print('SSM source matches reviewed payload exactly')
PY
aws ssm describe-document --name AthenaEngineeringEvidenceV1 \
  --document-version 1 --output json
```

If ResourceNotFound/InvalidDocument, create it below. If present, do not overwrite,
update, delete or create version2 to hide a mismatch. Verify existing version1
content/owner/hash against exact source; stop for review on any mismatch.

```bash
aws ssm create-document --name AthenaEngineeringEvidenceV1 \
  --document-type Command --document-format JSON \
  --target-type /AWS::EC2::Instance \
  --content "file://$DOCUMENT_SOURCE" \
  --tags "Key=athena:company,Value=$COMPANY_ID" \
  --output json > evidence-document-created.json
```

Console alternative: **Systems Manager → Documents → Owned by me → Create document
→ Command or Session** → name `AthenaEngineeringEvidenceV1`, type **Command**, JSON
content → paste exact reviewed JSON → tag `athena:company=<actual company UUID>` →
Create document. Do not select Session or add parameters. The CLI fixes target type
explicitly and is preferred. Existing runtime IAM policies are unchanged.
[AWS CreateDocument](https://docs.aws.amazon.com/cli/latest/reference/ssm/create-document.html).

## 12. Obtain AWS's document SHA-256

**OPERATOR — workstation:** Wait until describe-document reports Active.

```bash
aws ssm describe-document --name AthenaEngineeringEvidenceV1 \
  --document-version 1 --output json > evidence-document-v1.json
python3 - <<'PY'
import json,re
v=json.load(open('evidence-document-v1.json'))['Document']
assert v['Owner']=='737073451069' and v['Status']=='Active'
assert v['DocumentVersion']=='1' and v['DocumentType']=='Command'
assert v['HashType']=='Sha256' and re.fullmatch('[a-f0-9]{64}',v['Hash'])
assert not v.get('Parameters')
print('ATHENA_ENGINEERING_EVIDENCE_V1_SHA256='+v['Hash'])
PY
aws ssm get-document --name AthenaEngineeringEvidenceV1 \
  --document-version 1 --document-format JSON --output json > evidence-document-content.json
python3 - "$DOCUMENT_SOURCE" <<'PY'
import json,sys
v=json.load(open('evidence-document-content.json'))
assert json.loads(v['Content'])==json.load(open(sys.argv[1]))
print('AWS version1 content matches reviewed source')
PY
aws ssm describe-document-permission --name AthenaEngineeringEvidenceV1 \
  --permission-type Share --output json
```

Require no public/cross-account sharing. Return the **AWS-reported Hash with
HashType Sha256**, not local `sha256sum evidence-document.json`; AWS serialization
may differ. Preserve source bytes and AWS result separately.

## 13. Mandatory live image security release gate

**Publication is not release. All rows below require real observations.** Keep
image `athena:release=PENDING` until signed off. Failed/unknown means FAIL, not
waivable approval. Do not weaken preflight, limits, mount/network rules or IAM.

### 13a. Two separate classes of test instance

1. **Disposable diagnostic clone(s)**: RELEASE OPERATOR launches the exact candidate
   AMI, t3.medium, encrypted10GiB, IMDSv2/hop1, in an isolated reviewed test network.
   No GitHub/provider secrets, repositories or signing keys. Use an existing
   approved diagnostic instance profile/SSM session if the organization has one.
   That role must never be assigned to Athena's production worker. Do not broaden
   AthenaEngineeringWorker or athena-engineering to obtain a test shell.
   Since SSH is absent, an already-approved diagnostic management path is a real
   prerequisite. If none exists, stop and request the infrastructure operator's
   reviewed test facility; there is no safe invented login shortcut in this runbook.
2. **Unmodified governed release worker(s)**: provision through the existing
   CloudWorkspaceProvider with exact image/snapshot/runtime/document bindings,
   reviewed company reference, finite profiles and intended worker SG/profile.
   Only Athena issues scoped short-lived workload bootstrap. Do not create dummy
   identity JSON, manual READY flags or signing keys. Keep previewEnabled=false.
   Hold the release candidate away from ordinary owner work until gate approval.

Console diagnostic launch: **EC2 → AMIs → Owned by me → exact candidate AMI →
Launch instance from AMI** → name `athena-engineering-release-v1-01` → t3.medium,
no keypair, reviewed diagnostic SG/profile, one encrypted10GiB root, IMDSv2/hop1,
shutdown **Terminate**, CPUcreditStandard. No broader egress. Do not embed secrets
or shell scripts in user-data. On no-bootstrap diagnostics the fixed3500-second
timer still terminates it; don't disable the timer. Use a fresh clone for each fault.

The worker SG's currently reported loopback-only egress cannot reach SSM/backend/
registry. The network operator must supply **reviewed constrained destinations or
an existing approved egress path** before a governed launch can succeed. AWS SGs
filter IPs, not hostnames. Do not claim Railway `.railway.internal` resolves from
EC2: worker→Railway needs a reviewed HTTPS address reachable from this network.
Do not add a public API exposure, tunnel or all-egress here. If that approved route
or provider activation is absent, record NETWORK/CONTROL_PLANE prerequisite blocked.
The four values alone do not remove those activation prerequisites.

### 13b. Verify the live finite SSM evidence

Once a genuine test worker has bootstrapped, the existing provider/preflight must
verify actual signed identity and measured containment before READY. Independently
run the pinned parameterless evidence document on that exact instance.

**RELEASE OPERATOR — workstation; finite command only:**

```bash
RELEASE_INSTANCE_ID=REPLACE_EXACT_GOVERNED_RELEASE_INSTANCE_ID
EVIDENCE_SHA256=REPLACE_AWS_DOCUMENT_SHA256_FROM_STEP_12
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$RELEASE_INSTANCE_ID" \
  --document-name AthenaEngineeringEvidenceV1 --document-version 1 \
  --document-hash "$EVIDENCE_SHA256" --document-hash-type Sha256 \
  --timeout-seconds 30 --max-concurrency 1 --max-errors 0 \
  --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$COMMAND_ID" \
  --instance-id "$RELEASE_INSTANCE_ID"
aws ssm get-command-invocation --command-id "$COMMAND_ID" \
  --instance-id "$RELEASE_INSTANCE_ID" --output json > release-evidence.json
```

No parameters or output to a public bucket. The document runs as root internally
but contains only the reviewed fixed helper. Require Success/responseCode0 and
parse the bounded JSON: exact company/repository/workspace/worker/generation,
matching runtime digest, CPU<=2, RAM<=4GiB, disk<=10GiB, PID<=512, idle<=300s,
future hard deadline<=3600s, expected executionUID65532/supervisorUID0 and all
actual checks true. Verify worker's own signed handshake/results and API's separate
pinned evidence check too. Do not copy bootstrap/user-data to the evidence record.

### 13c. Reproducible diagnostic commands (ROOT on disposable diagnostic clone)

These fixed human tests are **not model capabilities**. They demonstrate properties
on actual containers but do not replace tests through the canonical runtime.
Never run them on the builder after sealing or a live owner task worker.

Read-only host checks: repeat step7; require no sshd, no listening22/2375/2376,
no swap, correct Docker/root device. For network testing on a pristine diagnostic
boot, run only once:

```bash
sudo /opt/athena/configure-network
sudo docker network inspect athena-dependencies alexa-engineering-preview athena-relay athena-egress
sudo iptables -S ATHENA-TASKS
sudo iptables -S DOCKER-USER
sudo iptables -S INPUT
```

Compare every rule/address/subnet to the sealed files, not just chain existence.
If network setup already ran, inspect it; do not rerun/create duplicate chains.

**Offline validation, read-only root, seccomp, capabilities and secret mounts:**

```bash
sudo docker run --rm --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const fs=require("node:fs"),assert=require("node:assert"),net=require("node:net");
assert.equal(process.getuid(),65532);
const status=fs.readFileSync("/proc/self/status","utf8");
assert(/CapEff:\s+0+\n/.test(status)&&/NoNewPrivs:\s+1\n/.test(status)&&/Seccomp:\s+2\n/.test(status));
assert.throws(()=>fs.writeFileSync("/athena-denied","x"));
for(const p of ["/run/athena/bootstrap.json","/etc/athena/image-manifest.json","/var/run/docker.sock","/root/.aws/credentials"])assert(!fs.existsSync(p));
const s=net.connect({host:"1.1.1.1",port:443});s.setTimeout(2000);
s.on("connect",()=>{console.error("FAIL network");process.exit(1)});
s.on("error",()=>{console.log("PASS offline checks");process.exit(0)});
s.on("timeout",()=>{s.destroy();console.log("PASS offline timeout");process.exit(0)});'
```

**CPU bound:** run a finite two-thread CPU load, inspect the actual quota, and
record Docker CPU statistics (200% is two CPUs, not200vCPUs). Physical VM sizing
remains independently checked in AWS; this is container evidence only.

```bash
sudo docker run --detach --name athena-release-cpu --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const {Worker}=require("node:worker_threads");
for(let i=0;i<2;i++)new Worker("const end=Date.now()+10000;while(Date.now()<end){}",{eval:true});'
sudo docker inspect athena-release-cpu --format '{{.HostConfig.NanoCpus}}'
sudo docker exec athena-release-cpu /usr/local/bin/node -e 'console.log(require("node:fs").readFileSync("/sys/fs/cgroup/cpu.max","utf8"))'
sudo docker stats --no-stream athena-release-cpu
sudo docker wait athena-release-cpu
sudo docker rm athena-release-cpu
```

Require NanoCpus2000000000 and finite cpu.max quota/period<=2; inspect promptly
while the10-second test is running. If the test ended before inspection, repeat on
a fresh named test, not inferred PASS. Kernel counters and runtime stats are evidence,
not a promise of dedicated t3 CPU throughput or cost.

**Memory exhaustion:** actual container must be OOM killed (exit137), with host
supervisor surviving. An ordinary application error is not memory-limit evidence.

```bash
sudo docker run --name athena-release-memory --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --memory-swap 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e 'const b=Buffer.alloc(768*1024*1024,1);setTimeout(()=>console.log(b.length),10000)'
sudo docker inspect athena-release-memory --format '{{.State.OOMKilled}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}'
sudo docker rm athena-release-memory
```

**PID exhaustion:** use a fresh clone; verify actual task cgroup `pids.max=256`,
`pids.events` increases, spawn fails at the bound and host still responds. This
bounded test creates at most300 children with independent15s exit deadlines.

```bash
sudo docker run --rm --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const {spawn}=require("node:child_process"),fs=require("node:fs");let denied=0;
for(let i=0;i<300;i++){const p=spawn("/bin/sleep",["15"]);p.on("error",()=>denied++);}
setTimeout(()=>{console.log({denied,max:fs.readFileSync("/sys/fs/cgroup/pids.max","utf8"),events:fs.readFileSync("/sys/fs/cgroup/pids.events","utf8")});process.exit(denied?0:1)},3000);'
```

Also test whole-VM bound on a disposable clone with independent infrastructure
termination armed; require all existing PIDs/TIDs<512 before stress and combined
host+containers never beyond the approved bound. Do not use an unbounded fork bomb.
If PID exhaustion breaks watchdog/SSM before a verified independent expiry, FAIL.

**Scratch disk:** no write to the host root; bounded tmpfs must reject32MiB on16MiB.

```bash
sudo docker run --rm --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const fs=require("node:fs");try{fs.writeFileSync("/tmp/fill",Buffer.alloc(32*1024*1024));process.exit(1)}catch(e){console.log(e.code);process.exit(e.code==="ENOSPC"?0:1)}'
```

**Root/workspace exhaustion — ROOT, separate disposable clone only:** This can
make the instance unusable. Arm independent infrastructure termination first and
export evidence beforehand. Never use the builder, a running owner task or its repo.
The following fixture mounts only a named disposable directory and writes at most
a fixed10GiB plus one1MiB chunk, stopping on ENOSPC; it cannot write indefinitely.

```bash
sudo install -d -m 0700 -o 65532 -g 65532 /workspace/athena-release-disk
sudo docker run --name athena-release-disk --pull never --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  --mount type=bind,source=/workspace/athena-release-disk,target=/workspace \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const fs=require("node:fs");const s=fs.statfsSync("/workspace");
if(s.blocks*s.bsize>10*1024**3)process.exit(1);
const fd=fs.openSync("/workspace/bounded-fill","wx"),b=Buffer.alloc(1024*1024,1);
try{for(let i=0;i<=10240;i++)fs.writeSync(fd,b);console.log("FAIL no disk limit");process.exit(1)}
catch(e){console.log(e.code);process.exit(e.code==="ENOSPC"?0:1)}'
```

Require ENOSPC, measured root capacity<=10GiB and fail-closed watchdog/termination
under pressure. Terminate/reconcile that clone; do not add a volume, enlarge root
or disable the watchdog to rescue the test. Disk-full observations are kept outside
the instance. This fixed diagnostic mount does not authorize client-selected paths.

**Dependency proxy positive test:**

```bash
sudo docker run --rm --pull never --network athena-dependencies --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  --env HOME=/tmp --env npm_config_userconfig=/dev/null \
  --env npm_config_https_proxy=http://athena-registry-proxy:3128 \
  --env npm_config_proxy=http://athena-registry-proxy:3128 \
  alexa-engineering-node:1 /usr/local/bin/npm view pnpm@11.17.0 version \
  --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=10000
```

Require11.17.0. Negative CONNECT test for a fixed unapproved destination:

```bash
sudo docker run --rm --pull never --network athena-dependencies --read-only \
  --user 65532:65532 --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 2 --pids-limit 256 \
  alexa-engineering-node:1 /usr/local/bin/node -e '
const net=require("node:net");let accepted=false;
const s=net.connect({host:"athena-registry-proxy",port:3128},()=>s.write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"));
s.setTimeout(3000);s.on("data",b=>{if(b.toString().includes("200 Connection Established"))accepted=true});
s.on("error",()=>{});s.on("timeout",()=>s.destroy());s.on("close",()=>{console.log(accepted?"FAIL":"PASS rejected CONNECT");process.exit(accepted?1:0)});'
```

Also repeat denial against metadata169.254.169.254, actual VPC/control-plane private
addresses, direct public443 without proxy, docker-gateway host and IPv6. Use only
fixed operator-reviewed test targets; do not send credentials or attempt to read
metadata secrets. A failed DNS lookup is not proof of firewall isolation: use actual
IP probes and inspect live kernel rules. Proxy CONNECT must reject private/nonpublic
DNS results and authorization headers. Test a fixture package with a benign
postinstall marker through the registered dependency capability: marker must not
exist because lifecycle scripts are suppressed. No secrets in the fixture.

### 13d. Required release matrix and exact outcome

| Test on actual candidate     | Human action / command or canonical operation                                                                                                                                                                                                                   | Required result                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CPU/RAM/disk/process         | Above stress probes; inspect live `/sys/fs/cgroup/{cpu.max,memory.max,pids.max}` in canonical task containers; EC2 DescribeInstances/Volumes                                                                                                                    | Physical<=2CPU/4GiB/10GiB, finite cgroups, no swap, host bound<=512; exhaustion cannot grant authority         |
| Signer/supervisor separation | Canonical benign fixture tries `/run/athena`, `/opt/athena`, Docker socket, traversal/symlink escapes                                                                                                                                                           | No material exposed; UID65532, no privileged/host namespaces/caps/secrets mounts                               |
| Network                      | Positive registry test + fixed negative direct/metadata/private/backend probes; inspect exact rules                                                                                                                                                             | Only registry proxy route; offline validation has none; task code cannot reach control plane                   |
| Canonical validation         | Existing registered npm/pnpm install, patch, build/test on scoped fixture                                                                                                                                                                                       | Lifecycle suppressed; validation container networknone, readonly root, constrained scratch and task mount      |
| Signed identity              | Existing live signed-runtime test client attempts wrong company/repo/workspace/generation, expired credential and replay                                                                                                                                        | Rejected without READY/action; no manual identity replacement                                                  |
| Worker crash                 | Fresh governed test worker; operator kills only worker process via `sudo systemctl kill --signal=SIGKILL athena-worker.service` using approved diagnostic access                                                                                                | OnFailure/independent watchdog shuts down; EC2 terminates; task durable state preserved, no duplicate mutation |
| Watchdog crash               | Separate fresh test worker; `sudo systemctl kill --signal=SIGKILL athena-watchdog.service`                                                                                                                                                                      | Independently enforced fail-closed termination, not heartbeat-only cleanup                                     |
| Idle                         | Fresh genuine worker; send no signed work, allow polls only; record elapsed monotonic/provider timestamps                                                                                                                                                       | Terminated<=300s idle; heartbeat does not extend deadline                                                      |
| Hard lifetime                | Fresh genuine worker with only registered harmless work until deadline; read effective timer via `busctl get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/athena_2ddeadline_2etimer org.freedesktop.systemd1.Timer NextElapseUSecMonotonic` | Terminates<=3600s including cleanup; worker cannot reset absolute deadline                                     |
| Scheduler backup             | Separate governed worker; inspect its provider-created Scheduler target/tags/time and observe firing                                                                                                                                                            | Exact instance termination via existing reaper; reconcile uncertain outcome before replacement                 |
| Sealed file/image mismatch   | Diagnostic clone only: alter one sealed file or retag one image; run genuine startup/evidence with reviewed test setup                                                                                                                                          | Rejected; never reseal or ignore discrepancy; destroy tampered clone                                           |
| SSM hash mismatch            | Repeat step13b with deliberately different64hex hash on scoped test instance                                                                                                                                                                                    | AWS/backend rejects; no unpinned retry or generic SSM fallback                                                 |
| Secret redaction             | Use non-production secret-shaped canaries, not credentials, in isolated fixture tests                                                                                                                                                                           | Fail/exclude appropriately; no raw value in model context/log/audit/export; signed source provenance preserved |
| Cleanup/recovery             | Wait actual shutdown; describe instance/root volume; canonical reaper/reconcile                                                                                                                                                                                 | Terminated, attached root deleted, durable task records retained; generation bound replacement, no replay      |
| Preview disabled             | Existing preview operation under disabled configuration                                                                                                                                                                                                         | Structured refusal; no route, HTTP fallback, fake ready or claimed HTTPS acceptance                            |

There is **no packaged live destructive release harness or known test-worker ID in
this payload**. The matrix names the necessary live operator tests, not a CLI that
can manufacture their PASS records. The existing `pnpm test` fixtures do not count.
Where canonical signed test submissions or management access are not available,
mark that row BLOCKED and retain PENDING. Do not expose arbitrary shell to Athena
just to automate these tests. An infrastructure reviewer must retain commands,
non-secret observations/timestamps and independent PASS/FAIL sign-off for every row.

**RELEASE OPERATOR — workstation cleanup verification for each test instance:**

```bash
aws ec2 wait instance-terminated --instance-ids "$RELEASE_INSTANCE_ID"
aws ec2 describe-instances --instance-ids "$RELEASE_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].State.Name' --output text
aws ec2 describe-volumes --volume-ids REPLACE_RECORDED_RELEASE_ROOT_VOLUME_ID
```

Require `terminated`, then InvalidVolume.NotFound for the recorded root volume.
If it remains, retain FAIL/cleanup blocker; do not delete canonical Engineering data.
No privileged live test may contain an owner repository or real secret.

Only after independent approval of all required rows:

```bash
aws ec2 create-tags --resources "$AMI_ID" "$ROOT_SNAPSHOT_ID" \
  --tags Key=athena:release,Value=PASSED
```

This tag records the human decision; Athena still requires its own scoped config,
credential binding, resource checks, authentic handshake and signed evidence.
Do not set READY by tag. No actual release has occurred while drafting this runbook.

## 14. Destroy the temporary builder

**OPERATOR — workstation**, after the image is Available and release evidence is
saved externally (or immediately on a failed build after retaining safe diagnostics):

```bash
aws ec2 terminate-instances --instance-ids "$BUILDER_ID"
aws ec2 wait instance-terminated --instance-ids "$BUILDER_ID"
aws ec2 describe-volumes --volume-ids "$ROOT_VOLUME_ID"
```

Require root InvalidVolume.NotFound. Console: **EC2 → Instances → exact builder →
Instance state → Terminate (delete) instance**. Confirm exact named disposable
builder, never API/web/runtime owner records. No change to AMI/snapshot sharing.

When its ENI is gone, delete only the newly created temporary builder SG/keypair:

```bash
aws ec2 delete-security-group --group-id REPLACE_TEMPORARY_BUILDER_SG_ID
aws ec2 delete-key-pair --key-name athena-engineering-image-builder-v1
```

Omit key deletion if a pre-existing organization key was reused. Remove only the
operator's temporary local PEM via its secure workstation process; no key material
was copied to the image. Keep private released AMI/root snapshot, documentversion1
and sanitized evidence. Do not delete existing VPC/subnets/IGW/route table,
worker/preview SGs, roles, policies or durable Engineering records.

## Return these four non-secret values

- [ ] **AMI ID:** `ami-...` — private, account737073451069, ap-southeast-1, exact release-tested candidate.
- [ ] **Root snapshot ID:** `snap-...` — the sole encrypted10GiB root snapshot of that AMI.
- [ ] **Sealed runtime SHA-256:** 64lowercasehex — step6 helper output, independently recomputed in step7 and matched live.
- [ ] **AthenaEngineeringEvidenceV1 SHA-256:** 64lowercasehex — AWS DescribeDocument version1 Hash, HashTypeSha256.

Include whether the mandatory release gate is PASSED or BLOCKED and reference its
sanitized operator evidence. No AWS keys, PEM, password, bootstrap or signing material.
The values can be returned for review before activation; they alone do not authorize
or prove READY. Preview remains deferred and 28.4 is not fully verified.
