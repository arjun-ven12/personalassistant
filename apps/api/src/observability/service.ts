import { createHash } from "node:crypto";

import {
  AIObservabilityTraceSchema,
  OwnerPortfolioDashboardSchema,
  PortfolioAIOverviewSchema,
  PortfolioAlertActionSchema,
  PortfolioAttentionSignalSchema,
  PortfolioExecutiveInsightSchema,
  PortfolioMetricComparisonRequestSchema,
  PortfolioMetricCompatibilitySchema,
  PortfolioMetricViewSchema,
  PortfolioSystemOverviewSchema,
  SystemTelemetrySpanSchema,
  type AIObservabilityTrace,
  type Company,
  type MetadataLineageEdge,
  type PortfolioAttentionSignal,
  type PortfolioCompanySummary,
  type PortfolioExecutiveInsight,
  type PortfolioMetricView,
  type SystemTelemetrySpan,
} from "@alexa-control/shared";

import type { AgentStore } from "../agents/store.js";
import type { CompanyDataStore } from "../company-data/store.js";
import type { CompanyStore } from "../companies/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ObservabilityStore } from "./store.js";

const forbiddenAttribute =
  /(authorization|cookie|credential|password|secret|token|api.?key|prompt|input|output|memory|payload|content|email|phone)/i;
const secretValue =
  /(bearer\s+[A-Za-z0-9._~+/-]+=*|sk-[A-Za-z0-9]{12,}|oauth|refresh_token|access_token)/i;
const safeAttributeKey = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const retentionDays = {
  SHORT: 7,
  STANDARD: 30,
  EXTENDED: 90,
  SECURITY_CRITICAL: 365,
} as const;
const severityWeight = { INFO: 0.25, WARNING: 0.5, HIGH: 0.75, CRITICAL: 1 } as const;

export const redactTelemetryAttributes = (input: Record<string, unknown>) => {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!safeAttributeKey.test(key) || forbiddenAttribute.test(key)) continue;
    if (typeof value === "string") {
      if (secretValue.test(value)) continue;
      output[key] = value.slice(0, 240);
    } else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "boolean") output[key] = value;
  }
  return output;
};

const telemetryError = (code: string, message: string, statusCode = 403) =>
  Object.assign(new Error(message), { code, statusCode });
const expiry = (at: Date, retention: keyof typeof retentionDays) =>
  new Date(at.getTime() + retentionDays[retention] * 86_400_000).toISOString();
const normalizeFormula = (value: string) =>
  value.toUpperCase().replace(/\s+/g, " ").trim();
const fingerprint = (input: {
  canonicalKey: string;
  formula: string;
  unit: string;
  version: number;
  dimensions: string[];
  timeField: string | null;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        canonicalKey: input.canonicalKey,
        formula: normalizeFormula(input.formula),
        unit: input.unit.toUpperCase(),
        version: input.version,
        dimensions: [...input.dimensions].sort(),
        timeField: input.timeField,
      }),
    )
    .digest("hex");
const numberValue = (value: string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const confidenceForFreshness = (freshness: PortfolioMetricView["freshness"]) =>
  freshness === "FRESH"
    ? 0.95
    : freshness === "STALE"
      ? 0.55
      : freshness === "CONFLICTED"
        ? 0.3
        : 0.1;

export interface SystemSpanInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  ownerId: string;
  companyId?: string | null;
  service: string;
  operation: string;
  status: "OK" | "ERROR";
  errorSource?: SystemTelemetrySpan["errorSource"];
  durationMs: number;
  objectiveId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  assignmentId?: string | null;
  agentDefinitionId?: string | null;
  capabilityId?: string | null;
  provider?: string | null;
  model?: string | null;
  attributes?: Record<string, unknown>;
  retentionClass?: SystemTelemetrySpan["retentionClass"];
  sampled?: boolean;
  startedAt: string;
  endedAt: string;
}

