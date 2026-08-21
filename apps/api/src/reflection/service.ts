import { createHash } from "node:crypto";
import {
  ReflectionCalibrationSchema,
  ReflectionEngineResponseSchema,
  ReflectionFeedbackRequestSchema,
  ReflectionPatternSchema,
  ReflectionQuerySchema,
  ReflectionRecordSchema,
  type ExecutiveDecision,
  type ExecutiveGoal,
  type ExecutiveKpi,
  type ExecutiveObjective,
  type ExecutivePlan,
  type ExecutiveRisk,
  type ReflectionQuery,
  type ReflectionRecord,
  type TaskRecord,
} from "@alexa-control/shared";
import type { AIRouterService } from "../ai/router/service.js";
import type { ExecutiveStore } from "../executive/store.js";
import type { TaskStore } from "../tasks/store.js";
import type { ReflectionStore } from "./store.js";
import {
  evaluateRecommendationEvidence,
  evaluateRoutingEconomics,
} from "./evaluators.js";
import {
  ReflectionContextComposer,
  ReflectionSynthesisJsonSchema,
  ReflectionSynthesisSchema,
  type LiveReflectionInput,
} from "./context-composer.js";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export interface ReflectionLearningSink {
  ingest(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }): Promise<unknown>;
}
export const parseReflectionQuery = (text: string): ReflectionQuery | null => {
  const v = text.toLowerCase();
  const type = /weekly review|what.*accomplish/.test(v)
    ? "WEEKLY_REVIEW"
    : /how.*plan|plan.*go|plan realistic/.test(v)
      ? "EVALUATE_PLAN"
      : /decision.*good|decision.*go/.test(v)
        ? "EVALUATE_DECISION"
        : /estimate|underestimate|longer than expected|accurate/.test(v)
          ? "EVALUATE_ESTIMATE"
          : /risk.*material|risk.*accur/.test(v)
            ? "EVALUATE_RISK"
            : /goal.*(go|achiev|review)|did.*achieve/.test(v)
              ? "EVALUATE_GOAL"
              : /kpi.*(fall|deterior|review|target)/.test(v)
                ? "EVALUATE_KPI"
                : /pattern|consistently wrong|keep.*repeat|learned/.test(v)
                  ? "FIND_PATTERNS"
                  : /why.*fail|what went wrong|fall behind|run late/.test(v)
                    ? "WHY_FAILED"
                    : /why.*well|what worked/.test(v)
                      ? "WHY_SUCCEEDED"
                      : /retrospective|reflect on|what.*learn/.test(v)
                        ? "RETROSPECTIVE"
                        : null;
  if (!type) return null;
  return ReflectionQuerySchema.parse({
    type,
    scope: /decision/.test(v)
      ? "DECISION"
      : /plan/.test(v)
        ? "PLAN"
        : /risk/.test(v)
          ? "RISK"
          : /goal/.test(v)
            ? "GOAL"
            : /kpi/.test(v)
              ? "KPI"
              : "CUSTOM_PERIOD",
    entityId: null,
    periodStart: null,
    periodEnd: null,
    requestedDepth: /deeper|deep/.test(v) ? "DEEP" : "STANDARD",
  });
};
export class ReflectionEngineService {
  private learningSink: ReflectionLearningSink | undefined;
  private routingEvidenceSource:
    | {
        listConversation(ownerId: string, limit: number): PromiseLike<unknown[]> | unknown[];
        listTurnFeedback(ownerId: string, limit: number): PromiseLike<unknown[]> | unknown[];
        listLedger(ownerId: string, limit?: number): PromiseLike<unknown[]> | unknown[];
      }
    | undefined;
  private readonly minimumCalibrationSamples: number;

  constructor(
    readonly store: ReflectionStore,
    readonly executive: ExecutiveStore,
    readonly tasks: TaskStore,
    readonly now: () => Date = () => new Date(),
    readonly router?: Pick<AIRouterService, "execute" | "executeStructured">,
    options: { minimumCalibrationSamples?: number } = {},
  ) {
    this.minimumCalibrationSamples = options.minimumCalibrationSamples ?? 3;
  }

  setLearningSink(sink: ReflectionLearningSink) {
    this.learningSink = sink;
  }

  setRoutingEvidenceSource(source: NonNullable<ReflectionEngineService["routingEvidenceSource"]>) {
    this.routingEvidenceSource = source;
  }

  async getRoutingEconomics(ownerId: string) {
    if (!this.routingEvidenceSource) return [];
    const [rawTurns, rawFeedback, rawLedger] = await Promise.all([
      this.routingEvidenceSource.listConversation(ownerId, 500),
      this.routingEvidenceSource.listTurnFeedback(ownerId, 500),
      this.routingEvidenceSource.listLedger(ownerId, 500),
    ]);
    const turns = rawTurns as Array<Record<string, unknown>>;
    const feedback = rawFeedback as Array<Record<string, unknown>>;
    const ledger = rawLedger as Array<Record<string, unknown>>;
    return evaluateRoutingEconomics(
      turns
        .filter((turn) => turn.role === "user")
        .map((turn) => {
          const stages = Array.isArray(turn.routeStages) ? turn.routeStages : [];
          const route = stages.includes("GEMMA") && stages.includes("GPT")
            ? "GEMMA_TO_GPT" as const
            : turn.responseSource === "GEMMA"
              ? "GEMMA" as const
              : turn.responseSource === "GPT"
                ? "GPT" as const
                : "PRECODED" as const;
          const turnFeedback = feedback.filter((item) => item.turnId === turn.id);
          const reservationId = typeof turn.economicReservationId === "string" ? turn.economicReservationId : null;
          const ledgerCost = ledger
            .filter((item) => reservationId && item.reservationId === reservationId)
            .reduce((sum, item) => sum + Number(item.actualCostUsd ?? item.estimatedCostUsd ?? 0), 0);
          return {
            route,
            success: Boolean(turn.responseText) && !["FAILED", "CANCELLED"].includes(String(turn.executionStatus)),
            clarification: Boolean(turn.clarificationReason) || stages.includes("CLARIFICATION"),
            latencyMs: typeof turn.latencyMs === "number" ? turn.latencyMs : 0,
            costUsd: ledgerCost || Number(turn.costUsd ?? 0),
            positiveFeedback: turnFeedback.length ? turnFeedback.every((item) => item.kind === "CORRECT") : null,
            corrected: turnFeedback.some((item) => ["WRONG_ROUTE", "WRONG_ANSWER", "BAD_CLARIFICATION"].includes(String(item.kind))),
          };
        }),
    );
  }

