import {
  AIBudgetEvaluationSchema,
  AIBudgetPolicySchema,
  AIBudgetReservationSchema,
  AIEconomicContextSchema,
  AIEconomicEstimateSchema,
  AIEconomicHealthSchema,
  AIEconomicOverviewSchema,
  AIEconomicOverrideDescriptorSchema,
  AIEconomicOverrideGrantSchema,
  AIEconomicUsageSchema,
  AIPricingSchema,
  AIUsageLedgerEntrySchema,
  type AIBudgetEvaluation,
  type AIBudgetReservation,
  type AIBudgetPolicy,
  type AIEconomicContext,
  type AIEconomicEstimate,
  type AIEconomicHealth,
  type AIEconomicOverview,
  type AIEconomicOverrideDescriptor,
  type AIEconomicOverrideReference,
  type AIPricing,
  type AIUsage,
} from "@alexa-control/shared";
import { AIEconomicError } from "./errors.js";
import { digestEconomicOverride } from "./override-digest.js";
import type { ApprovalService, GovernanceAuditWriter } from "../../governance/approval-service.js";
import {
  InMemoryAIEconomicsStore,
  decimalToUnits,
  periodStart,
  policyApplies,
  unitsToDecimal,
  type AIEconomicsStore,
} from "./store.js";

const MILLION = 1_000_000n;
const nowIso = () => new Date().toISOString();
const add = (a: string, b: string) =>
  unitsToDecimal(decimalToUnits(a) + decimalToUnits(b));
const subtractFloor = (a: string, b: string) =>
  unitsToDecimal(
    decimalToUnits(a) > decimalToUnits(b) ? decimalToUnits(a) - decimalToUnits(b) : 0n,
  );
const minDecimal = (values: string[]) =>
  values.reduce((a, b) => (decimalToUnits(b) < decimalToUnits(a) ? b : a));
const costFor = (tokens: number | undefined, rate: string | undefined) => {
  if (!tokens || !rate) return "0";
  return unitsToDecimal((BigInt(tokens) * decimalToUnits(rate)) / MILLION);
};

export interface AIEconomicCandidate {
  providerId: string;
  modelId: string;
  locality: "LOCAL" | "REMOTE";
  estimatedInputTokens: number;
  maxOutputTokens: number;
}

export type AIEconomicCorrelation = {
  routeId: string;
  attemptId: string;
  contextId?: string;
};

export class AICostCalculator {
  estimate(
    usage: Pick<
      AIUsage,
      "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens"
    >,
    pricing?: AIPricing,
  ): string {
    if (!pricing) return "0";
    const cachedTokens = usage.cachedInputTokens ?? 0;
    const uncachedTokens = Math.max(0, (usage.inputTokens ?? 0) - cachedTokens);
    const input = costFor(uncachedTokens, pricing.inputPerMillionTokens);
    const cached = costFor(cachedTokens, pricing.cachedInputPerMillionTokens);
    const output = costFor(
      usage.outputTokens ?? usage.reasoningTokens ?? 0,
      pricing.outputPerMillionTokens,
    );
    return add(add(add(input, cached), output), pricing.requestFee ?? "0");
  }
}

export class AIEconomicsService {
  readonly calculator = new AICostCalculator();
  private reconciledExpiredReservations = 0;
  private startupFailure: string | undefined;
  private approvals?: ApprovalService;
  private audit?: GovernanceAuditWriter;

  constructor(readonly store: AIEconomicsStore = new InMemoryAIEconomicsStore()) {}

  setApprovalRuntime(approvals: ApprovalService, audit: GovernanceAuditWriter) {
    this.approvals = approvals;
    this.audit = audit;
  }

  async prepareOverrideApproval(
    descriptor: AIEconomicOverrideDescriptor,
    auditContext: { ipAddress: string; requestId: string },
  ) {
    if (!this.approvals) throw new AIEconomicError("OVERRIDE_REQUIRED", "Approval runtime is unavailable.");
    const normalized = AIEconomicOverrideDescriptorSchema.parse(descriptor);
    const digest = digestEconomicOverride(normalized);
    const descriptorJson = Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;
    const approval = await this.approvals.create({
      ownerId: normalized.ownerId,
      action: { actionId: crypto.randomUUID(), toolName: "ai.economic_override", arguments: { descriptor: descriptorJson, digest } },
      riskLevel: "high",
      approvalRequirement: "recent_authentication",
      ipAddress: auditContext.ipAddress,
      requestId: auditContext.requestId,
    });
    await this.audit?.({ eventType: "ECONOMIC_OVERRIDE_REQUESTED", ownerId: normalized.ownerId,
      outcome: "SUCCESS", reason: "A bounded AI-spend exception requires owner approval.",
      metadata: { approvalId: approval.id, digest }, ...auditContext });
    return { approval, digest };
  }

