# Phase 28 master handover — implementation, evidence and remaining work

Prepared: **2026-10-05, Asia/Singapore**. Intended reader: a new ChatGPT/Codex conversation continuing this project. This is a consolidated engineering handover, not a release certificate. Read this document before treating older phase reports as current status.

## 1. Authoritative starting position

**Overall Phase 28 is incomplete.** There is substantial implemented and locally tested code across 28.1–28.6. The required production, infrastructure, model, dataset and end-to-end acceptance gates have not all passed. Phase 28.4 and 28.5 remain **CONDITIONALLY COMPLETE**. Phase 28.6 is **CONDITIONALLY COMPLETE — FIX REMAINING LIVE/HARDENING BLOCKERS**. Do not start Phase 29.

The most consequential missing evidence is:

1. No reviewed, released Athena Engineering EC2 AMI/root snapshot and live release evidence.
2. No genuinely contained, trusted cloud worker has reached Athena **READY**.
3. No genuine Luna-first cloud Engineering baseline.
4. No real AthenaCoder-first comparison or accepted real AthenaCoder coding task.
5. No genuine accepted teacher example and real frozen training dataset/export.
6. No real LoRA/QLoRA fit, produced release adapter, independently evaluated trained release, or activated trained version.
7. No accepted phone-accessible HTTPS preview and complete phone-only cloud build.
8. No completed live acceptance of the final five Phase 28 scenarios.
9. No owner-entered comparable Codex timing/cost evidence.
10. No current proof that the newest local code, dependency patch and migrations 0115/0116 are deployed in production.

The user originally reported Image Builder `1.0.4/1`: build component passed, seal component failed at `validate → VerifyBuildImage`; `1.0.4/2` was last reported **BUILDING**. The original repair chat subsequently prepared recipe **1.0.5**, which reapplies SSH masks after package purge. Its latest available chat summary still says the **live 1.0.5 result is pending**. This handover did not query AWS and does not assert the current status of either build. Build success alone would still leave the separate live image release gate outstanding.

### Evidence vocabulary

| Label | Meaning here |
| --- | --- |
| IMPLEMENTED | Mechanism exists in repository source; see relevant tests and limitations. |
| LIVE VERIFIED | A genuine external/deployed observation was recorded, within its stated scope. |
| CONDITIONALLY VERIFIED | Local, synthetic, sandbox or isolated integration checks passed; live prerequisites remain. |
| BLOCKED | Required reviewed infrastructure, identity, credential, dataset or runtime is absent/unverified. |
| NOT RUN | The action/scenario did not run; there is no result to infer. |
| UNKNOWN | Measurement or current state is unavailable. It is not zero, PASS or READY. |

## 2. Repository and conversation continuity

- Workspace: `/Users/arjunaravapalli/personalassistant/personalassistant`.
- Git HEAD at handover: `279f131dc88d5f45d6a0d69566d56411248b74a3`.
- There are **161 dirty/untracked status entries** at inspection. This includes earlier-phase work, generated artifacts and Phase 28 additions. The handover files themselves add entries after that observation. Do not attribute the entire working tree to 28.6.
- Much Phase 28 source and documentation is untracked. A local passing build does not imply those files are committed, pushed, available in a fresh clone, or deployed. Preserve the current checkout and inspect `git status`/diff before editing.
- Original infrastructure/runtime repair chat: **“Build universal tool runtime”**, Codex thread `01a0f080-1479-7aa2-a2b1-af55ccfed88a`, same repository.
- The original chat owns ongoing Image Builder/EC2/runtime repairs. This 28.6 work intentionally avoided editing its Image Builder, EC2 worker and Mac runtime repair source. Coordinate overlapping source, shared contracts, dependency/lockfile and production changes. Do not overwrite a concurrent repair.
- No commit or production deployment was made by the 28.6 implementation continuation. Older 28.4A production actions are separate and recorded below.

The original chronological [PHASE_28_HANDOFF.md](PHASE_28_HANDOFF.md) is valuable history but has appended sections with stale statements below newer ones. It contains historical assertions such as “28.6 not started,” missing credentials, and outstanding 0110–0114 migrations. Those statements must be read in their original date/context. This report supersedes them as a consolidated continuation summary; it does not rewrite the original chat’s log.

The supplied Phase 28.6 brief was pasted at `/Users/arjunaravapalli/.codex/attachments/23c62da0-e682-4410-a64d-42a7865cbeaa/Pasted text.txt`. **No separate Phase 28 PDF was supplied/read in this implementation chat.** Do not claim exhaustive verification against an unseen PDF. If further PDF requirements are introduced, reconcile them explicitly with the implemented scope.

## 3. Security rules that the next chat must preserve

Read repository `AGENTS.md` and relevant phase/runbook documentation before modifying code. The foundation is security sensitive: deny everything by default; allow only explicitly registered devices, applications, workspaces, tools and actions.

The critical continuing boundaries are:

- TypeScript strict mode, shared schemas and Zod validation at external boundaries. Reuse existing contracts and services.
- No arbitrary shell, filesystem, executable-path, application-launch, native invocation or generic HTTP executor endpoints. AI-generated shell text is never executed by the product.
- Tool definitions declare input/output, risk and approval. Identity, trust, company scope, risk, approval, provider health and network authority come from server-owned state, never the client/model.
- Unknown tools, missing policy context and inconsistent governance deny. A policy ALLOW alone is not execution permission: exact reviewed grants and existing execution paths remain mandatory.
- High-risk work requires real recent authentication, bound to session and purpose. Login is not recent authentication. Voice, gestures and ordinary sessions cannot independently approve high-risk work.
- Candidate creation is separate from merge. Training is separate from deployment. Training completion is separate from promotion. Model/tool performance cannot weaken auth, signing, tenant isolation, approval, audit or protected-path controls.
- Permanent deletion, `sudo`/administrator operations and unreviewed privileged actions remain prohibited. AWS Image Builder executes reviewed bake recipes under a separate infrastructure role; Codex does not execute those privileged bake commands itself.
- No raw secrets, cookies, tokens, keys, sensitive arguments, hidden reasoning or credential material in logs, audits, prompts or reports. Do not read/print `.env` values to continue this task. Secret locators are not secret values and belong only in approved configuration contexts.
- No production fallback to in-memory stores or unknown/test network verifiers. Exact trusted origins, CSRF, private-network checks and renderer isolation remain active.
- Keep emergency stop, cancellation, replay protection, signature/nonce/expiry checks and indeterminate-outcome handling intact. Do not retry an uncertain external write just to make a scenario pass.
- Camera/audio/pixel/raw input restrictions and all existing native/semantic governance remain in force. Phase 28 adds no bypass around them.
- All source changes require the repository’s typecheck, lint, tests and build, with appropriate focused checks. Restore/preserve pre-existing generated Mac artifacts rather than overwriting unrelated work.
- Before production migration/deployment, coordinate ownership, validate the actual environment, reconcile migration history and document backup/forward recovery.