  async synthesizeLiveBenchmarkCase(
    ownerId: string,
    input: LiveReflectionInput,
    options: { signal?: AbortSignal } = {},
  ) {
    if (!this.router) throw new Error("REFLECTION_ROUTER_REQUIRED");
    options.signal?.throwIfAborted();
    const composed = new ReflectionContextComposer().compose(input);
    const request: Parameters<AIRouterService["executeStructured"]>[0] = {
        requestId: crypto.randomUUID(),
        purpose: "EVALUATION",
        requestedRole: "GENERAL_REASONER",
        input: [{ role: "user", content: [{ type: "text", text: composed.prompt }] }],
        outputMode: "STRUCTURED",
        schemaName: "Phase21CReflectionSynthesis",
        schema: ReflectionSynthesisSchema,
        jsonSchema: ReflectionSynthesisJsonSchema,
        temperature: 0.1,
        maxOutputTokens: 500,
        timeoutMs: 45_000,
        privacy: "LOCAL_ONLY",
        locality: "LOCAL_ONLY",
        allowCloud: false,
        allowFallback: false,
        allowClarification: false,
        maxAttempts: 1,
        economicContext: {
          ownerId,
          purpose: "EVALUATION",
          autonomyMode: "INTERACTIVE",
          priority: "IMPORTANT",
          costCenter: "phase21c-reflection-benchmark",
        },
      };
    const first = await this.router.executeStructured(
      request,
      options.signal ? { signal: options.signal } : {},
    );
    const firstPassStructured = first.structuredOutput !== undefined;
    options.signal?.throwIfAborted();
    const response = firstPassStructured
      ? first
      : await this.router.executeStructured(
          { ...request, requestId: crypto.randomUUID() },
          options.signal ? { signal: options.signal } : {},
        );
    const output = ReflectionSynthesisSchema.parse(response.structuredOutput);
    const unsupportedEvidenceIds = [
      ...output.evidenceIds,
      ...output.causalClaims.flatMap((claim) => claim.evidenceIds),
    ].filter((id) => !composed.evidenceIds.has(id));
    return {
      output,
      firstPassStructured,
      providerId: response.providerId ?? null,
      modelId: response.modelId ?? null,
      unsupportedEvidenceIds: [...new Set(unsupportedEvidenceIds)],
      unsupportedCausalClaimCount: output.causalClaims.filter((claim) =>
        claim.evidenceIds.some((id) => !composed.evidenceIds.has(id)),
      ).length,
    };
  }

  async getRelevantReflectionEvidence(ownerId: string) {
    const [reflections, patterns, calibrations] = await Promise.all([
      this.store.listReflections(ownerId),
      this.store.listPatterns(ownerId),
      this.store.listCalibrations(ownerId),
    ]);
    return {
      recentReflections: reflections.slice(-5).map((item) => ({
        scopeId: item.scopeId,
        outcome: item.outcome,
        confidence: item.confidence,
        recommendations: item.recommendations.slice(0, 3),
      })),
      supportedPatterns: patterns
        .filter((item) => item.status === "SUPPORTED")
        .slice(0, 5)
        .map(({ type, description, confidence }) => ({
          type,
          description,
          confidence,
        })),
      calibrations: calibrations
        .filter((item) => item.status === "CALIBRATED")
        .slice(0, 5)
        .map(
          ({ category, scope, sampleCount, biasPercent, meanAbsoluteError, trend, fallbackLevel, confidence }) => ({
            category,
            scope,
            sampleCount,
            biasPercent,
            meanAbsoluteError,
            trend,
            fallbackLevel,
            confidence,
          }),
        ),
      authority: "CONTEXT_ONLY" as const,
    };
  }

  async getEstimateCalibration(
    ownerId: string,
    requested: {
      taskType?: string;
      projectId?: string;
      workflowId?: string;
      agentId?: string;
      estimateSource?: string;
      complexityBand?: string;
    } = {},
  ) {
    const calibrations = (await this.store.listCalibrations(ownerId)).filter(
      (item) => item.metricType === "ESTIMATE" && item.status === "CALIBRATED",
    );
    const candidates = [
      { level: "EXACT" as const, match: (item: (typeof calibrations)[number]) => Object.keys(requested).length > 0 && Object.entries(requested).every(([key, value]) => value === undefined || item.scope[key as keyof typeof item.scope] === value) },
      { level: "TASK_TYPE_PROJECT" as const, match: (item: (typeof calibrations)[number]) => Boolean(requested.taskType && requested.projectId) && item.scope.taskType === requested.taskType && item.scope.projectId === requested.projectId },
      { level: "TASK_TYPE" as const, match: (item: (typeof calibrations)[number]) => Boolean(requested.taskType) && item.scope.taskType === requested.taskType && item.scope.projectId === null },
      { level: "PROJECT" as const, match: (item: (typeof calibrations)[number]) => Boolean(requested.projectId) && item.scope.projectId === requested.projectId && item.scope.taskType === null },
      { level: "GLOBAL" as const, match: (item: (typeof calibrations)[number]) => Object.values(item.scope).every((value) => value === null) },
    ];
    for (const candidate of candidates) {
      const calibration = calibrations.find(candidate.match);
      if (calibration) return { ...calibration, fallbackLevel: candidate.level };
    }
    return null;
  }

  async getKnownPatterns(ownerId: string) {
    return (await this.store.listPatterns(ownerId)).filter(
      (item) => item.status === "SUPPORTED",
    );
  }

  async getHistoricalDecisionPerformance(ownerId: string) {
    return (await this.store.listReflections(ownerId)).filter(
      (item) => item.reflectionType === "DECISION_RETROSPECTIVE",
    );
  }

  async getFutureSkillSignals(ownerId: string) {
    const [reflections, patterns] = await Promise.all([
      this.store.listReflections(ownerId),
      this.store.listPatterns(ownerId),
    ]);
    return {
      repeatedWorkflowFailure: reflections.filter(
        (item) => item.scopeType === "WORKFLOW" && item.outcome === "MISSED",
      ).length,
      recurringReusablePatterns: patterns.filter(
        (item) => item.status === "SUPPORTED",
      ).map((item) => item.id),
      poorToolChoice: reflections.filter(
        (item) =>
          item.reflectionType === "ROUTING_REVIEW" && item.outcome === "MISSED",
      ).map((item) => item.id),
      successfulStrategy: reflections.filter((item) =>
        ["MET_EXPECTATION", "EXCEEDED_EXPECTATION"].includes(item.outcome),
      ).map((item) => item.id),
      authority: "ADVISORY_SIGNAL_ONLY" as const,
      skillMutationAllowed: false as const,
    };
  }

