# Phase 28.5B live acceptance — prerequisite blocked

Updated 2026-10-04. Phase 28.5A remains accepted as conditionally complete.
No architecture was redesigned and no LoRA/QLoRA work was started.

## 1. Real AthenaCoder runtime evidence

NOT RUN. No reviewed activated inference artifact, measured memory requirement,
p95 latency or live health evidence has been established. The registered candidate
remains disabled. Provider fixtures are not runtime acceptance evidence.

## 2. Real AthenaCoder task result

NOT RUN. The required genuine cloud baseline is not available. No objective was
started, patch produced, or automatic live fallback claimed in this continuation.

## 3. Real Luna comparison

PENDING_LIVE_BASELINE. Neither comparison task has run.

| Requested metric | Luna-first | AthenaCoder-first |
| --- | --- | --- |
| Provision time | UNKNOWN / not run | UNKNOWN / not run |
| Repository setup time | UNKNOWN / not run | UNKNOWN / not run |
| Model start | UNKNOWN / not run | UNKNOWN / not run |
| First useful patch/completion proxy | UNKNOWN / not run | UNKNOWN / not run |
| Validation | NOT RUN | NOT RUN |
| Independent review | NOT RUN | NOT RUN |
| Total elapsed | UNKNOWN / not run | UNKNOWN / not run |
| Tokens | UNKNOWN / not run | UNKNOWN / not run |
| Paid model cost | UNKNOWN / not run | UNKNOWN / not run |
| Workspace cost | UNKNOWN / not run | UNKNOWN / not run |
| Retries | UNKNOWN / not run | UNKNOWN / not run |
| Owner interventions | UNKNOWN / not run | UNKNOWN / not run |

These are missing observations, not zero measurements. No Codex timing, parity,
cost savings or task speed conclusion is available.

## 4. Real accepted teacher example

NOT RUN. No frontier-model task was accepted and no real record was verified as
TRAINING_ELIGIBLE. Existing source/provenance/quality tests remain implementation
evidence only.

## 5. Real dataset snapshot/export

NOT CREATED. No production repository opt-in, genuine accepted snapshot or export
occurred. Provenance, tenant isolation, secret exclusion, dedup and exclusion
controls have not yet been checked against a newly accepted live teacher record.

## 6. Actual findings and bounded prerequisite repair

Read-only Railway CLI inspection confirms the existing production API/web project
is present. No Railway redeployment or provider permission change was made.
The Athena company page currently presents Owner sign in, so there is no available
authenticated owner browser session for verifying/mutating company references.
No raw secret was requested or exposed; AWS credential contents were not read.

Rebuilding the worker exposed a real packaging defect: tsup emitted shared chunks
that the fixed AMI payload did not include. The worker build now disables splitting.
The packager checks build output metadata and rejects local module dependencies,
missing entries and inconsistent byte counts before assembling the payload.
This is an artifact repair, not a containment change.

Current payload:
`.local/engineering-worker/phase28_4a_ec2/athena-ec2-image-payload.tar`

Current Image Builder payload SHA-256: `2a5c302dc3e1c4875c15b06a0e63ad36e8e5c37eeb879bfc4cd06c717f338689`.
It adds offline local pnpm construction and disables cloud-init SSH key generation;
the previous payload hash is superseded. The primary production path is
`docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md`; the manual runbook is fallback.
All 20 allowlisted regular files and their hashes were verified. The three JS
entry points pass syntax checks. Four negative packaging checks rejected an omitted
chunk, an external relative import, missing output metadata and stale size metadata.
Worker bundle build passed. Focused EC2/provider/evidence/preflight/identity checks:
5 files / 67 tests passed. Logs: `.cache/phase28_5/live-*`.

Repository validation:

| Gate | Result |
| --- | --- |
| Focused EC2/provider/evidence/preflight/identity tests | 5 files, 67 tests passed |
| Negative packaging checks | 4 passed |
| Worker build / 3 JS syntax checks / 20 file hashes | Passed |
| `pnpm lint` | Passed; 0 errors, 1 existing Fast Refresh warning |
| `pnpm typecheck` | All 5 workspace packages passed |
| `pnpm test --no-file-parallelism` | 243 files passed, 4 skipped; 1,400 tests passed, 4 skipped; 451.91 seconds |
| `pnpm build` | Passed; existing web runtime-config/chunk warnings |
| `git diff --check` | Passed |

Skipped tests are the opt-in Gmail, Stripe, live analytics and live remote checks.
No Android code changed, so Android validation was not repeated. Six pre-existing
generated Mac artifacts were restored and hash-verified after the full build.

The payload is **REVIEW_REQUIRED_NOT_AN_AMI**. Its hash is not the sealed runtime
digest, an AMI ID, or live containment evidence. Preview and runtime permissions
remain inactive; no worker is marked READY. The Mac was not used as an Engineering
executor. Local artifact compilation is not a cloud acceptance run.

## 7. Remaining blockers and immediate next action

The first dependency is a reviewed private EC2 worker AMI/root snapshot and pinned
AthenaEngineeringEvidenceV1 document with the actual live image release evidence.
No such IDs/evidence have been supplied or verified in this continuation.

AGENTS.md rule 19 prohibits Codex from performing administrator operations.
The reviewed Linux bake is now performed by AWS Image Builder under a separate
infrastructure build role. The operator deploys/starts the one reviewed stack using
`docs/runbooks/ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md`. The fixed image recipe and
manual fallback remain audit sources; Image Builder success is not live release.
Do not use or broaden the Athena runtime IAM credential to build images.

Immediate operator task: approve immutable base/tooling pins, deploy/start the
Image Builder stack, inspect actual tests and pass the separate live release gate.
After publication, provide only the AMI ID, root snapshot ID, sealed runtime SHA-256 and
SSM document SHA-256. Do not send raw keys. The mandatory real image release gate
must pass before runtime activation or READY. Afterwards verify authenticated company
AWS authority/configuration, canonical repo linkage and AIRouter readiness, then
run Luna-first before activating/measuring AthenaCoder and collecting the teacher.

The existing AWS stack was last reported in prepare mode: runtime permissions were
inactive and worker security-group HTTPS egress targeted loopback only. Reviewed
supervisor/backend and dependency-proxy egress, IAM attachments, finite command
profiles and company AWS reference readiness must be verified before activation.
No unrestricted egress or broader runtime credentials were added to bypass them.

Production migration 0115 and owner-authorized dataset policy/activation still need
their existing secure flows. Secure HTTPS preview remains deferred; Phase 28.4
must not be marked fully verified. No acceptance result is inferred from local tests.

PHASE 28.5 CONDITIONALLY COMPLETE — FIX REMAINING ATHENACODER/DATASET BLOCKERS
