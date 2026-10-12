# Phase 28.4A: consolidated AWS owner setup

Use `deploy/engineering-worker/aws/owner-infrastructure.cloudformation.json`.
Stack name: **athena-engineering-infrastructure**.
Account: **737073451069**. Region: **ap-southeast-1** only.

## What this replaces

One owner-managed stack replaces the remaining individual route-table, security-group,
preview certificate/ALB/DNS and finite runtime permission creation steps. The same
stack can be updated as reviewed inputs become available. It reuses the recorded VPC,
two subnets, gateway, IAM user, worker role/profile, reaper role and Scheduler group.
No API/web deployment, owner credential, EC2 instance or AMI is created by this stack.
No existing resource is imported into CloudFormation or recreated. Existing roles/user
must exist; the conditional managed policies are conditionally attached only on activation.

## Current status

Template passed local CloudFormation schema validation (`cfn-lint`, exit 0) and
focused security invariants: preparation mode denies worker egress/runtime authority,
no existing identity/resource recreation, and policy statements exactly match the
reviewed templates after substitutions. This is not AWS account-side validation.
Owner supplied preparation-stack outputs: worker SG `sg-0b77b637346ef5065`,
preview SG `sg-065e5d49d32634451`, route table `rtb-08c9c017691e1b4a0`,
VPC `vpc-04179b719aaccf907`, worker subnet `subnet-0c35a5bf3347d05ce`, and
RuntimePermissionsActivated `false`. Deployment status/configuration have not been
independently verified. Managed-policy size checks with the actual account/company
and full resource ARN forms are 4,079 / 2,380 / 358 characters (each below 6,144).
Workspace lint, typecheck, build and diff check passed; complete test suite
1,328 passed / four opt-in skipped (444.63 seconds). Lint retains one existing
Fast Refresh warning. Generated Mac artifacts were restored byte-for-byte.
This is infrastructure scaffolding, not a reviewed worker runtime or live acceptance.
The image/watchdog/evidence/grant helper sources are now implemented; the reviewed
Linux AMI bake, publishing and actual image/security verification remain prerequisites.

## Minimum owner inputs

- If the manual route-table step was completed, provide its `rtb-...` ID. Set
  `ExistingRouteTableId` to it: the stack reuses it and does not change its routes or
  associations. Confirm it has the exact recorded gateway route and both subnet
  associations. If it was not completed, leave this parameter empty; the stack
  creates the route table and associations. Gateway attachment must already be correct.
- For HTTPS preview, provide an owned preview domain (for example
  `preview.yourdomain.com`) plus its authoritative Route53 hosted-zone ID, OR an
  already-issued Singapore ACM certificate ARN covering `*.preview.yourdomain.com`.
  If DNS is outside Route53, add the wildcard DNS alias/CNAME through that provider
  after receiving the stack's load-balancer hostname. Do not enable runtime before
  external DNS/TLS/preview verification. Certificate validation is not assumed.
- No secrets are stack parameters. Provider credential stays on the Railway API.

## Minimum temporary/manual DNS for acceptance

Owner has not completed the route-table step and has no dedicated preview domain.
Use preparation mode now with `ExistingRouteTableId` empty and `EnablePreview=false`.
Add a domain later by updating the same stack; no dedicated domain purchase or DNS
migration is required if you already control another domain/subdomain.

For the existing ALB adapter, choose a temporary base such as
`athena-test.yourdomain.com` under a domain whose DNS you can edit. Request a public
ACM certificate in Singapore for **`*.athena-test.yourdomain.com`**. With external
DNS, the minimum is normally two CNAME records:

1. ACM's exact `_...` validation name/value, obtained from the certificate details.
   Copy actual AWS values; no invented records. Keep the validation record for renewal.
2. **`*.athena-test.yourdomain.com`** -> the actual ALB DNS hostname from stack Outputs,
   plain DNS (no intermediary proxy). The adapter uses instance-ID subdomains.

Once ACM shows **ISSUED**, update the stack with the actual `PreviewDomain`,
`ExistingCertificateArn`, `EnablePreview=true`, and leave `HostedZoneId` empty for
external DNS. Keep `ActivateRuntimePermissions=false` until the VM controls are
reviewed. Record actual external TLS/HTTP verification; CNAME propagation alone is
not PREVIEW_READY. A certificate for the base hostname alone does not cover the
instance-ID subdomains. Route53 is optional; an un-delegated hosted zone is not
proof of ownership and cannot validate a public certificate.

