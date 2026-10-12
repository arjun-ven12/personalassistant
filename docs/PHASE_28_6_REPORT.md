# Phase 28.6 — distillation, routing evidence and final hardening

Date: 2026-10-05. This report is implementation evidence, not a production acceptance certificate. Phase 28.4 and 28.5 remain CONDITIONALLY COMPLETE. Overall Phase 28 is not complete. No Phase 29 work was started.

## Status register

| Status | Evidence |
| --- | --- |
| IMPLEMENTED | Strict shared distillation contracts; frozen-source verification and deterministic objective-grouped splits; finite offline LoRA/QLoRA runner; durable version lifecycle; canonical benchmark projection and promotion policy; authenticated scoped HTTP controls; routing/tool evidence; identifier-only feedback lineage; migration and MCP hardening. |
| LIVE VERIFIED | No new Phase 28.6 live acceptance. Isolated PostgreSQL checks are implementation verification, not live production evidence. |
| CONDITIONALLY VERIFIED | Synthetic lifecycle/rollback, HTTP security, canonical source revocation, malicious MCP and scoped telemetry behavior; full validation results below. |
| BLOCKED | First real training, deployment and promotion await an accepted real dataset, reviewed base/trainer dependencies and host, candidate inference binding, independent benchmark runs, and genuine Luna/current baselines. Final end-to-end acceptance also awaits inherited cloud/provider prerequisites. |
| NOT RUN | Real CPU/GPU fitting, training-container build, real model conversion/import, production migrations/deployment, live five-scenario acceptance, HTTPS preview, owner-entered Codex comparison. |
| UNKNOWN | Current live AWS/Image Builder state was not queried here; paid billing, training/local/workspace compute costs and real model performance have no new measurements. |

The user-provided baseline remains: Image Builder `1.0.4/1` passed the build component but failed seal `validate → VerifyBuildImage`; `1.0.4/2` was last reported BUILDING. Concurrent repair may have progressed. This chat neither releases an AMI nor reports a READY worker. Image Builder, EC2 worker and Mac runtime repair source files were not edited by this work.

## Implemented training and version path

`packages/shared/src/athena-distillation.ts`, `apps/api/src/ai/distillation/`, and `deploy/athena-training/` implement one general Qwen2-family engineering adapter. Preparation consumes only the existing dataset service's verified frozen export, revalidates canonical accepted merge/review/task provenance, cleans and deduplicates bounded examples, and splits whole objective groups by seed. It requires independent training, validation and evaluation groups. Targets contain reviewed final patches, not private reasoning or tool observations. Dataset version/digest, base digest, manifest digest and configuration are retained; raw exports are not persisted in the new run table.

Training claims are idempotent and version-fenced. Source provenance is checked again before and after fitting. Artifact receipts require the exact base and manifest identity, bounded metadata, and a matching evidence class. Cancellation/emergency stop abort bounded work; expired TRAINING records become INDETERMINATE rather than replaying an unknown job. Host cancellation must terminate the actual job and descendants, not merely cancel the HTTP request.

The Python runner implements LoRA and CUDA NF4 QLoRA using offline safetensors loading, fixed attention projections, input loss masking, held-out validation and fixed filesystem mounts. It denies custom model code, supplied paths, credential-bearing environments, contaminated data and truncated targets. The container runs non-root. The reviewed host must enforce network, CPU/RAM/PID/disk/GPU, lifetime and tenant mount isolation. A Dockerfile is not containment evidence.

No actual dataset was used, no real fit ran, no real adapter was produced, and no version was activated. Synthetic fixture runs are explicitly labelled and cannot promote. Actual first training remains **PENDING_REAL_DATASET**. This implementation follows the supplied Phase 28.6 brief; no separate Phase 28 PDF was supplied or used as acceptance evidence. The default composition root has no reviewed base/trainer/evaluator: these controls fail closed. The recipe deliberately requires a reviewed digest-pinned base image, compatible offline wheels and hash-locked requirements; none is fabricated or downloaded automatically. Conversion to an inference artifact and its reviewed host binding remain release prerequisites. See `deploy/athena-training/README.md`.

