# FINAL INPUT APPROVAL REGISTER — 2026-10-05

Status: **OWNER APPROVED INPUT PINS — NOT DEPLOYED, NOT RELEASED**.

Owner confirmed “approve” on 2026-10-05 for the exact checklist below.
Approval binds to the recorded hashes, including the new Snap-compatible payload.
Structured record: `deploy/engineering-worker/aws/image-builder/evidence/owner-input-approval-20261005.json`.
The exact inspection export was reconstructed and its SHA-256 verified. All 10
Canonical DEBs were independently downloaded and matched their recorded hashes.
The generated schema-2 lock passed Zod; every tooling archive member was verified.
No Image Builder deployment, IAM change, runtime activation or preview occurred.

## Base AMI

| Field | Exact candidate |
| --- | --- |
| Account / region | 737073451069 / ap-southeast-1 |
| AMI | `ami-0ba4172b23e57d5a8` |
| Owner | `099720109477` (Canonical) |
| Name | `ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-20260904` |
| AWS CreationDate | `2026-09-04T11:46:06.000Z` |
| Architecture / state / virtualization | x86_64 / available / HVM |
| Root | `/dev/sda1`, EBS, 8 GiB gp3, delete-on-termination |
| Source snapshot | `snap-0930a0f50200e3c0b` |
| Public / source encryption | Public=true; source snapshot Encrypted=false |
| Extra mappings | `/dev/sdb` ephemeral0, `/dev/sdc` ephemeral1; not additional EBS |
| Boot / IMDS | uefi-preferred / v2.0 |
| Inspection instance | `i-09c137314e06b4b47` |

Metadata PASS is based on the owner's AWS DescribeImages export, not a Codex
AWS-authenticated call or approval from the Canonical feed. Image Builder and
worker roots must separately be encrypted and limited to 10 GiB. Source image
public/unencrypted metadata is not permission to publish an unencrypted worker.

## SSM strategy A: retain exact standard Ubuntu Snap

The real collector verified the binary version, exact revision/current path,
absence of a second DEB agent, and enabled/active systemd service. Retaining
this agent avoids replacing Image Builder's active SSM transport.

| Pin | Value |
| --- | --- |
| Runtime version | `3.3.4793.0` |
| Snap revision | `13349` |
| Archive SHA-256 | `53e14f4e402a3de500dbfd162368922a07117638dcfc14c1e2c0340cbf979de7` |
| Binary | `/snap/amazon-ssm-agent/current/amazon-ssm-agent` |
| Service | `snap.amazon-ssm-agent.amazon-ssm-agent.service` |
| Minimum runtime | `3.3.2746.0`; observed version satisfies it |
| Build refresh policy | Hold exact agent forever after matching revision/hash; no channel change |

The inspection agent was unheld. `refreshHeld: true` in the lock is the required
future Image Builder outcome, not a claim the inspection VM was changed.
Installed archive hash matches the independently downloaded immutable official
Snap Store artifact; Store SHA3-384 also matched. This establishes byte agreement
and observed publisher provenance, **not an AWS detached Snap signature**.

Separate DEB detached signature: **PASS** for upstream `3.3.5390.0`, actual
package `3.3.5390.0-1`, amd64, using exact AWS fingerprint
`1C5B395CBE5E74E2F1CA21592784DBF388D19D46`. One-bit tampered DEB was rejected.
DEB SHA-256: `f8a5ecfd8235a0bf8c129e567ba83656e62c5eceeeff971916f461f85522fcd0`.
This DEB is not included in the chosen Snap tooling archive. No implicit
Snap removal or DEB conversion is approved. See
[signature evidence](../../deploy/engineering-worker/aws/image-builder/evidence/ssm-deb-signature.json).

## Frozen Ubuntu tooling and dependency closure

651 installed base packages recorded; 648 inherited unchanged, 3 existing
packages upgraded, 7 new packages introduced. All 10 changed DEBs have exact
version, architecture, download SHA-256 and Canonical source URL. Inherited
packages are pinned by base AMI and exact installed version/architecture; no
unavailable inherited DEB hashes are fabricated.

Complete machine-readable review files:

- [Full inventory, sources and signed-index hashes](../../deploy/engineering-worker/aws/image-builder/evidence/package-inventory-owner-export.json).
- [Every inherited/changed package, version, architecture, hash and source](../../deploy/engineering-worker/aws/image-builder/evidence/package-inventory-review.csv).
- [Exact schema-2 lock](../../deploy/engineering-worker/aws/image-builder/evidence/input-lock-candidate.json).

### Packages installed/upgraded by Image Builder

| Package | Exact version | Architecture | Downloaded DEB SHA-256 |
| --- | --- | --- | --- |
| containerd | `2.2.1-0ubuntu1~24.04.3` | amd64 | `459a0184cc631c17eb4a625392f749fa753627b4ddba196919e0666a6206d92a` |
| docker.io | `29.1.3-0ubuntu3~24.04.2` | amd64 | `bd5c22d42d4ce3021958b7a8d627701597f61a1a9867ba83fe3c841f04991e3a` |
| linux-aws | `7.0.0-1014.14~24.04.1` | amd64 | `6a0c45f475ce66bb5fae30a959d6037c6db1c6b36bd2f283caa5133a6ca04145` |
| linux-aws-7.0-headers-7.0.0-1014 | `7.0.0-1014.14~24.04.1` | all | `cc59d9e4628d1726495237ec0389df164bb647de3eccc89269d6bfc54211d61d` |
| linux-headers-7.0.0-1014-aws | `7.0.0-1014.14~24.04.1` | amd64 | `cc29413ce049789d5b4ceef29d295182096cf11386be59e65fbb845dbf8c14f8` |
| linux-headers-aws | `7.0.0-1014.14~24.04.1` | amd64 | `4a065bf2165aacf3ba4b3e70f17d77f9cc0627c13605e6c808913192d8e7ad6c` |
| linux-image-7.0.0-1014-aws | `7.0.0-1014.14~24.04.1` | amd64 | `bb4e1aae90d41945b100459233ee440c3494e019467f9a2e60ec931f988cf00b` |
| linux-image-aws | `7.0.0-1014.14~24.04.1` | amd64 | `6e2b2a0bee8ee3e4bbd9d47c771126373080336e791bb2544e31560f4cf2ab61` |
| linux-modules-7.0.0-1014-aws | `7.0.0-1014.14~24.04.1` | amd64 | `918e98bed5dae1ab40bfb3bc91e9456c1321435533165a9d7023ac60301c1e88` |
| runc | `1.3.4-0ubuntu1~24.04.1` | amd64 | `6ddd64ed7ef1693dd95620a2b1148a4187ef4fe0819c3c3049fad9385ecfd5dc` |

Each source is the exact Singapore Canonical `/ubuntu/pool/` URL in the CSV/JSON.
The build installs only these local hashed DEBs; it does not resolve latest
packages, run an unpinned upgrade or fetch missing dependencies.

### Required tooling inherited unchanged

| Package | Exact version | Architecture |
| --- | --- | --- |
| git | `1:2.43.0-1ubuntu7.3` | amd64 |
| python3 | `3.12.3-0ubuntu2.1` | amd64 |
| python3-minimal | `3.12.3-0ubuntu2.1` | amd64 |
| python3.12 | `3.12.3-1ubuntu0.16` | amd64 |
| python3.12-minimal | `3.12.3-1ubuntu0.16` | amd64 |
| libpython3.12-minimal | `3.12.3-1ubuntu0.16` | amd64 |
| libpython3.12-stdlib | `3.12.3-1ubuntu0.16` | amd64 |
| libpython3.12t64 | `3.12.3-1ubuntu0.16` | amd64 |
| iptables | `1.8.10-3ubuntu2` | amd64 |
| ca-certificates | `20260601~24.04.1` | all |
| xz-utils | `5.6.1+really5.4.5-1ubuntu0.3` | amd64 |
| systemd | `255.4-1ubuntu8.17` | amd64 |
| cloud-init | `26.1-0ubuntu1~24.04.1` | all |
| iproute2 | `6.1.0-1ubuntu6.4` | amd64 |
| util-linux | `2.39.3-9ubuntu6.6` | amd64 |
| snapd | `2.76.3+ubuntu24.04` | amd64 |

