# Foundation Two: AthenaCoder research pipeline

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Status and reusable assets

**PLANNED; no ingestion/training implementation in this slice.** Reuse engineering task/validation/review/delivery provenance, `MemoryIndexerService` stable typed artifacts, existing AI benchmark/context/economics services, company data classification and existing approval/audit. Never interpret a task passing tests, a merge or model review as human acceptance or training permission. No dedicated dataset-rights/review service was found at baseline.

## Proposed CODER-1 vertical slice

Capability: ingest one synthetic accepted engineering example through rights/privacy/quality review to an immutable split manifest and evaluation report, entirely offline. Shared strict schemas cover task/repository/result refs, acceptance/rights/license versions, permitted model uses, content hashes, privacy, eligible state and review decision. Content is explicitly supplied from a reviewed finite source adapter, never unrestricted filesystem crawling.

Flow: accepted outcome reference → current authorization and human acceptance → rights/license/permitted-use check → bounded secret/PII detection and redaction/rejection → exact/near-duplicate graph → candidate review → immutable dataset version → train/validation/held-out manifests → baseline evaluation. Unknown rights or secure content denies ingestion. Redaction alone does not establish permission; retain transformation provenance without raw rejected content.

Deduplicate normalized exact hashes and deterministic token-shingle similarity. Put every connected duplicate component in one split. Split by repository first and time cutoff second; record fixed seed and policy version. Reject any component bridging train/held-out; test temporal leakage and renamed/copied repositories. Dataset versions bind source, transformation, split and acceptance hashes; approved examples cannot change in place.

Metadata tables are proposed only after choosing artifact storage: dataset candidates, acceptance/rights references, dataset versions/example membership, split manifests, evaluation runs and review decisions, all owner/company scoped. Store source content only where explicitly authorized; keep ordinary database records as opaque artifact refs and hashes. No private customer code or secrets may enter a research dataset by default.

## Evaluation design

Categories: generation, bug fixing, refactoring, tests, repository understanding, structured finite tool planning, recovery and validation correctness. Each fixture binds expected behavior, approved input context, test/verification contract and reviewer criteria. Execute candidate and established baseline under identical contexts/resource limits; capture actual checks and independent acceptance. Report task success, test passes, regressions, review acceptance, latency/resources, unfamiliar-repo behavior, security failures and cost per accepted result. Missing acceptance is not success; lower training loss is not promotion evidence.

Miniature CPU test uses synthetic examples and deterministic dummy predictions to exercise rights/filter/split/evaluation/audit flow. It verifies the harness, not coding-model quality or fine-tuning.

## Later LoRA/QLoRA pilot proposal

| Candidate                 | Evidence and tradeoff                                                                                                                                          | Decision                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Qwen2.5-Coder-7B-Instruct | [Publisher model card](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) identifies Apache-2.0; manageable pilot-size candidate                           | Preferred investigation candidate; immutable revision/license review still required |
| StarCoder2-3B             | [Publisher model card](https://huggingface.co/bigcode/starcoder2-3b) identifies BigCode OpenRAIL-M; smaller parameter count but different permitted-use duties | Alternative baseline after license/usage review                                     |

[PEFT](https://github.com/huggingface/peft) supplies LoRA tooling; [QLoRA paper](https://arxiv.org/abs/2305.14314) describes adapters over frozen quantized weights. No performance number from these sources is adopted as Athena's result. Version-pin the eventual training environment only when the pilot is authorized.

Proposed pilot config: seed 17, 2,048-token examples, rank 8, alpha 16, dropout 0.05, microbatch 1, gradient accumulation 8, one initial epoch, checkpoint/held-out evaluation and explicit maximum steps. Treat these as starting hypotheses, not tuned settings. Begin with a 100-step memory/time calibration and abort on resource/quality gate failure.

Planning estimate: 7 billion weights at 4 bits is approximately 3.5 GB of raw weights before quantization metadata, activations, optimizer/adapter state and runtime overhead. Investigate one 24-GB NVIDIA GPU, 32–64 GB host RAM and a 50-GB bounded scratch/artifact allocation; these are conservative planning assumptions, not measured fit. Budget at most eight GPU-hours for an initial approved calibration/pilot plus storage/evaluation. Monetary ceiling = approved hourly rate × capped hours + storage/evaluation charges; current provider price is UNKNOWN and must be quoted before reservation. No paid compute, downloads or training begins here.

Future reviewed commands should be finite `dataset validate/build`, `evaluate fixture/model`, `train pilot` and `artifact verify` profiles with manifests/config refs, not arbitrary scripts. Training/evaluation scripts and actual GPU acceptance are deliverables of later CODER-2, not claimed present. Model lifecycle receives a candidate artifact only after dataset rights, evaluation and human review. Distillation is a distinct later charter with teacher rights/consent and evaluation.

## Tests, rollback and acceptance

Test rights unknown/revoked, absent human acceptance, secret/PII rejection, duplicate/split leakage, tampered source/content hashes, cross-company refs, stopped ingestion, deterministic manifests and failed evaluation. Gated disposable PostgreSQL covers version races and restart durability. Rollback archives candidate/version, revokes eligibility and retains audit; no permanent deletion or automatic source-memory mutation. CODER-1 acceptance is data/harness correctness, never a trained model.
