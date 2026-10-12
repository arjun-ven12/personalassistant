## 2026-10-12 Railway backend migration-lineage recovery

Read-only production metadata confirms116ledger rows:115canonical entries
through0114 and the documented earlier0090cross-device diagnostic label.
0115/0116pending. Existing SHA-256 guard blocks unknown lineage/missing reviewed
history. No production mutation, rollout or history approval performed.

Owner-created Neon recovery branch:athena-before-lineage-reconciliation,
br-green-star-azqy7jsy (owner reported; restore not tested). Original0090SQL
unavailable after Git/source/snapshot search. Cross-device schema confirms
repair/company controls. New finite operator-only receipt preserves that row and
timestamp, leaves its SQL digestNULL and labels bytes unavailable. It rejects
otherunknownversions,unapprovedreceipts,schemadrift,changedcanonicalhash and
fabricatedoldSQLdigest. Ordinary known migration checksum gate preserved.

110canonical hashes match successful deployed Git commit7ee28be9;0110–0114
are absent from that commit. Those five candidate DDL-only scripts were
rehearsed in an isolated test DB; production metadata matches all9tables/75columns/
29constraints/19indexes exactly. This supports an explicit owner-reviewed schema
baseline, not a claim of originalexecutionbyteauthenticity. Read-only CLI
preparation produced inert evidence. No keyregistration or new IAMauthority.

Review/procedure:docs/runbooks/ATHENA_MIGRATION_LINEAGE_RECOVERY.md and
docs/evidence/MIGRATION_LINEAGE_REVIEW_20261012.json. Operator approval and
firstproductionhistorymutation remain pending. Keep pre-deploycommand unchanged.
Pending0115/0116require separate reviewed rollout afterbaseline. Validation:11
focusedisolatedPostgreSQLtests pass; fullgateresults will be recorded below.


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

## 2026-10-05 Live 1.0.4 mask verification repair

Actual owner-supplied AWS log identifies VerifyBuildImage line65: required SSH
unit masked state differed after successful purge/reboot/seal/cleanup. Recipe1.0.5
reapplies and checks masks AFTER package purge, preserving the no-SSH-server
boundary, daemon absence, no listener and mandatory test assertion. Correctly
handles systemctl's nonzero masked state; arbitrary command failures deny.

Use image-builder.console-mask-fix.json on existing r3, RecipeVersion1.0.5; retain
revision04 inputs/all other parameters. IAM/network and input pins unchanged.
Focused validation:10Python checks including maintainer-script mask-removal
regression;7TypeScript template/security tests. Full validation: pnpm lint passes (0errors/1existing Fast Refresh warning);
typecheck and build pass; full pnpm test --no-file-parallelism passes245files/
1,415tests,4opt-in live files/tests skipped,891.26s,exit0. git diff --check passes.
cfn-lint passes0errors/3existing warnings; Console49,207bytes and component
documents15,437/13,039/8,935bytes. Six pre-existing Mac generated outputs restored
exactly after build. No privileged builder commands executed by Codex.
No image RELEASED/worker READY/cloud baseline claim.

## 2026-10-05 Image Builder dependency and probe repair

Live recipe1.0.3/1 failed at SSH purge after Node/tooling/container builds.
Snap SSM requires the inherited openssh-client. Recipe1.0.4 removes the SSH
server, SFTP server and dependent EC2 Instance Connect package together, keeps
the locked client dependency, masks SSH units and checks no daemon/listener or
broken package state. Original no-SSH-server requirement and finite capability
boundary remain intact; no arbitrary SSH capability exists.

Reviewed payload, tooling and lock hashes unchanged. Update existing r3 with
image-builder.console-ssh-fix.json, RecipeVersion1.0.4 and the current revision04
inputs. No additional S3 uploads, IAM/network changes or runtime activation.
Audited remaining seal/cleanup/test source; corrected malformed JavaScript
escaping and partial capability match in the safe containment probe. Exact probe
regression rejects unsafe state; no privileged recipe executed by Codex.

Validation: 7 Image Builder TypeScript tests passed; 7 unprivileged Python
tests passed (including the exact JavaScript safe-probe regression). Full
`pnpm test --no-file-parallelism`: 245 files / 1,415 tests passed, 4 opt-in live
files/tests skipped, exit0, 469.27s. Lint passed with0errors/1existing Fast Refresh
warning; typecheck/build passed; git diff --check passed. cfn-lint:0errors,
3existing warnings (redundant substitution, unused audit subnet parameter,
pinned availability zone). All component Python parses; no unintended AWSTOE
parameter braces. Approved archives and all payload member hashes match.
Six pre-existing Mac distribution artifacts restored byte-for-byte. No reviewed AMI, READY
worker or live Engineering acceptance is established by this source repair.
Phase28.4/28.5 remain conditional; HTTPS preview deferred; Phase28.6 not started.

## 2026-10-05 — Live SSM path passed; official Node root entry repaired

Owner build3 logs confirm SSM command execution, approved S3 input downloads,
and pinned DEB/kernel install. InstallPinnedTooling then denied official Node
archive root directory (no trailing slash), a validator bug. Corrected guard
accepts only the exact root when directory; children remain under exact prefix,
traversal/foreign/root-file/duplicate entries deny; extraction retains data filter.
All5888 actual approved Node archive members accepted,4Python tests/14negative
subcases passed. Seven focused template tests passed; CF schema check no errors.
Prepared same r3 stack update, component/recipe1.0.3, revision review-20261005-04;
approved artifacts unchanged, copy same S3 bytes into new immutable revision04.
Build3 builder terminated by AWS logs. No AMI release/worker READY claimed.
Previous networking full gates passed245files/1415tests,4files/4tests skipped,
532.75s; lint/typecheck/build passed; preserved Mac artifacts restored. Current
repair full gates rerun separately. Runtime/preview inactive, no28.6 work.

## 2026-10-05 — Dedicated Image Builder subnet prepared

Owner reads confirm VPC10.84.0.0/24, runtime/preview subnets0.0/26 and0.64/26
both MapPublicIpOnLaunch=false; reviewed route table has active0.0.0.0/0 to IGW.
Builder launched with no public IP and SSM not registered. Prepared dedicated
builder-only10.84.0.128/26 in ap-southeast-1a with public IPv4 assignment and
association to existing reviewed public route table. Existing subnets, routes,
SGs, IAM roles, recipe/components, image input hashes and runtime policies unchanged.
New resources BuilderSubnet/BuilderRouteAssociation; Infrastructure selects it
and waits for association. Template image-builder.console-builder-network.json.
Same r3 stack, revision03/recipe1.0.2 and existing bucket/uploads. No live fix
success, image release or worker READY claimed. Runtime/preview inactive.

## 2026-10-05 — Builder launched; SSM connectivity diagnosis required