## 4. Architecture: how Phase 28 fits the existing system

Phase 28 extends the existing Athena architecture. It does not introduce a second autonomous executor, approval service, task ledger, accounting ledger, memory database or native transport.

The canonical business/Engineering flow is:

`authenticated owner/company objective → existing Objective/Workforce/Agent OS → Marketing or Engineering delivery → deterministic FAST/FULL orchestration → AIRouter → structured untrusted proposals → registered finite capabilities → existing policy/approval/grants → signed execution/provider path → validation → independent review → reviewable candidate → governed owner merge`.

For Mac/native work, the existing server-signed envelope and trusted Mac Agent remain the channel. For portable cloud work, a scoped, attested cloud worker reuses the signed channel and finite Engineering runtime. It may not silently use the owner’s Mac when cloud prerequisites are missing.

The learning chain is derivative:

`accepted governed merge + actual task experience + exact validation/review → opted-in source-verified example → immutable frozen dataset → deterministic preparation/splits → finite offline fitting → immutable adapter identity → genuine independent benchmarks → promotion decision → governed activation → measured later outcomes`.

The phone is a command/control/read surface. It does not choose a trusted executor, grant permissions, approve through ordinary gestures/voice, or supply routing authority. Historical telemetry and model output are evidence/data, never policy authority.

## 5. Phase-by-phase status map

| Subphase | Developed | Remaining to satisfy acceptance |
| --- | --- | --- |
| 28.1 Universal Tool Runtime | Shared tool/provider/review/receipt contracts; durable gateway; remote MCP; exact onboarding/review/activation; finite delegated adapters; telemetry/benchmarks. | Live GA4, signed approved Mac invocation, wider write reconciliation, reviewed local MCP supervisor, current production rollout verification. |
| 28.2 Marketing/Brand/Creative | Campaign DAG/coordinator, Workforce integration, exact artifact approval, approved brand memory, receipt recovery, Engineering landing-page linkage, review package and economics. | Real creative provider/handler/reconciliation; live campaign/landing page; regulated-claim review path; genuine speed/cost acceptance. |
| 28.3 Self-improvement | Canonical SELF_IMPROVEMENT delivery, deterministic risk/FAST/FULL, protected self-repository guards, independent review, exact candidate/merge controls, accepted-memory/evidence. | Actual Athena-built self-change, configured live binding, measured workload series and owner comparison; some optimization/atomicity gaps. |
| 28.4 Mobile/cloud | Android Engineering center, finite GitHub operations, bounded inputs, cloud placement, signed Linux worker; 28.4A provider/provision/clone/preview infrastructure and EC2 image path. | Reviewed AMI release, READY workload, activation prerequisites, real phone/cloud build, HTTPS preview, baseline, cache/lifecycle/usage gaps. |
| 28.5 AthenaCoder/dataset | Disabled registered coder, deterministic eligibility/fallback/control, actual experience capture, accepted-example provenance, opt-in/frozen export, benchmark catalogue. | Activated reviewed inference runtime, genuine local/fallback tasks, teacher, production dataset/export, Luna comparison, real hardware/costs. |
| 28.6 Distillation/hardening | Preparation, finite LoRA/QLoRA runner, durable version lifecycle, evaluation policy, routing/tool evidence, feedback lineage, MCP/source/migration/dependency hardening. | Reviewed trainer/base/dependencies and runtime conversion/binding, real training/evaluation/promotion/rollback, production rollout and A–E scenarios. |

### 5.1 Universal Tool Runtime — 28.1

The `UniversalToolGateway` resolves a persisted registered definition, validates bounded arguments against a conservative JSON Schema subset, resolves injected server-owned authority, reserves/claims a receipt, dispatches through a registered adapter, bounds/validates output and audits the result. Discovery starts disabled. Selection and invocation both check current provider status/health. A crashed claimed receipt is not blindly replayed.

Authenticated company-scoped `/api/universal-tools` onboarding can register an exact reviewed HTTPS endpoint, discover disabled tools, match a server-owned reviewed manifest to exact schema/provider version and activate. Company credential readiness and server secret resolution are required. The model never receives credentials. Remote MCP is allowlisted HTTPS, with no URL credentials, arbitrary ports or redirects.

Finite adapters include `analytics:read_metric`, `athena.native:provider_health`, and explicitly approved `athena.native:focus_vscode`. Analytics delegates to the existing business runtime; native actions delegate to the reviewed native dispatcher and signed Mac Agent. VS Code focus succeeds only after signed semantic verification. Delayed results remain indeterminate and can reconcile the exact native action without another dispatch.

Writes require idempotency plus a reviewed reconciliation contract. Other generic universal writes remain denied. Local MCP production activation remains disabled because a reviewed supervisor is missing. Broader write reconciliation is unfinished; do not enable it by removing the declaration check.

Recorded evidence: an opt-in DeepWiki read passed through an authenticated production-shaped route and PostgreSQL receipt; latest recorded route/receipt latency 1,096.2/1,036 ms. It used test session/governance storage, **not a deployed production owner invocation**. Analytics and native contract tests passed; live GA4 and approved real VS Code invocation remain open. The September 30 in-process benchmark uses fake/local paths and excludes PostgreSQL, network and inference. It is not a Codex or production speed comparison.

### 5.2 Marketing, Brand and Creative — 28.2

Company-scoped campaigns reuse existing Objectives, bounded deliverable DAG, Workforce, Agent OS, AIRouter, Tool Gateway, Engineering, memory and audit. Eight logical roles are orchestration roles, not resident model processes. Campaign/Objective creation shares the existing transaction/advisory lock; audit failure rolls both back.

Autonomous progression uses Workforce/Engineering lifecycle events and existing durable scheduler recovery. Server-owned session authority is revalidated for expiry, membership, private network and emergency stop. Structured specialist completion becomes an artifact directly; small campaigns retain direct bounded drafts. Analytics windows/calendar ambiguities require clarification.

Artifacts move through DRAFT, IN_REVIEW, APPROVED/REJECTED and SUPERSEDED. Exact artifact/version/content/company/campaign/Objective/session evidence binds approval. New content invalidates old approval. Only current approved stable brand facts enter existing company memory; retrieval rechecks source/version/digest/content and excludes drafts, rejected/superseded and cross-company records.

Creative writes persist their exact claim/invocation before Gateway execution. Recovery reuses a verified receipt or queries that same provider receipt. Missing/unknown/inconsistent outcomes require owner review, with no blind retry/provider switch. Cancellation cannot recall work already accepted externally. Landing pages use registered Engineering repositories; a private preview is not public publishing authority.

**Unfinished software/integration:** no reviewed production image/video/design handler is available. Implement a finite declared handler, exact reviewed manifest, company credential and provider-idempotent receipt reconciliation following [marketing-production-acceptance.md](marketing-production-acceptance.md). Known-safe automatic write retry is not implemented. Sensitive regulated claims remain blocked until a stronger registered review path exists. Perfect campaign budget enforcement and realtime dashboard polish were not added; dashboard uses 15-second polling.

