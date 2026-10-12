# Phase 28.5A — AthenaCoder and accepted Engineering dataset

Updated 2026-10-04. Implementation evidence and live acceptance are distinct.
Phase 28.5B comparisons remain **PENDING_LIVE_BASELINE**.

## 1. Executive summary

AthenaCoder is registered in AIRouter, with a reviewed runtime-placement contract,
bounded inference, deterministic eligibility, fallback and owner controls. It is
**disabled in the current deployment**. Accepted Engineering experience derives
from the existing task, integration, validation, independent review and governed
merge records. No training, deployment, paid inference or production mutation was
performed in this implementation continuation.

## 2. Existing architecture reused

AIRouter/provider and model registries, economics, context composition, Phase 27
finite Engineering gateway, FAST/FULL orchestration, signed workspace transport,
integration/candidates, company authentication/CSRF, recent-authentication grants,
audit and PostgreSQL migrations remain the authorities. The dataset is derivative
training material, not a second Engineering execution ledger.

## 3. Base model and runtime

Registered candidate: `athena-coder-qwen25-7b-mac-v1`,
`qwen2.5-coder:7b-instruct-q4_K_M`, Q4_K_M, 32,768 maximum model context.
The [upstream Qwen 7B model](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct)
is Apache-2.0; [Ollama's model catalogue](https://registry.ollama.com/library/qwen2.5-coder/tags)
provides the quantized variant. The 3B alternative was rejected as the initial
candidate after discovering its different research license.

No model was downloaded. Activation requires a server-reviewed SHA-256 digest,
actual memory use, measured p95 latency and success rate. Ollama's installed digest
must match the reviewed artifact. Bare hexadecimal digests from
[Ollama's tags API](https://docs.ollama.com/api/tags) are normalized to `sha256:`;
malformed, unsupported or different digests deny activation. No measurements are
assumed from parameter count.
`MAC_OLLAMA` reuses the existing local runtime; `CLOUD_OPEN_WEIGHT` is an injectable
reviewed backend contract, **not a deployed cloud inference service**.

## 4. AIRouter integration

Provider ID `athena_coder`; CODING only. Existing structured proposal schemas,
context/privacy policy, emergency stop, costs and provider selection apply.
Eligibility is an internal execution option, never a request-body grant.
Registered model/version identity must match the server-reviewed control record.

## 5. Eligibility and risk routing

Initial preference: LOW risk, TRIVIAL/SMALL, explicitly supported routine category,
actual measured latency <= 10 seconds and measured success >= 0.8 under the control
service. Unknown evidence denies preference. HIGH/CRITICAL objectives, auth,
security, tenant isolation, approval and migrations bypass it. Initial production
worker categories are conservative UI, tests and documentation; other work remains
on existing paid routing. No learned routing is implemented.

## 6. FAST Engineering integration

The existing bounded task worker passes trusted eligibility to AIRouter and uses
its ordinary finite capabilities. There is no extra planning/model manager.
Validation failure after an AthenaCoder patch disables local preference for the
remaining task rounds; paid repair receives existing observations and validation
failure context. The task's registered capability set and independent integration
review remain mandatory. A valid local completion does not make a speculative
second paid coding call.

## 7. Repository context and memory

Existing context packages and stable repository memory remain in use. The worker
captures its actual bounded task/context/observation payload during each coding
round. It does not reconstruct old prompts around patches. Whole repositories,
private reasoning and arbitrary model response fields are not collected.
Capture refers to the Engineering input before AIRouter's ordinary provider-boundary
context transformation; AIRouter retains canonical request/attempt trace identities.

## 8. Runtime performance

One active inference for the Mac candidate; 16,000-character prompt and 2,048 output
token bounds, 30-second maximum inference deadline, one-second health deadline.
Concurrency exhaustion fails over rather than accumulating an unbounded queue.
Actual call duration is recorded; cold-load, prompt ingestion and generation timing
remain null when the underlying runtime does not expose evidence. Hardware,
measured memory, local throughput and end-to-end completion are **not measured**.

## 9. Fallback and escalation

Unavailable/offline runtime, mismatched digest, timeout, malformed structured output,
capacity and provider errors return to AIRouter's existing paid policy. Mac offline
is a normal unavailable state; a cloud task does not wait for it to boot. Neither
execution nor the model is installed in every ephemeral EC2 worker. Existing paid
roles/escalation remain configured by AIRouter; this phase does not invent a new
frontier-provider chain or bypass budget/privacy constraints. Luna coding requests
allow the one existing remote attempt needed for the fallback.

## 10. Security boundaries

The model gets no filesystem, shell, Git, secrets, approval, deployment or native
OS authority. Proposals remain untrusted. Protected paths and actual changed-path
review use existing gateway/integration checks. Public model-server endpoints and
caller-selected runtime URLs are not introduced. Reviewed versions/categories and
activation are owner-scoped, authenticated, exact-origin/CSRF guarded and require a
purpose-bound recent-authentication grant. Disable needs ordinary authenticated
mutation guards. Production controls use PostgreSQL; no store means activation denied.

## 11. Dataset architecture

`engineering_dataset_records` stores immutable bounded experience, integration diff,
accepted examples, frozen versions, owner-entered comparison evidence and reversible
exclusions. Mutable repository opt-in policy defaults EXCLUDED. Source IDs resolve
through existing owner/company repositories, objectives, tasks, validations and
integration stores. Migrations are prepared locally, not deployed.

## 12. Dataset quality rules

Only a governed MERGED candidate, matching base/head/workspace, passing validation,
independent exact-head review, completed successful source task, clean actual
experience and an immutable accepted integration diff can produce an example.
Required security review must match. Findings/warnings are conservatively excluded
until a resolved-security-finding contract exists. Rejected, pending, failed,
incomplete/truncated/corrupt or suspect-secret runs cannot become positive examples.
Initial positive targets are mutating tasks; read-only work remains observable
telemetry until a separately reviewed expected-output format exists.
Failed attempts are observable repair telemetry within accepted final examples,
explicitly labelled FAILED, never standalone positive targets.

## 13. Provenance and tenant isolation

Examples retain task/objective/repository/candidate/run/workspace/base/head,
validation/review IDs, author model/provider, input/output tokens and duration.
Repair attempts, files inspected and finite tool actions retain source identity.
Experience keys bind workspace generation as well as task attempt, preventing a
recovered workspace with a reset attempt counter from reusing an older capture.
Raw hidden reasoning is absent by schema. COMPANY_PRIVATE is owner opt-in;
ATHENA_INTERNAL requires the server's self-improvement repository binding.
GLOBAL_SAFE pooling is denied until a separate reviewed publication policy exists.
Private company code is never pooled automatically.

Secret classes mirror Engineering runtime protections and add AWS/JWT/header and
sensitive-path checks. Suspect experience retains opaque provenance/outcome only;
its context/actions/observations are removed before persistence. No secret-masked
patch is silently treated as a correct training target.

## 14. Versioning and snapshots

Version identity is immutable and scoped; retry preserves the first frozen membership.
Example hashes include immutable experience and accepted patch hashes. Export verifies
membership, source hashes, current repository policy, exclusion and secret scanning.
Exclusion/policy revocation denies old-version export while retaining provenance.
Exports are bounded to 16 MiB and authenticated with a dataset-export recent-auth grant.
Empty snapshots explicitly say EMPTY. Tests freeze `dataset-v1`; **no production
training snapshot with real accepted examples exists yet**.

## 15. Continuous distillation hooks

Coding worker capture records actual input and governed observations. Integration
records its already-reviewed bounded diff; governed merge invokes idempotent canonical
collection. Same-key merge recovery can retry collection. Capture failure cannot
undo/replay native work and grants no training eligibility. Multi-task examples
reference the accepted combined integration diff; they do not falsely attribute it
to an independently reconstructed single-task patch.

## 16. Benchmark suite

Fixed registered scenarios cover UI, CRUD, bug fix, tests, refactor, multi-file and
repo conventions, plus deliberate security bypass and the exact carry-over portfolio
request. Starts call existing EngineeringDeliveryService with a repository ID and
idempotency key. Observation reads canonical delivery/task/review data. Codex values
accept OWNER_ENTERED evidence only. The portfolio workload should be reused after
28.4 AWS acceptance without simultaneous infrastructure changes.

## 17. AthenaCoder benchmark results

**PENDING_LIVE_BASELINE**. Fixture/provider tests prove contracts, not model quality,
hardware performance or real Engineering speed. No real open-weight coding patch,
validation/review pass or paid fallback benchmark was run.

## 18. Luna and paid comparison

No live Luna-first cloud baseline exists. No cost savings, ratio or parity claim.
Unknown paid/provider/workspace costs remain null. Existing canonical Engineering
cost totals are labelled unverified accounting evidence, not provider-billing proof.
Dataset paid-model cost is unknown until billing evidence can be joined reliably.
Local Mac API charge zero describes API billing only; compute/workspace cost remains
unknown. Paid cost avoided is null in the read model.

## 19. Speed and cost findings

No measured bottleneck or break-even conclusion is available. Attempt duration,
escalation and winner model are observable; cold/generation/workspace cost may remain
unknown. Existing `firstCodeAt` can be completed-task evidence, so the harness exposes
it as a completion proxy and does not label it a measured first patch. Counts and
milestones unavailable from canonical evidence remain null.

## 20. Real AthenaCoder scenario

Pending reviewed inference runtime/model digest and actual measured eligibility.
No live success is claimed. The existing finite Phase 27 worker integration is
implemented and tested with explicit provider fixtures.

## 21. Real dataset acceptance scenario

Pending a genuinely accepted governed Engineering task in an opted-in repository.
Tests prove accepted/rejected/secret/duplicate/source-hash contracts; fixture examples
are not production training data. Production collection requires migration 0115 and
owner-authorized company policy through authenticated secure setup.

## 22. Failure and recovery tests

Focused checks cover eligible/ineligible routing, malformed output, unavailable
Mac, deadlines, circuit recovery, concurrency/cancellation, disable/version controls,
local-validation paid repair, capture failure, acceptance, rejection, secrets,
tenant scope, immutable dedup/snapshots, revocation, HTTP guards and PostgreSQL retry
behavior. Real runtime shutdown/OOM on actual hardware remains live acceptance.

## 23. Validation

Command logs: `.cache/phase28_5/`.
Android received a canonical model/attempt display projection only, with no new
client routing or authority. Generated Mac build artifacts are
backed up and restored after the required build.

| Gate | Result |
| --- | --- |
| Focused provider/router/control/dataset/worker tests | 8 files, 67 tests passed |
| `pnpm lint` | Passed; 0 errors, 1 existing Fast Refresh warning in EngineeringCredentialSetup.tsx |
| `pnpm typecheck` | All 5 workspace packages passed |
| `pnpm test --no-file-parallelism` | 243 files passed, 4 skipped; 1,400 tests passed, 4 skipped; 425.38 seconds |
| `pnpm build` | Passed; existing web runtime-config/chunk-size warnings |
| Android `:app:testDebugUnitTest :app:assembleDebug` | Passed; 12 suites, 25 tests, 0 failures/errors; 43 Gradle tasks |
| `git diff --check` | Passed |

The focused PostgreSQL integration tests applied migration 0115 to isolated test
schemas and verified durable scope/idempotency. Production migration remains pending.
The four skipped tests are the opt-in Gmail, Stripe, live analytics and live remote
acceptance checks; they are not counted as verified live integrations.
All six backed-up generated Mac artifacts were restored with matching SHA-256 hashes.

## 24. Remaining limitations

No reviewed cloud model backend or activated Mac model; actual memory-pressure
unload/placement performance requires live runtime evidence. Model/runtime circuits
exist; two observed category failures temporarily skip that owner/category for
60 seconds, then eligibility still requires the ordinary reviewed measurements. Corpus pagination/retention beyond the initial bounded store limits
needs a reviewed follow-up before large-scale continuous collection. No production
migration, enablement, export or accepted training run occurred. Some billing and
first-patch metrics remain unavailable; unknown is not zero.

## 25. Phase 28 carry-over

28.4 remains CONDITIONALLY COMPLETE: reviewed AMI unpublished, worker never READY,
no phone-only cloud build, no cloud timing/cost baseline; HTTPS preview deferred.
This implementation does not change EC2 containment or Railway API/web deployment.
28.1–28.3 live carry-over items remain carry-over, not architectural redesign work.

## 26. Handoff

Finish reviewed AMI/EC2 worker and the genuine phone-shaped portfolio baseline.
Review and pin an inference artifact/runtime and measure eligible routine tasks.
Run one actual AthenaCoder task and one accepted frontier-teacher task through the
same canonical flows. Opt in the registered company repository, freeze/export a real
accepted version, then run comparable AthenaCoder-first vs Luna-first workloads.
Only after those measured gates should 28.6 consume a frozen clean version for the
first LoRA/QLoRA experiment and evaluation. No training is implemented here.

## 27. Final verdict

PHASE 28.5 CONDITIONALLY COMPLETE — FIX REMAINING ATHENACODER/DATASET BLOCKERS