Owner r3 recipe1.0.2/build2 launched c7i-flex builder i-0510b697ab7f394d9.
EC2 reachability passed; repeated SSM SendCommand InvalidInstanceId prevents
image recipe from starting. No worker READY/image acceptance inferred. Need
read-only instance profile/public-IP/subnet and SSM registration evidence before
changing network or permissions. Signed-runtime/preview/tenant limits unchanged.
Latest full local validation passed: focused6, lint0errors/1existing warning,
all workspace typechecks/build, serial245files/1414tests passed,4files/4tests skipped,
457.87s; preserved six Mac build artifacts restored; diff check passed.

## 2026-10-05 — Free Tier-compatible image build instance selected

Owner r3 stack CREATE_COMPLETE; pipeline failed LaunchBuildInstance before bake:
t3.medium is disallowed by account Free Tier restriction. Owner read-only
DescribeInstanceTypes confirms c7i-flex.large in Singapore: FreeTierEligible=true,
2vCPU,4096MiB,x86_64. Changed only Infrastructure.InstanceTypes to c7i-flex.large;
no payload/lock/tooling/recipe/component/role/resource/security-limit changes.
Console update template image-builder.console-c7i-flex.json; exact structural
diff and three approved hashes verified unchanged. Update existing r3 stack,
keep every existing parameter (including role condition), revision03/recipe1.0.2,
existing bucket/uploads; do not recreate resources or widen runtime IAM.
Focused Image Builder and CF schema validation run; full gates pending completion.
No build success, AMI release or worker READY claimed. Runtime/preview inactive.

## 2026-10-05 — Pipeline minimum-timeout validation repaired

Owner r2 AWS events prove all three components/recipe created. Pipeline creation
failed because ImageTestsConfiguration.TimeoutMinutes=30 violates AWS minimum60.
Changed only that property to60; AWS documents legacy value currently ignored.
Actual sealed deadline/watchdog/runtime TTL and all step security checks remain
unchanged. Console r3 parsed structural diff proves only TimeoutMinutes changed
from repaired r2. cfn-lint1.57.1 Singapore schema:0errors/1redundant Fn::Sub warning;
focused Image Builder6tests passed. Approved lock/tooling/payload hashes unchanged.
Prepared stack athena-engineering-image-builder-r3, recipe1.0.2, revision
review-20261005-03. Full gates running. Owner r2 event shows service-linked role
DELETE_COMPLETE; retry only after stack rollback finishes and role absence checked.
No S3 uploads/pipeline/AMI release/worker READY claimed. Runtime/preview inactive.

## 2026-10-05 — Image Builder component creation failure repaired

Real AWS stack failed creating TestComponent: AWSTOE interpreted Docker's
literal {{.Config.User}} as undeclared Config parameter. Fixed test recipe
constructs the same finite Docker Go-template delimiters only at runtime.
CgroupVersion, CgroupDriver, exact image digest and non-root Config.User checks
remain intact; no containment/IAM/runtime controls changed. Added regression
that all embedded component commands contain no raw AWSTOE delimiters.
Focused Image Builder 6 tests passed; full lint/typecheck/serial tests/build running.
Console template regenerated; three approved archive/lock hashes unchanged.
Prepare retry recipe 1.0.1 and revision review-20261005-02; never reuse immutable
component versions after source changes. Actual stack status and surviving
AWSServiceRoleForImageBuilder must be checked before selecting retry operation.
No AWS mutation by Codex, image release, worker READY, preview or 28.6 work.

## 2026-10-05 — Company build binding and Console input prepared

Owner supplied canonical Default Company UUID c2ac447f-0747-4b78-80f1-2cc4fff8d82f
and reports AWSServiceRoleForImageBuilder absent. Prepared exact parameters with
CreateImageBuilderServiceRole=true, revision review-20261005-01, recipe 1.0.0.
Console template is a compact copy of the existing generated template; parsed
structural equality and Console size limit verified. No policy/component/runtime
contents changed. No stack deployed or pipeline started.

## 2026-10-05 — Owner input pins approved

Owner explicitly approved the final input checklist, including the exact base
AMI, retained Snap/version/revision/hash/hold, frozen packages/kernel ABI,
LockSha256, ToolingSha256 and new Snap-compatible payload SHA-256. Approval
record: deploy/engineering-worker/aws/image-builder/evidence/owner-input-approval-20261005.json.
No stack deployed, runtime activated, preview enabled or image released.
Next infrastructure prerequisite: confirm canonical company UUID and whether the
existing AWSServiceRoleForImageBuilder is present; then prepare exact stack parameters.

## 2026-10-05 — Real inspection inventory frozen; final input review ready

Owner supplied the complete Ubuntu collection export/tail. Reconstructed bytes
match SHA-256 7f1f1e5a2cd3ed6bd4f68e7232557904457224ef219854e74471d4e74e669b85.
Recorded 651 base packages, 648 unchanged, 3 upgrades and 7 new packages.
All 10 Canonical DEBs downloaded and hash-verified. Schema-2 lock validated with
Zod; all 14 deterministic tooling archive members verified.
LockSha256: 5ee9e7ed7d480fea8b10adc04441c3fc38b748b76a0ba81e68473108d9e0dc36.
ToolingSha256: e09a2555ecaaaa2145ec2c7656f4e60a012295bca420275c09ec99326e59ba13.
Exact Snap 3.3.4793.0/revision 13349 retained; service enabled/active verified by
collector. Kernel proposal 7.0.0-1014-aws requires owner review and later boot test.
Final register: docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_INPUT_APPROVAL.md.
Full JSON/CSV/lock saved in deploy/engineering-worker/aws/image-builder/evidence.
New Snap-compatible payload still needs explicit approval. No deployment/IAM
change, image release, worker READY, runtime activation, preview or new 28.5/28.6
features. Temporary inspection instance may now be terminated by the owner.
Next: owner input approval, then separate Image Builder infrastructure deployment.

## 2026-10-05 — Source parser repair / preserved retry

Owner supplied the actual Canonical cloud-init ubuntu.sources. The failed
collector mistook comments-only header paragraphs for repository stanzas.
Corrected parser skips only comment/blank paragraphs, still requires exact
Canonical signing key, deb type, Noble suites/components and reviewed Ubuntu
hosts. Duplicate and unknown fields (including Trusted overrides) deny.
Regression/security checks passed 2 tests with 9 negative subcases; Python/shell
syntax passed. No Ubuntu source config or system packages were changed by Codex.

Prepared operator command now uses a child shell so set-e does not close the
interactive SSH session on failure. Retry writes only to a fresh
athena-input-inspection-20261005-retry1 directory, retaining the original partial
collection. Lint (0 errors, 1 existing warning), all workspace typechecks, build and diff check passed; full serial suite passed 245 files / 1,414 tests (4 files / 4 tests skipped), 623.67s; live inventory and input approval
still pending. No deployment, IAM change, worker READY, preview, 28.5 features
or 28.6 work. Owner-visible command remains
`deploy/engineering-worker/aws/image-builder/run-input-collection.sh`.
A separately named v2 copy prints an explicit fixed-parser marker and uses retry2
after the owner returned a traceback matching the older pasted command.

