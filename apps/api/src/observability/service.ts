import { createHash } from "node:crypto";

import {
  AIObservabilityTraceSchema,
  CreatePortfolioObjectiveRequestSchema,
  OwnerPortfolioDashboardSchema,
  PortfolioAIOverviewSchema,
  PortfolioAlertActionSchema,
  PortfolioAttentionSignalSchema,
  PortfolioExecutiveInsightSchema,
  PortfolioExecutiveBriefSchema,
  PortfolioCompanyComparisonRequestSchema,
  PortfolioCompanyComparisonSchema,
  PortfolioHealthSchema,
  PortfolioMetricComparisonRequestSchema,
  PortfolioMetricCompatibilitySchema,
  PortfolioMetricViewSchema,
  PortfolioObjectiveSchema,
  PortfolioEconomySchema,
  PortfolioResourceTransferRequestSchema,
  PortfolioResourceTransferSchema,
  OwnerReserveFundingRequestSchema,
  OwnerReserveFundingSchema,
  GovernorProposalSchema,
  GovernorProposalDecisionRequestSchema,
  ProposedActionSchema,
  PortfolioSystemOverviewSchema,
  SystemTelemetrySpanSchema,
  type AIObservabilityTrace,
  type Company,
  type MetadataLineageEdge,
  type PortfolioAttentionSignal,
  type PortfolioCompanySummary,
  type PortfolioExecutiveInsight,
  type PortfolioMetricView,
  type GovernorProposal,
  type SystemTelemetrySpan,
} from "@alexa-control/shared";

import type { AgentStore } from "../agents/store.js";
import type { PortfolioEconomyStore } from "../agent-economy/portfolio-store.js";
import type { CompanyDataStore } from "../company-data/store.js";
import type { CompanyStore } from "../companies/store.js";
import type { ApprovalService, GovernanceAuditWriter } from "../governance/approval-service.js";
import { companyScope } from "../companies/scope.js";
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
const componentWeight = {
  BUSINESS: 0.25,
  OBJECTIVES: 0.2,
  DATA: 0.15,
  SYSTEM: 0.15,
  WORKFORCE: 0.1,
  ECONOMY: 0.1,
  AI: 0.05,
} as const;
const stateScore = { HEALTHY: 100, WARNING: 60, CRITICAL: 20, UNKNOWN: null } as const;
const priorityWeight = { CRITICAL: 4, HIGH: 2, NORMAL: 1, LOW: 0.5 } as const;
const deterministicUuid = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

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

type CompanyObjectiveProvider = (input: {
  ownerId: string; companyId: string; proposal: GovernorProposal;
  title: string; canonicalMetricKey: string | null;
  requestId: string; ipAddress: string;
}) => Promise<string>;

export class OwnerPortfolioObservabilityService {
  #managementProvider?: (ownerId: string, companyId: string) => Promise<PortfolioCompanySummary["management"]>;
  #portfolioEconomy?: PortfolioEconomyStore;
  #approvals?: ApprovalService;
  #companyObjectiveProvider?: CompanyObjectiveProvider;
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

  setPortfolioEconomy(store: PortfolioEconomyStore, approvals: ApprovalService) {
    this.#portfolioEconomy = store;
    this.#approvals = approvals;
  }

  setCompanyObjectiveProvider(provider: CompanyObjectiveProvider) {
    this.#companyObjectiveProvider = provider;
  }

