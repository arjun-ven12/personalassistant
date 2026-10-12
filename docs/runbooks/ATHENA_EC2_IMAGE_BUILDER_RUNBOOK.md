# Primary path: Athena Engineering EC2 Image Builder

Account **737073451069**, region **ap-southeast-1 (Singapore)**. Stack name:
**athena-engineering-image-builder**. This produces a private candidate AMI, never
a RELEASED image or READY worker. Runtime permissions and HTTPS preview stay
inactive. Phase 28.4 and 28.5B live acceptance remain conditional.

The manual `ATHENA_EC2_AMI_OPERATOR_RUNBOOK.md` remains fallback/audit documentation.
No privileged bake commands are executed by Codex. AWS Image Builder runs the
reviewed root recipes on temporary instances. No Mac service participates in an
Engineering workload.

## Principals and boundaries

Use the owner's **reviewed infrastructure principal**, through AWS IAM Identity
Center/SSO or an existing infrastructure deployment role. Do not use
`AWS_ENGINEERING_CREDENTIAL`, `athena-engineering`, `AthenaEngineeringWorker`, or
`AthenaEngineeringReaper`. No raw credential belongs in a command, upload or chat.
The infrastructure principal needs its existing approved CloudFormation,
Image Builder, EC2 image/snapshot inspection, S3 upload/read, and exact evidence
SSM-document creation authority. This guide does not expand existing runtime IAM
policies. If denied, have the infrastructure operator review the specific denied
infrastructure action; do not attach AdministratorAccess.

The template creates a distinct EC2 build role/profile, without a fixed runtime
role name, and an independent builder SG. The build role can read only the two
current-revision input objects, write evidence/current-revision and build logs,
fetch the stack's three components, and maintain SSM Agent channels in Singapore.
It cannot provision instances, submit SSM commands, read Secrets Manager, change
IAM, access GitHub, sign workloads, or activate Athena. The AWS-owned AWSTOE
bootstrap bucket prefix is the documented `ec2imagebuilder*` exception; SSM channel
operations require Resource `*` and are region-conditioned. CloudWatch writes
are scoped to the stack's log group. These exceptions are build infrastructure
only and are not added to the runtime role.

AWS's separate `AWSServiceRoleForImageBuilder` orchestrates EC2/image lifecycle.
The parameter `CreateImageBuilderServiceRole` creates this **only if absent**;
otherwise use `false`. Do not substitute a worker/runtime role.

The builder has no ingress or EC2 key pair and HTTPS egress for S3, SSM and the
**digest-pinned** public Docker base download. The public subnet's existing route
must work. Amazon DNS/IMDS are used by trusted infrastructure only. This is not
the Engineering task network policy. No repository or model-selected scripts run
on the builder; host installation scripts come from reviewed, hashed packages.
Task image build steps run with `--network=none`, with the hashed local pnpm
package and suppressed lifecycle scripts. Runtime network rules remain unchanged.

## 0. Approve immutable inputs once

**Infrastructure operator/reviewer; unprivileged preparation only.** Missing pins
are prerequisites; this implementation does not invent AMI IDs, package versions,
SSM checksums or Docker digests.

1. Review a literal Ubuntu 24.04 x86_64 AMI in Singapore. In **EC2 → AMIs**, inspect
   its owner (Canonical `099720109477` for an official Ubuntu image), architecture,
   root device and block mappings. Pin the literal `ami-…`, with one root volume
   whose source size is at most 10 GiB. No mutable SSM parent-image alias is used.
   The primary path retains the standard preinstalled **Snap SSM** agent. Pin
   its exact runtime release, revision and archive SHA256; the build sets a
   per-agent permanent refresh hold. Never remove the active agent, change its
   channel or convert Snap to DEB implicitly. A separate DEB-only base may use
   the explicit DEB strategy, with distinct upstream and Debian package versions.