## 2026-10-05 — Inspection metadata received; package collection next

Owner launched temporary inspection instance i-09c137314e06b4b47; reports
Ubuntu24.04.4, kernel7.0.0-1012-aws, active Snap SSM3.3.4793.0/revision13349.
Full owner CloudShell DescribeImages JSON matches the Singapore Canonical pin,
exact creation date and sole8GiB root, Public=true. Public source snapshot is
unencrypted; published worker/build root encryption remains mandatory.

Owner read the protected installed Snap archive checksum using one root-only
read command. SHA25653e14f4e402a3de500dbfd162368922a07117638dcfc14c1e2c0340cbf979de7
also matches the independently downloaded immutable Snap Store artifact and
Store SHA3-384. This is byte agreement, not an AWS detached Snap signature.

Collector now uses an accessible public copy with that exact checksum; it does
not chmod/read the protected source or require root. IMDS binding includes exact
instance/account/AMI/region. Private download-only APT state avoids system locks,
package installation, system APT changes and credentials. Prepared one auditable
copy-and-paste operator command at
`deploy/engineering-worker/aws/image-builder/run-input-collection.sh`.
A separately named v2 copy prints an explicit fixed-parser marker and uses retry2
after the owner returned a traceback matching the older pasted command.
Its public inventory export uses ATHENA_INVENTORY_BEGIN/END markers. Real package
resolution/export remains pending; no final LockSha256/ToolingSha256 is invented.
Image Builder, runtime permissions and preview remain inactive. No28.5 features,
28.6, AMI release or worker READY are introduced.

Local collector checks passed: actual metadata and immutable Snap copy accepted;
tampered/oversized copies rejected. Typecheck, lint and build passed (lint0errors/1existing Fast Refresh warning).
Full serial follow-up passed245files/1414tests, with4files/4tests skipped;556.45s.
Git diff --check passed. Six existing Mac generated artifacts were
restored after build. Python/shell parser checks passed without root execution.

## 2026-10-05 — Input review continuation / temporary inspection next

Validation: focused image/SSM/runtime **3 files,43 tests passed**. Full serial
suite **245 passed/4 skipped files;1414 passed/4 skipped tests**,496.11s.
Lint passed with0errors/1existing Fast Refresh warning; all5 workspace typechecks
and build passed. Worker bundles built; Python recipes parsed without root
execution. Inventory metadata checks passed1positive/5negative cases. Generated
CloudFormation template remains45671bytes with all components<16000bytes.
Git diff --check passed. Existing6Mac generated build artifacts restored from
previous-work backups; original approved payload rehashed unchanged. These are
local validations, not an Ubuntu inspection or live image release gate.

- INPUT APPROVAL ONLY. No Image Builder stack deployed, IAM expanded, runtime
  activated or preview enabled. Phase28.4/28.5 remain conditional.
- Owner supplied AWS verification of Singapore Canonical AMI
  ami-0ba4172b23e57d5a8: owner099720109477, CreationDate
  2026-09-04T11:46:06.000Z, x86_64/available/HVM, sole8GiB gp3 EBS root.
  Extra sdb/sdc mappings are instance-store. Codex did not claim its own AWS call.
- Chosen compatibility A: retain the exact preinstalled Snap SSM with sealed
  release/revision/archive hash, enabled/active unit and permanent refresh hold.
  No implicit Snap→DEB conversion. DEB validators correctly separate upstream
  3.3.5390.0 from Debian package3.3.5390.0-1.
- Genuine DEB detached signature PASS under exact AWS fingerprint
  1C5B395CBE5E74E2F1CA21592784DBF388D19D46; tampered-package negative rejected.
  This does not establish the base Snap's exact version/assertion evidence.
- Added unprivileged exact-AMI inventory/dependency freeze and deterministic
  lock/tooling assembly. Schema2 distinguishes inherited vs changed packages,
  architecture/repository/hash provenance and concrete kernel image/modules ABI.
- Exact Snap/package/kernel inventory and final LockSha256/ToolingSha256 remain
  PENDING: owner confirms no existing pristine instance/export. Owner authorized
  one temporary Console-operated inspection instance; launch guide prepared,
  no instance launched by Codex. Next: launch, collect inventory/artifacts,
  review final pins, then owner terminates inspection instance.
- Approved original payload preserved at SHA256
  2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689.
  Separate Snap-compatible candidate SHA256
  658679b5b50d86dc85f4ba73f66ed54021e13a486d365a6ab8d58972f7bed28e
  requires new approval; no prior approval transferred.
- Register: docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_INPUT_APPROVAL.md.
  Console guide: docs/runbooks/ATHENA_EC2_INPUT_INSPECTION.md.

# Phase 28 handoff

Updated: 2026-10-04.

## Image Builder primary AMI path — implementation, not live acceptance

The primary reviewed image-production path is now
`deploy/engineering-worker/aws/image-builder/image-builder.cloudformation.json`.
Console deployment/start/inspection/output steps are in
`docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md`; the existing human AMI runbook
remains fallback/audit documentation. No administrator bake commands or AWS
infrastructure mutations were executed by Codex.

The one stack creates a separate minimal build role/profile, private versioned
input/evidence bucket, builder-only network/logs, pinned recipe, build/seal/safe-test
components and private Singapore distribution. It consumes a hashed reviewed tool
lock/archive, literal base AMI, exact offline DEBs, Node24/SSM artifacts and
checksums, immutable Docker base digest and local checksummed pnpm11.17.0 artifact.
It reuses the fixed install/seal recipe; no worker bootstrap or repository scripts
run during the bake. No runtime/worker/reaper credentials are reused. Runtime
permissions and preview stay disabled. Default AWS sanitation is preserved.

The task Dockerfile now installs the reviewed local pnpm package offline, and
cloud-init cannot generate SSH keys. Reassembled 20-file payload SHA-256:
`2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689`.
This supersedes all earlier payload hashes below; it is not a sealed runtime hash.

Image Builder safe tests check real tool/kernel/container evidence and cleanup,
but never issue RELEASED/READY. Destructive packet/resource/TTL/signer tests and
real signed-worker acceptance remain the separate mandatory live release gate.
The operator must correlate exported build evidence with the exact run's builder
ID; retry tags alone are insufficient. Read-only Zod result verification captures
AMI/snapshot/runtime/document values, including exact reviewed SSM version1 content.
`AthenaEngineeringEvidenceV1` is registered separately by the infrastructure
principal, never by the build role or this CloudFormation stack.

Local validation for this Image Builder continuation:

- Focused cloud/signed-runtime: 17 files, 143 tests passed (including 6 new
  Image Builder contract/infrastructure tests and 4 negative archive subchecks).
- Full serial suite: 244 files passed, 4 skipped; 1,406 tests passed, 4 skipped;
  463.66 seconds. Opt-in live tests remain skipped, not accepted.
- `pnpm lint`: passed, zero errors; one existing web Fast Refresh warning.
- `pnpm typecheck`: all five workspace packages passed.
- `pnpm build`: passed; existing runtime-config/chunk warnings only.
- `git diff --check`: passed. No mobile source changes; Android checks not rerun.
- Payload: 20 regular members/all hashes and 3 bundle syntax checks verified;
  fixed Python recipes and offline Node probe syntax checked without execution.
- Six pre-existing generated Mac artifacts restored/hash-verified after build.
  Logs: `.cache/image-builder-*.log`.

These are local checks; no AWS stack validation/deployment, Image Builder execution,
publication or live release evidence is claimed.

External prerequisites still pending: approved literal AMI and complete tooling
pins/archive; infrastructure stack deployment; real build/test success; separate
finite evidence document registration; full live security release gate. No AMI is
published or released, no worker is READY, no cloud task/model comparison or
accepted training dataset is claimed. HTTPS preview remains deferred and full
Phase28.4/28.5B acceptance remains conditional. No Phase28.6 or additional28.5
features were started.

## Phase 28.5B live acceptance — waiting for trusted AWS image

Human infrastructure operator procedure:
`docs/runbooks/ATHENA_EC2_AMI_OPERATOR_RUNBOOK.md`. It covers all fourteen bake,
publish, evidence and independent release steps; privileged commands are instructions
only and were not executed by Codex. Actual base AMI/package/container approval and
live release results remain operator prerequisites. Return the four non-secret
AMI/snapshot/sealed-runtime/document identifiers with release-gate status.

No live comparison/teacher/snapshot gate has run. Immediate external prerequisite:
infrastructure operator must publish/release-test the reviewed Linux worker image
and finite evidence document; AGENTS.md rule 19 prohibits Codex administrator setup.
Owner AMI/snapshot/sealed-runtime/document IDs and hashes are pending verification.

Rebuilding found missing shared chunks in the AMI payload. Worker output is now
self-contained and packaging rejects local module dependencies/inconsistent build
metadata. Refreshed payload SHA256:
`1506ccc292406cca9ad99fdb07baa1263f18ed73a380ca17a185a263a52c1f6c`.
This supersedes the initial archive hash below; it is not an AMI/runtime digest.
Runtime/preview remain inactive; no READY worker or measured cloud baseline.
See `docs/PHASE_28_5B_LIVE_ACCEPTANCE.md` for exact gate status and evidence.
Validation: focused 5 files/67 tests and 4 negative packaging checks passed;
full serial suite 243 files/1,400 tests passed, 4 live tests skipped (451.91s).
Lint/typecheck/build/diff checks passed, with one existing lint warning.

## Phase 28.5A implementation — 28.5B live measurements deferred

AthenaCoder provider/runtime placement, trusted deterministic AIRouter eligibility,
digest-pinned reviewed model controls, bounded inference/fallback and finite Phase 27
worker integration are implemented. Registered candidate is Qwen2.5-Coder 7B Instruct
Q4_K_M via existing Ollama; disabled by default. Cloud open-weight backend is a reviewed
interface, not a deployed service. Mac-offline falls through existing AIRouter policy.

Canonical accepted Engineering dataset adds opt-in company/repository policy,
actual bounded experience, accepted integration diff, exact-head quality/provenance
checks, source hashes, dedup, immutable versions, controlled JSONL and reversible
exclusions. Independent review and governed MERGED acceptance are required. No raw
hidden reasoning; suspect secrets are excluded before persistence. Prepared migration:
`0115_phase_28_5_engineering_dataset.sql`; not applied to production.

Benchmark harness uses existing delivery flow for seven routine categories, one
security bypass and the exact portfolio carry-over workload. Dataset/model read
views remain minimal. Owner-entered Codex evidence is supported; comparison status
is **PENDING_LIVE_BASELINE**. Unknown timing/cost remains null; no savings/parity claim.

No real open-weight coding acceptance or real teacher dataset acceptance occurred.
No production model enabled and no real training snapshot exists. Test fixtures are
not live evidence. Full implementation/limitations/validation report:
`docs/PHASE_28_5_REPORT.md`.

Validation: focused 8 files/67 tests; full serial suite 243 files/1,400 tests passed,
4 live acceptance tests skipped. Lint/typecheck/build/diff checks passed (one existing
lint warning). Android debug unit tests/build passed: 25 tests across 12 suites.

28.4 remains conditional: no reviewed/published AMI, READY worker, phone-only cloud
build or timing/cost baseline. HTTPS preview remains deferred. Reuse the same/similar
portfolio workload for 28.5B after the AWS worker baseline exists.

Exact next 28.6 task (after live gates): consume an owner-approved frozen clean dataset
version for one bounded LoRA/QLoRA experiment, evaluate against the same measured
baseline, and keep activation review-gated. Do not train or enable learned routing now.

## EC2 trusted image continuation — preview/runtime inactive

Owner explicitly deferred domain purchase and requested non-preview preparation.
Production `EnablePreview=false` and `ActivateRuntimePermissions=false` remain as
owner-reported; no production configuration, permission, deployment, AWS resource
or company credential reference was changed in this continuation. No worker READY.

Implemented the independent watchdog, finite measured evidence helper, fixed
registry CONNECT proxy, sealed image manifest, reviewed systemd/network/image bake
payload and pinned SSM document source. Shared Zod schemas bind exact company,
repository, workspace, worker and generation. Signed finite requests alone reset
idle activity; heartbeat does not. The watchdog independently inspects actual task
containers and enforces monotonic/wall deadlines, with a separate systemd timer and
existing provider Scheduler backup. Unsafe/missing/stale checks fail closed.

Evidence reads live Docker and kernel cgroup limits, process UID/seccomp/capabilities,
read-only root and scratch quota, storage device, whole-VM PID/thread ceiling,
no-swap/IPv6 state, exact kernel firewall, internal network and proxy addresses,
sealed file/image hashes, root watchdog process/fresh state and the effective
systemd monotonic timer. Checks run before worker authentication and again through
the API's pinned SSM document before READY. A manifest's claims alone cannot certify
containment. This is implemented measurement code, **not measured EC2 evidence**.

EC2 configuration now supports explicit `previewEnabled=false` with preview
listener/certificate/domain/grant-document fields absent. Preview operations fail
closed. `runtimeEnabled` defaults to false and provisioning denies before any AWS
API call. A disabled preview is not replaced by HTTP, self-signed TLS or dummy IDs.
The worker does not listen on its preview gate when its server bootstrap disables it.
Generic VM preflight and Mac defaults remain unchanged.