  async portfolioEconomy(ownerId: string) {
    if (!this.#portfolioEconomy)
      throw telemetryError("PORTFOLIO_ECONOMY_UNAVAILABLE", "Portfolio economy is unavailable.", 503);
    const at = this.now().toISOString();
    const companies = (await this.companies.listCompanies(ownerId)).filter((item) => item.status !== "ARCHIVED");
    const accounts = await this.#portfolioEconomy.ensureAccounts(ownerId, companies.map((item) => item.id), at);
    const reserve = accounts.find((item) => item.accountType === "OWNER_RESERVE");
    if (!reserve)
      throw telemetryError("OWNER_RESERVE_MISSING", "Owner reserve could not be resolved.", 503);
    return PortfolioEconomySchema.parse({
      ownerId,
      ownerReserveAvailable: reserve.availableCredits,
      allocatedAcrossCompanies: accounts.filter((item) => item.accountType === "COMPANY").reduce((sum, item) => sum + item.lifetimeAllocated, 0),
      companyAccounts: companies.map((company) => {
        const account = accounts.find((item) => item.companyId === company.id);
        return {
          companyId: company.id,
          companyName: company.name,
          allocatedCredits: account?.lifetimeAllocated ?? 0,
          spentCredits: account?.lifetimeSpent ?? 0,
          reservedCredits: account?.reservedCredits ?? 0,
          availableCredits: account?.availableCredits ?? 0,
        };
      }),
      generatedAt: at,
    });
  }

  async transferPortfolioResources(
    ownerId: string,
    raw: unknown,
    request: { requestId: string; ipAddress: string; deviceId?: string },
  ) {
    if (!this.#portfolioEconomy || !this.#approvals)
      throw telemetryError("PORTFOLIO_ECONOMY_UNAVAILABLE", "Portfolio economy is unavailable.", 503);
    const input = PortfolioResourceTransferRequestSchema.parse(raw);
    const company = await this.companies.findCompany(ownerId, input.companyId);
    if (!company || company.status !== "ACTIVE")
      throw telemetryError("PORTFOLIO_COMPANY_SCOPE_MISMATCH", "Destination company is unauthorized or not active.");
    const existing = await this.#portfolioEconomy.findTransfer(ownerId, input.idempotencyKey);
    if (existing)
      return PortfolioResourceTransferSchema.parse({
        transferId: existing.id, ownerId, companyId: existing.companyId, amount: existing.amount,
        reason: existing.reason, idempotencyKey: existing.idempotencyKey,
        approvalId: existing.approvalId, status: "SETTLED", createdAt: existing.createdAt,
        settledAt: existing.settledAt,
      });
    await this.#portfolioEconomy.ensureAccounts(ownerId, [company.id], this.now().toISOString());
    const action = ProposedActionSchema.parse({
      actionId: deterministicUuid(`portfolio-resource:${ownerId}:${input.idempotencyKey}`),
      toolName: "portfolio.allocate_credits",
      arguments: { companyId: company.id, amount: input.amount, reason: input.reason, idempotencyKey: input.idempotencyKey },
    });
    const approval = await companyScope.run(
      { ownerId, companyId: company.id, role: "OWNER", requestId: request.requestId },
      async () => input.approvalId
        ? this.#approvals!.findMatchingApproved(ownerId, action)
        : this.#approvals!.create({
            ownerId, ...(request.deviceId ? { requestedByDeviceId: request.deviceId } : {}),
            action, riskLevel: "high", approvalRequirement: "recent_authentication",
            ipAddress: request.ipAddress, requestId: request.requestId,
          }),
    );
    if (!input.approvalId || !approval || approval.id !== input.approvalId) {
      const pendingId = input.approvalId ?? approval?.id ?? null;
      await this.audit?.({
        eventType: "PORTFOLIO_RESOURCE_TRANSFER_REQUESTED", ownerId, companyId: company.id,
        outcome: "SUCCESS", reason: "Owner-to-company allocation requires canonical approval.",
        requestId: request.requestId, ipAddress: request.ipAddress,
        metadata: { companyId: company.id, amount: input.amount, approvalId: pendingId },
      });
      return PortfolioResourceTransferSchema.parse({
        transferId: deterministicUuid(`portfolio-pending:${ownerId}:${input.idempotencyKey}`),
        ownerId, companyId: company.id, amount: input.amount, reason: input.reason,
        idempotencyKey: input.idempotencyKey, approvalId: pendingId,
        status: "APPROVAL_REQUIRED", createdAt: this.now().toISOString(), settledAt: null,
      });
    }
    const at = this.now().toISOString();
    const settled = await this.#portfolioEconomy.transfer({
      ownerId, companyId: company.id, amount: input.amount, reason: input.reason,
      idempotencyKey: input.idempotencyKey, approvalId: approval.id, at,
    });
    await this.audit?.({
      eventType: "PORTFOLIO_RESOURCE_TRANSFER_SETTLED", ownerId, companyId: company.id,
      outcome: "SUCCESS", reason: "Approved owner reserve allocation settled atomically.",
      requestId: request.requestId, ipAddress: request.ipAddress,
      metadata: { transferId: settled.id, companyId: company.id, amount: settled.amount, approvalId: approval.id },
    });
    return PortfolioResourceTransferSchema.parse({
      transferId: settled.id, ownerId, companyId: settled.companyId, amount: settled.amount,
      reason: settled.reason, idempotencyKey: settled.idempotencyKey, approvalId: settled.approvalId,
      status: "SETTLED", createdAt: settled.createdAt, settledAt: settled.settledAt,
    });
  }

  async fundOwnerReserve(
    ownerId: string,
    raw: unknown,
    request: { requestId: string; ipAddress: string; deviceId?: string },
  ) {
    if (!this.#portfolioEconomy || !this.#approvals)
      throw telemetryError("PORTFOLIO_ECONOMY_UNAVAILABLE", "Portfolio economy is unavailable.", 503);
    const parsed = OwnerReserveFundingRequestSchema.safeParse(raw);
    if (!parsed.success) {
      await this.audit?.({
        eventType: "OWNER_RESERVE_FUNDING_DENIED", ownerId, outcome: "DENIED",
        reason: "Owner reserve funding request failed bounded input validation.",
        requestId: request.requestId, ipAddress: request.ipAddress,
      });
      throw parsed.error;
    }
    const input = parsed.data;
    const existing = await this.#portfolioEconomy.findFunding(ownerId, input.idempotencyKey);
    if (existing) return existing;
    const action = ProposedActionSchema.parse({
      actionId: deterministicUuid(`owner-reserve-fund:${ownerId}:${input.idempotencyKey}`),
      toolName: "portfolio.fund_owner_reserve",
      arguments: { amount: input.amount, reason: input.reason, idempotencyKey: input.idempotencyKey },
    });
    const approval = input.approvalId
      ? await this.#approvals.findMatchingApproved(ownerId, action)
      : await this.#approvals.create({
          ownerId, ...(request.deviceId ? { requestedByDeviceId: request.deviceId } : {}),
          action, riskLevel: "high", approvalRequirement: "recent_authentication",
          ipAddress: request.ipAddress, requestId: request.requestId,
        });
    if (!input.approvalId || !approval || approval.id !== input.approvalId) {
      const pendingId = input.approvalId ?? approval?.id ?? null;
      await this.audit?.({
        eventType: "OWNER_RESERVE_FUNDING_REQUESTED", ownerId, outcome: "SUCCESS",
        reason: "Administrative owner reserve funding requires canonical recent-auth approval.",
        requestId: request.requestId, ipAddress: request.ipAddress,
        metadata: { amount: input.amount, approvalId: pendingId },
      });
      return OwnerReserveFundingSchema.parse({
        fundingId: deterministicUuid(`owner-reserve-pending:${ownerId}:${input.idempotencyKey}`),
        ownerId, amount: input.amount, reason: input.reason, authority: "OWNER_RESERVE_FUND",
        authorityRef: "canonical-owner-administration", idempotencyKey: input.idempotencyKey,
        approvalId: pendingId, status: "APPROVAL_REQUIRED", createdAt: this.now().toISOString(),
        settledAt: null,
      });
    }
    const funding = await this.#portfolioEconomy.fundOwnerReserve({
      ownerId, amount: input.amount, reason: input.reason,
      authorityRef: `OWNER_RESERVE_FUND:${ownerId}`, idempotencyKey: input.idempotencyKey,
      approvalId: approval.id, at: this.now().toISOString(),
    });
    await this.audit?.({
      eventType: "OWNER_RESERVE_FUNDED", ownerId, outcome: "SUCCESS",
      reason: "Approved administrative funding was atomically recorded in the immutable reserve ledger.",
      requestId: request.requestId, ipAddress: request.ipAddress,
      metadata: { fundingId: funding.fundingId, amount: funding.amount, approvalId: approval.id },
    });
    return funding;
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

  async compareCompanies(ownerId: string, raw: unknown) {
    const input = PortfolioCompanyComparisonRequestSchema.parse(raw);
    const dashboard = await this.dashboard(ownerId);
    const allowed = new Map(dashboard.companies.map((item) => [item.companyId, item]));
    if (input.companyIds.some((companyId) => !allowed.has(companyId)))
      throw telemetryError(
        "PORTFOLIO_COMPANY_SCOPE_MISMATCH",
        "Company comparison contains an unauthorized or inactive company.",
      );
    return PortfolioCompanyComparisonSchema.parse({
      generatedAt: dashboard.generatedAt,
      companies: input.companyIds.map((companyId) => {
        const company = allowed.get(companyId)!;
        const freshness = company.metrics.map((item) => item.freshness);
        const evidenceQuality = freshness.includes("CONFLICTED") ? "CONFLICTED"
          : freshness.includes("STALE") ? "STALE"
            : freshness.length && freshness.every((item) => item === "FRESH") ? "FRESH"
              : "UNAVAILABLE";
        return {
          companyId,
          companyName: company.companyName,
          priority: company.priority,
          healthScore: company.healthScore,
          healthState: company.healthState,
          activeObjectives: company.activeObjectives,
          atRiskObjectives: company.atRiskObjectives,
          blockedObjectives: company.blockedObjectives,
          activeAgents: company.activeAgents,
          spendCredits: company.totalSpendCredits,
          evidenceQuality,
        };
      }),
      caveats: [
        "Health is explainable operational evidence, not a valuation or strategic verdict.",
        "Spend is shown in Agent Economy credits and is not combined with business-currency metrics.",
        "Unknown evidence remains unknown and is not treated as healthy or zero.",
      ],
      executed: false,
    });
  }

  async createPortfolioObjective(
    ownerId: string,
    raw: unknown,
    request: { requestId: string; ipAddress: string },
  ) {
    const input = CreatePortfolioObjectiveRequestSchema.parse(raw);
    const existing = await this.store.findPortfolioObjectiveByIdempotencyKey(
      ownerId,
      input.idempotencyKey,
    );
    if (existing) return existing;
    const dashboard = await this.dashboard(ownerId);
    const allowed = new Map(dashboard.companies.map((item) => [item.companyId, item]));
    const selectedIds = input.selectedCompanyIds ?? dashboard.companies
      .filter((item) => item.companyStatus === "ACTIVE")
      .map((item) => item.companyId);
    if (!selectedIds.length)
      throw telemetryError(
        "PORTFOLIO_OBJECTIVE_COMPANY_REQUIRED",
        "At least one active, authorized company is required.",
        409,
      );
    if (selectedIds.some((companyId) => !allowed.has(companyId)))
      throw telemetryError(
        "PORTFOLIO_COMPANY_SCOPE_MISMATCH",
        "Portfolio objective contains an unauthorized or archived company.",
      );
    const selected = selectedIds.map((companyId) => allowed.get(companyId)!);
    const rawWeights = selected.map((company) => {
      if (company.companyStatus !== "ACTIVE") return 0;
      if (input.strategy === "EQUAL") return 1;
      if (input.strategy === "CAPACITY_WEIGHTED")
        return Math.max(1, company.activeAgents) / Math.max(1, company.activeObjectives + company.atRiskObjectives);
      return priorityWeight[company.priority] * (company.healthState === "CRITICAL" ? 0.5 : 1);
    });
    const denominator = rawWeights.reduce((sum, value) => sum + value, 0);
    if (!denominator)
      throw telemetryError(
        "PORTFOLIO_OBJECTIVE_NO_ELIGIBLE_COMPANY",
        "No selected company is active and eligible for a proposal.",
        409,
      );
    const at = this.now().toISOString();
    const objective = PortfolioObjectiveSchema.parse({
      id: deterministicUuid(`${ownerId}:${input.idempotencyKey}`),
      ownerId,
      idempotencyKey: input.idempotencyKey,
      title: input.title,
      desiredOutcome: input.desiredOutcome,
      canonicalMetricKey: input.canonicalMetricKey,
      targetValue: input.targetValue,
      unit: input.unit,
      deadline: input.deadline,
      budgetCredits: input.budgetCredits,
      strategy: input.strategy,
      constraints: input.constraints,
      status: "PROPOSED",
      allocations: selected.map((company, index) => {
        const weight = rawWeights[index]! / denominator;
        return {
          companyId: company.companyId,
          companyName: company.companyName,
          weight,
          proposedTargetValue: input.targetValue === null
            ? null
            : ((Number(input.targetValue) * weight).toFixed(6).replace(/\.?0+$/, "") || "0"),
          status: company.companyStatus === "ACTIVE" ? "PROPOSED" : "REJECTED",
          reason: company.companyStatus === "ACTIVE"
            ? `${input.strategy.toLowerCase().replaceAll("_", " ")} proposal; company Governor acceptance is still required.`
            : "Paused companies cannot accept new portfolio objective work.",
          governorProposalId: null,
          companyObjectiveId: null,
        };
      }),
      createdAt: at,
      updatedAt: at,
      executed: false,
    });
    await this.store.savePortfolioObjective(objective);
    let persisted = (await this.store.findPortfolioObjectiveByIdempotencyKey(
      ownerId,
      input.idempotencyKey,
    ))!;
    const expiresAt = input.deadline && new Date(input.deadline).getTime() > this.now().getTime()
      ? input.deadline
      : new Date(this.now().getTime() + 7 * 86_400_000).toISOString();
    const allocations = await Promise.all(persisted.allocations.map(async (allocation) => {
      const assignments = await this.agents.listAssignments(ownerId, allocation.companyId);
      const governor = assignments.find((item) => item.isGovernor && item.status === "ACTIVE");
      const proposalId = deterministicUuid(`governor-proposal:${persisted.id}:${allocation.companyId}`);
      const proposal = GovernorProposalSchema.parse({
        id: proposalId, ownerId, companyId: allocation.companyId,
        portfolioObjectiveId: persisted.id, sourceGovernorId: "portfolio_coordinator",
        targetGovernorAssignmentId: governor?.id ?? null,
        proposalType: "PORTFOLIO_OBJECTIVE_ALLOCATION",
        status: governor ? "DELIVERED" : "REJECTED",
        revisions: [{
          version: 1, proposedBy: "PORTFOLIO",
          terms: {
            requestedOutcome: persisted.desiredOutcome,
            targetValue: allocation.proposedTargetValue,
            unit: persisted.unit,
            budgetCredits: Math.round(persisted.budgetCredits * allocation.weight),
            deadline: persisted.deadline,
            constraints: persisted.constraints,
          },
          reasonCode: governor ? "PORTFOLIO_PROPOSED" : "CAPABILITY_UNAVAILABLE",
          explanation: governor ? "Delivered to the existing company Governor for bounded review." : "No active company Governor is available.",
          createdAt: at,
        }],
        maxCounterproposalRounds: 2,
        idempotencyKey: `governor:${persisted.id}:${allocation.companyId}`,
        companyObjectiveId: null, createdAt: at, updatedAt: at, expiresAt,
        decisionIdempotencyKeys: [],
      });
      await this.store.saveGovernorProposal(proposal);
      await this.audit?.({
        eventType: governor ? "GOVERNOR_PROPOSAL_DELIVERED" : "GOVERNOR_PROPOSAL_REJECTED",
        ownerId, companyId: allocation.companyId,
        outcome: governor ? "SUCCESS" : "DENIED",
        reason: governor ? "Portfolio proposal delivered to the server-resolved company Governor." : "Proposal rejected because no active company Governor exists.",
        requestId: request.requestId, ipAddress: request.ipAddress,
        metadata: { proposalId, portfolioObjectiveId: persisted.id },
      });
      return { ...allocation, governorProposalId: proposalId, status: governor ? "PROPOSED" as const : "REJECTED" as const, reason: proposal.revisions[0]!.explanation! };
    }));
    persisted = PortfolioObjectiveSchema.parse({
      ...persisted, allocations,
      status: allocations.some((item) => item.status === "PROPOSED") ? "NEGOTIATING" : "BLOCKED",
      updatedAt: at,
    });
    await this.store.updatePortfolioObjective(persisted);
    await this.audit?.({
      eventType: "PORTFOLIO_OBJECTIVE_CREATED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Owner created a bounded cross-company objective proposal.",
      requestId: request.requestId,
      ipAddress: request.ipAddress,
        metadata: { objectiveId: persisted.id, companyCount: selected.length },
    });
    return persisted;
  }

  async listGovernorProposals(ownerId: string, portfolioObjectiveId?: string) {
    return this.store.listGovernorProposals(ownerId, portfolioObjectiveId);
  }

  async decideGovernorProposal(
    ownerId: string,
    proposalId: string,
    raw: unknown,
    request: { requestId: string; ipAddress: string; workerId?: string },
  ) {
    const input = GovernorProposalDecisionRequestSchema.parse(raw);
    let proposal = await this.store.findGovernorProposal(ownerId, proposalId);
    if (!proposal) throw telemetryError("GOVERNOR_PROPOSAL_NOT_FOUND", "Governor proposal was not found.", 404);
    if (proposal.decisionIdempotencyKeys.includes(input.idempotencyKey)) return proposal;
    if (proposal.leaseOwner && proposal.leaseOwner !== request.workerId)
      throw telemetryError("GOVERNOR_PROPOSAL_LEASED", "Governor proposal is being evaluated by the durable scheduler.", 409);
    if (["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"].includes(proposal.status))
      throw telemetryError("GOVERNOR_PROPOSAL_TERMINAL", "Governor proposal is already terminal.", 409);
    const company = await this.companies.findCompany(ownerId, proposal.companyId);
    if (!company) throw telemetryError("PORTFOLIO_COMPANY_SCOPE_MISMATCH", "Proposal company is outside this portfolio.");
    const assignments = await this.agents.listAssignments(ownerId, company.id);
    const governor = assignments.find((item) => item.isGovernor && item.status === "ACTIVE");
    if (!governor || governor.id !== proposal.targetGovernorAssignmentId)
      throw telemetryError("GOVERNOR_IDENTITY_UNAVAILABLE", "The server-resolved company Governor is unavailable.", 409);
    const at = this.now().toISOString();
    if (new Date(proposal.expiresAt).getTime() <= this.now().getTime()) {
      proposal = GovernorProposalSchema.parse({ ...proposal, status: "EXPIRED", updatedAt: at, decisionIdempotencyKeys: [...proposal.decisionIdempotencyKeys, input.idempotencyKey], leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null });
      await this.store.saveGovernorProposal(proposal);
      await this.syncPortfolioObjective(proposal, "EXPIRED", "Proposal expired before a decision.");
      return proposal;
    }
    if (company.status !== "ACTIVE" && input.decision !== "REJECT")
      throw telemetryError("COMPANY_PAUSED", "Paused companies cannot accept or counterpropose new work.", 409);
    const latest = proposal.revisions.at(-1)!;
    if (input.decision === "COUNTERPROPOSE") {
      const rounds = proposal.revisions.filter((item) => item.proposedBy === "COMPANY_GOVERNOR").length;
      if (rounds >= proposal.maxCounterproposalRounds) {
        proposal = GovernorProposalSchema.parse({ ...proposal, status: "ESCALATED_TO_OWNER", updatedAt: at, decisionIdempotencyKeys: [...proposal.decisionIdempotencyKeys, input.idempotencyKey], leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null });
        await this.store.saveGovernorProposal(proposal);
        await this.syncPortfolioObjective(proposal, "OWNER_DECISION_REQUIRED", "Counterproposal limit reached; owner decision required.");
        await this.auditProposal(proposal, "GOVERNOR_PROPOSAL_ESCALATED", "SUCCESS", request, "Negotiation reached its bounded counterproposal limit.");
        return proposal;
      }
      proposal = GovernorProposalSchema.parse({
        ...proposal, status: rounds + 1 >= proposal.maxCounterproposalRounds ? "ESCALATED_TO_OWNER" : "COUNTERPROPOSED",
        revisions: [...proposal.revisions, { version: latest.version + 1, proposedBy: "COMPANY_GOVERNOR", terms: input.counterTerms!, reasonCode: input.reasonCode, explanation: input.explanation, createdAt: at }],
        updatedAt: at, decisionIdempotencyKeys: [...proposal.decisionIdempotencyKeys, input.idempotencyKey], leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
      });
      await this.store.saveGovernorProposal(proposal);
      await this.syncPortfolioObjective(proposal, proposal.status === "ESCALATED_TO_OWNER" ? "OWNER_DECISION_REQUIRED" : "COUNTERPROPOSED", input.explanation ?? "Company Governor counterproposed bounded terms.");
      await this.auditProposal(proposal, proposal.status === "ESCALATED_TO_OWNER" ? "GOVERNOR_PROPOSAL_ESCALATED" : "GOVERNOR_PROPOSAL_COUNTERPROPOSED", "SUCCESS", request, "Company Governor response persisted with immutable revision history.");
      return proposal;
    }
    if (input.decision === "REJECT") {
      proposal = GovernorProposalSchema.parse({
        ...proposal, status: "REJECTED",
        revisions: [...proposal.revisions, { version: latest.version + 1, proposedBy: "COMPANY_GOVERNOR", terms: latest.terms, reasonCode: input.reasonCode, explanation: input.explanation, createdAt: at }],
        updatedAt: at, decisionIdempotencyKeys: [...proposal.decisionIdempotencyKeys, input.idempotencyKey], leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
      });
      await this.store.saveGovernorProposal(proposal);
      await this.syncPortfolioObjective(proposal, "REJECTED", input.explanation ?? input.reasonCode);
      await this.auditProposal(proposal, "GOVERNOR_PROPOSAL_REJECTED", "SUCCESS", request, "Company Governor rejected the proposal with a bounded reason.");
      return proposal;
    }
    if (!this.#companyObjectiveProvider)
      throw telemetryError("OBJECTIVE_ENGINE_UNAVAILABLE", "Company Objective Engine is unavailable.", 503);
    const portfolioObjectiveId = proposal.portfolioObjectiveId;
    const objective = portfolioObjectiveId
      ? (await this.store.listPortfolioObjectives(ownerId)).find((item) => item.id === portfolioObjectiveId)
      : undefined;
    if (!objective) throw telemetryError("PORTFOLIO_OBJECTIVE_NOT_FOUND", "Parent portfolio objective is unavailable.", 409);
    const companyObjectiveId = proposal.companyObjectiveId ?? await this.#companyObjectiveProvider({
      ownerId, companyId: company.id, proposal, title: objective.title,
      canonicalMetricKey: objective.canonicalMetricKey, requestId: request.requestId, ipAddress: request.ipAddress,
    });
    proposal = GovernorProposalSchema.parse({
      ...proposal, status: "ACCEPTED", companyObjectiveId,
      revisions: [...proposal.revisions, { version: latest.version + 1, proposedBy: "COMPANY_GOVERNOR", terms: latest.terms, reasonCode: "ACCEPTED", explanation: input.explanation, createdAt: at }],
      updatedAt: at, decisionIdempotencyKeys: [...proposal.decisionIdempotencyKeys, input.idempotencyKey], leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
    });
    await this.store.saveGovernorProposal(proposal);
    await this.syncPortfolioObjective(proposal, "ACCEPTED", "Accepted into the existing company Objective Engine; activation still requires normal confirmation.", companyObjectiveId);
    await this.auditProposal(proposal, "GOVERNOR_PROPOSAL_ACCEPTED", "SUCCESS", request, "Company Governor accepted bounded terms into the normal Objective Engine.");
    return proposal;
  }

  async evaluateClaimedGovernorProposal(proposal: GovernorProposal, workerId: string) {
    const current = await this.store.findGovernorProposal(proposal.ownerId, proposal.id);
    if (!current || current.leaseOwner !== workerId)
      throw telemetryError("GOVERNOR_PROPOSAL_LEASE_LOST", "Governor proposal lease is no longer held.", 409);
    const idempotencyKey = `governor-evaluation:${current.id}`;
    if (new Date(current.expiresAt).getTime() <= this.now().getTime()) {
      const expired = GovernorProposalSchema.parse({
        ...current, status: "EXPIRED", updatedAt: this.now().toISOString(),
        decisionIdempotencyKeys: current.decisionIdempotencyKeys.includes(idempotencyKey)
          ? current.decisionIdempotencyKeys : [...current.decisionIdempotencyKeys, idempotencyKey],
        leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
      });
      await this.store.saveGovernorProposal(expired);
      await this.syncPortfolioObjective(expired, "EXPIRED", "Proposal expired before durable Governor evaluation.");
      return expired;
    }
    const company = await this.companies.findCompany(current.ownerId, current.companyId);
    const request = { requestId: `scheduler:${current.id}`, ipAddress: "internal", workerId };
    if (!company || company.status !== "ACTIVE")
      return this.decideGovernorProposal(current.ownerId, current.id, {
        decision: "REJECT", reasonCode: "COMPANY_PAUSED",
        explanation: "Company is not active; durable evaluation failed closed.", idempotencyKey,
      }, request);
    const latest = current.revisions.at(-1)!;
    if (latest.terms.budgetCredits < 1)
      return this.decideGovernorProposal(current.ownerId, current.id, {
        decision: "REJECT", reasonCode: "INSUFFICIENT_BUDGET",
        explanation: "Governor cannot expand a zero-credit proposal into funded work.", idempotencyKey,
      }, request);
    if (this.#portfolioEconomy) {
      const accounts = await this.#portfolioEconomy.ensureAccounts(current.ownerId, [current.companyId], this.now().toISOString());
      const available = accounts.find((item) => item.companyId === current.companyId)?.availableCredits ?? 0;
      if (latest.terms.budgetCredits > available)
        return this.decideGovernorProposal(current.ownerId, current.id, {
          decision: "COUNTERPROPOSE", reasonCode: "INSUFFICIENT_BUDGET",
          explanation: "Company Governor narrowed the proposal to currently available company credits.",
          counterTerms: { ...latest.terms, budgetCredits: available }, idempotencyKey,
        }, request);
    }
    return this.decideGovernorProposal(current.ownerId, current.id, {
      decision: "ACCEPT", reasonCode: "ACCEPTED",
      explanation: "Company Governor accepted bounded terms after deterministic readiness checks.",
      idempotencyKey,
    }, request);
  }

  private async syncPortfolioObjective(proposal: GovernorProposal, status: "ACCEPTED" | "REJECTED" | "COUNTERPROPOSED" | "EXPIRED" | "OWNER_DECISION_REQUIRED", reason: string, companyObjectiveId: string | null = null) {
    if (!proposal.portfolioObjectiveId) return;
    const objective = (await this.store.listPortfolioObjectives(proposal.ownerId)).find((item) => item.id === proposal.portfolioObjectiveId);
    if (!objective) return;
    const allocations = objective.allocations.map((item) => item.companyId === proposal.companyId ? { ...item, status, reason, companyObjectiveId: companyObjectiveId ?? item.companyObjectiveId } : item);
    const accepted = allocations.filter((item) => item.status === "ACCEPTED").length;
    const open = allocations.filter((item) => ["PROPOSED", "COUNTERPROPOSED", "OWNER_DECISION_REQUIRED"].includes(item.status)).length;
    const aggregate = accepted === allocations.length ? "ACCEPTED"
      : accepted > 0 ? "PARTIALLY_ACCEPTED"
        : open > 0 ? "NEGOTIATING" : "BLOCKED";
    await this.store.updatePortfolioObjective(PortfolioObjectiveSchema.parse({ ...objective, allocations, status: aggregate, updatedAt: this.now().toISOString() }));
  }

  private auditProposal(proposal: GovernorProposal, eventType: "GOVERNOR_PROPOSAL_ACCEPTED" | "GOVERNOR_PROPOSAL_REJECTED" | "GOVERNOR_PROPOSAL_COUNTERPROPOSED" | "GOVERNOR_PROPOSAL_ESCALATED", outcome: "SUCCESS" | "DENIED", request: { requestId: string; ipAddress: string }, reason: string) {
    return this.audit?.({ eventType, ownerId: proposal.ownerId, companyId: proposal.companyId, outcome, reason, requestId: request.requestId, ipAddress: request.ipAddress, metadata: { proposalId: proposal.id, portfolioObjectiveId: proposal.portfolioObjectiveId } });
  }

  listPortfolioObjectives(ownerId: string) {
    return this.store.listPortfolioObjectives(ownerId);
  }

  async recordPortfolioQuery(
    ownerId: string,
    request: { requestId: string; ipAddress: string },
  ) {
    await this.audit?.({
      eventType: "PORTFOLIO_QUERY_ACCESSED",
      ownerId,
      outcome: "SUCCESS",
      reason: "Owner accessed the bounded portfolio read model.",
      requestId: request.requestId,
      ipAddress: request.ipAddress,
    });
  }

  async handleConversation(ownerId: string, utterance: string) {
    const normalized = utterance.trim().toLowerCase();
    if (!/(portfolio|all companies|my companies|company briefing|which company)/.test(normalized))
      return null;
    const dashboard = await this.dashboard(ownerId);
    const open = dashboard.attentionQueue.filter((item) => item.status === "OPEN");
    if (/which company|needs? (my )?attention/.test(normalized)) {
      const top = open[0];
      return top
        ? `${top.companyName} needs attention first: ${top.title}. This is a portfolio recommendation and no work was executed.`
        : "No material company attention item is currently verified. Unknown evidence remains unknown.";
    }
    return `${dashboard.companies.length} active or paused companies are in portfolio scope. Portfolio health is ${dashboard.health.state}${dashboard.health.score === null ? " with no reliable numeric score" : ` at ${Math.round(dashboard.health.score)}`}. ${open.length} attention items are open. No company action was executed.`;
  }

  async dashboard(ownerId: string) {
    const authorizedCompanies = await this.companies.listCompanies(ownerId);
    const companies = authorizedCompanies.filter((company) => ["ACTIVE", "PAUSED"].includes(company.status));
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
      )
      .filter((signal) => signal.severity !== "INFO")
      .slice(0, 100);
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
    const health = this.portfolioHealth(summaries);
    const activity = attentionQueue.slice(0, 50).map((signal) => ({
      id: `activity:${signal.id}`,
      companyId: signal.companyId,
      companyName: signal.companyName,
      category: signal.signalType.startsWith("METRIC_") ? "OBJECTIVE" as const
        : signal.signalType.startsWith("DATA_") ? "DATA" as const
          : signal.signalType.startsWith("AI_") ? "AI" as const
            : "SYSTEM" as const,
      severity: signal.severity,
      summary: signal.title,
      occurredAt: signal.detectedAt,
      evidenceRef: signal.evidenceRefs[0] ?? `company:${signal.companyId}`,
    }));
    return OwnerPortfolioDashboardSchema.parse({
      ownerId,
      generatedAt,
      context: {
        ownerId,
        mode: "PORTFOLIO",
        selectedCompanyIds: companies.map((company) => company.id),
        activeCompanyId: null,
        portfolioScope: "ACTIVE_AND_PAUSED",
        authority: "OWNER",
        createdAt: generatedAt,
        expiresAt: null,
      },
      health,
      companies: summaries,
      portfolioMetrics,
      attentionQueue,
      systemHealth,
      aiHealth,
      insights,
      activity,
      capabilities: [
        "LIST_COMPANIES", "GET_PORTFOLIO_SUMMARY", "COMPARE_COMPANIES",
        "GET_COMPANY_HEALTH", "OPEN_COMPANY", "SET_COMPANY_PRIORITY",
        "CREATE_PORTFOLIO_OBJECTIVE", "PAUSE_COMPANY", "RESUME_COMPANY",
      ],
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
    const openAttention = dashboard.attentionQueue.filter((item) => item.status === "OPEN");
    return PortfolioExecutiveBriefSchema.parse({
      generatedAt: dashboard.generatedAt,
      portfolioState: dashboard.health.state,
      summary: openAttention.length
        ? `${dashboard.companies.length} companies are in scope; ${openAttention.filter((item) => item.severity === "HIGH" || item.severity === "CRITICAL").length} high-priority issues need review.`
        : `${dashboard.companies.length} companies are in scope; no material owner attention item is currently verified.`,
      companyUpdates: dashboard.companies.map((company) => ({
        companyId: company.companyId,
        companyName: company.companyName,
        state: company.healthState,
        summary: company.management.nextRecommendedFocus,
        ownerActionRequired: openAttention.some((item) => item.companyId === company.companyId),
      })),
      ownerAttention: openAttention.slice(0, 20),
      evidenceQuality: dashboard.evidenceQuality,
      executed: false as const,
    });
  }

  private portfolioHealth(summaries: PortfolioCompanySummary[]) {
    const scored = summaries.filter((summary) => summary.healthScore !== null);
    const weighted = scored.map((summary) => ({
      summary,
      weight: priorityWeight[summary.priority] * Math.max(1, summary.activeObjectives),
    }));
    const denominator = weighted.reduce((sum, item) => sum + item.weight, 0);
    const score = denominator
      ? weighted.reduce((sum, item) => sum + item.summary.healthScore! * item.weight, 0) / denominator
      : null;
    const state = score === null ? "UNKNOWN" : score < 35 ? "CRITICAL" : score < 60 ? "AT_RISK" : score < 80 ? "WATCH" : "HEALTHY";
    return PortfolioHealthSchema.parse({
      state,
      score,
      weighting: "OWNER_PRIORITY_X_ACTIVE_OBJECTIVES",
      companiesIncluded: summaries.length,
      companiesUnknown: summaries.length - scored.length,
      evidence: score === null
        ? ["No company has enough verified component evidence for a portfolio score."]
        : [`${scored.length} company scores were weighted by owner priority and active objective count.`, `${summaries.length - scored.length} companies with unknown health were excluded from the numeric score, not treated as healthy.`],
    });
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
        this.#managementProvider?.(ownerId, company.id) ?? Promise.resolve({ topPriority: null, totalObjectives: 0, objectivesAtRisk: 0, blockedObjectives: 0, decisionsRequiringOwner: 0, latestReviewAt: null, nextRecommendedFocus: "Open company management to establish priorities." }),
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
    const rawHealth = [
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
    const health = rawHealth.map((item) => ({
      ...item,
      score: stateScore[item.state],
      weight: componentWeight[item.dimension],
    }));
    const known = health.filter((item) => item.score !== null);
    const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
    const healthScore = knownWeight >= 0.5
      ? known.reduce((sum, item) => sum + item.score! * item.weight, 0) / knownWeight
      : null;
    const healthState = company.status === "PAUSED" ? "WATCH"
      : healthScore === null ? "UNKNOWN"
        : healthScore < 35 ? "CRITICAL"
          : healthScore < 60 ? "AT_RISK"
            : healthScore < 80 ? "WATCH" : "HEALTHY";
    const freshTrends = metrics.filter((item) => item.freshness === "FRESH").map((item) => item.trend);
    return {
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      priority: company.settings.portfolioPriority,
      healthScore,
      healthState,
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
      activeObjectives: Math.max(0, management.totalObjectives - management.objectivesAtRisk),
      atRiskObjectives: management.objectivesAtRisk,
      blockedObjectives: management.blockedObjectives,
      activeAgents: assignments.filter((item) => item.status === "ACTIVE").length,
      totalSpendCredits: aiCost,
      efficiency: null,
      approvalsPending: management.decisionsRequiringOwner,
      criticalEvents: errors > 3 ? errors : 0,
      recentOutcomeTrend: freshTrends.includes("DOWN") ? "DOWN"
        : freshTrends.includes("UP") ? "UP"
          : freshTrends.length && freshTrends.every((trend) => trend === "FLAT") ? "FLAT"
            : "INSUFFICIENT_DATA",
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