Version records retain training timestamps/hardware/runtime/duration/loss and nullable compute expense; evaluation suite/results; scope/provenance; rollout/activation/rollback/retirement. Compare, evaluate, activate, deactivate, rollback, retire, cancel and recovery are supported. Activation reuses existing AthenaCoder controls and model registry within the existing database unit of work. Registered inference metadata binds run, owner, company, base, adapter and inference digests. One trained version may be active per owner because existing controls are owner-wide. Ordinary control mutations and generic role assignment cannot activate a trained version. Runtime eligibility rechecks the active version and current source policy/provenance.

## Evaluation, routing and cost evidence

The evaluator projects the existing fixed Engineering benchmark catalogue and canonical deliveries, task results, validation and independent review. It rejects scope/artifact/workload/category mismatches, reused deliveries and incomplete current-baseline bindings. Candidate deliveries must postdate training and their canonical attempts must carry the exact server-stamped distillation run, inference digest and model version; an old outcome with a reused model ID is insufficient. Security coverage requires high-risk read-only work, Sol routing, no AthenaCoder attempt and no changed files. It does not import client/model scores or fabricate baseline workloads. The inherited benchmark case `taskId` identifies its delivery/workload; underlying Engineering task IDs remain in that delivery’s canonical manager view. Benchmark dispatch remains in existing Engineering; a reviewed server-owned resolver binds actual candidate/Luna/current runs.

Promotion requires REAL evidence, all eight categories, independent cases, safety, at least 90% passing cases, zero quality regressions and at most 1.5× measured baseline end-to-end duration. Both Luna and any current active trained version must be compared. Training loss is not promotion authority. A candidate that succeeds only after paid fallback does not earn a local pass. Unknown or zero baseline duration cannot establish performance. Activation requires recent authentication, current provenance and exact reviewed runtime identity. Rollback is tested using synthetic durable-lifecycle simulation, not a live model rollback.

Routing Evidence reads the latest 100 canonical owner/company objectives. Cohorts expose category/repository class, success, failure/review/validation, retries, sample counts, Wilson confidence, end-to-end duration, measured attempt latency and observable escalation. Local failure followed by a paid winner is attributed as an escalation. Missing attempt/billing/compute evidence stays unknown. Even a strong cohort grants no automatic routing authority; deterministic server policy and high-risk bypass remain unchanged. No learned-routing experiment or shadow outcome is claimed.

Tool receipts now stamp server-owned tool version/schema/category/environment. Intelligence ignores cross-company, obsolete-version and changed-schema receipts. Measured acceptance requires 20 reviewed samples, at least 90% acceptance and bounded failure rate; otherwise order remains deterministic. Exact policy/credential/handler preflight restricts argument-free executable recommendations to authorized finite reads with none/session approval. Actions requiring explicit action-bound approval remain proposals and must use the normal gateway approval path. Preflight grants are discarded; every invocation requires a new exact request grant. Existing Creative proposals use measured ranking among reviewed tools, and execution still passes the Tool Gateway. Costs report known samples and per-currency totals; unknown samples are not charged as zero. No claim that local inference or training is free is made.

## Feedback provenance

The scoped lineage read model links canonical objective/task/candidate/integration/validation/review/example identities to the frozen dataset, training/model version, evaluation and activation state. Later outcomes are joined from existing Engineering results for the registered version in a bounded window. Merge evidence remains in the existing integration record. Revoked source policy/provenance denies lineage and further eligibility. No second execution ledger, automatic merge, automatic promotion or automatic routing expansion is introduced.

## Hardening record