Coordinated sandbox tests included real Gateway plumbing with sandbox creative/analytics handlers, structured Workforce, exact approval, mock Engineering preview and persisted review-only package. They do not prove a real campaign or real asset generation. Publishing, paid ads and public activation remain unavailable. Some tool/retry/intervention counters are null because source records do not supply them.

### 5.3 Self-improvement — 28.3

SELF_IMPROVEMENT is a canonical Engineering intent with server-owned risk, FAST/FULL mode, relative targets and request digest. It requires an ACTIVE configured owner/company Athena repository. Generic Engineering creation on that self-repository is denied unless it uses this path.

Risk considers request, acceptance criteria, protected/actual changed paths and authority patterns; implementation/prepared/repair paths are rechecked. High-risk work selects FULL/strong review. Scope follow-ups cannot quietly expand authority risk. FAST uses one coding task plus independent integration review; FULL reuses the existing bounded DAG.

Source/patch/worktree/Git/validation operations use existing finite signed capabilities. Fresh final combined-head validation and independent review are required. HIGH/CRITICAL self-candidates require lint, typecheck, tests and build plus applicable security review. Candidate creation cannot merge/deploy/restart Athena. Merge rechecks protected-path risk and exact canonical owner approval.

Self-change artifacts enter stable memory only after exact governed MERGED head, fresh validation and passing independent review. Creation is transactional/idempotent; stale planning blocks for owner Resume. Existing leases/worktrees preserve recovery evidence.

**Not run:** an actual “add this feature to yourself” Engineering objective. Earlier inspection found no configured Athena binding and an offline local API; only Trial/Portfolio projects were identified. Current live binding must be rechecked. Manual Codex implementation of Phase 28 features does not count as Athena self-improvement acceptance.

**Remaining:** real safe self-change, three trivial/three small/two medium measured runs, comparable owner-entered Codex record and production readiness. Automatic affected-command discovery is absent; targeted checks are registered-profile/model selected. Stable-memory sequential dedup exists, but concurrent cross-process promotion atomicity was not proven.

### 5.4 Android Engineering and cloud workspace — 28.4/28.4A

Android Engineering exposes active/completed/history, projects/repositories, previews, approvals, search, agents/progress, validation/blockers/review and known model costs. Offline state is explicit; mutations disable. Trusted-device/company/session-scoped encrypted cache clears sensitive projections on lock/logout/revocation/company switch. Existing foreground signed poll carries bounded revision invalidation; this is not a new push/SSE system.

GitHub finite list/register/create and later prepare-workspace handlers use exact reviewed provider, company READY credential/binding, permission, recent authentication for high-risk mutations, approval, audit and idempotent claims. A remote repository association is not a runnable canonical repository. No arbitrary clone URL/token/executable endpoint exists. Provider-backed preparation resolves exact authorized origin/commit and canonical workspace.

Bounded Android inputs accept PNG/JPEG up to 256 KiB or TXT/Markdown up to 16 KiB, with 12 files/1 MiB per objective. API checks scope, MIME/signature, filename, encoding, secrets and immutable receipt. PostgreSQL serializes quotas on Objective rows. Text context is bounded/labeled untrusted; image bytes stay out of normal model context. **Mockup image interpretation is not implemented/claimed.**

The cloud provider/provisioning layer owns infrastructure state, not Engineering authority. Claims are scoped/CAS/idempotent; uncertain creates reconcile before repeat. READY requires exact scoped bootstrap proof, nonce, base commit, signed preparation and audit. A provider RUNNING VM is insufficient.

The Linux worker reuses finite Engineering capabilities and signed envelope/lifecycle/result transport. Workload identity binds owner/company/repository/workspace/generation and unexpired server-issued lease. Public CLOUD_WORKER pairing is rejected. Signing input is ephemeral/non-extractable with exact reviewed pin; broad AWS/GitHub/provider credentials do not enter workers or model prompts.

Resource contract: **≤2 CPU, ≤4096 MiB RAM, ≤10240 MiB writable disk, ≤512 total processes, 3600-second hard runtime, 300-second idle limit**, reviewed child bounds, trusted signer/supervisor separation, network-isolated validation, restricted dependency egress and exact preview ingress. Repository-controlled package/test code must not share authority with signer/config/grants. A config label, checkpoint name or Docker installation is not containment evidence.

The reviewed read-only Git smart-HTTP broker permits refs/upload-pack only, bounded responses, no redirects, short-lived exact workspace credential, hooks/submodules disabled and exact clean HEAD verification. It never writes broad credentials into Git configuration.

Preview code has fixed local ports (app 4173, registered ingress 8080), owner capability/hash, tenant/workspace/generation binding, secure HttpOnly cookie, TTL/revocation, GET/HEAD-only proxy, stripping credentials/forwarding headers and external health gate. Android opens only RUNNING/PASS/unexpired HTTPS. **No genuine HTTPS preview acceptance exists.** Older 28.4A notes also leave durable separate preview state and completion/cancellation cleanup open; re-audit current EC2 code before deciding whether closure is software work or only acceptance.

Remaining software/validation gaps include provider-backed company lockfile/version-aware package caches and repo mirror optimization; automatic replacement/reconstruction/recovery; fully verified independent expiration cleanup; complete milestone instrumentation and provider metering. Cold clone and ephemeral dependency installation are current conservative behavior. Inspect current code before carrying forward older provider-specific gaps unchanged.

### 5.5 AthenaCoder and accepted Engineering dataset — 28.5A/28.5B

Registered candidate: `athena-coder-qwen25-7b-mac-v1`, Ollama `qwen2.5-coder:7b-instruct-q4_K_M`, provider `athena_coder`, CODING only. It is disabled/unaccepted. No model download occurred in this implementation. The 7B upstream candidate was selected with its recorded Apache-2.0 license; the 3B initial alternative was rejected for a different research license. Recheck exact artifact/license at actual procurement.

MAC_OLLAMA reuses the local runtime. CLOUD_OPEN_WEIGHT is an injectable reviewed contract, **not a deployed inference service**. No public or caller-selected model endpoint exists. The coder is not installed in every ephemeral EC2 worker. Mac offline is a normal unavailable state and cloud work must not wait indefinitely for it.

Deterministic initial eligibility requires LOW risk, TRIVIAL/SMALL, supported routine category, reviewed exact digest, measured latency ≤10 seconds and success ≥0.8. Initial worker categories are conservative UI/tests/documentation. HIGH/CRITICAL, auth, security, governance, tenant, signing, approval and migrations bypass local preference regardless of past performance. Existing paid routing/escalation and budget/privacy policy stay authoritative.

Inference bounds include one active Mac call, 16,000-character prompt, 2,048 output tokens, 30-second deadline, one-second health deadline. Capacity, unavailable runtime, digest mismatch, malformed structured output, timeout and errors fall back through AIRouter. A failed Athena patch validation disables local preference for remaining task rounds; paid repair receives canonical failure context. Valid local completion does not force a speculative second paid coding call.