2. Collect the exact-base inventory using the unprivileged fixed
   `freeze-packages.py` on a pristine inspection instance. It verifies IMDS
   image/region, owner-provided DescribeImages metadata, signed Noble sources,
   complete inherited package inventory and the exact dependency closure.
   It uses private APT lists/status/cache and **download-only** resolution; it
   never installs packages, changes system APT state or uses AWS credentials.
   Candidate package versions resolved here still require owner review.
3. Assemble schema **2** using `assemble-tool-lock.py`. The lock contains
   `baseInventory` (name/version/architecture/source AMI), `packages` (only
   installed/upgraded DEBs, with exact version/architecture/SHA256/repository),
   `packageInventorySha256`, concrete `kernelAbi`, and exact artifact pins.
   Required packages include Docker/containerd/runc, Git/Python and Python3.12
   runtime/stdlib, linux-aws plus concrete image/modules ABI, iptables,
   ca-certificates, xz-utils, systemd, cloud-init, iproute2, util-linux and snapd.
   The full inventory includes every inherited package and downloaded dependency.
   Inherited DEB hashes are not invented: their provenance is the exact base AMI.
   SSH packages are excluded from changed tooling and purged by the fixed bake.
4. Review the generated inventory/lock. Retain the signed-index/source evidence.
   The builder checks the pristine baseline before installation and every final
   unchanged package after reboot. A kernel ABI mismatch fails the image test.
   No mutable APT resolution or dependency repair occurs during Image Builder.

See [current input register](ATHENA_EC2_IMAGE_BUILDER_INPUT_APPROVAL.md) and
[temporary inspection guide](ATHENA_EC2_INPUT_INSPECTION.md). Lock/tooling hashes
cannot be finalized without the real inspection inventory.

Package/validate on the repository workstation with no AWS credentials or root:

```bash
pnpm --filter @alexa-control/api exec tsup --config tsup.worker.config.ts
python3 deploy/engineering-worker/aws/package-image-payload.py --candidate
python3 deploy/engineering-worker/aws/image-builder/package-tooling.py \
  /absolute/path/to/reviewed-tooling /absolute/path/to/tools.tar
pnpm --filter @alexa-control/api exec tsx src/scripts/image-builder-inputs.ts \
  /absolute/path/to/reviewed-tooling/lock.json /absolute/path/to/tools.tar \
  ../../.local/engineering-worker/phase28_4a_ec2_candidate/athena-ec2-image-payload.tar
```

The last command prints the four CloudFormation input pins: `BaseAmiId`,
`LockSha256`, `ToolingSha256`, `PayloadSha256`. The builder independently checks
archive/lock/member hashes, DEB identity/architecture, exact installed versions,
Node version and SSM version. Input schema validation alone is not approval.

Choose a unique reviewed revision such as **review-20261004-01** and recipe version
**1.0.0**. After any input/source change, approve a new revision/version; never
silently replace the inputs of a running or completed build. S3 is private,
versioned, encrypted and retained for audit; do not overwrite or delete past
review evidence. No `.env`, AWS/GitHub credential, bootstrap, repository checkout,
signing key or preview token may enter either archive.

## 1. Deploy the one CloudFormation stack

**AWS Console; reviewed infrastructure principal.**

1. Set top-right region to **Asia Pacific (Singapore)**.
2. **CloudFormation → Stacks → Create stack → With new resources (standard)**.
3. **Choose an existing template → Upload a template file → Choose file**:
   `deploy/engineering-worker/aws/image-builder/image-builder.console.json`.
   Click **Next**. This compact, structurally identical copy fits Console's 51,200-byte upload limit.
   Exact prepared parameters are in `deploy/engineering-worker/aws/image-builder/image-builder.parameters.json`.
4. Stack name: **athena-engineering-image-builder**.
5. Enter the validated four pins. Enter `RootDeviceName` exactly as shown on the
   approved base AMI (`/dev/sda1` or `/dev/xvda`), your canonical Athena `CompanyId`,
   unique `BuildRevision`, and `RecipeVersion`.