If you control no domain/DNS hostname at all, trusted public preview remains a real
prerequisite. This ALB design cannot issue an owner certificate for AWS's generated
`elb.amazonaws.com` hostname. Do not replace HTTPS with HTTP or use a self-signed
certificate to pass acceptance. We can prepare all other infrastructure first;
obtain an owned/delegated DNS hostname before the HTTPS acceptance step.

[AWS ACM manual DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html),
[ALB HTTPS certificate requirement](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html).

## First stack creation

1. AWS Console -> CloudFormation, Singapore -> Stacks -> Create stack -> With new
   resources (standard).
2. Choose **Choose an existing template** -> **Upload a template file**. Upload the
   JSON above. Click Next.
3. Stack name: **athena-engineering-infrastructure**.
4. Keep recorded VPC/subnet/gateway defaults. Enter `ExistingRouteTableId` only if
   you already created the dedicated table. Keep **ActivateRuntimePermissions=false**.
5. Without domain/certificate information, keep **EnablePreview=false**, preview
   fields blank and **ReviewedSupervisorHttpsCidr=127.0.0.1/32**. This deliberately
   prevents worker internet egress. Do not launch a worker.
6. If reviewed domain/zone/certificate inputs are ready, set **EnablePreview=true**
   and enter them. ACM DNS auto-validation requires the matching authoritative
   Route53 zone. Creating the ALB starts actual AWS charges; lifecycle cost evidence
   remains UNKNOWN until measured. No exact price is asserted here.
7. Click Next. Keep the default stack failure rollback behavior. Use your existing
   authorized owner/infrastructure identity, not the Athena runtime credential.
   Do not attach a broader execution role to resolve access errors.
8. Click Next and review the resource/parameter list. The template includes IAM
   policy resources, even though they are inactive initially; acknowledge the IAM
   capability if the Console requires it. Click Submit/Create stack.
9. Wait for **CREATE_COMPLETE**, then open **Outputs**. Send the outputs and Stack
   ID, never secrets. If CREATE_FAILED/ROLLBACK occurs, send the first failed event
   reason. Do not weaken rules or create duplicate stacks to bypass a failure.

## Runtime activation is a reviewed later update

Requires exact AMI/digest, approved finite SSM documents/helpers, measured watchdog,
process/disk/network evidence and constrained supervisor HTTPS destination CIDR.
The template refuses activation without nonempty image/digest and enabled preview.
It does not prove runtime evidence merely because those fields are provided.
`ReviewedSupervisorHttpsCidr` is a reviewed supervisor HTTPS destination (such as an
approved egress proxy). It is not a model-selected target or unrestricted package
network. It cannot be 0.0.0.0/0 during activation. Task containers still require
internal proxy-only networking and offline validation. DNS policy and image firewall
remain mandatory measured controls; an SG is not a domain allowlist.

The control-plane statements are split into compute/preview managed policies to
respect IAM policy size limits; no statement or permission is added. The reaper
uses a separate managed policy. Named IAM capability acknowledgement is required
when the Console requests it.

The control-plane policy is derived from the existing template without adding
permissions. The reaper policy retains exact company/runtime tags. Creation-only
ELB tags, exact listener, approved AMI/subnet/SG/profile and finite SSM documents
remain scoped. The existing `AthenaEngineeringEC2Policy` on IAM user
`athena-engineering` must be independently reviewed and replaced/detached if its
permissions exceed the approved runtime contract before activation. Adding a
restricted policy does not reduce a broader existing policy. This stack does not
silently edit that existing managed policy or its attachments.

The stack creates no SSM shell composer, keys, signing material, public worker ports,
SSH access, training infrastructure or Phase 28.5 features. Worker ingress is only
8080 from the preview SG; preview public ingress is only HTTPS443. Preview defaults
403 until the existing workspace/token gate is available. Default all-egress is
suppressed explicitly; prepare mode worker HTTPS targets loopback only.

## Ownership / cleanup

This stack owns only resources it creates. Reused VPC/subnets/gateway/roles remain
owner-managed and untouched by stack deletion. Do not delete this stack during live
work: revoke previews and destroy workers through Athena's durable cleanup first.
Stack rollback/deletion is an explicit infrastructure teardown, not authority for
permanent deletion of Engineering records. No teardown was performed during setup.