Actual task experience is captured during bounded coding rounds with canonical request/attempt identity. No reconstructed old prompts, whole repository dumps or hidden chain-of-thought. Final accepted dataset requires governed MERGED candidate, exact base/head/workspace, completed successful task, passing validation and independent exact-head review/security review, clean experience and immutable integration diff. Failed final/rejected/incomplete/truncated/corrupt/secret records cannot be positive examples. Repair attempts may appear only as labeled FAILED history within accepted final examples. Multi-task targets retain accepted combined-diff provenance.

Repository collection defaults EXCLUDED. COMPANY_PRIVATE is owner opt-in; ATHENA_INTERNAL requires the server’s self-repository binding; GLOBAL_SAFE pooling is denied pending separate publication policy. Policy revocation/exclusion blocks old snapshot export and later eligibility. Secret suspect experience retains opaque provenance/outcome only. A masked secret patch is not silently made a correct training target.

Frozen membership and source hashes are immutable/deduplicated. Export rechecks policy, exclusion, hashes and secrets; bound 16 MiB, authenticated dataset-export recent-auth grant. Fixtures freeze `dataset-v1`; **no real production training snapshot exists**. Corpus pagination/retention beyond initial bounded limits needs follow-up before large-scale collection.

Benchmarks reuse fixed scenarios for UI, CRUD, bugfix, tests, refactor, multi-file, conventions and security bypass. Owner Codex comparison accepts OWNER_ENTERED evidence only. First-code telemetry can be a completed-task proxy, not true measured first patch. Real local memory/OOM/unload, throughput, generation phases, completion speed and compute costs are unknown.

### 5.6 Distillation, evidence and final hardening — 28.6

The implementation supports **one general Qwen2-family Engineering adapter**. Specialized React/backend/Android/security/Quant adapters are not required and were not built.

Preparation consumes a verified frozen dataset export, recollects canonical accepted sources, filters/deduplicates bounded examples and splits **whole Objective groups** deterministically by seed. At least three independent groups are needed for train/validation/evaluation. Final reviewed patch targets exclude hidden reasoning/tool observations; raw export is not stored in the new run table. Preparation retains dataset/base/manifest/config identity.

Durable run states include PREPARING, PENDING_REAL_DATASET, PREPARED, TRAINING, TRAINER_UNAVAILABLE, TRAINED, FAILED, CANCELLED and INDETERMINATE. CAS/idempotent claims and audit share existing transactions. Source revalidation occurs before/after fitting. Expired uncertain training becomes INDETERMINATE rather than replay. One-hour deadline and emergency-stop/cancel checks abort the reviewed host; that host must terminate the job and descendants.

The Python runner implements offline LoRA and CUDA NF4 QLoRA, fixed q/k/v/o attention projections, safetensors loading, no remote custom model code, masked input loss, final patch targets, held-out validation and no target truncation. Evaluation split is never fitted. Fixed mounts: `/training/input/job.json`, `/training/base`, `/training/output`, `/training/cache`. Non-root Docker recipe requires reviewed pinned base image, offline wheels and hash-locked compatible requirements. None of those deployment inputs is fabricated/downloaded automatically.

**Crucial incomplete binding:** default production composition has no reviewed training bases, trainer or evaluator. Production operations fail closed as applicable. A concrete finite fitting script exists; a reviewed real trainer host/transport, containment, dependency set, candidate conversion/import and inference binding still need implementation/review/configuration. Do not describe the whole live training service as enabled. No real fitting or training-container build ran.

Training base is unquantized local safetensors, distinct from Q4 Ollama inference. Base/adapter inventory identity is SHA-256 of canonical sorted `{name,digest}` members; file digests bind exact bytes. A generated `result.json` alone is not trusted artifact provenance or promotion authority.

Version records retain dataset/base/adapter/config, seed, training time/hardware/runtime/duration/loss/nullable cost, evaluation suite/results, activation/rollout/rollback/retirement and scope. Register/evaluate/compare/activate/deactivate/rollback/retire/cancel/recover mechanisms exist. Activation reuses AthenaCoder control/model registry under existing unit of work, with exact run/owner/company/base/adapter/inference binding. Existing controls are owner-wide, so one active trained version per owner; cross-company conflicts deny. Generic role assignment or ordinary control mutation cannot activate a trained version. Runtime eligibility rechecks source policy/current activation.

Owner-wide ordinary authenticated **DISABLE remains possible even when model inventory is unavailable, removed or mismatched**. This is a final revocation repair; security stop must not depend on model health.

Evaluation projects canonical Engineering deliveries, validations, independent review and exact attempts. Eight categories are required. Candidate cases must postdate training and carry exact server-stamped distillation run/model/inference identity. Delivery reuse/mismatched workloads/scopes/artifacts deny. The inherited benchmark field `taskId` is a delivery/workload ID; actual task IDs remain in manager projections. Scores cannot be uploaded by the client/model.

Promotion requires **REAL** evidence, at least eight independent/category-covered cases, ≥90% pass rate, zero quality regressions, safety coverage and ≤1.5× measured baseline end-to-end time. Genuine Luna baseline is mandatory; an existing active trained version also needs a correctly bound comparison. Paid fallback is not a local pass. Unknown/zero baseline duration denies performance acceptance. Security scenario requires high-risk read-only Sol routing, no AthenaCoder attempts and no changed files. Loss alone never promotes.

Routing Evidence reads latest 100 owner/company Objectives, grouping model/category/repository class with outcomes, validation/review, attempts/escalation/retries, durations and nullable costs. Strong cohorts require ≥30 samples and Wilson lower confidence ≥0.8. Even strong evidence has no automatic routing authority. **Learned routing is not enabled; no shadow experiment/result was implemented.** Deterministic risk policy stays authoritative.

Tool Intelligence uses server-stamped version/schema/category/environment and current scoped receipts. Strong measured preference requires ≥20 reviewed samples, ≥90% acceptance and ≤10% failure; otherwise deterministic ordering. Known costs are kept per currency with unknown coverage. Exact credential/handler/policy preflight restricts executable recommendations to finite authorized reads with none/session approval. Explicit-approval writes are proposals. Preflight grants are discarded; real invocation needs a fresh exact grant. Creative selection consumes preference within the existing Gateway boundary.

Feedback lineage links Objective/task/candidate/validation/review/merge/example → frozen dataset → run/version → evaluation/activation → later canonical outcomes. It stores links/derivative state, not a second execution ledger. There is no autonomous merge, promotion or evidence-based routing expansion.

## 6. Infrastructure history and current EC2 continuation

### 6.1 What was genuinely observed earlier

October 4 reports record production migrations **0110–0114 applied**, 116 total/zero pending at that time, an API-only rollout `ff53e14d-555e-47e0-892f-31a65f6d5362`, and HTTP 200 public/private health. Existing Railway project is `modest-clarity`; API service is `personalassistant`. Later frontend fixes/setup rollouts are recorded in 28.4A. These are historical deployment observations, **not proof the newest 28.5/28.6 code is deployed today**.