Image payload: `deploy/engineering-worker/aws/image/README.md`; unprivileged finite
packager `deploy/engineering-worker/aws/package-image-payload.py`. Local archive
`.local/engineering-worker/phase28_4a_ec2/athena-ec2-image-payload.tar` is explicitly
**REVIEW_REQUIRED_NOT_AN_AMI**. It contains compiled worker/helper/proxy bundles,
fixed image/service/network recipes and finite document sources, no owner secret,
workload bootstrap, repository checkout or signing key. Payload archive SHA256: `339aea022f8293b374e43c4ba97b1521a6d643da721da624c09e264863aa82bc`.
All 20 allowlisted regular files and their hashes were verified. Recipe syntax was
checked with `sh -n`; privileged setup was not executed. This archive hash is not
the actual sealed-runtime digest or an AMI identifier.

**Remaining non-preview prerequisites:** infrastructure operator must select/pin the
Linux/tooling and task-image bases, perform the reviewed Linux bake, publish the
private <=10 GiB AMI/root snapshot and finite evidence document, and run the real
image security release gate. AGENTS.md rule 19 prohibits Codex from executing that
administrator setup. Actual AMI/snapshot/image/document hashes, constrained HTTPS
supervisor/proxy egress, IAM attachment review, AWS credential reference/provider
verification, canonical repository linkage, approved npm/pnpm profiles and remote
AIRouter readiness are not established by local tests. These are still prerequisites,
not completed live acceptance. Do not use the Athena runtime credential for image
building, or broaden it to make a build work.

Local validation so far: focused cloud/runtime/signed transport **17 files / 147 tests
passed**; final targeted EC2/image/document/scope checks **4 files / 55 tests passed**.
Lint exit 0 (one existing Fast Refresh warning); typecheck exit 0; build exit 0
(existing chunk warning). Generated Mac files restored byte-for-byte. Full suite
`pnpm test --no-file-parallelism`: **237 files / 1,362 tests passed**, four opt-in
files/tests skipped, **431.53s**, exit 0. Final-source full build also exited 0.
Diff check passes. Logs: `node_modules/.cache/phase28_4a_ec2/runtime-*.log`.

No live portfolio run, timings, model usage or provider cost exists; unknown metrics
remain UNKNOWN. Secure phone-accessible HTTPS preview is deferred and required for
full Phase 28.4 acceptance. Phase 28.5 remains blocked.

## AWS owner setup — account binding

Owner supplied account ID **737073451069**, target **ap-southeast-1**, and reports
`AWS_ENGINEERING_CREDENTIAL` configured on the production API. Its contents were
not read or logged. The account-specific worker policy substitutes only the account
ID in `worker-role-policy.template.json`; permissions are unchanged. Owner confirmed creation of policy
`arn:aws:iam::737073451069:policy/AthenaEngineeringWorkerPolicy`.
Owner confirmed worker role
`arn:aws:iam::737073451069:role/AthenaEngineeringWorker` and instance profile
`arn:aws:iam::737073451069:instance-profile/AthenaEngineeringWorker`.
These are owner-reported identifiers; policy attachment/trust have not been independently
read from AWS. Owner confirmed Singapore schedule group
`arn:aws:scheduler:ap-southeast-1:737073451069:schedule-group/athena-engineering-default-company`.
The accidentally created Sydney group remains unused. Owner confirmed reaper role
`arn:aws:iam::737073451069:role/AthenaEngineeringReaper`.
Its trust/empty permissions have not been independently read. Its termination
permission must retain the reviewed runtime digest condition; that digest is not
available until the EC2 image is reviewed. Owner supplied VPC ID
**vpc-04179b719aaccf907** for **athena-engineering-vpc**, planned IPv4
**10.84.0.0/24**, default tenancy and no IPv6. Settings have not been independently
read. Owner supplied first subnet ID **subnet-0c35a5bf3347d05ce** for
**athena-engineering-subnet-a**, planned **ap-southeast-1a**, **10.84.0.0/26**.
Owner supplied second subnet ID **subnet-0c6587bfbe480c38f** for
**athena-engineering-subnet-b**, planned **ap-southeast-1b**, **10.84.0.64/26**.
Both subnets are for the existing ALB preview design; only subnet A is authorized
for worker launch. Owner supplied gateway **igw-0b96c42de697a4d46** for
**athena-engineering-igw**; attachment still needs confirmation. Owner reports the
manual route-table step was **not completed** and no dedicated preview domain is
available. Manual per-resource setup is superseded by
[consolidated owner setup](PHASE_28_4A_AWS_EASY_SETUP.md) and
`deploy/engineering-worker/aws/owner-infrastructure.cloudformation.json`.

One staged stack **athena-engineering-infrastructure** reuses existing resources,
creates remaining routes/SGs, and can later add ACM/ALB/DNS plus exact conditional
runtime managed policies. Initial parameters: ExistingRouteTableId empty, EnablePreview=false,
ActivateRuntimePermissions=false, supervisor egress loopback-only. No default all
egress, SSH, instance launch, identity recreation or credential data. Preview is
optional during infrastructure preparation, mandatory for real acceptance.

Owner can later use any controlled temporary subdomain; external DNS requires ACM's
actual validation CNAME plus wildcard CNAME to the actual ALB. Route53/domain purchase
is not required if another owned/delegated hostname is available. No hostname/cert
is invented and HTTP/self-signed TLS is not an acceptance substitute.

Consolidated setup validation: cfn-lint exit 0; focused security invariants and
resolved managed-policy size checks pass. Workspace lint exit 0 (zero errors, one
existing Fast Refresh warning), typecheck/build exit 0; complete test suite
**235 files / 1,328 tests passed**, four opt-in files/tests skipped, **444.63s**,
exit 0. Six generated Mac artifacts restored and hash-verified; diff check passes.
No Android source changed. Logs: `node_modules/.cache/phase28_4a_ec2/easy-*.log`.
These are local checks, not an AWS deployment or live containment result.

Local stack schema/security checks passed. Runtime policies are derived without
expanding the existing reviewed templates; adding them will not narrow the existing
AthenaEngineeringEC2Policy user attachment, which still needs independent review
before activation. Owner supplied stack Outputs on October 4:

- WorkerSecurityGroupId: `sg-0b77b637346ef5065`
- PreviewSecurityGroupId: `sg-065e5d49d32634451`
- RouteTableId: `rtb-08c9c017691e1b4a0`
- VpcId: `vpc-04179b719aaccf907`
- WorkerSubnetId: `subnet-0c35a5bf3347d05ce`
- RuntimePermissionsActivated: `false`

These are owner-reported deployment outputs, not independent AWS configuration
verification. Stack status/ID were not supplied. Runtime remains inactive and no
worker is marked READY. Next owner prerequisite is a controlled DNS hostname for
the existing HTTPS preview path; image/helper implementation remains outstanding.

