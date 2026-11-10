# Foundation Three: model artifact and serving lifecycle

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Status and reuse

**PLANNED; no artifact/deployment implementation in this slice.** `AIModelRegistry` and `AIProviderRegistry` already define inference descriptors, roles and provider health; AIRouter controls routing/privacy/economics and cancellation. Local Ollama administration is a compatibility facade. Extend these boundaries instead of adding a competing registry/router. Existing skill promotion is not model-weight promotion.

## MODEL-1 offline vertical slice proposal

Register an inert dummy artifact by opaque artifact reference and SHA-256; validate immutable provenance, base/adapter lineage, license, dataset/training-config refs and runtime requirements. Associate a held-out report and independent human review. Simulate staging/health failure/rollback using an explicit simulator adapter that cannot register a live endpoint. This tests lifecycle semantics only.

Proposed states: CANDIDATE → VALIDATED → EVALUATED → REVIEW_REQUIRED → APPROVED_FOR_SIMULATION → SIMULATED_STAGING → SIMULATED_HEALTHY or SIMULATED_FAILED → SIMULATED_ROLLED_BACK. Later real staging/canary/production are separate transitions/capabilities, not aliases for simulated success. Every transition is version-fenced and binds artifact/report/config/scope hashes. Unknown license/provenance, mismatched checksum, stale review or stopped/revoked authority denies.

Proposed immutable records: model artifact version, lineage edges, evaluation bindings, review/promotion decisions, serving deployment revision, health observations and rollback target. Use existing PostgreSQL transaction/store patterns and audit; store weights externally under reviewed artifact tokens, not JSON blobs, client paths or ordinary model descriptors. No executable deserialization, arbitrary image, endpoint, pickle file or model-supplied launch script is permitted.

## Serving integration and phases

- MODEL-1: dummy artifacts, checksum/provenance validation, human review, simulation and deterministic rollback.
- MODEL-2: reviewed local inference adapter registration and held-out evaluation; existing provider/model IDs and role mappings remain canonical.
- MODEL-3: approved staging deployment through a finite reviewed provider with hardware/runtime/license checks, resource reservation and independent readiness.
- MODEL-4: canary traffic limited by company/task/privacy policy, deterministic assignment, observable outcomes and automatic containment/rollback only within an approved bounded policy.
- MODEL-5: independent human recent-authenticated production promotion; explicit approval scope/expiry, monitoring and tested rollback.

A serving binding references an allowlisted reviewed endpoint/profile; clients/models cannot submit arbitrary URLs or executables. Health/readiness differ: process alive does not establish model loaded/correct or safe. Rate limits, queue/deadline/cancel, token budgets, allowed modalities, context length and privacy classification are evaluated before routing. Fallback may only select an already approved eligible model and may not send local-only data to cloud.

Application deployment and model deployment are distinct artifacts, risks and rollback mechanisms. Neither is implemented through a new generic executor. A rollback restores an approved routing/deployment revision; it cannot load arbitrary weights or change policy.

## Acceptance, threats and costs

MODEL-1 tests valid/invalid artifact checksum, immutable version conflicts, license/provenance gaps, foreign refs, tampered evaluation, unauthorized/self-review promotion, stop/revocation, duplicate transitions, simulated health failure and exact approved rollback target. Disposable PostgreSQL tests transaction/restart/competing promotions. Audit stores hashes/IDs/status only, not weights, raw prompts or private data.

Dummy phase requires CPU/local storage only and no paid hosting. Later hardware sizing/price must come from calibrated model/runtime measurements and approved provider quotes, with capped reservations before hosting. Stop rolls back/withdraws eligible binding and preserves evidence. Real promotion remains unavailable until all independent gates are implemented/accepted.

## Distillation boundary

Future distillation has its own hypothesis, teacher-model permission/license review, dataset rights, privacy evaluation, budget, reproducibility and human promotion approval. Neither LoRA nor a registry record proves distillation. No teacher output is silently reused as authorized training data.