| Area | Boundary, implementation coverage and remaining acceptance |
| --- | --- |
| MCP credentials/permissions/approval/tenant isolation | Existing reviewed bindings, company credential references, exact grants and receipts remain authority. Gateway/governance/credentials/HTTP suites exercise denial, scope and replay. Recommendations preflight readiness; no public trainer or arbitrary tool registration path added. |
| Hostile MCP/schema/SSRF/external failure | Response streaming is capped before buffering; initialized responses are also bounded; session metadata is bounded; reviewed HTTPS host/no credentials-in-URL/no ports/no redirects remain enforced. Session initialization is deduplicated, bounded to 128 entries with TTL, and failed-session invalidation is tenant/provider scoped. Existing suites cover schema mutation/spoofing/oversize/replay/unavailable capability. Real remote outage recovery remains unverified. |
| Credential-shaped output | Provider text/structured output is scanned after schema validation and before receipt/client/model exposure. Leakage returns INDETERMINATE with no output. Regression fixtures contain canaries only. |
| Dataset/training isolation | Canonical recollection no longer blindly trusts a saved example when source fields change. Secret scanning checks actual nested strings as well as serialized structure, catching quoted assignments. Scope/hash/tamper/duplicate/revocation/opt-out/exclusion tests preserve existing policy. GLOBAL_SAFE remains disabled and private pooling remains opt-in. |
| Model failure/fallback/resource limits | Existing AthenaCoder/provider/router tests cover unavailable/digest/output/cancellation/capacity/deadline/circuit/fallback behavior. Trained-version controls add current provenance/activation/company gates. Actual hardware OOM and genuine fallback remain pending. |
| Self-modification | Existing self-improvement risk classifier, protected paths, stronger routes, candidate/merge separation and review remain authority; policy/service/HTTP suites exercise these paths. Performance evidence never weakens security/auth/signing/audit/tenant/approval routing. No actual self-change objective was substituted by manual code edits. |
| Audit/recovery/idempotency | Run state and audit updates use existing transactional persistence; HTTP denials add bounded audit metadata without submitted arguments. Owner-wide deactivation does not require healthy/available model inventory, preserving revocation during removal or inconsistent selection. CAS/idempotency/audit rollback/cancellation/restart fencing tests pass. Artifact and raw training data never appear in audit metadata. Uncertain external outcomes remain uncertain. |
| Cost/realtime/Android | Canonical result/read models retain unknown billing and compute expense. Existing realtime/reconnect/cross-device tests remain implementation evidence; Android receives no new execution/routing authority from this phase. No Android source or Android-specific contract was edited here. Genuine phone acceptance remains pending. |
| Cloud/GitHub/preview | Existing containment, signer separation, generation/replay/lifetime, authorization and preview gates remain in place; no runtime repair source edits. Their existing tests remain implementation evidence. No READY/HTTPS/phone-only cloud acceptance is inferred. |

## Migrations and release safeguards

The initial production dependency audit found two advisories in OpenTelemetry's transitive `@grpc/grpc-js@1.14.4` (one HIGH, one LOW). The maintainer lists 1.14.5 as the patched 1.14 branch for [certificate-authentication handling](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) and [server error disclosure](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4). Current source uses an HTTP telemetry exporter; this inventory finding did not prove a reachable server exploit. Ownership of a narrow shared dependency edit was coordinated with the original chat. `pnpm-workspace.yaml` now pins 1.14.5 and the regenerated lockfile preserves all prior entries except the exact package identity/integrity and its references. The updated audit reports zero known production advisories. Patched build/test validation is recorded below; production deployment of the fix remains NOT RUN.

Pending Phase 28 source migrations 0110–0115 remain relevant to the current tool/review/marketing/GitHub/cloud/dataset systems; whether each is already applied in production must be established through current read-only deployment evidence. Migration 0116 adds only derivative distillation provenance, indexes, checksum history and forward constraints. It fixes SQL CHECK expressions that could previously accept missing JSON identity fields through NULL semantics. Applied 0115 SQL was not rewritten. Isolated PostgreSQL exercises ordering, idempotency, constraints, tenant scope, CAS and restart persistence.

The migration runner now verifies exact SHA-256 SQL content and known applied lineage. Changed hashes and unknown versions deny deployment. Legacy history with missing digests deliberately blocks automatic migration: an operator must review historical SQL against the deployed release/schema and recovery evidence, then supply the exact fixed `.local/approved-migration-history.json` manifest containing `acknowledgement: OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY` and applied `{version,digest}` entries. `record-reviewed-history` fills missing digests only and refuses to overwrite a mismatched stored digest. This adoption is an explicit operator action, not proof that today's SQL matches historical production execution.

Before any production action: coordinate with the original repair chat; record a tested database backup/restore point and deployed release identity; verify historical checksums and complete ordering; inspect existing rows for new constraints; validate the actual production environment with `validate-environment`; rehearse forward recovery; apply migrations in a controlled transaction; then run safe readiness/security validation. A violation aborts migration instead of dropping or rewriting data. Roll forward for compatible failures; restoring a reviewed backup requires a separate coordinated recovery decision. Do not roll an old image back blindly after adopting the new checksum gate. Production migration/deployment was **NOT RUN** here. `verify:production-config` tests synthetic configuration profiles and is not actual deployment validation.

## Final scenarios