## AWS EC2 continuation — October 4 (implementation record)

Owner selected their existing AWS account, **ap-southeast-1**, with no Athena AWS
credential reference yet. See [AWS setup and IAM requirements](PHASE_28_4A_AWS_SETUP.md).
No raw AWS keys were requested. No AWS resource, credential reference or deployment
was created during this continuation.

Implemented locally: `Ec2CloudWorkspaceProvider` behind the existing interface,
strict operator configuration, company-only credential resolution, pinned private
AMI/snapshot, one `t3.medium` (2 vCPU / 4 GiB), encrypted **10 GiB** root EBS with
termination deletion, scoped/idempotent reconciliation, finite pinned SSM documents,
resource/runtime attestation before READY, provider backup termination, existing
preview grant flow behind reviewed ACM/ALB ingress, and existing durable cleanup.
Schedule recovery confirms absence before repairing a missing deadline; uncertain
reads cannot create another environment. Provider usage/cost remain UNKNOWN when
not available. Mac defaults and generic stronger VM checks are retained.

Cloud-only execution uses a separate supervisor/signer and non-root, read-only
repository containers with finite registered commands. Validation remains offline;
dependencies require a reviewed internal proxy network. Task mounts cannot include
signing/provider/GitHub/preview material. This is source implementation and contract
validation, not evidence that an AWS image has those controls installed.

**Activation blockers:** company AWS reference and READY binding; reviewed account,
VPC/subnet/security groups/roles/schedule group; immutable 10 GiB AMI with cgroups,
512-process bound, constrained proxy/preview networks and independent hard/idle
watchdog; the now-implemented, still-unpublished AMI watchdog/evidence/grant helpers and their pinned
SSM documents; ALB,
ACM and preview DNS; approved Engineering profiles/remote AIRouter models; canonical
repo linkage and Tool Gateway activation. The existing artifact is REVIEW_REQUIRED,
not an approved EC2 AMI. Administrator operations remain prohibited under rule 19;
image preparation needs the reviewed infrastructure deployment process.

Live portfolio acceptance **NOT RUN**. No worker marked READY. No live timings,
model usage, provider charges or Codex comparisons exist for this adapter. No Mac
execution is part of the proposed phone-only path. Phase 28.5 stays blocked until
the real measured cloud baseline completes.

### AWS adapter validation

- Focused provider/cloud/signed runtime: **15 files / 117 tests passed**.
- Test callback lint closure: **2 files / 36 tests passed**; no production behavior
  changed by these callback style fixes.
- `pnpm lint`: exit 0, zero errors, one preexisting Fast Refresh warning.
- `pnpm typecheck`: exit 0 across the workspace.
- `pnpm test --no-file-parallelism`: **235 files / 1,328 tests passed**; four opt-in
  files/tests skipped, **468.04 seconds**, exit 0. This is one complete clean run.
- `pnpm build`: exit 0; existing web chunk-size warning retained.
- `git diff --check`: exit 0. New adapter/config/test and IAM templates pass
  formatting checks; all five IAM permission/trust templates parse as JSON.
- Six preexisting generated Mac artifacts restored and hash-verified after build.
  No Android code changed in this continuation; Android validation not rerun.

Logs: `node_modules/.cache/phase28_4a_ec2/`. Tests use SDK fixtures and local
runtime contracts; they do not validate AWS account authorization or real instance
containment. No live acceptance timing or economic result can be inferred.

**Exact next task:** resolve the owner account ID and secure AWS reference, then
implement/review the finite AMI watchdog/evidence/grant helpers and approved image;
prepare reviewed VPC/roles/ALB/SSM identifiers, bind configuration and canonical repo,
and execute the single portfolio acceptance through existing governance. Record
actual startup/clone/install/model/patch/validation/build/review/preview/candidate
metrics before considering Phase 28.5.

## Railway isolation audit — October 4 (retained verdict)

**RAILWAY_INSUFFICIENT_FOR_REQUIRED_WORKER_ISOLATION** under the current exposed
provider controls and trusted-worker execution layout. See
[the isolation audit](PHASE_28_4A_ISOLATION_AUDIT.md) for actual API evidence,
comparison, limitations and minimum acceptable provider capabilities.

Railway supplies real outer isolation and CPU/RAM limits; the existing service API
also reports a 1,000-process ceiling. The inspected update API cannot lower that
ceiling to Athena's 512 or set the required 10 GiB writable quota. Sandbox resource
inputs expose CPU/RAM only. Direct repository execution inside the trusted worker
would lose signer/filesystem/network separation. Docker is replaceable only with
an equivalent reviewed execution boundary. A missing root cgroup file does not
prove provider isolation is absent, and tmpfs is not inherently mandatory.

This supersedes the checkpoint-only/operator setup guidance below. A checkpoint
alone does not prove live containment, and administrator operations remain
prohibited by AGENTS.md rule 19. No worker was marked READY, no acceptance run was
started, and production API/web were not changed by this audit. The owner subsequently selected AWS EC2 in Singapore for Engineering compute.
Railway continues to host the existing API/web.

Audit validation passed: focused **92/92**; full suite **234 files / 1,303 tests**
passed with four opt-in files/tests skipped (588.35 seconds, exit 0). Lint passed
with one existing warning; typecheck, build and diff check passed. Generated Mac
artifacts were restored and hash-verified. This is contract validation, not live
cloud acceptance evidence.

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


## Phase 28.4A production closure — 2026-10-04

The production database is current: **116 migrations applied, zero pending**.
Migrations 0110–0114 were applied atomically through the existing deployment
runner, including the GitHub registry and durable canonical cloud linkage tables.

The existing API service was minimally updated for the governed cloud path.
Deployment `ff53e14d-555e-47e0-892f-31a65f6d5362` succeeded. Its production image
is `sha256:c72faedf238e6813cc91f372a067aae15c9860b2d1ec627f32ce198f59a09422`.
The first build exposed missing workspace-contract resolution from copied runtime
sources; explicit bundler aliases fixed it without installing the Mac application.
The frontend was unchanged at this earlier rollout; the setup continuation above records the subsequent required frontend update.

`ALLOWED_HOSTS` now retains the public API and Railway healthcheck host and adds
only `personalassistant.railway.internal`. Public health and a real same-environment
VM request to `http://personalassistant.railway.internal:3001/health` both returned
**HTTP 200** after rollout. Probe VM `9c3ddacd-9e3f-46e9-95e7-43790518773e` was
destroyed. This was a connectivity check, not the requested portfolio build.

Secure production inspection still finds no GitHub/Railway company credential
references or bindings. Provider secret variables were absent at this earlier checkpoint; they are now configured and verified as recorded above. The existing
server execution signing-key path and read-only execution setting are configured;
no signing key was read, exported or replaced. `RAILWAY_ENGINEERING_CONFIG` remains
unset until real credential/profile/checkpoint bindings are available.