6. Keep VPC **vpc-04179b719aaccf907**, subnet **subnet-0c35a5bf3347d05ce** only if
   they are the reviewed existing network and route is active. The stack makes
   its own builder SG, never reuses/changes the worker or preview SG.
7. **IAM → Roles** in another tab: search **AWSServiceRoleForImageBuilder**.
   If it exists, set `CreateImageBuilderServiceRole=false`; if absent set `true`
   through the infrastructure principal's reviewed service-linked-role authority.
8. Click **Next**. Leave the optional CloudFormation service role blank if the
   signed-in infrastructure principal already has the reviewed deployment
   authority; otherwise select its existing reviewed infrastructure CF role.
   Keep validation enabled and rollback enabled. Click **Next**.
9. Review changes and acknowledge IAM resource creation. Click **Submit**.
10. Wait for **CREATE_COMPLETE**. In **Outputs**, save `ArtifactsBucket`,
    `InputPrefix`, `EvidencePrefix`, `PipelineArn`, `BuildRoleArn`.

Creation does **not** run the pipeline. It has no schedule and creates no
`AWS::ImageBuilder::Image` auto-build resource. Runtime/preview output values are
`false` and release status is `PENDING_LIVE_RELEASE_GATE`.

## 2. Upload the reviewed inputs

**AWS Console → S3 → bucket from `ArtifactsBucket`; same infrastructure principal.**

1. Create folder **inputs**; inside it create your exact `BuildRevision` folder.
2. Upload the approved Snap-compatible candidate
   `.local/engineering-worker/phase28_4a_ec2_candidate/athena-ec2-image-payload.tar`,
   using object name **payload.tar**. Rename an unprivileged local copy before
   upload if needed; renaming does not change its checksum.
3. Upload the reviewed tooling archive as **tools.tar**.
4. Confirm paths exactly match `InputPrefix/payload.tar` and `InputPrefix/tools.tar`.
   Leave S3 Block Public Access enabled. No ACLs, public URLs or presigned upload
   tokens are required.

The pipeline will fail closed if object bytes differ from the reviewed hashes.
Do not “fix” a failure by changing the expected hash without a new review.

## 3. Start and inspect the pipeline

**AWS Console → EC2 Image Builder → Image pipelines; same infrastructure principal.**

1. Open **athena-engineering-image-builder-pipeline**.
2. **Actions → Run pipeline**; confirm that specific build.
3. Under **Output images**, open the new image version/build ARN. Save this exact
   **image build ARN**; do not later select “latest.”
4. Inspect **Workflow execution details** and build/test step logs. Logs are also
   in **S3 → ArtifactsBucket → logs** and **CloudWatch → Log groups →
   /aws/imagebuilder/athena-engineering-image-builder**.
5. Confirm, in order: verified input downloads; exact tooling installation;
   reboot into the PID boundary; fixed `install-image` seal; build record upload;
   fixed cleanup; build validation; AWS's default sanitation; test-instance boot;
   independent safe image tests; private Singapore distribution.
6. Save the **build instance ID** from this run's logs. Match it to the evidence
   object's basename and `buildInstanceId`; retries can produce multiple records.
   An evidence object from a failed or different build is not acceptance evidence.
7. Only an Image Builder **AVAILABLE** result passes this stage. A running
   instance or an AMI created before tests finished does not. On failure inspect
   the exact step. Do not relax PID/storage bounds, disable tests, remove the
   deadline/watchdog, or widen runtime networking to get a green build.

All component root commands execute **only on AWS's temporary build/test
instances**. Both use `c7i-flex.large` (2 vCPU/4 GiB), one encrypted 10 GiB gp3 root,
IMDSv2/hop-limit 1, no key pair, no ingress, terminate-on-failure. The whole-VM
PID ceiling is applied before sealing and rebooted; checks reject any live
PID/TID >=512. Image Builder/SSM consuming too many PIDs is a real compatibility
failure, never a reason to increase the ceiling. The sealed 3500-second boot
deadline remains in the candidate; tests must finish before it expires. No
workload/bootstrap/worker starts during image production.