GitHub and Railway server secret presence/access and owner-authorized company references/bindings were verified historically. Default Company: `c2ac447f-0747-4b78-80f1-2cc4fff8d82f`. Selected acceptance repo: `arjun-ven12/personalassistant`, GitHub ID `1312934774`. At that earlier observation there were zero canonical GitHub registrations and twelve ACTIVE command profiles. Recheck current records; never select an arbitrary profile or directly manufacture trust/READY rows.

Railway VM probes were real and were destroyed. The isolation audit found insufficient exposed writable-disk/PID and signer-versus-repository-code separation controls for the current adapter. Observed service process ceiling 1000 is above required 512; Sandbox effective limits were not established. Checkpoints do not prove boot-time containment or hard lifetime. The retained verdict is **RAILWAY_INSUFFICIENT_FOR_REQUIRED_WORKER_ISOLATION** for the inspected controls/design, not a universal claim about all future Railway capabilities.

Keep existing Railway API/web. The selected continuation for workers is EC2; do not restart a Railway checkpoint-only activation plan or weaken preflight. Equivalent provider-native isolation could replace Docker only after review and concrete enforcement evidence.

### 6.2 EC2 image production and repair chronology

AWS account `737073451069`, region `ap-southeast-1`. The retry stack is `athena-engineering-image-builder-r3`; generic runbooks still use initial stack names/default versions. Latest chronological repair guidance takes precedence after reviewing actual stack parameters.

| Step | What the records establish | What it does not establish |
| --- | --- | --- |
| Exact input review | Owner supplied official Ubuntu metadata/inventory and approved immutable pins. | Runtime release or blanket deployment authority. |
| Component parser repair | Literal Docker Go-template braces conflicted with AWSTOE parameter syntax; finite equivalent repaired. | Any successful image bake. |
| Pipeline repair | AWS minimum image test timeout required 60; property corrected. | Relaxed runtime hard lifetime. |
| Instance selection | Account rejected t3.medium; owner described c7i-flex.large as eligible, 2 CPU/4096 MiB x86_64. | Free ongoing workload cost or resource attestation. |
| SSM connectivity | Builder lacked public IP; dedicated builder subnet/network prepared, separate from private runtime/preview. | Trusted workload or broader runtime egress. |
| Recipe 1.0.3 | Owner logs show SSM execution/download/package install; official Node archive root entry wrongly denied; exact directory guard repaired. | Sealed/released runtime. |
| Recipe 1.0.4 | SSH purge dependency/probe bugs repaired; preserve required openssh-client dependency while remove SSH server/SFTP/EC2 Instance Connect, masks/no daemon/listener checks. | Seal acceptance: 1.0.4/1 failed VerifyBuildImage. |
| Recipe 1.0.5 | Reapply/verify masks after maintainer scripts/package purge; fixed handling of masked systemctl status. Focused/full local checks passed. | Latest live result remains pending in available chat context. |

The prepared latest Console update is `deploy/engineering-worker/aws/image-builder/image-builder.console-mask-fix.json`, RecipeVersion **1.0.5**, keep current **revision04** inputs and all other reviewed parameters. This is continuation context, not a command to apply blindly. First inspect actual stack/pipeline/build/log state and obtain the original repair chat’s latest result. Do not rerun an already-running build, recreate an existing stack or reuse immutable component versions after source changes.

Owner input approval record: `deploy/engineering-worker/aws/image-builder/evidence/owner-input-approval-20261005.json`:

| Pin | Reviewed value |
| --- | --- |
| Base AMI | `ami-0ba4172b23e57d5a8`, Canonical owner `099720109477`, 2026-09-04T11:46:06.000Z |
| SSM | Snap `3.3.4793.0`, revision `13349`, exact archive/hold evidence in register |
| Kernel ABI | `7.0.0-1014-aws` |
| Inventory SHA-256 | `7f1f1e5a2cd3ed6bd4f68e7232557904457224ef219854e74471d4e74e669b85` |
| Lock SHA-256 | `5ee9e7ed7d480fea8b10adc04441c3fc38b748b76a0ba81e68473108d9e0dc36` |
| Tooling SHA-256 | `e09a2555ecaaaa2145ec2c7656f4e60a012295bca420275c09ec99326e59ba13` |
| Approved Snap-compatible payload SHA-256 | `658679b5b50d86dc85f4ba73f66ed54021e13a486d365a6ab8d58972f7bed28e` |

The older payload `2a5c302d…` in 28.5B is historical; do not substitute it for the approved Snap-compatible current inputs. Approval record explicitly says input pins only, `deploymentAuthorizedByThisRecord: false`, runtime/preview false and release pending. Pins may be historical if a newer reviewed revision exists; validate actual bytes/current approval before use.

Builder-only subnet: `10.84.0.128/26`, public IPv4 in Singapore zone, isolated from runtime `10.84.0.0/26` and preview `10.84.0.64/26` whose public-IP assignment stays false. Build role/service-linked role, SG and permissions are distinct from runtime worker/reaper roles. Build networking and root package installation do not become task/network authority. Do not broaden runtime IAM or attach AdministratorAccess to resolve infrastructure failures.

### 6.3 What must happen after a successful bake

1. Inspect actual build/seal/test results and independent live release gate; success must bind exact image/root snapshot/runtime/document identities, resources, boot-time containment and safe finite probe results.
2. Capture only bounded AMI ID, root snapshot ID, sealed runtime digest and SSM evidence document digest/status. A payload tar hash is not a sealed runtime digest, AMI ID or containment evidence.
3. Verify encrypted root, private image, no SSH server/listener, pinned tooling/execution images, signer separation, actual quotas/network and hard cleanup. Keep the release gate fail closed for unknown properties.
4. Review exact company AWS credential/binding, runtime configuration, supervisor/backend/dependency proxy egress, IAM attachment, finite command profile and registered repository linkage. Historical prepare mode had runtime permissions inactive and HTTPS egress loopback-only. Recheck, do not bypass.
5. Activate only the reviewed runtime through existing owner/governance/config paths; obtain scoped signed handshake, exact prepared clean commit and actual READY evidence.
6. Run genuine Luna-first portable workload before changing model routing. Add accepted HTTPS preview/Android scenario; record actual milestones and unknown costs honestly.

Use the current [Image Builder runbook](runbooks/ATHENA_EC2_IMAGE_BUILDER_RUNBOOK.md), [input approval register](runbooks/ATHENA_EC2_IMAGE_BUILDER_INPUT_APPROVAL.md), [inspection guide](runbooks/ATHENA_EC2_INPUT_INSPECTION.md) and [manual fallback/audit runbook](runbooks/ATHENA_EC2_AMI_OPERATOR_RUNBOOK.md). Do not execute administrator bake operations through Codex.

## 7. Hardening findings and fixes