  async reflectMaterializedRiskEvent(
    ownerId: string,
    input: { scopeId: string; baselineVersion: string; sourceSnapshot: unknown },
    options: { signal?: AbortSignal } = {},
  ) {
    options.signal?.throwIfAborted();
    const matching = (await this.executive.listRisks(ownerId)).find(
      (risk) => risk.id === input.scopeId,
    );
    if (matching)
      return this.query(
        ownerId,
        {
          type: "EVALUATE_RISK",
          scope: "RISK",
          entityId: matching.id,
          periodStart: matching.createdAt,
          periodEnd: this.now().toISOString(),
          requestedDepth: "STANDARD",
        },
        options,
      );
    const snapshotDigest = digest({
      type: "UNANTICIPATED_RISK",
      scopeId: input.scopeId,
      baselineVersion: input.baselineVersion,
      sourceSnapshot: input.sourceSnapshot,
    });
    const prior = (await this.store.listReflections(ownerId)).find(
      (item) =>
        item.reflectionType === "RISK_RETROSPECTIVE" &&
        item.snapshotDigest === snapshotDigest,
    );
    if (prior) return prior;
    options.signal?.throwIfAborted();
    const at = this.now().toISOString();
    const reflection = ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType: "RISK",
      scopeId: input.scopeId,
      reflectionType: "RISK_RETROSPECTIVE",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: input.baselineVersion,
      snapshotDigest,
      periodStart: null,
      periodEnd: at,
      outcome: "MISSED",
      expectedState: { predictedRisk: false },
      actualState: { materializedRisk: true },
      deviations: ["A major adverse event materialized without a matching predicted risk."],
      metrics: [],
      successes: [],
      failures: ["The materialized risk was not present in the durable risk register."],
      contributingFactors: [],
      assumptions: [],
      rootCauses: [{
        category: "UNANTICIPATED_RISK",
        description: "No matching risk prediction existed when the adverse event materialized.",
        confidence: 0.9,
        evidenceIds: [input.scopeId],
        alternativeExplanations: [],
      }],
      lessons: ["Review risk discovery coverage without treating the event as proof of an unsupported cause."],
      recommendations: ["Add the observed risk class to the next bounded risk review."],
      evidence: [{
        type: "RISK_MATERIALIZED_EVENT",
        sourceId: input.scopeId,
        sourceType: "SYSTEM_EVENT",
        timestamp: at,
        description: "A bounded system event recorded that an unregistered risk materialized.",
        authority: "SYSTEM_RECORD",
      }],
      confidence: 0.9,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: at,
    });
    await this.store.saveReflection(reflection);
    return reflection;
  }

  async recordFeedback(ownerId: string, reflectionId: string, raw: unknown) {
    const body = ReflectionFeedbackRequestSchema.parse(raw);
    const original = (await this.store.listReflections(ownerId)).find(
      (item) => item.id === reflectionId,
    );
    if (!original) return null;
    const at = this.now().toISOString();
    const correctionEvidence = body.correction
      ? [
          {
            type: "USER_CORRECTION",
            sourceId: body.evidenceSourceId ?? `owner-feedback:${reflectionId}`,
            sourceType: "OWNER_FEEDBACK",
            timestamp: at,
            description: body.correction,
            authority: "OWNER_CORRECTION" as const,
          },
        ]
      : [];
    const revised = ReflectionRecordSchema.parse({
      ...original,
      id: crypto.randomUUID(),
      status: "REVISED",
      previousVersionId: original.id,
      snapshotDigest: digest({ original: original.snapshotDigest, body, at }),
      failures: body.correction
        ? [...original.failures, `Owner correction: ${body.correction}`].slice(-50)
        : original.failures,
      rootCauses:
        body.feedback === "WRONG_CAUSE"
          ? body.evidenceSourceId
            ? [
                {
                  category: "UNKNOWN",
                  description: body.correction ?? "Owner disputed the prior cause.",
                  confidence: 0.5,
                  evidenceIds: [body.evidenceSourceId],
                  alternativeExplanations: original.rootCauses.map(
                    (item) => item.description,
                  ),
                },
              ]
            : []
          : original.rootCauses,
      evidence: [...original.evidence, ...correctionEvidence].slice(-200),
      recommendations: [
        ...original.recommendations,
        "Review the owner correction against additional durable evidence.",
      ].slice(-30),
      source: "USER_CORRECTED",
      createdBy: "OWNER",
      providerId: null,
      modelId: null,
      confidence: body.evidenceSourceId
        ? Math.min(original.confidence, 0.7)
        : Math.min(original.confidence, 0.4),
      createdAt: at,
    });
    await this.store.saveReflection(revised);
    return revised;
  }
  async query(
    ownerId: string,
    raw: ReflectionQuery,
    options: { signal?: AbortSignal } = {},
  ) {
    const query = ReflectionQuerySchema.parse(raw);
    const [
      plans,
      decisions,
      risks,
      goals,
      objectives,
      kpis,
      taskRecords,
      dependencies,
    ] = await Promise.all([
      this.executive.listPlans(ownerId),
      this.executive.listDecisions(ownerId),
      this.executive.listRisks(ownerId),
      this.executive.listGoals(ownerId),
      this.executive.listObjectives(ownerId),
      this.executive.listKpis(ownerId),
      this.tasks.listTasks(ownerId, 500),
      this.tasks.listDependencies(ownerId, 500),
    ]);
    let reflection: ReflectionRecord | null = null;
    if (
      [
        "EVALUATE_PLAN",
        "RETROSPECTIVE",
        "WHY_FAILED",
        "WHY_SUCCEEDED",
        "WEEKLY_REVIEW",
      ].includes(query.type)
    ) {
      const plan = this.resolvePlan(plans, query.entityId);
      if (plan)
        reflection = this.evaluatePlan(
          ownerId,
          plan,
          plans,
          taskRecords,
          dependencies,
          query,
        );
    } else if (query.type === "EVALUATE_DECISION") {
      const decision = this.resolveDecision(decisions, query.entityId);
      if (decision) reflection = this.evaluateDecision(ownerId, decision, query);
    } else if (query.type === "EVALUATE_RISK") {
      const risk = query.entityId
        ? (risks.find((item) => item.id === query.entityId) ?? null)
        : ([...risks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
          null);
      if (risk) reflection = this.evaluateRisk(ownerId, risk);
    } else if (query.type === "EVALUATE_GOAL") {
      const goal = query.entityId
        ? (goals.find((item) => item.id === query.entityId) ?? null)
        : (goals[0] ?? null);
      if (goal) reflection = this.evaluateGoal(ownerId, goal, objectives);
    } else if (query.type === "EVALUATE_KPI") {
      const kpi = query.entityId
        ? (kpis.find((item) => item.id === query.entityId) ?? null)
        : (kpis[0] ?? null);
      if (kpi) reflection = this.evaluateKpi(ownerId, kpi);
    } else if (query.type === "EVALUATE_ESTIMATE" || query.type === "CALIBRATION") {
      await this.calibrate(ownerId, taskRecords, decisions, plans, risks);
    }
    if (reflection) {
      const prior = (await this.store.listReflections(ownerId)).find(
        (item) =>
          item.snapshotDigest === reflection!.snapshotDigest &&
          item.reflectionType === reflection!.reflectionType,
      );
      if (prior) reflection = prior;
      else {
        const text = await this.synthesize(ownerId, reflection, options.signal);
        reflection = ReflectionRecordSchema.parse({
          ...reflection,
          source: text.providerId ? "MODEL_ASSISTED" : "DETERMINISTIC",
          providerId: text.providerId,
          modelId: text.modelId,
        });
        await this.store.saveReflection(reflection);
        await this.updatePatterns(ownerId, reflection);
      }
    }
    const currentPatterns = await this.store.listPatterns(ownerId);
    const currentCalibrations = await this.store.listCalibrations(ownerId);
    const deterministic = reflection
      ? this.explain(reflection)
      : query.type === "FIND_PATTERNS"
        ? currentPatterns.length
          ? currentPatterns
              .map(
                (p) => `${p.description} (${p.status}, ${p.evidenceCount} supporting)`,
              )
              .join(" ")
          : "There is not enough repeated evidence to identify a pattern."
        : currentCalibrations.length
          ? currentCalibrations
              .map(
                (c) =>
                  `${c.category}: ${c.sampleCount} samples, ${c.biasPercent}% bias.`,
              )
              .join(" ")
          : "There is not enough historical evidence to evaluate that yet.";
    return ReflectionEngineResponseSchema.parse({
      query,
      text: deterministic,
      reflection,
      patterns: currentPatterns,
      calibrations: currentCalibrations,
      executed: false,
    });
  }
  async dashboard(ownerId: string) {
    const [reflections, patterns, calibrations, routingEconomics] = await Promise.all([
      this.store.listReflections(ownerId),
      this.store.listPatterns(ownerId),
      this.store.listCalibrations(ownerId),
      this.getRoutingEconomics(ownerId),
    ]);
    return {
      reflections,
      patterns,
      calibrations,
      routingEconomics,
      summary: {
        evaluated: reflections.length,
        met: reflections.filter((x) =>
          ["MET_EXPECTATION", "EXCEEDED_EXPECTATION"].includes(x.outcome),
        ).length,
        partial: reflections.filter((x) => x.outcome === "PARTIALLY_MET").length,
        missed: reflections.filter((x) => x.outcome === "MISSED").length,
        inconclusive: reflections.filter((x) => x.outcome === "INCONCLUSIVE").length,
      },
    };
  }
  async runPeriodicReview(
    ownerId: string,
    period: "DAILY" | "WEEKLY" | "MONTHLY" | "PROJECT_END" | "PLAN_END" | "GOAL_END",
    options: { signal?: AbortSignal } = {},
  ) {
    const type = period === "WEEKLY" ? "WEEKLY_REVIEW" : "RETROSPECTIVE";
    return this.query(
      ownerId,
      {
        type,
        scope: "CUSTOM_PERIOD",
        entityId: null,
        periodStart: null,
        periodEnd: this.now().toISOString(),
        requestedDepth: "STANDARD",
      },
      options,
    );
  }
  private resolvePlan(plans: ExecutivePlan[], id: string | null) {
    return id
      ? (plans.find((p) => p.id === id) ?? null)
      : ([...plans].sort((a, b) => b.version - a.version)[0] ?? null);
  }
  private resolveDecision(decisions: ExecutiveDecision[], id: string | null) {
    return id
      ? (decisions.find((d) => d.id === id) ?? null)
      : ([...decisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
          null);
  }
  private evaluatePlan(
    ownerId: string,
    plan: ExecutivePlan,
    plans: ExecutivePlan[],
    tasks: Awaited<ReturnType<TaskStore["listTasks"]>>,
    dependencies: Awaited<ReturnType<TaskStore["listDependencies"]>>,
    query: ReflectionQuery,
  ) {
    void query;
    const relevant = tasks.filter((t) => plan.taskIds.includes(t.id));
    const latestPlan =
      [...plans]
        .filter((item) => item.goalId === plan.goalId)
        .sort((a, b) => b.version - a.version)[0] ?? plan;
    const tasksAdded = latestPlan.taskIds.filter((id) => !plan.taskIds.includes(id));
    const tasksRemoved = plan.taskIds.filter((id) => !latestPlan.taskIds.includes(id));
    const completed = relevant.filter((t) => t.status === "completed");
    const actualEffort = relevant.reduce(
      (s, t) =>
        s +
        (typeof t.metadata.actualMinutes === "number" ? t.metadata.actualMinutes : 0),
      0,
    );
    const expected = plan.effortMinutes;
    const completion = plan.taskIds.length
      ? (completed.length / plan.taskIds.length) * 100
      : null;
    const effortVariance = actualEffort && expected ? actualEffort - expected : null;
    const actualCompletionAt =
      completed
        .map((task) => task.metadata.actualCompletionAt)
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1) ?? null;
    const deadlineVarianceMinutes =
      plan.expectedCompletionAt && actualCompletionAt
        ? (Date.parse(actualCompletionAt) - Date.parse(plan.expectedCompletionAt)) /
          60_000
        : null;
    const metrics = [
      {
        name: "task_completion",
        expected: 100,
        actual: completion,
        unit: "%",
        variance: completion === null ? null : completion - 100,
        variancePercent: completion === null ? null : completion - 100,
      },
      {
        name: "effort",
        expected,
        actual: actualEffort || null,
        unit: "minutes",
        variance: effortVariance,
        variancePercent:
          effortVariance === null || !expected
            ? null
            : (effortVariance / expected) * 100,
      },
      {
        name: "deadline",
        expected: plan.expectedCompletionAt
          ? Date.parse(plan.expectedCompletionAt)
          : null,
        actual: actualCompletionAt ? Date.parse(actualCompletionAt) : null,
        unit: "epoch_ms",
        variance: deadlineVarianceMinutes,
        variancePercent: null,
      },
    ];
    const outcome =
      completion === null
        ? "INCONCLUSIVE"
        : completion === 100 && (!effortVariance || effortVariance <= 0)
          ? "MET_EXPECTATION"
          : completion >= 60
            ? "PARTIALLY_MET"
            : "MISSED";
    const evidence = relevant.map((t) => ({
      type: "TASK_STATE",
      sourceId: t.id,
      sourceType: "TASK",
      timestamp: t.updatedAt,
      description: `${t.name}: ${t.status}`,
      authority: "DURABLE_STATE" as const,
    }));
    const failures = [
      ...(completion !== null && completion < 100
        ? [
            `${plan.taskIds.length - completed.length} planned tasks were not completed.`,
          ]
        : []),
      ...(effortVariance && effortVariance > 0
        ? [`Actual effort exceeded the estimate by ${effortVariance} minutes.`]
        : []),
    ];
    const completedIds = new Set(
      tasks.filter((item) => item.status === "completed").map((item) => item.id),
    );
    const blockedDependencies = dependencies.filter(
      (item) =>
        plan.taskIds.includes(item.taskId) &&
        !item.optional &&
        !completedIds.has(item.dependsOnTaskId),
    );
    const assumptions = plan.assumptions.map((assumption) =>
      this.evaluateAssumption(assumption, relevant),
    );
    return ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType:
        query.scope === "PROJECT"
          ? "PROJECT"
          : query.scope === "CUSTOM_PERIOD"
            ? "CUSTOM_PERIOD"
            : "PLAN_VERSION",
      scopeId: plan.id,
      reflectionType:
        query.type === "WHY_FAILED"
          ? "FAILURE_ANALYSIS"
          : query.type === "WHY_SUCCEEDED"
            ? "SUCCESS_ANALYSIS"
            : query.type === "WEEKLY_REVIEW" || query.scope === "CUSTOM_PERIOD"
              ? "PERIODIC_REVIEW"
              : query.scope === "PROJECT"
                ? "PROJECT_RETROSPECTIVE"
                : "PLAN_RETROSPECTIVE",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: `v${plan.version}`,
      snapshotDigest: digest({ plan, relevant }),
      periodStart: plan.createdAt,
      periodEnd: this.now().toISOString(),
      outcome,
      expectedState: {
        taskCount: plan.taskIds.length,
        effortMinutes: expected,
        completionAt: plan.expectedCompletionAt,
      },
      actualState: {
        completedTaskCount: completed.length,
        currentTaskCount: latestPlan.taskIds.length,
        tasksAdded,
        tasksRemoved,
        effortMinutes: actualEffort || null,
        completionAt: actualCompletionAt,
      },
      deviations: [
        ...failures,
        ...(tasksAdded.length
          ? [`${tasksAdded.length} tasks were added in later plan versions.`]
          : []),
        ...(tasksRemoved.length
          ? [`${tasksRemoved.length} tasks were removed in later plan versions.`]
          : []),
      ],
      metrics,
      successes: completed.map((t) => `${t.name} completed.`),
      failures,
      contributingFactors: [
        ...assumptions
          .filter((item) => item.status === "FALSE")
          .map((item) => `False assumption: ${item.assumption}`),
        ...(blockedDependencies.length
          ? [`${blockedDependencies.length} blocking dependencies remained incomplete.`]
          : []),
        ...(tasksAdded.length ? ["Scope grew after the evaluated baseline."] : []),
      ],
      assumptions,
      rootCauses:
        failures.length && evidence.length
          ? [
              {
                category: blockedDependencies.length
                  ? "DEPENDENCY_DELAY"
                  : assumptions.some((item) => item.status === "FALSE")
                    ? "INCORRECT_ASSUMPTION"
                    : effortVariance && effortVariance > 0
                      ? "ESTIMATE_ERROR"
                      : "EXECUTION_FAILURE",
                description: failures[0]!,
                confidence: 0.75,
                evidenceIds: evidence.map((e) => e.sourceId).slice(0, 20),
                alternativeExplanations: [],
              },
            ]
          : [],
      lessons:
        effortVariance && effortVariance > 0
          ? ["Similar work may need a larger evidence-backed effort buffer."]
          : [],
      recommendations: failures.length
        ? [
            "Review incomplete work and constraints before creating the next plan version.",
          ]
        : [],
      evidence,
      confidence: evidence.length ? Math.min(0.95, 0.5 + evidence.length * 0.05) : 0.2,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: this.now().toISOString(),
    });
  }
  private evaluateDecision(
    ownerId: string,
    d: ExecutiveDecision,
    query: ReflectionQuery,
  ) {
    void query;
    const adopted = Boolean(d.chosenOption);
    const actual = Boolean(d.actualOutcome);
    const successful =
      actual && d.expectedOutcome
        ? d.actualOutcome!.includes(d.expectedOutcome)
        : null;
    const recommendationEvaluation = evaluateRecommendationEvidence({
      made: Boolean(d.recommendation),
      accepted: adopted || ["ACCEPTED", "IMPLEMENTED"].includes(d.status),
      implemented: d.status === "IMPLEMENTED",
      ignored: d.status === "REJECTED",
      superseded: d.status === "SUPERSEDED",
      outcomeObservable: actual,
      successful,
    });
    const outcome =
      recommendationEvaluation.result === "NOT_ADOPTED"
        ? "NOT_ADOPTED"
        : !adopted || !actual
        ? "INCONCLUSIVE"
        : d.expectedOutcome && d.actualOutcome?.includes(d.expectedOutcome)
          ? "MET_EXPECTATION"
          : "PARTIALLY_MET";
    const outcomeQuality =
      !adopted || !actual ? null : outcome === "MET_EXPECTATION" ? 100 : 50;
    const evidence = [
      {
        type: "DECISION_RECORD",
        sourceId: d.id,
        sourceType: "DECISION",
        timestamp: d.updatedAt,
        description: `Recommendation ${d.recommendation}; chosen ${d.chosenOption ?? "none"}.`,
        authority: "DURABLE_STATE" as const,
      },
    ];
    const processScore =
      ((d.criteria.length +
        d.evidence.length +
        (d.assumptions.length ? 1 : 0) +
        (d.risks.length ? 1 : 0)) /
        8) *
      100;
    return ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType: "DECISION",
      scopeId: d.id,
      reflectionType: "DECISION_RETROSPECTIVE",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: d.updatedAt,
      snapshotDigest: digest(d),
      periodStart: d.createdAt,
      periodEnd: this.now().toISOString(),
      outcome,
      expectedState: {
        recommendation: d.recommendation,
        expectedOutcome: d.expectedOutcome,
        confidence: d.confidence,
      },
      actualState: {
        chosenOption: d.chosenOption,
        actualOutcome: d.actualOutcome,
      },
      deviations:
        outcomeQuality === 50
          ? ["The recorded outcome did not fully match the expected outcome."]
          : [],
      metrics: [
        {
          name: "decision_process_quality",
          expected: 100,
          actual: Math.min(100, processScore),
          unit: "%",
          variance: Math.min(100, processScore) - 100,
          variancePercent: Math.min(100, processScore) - 100,
        },
        {
          name: "decision_outcome_quality",
          expected: 100,
          actual: outcomeQuality,
          unit: "%",
          variance: outcomeQuality === null ? null : outcomeQuality - 100,
          variancePercent: outcomeQuality === null ? null : outcomeQuality - 100,
        },
      ],
      successes:
        processScore >= 70
          ? ["Decision process documented substantial evidence and criteria."]
          : [],
      failures: !adopted
        ? [
            "Recommendation was not adopted, so implementation outcome is not attributable to it.",
          ]
        : !actual
          ? ["Actual outcome has not been recorded."]
          : [],
      contributingFactors: [],
      assumptions: d.assumptions.map((a) => ({
        assumption: a,
        status: "UNKNOWN",
        evidenceIds: [],
      })),
      rootCauses: [],
      lessons: [],
      recommendations: !actual
        ? ["Record the actual outcome before evaluating outcome quality."]
        : [],
      recommendationEvaluation,
      evidence,
      confidence: actual ? 0.75 : 0.35,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: this.now().toISOString(),
    });
  }
  private evaluateGoal(
    ownerId: string,
    goal: ExecutiveGoal,
    objectives: ExecutiveObjective[],
  ) {
    const linked = objectives.filter((item) => item.goalId === goal.id);
    const progress = linked.length
      ? linked.reduce((sum, item) => sum + item.progress, 0) / linked.length
      : goal.status === "COMPLETED"
        ? 100
        : null;
    const outcome =
      goal.status === "COMPLETED" && progress === 100
        ? "MET_EXPECTATION"
        : goal.status === "CANCELLED"
          ? "MISSED"
          : progress !== null && progress >= 60
            ? "PARTIALLY_MET"
            : "INCONCLUSIVE";
    const evidence = linked.map((item) => ({
      type: "OBJECTIVE_STATE",
      sourceId: item.id,
      sourceType: "OBJECTIVE",
      timestamp: item.updatedAt,
      description: `${item.title}: ${item.progress}% (${item.status}).`,
      authority: "DURABLE_STATE" as const,
    }));
    return ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType: "GOAL",
      scopeId: goal.id,
      reflectionType: "GOAL_REVIEW",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: goal.createdAt,
      snapshotDigest: digest({ goal, linked }),
      periodStart: goal.startDate ?? goal.createdAt,
      periodEnd: this.now().toISOString(),
      outcome,
      expectedState: {
        successCriteria: goal.successCriteria,
        targetDate: goal.targetDate,
        objectiveProgress: 100,
      },
      actualState: {
        status: goal.status,
        completedAt: goal.completedAt,
        objectiveProgress: progress,
      },
      deviations:
        progress === null
          ? ["Objective progress evidence is unavailable."]
          : progress < 100
            ? [
                `Objective progress is ${100 - progress} percentage points below target.`,
              ]
            : [],
      metrics: [
        {
          name: "goal_objective_progress",
          expected: 100,
          actual: progress,
          unit: "%",
          variance: progress === null ? null : progress - 100,
          variancePercent: progress === null ? null : progress - 100,
        },
      ],
      successes:
        outcome === "MET_EXPECTATION"
          ? ["The goal and its recorded objectives met the target."]
          : [],
      failures:
        outcome === "MISSED"
          ? ["The goal was cancelled before meeting its recorded expectation."]
          : [],
      contributingFactors: [],
      assumptions: [],
      rootCauses: [],
      lessons: [],
      recommendations:
        progress === null
          ? ["Record objective progress before drawing a stronger conclusion."]
          : [],
      evidence,
      confidence: evidence.length ? Math.min(0.9, 0.5 + evidence.length * 0.05) : 0.25,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: this.now().toISOString(),
    });
  }
  private evaluateKpi(ownerId: string, kpi: ExecutiveKpi) {
    const gap =
      kpi.direction === "HIGHER_IS_BETTER"
        ? kpi.currentValue - kpi.target
        : kpi.direction === "LOWER_IS_BETTER"
          ? kpi.target - kpi.currentValue
          : kpi.direction === "BINARY"
            ? kpi.currentValue === kpi.target
              ? 0
              : -1
            : -Math.abs(kpi.currentValue - kpi.target);
    const met = gap >= 0;
    const evidence = [
      {
        type: "KPI_RECORD",
        sourceId: kpi.id,
        sourceType: "KPI",
        timestamp: kpi.updatedAt,
        description: `${kpi.name}: current ${kpi.currentValue}, target ${kpi.target}.`,
        authority: "DURABLE_STATE" as const,
      },
    ];
    return ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType: "KPI",
      scopeId: kpi.id,
      reflectionType: "PERIODIC_REVIEW",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: kpi.updatedAt,
      snapshotDigest: digest(kpi),
      periodStart: null,
      periodEnd: this.now().toISOString(),
      outcome: met ? "MET_EXPECTATION" : "MISSED",
      expectedState: {
        target: kpi.target,
        direction: kpi.direction,
        period: kpi.period,
      },
      actualState: { value: kpi.currentValue },
      deviations: met ? [] : [`KPI is ${Math.abs(gap)}${kpi.unit} short of target.`],
      metrics: [
        {
          name: "kpi_deviation",
          expected: kpi.target,
          actual: kpi.currentValue,
          unit: kpi.unit,
          variance: kpi.currentValue - kpi.target,
          variancePercent:
            kpi.target === 0
              ? null
              : ((kpi.currentValue - kpi.target) / Math.abs(kpi.target)) * 100,
        },
      ],
      successes: met ? ["The KPI met its recorded target."] : [],
      failures: met ? [] : ["The KPI did not meet its recorded target."],
      contributingFactors: [],
      assumptions: [],
      rootCauses: [],
      lessons: [],
      recommendations: [
        "Causal evidence is required before attributing this KPI result.",
      ],
      evidence,
      confidence: kpi.confidence,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: this.now().toISOString(),
    });
  }
  private evaluateRisk(ownerId: string, risk: ExecutiveRisk) {
    const observed =
      risk.status === "MATERIALIZED" ? 100 : risk.status === "RESOLVED" ? 0 : null;
    const predicted = risk.likelihood * 100;
    const outcome =
      observed === null
        ? "INCONCLUSIVE"
        : Math.abs(observed - predicted) <= 25
          ? "MET_EXPECTATION"
          : Math.abs(observed - predicted) <= 50
            ? "PARTIALLY_MET"
            : "MISSED";
    const evidence = [
      {
        type: "RISK_RECORD",
        sourceId: risk.id,
        sourceType: "RISK",
        timestamp: risk.updatedAt,
        description: `Risk status ${risk.status}; predicted likelihood ${predicted}%.`,
        authority: "DURABLE_STATE" as const,
      },
    ];
    return ReflectionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      scopeType: "RISK",
      scopeId: risk.id,
      reflectionType: "RISK_RETROSPECTIVE",
      status: "FINAL",
      previousVersionId: null,
      baselineVersion: risk.createdAt,
      snapshotDigest: digest(risk),
      periodStart: risk.createdAt,
      periodEnd: this.now().toISOString(),
      outcome,
      expectedState: {
        likelihoodPercent: predicted,
        impact: risk.impact,
        mitigation: risk.mitigation,
      },
      actualState: {
        materialized: observed,
        mitigationExecution: risk.mitigationExecution,
        mitigationEffect: risk.mitigationEffect,
      },
      deviations:
        observed === null
          ? []
          : [
              `Prediction error was ${Math.abs(observed - predicted)} percentage points.`,
            ],
      metrics: [
        {
          name: "risk_realization",
          expected: predicted,
          actual: observed,
          unit: "%",
          variance: observed === null ? null : observed - predicted,
          variancePercent: null,
        },
      ],
      successes:
        outcome === "MET_EXPECTATION"
          ? ["Risk realization was consistent with the recorded probability band."]
          : [],
      failures:
        outcome === "MISSED"
          ? ["Risk realization differed substantially from the recorded probability."]
          : [],
      contributingFactors: [],
      assumptions: [],
      rootCauses: [],
      lessons: [],
      recommendations:
        observed === null
          ? [
              "Wait for a resolved or materialized risk outcome before judging prediction quality.",
            ]
          : [],
      mitigationEvaluation: {
        execution: risk.mitigationExecution,
        effectiveness: risk.mitigationEffect,
        credited:
          ["EXECUTED", "PARTIALLY_EXECUTED"].includes(risk.mitigationExecution) &&
          ["PREVENTED", "REDUCED"].includes(risk.mitigationEffect),
      },
      evidence,
      confidence: observed === null ? 0.3 : 0.7,
      source: "DETERMINISTIC",
      providerId: null,
      modelId: null,
      createdAt: this.now().toISOString(),
    });
  }
  private async calibrate(
    ownerId: string,
    tasks: Awaited<ReturnType<TaskStore["listTasks"]>>,
    decisions: ExecutiveDecision[],
    plans: ExecutivePlan[],
    risks: ExecutiveRisk[],
  ) {
    const samples = tasks.flatMap((t) =>
      typeof t.metadata.estimatedMinutes === "number" &&
      typeof t.metadata.actualMinutes === "number"
        ? [{
            e: t.metadata.estimatedMinutes,
            a: t.metadata.actualMinutes,
            taskType: typeof t.metadata.taskType === "string" ? t.metadata.taskType : t.type,
            projectId: typeof t.metadata.projectId === "string" ? t.metadata.projectId : null,
            workflowId: typeof t.metadata.workflowId === "string" ? t.metadata.workflowId : null,
            agentId: typeof t.metadata.agentId === "string" ? t.metadata.agentId : null,
            estimateSource: typeof t.metadata.estimateSource === "string" ? t.metadata.estimateSource : null,
            complexityBand: typeof t.metadata.complexityBand === "string" ? t.metadata.complexityBand : null,
          }]
        : [],
    );
    const existing = await this.store.listCalibrations(ownerId);
    const groups = new Map<string, { scope: { taskType: string | null; projectId: string | null; workflowId: string | null; agentId: string | null; estimateSource: string | null; complexityBand: string | null }; samples: typeof samples }>();
    const addGroup = (scope: { taskType: string | null; projectId: string | null; workflowId: string | null; agentId: string | null; estimateSource: string | null; complexityBand: string | null }, sample: (typeof samples)[number]) => {
      const key = JSON.stringify(scope);
      const group = groups.get(key) ?? { scope, samples: [] };
      group.samples.push(sample);
      groups.set(key, group);
    };
    for (const sample of samples) {
      const empty = { taskType: null, projectId: null, workflowId: null, agentId: null, estimateSource: null, complexityBand: null };
      addGroup(empty, sample);
      addGroup({ ...empty, taskType: sample.taskType }, sample);
      if (sample.projectId) addGroup({ ...empty, projectId: sample.projectId }, sample);
      if (sample.projectId) addGroup({ ...empty, taskType: sample.taskType, projectId: sample.projectId }, sample);
      for (const key of ["workflowId", "agentId", "estimateSource", "complexityBand"] as const)
        if (sample[key]) addGroup({ ...empty, [key]: sample[key] }, sample);
    }
    for (const { scope, samples: groupSamples } of groups.values()) {
      const category = Object.entries(scope).filter(([, value]) => value).map(([key, value]) => `${key}:${value}`).join("|") || "all_tasks";
      const meanE = groupSamples.reduce((s, x) => s + x.e, 0) / groupSamples.length;
      const meanA = groupSamples.reduce((s, x) => s + x.a, 0) / groupSamples.length;
      const sufficient = groupSamples.length >= this.minimumCalibrationSamples;
      const rawBias = meanE ? ((meanA - meanE) / meanE) * 100 : 0;
      await this.store.saveCalibration(ReflectionCalibrationSchema.parse({
        id: existing.find((item) => item.category === category && item.metricType === "ESTIMATE")?.id ?? crypto.randomUUID(),
        ownerId,
        category,
        metricType: "ESTIMATE",
        scope,
        sampleCount: groupSamples.length,
        minimumSampleCount: this.minimumCalibrationSamples,
        status: sufficient ? "CALIBRATED" : "INSUFFICIENT_DATA",
        meanEstimate: meanE,
        meanActual: meanA,
        biasPercent: rawBias,
        meanAbsoluteError: groupSamples.reduce((s, x) => s + Math.abs(x.a - x.e), 0) / groupSamples.length,
        confidence: sufficient ? Math.min(0.95, groupSamples.length / 10) : 0,
        trend: sufficient ? rawBias > 5 ? "UNDER_ESTIMATING" : rawBias < -5 ? "OVER_ESTIMATING" : "STABLE" : "INSUFFICIENT_DATA",
        fallbackLevel: "NONE",
        updatedAt: this.now().toISOString(),
      }));
    }
    const confidenceSamples: Array<{
      source: "decision" | "plan" | "recommendation" | "risk" | "schedule";
      confidence: number;
      correct: number;
    }> = [];
    for (const decision of decisions) {
      if (!decision.chosenOption || !decision.actualOutcome) continue;
      const correct =
        decision.expectedOutcome !== null &&
        decision.actualOutcome.includes(decision.expectedOutcome)
          ? 1
          : 0;
      confidenceSamples.push({ source: "decision", confidence: decision.confidence, correct });
      confidenceSamples.push({ source: "recommendation", confidence: decision.confidence, correct });
    }
    for (const plan of plans) {
      if (!['COMPLETED', 'CANCELLED'].includes(plan.status)) continue;
      const planTasks = tasks.filter((task) => plan.taskIds.includes(task.id));
      confidenceSamples.push({
        source: "plan",
        confidence: plan.confidence,
        correct:
          plan.status === "COMPLETED" &&
          planTasks.length > 0 &&
          planTasks.every((task) => task.status === "completed")
            ? 1
            : 0,
      });
    }
    for (const risk of risks) {
      if (!['MATERIALIZED', 'RESOLVED'].includes(risk.status)) continue;
      const predicted = risk.likelihood >= 0.5;
      const observed = risk.status === "MATERIALIZED";
      confidenceSamples.push({
        source: "risk",
        confidence: risk.confidence,
        correct: predicted === observed ? 1 : 0,
      });
    }
    for (const task of tasks) {
      const scheduleConfidence = task.metadata.scheduleConfidence;
      if (
        typeof scheduleConfidence !== "number" ||
        scheduleConfidence < 0 ||
        scheduleConfidence > 1 ||
        !task.deadlineAt ||
        task.status !== "completed"
      ) continue;
      confidenceSamples.push({
        source: "schedule",
        confidence: scheduleConfidence,
        correct: Date.parse(task.updatedAt) <= Date.parse(task.deadlineAt) ? 1 : 0,
      });
    }
    for (const source of ["decision", "plan", "recommendation", "risk", "schedule"] as const) {
      for (const lower of [0.5, 0.6, 0.7, 0.8, 0.9]) {
        const bucket = confidenceSamples.filter(
          (sample) =>
            sample.source === source &&
            sample.confidence >= lower &&
            sample.confidence < (lower === 0.9 ? 1.01 : lower + 0.1),
        );
      if (!bucket.length) continue;
      const category = `${source}_confidence_${Math.round(lower * 100)}_${lower === 0.9 ? 100 : Math.round((lower + 0.09) * 100)}`;
      const expected =
        bucket.reduce((sum, item) => sum + item.confidence * 100, 0) / bucket.length;
      const actual =
        bucket.reduce((sum, item) => sum + item.correct * 100, 0) / bucket.length;
      await this.store.saveCalibration(
        ReflectionCalibrationSchema.parse({
          id:
            existing.find((item) => item.category === category)?.id ??
            crypto.randomUUID(),
          ownerId,
          category,
          metricType: "CONFIDENCE",
          scope: {},
          sampleCount: bucket.length,
          minimumSampleCount: this.minimumCalibrationSamples,
          status: bucket.length >= this.minimumCalibrationSamples ? "CALIBRATED" : "INSUFFICIENT_DATA",
          meanEstimate: expected,
          meanActual: actual,
          biasPercent: actual - expected,
          meanAbsoluteError:
            bucket.reduce(
              (sum, item) => sum + Math.abs(item.correct * 100 - item.confidence * 100),
              0,
            ) / bucket.length,
          confidence: bucket.length >= this.minimumCalibrationSamples ? Math.min(0.95, bucket.length / 10) : 0,
          trend: bucket.length >= this.minimumCalibrationSamples ? actual < expected - 5 ? "UNDER_ESTIMATING" : actual > expected + 5 ? "OVER_ESTIMATING" : "STABLE" : "INSUFFICIENT_DATA",
          fallbackLevel: "NONE",
          updatedAt: this.now().toISOString(),
        }),
      );
      }
    }
  }
  private async updatePatterns(ownerId: string, r: ReflectionRecord) {
    const effort = r.metrics.find((m) => m.name === "effort" && m.variance !== null);
    if (!effort) return;
    const existing = (await this.store.listPatterns(ownerId)).find(
      (p) => p.type === "EFFORT_UNDERESTIMATION",
    );
    if (effort.variance! > 0) {
      const count = (existing?.evidenceCount ?? 0) + 1;
      const pattern = ReflectionPatternSchema.parse({
        id: existing?.id ?? crypto.randomUUID(),
        ownerId,
        type: "EFFORT_UNDERESTIMATION",
        description: "Effort estimates have been lower than actual effort.",
        evidenceCount: count,
        contradictionCount: existing?.contradictionCount ?? 0,
        firstObserved: existing?.firstObserved ?? r.createdAt,
        lastObserved: r.createdAt,
        confidence: Math.min(0.95, count / 6),
        trend: "STRENGTHENING",
        linkedEntityIds: [
          ...new Set([...(existing?.linkedEntityIds ?? []), r.scopeId]),
        ],
        reflectionIds: [...new Set([...(existing?.reflectionIds ?? []), r.id])],
        status: count >= 6 ? "SUPPORTED" : "CANDIDATE",
      });
      await this.store.savePattern(pattern);
      if (pattern.status === "SUPPORTED" && existing?.status !== "SUPPORTED")
        await this.publishLearningCandidate(pattern, r);
      return;
    }
    if (!existing) return;
    const contradictionCount = existing.contradictionCount + 1;
    await this.store.savePattern(
      ReflectionPatternSchema.parse({
        ...existing,
        contradictionCount,
        lastObserved: r.createdAt,
        confidence: Math.max(0, (existing.evidenceCount - contradictionCount) / 6),
        trend: "WEAKENING",
        linkedEntityIds: [...new Set([...existing.linkedEntityIds, r.scopeId])],
        reflectionIds: [...new Set([...existing.reflectionIds, r.id])],
        status:
          contradictionCount >= existing.evidenceCount ? "WEAKENED" : existing.status,
      }),
    );
  }
  private evaluateAssumption(assumption: string, tasks: TaskRecord[]) {
    const findings: Array<{
      status: "CONFIRMED" | "PARTIALLY_TRUE" | "FALSE" | "NO_LONGER_RELEVANT";
      evidenceId: string;
    }> = [];
    for (const task of tasks) {
      const raw = task.metadata.assumptionResults;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const value = (raw as Record<string, unknown>)[assumption];
      if (
        ["CONFIRMED", "PARTIALLY_TRUE", "FALSE", "NO_LONGER_RELEVANT"].includes(
          String(value),
        )
      )
        findings.push({
          status: String(value) as
            "CONFIRMED" | "PARTIALLY_TRUE" | "FALSE" | "NO_LONGER_RELEVANT",
          evidenceId: task.id,
        });
    }
    if (findings.length) {
      const statuses = new Set(findings.map((item) => item.status));
      return {
        assumption,
        status: statuses.size === 1 ? findings[0]!.status : ("PARTIALLY_TRUE" as const),
        evidenceIds: findings.map((item) => item.evidenceId).slice(0, 20),
      };
    }
    return { assumption, status: "UNKNOWN" as const, evidenceIds: [] };
  }
  private async publishLearningCandidate(
    pattern: ReturnType<typeof ReflectionPatternSchema.parse>,
    r: ReflectionRecord,
  ) {
    if (!this.learningSink) return;
    await this.learningSink.ingest({
      ownerId: pattern.ownerId,
      requestId: `reflection:${r.id}`,
      ipAddress: "internal",
      body: {
        eventType: "REFLECTION_PATTERN_SUPPORTED",
        category: "WORKING_STYLE",
        subject: pattern.type,
        observedValue: pattern.description,
        sourceType: "api",
        sourceId: pattern.id,
        positiveEvidence: pattern.evidenceCount,
        negativeEvidence: pattern.contradictionCount,
        confidenceContribution: pattern.confidence,
        metadata: { reflectionId: r.id, authority: "ADVISORY_ONLY" },
      },
    });
  }
  private async synthesize(ownerId: string, r: ReflectionRecord, signal?: AbortSignal) {
    if (!this.router) return { providerId: null, modelId: null };
    signal?.throwIfAborted();
    try {
      const out = await this.router.execute(
        {
          purpose: "EVALUATION",
          requestedRole: "GENERAL_REASONER",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Summarize this evidence-backed reflection. Do not alter metrics, claim unsupported causality, mutate history, or claim action. ${JSON.stringify(r)}`,
                },
              ],
            },
          ],
          outputMode: "TEXT",
          temperature: 0.2,
          maxOutputTokens: 400,
          timeoutMs: 30000,
          risk: "LOW",
          privacy: "NO_EXTERNAL",
          locality: "LOCAL_ONLY",
          allowCloud: false,
          allowFallback: false,
          allowClarification: false,
          economicContext: {
            ownerId,
            purpose: "EVALUATION",
            autonomyMode: "INTERACTIVE",
            priority: "IMPORTANT",
          },
        },
        signal ? { signal } : {},
      );
      return { providerId: out.providerId ?? null, modelId: out.modelId ?? null };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { providerId: null, modelId: null };
    }
  }
  private explain(r: ReflectionRecord) {
    const metric = r.metrics
      .map(
        (m) =>
          `${m.name}: expected ${m.expected ?? "unknown"}, actual ${m.actual ?? "unknown"}${m.variance === null ? "" : `, variance ${Math.round(m.variance * 100) / 100}`}`,
      )
      .join("; ");
    return `${r.outcome}. ${metric}.${r.failures.length ? ` ${r.failures.join(" ")}` : ""}${r.confidence < 0.5 ? " Evidence is insufficient for a confident causal conclusion." : ""}`;
  }
}
