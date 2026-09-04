import { createHash } from "node:crypto";

import {
  CompanyManagementDashboardSchema,
  CompanyManagementKpiSchema,
  CompanyManagementReviewSchema,
  ExecutiveHistorySchema,
  GenerateManagementReviewRequestSchema,
  ManagementForecastSchema,
  ManagementObjectiveHealthSchema,
  type ExecutiveKpi,
  type ObjectiveExecution,
  type PortfolioCompanySummary,
  type PortfolioMetricView,
  type SemanticMetricQueryResult,
} from "@alexa-control/shared";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import type { CompanyDataService } from "../company-data/service.js";
import type { CompanyStore } from "../companies/store.js";
import { companyScope } from "../companies/scope.js";
import type { ExecutiveStore } from "../executive/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ObjectiveEngineService } from "../objectives/service.js";
import type { OwnerPortfolioObservabilityService } from "../observability/service.js";

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const stateRank = { UNKNOWN: 0, HEALTHY: 1, WARNING: 2, CRITICAL: 3 } as const;
const deterministicUuid = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

export class CompanyManagementService {
  constructor(
    readonly companies: CompanyStore,
    readonly companyData: CompanyDataService,
    readonly objectives: ObjectiveEngineService,
    readonly executiveStore: ExecutiveStore,
    readonly workforce: AgentWorkforceService,
    readonly economy: AgentEconomyService,
    readonly portfolio: OwnerPortfolioObservabilityService,
    readonly audit?: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  async dashboard(ownerId: string, companyId: string) {
    const company = await this.companies.findCompany(ownerId, companyId);
    if (!company) throw Object.assign(new Error("Company management scope is unavailable."), { statusCode: 404, code: "COMPANY_NOT_FOUND" });
    const currentScope = companyScope.current(ownerId);
    const scope = currentScope?.companyId === companyId
      ? currentScope
      : { ownerId, companyId, role: "OWNER" as const, requestId: `company-management:${companyId}` };
    const [scoped, portfolio] = await Promise.all([
      companyScope.run(scope, () => Promise.all([
        this.companyData.dashboard(ownerId, companyId),
        this.objectives.dashboard(ownerId),
        this.executiveStore.listPlans(ownerId),
        this.executiveStore.listKpis(ownerId),
        this.executiveStore.listDecisions(ownerId),
        this.executiveStore.listHistory(ownerId),
        this.workforce.graph(ownerId, {}),
        this.economy.dashboard(ownerId),
      ])),
      this.portfolio.dashboard(ownerId),
    ]);
    const [data, objectiveData, plans, executiveKpis, decisions, history, graph, economy] = scoped;
    const companySummary = portfolio.companies.find((item) => item.companyId === companyId);
    const portfolioMetrics = portfolio.portfolioMetrics.filter((item) => item.companyId === companyId);
    const kpis = data.metrics.map((metric) => this.kpi(metric, portfolioMetrics, executiveKpis));
    const forecasts = kpis.map((kpi) => this.forecast(kpi, portfolioMetrics.find((item) => item.metricId === kpi.metricId)));
    const objectives = objectiveData.objectives.map((objective) => this.objectiveHealth(objective, objectiveData.goals.find((item) => item.id === objective.executiveGoalId), data.metrics));
    const diagnoses = this.diagnose(companySummary, kpis, objectives, data.integrations.length > 0);
    const activePlan = plans.filter((item) => item.status === "ACTIVE").sort((a, b) => b.version - a.version)[0];
    const goal = activePlan?.goalId ? objectiveData.goals.find((item) => item.id === activePlan.goalId) : undefined;
    const linkedObjective = goal ? objectiveData.objectives.find((item) => item.executiveGoalId === goal.id) : undefined;
    const strategy = activePlan ? {
      objectiveId: linkedObjective?.id ?? null,
      strategicIntent: goal?.description ?? goal?.title ?? "Approved Executive plan",
      assumptions: activePlan.assumptions,
      priorities: activePlan.milestones.slice(0, 10),
      constraints: goal?.constraints ?? [],
      successMetricIds: kpis.filter((item) => executiveKpis.some((target) => target.goalId === activePlan.goalId && normalize(target.name) === item.canonicalKey)).map((item) => item.metricId),
      initiatives: activePlan.milestones,
      budgetEnvelope: linkedObjective?.budgetCredits ?? null,
      timeHorizon: activePlan.horizon,
      version: activePlan.version,
      status: activePlan.status,
    } : null;
    const departments = graph.departments.map((department) => {
      const nodes = graph.nodes.filter((node) => node.departmentId === department.id && node.kind === "AGENT");
      const departmentObjectives = objectiveData.projects.filter((project) => project.departmentId === department.id);
      return {
        id: department.id,
        name: department.name,
        objectiveCount: new Set(departmentObjectives.map((item) => item.objectiveExecutionId)).size,
        kpiCount: kpis.filter((item) => item.ownerDepartmentId === department.id).length,
        activeAgents: nodes.filter((node) => node.status === "ACTIVE").length,
        availableCredits: nodes.reduce((sum, node) => sum + (node.credits ?? 0), 0),
        risks: departmentObjectives.filter((item) => ["BLOCKED", "FAILED", "WAITING"].includes(item.status)).map((item) => `${item.title}: ${item.status}`).slice(0, 20),
      };
    });
    const latestReview = [...history]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => item.metadata.review)
      .filter(Boolean)
      .map((item) => CompanyManagementReviewSchema.safeParse(item))
      .find((item) => item.success)?.data ?? null;
    const health = this.companyHealth(companySummary, kpis, objectives);
    const economyAlerts = economy.overview.reservedCredits > economy.overview.availableCredits ? 1 : 0;
    return CompanyManagementDashboardSchema.parse({
      ownerId,
      companyId,
      companyName: company.name,
      generatedAt: this.now().toISOString(),
      health,
      strategy,
      kpis,
      forecasts,
      objectives,
      diagnoses,
      departments,
      latestReview,
      decisions: decisions.slice(0, 100).map((decision) => ({
        id: decision.id,
        question: decision.question,
        alternatives: decision.options,
        selectedOption: decision.chosenOption,
        expectedOutcome: decision.expectedOutcome,
        actualOutcome: decision.actualOutcome,
        status: decision.status,
        evidence: decision.evidence,
        updatedAt: decision.updatedAt,
      })),
      executiveBrief: {
        topPriorities: strategy?.priorities.slice(0, 5) ?? [],
        topRisks: diagnoses.map((item) => item.summary).slice(0, 5),
        objectivesAtRisk: objectives.filter((item) => ["HIGH", "CRITICAL"].includes(item.risk)).length,
        budgetAlerts: objectives.filter((item) => ["WARNING", "CRITICAL"].includes(item.components.budget)).length + economyAlerts,
        actionsRequiringOwner: [
          ...objectives.filter((item) => ["REPLAN", "PAUSE", "STOP", "OWNER_REVIEW"].includes(item.recommendation)).map((item) => `${item.title}: ${item.recommendation}`),
          ...diagnoses.filter((item) => ["APPROVALS", "SERVICES"].includes(item.actionPath)).map((item) => item.summary),
        ].slice(0, 20),
      },
      invariants: { evidenceFirst: true, canonicalMetricsAuthoritative: true, recommendationsExecuteWork: false, lowerPolicyMayWiden: false },
    });
  }