| Area | Current authority / tested repair | Remaining limitation |
| --- | --- | --- |
| MCP transport | Allowlisted HTTPS; schema and bounded output; response capped at 65,536 bytes while streaming, including initialization; text bounded at 16,384. | Real remote outage/recovery and provider activation require live runs. |
| MCP session abuse | Visible ASCII session ID ≤256, five-minute TTL, bounded 128 sessions/initializations, dedup and tenant/provider-scoped invalidation. | Not proof of every external server’s availability. |
| Credential output | Scan structured/text provider output before client/model/receipt exposure; suspected leak yields INDETERMINATE/no output. | Conservative canary tests; no raw real secrets used. |
| Dataset secrets | Actual nested strings checked as well as serialization; quoted assignment bug repaired. Suspect data is not positive training target. | Production corpus still absent. |
| Saved source mutation | Recollect/revalidate canonical source rather than trusting saved accepted example after source changes. | Real merge/source lifecycle acceptance pending. |
| Model artifact/activation | Exact runtime/base/adapter/inference/run/scope identity; source policy rechecked; generic activation denied. | Real model loader/conversion/baselines unavailable. |
| Revocation | DISABLE no longer depends on model inventory/health. | Real active-model rollback/stop still not run. |
| SQL identity | Forward 0116 fixes nullable JSON CHECK expressions that could accept missing fields; applied 0115 source not rewritten. | Existing production rows need preflight against new constraints. |
| Migration integrity | SHA-256 exact SQL, known applied lineage, explicit legacy digest adoption, mismatch/unknown version deny. | Historical production checksum/recovery review required. |
| Dependency inventory | Coordinated narrow `@grpc/grpc-js` override 1.14.4 → 1.14.5; prior lock entries preserved except exact affected identities/references. Audit now zero known production advisories. | Production deployment not run; audit is not proof of no vulnerabilities. |
| Self-modification | Server risk/protected paths, stronger review, exact candidate/merge authority unchanged. | Actual safe self-change acceptance missing. |
| Cloud/GitHub/preview | Existing finite auth/containment/generation/signature/replay/expiry gates retained; runtime repair source not modified by 28.6. | No live released image/READY/HTTPS acceptance. |
| Cost/status/Android | Existing canonical read models, scoped receipts and ledger; null/unknown retained. | Genuine multi-device latency/billing and provider cost reconciliation missing. |

The dependency advisories were inventory findings, not demonstrated exploitable server paths; source currently uses HTTP telemetry exporter. Maintainer references are linked in [28.6 report](PHASE_28_6_REPORT.md). No security control was removed to make acceptance green.

## 8. Production migrations, deployment and recovery

| Migration | Purpose | Production evidence at handover |
| --- | --- | --- |
| 0110_phase_28_1_universal_tools.sql | Providers/tools/receipts | October 4 report says applied; current state must be reread. |
| 0111_phase_28_1_tool_reviews.sql | Exact tool reviews | Same historical applied record. |
| 0112_phase_28_2_marketing.sql | Campaign/artifact storage | Same historical applied record. |
| 0113_phase_28_4_github_repositories.sql | GitHub canonical association | Same historical applied record. |
| 0114_phase_28_4_cloud_workspaces.sql | Scoped cloud claims/lifecycle | Same historical applied record. |
| 0115_phase_28_5_engineering_dataset.sql | Accepted dataset/control records | Isolated PostgreSQL verified; production application not established. |
| 0116_phase_28_6_distillation.sql | Derivative distillation records, constraints/history safeguards | Isolated PostgreSQL verified; production application NOT RUN by 28.6. |

SQL files are under `apps/api/migrations/`. Runner is `apps/api/src/scripts/database.ts`. `pnpm --filter @alexa-control/api db:migrate` / `db:migrate:deploy` and container deploy scripts are mutations, **not harmless diagnostic commands**. Do not invoke them merely while preparing a handover.

The new checksum guard can block deployment against legacy migration rows with NULL digests. That is intentional. Adoption requires actual operator review of historical SQL versus deployed release/schema and recovery evidence, then exact fixed `.local/approved-migration-history.json` with acknowledgement `OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY` and applied `{version,digest}` entries. `record-reviewed-history` fills missing digests only and refuses changed existing hashes. Hashing today’s files and blindly acknowledging them is not historical review.

Before coordinated rollout: read deployed release identity/current schema/history; establish backup and tested restore/forward-recovery assumptions; inspect current rows against stricter constraints; rehearse ordered migrations in isolated PostgreSQL; validate real server environment with `apps/api/src/scripts/validate-environment.ts`; review deployment artifact and finite dependencies; then migrate/deploy only within actual authorization. Do not rewrite an applied migration or silently relax validation.

`verify:production-config` runs hardcoded/synthetic profile checks. Passing it does **not** validate today’s actual production secrets, host/proxy/private-network configuration or deployment. Public health HTTP 200 does not prove owner routes, database persistence, model/trainer or worker readiness.

## 9. Validation evidence and limits

These are recorded results from prior implementation runs; the docs-only handover creation did not rerun the entire product suite.

| Recorded stage | Full serial local tests | Other recorded checks |
| --- | --- | --- |
| 28.2 | 215 files / 1,203 tests, four opt-in live skipped | All workspace lint/typecheck/build, diff. |
| 28.3 | 219 files / 1,226 tests, four skipped, 429.82 s | Lint/typecheck/build; independent integration focused tests. |
| 28.4 | 225 files / 1,249 tests, four skipped, 376.71 s | Android 24 tests, lintDebug/assembleDebug; workspace checks. |
| 28.4A secure setup | 233 files / 1,302 tests, four skipped, 411.58 s | Additional media-type test separately after collection; exact reports distinguish runs. |
| Railway isolation audit | 234 files / 1,303 tests, four skipped, 588.35 s | Focused 14 files/92 tests; workspace checks. |
| 28.5A | 243 files / 1,400 tests, four skipped, 425.38 s | Focused 8/67; Android 12 suites/25 tests; workspace checks. |
| 28.5B packaging repair | 243 files / 1,400 tests, four skipped, 451.91 s | Negative packaging, JS syntax, payload hashes; no Android change. |
| Image Builder 1.0.5 repair | 245 files / 1,415 tests, four skipped, 891.26 s | 10 Python/7 TS focused; cfn-lint 0 errors/3 warnings; workspace checks. |
| 28.6 release run | **251 files / 1,449 tests passed**, four files/tests skipped, **474.24 s** | All five workspace typechecks, lint/build, Android, security/config fixtures, dependency audit, diff. |

28.6 focused checks: 12 files/77 tests, plus provenance 3 files/16 tests. Python trainer security fixtures: five tests. These do not run real Torch/GPU fitting. Android offline `:app:testDebugUnitTest :app:assembleDebug`: 12 suites/25 tests, zero failure/errors, 43 tasks. No Android source was edited by 28.6; optional shared attempt identity compatibility was checked.