| Scenario | Implementation path | Acceptance status |
| --- | --- | --- |
| A — autonomous marketing launch campaign | Existing Marketing/Creative approval package and Engineering handoff, with telemetry-informed reviewed tool proposals. | PENDING_LIVE_PROVIDERS; no real image/video/landing-page package produced here. |
| B — Athena improves Athena | Existing self-improvement → governed Engineering → validation/review → update candidate; accepted examples can feed the governed training path. | PENDING_LIVE_ENGINEERING; no agent-produced target feature or accepted teacher example claimed. |
| C — mobile cloud website | Existing GitHub selection, cloud workspace, canonical realtime state, governed Engineering and isolated preview gate. | PENDING_LIVE_INFRASTRUCTURE; no substitute mock preview. |
| D — AthenaCoder PASS and AthenaCoder → Luna PASS | Existing finite worker/router/fallback paths, accepted source collection and new distillation/evaluation lifecycle. | PENDING_REAL_MODEL_AND_DATASET; no genuine model/run comparison. |
| E — product page and launch campaign | Existing objective/workforce/Marketing/Creative/Engineering systems; no parallel orchestration architecture. | PENDING_LIVE_PROVIDERS_AND_ENGINEERING; no genuine multi-department completion here. |

## Validation

Logs are in `.cache/phase28_6-*`. Synthetic fixtures are implementation evidence only. PostgreSQL uses randomly isolated test schemas and never the production target. Full builds run in a disposable copied checkout outside the repository so this chat does not overwrite generated Mac artifacts being used by the original repair chat.

| Gate | Result |
| --- | --- |
| Expanded focused Phase 28.6/provider/control/dataset/tool/self-risk tests | 12 files, 77 tests passed; subsequent provenance-focused check: 3 files, 16 tests passed |
| Final full `pnpm test --no-file-parallelism` | 251 files passed, 4 skipped; 1,449 tests passed, 4 skipped; 474.24 seconds |
| Final stop-path correction | Additional focused run: 2 files, 13 tests passed; API typecheck/lint/build checked again |
| `pnpm typecheck` | All 5 workspace packages passed |
| `pnpm lint` | Passed, 0 errors; existing Fast Refresh warning in EngineeringCredentialSetup.tsx |
| `pnpm build` | All workspace builds passed in the copied checkout; existing runtime-config/chunk-size warnings |
| Android `:app:testDebugUnitTest :app:assembleDebug` | Offline build passed; 12 suites, 25 tests, 0 failures/errors; 43 tasks |
| Python trainer security unit fixtures | 5 tests passed; real fitting/container build NOT RUN |
| API static security check | Passed |
| Production-config profile fixtures | Passed; actual deployed configuration NOT VERIFIED |
| Production dependency audit | Patched lockfile: zero known advisories |
| `git diff --check` | Passed |

The full serial run finished before the final isolated revocation correction. That correction removed a runtime-health dependency from owner-wide DISABLE and was checked with the additional focused run, API typecheck, lint and API build; the full suite was not counted as having executed the new two-case test file. Source hashes and copied-build source equality were recorded in `.cache/phase28_6-validation-source.json`. The four skipped tests are opt-in Gmail, Stripe, live analytics and live remote acceptance, not verified live services. Earlier full runs interrupted by fixture correction, ENOSPC or user interruption are not counted as final passes. Android source was not edited here. Because canonical attempt telemetry gained optional identity fields, Android unit/build compatibility passed in the disposable checkout; previous Phase 28.5 Android evidence remains separate. Training security unit fixtures do not prove real torch/GPU fitting.

## Remaining work and verdict

Release a reviewed contained AMI/READY worker and obtain the genuine cloud baseline and phone-accessible HTTPS preview; collect a genuinely accepted teacher example under reviewed repository policy; freeze/export the real dataset; supply reviewed offline trainer dependencies/host/base identity; run actual LoRA/QLoRA and verify artifacts; bind a reviewed candidate inference backend; run independent eight-category candidate/Luna/current benchmarks; review promotion, activate with recent authentication, and measure actual rollback/later outcomes. Complete all five final scenarios and inherited 28.1–28.5 live gates. Reconcile actual production migration/environment/backup evidence through coordinated release work.

PHASE 28.6 CONDITIONALLY COMPLETE — FIX REMAINING LIVE/HARDENING BLOCKERS

This verdict covers the implemented mechanisms and the recorded implementation validation. It does not assert real training, release, deployment, final scenarios or overall Phase 28 acceptance.
