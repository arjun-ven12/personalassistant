# Research charters and evidence standards

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Institutional research premise

Research earns authority by making uncertainty visible and methods reproducible. Athena can aspire to a research institution while remaining precise about its present code. Existing research agents, web retrieval and evaluation harnesses provide useful infrastructure; they do not establish a laboratory, scientific publication, training run, quantum experiment or performance breakthrough.

## Proposed Machine Intelligence Lab charter

**Question.** Under what conditions can a model-independent, governed multi-agent runtime improve useful task completion while preserving authority, privacy and recoverability?

**Scope.** Deterministic-first understanding and clarification; context selection/retrieval; task decomposition and dependency handoffs; model routing and economics; verifier quality; memory stability/conflict; reversible preference adaptation; safe skill promotion. Existing substrates include `ai/benchmark/service.ts::AIBenchmarkRunner`, `AIRouterService`, `CognitiveContextService`, `ReflectionEngineService`, `SkillEvolutionService` and corpus tooling. Verify concrete benchmark execution and scoring semantics before relying on any suite label.

**Initial programs.** (1) Non-execution and ambiguity evaluation using corpus negative examples. (2) Retrieval leakage/relevance across synthetic companies and projects. (3) Engineering decomposition and integration failure analysis. (4) Cost/quality comparison across configured model roles using held-out tasks. (5) Human supervision and recovery burden. No numerical result is asserted here.

**AthenaCoder definition decision.** The founder must choose whether this means a coding product, curated dataset, local model family, fine-tuned checkpoint or distilled routing/skill system. Each has different data rights, compute and acceptance needs. Current engineering workflows and local Ollama registry do not answer that decision. Training, fine-tuning and distillation implementation and results are UNKNOWN.

### Proposed experiment record

| Field          | Required content                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity/scope | Experiment ID/version, sponsor, company/project, hypothesis and preregistration timestamp                  |
| Data           | Dataset manifest hash, rights/consent, classification, origin, train/validation/test splits and exclusions |
| Runtime        | Code/config hashes, provider/model versions, environment and approved tool capabilities                    |
| Method         | Baselines, allocation procedure, repeats, stopping rule and evaluator instructions                         |
| Outcomes       | Human-defined utility, correctness, safety failures, uncertainty, cost/latency and missing observations    |
| Artifacts      | Sanitized inputs/outputs where allowed, receipts, verification and reproducibility commands                |
| Review         | Independent reviewer, conflicts, limitations, negative results and publication approval                    |
| Promotion      | Shadow/canary criteria, explicit human approval, rollback and monitoring plan                              |

**Data rules.** No secret values, private prompts/reasoning, unrestricted client documents, authentication material or raw sensor captures. Source material requires explicit rights; public availability does not automatically authorize every training use. Keep task-derived datasets company-scoped unless a reviewed release permits reuse. Evaluation sets must not silently leak into training or prompt examples.

**Promotion boundary.** Research suggestions remain advisory. `LearningEngineService` allows only policy-bounded reversible preference behavior; skill evolution has explicit validation and promotion concepts. No result may change policy, approval requirements, device trust, tenant boundaries or provider permissions. A successful benchmark does not authorize deployment.

## Proposed Quantum Systems Research charter

**Current evidence:** no dedicated quantum research subsystem located. General conversational examples containing “quantum” are not quantum implementation. There is no verified hardware integration, simulator program, scientific result or quantum client project in this audit.

**First mandate:** determine whether a narrowly defined quantum-information problem is scientifically worthwhile and feasible for Athena's available expertise/resources. Start with primary literature and reproducible classical simulation. Possible investigation categories—requiring founder/scientific selection—include small algorithm replication, resource estimation or orchestration of authorized scientific workloads. These are directions, not claimed programs.

**Required people:** qualified quantum research lead, numerical-software maintainer, independent scientific reviewer and data/compute steward. AI may assist source discovery, derivation checking and experiment documentation; it cannot establish a theorem or physical result by confident prose.

**Stage gates:** literature map → exact hypothesis and known limitations → classical baseline → reproducible simulator experiment → independent replication → feasibility review → separately approved hardware access if justified. Each gate may stop the program. No promise of quantum advantage, hardware partnership, commercial viability or novelty is supported.

**Access boundary:** approved public/licensed papers and synthetic experiment code. No general access to business/client data, secrets or privileged infrastructure. Any future SDK/provider must be a finite reviewed integration behind existing tool/policy/economics/audit systems; a lab name does not justify a new generic executor.

## Governance and publication for both labs

Maintain signed-off methods and evidence manifests, separate exploratory notes from accepted results, disclose tool/model involvement and limitations, preserve negative results, and publish only sanitized reviewed artifacts. Confidential methods and reproducibility packages may require different disclosure versions. Scientific review, security/data review and founder/publication approval answer different questions and should have distinct records.

Useful near-term deliverables are a reproducible intent-safety benchmark, an authorization-before-retrieval test corpus, one accepted engineering workflow evaluation, and a quantum feasibility memo. Long-term directions should follow those results rather than a predetermined superiority claim.