  async generateReview(ownerId: string, companyId: string, raw: unknown, context: { requestId: string; ipAddress: string }) {
    const request = GenerateManagementReviewRequestSchema.parse(raw);
    const scope = { ownerId, companyId, role: "OWNER" as const, requestId: context.requestId };
    const history = await companyScope.run(scope, () => this.executiveStore.listHistory(ownerId));
    const existing = history.find((item) =>
      item.metadata.kind === "MANAGEMENT_REVIEW" &&
      item.metadata.idempotencyKey === request.idempotencyKey,
    );
    if (existing) {
      const parsed = CompanyManagementReviewSchema.safeParse(existing.metadata.review);
      if (parsed.success && parsed.data.companyId === companyId) return parsed.data;
    }
    const dashboard = await this.dashboard(ownerId, companyId);
    const reviewId = deterministicUuid(`management-review:${ownerId}:${companyId}:${request.idempotencyKey}`);
    const review = CompanyManagementReviewSchema.parse({
      id: reviewId, ownerId, companyId, period: request.period, cadence: request.cadence,
      strategyVersion: dashboard.strategy?.version ?? null, companyState: dashboard.health,
      kpiStatus: dashboard.kpis, objectiveStatus: dashboard.objectives, risks: dashboard.diagnoses,
      opportunities: dashboard.kpis.filter((item) => item.status === "ON_TRACK" && item.trend === "UP").map((item) => `${item.name} is on track and improving; review whether bounded acceleration is justified.`),
      recommendations: dashboard.diagnoses.map((item) => item.summary),
      decisionsNeeded: dashboard.executiveBrief.actionsRequiringOwner,
      evidenceRefs: [...new Set([...dashboard.kpis.flatMap((item) => item.lineage.map((edge) => edge.id)), ...dashboard.objectives.flatMap((item) => item.evidence)])].slice(0, 200),
      generatedAt: this.now().toISOString(), executed: false,
    });
    await companyScope.run(scope, () => this.executiveStore.saveHistory(ExecutiveHistorySchema.parse({
      id: deterministicUuid(`management-review-history:${ownerId}:${companyId}:${request.idempotencyKey}`), ownerId, type: "HEALTH_EVALUATED", entityId: null,
      summary: `${request.cadence} company management review generated from scoped evidence.`,
      metadata: { kind: "MANAGEMENT_REVIEW", idempotencyKey: request.idempotencyKey, review }, createdAt: review.generatedAt,
    })));
    await this.audit?.({ eventType: "MANAGEMENT_REVIEW_GENERATED", ownerId, companyId, outcome: "SUCCESS", reason: "Evidence-backed management review generated without executing recommendations.", metadata: { reviewId: review.id, cadence: review.cadence }, ...context });
    return review;
  }