**Qualification for latest source:** the 1,449-test full run completed before the final owner-wide revocation correction. That correction passed an additional **2 files/13 tests** (including new two-case runtime test), API typecheck/lint/build. Do not claim the full suite executed the newly added two-case file. Earlier interrupted/ENOSPC/failed fixture runs are not final passing evidence.

The four skipped live suites concern Gmail, Stripe, analytics and remote acceptance. Skips are not live proof. Existing warnings: one Fast Refresh helper-export warning at `apps/web/src/EngineeringCredentialSetup.tsx`; web runtime-config/bundle-size warnings. Zero known production dependency advisories is the recorded patched audit result, not a comprehensive security certificate.

28.6 evidence logs: `.cache/phase28_6-*`, including `.cache/phase28_6-full-test-release.log` and `.cache/phase28_6-validation-source.json`. Other phases use `.cache/phase28_5/` and `node_modules/.cache/phase28_4*/`; see reports for exact directories. Local caches may not transfer with a Git clone.

Copied build/test checkout: `/Users/arjunaravapalli/.codex/visualizations/2026/10/05/01a10c21-9630-7903-a71b-813f42aa63ef/phase28_6-validation-copy`. It omitted root `.env`, `.cache`, `.local` and `.git` and was used to preserve original Mac generated artifacts. Source equality/hash evidence covered the recorded source set. Do not use that disposable checkout as production truth or assume its generated binaries include future edits.

## 10. Final five scenarios: exact acceptance still required

### A. Autonomous marketing — PENDING_LIVE_PROVIDERS

Owner objective: “Create a launch campaign for this product.” Existing services must produce positioning, brand direction, campaign concept, copy/social/ad concepts, real image assets, video where available, landing-page plan/build and an exact approval package. Required proof: real reviewed company-scoped creative/analytics receipts, correct recovery after interruption, real Engineering output and exact current artifact approvals. Missing providers remain explicit unavailable deliverables. No public publication/ad spend is implied.

### B. Athena improves Athena — PENDING_LIVE_ENGINEERING

Owner objective: “Add this feature to yourself.” A configured self-repository must flow through SELF_IMPROVEMENT → Engineering actual model/code work → fresh validation → integration → independent review → update candidate. Record exact task/run/commit/validation/review and authority scope. The feature must be built by Athena, not manually implemented by Codex and relabeled. Merge/deploy remains a separate governed action.

### C. Mobile cloud Engineering — PENDING_LIVE_INFRASTRUCTURE

From real Android: select/create authorized GitHub repository → “build me a website” → prepare canonical cloud workspace → actual READY scoped worker → Engineering agents → canonical realtime progress → validation/review → working phone-accessible HTTPS preview → completion notification. Ordinary portable work must not require the laptop. Record real provision/setup/model/patch/preview/validation/review/candidate milestones, tenant/TTL controls, cleanup and known/unknown costs. Mocks, provider probes and local HTTP previews cannot satisfy it.

### D. Local coding — PENDING_REAL_MODEL_AND_DATASET

Run routine AthenaCoder → PASS and a deliberate genuine AthenaCoder → Luna → PASS fallback through the canonical worker. Record attempt identity, local failure/escalation, paid winner, final validation/review and accepted merge where collection is intended. Source-verify the accepted example under opted-in policy and freeze/export real data. Fixture provider completion cannot count as the model’s quality result.

### E. Multi-tool business objective — PENDING_LIVE_PROVIDERS_AND_ENGINEERING

Owner objective: “Launch a new product page and prepare the launch campaign.” Existing Objective/Marketing/Design/Engineering/Creative/Social/Analytics systems must coordinate through one governed objective and real reviewed tools. Record child linkage, exact receipts, real assets/page preview, analytics evidence and review-only launch package. Do not introduce a second orchestration engine or treat preparation as permission to publish.

## 11. Prioritized continuation backlog

### Priority 0 — preserve context and establish current state

Read this report, `AGENTS.md`, newest chronological handoff entries and original repair chat. Inventory dirty source/ownership. Obtain current read-only stack/pipeline/build/log/migration/deployed-release/owner-session state. Label new observations with date/source. Do not repeat historical failed operations or overwrite another chat’s fix. Keep 28.4/28.5/28.6 conditional until corresponding evidence exists.

### Priority 1 — finish the reviewed EC2 foundation

Resolve/verify live 1.0.5 result. If failed, identify exact failing step with actual bounded logs, make the smallest repair in coordination, retain no-SSH/containment and immutable version/pin rules, run focused and required checks. After build/seal/test success, pass separate live release gate. Review runtime activation/egress/IAM/company config, signed READY bootstrap, repo prep and hard reaper behavior. Complete genuine Luna-first baseline and HTTPS/phone acceptance. This unlocks much of 28.5B and scenarios B/C.

### Priority 2 — reconcile production persistence/security rollout

Determine current actual 0110–0116 state and deployed source/dependencies. Review historical checksum adoption, constraints and recovery before migrations. Coordinate original repair chat, avoid runtime payload/hash drift, deploy the reviewed minimal changes, validate actual production security and scoped routes. The grpc patch is local until deployed.

### Priority 3 — accept AthenaCoder and create genuine teacher data

Supply/review pinned inference artifact/runtime and measure health, memory, latency/success; configure existing owner controls without bypassing eligibility. Run genuine routine local and paid fallback cases against matching Luna-first workload. Record real teacher task with fresh validation/independent review/governed accepted merge. Opt in the registered repository, verify collection/provenance/secret rejection/revocation, freeze/export a nonempty real version. At least three independent Objective groups are needed to prepare training splits; one teacher example alone is insufficient for the first fit.

### Priority 4 — finish real trainer/evaluator/runtime bindings

Review unquantized base artifact/license/inventory, pinned trainer image and compatible offline hash-locked wheels. Implement/bind reviewed credential-free host/transport with tenant separation, resource/network/hard-lifetime/cancellation enforcement. Run actual fitting and verify exact output inventory, provenance, duration/hardware/loss/cost coverage. Build reviewed immutable inference conversion/loading path. Bind server-owned benchmark resolver to genuine independent candidate/Luna/current deliveries. These dependencies are not public registration endpoints.

### Priority 5 — promotion, rollback and feedback acceptance

Run eight-category real evaluations, security bypass coverage and truthful duration/cost comparison. Deny promotion if quality/regression/speed gates fail or evidence is incomplete. If passing, perform purpose-bound recent-auth activation through existing control/registry; record real deactivate/rollback and later task outcomes. Recheck dataset source revocation even after training. Measure actual local fraction/escalation and cost only when billing/compute evidence supports it.

### Priority 6 — marketing provider and remaining carry-over

Implement/review one finite production creative handler with idempotent reconciliation. Accept real campaign/multi-tool package and landing page. Finish live GA4 and approved signed native adapter invocation, safe self-change workload series, cost/milestone gaps and verified preview/cleanup/restart/reconnect behavior. Review caches, automatic recovery and large corpus needs without introducing unrelated redesigns.

