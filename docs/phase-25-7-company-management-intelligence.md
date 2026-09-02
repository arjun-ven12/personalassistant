# Phase 25.7 company management intelligence audit

## Audit outcome

| Capability | Audit result | Resolution |
| --- | --- | --- |
| Company strategy and priorities | C — exists but not connected | Reuse versioned Executive plans, goals, and Objective strategy versions in the company management read model. |
| Company goals and decomposition | A — complete | Reuse Objective Engine goals, projects, capability links, workforce tasks, and workflow selection. |
| KPI definitions | A — complete | Semantic metrics remain canonical; Executive KPI records supply owner/approved targets only. |
| KPI monitoring | C — exists but not connected | Bind canonical observations, freshness, lineage, trend, and approved targets into management KPI status. |
| Department goals/performance | D — partial | Resolve department-owned projects, canonical KPIs, agents, credits, and blockers. Rich department budget envelopes remain deferred. |
| Objective health and underperformance | D — partial | Expose progress, schedule, budget, execution, quality, data confidence, deterministic risk, and continue/modify/replan advice. |
| Resource/budget allocation | A/C | Agent Economy and Workforce Gap Resolver remain authoritative; management exposes evidence and alerts but cannot allocate or reorganize automatically. |
| Capability/integration gaps | A/C | Reuse objective capability links, integration health, and Services readiness; missing infrastructure is a blocker, never a reason to invent an agent. |
| Company health | C — existed in Portfolio | Connect Portfolio component health with company-scoped objectives and canonical KPIs. Unknown remains visible. |
| Forecasting | E — missing | Add a bounded two-observation linear range with method, freshness, confidence, and limitations. No ML service was introduced. |
| Risk/opportunity/root cause | D — partial | Add deterministic classification across business, data, execution, integration, system, and AI evidence. Causality is labelled observed/likely/possible/unverified. |
| Replanning/versioning | A — complete | Reuse Objective/Executive versioned plans and cooldown behavior; management recommendations do not mutate them. |
| Management review | E — missing | Generate a bounded typed review and persist it as an existing Executive history record. |
| Management decisions/outcomes | A/C | Reuse Executive decisions and expose alternatives, selected option, expected outcome, and actual outcome. |
| Experiments/learning | A — complete | Reuse controlled experiments and reviewed learning; no new experiment subsystem. |
| Operating cadence | D — partial | Reviews model daily/weekly/monthly/quarterly/ad-hoc cadence. Permanent per-company loops are prohibited; central scheduling is deferred. |
| Executive brief/escalation | C — exists but not connected | Expose priorities, risks, objective/budget alerts, and owner-required actions at company level. |
| Portfolio integration | D — partial | Portfolio cards and insights now drill into the selected company management view. Compact persisted review fields in the portfolio card remain deferred. |
| Cross-company workflow UX | D — partial | Services now exposes policy, readiness, create, accept, reject, cancel, approval links, results, and advanced execution details. |

## Architecture and authority

The company management surface is a read model and review coordinator, not a new strategy, KPI, resource, forecasting, or decision engine. It composes:

`canonical metrics + Objective state + Executive plans/decisions + Workforce + Agent Economy + Portfolio OTel/AI evidence → deterministic management state → advisory review`

Semantic metric definitions and observations remain numerical truth. Executive KPI records provide binding targets. Agent Economy remains the budget authority. Workforce Gap Resolver remains the staffing authority. Objective/Executive plans remain the strategy/version authority. Policies, approvals, capabilities, company lifecycle, AIRouter, and data sensitivity remain enforcement boundaries.

Reviews persist as typed, bounded `HEALTH_EVALUATED` Executive history metadata with `kind: MANAGEMENT_REVIEW`. This reuses the company-scoped `executive_records` storage and avoids another persistence subsystem or migration. Reviews contain evidence and rationale summaries, never prompts, raw payloads, secrets, or hidden reasoning.

## Diagnosis discipline

Data degradation is classified before business strategy. Runtime errors produce a system classification. AI success degradation produces a possible AI-quality classification. A business-performance diagnosis is emitted only when a canonical KPI is at risk while data and system evidence are healthy and AI evidence is healthy or explicitly unknown. Sparse evidence returns unknown and forecasts remain unavailable.

Forecasts use only a fresh canonical current and previous observation. The output is a ±10% scenario range around a linear continuation, marked medium confidence with an explicit seasonality/external-effects limitation. Stale, conflicted, unavailable, or single-point evidence returns `INSUFFICIENT_DATA`.

## Product flows

The Companies page adds Overview, Strategy, KPIs, Objectives, Departments, Reviews, and Decisions without replacing the Phase 25.4 Data, Metrics, Integrations, and Memory surface. Empty states tell the owner which source action will populate each section.

Services retains its operator evidence but prioritizes outcome, companies, status, specialist, budget, approval, blocker, result, and deadline. Lease, generation, raw attempts, and trace details move under Advanced execution details. The create form performs bilateral policy, peer status, sharing, capability, and budget checks. Runtime scheduler/adapter gaps are shown separately as `INTEGRATION_NOT_READY` or `CAPABILITY_NOT_READY`; a policy-valid contract may still be recorded, but it cannot appear executable.

The policy form edits the active company's existing `PUT /api/company-collaboration/policy` record. The peer must be configured after switching active company; this preserves the existing company guard rather than adding an owner-wide policy mutation bypass.

## Local durable development

After `pnpm db:migrate`, use `pnpm dev:durable` instead of `pnpm dev` when testing durable service execution locally. It starts the normal development applications and explicitly enables the single PostgreSQL-backed centralized scheduler in the API process. Production still enables the scheduler by deployment mode and retains database lease safeguards.

Execution also requires a reviewed activity adapter and its approved company-scoped artifact resolver. The default local configuration does not fabricate either. For `company.artifact.report`, choose `SPECIFIC_ARTIFACTS` and supply explicit artifact references; if the resolver/adapter is absent the UI reports capability readiness as blocked.

## Security and limitations

- Company management routes require authenticated active company context. Existing AsyncLocal company scoping constrains Executive, Objective, Economy, and Workforce reads.
- Portfolio provides only owner-authorized summaries; raw sibling-company rows, documents, memories, credentials, and prompts are not management evidence.
- Services requires bilateral collaboration/data policy, destination decision, approvals where required, economy reservation, workforce resolution, reviewed adapter, and durable lease before an external effect.
- The Services policy editor currently configures one active-company policy at a time and replaces its peer/service lists; richer multi-peer editing is deferred.
- Company management does not yet persist separate department budgets, calibrated forecast models, portfolio-card review summaries, or centrally scheduled reviews.
- Existing Objective KPI records predate the semantic metric layer. Binding is deterministic by canonicalized name; a future additive explicit metric-ID field would remove name-mapping ambiguity.