Safe checks cover pinned tool versions, cgroup v2, live PID/RAM/CPU/root filesystem,
no swap or SSH/Docker TCP listeners, absent workload/build material, systemd unit
syntax/enabled states, sealed file/image hashes, task image UID, and a bounded
real offline container probe (read-only root, no capabilities/new privileges,
seccomp, PID/CPU/RAM limits, absent host/signer mounts and no network route).
Actual encrypted EBS/provider ownership is checked from AWS result metadata.
Packet-denial tests, real dependency proxy traffic, exhaustion/death/TTL cleanup,
checkpoint recovery and signed identities remain the separate live release gate.

## 4. Retrieve AMI, snapshot and sealed runtime hash

**Same infrastructure principal; read-only AWS Console.**

1. Open the exact successful Image Builder image build → **Output resources**.
   Copy its Singapore **AMI ID**.
2. **EC2 → AMIs → Owned by me → select that AMI**. Confirm private visibility,
   account ownership, x86_64 and `athena:release=PENDING_LIVE_RELEASE_GATE`.
3. Open **Storage**. Copy the sole root **Snapshot ID**. Open it in **EC2 →
   Snapshots**; confirm owner, encrypted, completed and 10 GiB. No extra disks.
4. **S3 → ArtifactsBucket → EvidencePrefix → `<matching-build-instance-ID>.json`**.
   Download the exact object's version. Match the instance ID against step 3's
   logs, base AMI/revision and all three input hashes against your approved pins.
5. Copy its `sealedRuntimeSha256`. This is the runtime manifest's canonical
   SHA-256, **not** the payload/archive hash. It is also baked into
   `/etc/athena-image-build.json`; test components recompute and compare it.

## 5. Register evidence document separately

**Reviewed infrastructure principal, never the Image Builder build role.** This
stack intentionally creates no SSM document and grants no SSM document mutations.

1. **Systems Manager → Documents → Owned by me**. If
   **AthenaEngineeringEvidenceV1** already exists, inspect version **1** and exact
   content. A different existing document is a blocker; do not overwrite/update
   it or silently choose a later version.
2. If absent: **Create document → Command or Session** (Command document).
   Name **AthenaEngineeringEvidenceV1**; document type **Command**; content format
   **JSON**. Paste only the reviewed
   `deploy/engineering-worker/aws/evidence-document.json`. It has no parameters
   and invokes one fixed evidence helper. Add company/purpose tags through the
   reviewed infrastructure principal. Click **Create document**.
3. Select version **1**, compare its JSON to the reviewed file. No command,
   executable or arbitrary path parameters may be added.
4. In **AWS CloudShell** (same console infrastructure principal), obtain AWS's
   non-secret document hash:

```bash
aws ssm describe-document --region ap-southeast-1 \
  --name AthenaEngineeringEvidenceV1 --document-version 1 \
  --query 'Document.{Name:Name,Version:DocumentVersion,HashType:HashType,SHA256:Hash}' \
  --output json
```

Return `SHA256` only if `HashType` is `Sha256`, name matches, version is `1`.
Keep preview-grant document inactive. Do not attach runtime permissions yet.

### Optional read-only result verification helper

The infrastructure operator can download the following seven JSON files, using
AWS CloudShell/CLI under the same reviewed principal. Substitute only the exact
non-secret IDs selected above. No raw secret or Athena runtime credential is used.

