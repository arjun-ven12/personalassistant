# Temporary exact-base input inspection

Scope: owner-operated temporary EC2 inspection only. No Image Builder deployment,
AMI publication, runtime activation, preview or Athena credentials. No IAM changes.
Use the existing infrastructure principal, not the Athena runtime IAM user.

Owner-reported inspection instance: **i-09c137314e06b4b47**. Browser terminal
opened on2026-10-05. Owner reports Ubuntu24.04.4, kernel7.0.0-1012-aws, active Snap SSM3.3.4793.0
revision13349 (unheld). Exact identity/archive hash and full inventory remain
pending; launch settings are
not independently verified by Codex. This is not a worker READY record.

## Launch using AWS Console

1. Select **Singapore (ap-southeast-1)** in account **737073451069**.
2. **EC2 → Network & Security → Security Groups → Create security group**:
   - Name: `athena-ami-input-inspection-sg`.
   - Description: `Temporary exact-base inspection via EC2 Instance Connect only`.
   - VPC: `vpc-04179b719aaccf907`.
   - Inbound: one SSH/TCP22 rule, custom source **3.0.5.32/29**.
   - Outbound: remove All traffic; add TCP80 and TCP443 to `0.0.0.0/0`.
   - No IPv6, HTTP ingress or Athena worker/preview security groups.
   - The CIDR was read from AWS's official `ip-ranges.json` on 2026-10-05:
     service EC2_INSTANCE_CONNECT, Singapore, sync token1791155226. Refresh it
     from the official source if launching later; never use all-address SSH.
3. **EC2 → Images → AMIs → Public images**, search exact
   `ami-0ba4172b23e57d5a8`. Confirm owner099720109477 and the20260904 Noble name.
   Select it and click **Launch instance from AMI**.
4. Launch settings:
   - Name: `athena-ami-input-inspection`.
   - Instance type: `t3.small` (2vCPU,2GiB; ordinary inspection only).
   - Key pair: **Proceed without a key pair**; use browser EC2 Instance Connect.
   - Network → Edit: existing VPC above, subnet`subnet-0c35a5bf3347d05ce`,
     auto-assign public IPv4 **Enable**, select the new inspection SG only.
   - Storage: **10GiB gp3**, **Encrypted**, default EBS key, delete on termination.
     No additional EBS volumes. Base source root is8GiB.
   - Advanced details: IAM instance profile **None**, user data **empty**,
     instance metadata **Enabled**, metadata version **V2 only (token required)**,
     hop limit**1**, metadata tags **Disabled**, detailed monitoring **Disabled**,
     termination protection **Disabled**, shutdown behavior **Terminate**.
   - One instance, On-Demand; no launch template, fleet, auto-scaling or Spot.
5. Click **Launch instance**. Wait for Running and status checks to pass.
6. **Instances → select instance → Connect → EC2 Instance Connect**:
   public IPv4, user`ubuntu`, then **Connect**. If the existing infrastructure
   principal cannot connect, record the exact denial; do not expand IAM, assign
   a runtime profile or open SSH to the world.
7. Return the **instance ID** and confirm the browser terminal opens. Never
   paste AWS keys, SSH private keys or credential files.

Browser Instance Connect uses temporary public-key delivery authorized by the
existing infrastructure principal. The instance itself has no AWS IAM profile.
The SSH exception applies only to this temporary operator inspection instance;
the published worker still removes/masks SSH and never mounts owner credentials.

## Inventory collection (after connection)

The reviewed script is
`deploy/engineering-worker/aws/image-builder/freeze-packages.py`.
Run it as `ubuntu`, **without sudo**. It copies dpkg status and public source
configuration into an owner-local directory, creates private APT indexes and
cache, resolves/downloads exact packages, and emits package-inventory.json.
No package installation or update of the system APT lists occurs. It reads only
IMDS public instance identity, never IAM metadata credentials.

Obtain the non-secret full metadata export through CloudShell as the
infrastructure principal, not through the inspection instance:

```bash
aws ec2 describe-images --region ap-southeast-1 --owners 099720109477 \
  --image-ids ami-0ba4172b23e57d5a8 --output json > describe-images.json
```

Transfer only this JSON and the reviewed script into the browser terminal (fixed
here-document, not interpolated shell text). The operator executes:

```bash
python3 freeze-packages.py describe-images.json "$HOME/athena-input-inspection"
```

The owner provided the full AWS metadata export. The prepared fixed command
`deploy/engineering-worker/aws/image-builder/run-input-collection.sh` embeds it
and the current collector. Copy the entire command into the ubuntu terminal;
no sudo is required. Send the output between ATHENA_INVENTORY_BEGIN and
ATHENA_INVENTORY_END (include both markers), or the full error.
Return the resulting **package-inventory.json**, not environment files or logs.
Preserve downloaded DEBs/Snap archive for offline tooling packaging. Signed
repository metadata and source content are recorded for review. The collector retrieves a public byte-identical Snap archive rather than reading
the root-only installed archive. Its hash must match the owner-collected root
checksum; installed version/revision and service health are checked separately.
The Snap refresh
hold in the output is the intended Image Builder policy; this inspection does
not set it or claim the currently running agent is already held.

Then, on the unprivileged repository workstation:

```bash
python3 deploy/engineering-worker/aws/image-builder/assemble-tool-lock.py \
  /absolute/path/to/inventory /absolute/path/to/approved-artifacts \
  /absolute/path/to/new-reviewed-tooling
python3 deploy/engineering-worker/aws/image-builder/package-tooling.py \
  /absolute/path/to/new-reviewed-tooling /absolute/path/to/tools.tar
pnpm --filter @alexa-control/api exec tsx src/scripts/image-builder-inputs.ts \
  /absolute/path/to/new-reviewed-tooling/lock.json /absolute/path/to/tools.tar \
  ../../.local/engineering-worker/phase28_4a_ec2_candidate/athena-ec2-image-payload.tar
```

Owner reviews exact installed/changed versions, all hashes and concrete kernel
ABI before deployment. Local assembly/validation grants no AWS execution trust.

## Terminate after export is verified

**EC2 → Instances → select athena-ami-input-inspection → Instance state →
Terminate (delete) instance → Terminate**. Confirm Terminated. Check its root
volume is deleted via DeleteOnTermination. Do not create an AMI or snapshot.
The operator handles temporary-infrastructure cleanup, including removing only
the now-unused `athena-ami-input-inspection-sg`. Never modify runtime SGs or
Athena durable Engineering records. Provide the terminated instance ID so the
inspection record can be closed. Termination is an owner action, not performed
by Codex under AGENTS.md rule19.

Sources: [AWS Instance Connect prerequisites](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-prerequisites.html),
[AWS published service IP ranges](https://ip-ranges.amazonaws.com/ip-ranges.json).

## Source parser retry

The actual Canonical file contains comment-only header paragraphs. The corrected
collector ignores those paragraphs while enforcing the same approved repository
and signing key boundaries, and denying duplicate/unknown source fields.
Re-copy the current prepared command. It runs under a child shell (no sudo), so
errors return to the Ubuntu prompt. Output goes to
`~/athena-input-inspection-20261005-retry1`; previous partial files are retained.
Do not alter Ubuntu source files or run the collector as root.

If a copied command reports a traceback beyond the updated script length, use
`run-input-collection-v2.sh` to avoid a stale editor/clipboard copy. It prints
`ATHENA_COLLECTOR_V2_COMMENT_PARSER_FIXED` and writes to a fresh
`~/athena-input-inspection-20261005-retry2` directory. Same collector and security
checks; previous attempts remain intact.