  private kpi(metric: SemanticMetricQueryResult, views: PortfolioMetricView[], targets: ExecutiveKpi[]) {
    const target = targets.find((item) => normalize(item.name) === metric.definition.canonicalKey || normalize(item.name) === normalize(metric.definition.name));
    const value = metric.observation ? Number(metric.observation.value) : null;
    const view = views.find((item) => item.metricId === metric.definition.id);
    let status: "ON_TRACK" | "WATCH" | "AT_RISK" | "CRITICAL" | "UNKNOWN" = "UNKNOWN";
    if (metric.freshness === "CURRENT" && value !== null && target) {
      const ratio = target.direction === "LOWER_IS_BETTER" ? target.target / Math.max(value, 1e-9) : value / Math.max(target.target, 1e-9);
      status = ratio >= 1 ? "ON_TRACK" : ratio >= 0.9 ? "WATCH" : ratio >= 0.75 ? "AT_RISK" : "CRITICAL";
    }
    return CompanyManagementKpiSchema.parse({
      metricId: metric.definition.id, canonicalKey: metric.definition.canonicalKey, name: metric.definition.name,
      value: metric.observation?.value ?? null, target: target?.target ?? null, unit: metric.definition.unit,
      direction: target?.direction ?? null, trend: view?.trend ?? "INSUFFICIENT_DATA", status,
      freshness: metric.freshness, ownerDepartmentId: metric.definition.ownerDepartmentId,
      definitionVersion: metric.definition.version, lineage: metric.lineage,
    });
  }

  private forecast(kpi: ReturnType<CompanyManagementService["kpi"]>, view?: PortfolioMetricView) {
    if (kpi.freshness !== "CURRENT" || kpi.value === null || !view || view.previousValue === null) return ManagementForecastSchema.parse({ metricId: kpi.metricId, method: "INSUFFICIENT_DATA", projectedLow: null, projectedHigh: null, target: kpi.target, outcome: "UNKNOWN", confidence: "LOW", freshness: kpi.freshness, limitations: ["A fresh current and previous canonical observation are required."] });
    const current = Number(kpi.value), previous = Number(view.previousValue), projected = current + (current - previous);
    const low = projected * 0.9, high = projected * 1.1;
    const likelyMeet = kpi.target === null ? null : kpi.direction === "LOWER_IS_BETTER" ? high <= kpi.target : low >= kpi.target;
    return ManagementForecastSchema.parse({ metricId: kpi.metricId, method: "LINEAR_TREND", projectedLow: Math.min(low, high), projectedHigh: Math.max(low, high), target: kpi.target, outcome: likelyMeet === null ? "UNCERTAIN" : likelyMeet ? "LIKELY_MEET" : "LIKELY_MISS", confidence: "MEDIUM", freshness: kpi.freshness, limitations: ["Linear projection from two observations; seasonality and external effects are not modeled."] });
  }