```bash
aws imagebuilder get-image --region ap-southeast-1 --image-build-version-arn YOUR_EXACT_IMAGE_BUILD_ARN > image-build.json
aws ec2 describe-images --region ap-southeast-1 --image-ids YOUR_EXACT_AMI_ID > ami.json
aws ec2 describe-snapshots --region ap-southeast-1 --snapshot-ids YOUR_EXACT_ROOT_SNAPSHOT_ID > snapshot.json
aws s3api get-object --bucket YOUR_ARTIFACTS_BUCKET --key evidence/YOUR_BUILD_REVISION/YOUR_MATCHED_BUILDER_ID.json --version-id YOUR_EXACT_OBJECT_VERSION_ID build-record.json
aws ssm describe-document --region ap-southeast-1 --name AthenaEngineeringEvidenceV1 --document-version 1 > document-description.json
aws ssm get-document --region ap-southeast-1 --name AthenaEngineeringEvidenceV1 --document-version 1 --document-format JSON > document-content.json
```

Download these non-secret JSONs and verify locally (no root/AWS calls):

```bash
pnpm --filter @alexa-control/api exec tsx src/scripts/image-builder-results.ts \
  /absolute/path/image-build.json /absolute/path/ami.json /absolute/path/snapshot.json \
  /absolute/path/build-record.json /absolute/path/document-description.json \
  /absolute/path/document-content.json ../../deploy/engineering-worker/aws/evidence-document.json
```

The helper checks availability, private account/region, exact sole root snapshot,
encryption/size, input/revision tags and exact version-1 reviewed SSM content. It
prints the four values with **PENDING_LIVE_RELEASE_GATE**. Operator log correlation
is still required: shared review tags alone do not bind evidence to one retry.
It performs no credential registration, release, runtime activation or READY write.

## 6. Mandatory post-build release gate and cleanup

The fallback operator runbook's **mandatory live image security release gate**
remains the source of truth. An infrastructure/security operator must execute it
against the exact private AMI with the reviewed scope and networking, using
short-lived workload bootstrap and the finite signed runtime. Run it outside
Image Builder. Record actual packet denials, registry-only dependencies, offline
validation, signer/preview/control-plane separation, exhaustion, watcher/worker
failure, hard/idle expiry, Scheduler termination/EBS deletion/reconciliation,
signed replay/generation binding, checkpoint recovery, hash mismatch and secret
redaction. Mocks, Image Builder status and static booleans cannot replace it.

Default Image Builder workflows sanitize logs, cloud-init/SSH/agent build residue
before AMI capture and terminate temporary build/test instances. The custom
cleanup removes input payloads/tooling, build caches, credential homes and SSH
configuration; it deliberately leaves active AWSTOE/SSM orchestration state for
AWS's final sanitation. No user-data override or `skip_cleanup` marker is allowed.
Never uninstall the SSM agent or prune the two sealed Docker images.

After each run inspect **EC2 → Instances**, filter `CreatedBy=EC2 Image Builder` /
stack build tags, and confirm this run's temporary instances terminated. On a
stuck workflow cancel the exact build in Image Builder and use the reviewed
infrastructure incident cleanup procedure; never leave a builder running. Remove
only temporary resources under that approved procedure; keep durable build/
Engineering audit evidence. The template uses terminate-on-failure, not a separate
hard builder TTL; monitor this infrastructure job. Runtime hard/idle deadlines
and reaper controls remain mandatory in the separate live worker gate.

Only after the full gate passes may the reviewed activation path consider this
AMI. Do not enable runtime IAM permissions/preview as part of this runbook.
HTTPS preview and the real cloud task/timing baseline are still separate pending
acceptance items. No 28.5 comparisons, accepted dataset or cost savings are claimed.

## Four non-secret values to return

- [ ] Private Singapore **AMI ID** (`ami-…`)
- [ ] Its sole encrypted 10 GiB **root snapshot ID** (`snap-…`)
- [ ] **sealed runtime SHA-256** (64 lowercase hexadecimal characters)
- [ ] Version-1 **AthenaEngineeringEvidenceV1 AWS SHA-256** (64 lowercase hexadecimal characters)

Also retain the image build ARN, matched builder/evidence object version, immutable
input review and safe-test logs; state explicitly whether the live release gate
passed. Returning four IDs alone does not approve release or READY.

## Implementation validation (not AWS acceptance)

