# Phase 28.4A AWS Engineering setup

Target: existing owner AWS account, `ap-southeast-1`.
Status: adapter implemented locally; **not activated, no trusted AWS worker or live acceptance**.
Railway-native isolation remains rejected. Athena API/web, GitHub/Railway references,
Engineering architecture and Android controls remain in place.

## Selected design

Phone → existing Railway API → `Ec2CloudWorkspaceProvider` → one ephemeral EC2
`t3.medium` (2 vCPU / 4 GiB) → encrypted 10 GiB gp3 root volume → reviewed Linux
supervisor + Docker task containers → existing AIRouter/review/candidate path.
There is no Mac Docker socket, Mac filesystem, Ollama requirement or Mac service.
Use approved remote models for coding and independent review under existing AIRouter
privacy/budget policies. Do not relax privacy to obtain remote inference.

EC2 was selected over Fly Machines and DigitalOcean for this first adapter because
instance/image/snapshot/network/volume identity can be inspected separately and
root disk size can be fixed independently of CPU/RAM. This is a simplicity judgment,
not a measured provisioning-speed comparison. No provider timings were invented.
[AWS launch API](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RunInstances.html),
[Fly Machines](https://docs.fly.io/machines/api/machines-resource),
[DigitalOcean configurations](https://docs.digitalocean.com/products/droplets/details/features/).

## What the adapter enforces

- Fixed region/type, one instance, encrypted 10 GiB EBS, delete-on-termination,
  pinned account-owned AMI and root snapshot, explicit subnet/security group/profile.
- Stable EC2 ClientToken; company/repository/workspace/worker/generation tags;
  reconciliation before create; ambiguous writes never automatically retried.
- Server-only company AWS secret, SDK default credential chain disabled. No access
  keys or Railway/GitHub provider token goes into worker user data or model context.
- IMDSv2/hop limit 1; the worker's separate infrastructure role can receive the two
  finite SSM documents, but cannot provision EC2, obtain secrets or open sessions.
- Kernel/host evidence plus provider disk/security-group evidence before the
  existing repository READY/trust transition. Failure leaves the signed worker PENDING.
- Pinned SSM document version 1 and SHA-256; no caller shell/path/document selection.
- HTTPS preview uses the existing grant/cookie gate behind one shared AWS ALB.
  Certificate material remains in ACM/ALB. Worker inbound 8080 is accepted only from
  the ALB security group. External health verifies the exact provider-issued origin.
- Existing PostgreSQL cleanup/reconciliation is reused. A 55-minute EventBridge
  termination schedule is an independent backup; the reviewed AMI must also enforce
  an absolute deadline independently of Node, tasks and the Railway API.
- Actual usage/cost not available from lifecycle APIs is **UNKNOWN/null**. Allocated
  volume capacity is resource evidence, not measured used storage or billed cost.

EventBridge has minute-level invocation precision; it is not a hard lifetime by
itself. The AMI watchdog is mandatory, and current code rejects missing watchdog
attestation rather than claiming the schedule proves a hard deadline.
[Scheduler precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html).

## Runtime artifact required before activation

The existing bundle is not yet a reviewed EC2 AMI. It must be baked and reviewed
once using an infrastructure provisioning principal, not the runtime credential.
No administrator setup is performed on the owner's Mac. AGENTS.md rule 19 remains
in effect; privileged image/host setup must follow an explicitly reviewed deployment
process before it is executed. The current adapter does not install Docker/cgroups
on an unreviewed VM or bypass missing evidence.

Required AMI properties:

1. Node/pnpm/Git/Python/build tooling, SSM Agent, fixed worker entry point and reviewed
   preloaded task/dependency/relay images. Image root snapshot must fit <=10 GiB.
2. `/etc/athena/provider` contains `aws-ec2`, root-owned and not group/world writable.
3. Whole-VM kernel PID ceiling <=512 plus cgroup controls; task containers <=256
   PIDs, <=2 CPU, <=2 GiB, UID/GID 65532, dropped capabilities, no-new-privileges,
   read-only root and bounded tmpfs. All persistent writes share the 10 GiB EBS.
4. `/run/athena` root-owned mode 0700. No task mounts of signer/bootstrap/preview
   data, host `/proc`, Docker socket, provider metadata or control-plane paths.
5. `athena-dependencies` is an internal Docker network. Its only egress is the
   reviewed `athena-registry-proxy`; allow the reviewed npm registry destinations,
   deny IP-literal/private/link-local destinations and redirects to forbidden hosts.
   Installation keeps `--ignore-scripts`. Validation uses `--network none`.
6. `alexa-engineering-preview` remains internal with the existing fixed relay/gate.
7. A root-owned supervisor independent of the worker arms a kernel/systemd deadline
   from `/run/athena/lifetime.json` (<=3,500 seconds from request acceptance), kills
   descendants and powers down; EC2 shutdown behavior is terminate. Idle teardown
   runs within 300 seconds without active governed work. Worker heartbeat alone
   must not extend idle lifetime. Loss of worker or watchdog must fail closed.
8. Cloud-init only writes the two fixed data files; no runtime package installation,
   arbitrary runcmd or user executable. Redact/suppress bootstrap data in cloud-init,
   SSM and journal logs; remove expired bootstrap/user-data copies from task reach.
9. Two immutable reviewed SSM documents, tagged to the company:
   `AthenaEngineeringEvidenceV1` (no parameters) and
   `AthenaEngineeringPreviewGrantV1` (one bounded base64 JSON grant).
   Their implementation must perform finite operations only, return bounded
   nonsecret evidence/status and never accept shell/executable/target parameters.
10. Evidence must measure actual kernel, mounts, Docker/network policies and armed
    supervisor state, bind exact scope and artifact digest, and return the strict
    `Ec2RuntimeEvidenceSchema`. A static manifest or self-asserted booleans alone
    cannot certify these controls. The EC2 evidence helper, preview-grant helper, watchdog and their SSM
    document sources are now implemented in `deploy/engineering-worker/aws/image`
    and `apps/api/src/cloud-engineering/ec2-image-runtime.ts`. They have not been
    baked/published or verified on a real EC2 VM. A reviewed infrastructure bake
    and live image release gate remain mandatory before any worker READY.

## Preparation with preview disabled

Keep CloudFormation `EnablePreview=false` and `ActivateRuntimePermissions=false`.
The adapter's `runtimeEnabled` defaults to false; explicit `previewEnabled=false`
permits omitting previewDomain, previewListenerArn, previewCertificateArn and
previewDocumentHash. Do not fabricate those values. Disabled preview operations
fail closed and the worker gate does not listen. No configuration entry can be
completed until real reviewed AMI/snapshot/runtime/evidence-document values exist.
These flags are not a substitute for IAM, governance or live containment checks.

See [the image payload and release gate](../deploy/engineering-worker/aws/image/README.md).
This first image requires npm/pnpm profiles; absent Python/Gradle task images fail
closed. The operator must bake on isolated Linux; no Mac Docker/Ollama/host state is
part of ordinary cloud execution. No privileged bake was executed by Codex.

## Minimum runtime IAM

Templates under `deploy/engineering-worker/aws/` are **unresolved review templates**,
not deployed or account-tested policies. Substitute only actual account/resource
IDs and the company UUID. Validate against the chosen account before activation;
if an action is denied, identify its exact resource/context rather than broadening
permissions. This runtime principal cannot build AMIs, create roles/VPCs/SSM
security documents, or change its own authority.

- `control-plane-policy.template.json`: EC2 evidence reads; RunInstances restricted
  to the approved AMI/subnet/SG, t3.medium, company/runtime tags and <=10 GiB encrypted
  EBS; tagging at launch only; stop/terminate tagged instances; PassRole for the
  exact worker and reaper roles; two finite SSM documents; exact schedule group and
  reviewed ALB listener/task targets. Generic SSM sessions/automation/shell documents
  are denied. Some evidence actions require Resource `*`; these are read-only,
  region-limited, and still scoped by Athena before use.
- `worker-role-policy.template.json`: only the SSM agent channels/status and two
  document reads. Explicitly deny secrets/parameters, EC2/IAM/scheduler/ELB/S3
  authority, SendCommand and sessions. Do not attach AdministratorAccess or the
  broad default SSM policy in place of this restricted role.
- `reaper-role-policy.template.json`: only terminate instances carrying the exact
  company/runtime tags. Trust `scheduler.amazonaws.com`, bound to the account and
  selected schedule-group ARN. Worker-role trust is `ec2.amazonaws.com` only.
  Exact trust templates are `worker-trust-policy.template.json` and
  `reaper-trust-policy.template.json`; the dedicated control-plane principal
  receives the runtime policy, never these worker/reaper policies.

Use a dedicated least-privilege control-plane principal or short-lived role session.
It must have no other attached broad policies. If an existing permissions boundary,
SCP or customer-managed EBS KMS key adds requirements, review those exact permissions
separately; this template is not proof of account-side authorization.
[AWS IAM launch/resource examples](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ExamplePolicies_EC2.html),
[SSM setup](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command-setting-up.html).
The conditional action/resource keys were checked against the current
[EC2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ec2.html),
[SSM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html) and
[ELBv2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_elbv2.html)
authorization references. ELB tagging is permitted only during target/rule creation,
so this principal cannot retag existing resources to claim another company's ingress.

## Consolidated owner Console setup

For fewer manual steps, use [the staged CloudFormation setup](PHASE_28_4A_AWS_EASY_SETUP.md).
It reuses existing resources and supports adding preview DNS/certificate later.
Preparation mode remains inert; real HTTPS acceptance still requires controlled DNS
and a reviewed runtime.

## Secure Athena credential registration

1. In AWS Console/your existing secret tooling, create the dedicated runtime
   principal or scoped role session with the reviewed policy. Do not use root keys.
2. Store its credential JSON **only** as the sealed production API secret
   `AWS_ENGINEERING_CREDENTIAL` on the existing Railway API service. Required fields
   are `accessKeyId`, `secretAccessKey`; `sessionToken` is required for temporary
   sessions. Never put this variable on web, Android, worker, source or chat.
3. Through Athena's existing authenticated owner credential-reference mutation,
   with CSRF and exact company scope, register provider `aws`, secret locator
   `aws-engineering-primary`. Mark READY only after actual provider verification.
   Create the company integration binding with provider `aws`, integration type
   `API`, integration ID `engineering.aws`, capability `aws.workspace.provision`,
   and that reference UUID. The existing authenticated mutations are POST
   `/api/company-data/credentials` and POST `/api/company-data/integrations`,
   using the application's CSRF and explicit company-scope headers. Reuse the
   same registered IDs on retry; do not insert records directly into PostgreSQL.
   This uses existing governance records; no new credential store or public setup
   endpoint is introduced. The current two GitHub/Railway buttons do not register AWS.
4. Supply only nonsecret IDs: AWS account ID, approved AMI/snapshot/digest, subnet/VPC,
   worker/ALB SGs, instance profile, scheduler group/reaper role, ALB HTTPS listener,
   ACM certificate and preview domain, SSM document hashes, and credential-reference
   UUID. Do not send key values to Codex. I can finish the scoped registration in the
   authenticated owner session after the server secret is configured.
5. Populate `AWS_ENGINEERING_CONFIG` with one reviewed company entry matching
   `Ec2EngineeringConfigurationSchema`, including existing owner/company/profile/
   authorized-agent IDs and the existing reviewed API HTTPS origin. Railway private
   DNS is not reachable from an external EC2 VM; do not invent localhost or weaken
   the API's network/origin controls. Verify its existing signed cloud-worker access.
   Preserve Railway references; do not configure two active workspace providers for
   the same company.
6. Review/activate the existing finite `prepare_workspace` Tool Gateway handler
   with recent authentication and exact action digest. Test credential revocation,
   runtime evidence, signed scope, cleanup and preview before acceptance.

The shared ALB, ACM certificate/wildcard DNS, VPC/subnet/SGs, roles, reviewed AMI,
schedule group and SSM documents are provisioning prerequisites, not resources
that models or the runtime credential can create. No Kubernetes/autoscaler is added.
One workspace initially; no warm pool.

## Acceptance and evidence

Real portfolio acceptance remains NOT_RUN. Provisioning, clone, model call, patch,
validation/build, review, HTTPS preview and candidate timings have no live values.
Model/workspace costs remain UNKNOWN. Current local gates passed: 117 focused
cloud/signed-runtime tests; full suite 235 files / 1,328 tests passed with four
opt-in skips (468.04 seconds); lint, typecheck, build and diff check passed.
These are fixture/contract checks, not real AWS authorization or VM evidence.
See the Phase 28 handoff for exact results and limitations.
Phase 28.5 remains blocked until the real phone-only measured baseline exists.

## Latest local trusted image validation — October 4

Focused cloud/runtime/signed transport: 17 files / 147 tests passed. Final targeted
EC2/image/document/scope checks: 4 files / 55 tests passed. Full suite: 237 files /
1,362 tests passed, four opt-in files/tests skipped, 431.53s, exit 0. Lint (one
existing warning), typecheck, final-source build and diff check passed. Six generated
Mac artifacts were restored and hash-verified. Image recipe checks were syntax-only;
no privileged recipe was executed. All 20 allowlisted payload files/hashes verified.

These are local gates, not AMI publication, live Linux containment verification,
production activation or a real portfolio benchmark. Keep preview/runtime inactive.