  private objectiveHealth(objective: ObjectiveExecution, goal: { title: string; targetDate: string | null } | undefined, metrics: SemanticMetricQueryResult[]) {
    const now = this.now().getTime();
    const start = objective.activatedAt ? new Date(objective.activatedAt).getTime() : new Date(objective.createdAt).getTime();
    const deadline = goal?.targetDate ? new Date(goal.targetDate).getTime() : null;
    const elapsed = deadline && deadline > start ? Math.max(0, Math.min(100, ((now - start) / (deadline - start)) * 100)) : null;
    const consumed = objective.budgetCredits ? (objective.spentCredits / objective.budgetCredits) * 100 : 0;
    const dataState = !metrics.length ? "UNKNOWN" : metrics.some((item) => item.freshness === "CONFLICT") ? "CRITICAL" : metrics.some((item) => item.freshness !== "CURRENT") ? "WARNING" : "HEALTHY";
    const schedule = objective.deadlineStatus === "OVERDUE" || (elapsed !== null && objective.outcomeProgress + 30 < elapsed) ? "CRITICAL" : objective.deadlineStatus === "AT_RISK" || (elapsed !== null && objective.outcomeProgress + 15 < elapsed) ? "WARNING" : "HEALTHY";
    const budget = objective.budgetStatus === "EXHAUSTED" || consumed >= 100 ? "CRITICAL" : objective.budgetStatus === "BUDGET_AT_RISK" || consumed >= 80 ? "WARNING" : "HEALTHY";
    const execution = objective.status === "BLOCKED" || objective.status === "FAILED" ? "CRITICAL" : objective.status === "AT_RISK" || objective.blockers.length ? "WARNING" : "HEALTHY";
    const worst = Math.max(stateRank[schedule], stateRank[budget], stateRank[execution], stateRank[dataState]);
    const risk = worst === 3 ? "CRITICAL" : worst === 2 ? "HIGH" : dataState === "UNKNOWN" ? "UNKNOWN" : "LOW";
    return ManagementObjectiveHealthSchema.parse({ objectiveId: objective.id, title: goal?.title ?? "Objective", status: objective.status, risk, recommendation: risk === "CRITICAL" ? "REPLAN" : risk === "HIGH" ? "MODIFY" : risk === "UNKNOWN" ? "OWNER_REVIEW" : "CONTINUE", components: { progress: objective.outcomeProgress >= objective.executionProgress * 0.7 ? "HEALTHY" : "WARNING", schedule, budget, execution, quality: "UNKNOWN", dataConfidence: dataState }, progressPercent: objective.outcomeProgress, timeElapsedPercent: elapsed, budgetConsumedPercent: consumed, evidence: [`Outcome progress ${objective.outcomeProgress}%.`, elapsed === null ? "No bounded deadline evidence." : `Time elapsed ${Math.round(elapsed)}%.`, `Budget consumed ${Math.round(consumed)}%.`, ...objective.riskReasons, ...objective.blockers] });
  }