export class OwnerPortfolioObservabilityService {
  #managementProvider?: (ownerId: string, companyId: string) => Promise<PortfolioCompanySummary["management"]>;
  constructor(
    readonly store: ObservabilityStore,
    readonly companies: CompanyStore,
    readonly companyData: CompanyDataStore,
    readonly agents: AgentStore,
    readonly audit?: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  setManagementSummaryProvider(provider: (ownerId: string, companyId: string) => Promise<PortfolioCompanySummary["management"]>) {
    this.#managementProvider = provider;
  }

  async recordSystemSpan(raw: SystemSpanInput) {
    if (
      raw.companyId &&
      !(await this.companies.findCompany(raw.ownerId, raw.companyId))
    )
      throw telemetryError(
        "TELEMETRY_COMPANY_SCOPE_MISMATCH",
        "Telemetry company scope is invalid.",
      );
    const retentionClass =
      raw.retentionClass ?? (raw.status === "ERROR" ? "EXTENDED" : "SHORT");
    const span = SystemTelemetrySpanSchema.parse({
      id: crypto.randomUUID(),
      traceId: raw.traceId,
      spanId: raw.spanId,
      parentSpanId: raw.parentSpanId ?? null,
      ownerId: raw.ownerId,
      companyId: raw.companyId ?? null,
      service: raw.service,
      operation: raw.operation,
      status: raw.status,
      errorSource: raw.errorSource ?? null,
      durationMs: raw.durationMs,
      objectiveId: raw.objectiveId ?? null,
      workflowId: raw.workflowId ?? null,
      taskId: raw.taskId ?? null,
      assignmentId: raw.assignmentId ?? null,
      agentDefinitionId: raw.agentDefinitionId ?? null,
      capabilityId: raw.capabilityId ?? null,
      provider: raw.provider ?? null,
      model: raw.model ?? null,
      attributes: redactTelemetryAttributes(raw.attributes ?? {}),
      retentionClass,
      sampled: raw.sampled ?? true,
      startedAt: raw.startedAt,
      endedAt: raw.endedAt,
      expiresAt: expiry(new Date(raw.endedAt), retentionClass),
    });
    await this.store.saveSystemSpan(span);
    return span;
  }

  async recordAITrace(raw: unknown) {
    const input = AIObservabilityTraceSchema.omit({ id: true, expiresAt: true }).parse(
      raw,
    );
    if (!(await this.companies.findCompany(input.ownerId, input.companyId)))
      throw telemetryError(
        "AI_TELEMETRY_COMPANY_SCOPE_MISMATCH",
        "AI telemetry company scope is invalid.",
      );
    if (input.assignmentId) {
      const assignments = await this.agents.listAssignments(
        input.ownerId,
        input.companyId,
      );
      if (!assignments.some((item) => item.id === input.assignmentId))
        throw telemetryError(
          "AI_TELEMETRY_ASSIGNMENT_SCOPE_MISMATCH",
          "AI telemetry assignment is not in this company.",
        );
    }
    const policy = await this.companyData.findActivePolicy(
      input.ownerId,
      input.companyId,
    );
    const policyRouting = policy?.modelRouting[input.dataSensitivity];
    const exportPolicy =
      input.dataSensitivity === "RESTRICTED" || policyRouting === "LOCAL_ONLY"
        ? "LOCAL_ONLY"
        : input.dataSensitivity === "CONFIDENTIAL"
          ? "METADATA_ONLY"
          : input.exportPolicy;
    const trace = AIObservabilityTraceSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      exportPolicy,
      expiresAt: expiry(new Date(input.endedAt), input.retentionClass),
    });
    await this.store.saveAITrace(trace);
    return trace;
  }

  async listSystemSpans(
    ownerId: string,
    query: {
      companyId?: string;
      traceId?: string;
      status?: "OK" | "ERROR";
      limit: number;
    },
  ) {
    if (
      query.companyId &&
      !(await this.companies.findCompany(ownerId, query.companyId))
    )
      throw telemetryError(
        "PORTFOLIO_COMPANY_SCOPE_MISMATCH",
        "Company is outside the owner portfolio.",
      );
    return this.store.listSystemSpans(ownerId, query);
  }
  async listAITraces(
    ownerId: string,
    query: {
      companyId?: string;
      provider?: string;
      model?: string;
      taskClass?: string;
      limit: number;
    },
  ) {
    if (
      query.companyId &&
      !(await this.companies.findCompany(ownerId, query.companyId))
    )
      throw telemetryError(
        "PORTFOLIO_COMPANY_SCOPE_MISMATCH",
        "Company is outside the owner portfolio.",
      );
    return this.store.listAITraces(ownerId, query);
  }

  async compareMetrics(ownerId: string, raw: unknown) {
    const input = PortfolioMetricComparisonRequestSchema.parse(raw);
    const companies = await this.companies.listCompanies(ownerId);
    const allowed = new Map(companies.map((company) => [company.id, company]));
    if (input.companyIds.some((id) => !allowed.has(id)))
      throw telemetryError(
        "PORTFOLIO_COMPANY_SCOPE_MISMATCH",
        "Metric comparison contains an unauthorized company.",
      );
    const views = (
      await Promise.all(
        input.companyIds.map((id) =>
          this.metricViews(
            ownerId,
            allowed.get(id)!,
            input.canonicalMetricKey,
            input.period,
          ),
        ),
      )
    ).flat();
    const reasons: string[] = [];
    if (views.length !== input.companyIds.length)
      reasons.push("One or more companies do not have an available canonical metric.");
    if (new Set(views.map((view) => view.definitionFingerprint)).size > 1)
      reasons.push(
        "Metric definition, version, dimensions, time field, or unit differs.",
      );
    if (new Set(views.map((view) => view.unit.toUpperCase())).size > 1)
      reasons.push(
        "Units or currencies differ and no approved conversion path was provided.",
      );
    if (new Set(views.map((view) => view.period)).size > 1)
      reasons.push("Observation periods differ.");
    return PortfolioMetricCompatibilitySchema.parse({
      status: reasons.length ? "NOT_DIRECTLY_COMPARABLE" : "COMPARABLE",
      canonicalMetricKey: input.canonicalMetricKey,
      reasons,
      views,
    });
  }

  async dashboard(ownerId: string) {
    const companies = await this.companies.listCompanies(ownerId);
    const [spans, aiTraces, alertStates] = await Promise.all([
      this.store.listSystemSpans(ownerId, { limit: 5_000 }),
      this.store.listAITraces(ownerId, { limit: 10_000 }),
      this.store.listAlertStates(ownerId),
    ]);
    const generatedAt = this.now().toISOString();
    const [summaries, companyLineage] = await Promise.all([
      Promise.all(
        companies.map((company) =>
          this.companySummary(
            ownerId,
            company,
            spans.filter((item) => item.companyId === company.id),
            aiTraces.filter((item) => item.companyId === company.id),
          ),
        ),
      ),
      Promise.all(
        companies.map(
          async (company) =>
            [
              company.id,
              await this.companyData.listLineageEdges(ownerId, company.id),
            ] as const,
        ),
      ),
    ]);
    const systemHealth = this.systemOverview(spans);
    const aiHealth = this.aiOverview(aiTraces);
    const rawSignals = [
      ...summaries.flatMap((summary) =>
        this.attentionSignals(ownerId, summary, generatedAt),
      ),
      ...aiHealth.regressions.map((regression) => {
        const company = summaries.find(
          (item) => item.companyId === regression.companyId,
        )!;
        const severity = regression.kind === "COMBINED" ? "HIGH" : "WARNING";
        return PortfolioAttentionSignalSchema.parse({
          id: `${regression.companyId}:AI_REGRESSION:${regression.provider}:${regression.model}:${regression.taskClass}`,
          ownerId,
          companyId: regression.companyId,
          companyName: company.companyName,
          signalType: "AI_REGRESSION",
          title: `${regression.kind.replaceAll("_", " ")} for ${regression.model}`,
          severity,
          confidence: regression.confidence,
          businessImpact: 0.7,
          urgency: 0.6,
          recoverability: 0.8,
          priority: severityWeight[severity] + regression.confidence + 0.7 + 0.6 + 0.2,
          evidenceRefs: regression.evidence,
          status: "OPEN",
          snoozedUntil: null,
          detectedAt: generatedAt,
        });
      }),
    ];
    const stateMap = new Map(alertStates.map((state) => [state.signalId, state]));
    const attentionQueue = rawSignals
      .map((signal) => {
        const state = stateMap.get(signal.id);
        if (!state) return signal;
        if (
          state.status === "SNOOZED" &&
          state.snoozedUntil &&
          state.snoozedUntil <= generatedAt
        )
          return signal;
        return PortfolioAttentionSignalSchema.parse({
          ...signal,
          status: state.status,
          snoozedUntil: state.snoozedUntil,
        });
      })
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          right.detectedAt.localeCompare(left.detectedAt),
      );
    const insights = this.insights(
      summaries,
      attentionQueue,
      spans,
      aiTraces,
      new Map(companyLineage),
    );
    const portfolioMetrics = summaries.flatMap((summary) => summary.metrics);
    const evidenceQuality = portfolioMetrics.some(
      (item) => item.freshness === "CONFLICTED",
    )
      ? "CONFLICTED"
      : portfolioMetrics.some((item) => item.freshness === "STALE")
        ? "STALE"
        : portfolioMetrics.length &&
            portfolioMetrics.every((item) => item.freshness === "FRESH")
          ? "FRESH"
          : "UNAVAILABLE";
    return OwnerPortfolioDashboardSchema.parse({
      ownerId,
      generatedAt,
      companies: summaries,
      portfolioMetrics,
      attentionQueue,
      systemHealth,
      aiHealth,
      insights,
      evidenceQuality,
    });
  }

  async updateAlert(
    ownerId: string,
    signalId: string,
    raw: unknown,
    request: { requestId: string; ipAddress: string },
  ) {
    const input = PortfolioAlertActionSchema.parse(raw);
    const current = (await this.dashboard(ownerId)).attentionQueue.find(
      (item) => item.id === signalId,
    );
    if (!current)
      throw telemetryError(
        "PORTFOLIO_SIGNAL_NOT_FOUND",
        "Portfolio attention signal was not found.",
        404,
      );
    const at = this.now().toISOString();
    await this.store.saveAlertState({
      ownerId,
      companyId: current.companyId,
      signalId,
      status: input.action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "SNOOZED",
      snoozedUntil: input.snoozedUntil ?? null,
      updatedAt: at,
    });
    await this.audit?.({
      eventType: "PORTFOLIO_ALERT_UPDATED",
      ownerId,
      companyId: current.companyId,
      outcome: "SUCCESS",
      reason: input.action,
      requestId: request.requestId,
      ipAddress: request.ipAddress,
      metadata: { signalId },
    });
    return (await this.dashboard(ownerId)).attentionQueue.find(
      (item) => item.id === signalId,
    )!;
  }

  async executiveBrief(ownerId: string) {
    const dashboard = await this.dashboard(ownerId);
    return {
      generatedAt: dashboard.generatedAt,
      summary: dashboard.attentionQueue.length
        ? `${dashboard.attentionQueue.filter((item) => item.severity === "HIGH" || item.severity === "CRITICAL").length} high-priority portfolio issues need review.`
        : "No active portfolio issues require attention.",
      companiesNeedingAttention: [
        ...new Set(
          dashboard.attentionQueue
            .filter((item) => item.status === "OPEN")
            .map((item) => item.companyName),
        ),
      ],
      insights: dashboard.insights,
      executed: false as const,
    };
  }

  private async metricViews(
    ownerId: string,
    company: Company,
    canonicalKey?: string,
    period?: string,
  ) {
    const metrics = (await this.companyData.listMetrics(ownerId, company.id)).filter(
      (item) =>
        item.status === "ACTIVE" &&
        (!canonicalKey || item.canonicalKey === canonicalKey),
    );
    return Promise.all(
      metrics.map(async (metric) => {
        const observations = (
          await this.companyData.listMetricObservations(ownerId, company.id, metric.id)
        ).sort((left, right) => right.observedAt.localeCompare(left.observedAt));
        const current = period
          ? (observations.find((item) => item.dimensions.period === period) ?? null)
          : (observations[0] ?? null);
        const previous = current
          ? (observations.find((item) => item.observedAt < current.observedAt) ?? null)
          : null;
        const currentNumber = numberValue(current?.value);
        const previousNumber = numberValue(previous?.value);
        const delta =
          currentNumber !== null && previousNumber !== null
            ? currentNumber - previousNumber
            : null;
        const deltaPercent =
          delta !== null && previousNumber !== null && previousNumber !== 0
            ? delta / Math.abs(previousNumber)
            : null;
        const freshness = !current
          ? "UNAVAILABLE"
          : current.qualityState === "CONFLICT"
            ? "CONFLICTED"
            : current.expiresAt <= this.now().toISOString()
              ? "STALE"
              : "FRESH";
        return PortfolioMetricViewSchema.parse({
          ownerId,
          companyId: company.id,
          companyName: company.name,
          canonicalMetricKey: metric.canonicalKey,
          metricId: metric.id,
          metricVersion: metric.version,
          definitionFingerprint: fingerprint(metric),
          value: current?.value ?? null,
          previousValue: previous?.value ?? null,
          delta,
          deltaPercent,
          trend:
            delta === null
              ? "INSUFFICIENT_DATA"
              : Math.abs(delta) < 1e-12
                ? "FLAT"
                : delta > 0
                  ? "UP"
                  : "DOWN",
          unit: metric.unit,
          period: current?.dimensions.period ?? "LATEST",
          dimensions: metric.dimensions,
          freshness,
          quality: current?.qualityState ?? "UNAVAILABLE",
          observedAt: current?.observedAt ?? null,
          lineageRefs: current?.provenanceEntityIds ?? metric.sourceEntityIds,
        });
      }),
    );
  }

  private async companySummary(
    ownerId: string,
    company: Company,
    spans: SystemTelemetrySpan[],
    aiTraces: AIObservabilityTrace[],
  ): Promise<PortfolioCompanySummary> {
    const [metrics, datasets, pipelines, integrations, assignments, management] = await Promise.all(
      [
        this.metricViews(ownerId, company),
        this.companyData.listDatasets(ownerId, company.id),
        this.companyData.listPipelines(ownerId, company.id),
        this.companyData.listIntegrationBindings(ownerId, company.id),
        this.agents.listAssignments(ownerId, company.id),
        this.#managementProvider?.(ownerId, company.id) ?? Promise.resolve({ topPriority: null, totalObjectives: 0, objectivesAtRisk: 0, decisionsRequiringOwner: 0, latestReviewAt: null, nextRecommendedFocus: "Open company management to establish priorities." }),
      ],
    );
    const stale = datasets.filter(
      (item) => item.freshness.state === "STALE" || item.freshness.state === "DEGRADED",
    ).length;
    const degradedPipelines = pipelines.filter(
      (item) => item.status === "DEGRADED" || item.status === "FAILED",
    ).length;
    const errors = spans.filter((item) => item.status === "ERROR").length;
    const aiSuccess = aiTraces.length
      ? aiTraces.filter((item) => item.success).length / aiTraces.length
      : null;
    const aiCost = aiTraces.reduce((sum, item) => sum + item.costCredits, 0);
    const businessWarnings = metrics.filter(
      (item) => item.trend === "DOWN" && item.freshness === "FRESH",
    ).length;
    const health = [
      {
        dimension: "BUSINESS" as const,
        state: businessWarnings
          ? ("WARNING" as const)
          : metrics.length
            ? ("HEALTHY" as const)
            : ("UNKNOWN" as const),
        confidence: metrics.length
          ? Math.min(...metrics.map((item) => confidenceForFreshness(item.freshness)))
          : 0.1,
        evidence: [
          businessWarnings
            ? `${businessWarnings} fresh canonical metrics are trending down.`
            : metrics.length
              ? "No fresh downward metric trend detected."
              : "No canonical metric observations available.",
        ],
      },
      {
        dimension: "DATA" as const,
        state:
          stale + degradedPipelines > 2
            ? ("CRITICAL" as const)
            : stale + degradedPipelines
              ? ("WARNING" as const)
              : datasets.length
                ? ("HEALTHY" as const)
                : ("UNKNOWN" as const),
        confidence: datasets.length ? 0.95 : 0.2,
        evidence: [
          `${stale} stale or degraded datasets; ${degradedPipelines} degraded pipelines.`,
        ],
      },
      {
        dimension: "SYSTEM" as const,
        state:
          errors > 3
            ? ("CRITICAL" as const)
            : errors
              ? ("WARNING" as const)
              : spans.length
                ? ("HEALTHY" as const)
                : ("UNKNOWN" as const),
        confidence: spans.length ? 0.9 : 0.2,
        evidence: [`${errors} recorded runtime errors in the retained sample.`],
      },
      {
        dimension: "AI" as const,
        state:
          aiSuccess === null
            ? ("UNKNOWN" as const)
            : aiSuccess < 0.7
              ? ("CRITICAL" as const)
              : aiSuccess < 0.9
                ? ("WARNING" as const)
                : ("HEALTHY" as const),
        confidence: aiTraces.length ? Math.min(0.95, 0.5 + aiTraces.length / 100) : 0.2,
        evidence: [
          aiSuccess === null
            ? "No AI calls in retained telemetry."
            : `${Math.round(aiSuccess * 100)}% AI call success across ${aiTraces.length} calls.`,
        ],
      },
      {
        dimension: "WORKFORCE" as const,
        state: assignments.some(
          (item) => item.status === "PAUSED" || item.status === "REVOKED",
        )
          ? ("WARNING" as const)
          : assignments.length
            ? ("HEALTHY" as const)
            : ("UNKNOWN" as const),
        confidence: assignments.length ? 0.85 : 0.2,
        evidence: [`${assignments.length} company assignments observed.`],
      },
      {
        dimension: "OBJECTIVES" as const,
        state: management.objectivesAtRisk > 2 ? ("CRITICAL" as const) : management.objectivesAtRisk ? ("WARNING" as const) : management.totalObjectives ? ("HEALTHY" as const) : ("UNKNOWN" as const),
        confidence: management.totalObjectives ? 0.9 : 0.2,
        evidence: [
          management.totalObjectives ? `${management.objectivesAtRisk} of ${management.totalObjectives} objectives require attention.` : "No company-scoped objective evidence is available.",
        ],
      },
      {
        dimension: "ECONOMY" as const,
        state: aiTraces.length ? ("HEALTHY" as const) : ("UNKNOWN" as const),
        confidence: aiTraces.length ? 0.7 : 0.1,
        evidence: [
          aiTraces.length
            ? `${aiCost.toFixed(2)} credits correlated from AI Router responses; the Agent Economy remains the accounting authority.`
            : "No company-scoped AI cost evidence is available.",
        ],
      },
    ];
    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      health,
      metrics,
      dataAlerts: stale + degradedPipelines,
      systemIncidents: errors,
      aiSpendCredits: aiCost,
      aiSuccessRate: aiSuccess,
      integrationHealth: integrations.some((item) => item.status === "DEGRADED")
        ? "DEGRADED"
        : integrations.length
          ? "HEALTHY"
          : "UNAVAILABLE",
      management,
    };
  }

  private systemOverview(spans: SystemTelemetrySpan[]) {
    const groups = new Map<string, SystemTelemetrySpan[]>();
    for (const span of spans)
      groups.set(span.service, [...(groups.get(span.service) ?? []), span]);
    const serviceHealth = [...groups].map(([service, items]) => {
      const errors = items.filter((item) => item.status === "ERROR").length;
      const errorRate = items.length ? errors / items.length : 0;
      return {
        service,
        state:
          errorRate >= 0.2
            ? ("DOWN" as const)
            : errorRate >= 0.05
              ? ("DEGRADED" as const)
              : ("HEALTHY" as const),
        requests: items.length,
        errors,
        errorRate,
        averageLatencyMs: average(items.map((item) => item.durationMs)),
      };
    });
    return PortfolioSystemOverviewSchema.parse({
      serviceHealth,
      activeTraces: new Set(spans.map((item) => item.traceId)).size,
      incidentCount: spans.filter((item) => item.status === "ERROR").length,
    });
  }
  private aiOverview(traces: AIObservabilityTrace[]) {
    const groups = new Map<string, AIObservabilityTrace[]>();
    for (const trace of traces) {
      const key = `${trace.provider}:${trace.model}:${trace.taskClass}`;
      groups.set(key, [...(groups.get(key) ?? []), trace]);
    }
    const breakdown = [...groups].map(([, items]) => {
      const successes = items.filter((item) => item.success);
      return {
        provider: items[0]!.provider,
        model: items[0]!.model,
        taskClass: items[0]!.taskClass,
        calls: items.length,
        successRate: items.length ? successes.length / items.length : null,
        averageCostPerSuccess: successes.length
          ? successes.reduce((sum, item) => sum + item.costCredits, 0) /
            successes.length
          : null,
        averageLatencyMs: average(items.map((item) => item.latencyMs)),
      };
    });
    const regressions = [...groups].flatMap(([, items]) => {
      if (items.length < 4) return [];
      const sorted = [...items].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const midpoint = Math.floor(sorted.length / 2);
      const before = sorted.slice(0, midpoint),
        after = sorted.slice(midpoint);
      const success = (values: AIObservabilityTrace[]) =>
        values.filter((item) => item.success).length / values.length;
      const cost = (values: AIObservabilityTrace[]) =>
        average(values.map((item) => item.costCredits));
      const latency = (values: AIObservabilityTrace[]) =>
        average(values.map((item) => item.latencyMs));
      const qualityDown = success(after) < success(before) - 0.1,
        costUp = cost(after) > cost(before) * 1.25 && cost(before) > 0,
        latencyUp = latency(after) > latency(before) * 1.25;
      if (!qualityDown && !costUp && !latencyUp) return [];
      return [
        {
          companyId: items[0]!.companyId,
          provider: items[0]!.provider,
          model: items[0]!.model,
          taskClass: items[0]!.taskClass,
          kind:
            [qualityDown, costUp, latencyUp].filter(Boolean).length > 1
              ? ("COMBINED" as const)
              : qualityDown
                ? ("QUALITY_DOWN" as const)
                : costUp
                  ? ("COST_UP" as const)
                  : ("LATENCY_UP" as const),
          evidence: [
            `Success ${Math.round(success(before) * 100)}% → ${Math.round(success(after) * 100)}%.`,
            `Average cost ${cost(before).toFixed(2)} → ${cost(after).toFixed(2)} credits.`,
            `Average latency ${latency(before).toFixed(0)} → ${latency(after).toFixed(0)} ms.`,
          ],
          confidence: Math.min(0.95, 0.55 + items.length / 100),
        },
      ];
    });
    const successes = traces.filter((item) => item.success).length;
    return PortfolioAIOverviewSchema.parse({
      calls: traces.length,
      successfulCalls: successes,
      successRate: traces.length ? successes / traces.length : null,
      totalCostCredits: traces.reduce((sum, item) => sum + item.costCredits, 0),
      totalInputTokens: traces.reduce((sum, item) => sum + item.inputTokens, 0),
      totalOutputTokens: traces.reduce((sum, item) => sum + item.outputTokens, 0),
      averageLatencyMs: average(traces.map((item) => item.latencyMs)),
      modelBreakdown: breakdown,
      regressions,
    });
  }

  private attentionSignals(
    ownerId: string,
    summary: PortfolioCompanySummary,
    at: string,
  ) {
    const signals: PortfolioAttentionSignal[] = [];
    const add = (
      signalType: string,
      title: string,
      severity: keyof typeof severityWeight,
      confidence: number,
      impact: number,
      urgency: number,
      recoverability: number,
      evidenceRefs: string[],
    ) => {
      signals.push(
        PortfolioAttentionSignalSchema.parse({
          id: `${summary.companyId}:${signalType}`,
          ownerId,
          companyId: summary.companyId,
          companyName: summary.companyName,
          signalType,
          title,
          severity,
          confidence,
          businessImpact: impact,
          urgency,
          recoverability,
          priority:
            severityWeight[severity] +
            confidence +
            impact +
            urgency +
            (1 - recoverability),
          evidenceRefs,
          status: "OPEN",
          snoozedUntil: null,
          detectedAt: at,
        }),
      );
    };
    if (summary.dataAlerts)
      add(
        "DATA_FRESHNESS",
        `${summary.dataAlerts} data assets require attention`,
        summary.dataAlerts > 2 ? "HIGH" : "WARNING",
        0.95,
        0.7,
        0.8,
        0.8,
        [`company:${summary.companyId}:data`],
      );
    if (summary.systemIncidents)
      add(
        "SYSTEM_INCIDENTS",
        `${summary.systemIncidents} runtime failures observed`,
        summary.systemIncidents > 3 ? "HIGH" : "WARNING",
        0.9,
        0.75,
        0.85,
        0.6,
        [`company:${summary.companyId}:system`],
      );
    if (summary.aiSuccessRate !== null && summary.aiSuccessRate < 0.8)
      add(
        "AI_QUALITY",
        `AI success is ${Math.round(summary.aiSuccessRate * 100)}%`,
        summary.aiSuccessRate < 0.6 ? "HIGH" : "WARNING",
        0.85,
        0.7,
        0.65,
        0.7,
        [`company:${summary.companyId}:ai`],
      );
    for (const metric of summary.metrics.filter(
      (item) => item.trend === "DOWN" && item.freshness === "FRESH",
    ))
      add(
        `METRIC_${metric.canonicalMetricKey}`,
        `${metric.canonicalMetricKey} is trending down`,
        "HIGH",
        confidenceForFreshness(metric.freshness),
        0.85,
        0.75,
        0.5,
        [`metric:${metric.metricId}`],
      );
    return signals;
  }

  private insights(
    summaries: PortfolioCompanySummary[],
    signals: PortfolioAttentionSignal[],
    spans: SystemTelemetrySpan[],
    ai: AIObservabilityTrace[],
    lineageByCompany: Map<string, MetadataLineageEdge[]>,
  ) {
    return signals
      .filter((signal) => signal.status === "OPEN")
      .slice(0, 20)
      .map((signal): PortfolioExecutiveInsight => {
        const summary = summaries.find((item) => item.companyId === signal.companyId)!;
        const system = summary.health.find((item) => item.dimension === "SYSTEM");
        const aiHealth = summary.health.find((item) => item.dimension === "AI");
        const metricSignal = signal.signalType.startsWith("METRIC_");
        const category =
          metricSignal &&
          system?.state === "HEALTHY" &&
          ["HEALTHY", "UNKNOWN"].includes(aiHealth?.state ?? "UNKNOWN")
            ? "BUSINESS"
            : signal.signalType === "DATA_FRESHNESS"
              ? "DATA"
              : signal.signalType === "SYSTEM_INCIDENTS"
                ? "SYSTEM"
                : ["AI_QUALITY", "AI_REGRESSION"].includes(signal.signalType)
                  ? "AI"
                  : "MIXED";
        const evidence = [
          signal.title,
          ...summary.health.map(
            (item) => `${item.dimension}: ${item.evidence.join(" ")}`,
          ),
        ];
        return PortfolioExecutiveInsightSchema.parse({
          id: `insight:${signal.id}`,
          observation: signal.title,
          evidence,
          confidence: signal.confidence,
          companyId: signal.companyId,
          companyName: signal.companyName,
          category,
          potentialImpact:
            category === "DATA"
              ? "Decisions may rely on stale or degraded evidence."
              : category === "SYSTEM"
                ? "Execution reliability may be impaired."
                : category === "AI"
                  ? "AI cost or output reliability may be degraded."
                  : "Business performance requires owner review.",
          suggestedNextAction:
            category === "BUSINESS"
              ? "Inspect the metric lineage and commercial drivers before changing models or infrastructure."
              : category === "DATA"
                ? "Restore the affected source or pipeline before relying on current metrics."
                : category === "SYSTEM"
                  ? "Inspect the correlated trace waterfall and error attribution."
                  : category === "AI"
                    ? "Compare model performance within the same task class and review prompt/model versions."
                    : "Review the correlated evidence before authorizing action.",
          approvalRequired: false,
          lineage: (lineageByCompany.get(signal.companyId) ?? []).slice(0, 200),
          traceIds: spans
            .filter(
              (item) => item.companyId === signal.companyId && item.status === "ERROR",
            )
            .slice(0, 20)
            .map((item) => item.traceId),
          aiTraceIds: ai
            .filter((item) => item.companyId === signal.companyId && !item.success)
            .slice(0, 20)
            .map((item) => item.id),
        });
      });
  }
}