  async createOverrideGrantFromApproval(input: {
    ownerId: string;
    approvalId: string;
    descriptor: AIEconomicOverrideDescriptor;
    recentAuthenticationVerified?: boolean;
    auditContext: { ipAddress: string; requestId: string };
  }) {
    if (!this.approvals) throw new AIEconomicError("OVERRIDE_REQUIRED", "Approval runtime is unavailable.");
    const descriptor = AIEconomicOverrideDescriptorSchema.parse(input.descriptor);
    const digest = digestEconomicOverride(descriptor);
    const approval = await this.approvals.store.findApprovalById(input.approvalId);
    const args = approval?.action.arguments;
    const approvedDigest = args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>).digest : undefined;
    if (!approval || approval.ownerId !== input.ownerId || approval.action.toolName !== "ai.economic_override" ||
        approval.status !== "APPROVED" || approvedDigest !== digest ||
        new Date(approval.expiresAt).getTime() <= Date.now())
      throw new AIEconomicError("OVERRIDE_REQUIRED", "Approved economic override is invalid or expired.");
    const grant = AIEconomicOverrideGrantSchema.parse({
      id: crypto.randomUUID(), ownerId: input.ownerId, approvalId: approval.id,
      requestId: descriptor.requestId, digest, maxAdditionalSpendUsd: descriptor.maxAdditionalSpendUsd,
      expiresAt: descriptor.expiresAt, status: "ACTIVE", createdAt: new Date().toISOString(),
    });
    const created = await this.store.createOverrideGrant({ grant, descriptor });
    await this.audit?.({ eventType: "ECONOMIC_OVERRIDE_GRANT_CREATED", ownerId: input.ownerId,
      outcome: "SUCCESS", reason: "Approved bounded AI-spend exception became a single-use grant.",
      metadata: { grantId: created.id, approvalId: approval.id, digest }, ...input.auditContext });
    return created;
  }

  async initialise() {
    try {
      if (!(await this.store.health()))
        throw new Error("ECONOMICS_DATABASE_UNAVAILABLE");
      this.reconciledExpiredReservations = await this.store.reconcileExpired(
        new Date(),
      );
      this.startupFailure = undefined;
    } catch (error) {
      this.startupFailure =
        error instanceof Error ? error.message : "ECONOMICS_INITIALISATION_FAILED";
      throw new AIEconomicError("ECONOMICS_UNAVAILABLE", this.startupFailure, true);
    }
  }

  async health(ownerId?: string): Promise<AIEconomicHealth> {
    const available = await this.store.health();
    const [pricing, policies, reservations] = available
      ? await Promise.all([
          this.store.listPricing(),
          ownerId ? this.store.listPolicies(ownerId) : Promise.resolve([]),
          ownerId ? this.store.listReservations(ownerId) : Promise.resolve([]),
        ])
      : [[], [], []];
    const reasons = [
      ...(!available ? ["Economic database is unavailable."] : []),
      ...(this.startupFailure ? [this.startupFailure] : []),
      ...(!pricing.some((item) => item.status === "ACTIVE")
        ? ["No active paid-model pricing is registered."]
        : []),
    ];
    return AIEconomicHealthSchema.parse({
      status: !available ? "UNAVAILABLE" : reasons.length ? "DEGRADED" : "READY",
      persistence: this.store.persistence,
      reasons,
      pricingEntries: pricing.length,
      activePolicies: policies.filter((item) => item.enabled).length,
      activeReservations: reservations.filter((item) => item.status === "ACTIVE")
        .length,
      reconciledExpiredReservations: this.reconciledExpiredReservations,
    });
  }

  listPricing() {
    return this.store.listPricing();
  }
  async pricingFor(providerId: string, modelId: string, at = new Date()) {
    return (await this.store.listPricing())
      .filter(
        (item) =>
          item.providerId === providerId &&
          item.modelId === modelId &&
          item.status === "ACTIVE" &&
          Date.parse(item.effectiveFrom) <= at.getTime() &&
          (!item.effectiveUntil || Date.parse(item.effectiveUntil) > at.getTime()),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  }
  upsertPricing(input: AIPricing) {
    return this.store.upsertPricing(AIPricingSchema.parse(input));
  }
  upsertPolicy(input: AIBudgetPolicy) {
    const item = AIBudgetPolicySchema.parse(input);
    if (item.period === "PER_RUN" && item.scope !== "WORKFLOW")
      throw new Error("PER_RUN_REQUIRES_WORKFLOW_SCOPE");
    if (item.scope !== "GLOBAL" && !item.scopeId)
      throw new Error("SCOPED_BUDGET_REQUIRES_SCOPE_ID");
    return this.store.upsertPolicy(item);
  }
  listPolicies(ownerId: string) {
    return this.store.listPolicies(ownerId);
  }
  removePolicy(ownerId: string, id: string) {
    return this.store.disablePolicy(ownerId, id);
  }
  listReservations(ownerId: string) {
    return this.store.listReservations(ownerId);
  }
  listLedger(ownerId: string, limit = 500) {
    return this.store.listLedger(ownerId, limit);
  }

  async estimate(
    candidate: AIEconomicCandidate,
    context: AIEconomicContext,
  ): Promise<AIEconomicEstimate> {
    const economic = this.validateIdentity(context, candidate);
    if (candidate.locality === "LOCAL")
      return AIEconomicEstimateSchema.parse({
        estimatedMinUsd: "0",
        estimatedMaxUsd: "0",
        eligible: true,
        budgetState: "HEALTHY",
        reason: "Local inference has zero external API cost.",
      });
    const pricing = await this.pricingFor(candidate.providerId, candidate.modelId);
    if (!pricing)
      return AIEconomicEstimateSchema.parse({
        estimatedMinUsd: "0",
        estimatedMaxUsd: "0",
        eligible: false,
        budgetState: "EXHAUSTED",
        reason: "No active pricing exists for this paid model.",
      });
    const usage = AIEconomicUsageSchema.parse({
      inputTokens: candidate.estimatedInputTokens,
      outputTokens: candidate.maxOutputTokens,
      source: "ESTIMATED",
    });
    const maxCost = this.calculator.estimate(usage, pricing);
    const minCost = this.calculator.estimate({ ...usage, outputTokens: 0 }, pricing);
    const evaluation = await this.evaluate(candidate, economic, maxCost);
    return AIEconomicEstimateSchema.parse({
      estimatedMinUsd: minCost,
      estimatedMaxUsd: maxCost,
      eligible: evaluation.allowed,
      budgetState: evaluation.state,
      reason: evaluation.reasons.join(" ") || "Candidate is economically eligible.",
    });
  }

  async evaluate(
    candidate: AIEconomicCandidate,
    context: AIEconomicContext,
    estimatedCostUsd: string,
  ): Promise<AIBudgetEvaluation> {
    const economic = this.validateIdentity(context, candidate);
    if (candidate.locality === "LOCAL")
      return this.evaluation(
        [],
        "HEALTHY",
        "NORMAL",
        ["Local inference remains available."],
        estimatedCostUsd,
        "0",
        "0",
        true,
      );
    if (!(await this.store.health()))
      return this.evaluation(
        [],
        "EXHAUSTED",
        "DENY",
        ["Durable economic authority is unavailable."],
        estimatedCostUsd,
        "0",
        "0",
        false,
      );
    const pricing = await this.pricingFor(candidate.providerId, candidate.modelId);
    if (!pricing)
      return this.evaluation(
        [],
        "EXHAUSTED",
        economic.autonomyMode === "INTERACTIVE" ? "REQUIRE_APPROVAL" : "DENY",
        ["No active price is registered for this paid model."],
        estimatedCostUsd,
        "0",
        "0",
        false,
      );
    const policies = (await this.store.listPolicies(economic.ownerId)).filter(
      (policy) => policyApplies(policy, economic, candidate),
    );
    if (!policies.length)
      return this.evaluation(
        [],
        "EXHAUSTED",
        "DENY",
        ["No applicable durable budget policy authorizes this paid request."],
        estimatedCostUsd,
        "0",
        "0",
        false,
      );
    const [ledger, reservations] = await Promise.all([
      this.store.listLedger(economic.ownerId, 100_000),
      this.store.listReservations(economic.ownerId),
    ]);
    const remaining = policies.map((policy) => {
      const spent = ledger
        .filter((entry) => {
          if (new Date(entry.completedAt ?? entry.startedAt) < periodStart(policy))
            return false;
          if (policy.period === "PER_RUN")
            return entry.workflowRunId === economic.workflowRunId;
          if (policy.scope === "GLOBAL") return true;
          if (policy.scope === "PROVIDER")
            return entry.providerId === candidate.providerId;
          if (policy.scope === "MODEL")
            return `${entry.providerId}/${entry.modelId}` === policy.scopeId;
          if (policy.scope === "AGENT") return entry.agentId === policy.scopeId;
          if (policy.scope === "WORKFLOW")
            return (
              entry.workflowId === policy.scopeId ||
              entry.workflowRunId === policy.scopeId
            );
          if (policy.scope === "DEPARTMENT")
            return entry.departmentId === policy.scopeId;
          return entry.metadata?.costCenter === policy.scopeId;
        })
        .reduce((sum, entry) => sum + decimalToUnits(entry.actualCostUsd ?? "0"), 0n);
      const reserved = reservations
        .filter(
          (item) =>
            item.status === "ACTIVE" &&
            Date.parse(item.expiresAt) > Date.now() &&
            item.policyIds?.includes(policy.id),
        )
        .reduce((sum, item) => sum + decimalToUnits(item.amountUsd), 0n);
      return unitsToDecimal(
        decimalToUnits(policy.limitUsd) > spent + reserved
          ? decimalToUnits(policy.limitUsd) - spent - reserved
          : 0n,
      );
    });
    const narrowest = minDecimal(remaining);
    const allowed = decimalToUnits(estimatedCostUsd) <= decimalToUnits(narrowest);
    const limiting = policies[remaining.findIndex((item) => item === narrowest)];
    const usedPct = limiting
      ? Number(
          ((decimalToUnits(limiting.limitUsd) - decimalToUnits(narrowest)) * 100n) /
            (decimalToUnits(limiting.limitUsd) || 1n),
        )
      : 100;
    const state = !allowed
      ? "EXHAUSTED"
      : usedPct >= (limiting?.hardStopThresholdPct ?? 100)
        ? "CRITICAL"
        : usedPct >= (limiting?.throttleThresholdPct ?? 85)
          ? "CONSERVE"
          : usedPct >= (limiting?.warningThresholdPct ?? 70)
            ? "WATCH"
            : "HEALTHY";
    const action = !allowed
      ? limiting?.overflowBehavior === "REQUIRE_APPROVAL"
        ? "REQUIRE_APPROVAL"
        : "DENY"
      : state === "CONSERVE" || state === "CRITICAL"
        ? "PREFER_LOCAL"
        : "NORMAL";
    return this.evaluation(
      policies,
      state,
      action,
      [
        allowed
          ? "Within every applicable durable budget cap."
          : `Budget policy ${limiting?.id ?? "unknown"} would be exceeded.`,
      ],
      estimatedCostUsd,
      narrowest,
      subtractFloor(narrowest, estimatedCostUsd),
      allowed,
    );
  }

  async reserve(
    candidate: AIEconomicCandidate,
    context: AIEconomicContext,
    requestId: string,
    correlation: AIEconomicCorrelation,
    overrideReference?: AIEconomicOverrideReference,
  ) {
    const economic = this.validateIdentity(context, candidate);
    if (candidate.locality !== "REMOTE")
      throw new AIEconomicError(
        "RESERVATION_FAILED",
        "Local inference must not create paid reservations.",
      );
    const estimate = await this.estimate(candidate, economic);
    if (!estimate.eligible && !overrideReference)
      throw new AIEconomicError(
        estimate.reason.includes("pricing")
          ? "UNKNOWN_MODEL_PRICE"
          : "RESERVATION_FAILED",
        `RESERVATION_FAILED: ${estimate.reason}`,
      );
    const pricing = await this.pricingFor(candidate.providerId, candidate.modelId);
    if (!pricing)
      throw new AIEconomicError(
        "UNKNOWN_MODEL_PRICE",
        "Active pricing disappeared before reservation.",
      );
    const reservation = AIBudgetReservationSchema.parse({
      id: crypto.randomUUID(),
      ownerId: economic.ownerId,
      requestId,
      routeId: correlation.routeId,
      attemptId: correlation.attemptId,
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      pricingVersion: pricing.version,
      context: economic,
      amountUsd: estimate.estimatedMaxUsd,
      status: "ACTIVE",
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    if (overrideReference) {
      const stored = await this.store.getOverrideGrant(economic.ownerId, overrideReference.grantId);
      if (!stored || stored.descriptor.requestId !== requestId)
        throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant is not bound to this request.");
      const descriptor = stored.descriptor;
      let result: AIBudgetReservation;
      try {
        result = await this.store.consumeOverrideGrantWithReservation({
          ownerId: economic.ownerId, grantId: overrideReference.grantId, descriptor,
          reservation: { ...reservation, amountUsd: estimate.estimatedMaxUsd },
          context: economic, candidate,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Economic override denied.";
        const eventType = message.includes("expired")
          ? "ECONOMIC_OVERRIDE_EXPIRED"
          : message.includes("already used") || message.includes("already exists")
            ? "ECONOMIC_OVERRIDE_REPLAY_REJECTED"
            : message.includes("binding")
              ? "ECONOMIC_OVERRIDE_DIGEST_MISMATCH"
              : "ECONOMIC_OVERRIDE_DENIED";
        await this.audit?.({ eventType, ownerId: economic.ownerId, outcome: "DENIED",
          reason: message.slice(0, 300), metadata: { grantId: overrideReference.grantId },
          ipAddress: "internal", requestId });
        throw error;
      }
      await this.audit?.({ eventType: "ECONOMIC_OVERRIDE_CONSUMED", ownerId: economic.ownerId,
        outcome: "SUCCESS", reason: "Override grant consumed with a reservation.",
        metadata: { grantId: overrideReference.grantId, reservationId: result.id },
        ipAddress: "internal", requestId });
      return result;
    }
    return this.store.reserveAtomic({ reservation, context: economic, candidate });
  }

  async settle(
    reservationId: string | undefined,
    context: AIEconomicContext,
    candidate: AIEconomicCandidate,
    usage: AIUsage,
    status: "SETTLED" | "FAILED" | "CANCELLED" = "SETTLED",
    actualCostUsd?: string,
    correlation?: AIEconomicCorrelation,
    requestId?: string,
  ) {
    const economic = this.validateIdentity(context, candidate);
    if (!correlation)
      throw new AIEconomicError(
        "RESERVATION_FAILED",
        "Settlement requires route and attempt correlation.",
      );
    const prior = (await this.store.listLedger(economic.ownerId, 100_000)).find(
      (item) => item.attemptId === correlation.attemptId,
    );
    if (prior) return prior;
    if (candidate.locality === "REMOTE" && !reservationId)
      throw new AIEconomicError(
        "RESERVATION_FAILED",
        "Paid settlement requires a durable reservation.",
      );
    const reservation = reservationId
      ? await this.store.findActiveReservation(economic.ownerId, reservationId)
      : undefined;
    if (reservationId && !reservation)
      throw new AIEconomicError("RESERVATION_FAILED", "Reservation was not found.");
    const pricing =
      candidate.locality === "REMOTE"
        ? (await this.store.listPricing()).find(
            (item) =>
              item.providerId === candidate.providerId &&
              item.modelId === candidate.modelId &&
              item.version === reservation?.pricingVersion,
          )
        : undefined;
    const normalized = AIEconomicUsageSchema.parse(usage);
    const cost =
      candidate.locality === "LOCAL"
        ? "0"
        : (actualCostUsd ?? this.calculator.estimate(normalized, pricing));
    const entry = AIUsageLedgerEntrySchema.parse({
      id: crypto.randomUUID(),
      ownerId: economic.ownerId,
      requestId: reservation?.requestId ?? requestId,
      routeId: correlation.routeId,
      attemptId: correlation.attemptId,
      reservationId,
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      agentId: economic.agentId,
      departmentId: economic.departmentId,
      workflowId: economic.workflowId,
      workflowRunId: economic.workflowRunId,
      taskId: economic.taskId,
      conversationId: economic.conversationId,
      purpose: economic.purpose,
      locality: candidate.locality === "LOCAL" ? "LOCAL" : "CLOUD",
      usage: normalized,
      estimatedCostUsd: reservation?.amountUsd ?? "0",
      actualCostUsd: cost,
      pricingVersion: pricing?.version,
      status,
      startedAt: reservation?.createdAt ?? nowIso(),
      completedAt: nowIso(),
      metadata: {
        ...(correlation.contextId ? { contextId: correlation.contextId } : {}),
        ...(economic.costCenter ? { costCenter: economic.costCenter } : {}),
      },
    });
    return this.store.settleAtomic({
      ownerId: economic.ownerId,
      ...(reservationId ? { reservationId } : {}),
      entry,
    });
  }

  release(ownerId: string, reservationId: string) {
    return this.store.release(ownerId, reservationId);
  }
  verifyActiveReservation(ownerId: string, reservationId: string) {
    return this.store.findActiveReservation(ownerId, reservationId);
  }

  async overview(ownerId: string, at = new Date()): Promise<AIEconomicOverview> {
    const [entries, policies] = await Promise.all([
      this.store.listLedger(ownerId, 100_000),
      this.store.listPolicies(ownerId),
    ]);
    const monthStart = new Date(at.getFullYear(), at.getMonth(), 1);
    const current = entries.filter(
      (item) => new Date(item.completedAt ?? item.startedAt) >= monthStart,
    );
    const spend = current.reduce(
      (sum, item) => add(sum, item.actualCostUsd ?? "0"),
      "0",
    );
    const sevenDayStart = new Date(at.getTime() - 7 * 86_400_000);
    const sevenDaySpend = entries
      .filter((item) => new Date(item.completedAt ?? item.startedAt) >= sevenDayStart)
      .reduce((sum, item) => add(sum, item.actualCostUsd ?? "0"), "0");
    const policy = policies.find(
      (item) => item.enabled && item.scope === "GLOBAL" && item.period === "MONTHLY",
    );
    const fraction = Math.max(
      0.01,
      (at.getDate() - 1 + at.getHours() / 24) /
        new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate(),
    );
    return AIEconomicOverviewSchema.parse({
      monthToDateSpendUsd: spend,
      recentSevenDaySpendUsd: sevenDaySpend,
      remainingUsd: policy ? subtractFloor(policy.limitUsd, spend) : "0",
      projectedMonthEndUsd: unitsToDecimal(
        BigInt(Math.ceil(Number(decimalToUnits(spend)) / fraction)),
      ),
      projectedMonthlyFromSevenDayUsd: unitsToDecimal(
        (decimalToUnits(sevenDaySpend) * 30n) / 7n,
      ),
      ...(policy ? { budgetLimitUsd: policy.limitUsd } : {}),
      health:
        policy && decimalToUnits(spend) >= decimalToUnits(policy.limitUsd)
          ? "EXHAUSTED"
          : "HEALTHY",
      localRequests: current.filter((item) => item.locality === "LOCAL").length,
      cloudRequests: current.filter((item) => item.locality === "CLOUD").length,
      totalRequests: current.length,
      totalTokens: current.reduce(
        (sum, item) => sum + (item.usage.totalTokens ?? item.usage.inputTokens ?? 0),
        0,
      ),
    });
  }

  private validateIdentity(
    context: AIEconomicContext,
    candidate: Pick<AIEconomicCandidate, "locality">,
  ) {
    const economic = AIEconomicContextSchema.parse(context);
    if (
      candidate.locality === "REMOTE" &&
      ["AUTONOMOUS", "SCHEDULED"].includes(economic.autonomyMode) &&
      !economic.agentId &&
      !economic.workflowId
    )
      throw new AIEconomicError(
        "ECONOMICS_UNAVAILABLE",
        "Autonomous paid inference requires an agent or workflow identity.",
      );
    if (
      candidate.locality === "REMOTE" &&
      economic.workflowId &&
      ["AUTONOMOUS", "SCHEDULED"].includes(economic.autonomyMode) &&
      !economic.workflowRunId
    )
      throw new AIEconomicError(
        "ECONOMICS_UNAVAILABLE",
        "Autonomous paid workflow inference requires a workflow-run identity.",
      );
    return economic;
  }

  private evaluation(
    policies: AIBudgetPolicy[],
    state: AIBudgetEvaluation["state"],
    action: AIBudgetEvaluation["action"],
    reasons: string[],
    estimated: string,
    before: string,
    after: string,
    allowed: boolean,
  ) {
    return AIBudgetEvaluationSchema.parse({
      allowed,
      applicablePolicies: policies,
      estimatedRequestCostUsd: estimated,
      remainingBeforeUsd: before,
      remainingAfterEstimateUsd: after,
      state,
      action,
      reasons,
    });
  }
}