Inspection running kernel: `7.0.0-1012-aws`. Proposed built-image kernel ABI:
**`7.0.0-1014-aws`**, with exact image/modules and meta-package pins above.
This is a recorded dependency-resolution proposal requiring owner approval,
not a silent substitution or proof that the new kernel has booted.
Image Builder post-reboot tests must confirm the proposed ABI; failure blocks release.

## Artifact pins and final hashes

| Pin | Exact value | Approval state |
| --- | --- | --- |
| Node | `24.21.0`, Linux x64 | Already approved |
| Node SHA-256 | `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6` | Already approved |
| pnpm | `11.17.0` | Already approved |
| pnpm SHA-256 | `644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541` | Already approved |
| pnpm registry SRI | `sha512-zKPOozKtJUu4QUX5ZtGfSHlhUhA0b8kseaBH8joNezzKPDeS8AdrofGDHSd++88KkRmzGppg7Kf7PWIx8zHvcg==` | Recorded supporting integrity |
| Node container | `node@sha256:5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7` | Already approved |
| Original payload SHA-256 | `2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689` | Already approved; preserved |
| Snap-compatible candidate payload SHA-256 | `658679b5b50d86dc85f4ba73f66ed54021e13a486d365a6ab8d58972f7bed28e` | Owner approved 2026-10-05 |
| inventorySha256 | `7f1f1e5a2cd3ed6bd4f68e7232557904457224ef219854e74471d4e74e669b85` | Owner approved 2026-10-05 |
| LockSha256 | `5ee9e7ed7d480fea8b10adc04441c3fc38b748b76a0ba81e68473108d9e0dc36` | Owner approved 2026-10-05 |
| ToolingSha256 | `e09a2555ecaaaa2145ec2c7656f4e60a012295bca420275c09ec99326e59ba13` | Owner approved 2026-10-05 |

The candidate payload implements exact Snap compatibility and sealed-agent
checks. Approval of the original payload does not transfer to these new bytes.
Tooling archive: `.local/engineering-worker/image-builder-tools-candidate.tar`.
Candidate inputs: `.local/engineering-worker/image-builder-approved-input-candidate/`.
No sealed runtime hash is claimed before the fixed install/seal recipe executes.

## APPROVAL CHECKLIST

- [x] Approve the exact Canonical base AMI / metadata above.
- [x] Approve strategy A: retain Snap 3.3.4793.0 revision 13349, exact archive hash,
      exact service/binary, and mandatory build-time refresh hold.
- [x] Review/approve the complete frozen package CSV/JSON, 10 changed DEBs and
      proposed kernel ABI 7.0.0-1014-aws.
- [x] Approve the exact LockSha256 and ToolingSha256 above.
- [x] Approve the NEW Snap-compatible payload SHA-256 above.
- [x] Retain already approved Node, pnpm, container and original payload pins.

Input approval grants no worker READY or AMI RELEASED verdict. Keep runtime
permissions and HTTPS preview disabled. Image Builder success still requires the
separate destructive/live signed-worker security release gate. Phase 28.4 and
28.5B live acceptance remain conditional; no live timing/cost baseline exists.
No stack deployment is performed in this input-review step.

## Inspection cleanup after verified export

The export and all required artifacts are preserved locally. The owner can now
terminate temporary instance `i-09c137314e06b4b47` in Singapore:
**EC2 → Instances → select the exact instance → Instance state → Terminate
(delete) instance → confirm**. Use the infrastructure principal, not Athena's
runtime credential. Confirm the temporary root volume follows delete-on-termination.
Do not create a snapshot/AMI from this inspection instance.

## Validation

Real Ubuntu collection completed. Inventory SHA-256 and clipboard overlap
matched. All 10 DEB hashes, approved Node/pnpm and exact Snap bytes verified;
Zod accepted the actual lock; all 14 archive members passed hashes and fixed
metadata checks. No privileged commands executed by Codex.
Last code validation: 2 Python parser tests including 9 negative subcases;
lint 0 errors / 1 existing Fast Refresh warning; all workspace typechecks/build
passed; serial suite 245 files / 1,414 tests passed, 4 files / 4 tests skipped,
623.67 seconds. This continuation assembles reviewed input artifacts and docs;
it does not change runtime implementation or claim live worker acceptance.