Owner prerequisite: configure `GITHUB_ENGINEERING_ACCESS_TOKEN` and
`RAILWAY_ENGINEERING_API_TOKEN` through Railway's API-service secret settings, then
use Athena's authenticated company credential/integration routes listed below.
The owner sign-in page is open. Credential verification, exact tool review and
recent-authentication approval remain required; no database insertion bypasses them.

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

No phone-shaped portfolio objective was submitted, no model inference was billed
for acceptance, and no patch, preview, review or candidate is claimed. Benchmark
milestones and model/workspace costs remain **UNKNOWN**. Continue Phase 28.4A;
Phase 28.5 must wait for a genuine measured cloud baseline.

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

## Phase 28.4A — Railway infrastructure continuation

**PHASE 28.4 CONDITIONALLY COMPLETE — FIX REMAINING MOBILE/CLOUD ENGINEERING BLOCKERS**

Use the existing Railway project `modest-clarity` and production environment.
The October 3 implementation evidence below is historical; the October 4 section
above records the necessary API-only rollout.
The selected adapter is `RailwayCloudWorkspaceProvider` (`railway-sandbox`), behind
`CloudWorkspaceProvider`. Engineering, AIRouter, approvals, Universal Tool Gateway,
signed execution, Android controls and canonical delivery/candidate records remain
in their existing systems. No Phase 28.5 implementation was added.

Implemented and locally tested: durable workspace claims/CAS/reconciliation,
finite reviewed `prepare_workspace`, deterministic GitHub/canonical repository
linkage, company credential binding/revocation checks, one-use scoped workload
bootstrap with Ed25519 proof and existing PostgreSQL nonces, governed read-only
Git broker, exact commit checkout, READY gated on signed repo readiness, heartbeat
expiry/revocation, bounded cleanup, a fixed-port tokenized HTTPS preview gate,
external health verification/revocation/audit, nullable provider usage, and
canonical cloud telemetry projection. See `PHASE_28_4A_REPORT.md` for boundaries.

### Real environment evidence — 2026-10-03

- Project: `8838a205-159f-4f4a-bd04-10a47eba0aeb`.
- Production environment: `39b05b7b-ad0d-4465-b4bf-a49e7116b05b`.
- Existing API Railway service: `personalassistant`, service ID
  `b258a862-9a6e-4356-89ae-7a1d6eacbeee`.
- Actual private API origin: `http://personalassistant.railway.internal:3001/`.
  A real private VM request to `/health` returned HTTP 400; the API's exact host
  allowlist must include `personalassistant.railway.internal` for this path.
- Production secure integration inspection found **no GitHub or Railway company
  credential references/bindings**. No credential reference ID is available.
- Production lacks `engineering_github_repositories` (migration 0113).
- The existing environment had no worker checkpoint. A temporary real private
  Railway sandbox was provisioned with 2 CPU / requested 4 GiB, then destroyed.
  It reported 2 CPUs, 4,519,649,280 memory bytes, Node v24.21.0, no Docker,
  no `/workspace`, and no `/sys/fs/cgroup/pids.max` limit. This is infrastructure
  evidence only: it is **not** a phone/Engineering run or performance benchmark.

### Exact secure owner prerequisite

Through Railway/server secret setup (never chat, Android or a model), configure:

1. `GITHUB_ENGINEERING_ACCESS_TOKEN`, limited to the acceptance repository and
   necessary repository permissions. In Athena's existing authenticated company
   setup, create a verified credential reference with provider `github`, secret
   locator `github-primary`, and a READY binding to the reviewed provider ID
   `engineering.github` (or an existing configured company-specific ID), exposing
   only needed `github.repository.list/register/create` capabilities.
2. `RAILWAY_ENGINEERING_API_TOKEN`, a **workspace-scoped API token** for
   workspace `cb91dbe9-3c64-4599-a347-c95c2da5727d`, which contains the existing
   project/environment. The current adapter and SDK use Bearer authentication;
   a project token requires a different header and is not supported by this
   adapter yet. Do not supply an account-wide token. Workspace-token permissions
   still cover that workspace's resources; server-side company/environment checks
   remain mandatory. See https://docs.railway.com/integrations/api and
   https://docs.railway.com/sandboxes/quickstart. Create the company credential reference with provider `railway`,
   locator `railway-engineering-primary`, and a READY binding exposing only
   `railway.workspace.provision`. Keep this provider credential on the API;
   workers receive only short-lived scoped workload credentials.

Use existing `/api/company-data/credentials` and `/api/company-data/integrations`
secure owner flows; provide only their resulting reference IDs to the continuation.
Do not mark unverified credentials READY. No raw token is needed in chat.

### Remaining work and next continuation

The immutable worker artifact recipe is `deploy/engineering-worker/Dockerfile`;
`apps/api/tsup.worker.config.ts` builds the standalone Linux worker. The bundle
build and startup fail-closed smoke check passed locally. The Docker image was
**not built or published**: the local Docker daemon is unavailable. A reviewed
Railway checkpoint still must contain the artifact, Docker and approved execution
images, and enforce the process/memory/disk limits checked before authentication.
The stock VM cannot currently satisfy that contract. Do not relax the guard to
label it READY.

Additional implementation acceptance gaps: worker replacement/checkpoint
reconstruction, scoped provider-backed dependency cache, durable preview lifecycle
status/automatic completion cleanup, and complete timings/validation duration
capture. Cold repo clone and ephemeral dependency installation are current behavior;
no warm worker or cache-speed claim is made. Provider cost remains UNKNOWN.

After secure references exist: finish/publish the reviewed runtime checkpoint,
configure `RAILWAY_ENGINEERING_CONFIG` with actual company/profile/reference IDs,
apply required API migrations/security checks and minimal API/private-host update,
review/activate the new finite tool, then run the real phone-shaped portfolio
objective through CLOUD without Mac participation. Persist actual HTTPS preview,
review/candidate and benchmark evidence. No live benchmark or Codex comparison
exists yet. Phase 28.5's exact next task is to use that measured cloud baseline;
**do not start 28.5 before the baseline exists**.

Validation: full suite **231 files / 1,298 tests passed**, four live tests skipped
(390.62 seconds); focused checks **13 files / 73 tests passed**. Lint, typecheck,
build, diff and production configuration/security checks passed. Detailed results
are recorded in `PHASE_28_4A_REPORT.md`.

## Phase 28.3 implementation / live acceptance carry-over