### Optional/deferred work — do not mistake for acceptance prerequisites already built

Learned routing remains optional shadow-only future work. Specialized adapters, automatic affected-check discovery, package/repo cache optimization, perfect budget enforcement, dashboard push/realtime polish, unrestricted publishing and large-scale corpus machinery were not implemented. Some optimizations can wait, but security-required lifecycle/isolation or explicit final scenario gaps cannot be waived. A future router must never replace deterministic authority or high-risk bypass without a separate reviewed phase.

## 12. Source and documentation navigation

Paths below are relative to repository root unless stated otherwise. Start with service composition and shared schemas, then their tests; do not reconstruct parallel systems.

| Concern | Primary implementation location |
| --- | --- |
| Composition/default disabled bindings | `apps/api/src/app.ts` |
| Universal contracts | `packages/shared/src/universal-tools.ts` |
| Gateway/authority/review/credential/receipt | `apps/api/src/universal-tools/` — gateway, governance-authority, lifecycle, credentials, reviewed-adapter, postgres-store |
| MCP and measured tool preference | `apps/api/src/universal-tools/mcp-client.ts`, `intelligence.ts`, `telemetry.ts` |
| Marketing/coordinator/creative/review/memory | `apps/api/src/marketing/`, `packages/shared/src/marketing.ts`, `apps/api/src/routes/marketing.ts` |
| Self risk/service/evidence | `apps/api/src/self-improvement/`, `packages/shared/src/self-improvement.ts`, `apps/api/src/routes/self-improvement.ts` |
| Existing Engineering execution/integration | `apps/api/src/engineering-orchestration/ai-worker.ts`, `apps/api/src/engineering-runtime/`, `apps/api/src/engineering-integration/` |
| Cloud provider/provisioning/broker/placement | `apps/api/src/cloud-engineering/`, especially provisioning, provider, ec2-provider, ec2-configuration, github, gateway-adapter, router, placement |
| Cloud worker and attestation | Same directory: worker-entry, provisioned-worker, bootstrap, runtime-preflight, ec2-image-runtime, ec2-ssm-image |
| Preview/usage | Same directory: preview-gate, preview-provider, telemetry, registry-proxy |
| EC2 infrastructure/image/packaging | `deploy/engineering-worker/aws/`, `aws/image/`, `aws/image-builder/` |
| Android | `apps/android/app/src/main/java/com/alexa/commandcenter/ui/EngineeringScreen.kt`, `model/EngineeringModels.kt` and existing API/cache/poll code |
| AthenaCoder controls/provider/router | `apps/api/src/ai/athena-coder/`, existing `apps/api/src/ai/` provider/router and `apps/api/src/local-ai/` |
| Accepted dataset/benchmarks | `apps/api/src/engineering-dataset/`, `packages/shared/src/engineering-dataset.ts`, `engineering-benchmark.ts`, `athena-coder.ts`, `apps/api/src/routes/engineering-dataset.ts` |
| Distillation contract/source/prepare/lifecycle | `packages/shared/src/athena-distillation.ts`, `apps/api/src/ai/distillation/` |
| Canonical evaluation and runtime binding | `engineering-evaluator.ts`, `evaluation.ts`, `runtime.ts` in the distillation directory |
| HTTP/model/routing/lineage controls | `apps/api/src/routes/athena-distillation.ts` |
| Offline trainer | `deploy/athena-training/{README.md,Dockerfile,train.py,test_train.py}` |
| Migrations and actual environment validation | `apps/api/migrations/0110*` through `0116*`, `apps/api/src/scripts/database.ts`, `validate-environment.ts` |
| Narrow dependency patch | `pnpm-workspace.yaml`, `pnpm-lock.yaml` |

Distillation HTTP surface: authenticated scoped GET `/api/athena-distillation`, `/routing-evidence`, `/compare`, `/:runId/lineage`; guarded POST `/prepare`, `/actions`, `/recover`. Mutations retain trusted origin, CSRF and transport-network checks. Prepare/train/evaluate use dataset-export recent-auth as coded; activation/rollback/retire use coder control grants; cancellation/deactivation preserve ordinary authenticated stop paths. HTTP cannot register trainers, choose paths/commands/endpoints or upload benchmark scores.

Reference reading order:

1. This master report and [new-chat starter](PHASE_28_NEW_CHAT_STARTER.md).
2. [Chronological handoff](PHASE_28_HANDOFF.md), starting at newest repair section.
3. [28.6 report](PHASE_28_6_REPORT.md) and [trainer requirements](../deploy/athena-training/README.md).
4. [28.5A](PHASE_28_5_REPORT.md) and [28.5B live blockers](PHASE_28_5B_LIVE_ACCEPTANCE.md).
5. [28.4 report](PHASE_28_4_REPORT.md), [28.4A](PHASE_28_4A_REPORT.md), [Railway isolation audit](PHASE_28_4A_ISOLATION_AUDIT.md), [AWS setup](PHASE_28_4A_AWS_SETUP.md), [consolidated owner setup](PHASE_28_4A_AWS_EASY_SETUP.md), EC2 runbooks listed above.
6. [28.3 report](PHASE_28_3_REPORT.md), [self-improvement](self-improvement.md).
7. [28.2 report](PHASE_28_2_REPORT.md), [marketing](marketing-department.md), [creative acceptance](marketing-production-acceptance.md).
8. [Universal Tool Runtime](universal-tool-runtime.md) and [cloud architecture history](cloud-engineering.md); read historical statements against newer records.

Earlier audit artifact outside the repo: `/Users/arjunaravapalli/.codex/visualizations/2026/10/05/01a10c21-9630-7903-a71b-813f42aa63ef/PHASE_28_6_AUDIT_PREPARATION.md`. Attachment/cache/local artifact paths require the same machine or an explicit transfer; a new ChatGPT cannot access them from a path string alone. Attach this report and relevant source/docs if moving to a separate environment.

## 13. Required future acceptance record

For each live gate, record: date, environment/deployed release, exact owner/company/repository/workspace identity, canonical objective/delivery/task/run/candidate IDs, model/runtime/digests, real attempts/fallback, exact validation/review/merge evidence, receipt IDs, measured times with precise meaning, known cost coverage/unknowns, security checks, cleanup and verdict. Use bounded identifiers/digests; never copy raw credentials, signed tokens, private code dumps or unrestricted logs into a handover.

An acceptable final report must separately state actual dataset/version, real training run/base/adapter, genuine evaluation/baselines, activated version and real rollback, routing state, tool preference, feedback outcome, A–E scenario results, deployed migration/source identity, released AMI/READY workload and outstanding carry-over. Mark a gate NOT RUN/BLOCKED/UNKNOWN when its evidence is absent.

**Final status at this handover: Phase 28 implementation is advanced; Phase 28 live acceptance and production closure remain incomplete. No reviewed AMI, READY worker, genuine cloud baseline, accepted HTTPS preview, real trained release or completed five-scenario acceptance is asserted.**