  private diagnose(summary: PortfolioCompanySummary | undefined, kpis: Array<ReturnType<CompanyManagementService["kpi"]>>, objectives: Array<ReturnType<CompanyManagementService["objectiveHealth"]>>, integrationsKnown: boolean) {
    const output: Array<{ id: string; category: "BUSINESS_PERFORMANCE" | "DATA_QUALITY" | "EXECUTION" | "WORKFORCE" | "CAPABILITY" | "INTEGRATION" | "BUDGET" | "SYSTEM" | "AI_QUALITY" | "POLICY" | "EXTERNAL_UNKNOWN"; evidenceState: "OBSERVED" | "LIKELY" | "POSSIBLE" | "UNVERIFIED"; summary: string; evidenceRefs: string[]; actionPath: "DATA" | "INTEGRATIONS" | "OBJECTIVE" | "WORKFORCE" | "APPROVALS" | "SERVICES" | "SYSTEM" | "AI" | "NONE" }> = [];
    const data = summary?.health.find((item) => item.dimension === "DATA");
    const system = summary?.health.find((item) => item.dimension === "SYSTEM");
    const ai = summary?.health.find((item) => item.dimension === "AI");
    if (!summary) output.push({ id: "evidence-unavailable", category: "EXTERNAL_UNKNOWN", evidenceState: "UNVERIFIED", summary: "Company evidence summary is unavailable; no causal recommendation is safe.", evidenceRefs: [], actionPath: "NONE" });
    if (data && ["WARNING", "CRITICAL"].includes(data.state)) output.push({ id: "data-quality", category: "DATA_QUALITY", evidenceState: "OBSERVED", summary: "Data freshness or pipeline health is degraded; resolve reliability before changing strategy.", evidenceRefs: data.evidence, actionPath: "DATA" });
    if (system && ["WARNING", "CRITICAL"].includes(system.state)) output.push({ id: "system", category: "SYSTEM", evidenceState: "OBSERVED", summary: "Runtime errors indicate a system issue that may explain operating underperformance.", evidenceRefs: system.evidence, actionPath: "SYSTEM" });
    if (ai && ["WARNING", "CRITICAL"].includes(ai.state)) output.push({ id: "ai-quality", category: "AI_QUALITY", evidenceState: "POSSIBLE", summary: "AI success telemetry is degraded; inspect model traces before attributing the change to business strategy.", evidenceRefs: ai.evidence, actionPath: "AI" });
    if (objectives.some((item) => item.components.execution === "CRITICAL")) output.push({ id: "execution", category: "EXECUTION", evidenceState: "OBSERVED", summary: "Objective execution is blocked or failing and requires bounded replanning.", evidenceRefs: objectives.flatMap((item) => item.evidence).slice(0, 20), actionPath: "OBJECTIVE" });
    if (!integrationsKnown) output.push({ id: "integration", category: "INTEGRATION", evidenceState: "UNVERIFIED", summary: "No healthy integration evidence is available; integration readiness remains unknown.", evidenceRefs: [], actionPath: "INTEGRATIONS" });
    if (kpis.some((item) => ["AT_RISK", "CRITICAL"].includes(item.status)) && data?.state === "HEALTHY" && system?.state === "HEALTHY" && (ai?.state === "HEALTHY" || ai?.state === "UNKNOWN")) output.push({ id: "business", category: "BUSINESS_PERFORMANCE", evidenceState: "LIKELY", summary: "Canonical KPI underperformance remains after data and system checks; a business-performance cause is likely.", evidenceRefs: kpis.filter((item) => ["AT_RISK", "CRITICAL"].includes(item.status)).map((item) => `metric:${item.metricId}`), actionPath: "OBJECTIVE" });
    return output;
  }

  private companyHealth(summary: PortfolioCompanySummary | undefined, kpis: Array<ReturnType<CompanyManagementService["kpi"]>>, objectives: Array<ReturnType<CompanyManagementService["objectiveHealth"]>>) {
    if (!summary) return "UNKNOWN" as const;
    if (summary.health.some((item) => item.state === "CRITICAL") || objectives.some((item) => item.risk === "CRITICAL") || kpis.some((item) => item.status === "CRITICAL")) return "CRITICAL" as const;
    if (objectives.some((item) => item.risk === "HIGH") || kpis.some((item) => item.status === "AT_RISK")) return "AT_RISK" as const;
    if (summary.health.some((item) => item.state === "WARNING") || kpis.some((item) => item.status === "WATCH")) return "WATCH" as const;
    if (!kpis.length || kpis.some((item) => item.status === "UNKNOWN" || item.freshness !== "CURRENT") || summary.health.some((item) => item.state === "UNKNOWN")) return "UNKNOWN" as const;
    return "HEALTHY" as const;
  }
}