Local focused cloud/signed-runtime checks: **17 files / 143 tests passed**.
Full serial suite: **244 files / 1,406 tests passed**, with **4 opt-in live tests
skipped**, in **463.66 seconds**. Lint (one existing web warning), typecheck, build
(existing web warnings) and diff checks passed. The 20-member payload/hash and
three bundle syntax gates passed. No AWS stack/pipeline/image release was executed
or verified. All four output values remain pending real AWS evidence.

Sources: [Image Builder default cleanup/security guidance](https://docs.aws.amazon.com/imagebuilder/latest/userguide/security-best-practices.html),
[AWSTOE actions and S3 ownership checks](https://docs.aws.amazon.com/imagebuilder/latest/userguide/toe-action-modules.html),
[CloudFormation pipeline definition](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-imagebuilder-imagepipeline.html),
[AWS platform bootstrap policy reference](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/EC2InstanceProfileForImageBuilder.html).

## Component creation retry: 2026-10-05

AWS rejected TestComponent because literal Docker Go-template braces were
interpreted as an AWSTOE parameter. Updated component constructs the same fixed
format strings only at runtime, preserving all assertions. Console template
regenerated. Approved payload/tooling/lock hashes are unchanged.
Use recipe 1.0.1 and revision review-20261005-02 on a reviewed retry. First inspect
stack status and whether the service-linked role survived. Do not blindly assume
CreateImageBuilderServiceRole=true after a partially successful creation.
Rollback-complete, failed-create and rollback-failed states require different
CloudFormation recovery operations; do not recreate or delete infrastructure
without checking the actual status. Do not start a pipeline before successful
stack creation and exact reviewed input uploads.
Source: [AWS component variables](https://docs.aws.amazon.com/imagebuilder/latest/userguide/toe-user-defined-variables.html).

### Pipeline minimum timeout repair: r3

r2 successfully created all three components/recipe but failed Pipeline because
TimeoutMinutes=30 is below AWS's minimum60. r3 sets60, preserving every actual
step timeout, sealed deadline, watchdog and workload TTL. AWS documents this
legacy pipeline property as ignored; it is not our security enforcement boundary.
cfn-lint1.57.1 Singapore schema check passed with0errors/1redundant-substitution
warning. After rollback completes use corrected image-builder.console-r3.json,
new stack athena-engineering-image-builder-r3, recipe1.0.2, revision
review-20261005-03. Create service-linked role only if absent. Three approved
artifact hashes unchanged. Upload existing approved bytes to the new stack's
inputs/review-20261005-03/ folder; never use a rolled-back stack's bucket/pipeline.
[AWS timeout constraints](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-imagebuilder-imagepipeline-imagetestsconfiguration.html).

### Existing r3 stack update for Free Tier instance restriction

Owner's Singapore DescribeInstanceTypes verifies c7i-flex.large eligible,
x86_64,2CPU/4096MiB. Use image-builder.console-c7i-flex.json to Update existing
athena-engineering-image-builder-r3 with all previous parameters unchanged.
Only Infrastructure.InstanceTypes differs; security checks and approved archive
hashes remain identical. Keep CreateImageBuilderServiceRole's previous value;
flipping the condition on an existing stack would remove its managed role.
Review change set: infrastructure modified only, no unrelated adds/removals.
After UPDATE_COMPLETE run existing r3 pipeline against existing revision03 inputs.
Eligibility is not a promise of zero cost; usage/cost evidence remains required.

### Dedicated builder subnet connectivity repair

Owner verified free10.84.0.128/26 inside VPC10.84.0.0/24; existing runtime and
preview subnets have public-IP assignment disabled. Original builder had no public
IP or SSM registration. Update existing r3 with image-builder.console-builder-network.json.
Keep all existing parameters and set new BuildRouteTableId=rtb-08c9c017691e1b4a0.
Change set: add BuilderSubnet and BuilderRouteAssociation; modify Infrastructure.
Subnet AZ ap-southeast-1a, public IPv4 enabled ONLY on this builder subnet.
No ingress, no SSH, TCP443 outbound only; no runtime subnet/route/IAM changes.
No repository-controlled code executes on image-builder hosts. This is build
infrastructure, never a worker workspace or permission to reuse its role/subnet.
Cancel old stalled image build if still active, let cleanup complete; after
UPDATE_COMPLETE run a fresh image build. Existing approved S3 uploads remain valid.
Verify new builder public IP and real SSM registration; don't infer success from
static template state. Failed instance residue must be reviewed/cleaned by the
infrastructure operator using existing termination authority.

### Official Node archive root repair: recipe1.0.3 / revision04

Build3 reached real SSM, S3 inputs and DEB install. Fixed overly strict Node
archive prefix guard: official root directory has no slash suffix. Exact root
is now accepted only as directory; traversal/foreign/root-file/duplicate entries
deny and data extraction filter remains. All approved Node archive members pass
unprivileged inspection, without executing binaries or privileged recipe.
Update existing r3 with image-builder.console-node-fix.json. Set RecipeVersion
1.0.3 and BuildRevision review-20261005-04; keep other parameters unchanged.
Copy approved inputs server-side from revision03 to04 in existing artifact bucket;
never overwrite03. No hash/input-byte change. New component version required
because prepare recipe changed; don't reuse1.0.2. Existing dedicated builder
subnet/security groups/roles remain; runtime/preview inactive.

### Dependency-safe SSH server removal and safe-probe repair: recipe 1.0.4

Owner live build `1.0.3/1` reached pinned DEB installation, exact Node extraction
and both container builds, then failed purging openssh-client: retained Snap SSM
depends on that client. The fixed recipe purges the finite set
`ec2-instance-connect`, `openssh-server`, `openssh-sftp-server` together, without
force-depends or package downloads. It retains the pinned openssh-client and
ssh-import-id dependency packages; neither supplies a listening SSH server or a
registered Engineering SSH capability. This matches the operator runbook's
no-SSH-server boundary. Units remain masked, sshd/sftp-server absent, SSH config
and credentials removed, port 22 absent and build SG has no ingress. All other
inherited packages (including openssh-client) must match the original lock.
Broken dpkg state fails closed. No Snap-to-DEB conversion or input pin changes.

Audit also corrected the actual disposable offline probe's Python-to-JavaScript
escaping and anchored its capability check: nonzero capabilities can no longer
pass because they begin with zero digits. An unprivileged regression executes
the exact probe against controlled state and rejects each containment breach.
This is test evidence, not live container/image acceptance.

**Retry using the existing infrastructure principal, not Athena runtime keys:**

1. CloudFormation → Singapore → `athena-engineering-image-builder-r3` →
   Update stack → Replace current template → Upload
   `deploy/engineering-worker/aws/image-builder/image-builder.console-ssh-fix.json`.
2. Set **RecipeVersion=1.0.4**. Keep **BuildRevision=review-20261005-04** and
   every other parameter at its previous value, including the service-role
   condition. The immutable input bytes are unchanged; reuse existing S3 objects
   under revision04. No copy, payload upload, IAM policy change, role deletion
   or network change is needed. Review the change set: three component versions
   and recipe replacement plus pipeline update; no role/bucket/subnet replacement.
3. After UPDATE_COMPLETE, EC2 Image Builder → Image pipelines → existing
   `athena-engineering-image-builder-r3-pipeline` → Actions → Run pipeline.

The template is below the 51,200-byte Console limit; all component documents
are below 16,000 bytes. Do not reuse a published component version. Retain failed
build logs and older templates as audit history; their failures are not release
evidence. Runtime permissions/preview stay inactive; successful Image Builder
completion still requires the separate signed-worker security release gate.

Recipe1.0.4 repair validation: 7 focused TypeScript and 7 Python tests pass.
Full suite245files/1,415tests pass;4live files/tests skipped (469.27s,exit0).
Lint/typecheck/build/diff checks pass (lint1existing warning). cfn-lint0errors/
3existing warnings; Console template48,250bytes. No live AMI claim.

### Post-purge SSH mask enforcement: recipe 1.0.5

Owner's real1.0.4/1 log passed installation, reboot, sealed runtime export and
cleanup, then failed VerifyBuildImage line65 (SSH mask state assertion). The
recipe now reapplies all three fixed SSH unit masks after dpkg purge; Debian
maintainer-script mask cleanup can no longer undo the pre-purge masks. Exact
masked state is checked before reboot and again during validate/test.
`systemctl is-enabled` may return1 for masked units; the preparer accepts only
status0/1 AND exact stdout masked, never generic nonzero failures. Unit name
and bounded state now appear in mask verification errors. No assertion removed.

Update existing r3 stack using image-builder.console-mask-fix.json. Change only
RecipeVersion=1.0.5; retain BuildRevision=review-20261005-04 and all remaining
parameters, especially the stack-managed service-linked-role condition. Wait
UPDATE_COMPLETE and idle pipeline, then launch once. Existing input bytes and
S3 paths unchanged; no uploads, IAM, networking or activation changes.
10 unprivileged Python checks (including simulated purge removing masks and
nonzero masked-state semantics) pass. Private image publication and worker READY
still require live release evidence; preview/runtime permissions remain inactive.

Final1.0.5 local validation:10Python/7focused TypeScript checks pass; full suite
245files/1,415tests pass,4live opt-in tests/files skipped,891.26s,exit0.
Lint/typecheck/build/diff checks pass; lint1existing warning; cfn-lint0errors/
3existing warnings. Console49,207bytes; each component below16,000bytes.
Live AWS recipe1.0.5 outcome remains required; no local release claim.

## 2026-10-05 Optional AWS inventory timeout repair

Owner live1.0.5/1 evidence: VerifyBuildImage passed all custom safe checks and
reported sealedRuntimeSha256
46f601f08ecc54878f7c2aafb33113c895c29454344281381409b793c742fcea.
ApplyBuildComponents succeeded. Subsequent AWS InventoryCollection association
704e21d1-fc7e-4d04-b213-2bfa0bf3c270 timed out after65attempts/30minutes;
instance i-01c75866bfe71ec1d was terminated. This is not a published/released AMI.
Exact cause of the association failure is not established by these logs.

Set only Pipeline.EnhancedImageMetadataEnabled=false to skip AWS optional
OS/package metadata collection. Canonical package lock, installed version checks,
sealed runtime file/image hashes, S3 evidence export, build validation and
booted image test remain unchanged. No IAM expansion, runtime/preview activation
or worker READY claim. AWS documents this Boolean as optional additional image
information, independently of ImageTestsConfiguration.

Update existing r3 using image-builder.console-inventory-fix.json. Keep ALL
parameters unchanged, including RecipeVersion1.0.5 and revision04. Change set
must modify Pipeline only; no new components, recipe, roles, subnet or bucket.
After UPDATE_COMPLETE and no active execution, run existing pipeline once.
No input copies/uploads. Verify InventoryCollection is skipped and both
publication and booted test results separately. Four final image/document
identifiers and destructive signed-worker release gate remain required.

Source: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-imagebuilder-imagepipeline.html

Inventory fix validation:7focused TypeScript and10Python checks pass. Lint
passes0errors/1existing warning; typecheck/build/diff checks pass. cfn-lint
0errors/3existing warnings. Full serial run:251files/1,450tests passed,
1suite failed at PostgreSQL benchmark beforeAll60000ms timeout,4opt-in live
files plus the blocked benchmark test skipped; elapsed669.80s,exit1. The exact
failed benchmark suite rerun passes1test/1file in13.88s,exit0. Do not describe
the full run as clean. No timeout raised, no test bypassed, no benchmark source
changed. Six pre-existing Mac generated artifacts restored after build.
The live AWS inventory-fix pipeline result remains pending.