Self-Improvement Mode extends the existing Engineering delivery/manager/runtime
and integration records. Core files are `apps/api/src/self-improvement/`,
`apps/api/src/routes/self-improvement.ts`, shared self-improvement contracts,
and narrow changes to existing Engineering services. Configured company/repository
UUID bindings resolve Athena; clients cannot select a repository or risk tier.
FAST uses one coding task with existing independent integration review. FULL
preserves the existing DAG and stronger security controls. Candidates remain
isolated; approval and actual merge are separate existing governed owner actions.
Accepted stable artifacts enter the existing memory path only after exact-head
merged validation/review evidence. High-risk candidates require passing lint,
typecheck, tests and build; insufficient registered profiles fail closed.

Read `self-improvement.md` and `PHASE_28_3_REPORT.md` for current tests, scenarios,
measurements and gaps. New fields are stored in existing JSON records/events;
28.3 introduces no migration or second persistence/runtime system.

A live self-change is pending an ACTIVE registered Athena repository, reviewed
command profile, company agents, trusted Mac mapping/transport and authenticated
owner invocation. The inspected database contains active Trial/Portfolio projects,
not an identified Athena registration. No live performance benchmark or Codex
comparison is claimed. The next 28.4 task is the existing Android Engineering
control UX using these canonical contracts; do not add another backend.

### Live acceptance checklist only

1. Register/bind the real Athena repository: owner/company scoped, ACTIVE and
   approved through existing Engineering configuration.
2. Run a genuine low-risk self change through SELF_IMPROVEMENT, FAST, the real
   AIRouter worker, signed Mac Agent/Engineering Runtime, isolated worktree,
   actual patch, targeted validation, integration, independent review and update
   candidate. Example: add a compact Engineering dashboard status indicator.
   Codex must not manually implement this acceptance feature.
3. Record actual elapsed/first-patch/validation times, model/provider, tokens,
   paid cost, model/tool calls, agents, retries, owner interventions and review.
4. Before Phase 28 final verification, run three trivial, three small and two
   medium Athena self-engineering tasks.
5. Add equivalent owner-entered Codex timings; do not invent comparison values.
6. Defer production migration/security rollout to 28.6 unless required earlier.

Exact external blocker from the last read-only inspection: no identified ACTIVE
Athena repository registration/company binding; active records were Trial and
Portfolio projects. Its trusted Mac workspace mapping/execution readiness has
not been verified, and the local API was offline. This blocks live acceptance,
not Phase 28.4 implementation. Do not substitute mocks for live evidence.

## Phase 28.3 validation on 2026-10-03

`pnpm test --no-file-parallelism` completed with exit 0: **219 files / 1,226
passed tests**, four opt-in live files/tests skipped, **429.82 seconds**.
`pnpm lint`, `pnpm typecheck`, `pnpm build` and `git diff --check` passed.
The final integration subset passed 31/31, including accepted-memory and missing
high-risk validation coverage. Six pre-existing Mac distribution modifications
were restored byte-for-byte after build. No live self-change or eight-task
performance benchmark was run. Formal verdict remains conditional.

## Phase 28.2 implementation

The remaining software blockers were addressed using existing infrastructure:

- Exact artifact/version/digest review through PolicyEngine and ApprovalService.
- Current approved brand promotion and source-checked future memory retrieval.
- Structured Workforce/Agent OS completion directly into artifacts.
- Lifecycle-driven bounded coordination, with existing scheduler restart recovery
  and server-revalidated automation sessions.
- Atomic PostgreSQL campaign/Objective creation across service instances.
- Persisted creative claims and exact receipt reconciliation; uncertain writes
  stop for owner review without retry or provider substitution.
- Existing economics projection and persisted Engineering benchmark snapshots.
- A coordinated multi-agent sandbox launch using creative and analytics gateway
  categories, exact reviews and an Engineering preview mock.

Read `marketing-department.md` for boundaries and `PHASE_28_2_REPORT.md` for
validation evidence. No public publishing, ad spend, generic execution path or
later-phase infrastructure was introduced.

## Phase 28.2 validation on 2026-10-03

`pnpm lint`, `pnpm typecheck`, `pnpm build` and `git diff --check` passed.
The complete `pnpm test --no-file-parallelism` run passed **215 files / 1,203
tests**, with four opt-in live files/tests skipped, in 426.68 seconds (exit 0).
The marketing subset passed 11 files / 48 tests. Existing Mac distribution
changes were restored byte-for-byte after build. See the report for limits.

## Acceptance still outstanding

1. A genuine reviewed creative provider is unavailable. Follow
   `marketing-production-acceptance.md`; a credential alone does not supply the
   missing reviewed finite handler. Production acceptance must prove the same
   gateway authority, opaque asset reference, durable receipt and audit path.
2. Run a live registered-repository Engineering landing-page child with the
   trusted Mac Agent and capture actual milestones and available economics.
   Unsupported benchmark counters remain null; target times are not results.
3. Defer production migration/security rollout (including 0110–0112) to Phase
   28.6 final hardening, unless another phase requires it earlier. No production
   rollout was performed in this continuation.
4. Phase 28.1 still requires a company-scoped GA4 credential/live governed read
   and a verified harmless macOS-affecting native invocation through the signed
   Mac Agent and Tool Gateway audit path.

## Conservative limitations

Known-safe creative retry is not automated; non-success evidence requires owner
review. Sensitive regulated claim review remains denied without a stronger
registered recent-authentication path. Campaign-wide perfect budget enforcement
and dashboard realtime polish remain later work. Owner-supplied analytics
windows/calendar inputs are clarification checkpoints.

Do not label production acceptance or Phase 28.3 readiness verified from sandbox
evidence. Preserve default-deny policy, exact authority, company isolation,
CSRF/trusted origins, emergency stop, secret isolation and signed native transport.

Inventory fix validation:7focused TypeScript and10Python checks pass. Lint
passes0errors/1existing warning; typecheck/build/diff checks pass. cfn-lint
0errors/3existing warnings. Full serial run:251files/1,450tests passed,
1suite failed at PostgreSQL benchmark beforeAll60000ms timeout,4opt-in live
files plus the blocked benchmark test skipped; elapsed669.80s,exit1. The exact
failed benchmark suite rerun passes1test/1file in13.88s,exit0. Do not describe
the full run as clean. No timeout raised, no test bypassed, no benchmark source
changed. Six pre-existing Mac generated artifacts restored after build.
The live AWS inventory-fix pipeline result remains pending.

Validation (2026-10-12):fullserialsuite253files/1,457tests pass,4opt-inlive
files/tests skipped,664.32s,exit0. Eleven focusedisolatedPostgreSQLtests pass.
Fullworkspace lint rerun passes0errors/1existingFastRefreshwarning after
fixingtypedtestreads. Fullworkspace typecheck/build pass; finalAPItypecheck
andbuildpassafterCLImetadataadditionandstrictrowguards. No privileged
workstationoperationorproductionmutationperformed. Sixpre-existingMac
generatedoutputsrestoredtoinitiallycleanHEADbytesafterbuild.
