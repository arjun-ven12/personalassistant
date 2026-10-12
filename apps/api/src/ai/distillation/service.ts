import {
  DistillationArtifactSchema, DistillationBaseSchema, DistillationEvaluationSchema, DistillationRecordSchema, DistillationPromotionPolicySchema, type DistillationPromotionPolicy,
  DistillationScopeSchema, DistillationStartSchema, EngineeringDatasetExampleSchema, type DistillationArtifact, type DistillationBase,
  type DistillationEvaluation, type DistillationPrepared, type DistillationRecord, type DistillationScope,
} from "@alexa-control/shared";
import { datasetHash, containsDatasetSecret } from "../../engineering-dataset/service.js";
import type { GovernanceAuditWriter } from "../../governance/approval-service.js";
import type { DistillationStore } from "./store.js";
import { prepareDataset } from "./preparation.js";
import { decidePromotion, evaluationMetrics, defaultPromotionPolicy } from "./evaluation.js";

export interface AcceptedDatasetSource {
  exportVerified(scope: DistillationScope, version: string): Promise<{ contentHash: string; exampleCount: number; jsonl: string }>;
}
/** Server-owned reviewed dependencies. There is no public provider registration or result submission API. */
export interface ReviewedTrainer {
  readonly evidence: "REAL" | "SYNTHETIC";
  train(input: { run: DistillationRecord; prepared: DistillationPrepared; signal: AbortSignal }): Promise<DistillationArtifact>;
}
export interface ReviewedEvaluator {
  evaluate(input: { run: DistillationRecord; prepared: DistillationPrepared; signal: AbortSignal }): Promise<DistillationEvaluation>;
}
export interface ReviewedVersionRuntime {
  matches(run: DistillationRecord): Promise<boolean>;
  select(run: DistillationRecord): Promise<void>;
  disable(run: DistillationRecord): Promise<void>;
}
export type DistillationContext = DistillationScope & { requestId: string; ipAddress: string };
const MAX_RUN_MS = 60 * 60 * 1000;
export class AthenaDistillationService {
  private readonly bases = new Map<string, DistillationBase>();
  private scope(input: DistillationScope) { return DistillationScopeSchema.parse({ ownerId: input.ownerId, companyId: input.companyId }); }
  constructor(readonly store: DistillationStore, private readonly source: AcceptedDatasetSource,
    private readonly audit: GovernanceAuditWriter, private readonly stopped: () => Promise<boolean>,
    bases: readonly DistillationBase[] = [], private readonly trainer?: ReviewedTrainer,
    private readonly evaluator?: ReviewedEvaluator, private readonly runtime?: ReviewedVersionRuntime,
    private readonly fixtureMode = false, private readonly now: () => Date = () => new Date(), private readonly policy: DistillationPromotionPolicy = defaultPromotionPolicy) {
    DistillationPromotionPolicySchema.parse(policy);
    if (policy.minimumPassRate < defaultPromotionPolicy.minimumPassRate || policy.maximumDurationRatio > defaultPromotionPolicy.maximumDurationRatio) throw new Error("PROMOTION_POLICY_CANNOT_WEAKEN");
    if (fixtureMode && store.durable) throw new Error("FIXTURES_CANNOT_USE_PRODUCTION_STORE");
    for (const raw of bases) { const base = DistillationBaseSchema.parse(raw); if (this.bases.has(base.id)) throw new Error("DUPLICATE_TRAINING_BASE"); this.bases.set(base.id, base); }
  }
  private async guard(scope: DistillationScope) {
    DistillationScopeSchema.parse(scope);
    if ((!this.store.durable && !this.fixtureMode) || await this.stopped()) throw new Error("DISTILLATION_AUTHORITY_UNAVAILABLE");
  }
  list(scope: DistillationScope) { return this.store.list(this.scope(scope)); }
  async get(scope: DistillationScope, id: string) {
    const record = await this.store.get(this.scope(scope), id);
    if (!record) throw new Error("DISTILLATION_RECORD_UNAVAILABLE");
    return DistillationRecordSchema.parse(record);
  }
  private async event(context: DistillationContext, record: DistillationRecord, action: string) {
    await this.audit({ ...context, eventType: "ENGINEERING_DATASET_UPDATED", outcome: "SUCCESS",
      reason: `AthenaCoder distillation ${action}.`, metadata: { runId: record.id, state: record.state, version: record.version,
        datasetDigest: record.datasetDigest, artifactDigest: record.artifact?.adapterDigest ?? null, activation: record.activation } });
  }
  private async update(context: DistillationContext, record: DistillationRecord, fields: Partial<DistillationRecord>, action: string) {
    const next = DistillationRecordSchema.parse({ ...record, ...fields, version: record.version + 1, updatedAt: this.now().toISOString() });
    await this.store.replace(next, record.version);
    await this.event(context, next, action);
    return next;
  }
  async prepare(context: DistillationContext, raw: unknown) {
    const scope = DistillationScopeSchema.parse({ ownerId: context.ownerId, companyId: context.companyId });
    await this.guard(scope);
    const request = DistillationStartSchema.parse(raw), base = this.bases.get(request.baseModelId);
    if (!base) throw new Error("TRAINING_BASE_UNREVIEWED");
    const requestDigest = datasetHash({ ...scope, request, base });
    const exported = await this.source.exportVerified(scope, request.datasetVersion);
    const prepared = prepareDataset(scope, request.datasetVersion, exported, request.config.seed);
    return this.store.atomic(scope, async () => {
      await this.guard(scope);
      const at = this.now().toISOString();
      const record = await this.store.create(DistillationRecordSchema.parse({ ...scope, id: crypto.randomUUID(), version: 0,
        request, requestDigest, base, state: prepared ? "PREPARED" : "PENDING_REAL_DATASET", datasetDigest: exported.contentHash,
        manifestDigest: prepared?.manifestDigest ?? null, sampleCounts: { train: prepared?.train.length ?? 0, validation: prepared?.validation.length ?? 0, evaluation: prepared?.evaluation.length ?? 0 },
        artifact: null, evaluation: null, promotion: "NOT_EVALUATED", promotionReasons: [], activation: "INACTIVE", rollout: "NONE", rollbackTarget: null, createdAt: at, updatedAt: at, trainingStartedAt: null, trainedAt: null }));
      if (record.requestDigest !== requestDigest || record.datasetDigest !== exported.contentHash || record.manifestDigest !== (prepared?.manifestDigest ?? null)) throw new Error("DISTILLATION_IDEMPOTENCY_CONFLICT");
      await this.event(context, record, "prepared");
      return record;
    });
  }
  private async prepared(run: DistillationRecord) {
    const scope = this.scope(run);
    const source = await this.source.exportVerified(scope, run.request.datasetVersion);
    const prepared = prepareDataset(scope, run.request.datasetVersion, source, run.request.config.seed);
    if (!prepared || prepared.manifestDigest !== run.manifestDigest || prepared.datasetDigest !== run.datasetDigest || this.bases.get(run.base.id)?.digest !== run.base.digest) throw new Error("TRAINING_PROVENANCE_CHANGED");
    return prepared;
  }
  async train(context: DistillationContext, id: string) {
    await this.guard({ ownerId: context.ownerId, companyId: context.companyId });
    const initial = await this.get(context, id);
    if (!["PREPARED", "TRAINER_UNAVAILABLE"].includes(initial.state)) throw new Error("TRAINING_STATE_DENIED");
    const prepared = await this.prepared(initial);
    const run = await this.store.atomic(initial, async () => {
      await this.guard(this.scope(initial));
      const current = await this.get(initial, id);
      if (current.version !== initial.version) throw new Error("DISTILLATION_CONFLICT");
      return this.update(context, current, { state: this.trainer ? "TRAINING" : "TRAINER_UNAVAILABLE", trainingStartedAt: this.trainer ? this.now().toISOString() : null }, "training-claimed");
    });
    if (!this.trainer) return run;
    try {
      const raw = await this.bounded(run, signal => this.trainer!.train({ run, prepared, signal }));
      const artifact = DistillationArtifactSchema.parse(raw);
      if (containsDatasetSecret(artifact) || artifact.baseDigest !== run.base.digest || artifact.manifestDigest !== run.manifestDigest || artifact.evidence !== this.trainer.evidence || (!this.fixtureMode && artifact.evidence !== "REAL")) throw new Error("TRAINING_ARTIFACT_DENIED");
      await this.prepared(run);
      return await this.store.atomic(run, async () => {
        await this.guard(this.scope(run));
        const latest = await this.get(run, id);
        if (latest.state !== "TRAINING" || latest.version !== run.version) throw new Error("TRAINING_CLAIM_CHANGED");
        return this.update(context, latest, { state: "TRAINED", artifact, trainedAt: this.now().toISOString() }, "adapter-registered");
      });
    } catch (error) {
      return this.store.atomic(run, async () => {
        const current = await this.get(run, id);
        if (current.state !== "TRAINING") return current;
        const unknown = error instanceof Error && error.message === "DISTILLATION_INTERRUPTED";
        return this.update(context, current, { state: unknown ? "INDETERMINATE" : "FAILED", promotion: "BLOCKED", promotionReasons: [unknown ? "trainer-outcome-unknown" : "training-failed-or-provenance-revoked"] }, "training-failed");
      });
    }
  }
  private async bounded<T>(run: DistillationRecord, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let rejectStop: (reason: Error) => void = () => undefined;
    const interrupted = new Promise<never>((_, reject) => { rejectStop = reject; });
    const stop = () => { controller.abort(); rejectStop(new Error("DISTILLATION_INTERRUPTED")); };
    const deadline = setTimeout(stop, MAX_RUN_MS);
    let checking = false;
    const interval = setInterval(() => {
      if (checking) return;
      checking = true;
      void Promise.all([this.stopped(), this.get(run, run.id)]).then(([stopped, latest]) => {
        if (stopped || latest.state === "CANCELLED") stop();
      }, stop).finally(() => { checking = false; });
    }, 1000);
    try { return await Promise.race([work(controller.signal), interrupted]); }
    finally { clearTimeout(deadline); clearInterval(interval); controller.abort(); }
  }
  async evaluate(context: DistillationContext, id: string) {
    await this.guard({ ownerId: context.ownerId, companyId: context.companyId });
    const run = await this.get(context, id);
    if (run.state !== "TRAINED" || !run.artifact || run.activation !== "INACTIVE" || !this.evaluator) throw new Error("MODEL_EVALUATOR_UNAVAILABLE");
    const prepared = await this.prepared(run);
    const evaluation = DistillationEvaluationSchema.parse(await this.bounded(run, signal => this.evaluator!.evaluate({ run, prepared, signal })));
    if (evaluation.artifactDigest !== run.artifact.adapterDigest || evaluation.evidence !== run.artifact.evidence || Date.parse(evaluation.evaluatedAt) < Date.parse(run.updatedAt) || Date.parse(evaluation.evaluatedAt) > this.now().getTime() + 5000) throw new Error("MODEL_EVALUATION_MISMATCH");
    await this.prepared(run);
    const current = await this.store.active(run);
    if (current && (!evaluation.currentBaseline || evaluation.currentVersionId !== current.id || evaluation.currentArtifactDigest !== current.artifact?.adapterDigest)) throw new Error("CURRENT_MODEL_BASELINE_REQUIRED");
    if (!current && (evaluation.currentBaseline || evaluation.currentVersionId || evaluation.currentArtifactDigest)) throw new Error("CURRENT_MODEL_BASELINE_MISMATCH");
    const decision = decidePromotion(evaluation, this.policy);
    return this.store.atomic(run, async () => {
      await this.guard({ ownerId: run.ownerId, companyId: run.companyId });
      const latest = await this.get(run, id);
      if (latest.version !== run.version) throw new Error("DISTILLATION_CONFLICT");
      const activeNow = await this.store.active(run);
      if ((activeNow?.id ?? null) !== evaluation.currentVersionId) throw new Error("CURRENT_MODEL_BASELINE_CHANGED");
      return this.update(context, latest, { evaluation, ...decision }, "evaluated");
    });
  }
  async modelAction(context: DistillationContext, id: string, action: "ACTIVATE" | "DEACTIVATE" | "RETIRE" | "ROLLBACK" | "CANCEL") {
    if (action !== "DEACTIVATE" && action !== "CANCEL") await this.guard({ ownerId: context.ownerId, companyId: context.companyId });
    return this.store.atomic(context, async () => {
      const run = await this.get(context, id);
      if (action === "CANCEL") {
        if (["TRAINED", "FAILED", "CANCELLED"].includes(run.state)) throw new Error("TRAINING_STATE_DENIED");
        return this.update(context, run, { state: "CANCELLED" }, "cancelled");
      }
      if (action === "DEACTIVATE" || action === "RETIRE") {
        if (run.activation === "ACTIVE") { if (!this.runtime) throw new Error("MODEL_RUNTIME_UNAVAILABLE"); await this.runtime.disable(run); }
        return this.update(context, run, { activation: action === "RETIRE" ? "RETIRED" : "INACTIVE", rollout: "NONE" }, action.toLowerCase());
      }
      const target = action === "ROLLBACK" && run.rollbackTarget ? await this.get(run, run.rollbackTarget) : run;
      if (action === "ROLLBACK" && (!run.rollbackTarget || run.activation !== "ACTIVE")) throw new Error("ROLLBACK_TARGET_UNAVAILABLE");
      if (!this.store.durable || target.activation === "RETIRED" || target.state !== "TRAINED" || target.artifact?.evidence !== "REAL" || target.evaluation?.evidence !== "REAL" || target.promotion !== "ELIGIBLE" || !this.runtime) throw new Error("MODEL_PROMOTION_DENIED");
      const decision = decidePromotion(target.evaluation, this.policy);
      if (decision.promotion !== "ELIGIBLE" || target.evaluation.artifactDigest !== target.artifact.adapterDigest || !(await this.runtime.matches(target))) throw new Error("MODEL_RUNTIME_IDENTITY_DENIED");
      await this.prepared(target);
      const active = await this.store.active(target);
      if (active?.id === target.id) return active;
      if (action === "ACTIVATE" && (active?.id ?? null) !== target.evaluation.currentVersionId) throw new Error("ACTIVE_MODEL_BASELINE_CHANGED");
      await this.runtime.select(target);
      if (active) await this.update(context, active, { activation: "INACTIVE", rollout: "NONE" }, "deactivated-for-rollout");
      return this.update(context, target, { activation: "ACTIVE", rollout: "OWNER_ACTIVATED", rollbackTarget: active?.id ?? null }, action.toLowerCase());
    });
  }
  async recover(context: DistillationContext, id: string) {
    return this.store.atomic(context, async () => {
      const run = await this.get(context, id);
      if (run.state !== "TRAINING" || !run.trainingStartedAt || this.now().getTime() - Date.parse(run.trainingStartedAt) <= MAX_RUN_MS) throw new Error("TRAINING_RECOVERY_DENIED");
      return this.update(context, run, { state: "INDETERMINATE", promotion: "BLOCKED", promotionReasons: ["trainer-outcome-unknown"] }, "expired-training-not-replayed");
    });
  }
  async compare(scope: DistillationScope) {
    return (await this.list(scope)).map(run => ({ id: run.id, datasetVersion: run.request.datasetVersion, baseDigest: run.base.digest,
      artifactDigest: run.artifact?.adapterDigest ?? null, state: run.state, promotion: run.promotion,
      activation: run.activation, evidence: run.artifact?.evidence ?? null, trainingCostUsd: run.artifact?.computeCostUsd ?? null,
      metrics: run.evaluation ? evaluationMetrics(run.evaluation.cases) : null }));
  }
  /** Identifier-only projection of existing records, never another execution ledger. */
  async lineage(scope: DistillationScope, id: string) {
    const run = await this.get(scope, id);
    const exported = await this.source.exportVerified(this.scope(run), run.request.datasetVersion);
    if (exported.contentHash !== run.datasetDigest) throw new Error("TRAINING_PROVENANCE_CHANGED");
    if (Buffer.byteLength(exported.jsonl) > 16 * 1024 * 1024) throw new Error("TRAINING_EXPORT_QUOTA");
    const examples = exported.jsonl.split("\n").filter(Boolean).map(line => {
      const example = EngineeringDatasetExampleSchema.parse((JSON.parse(line) as { example: unknown }).example);
      return { objectiveId: example.objectiveId, taskId: example.taskId, candidateId: example.candidateId,
        integrationRunId: example.integrationRunId, validationId: example.validationId, reviewIds: example.reviewIds,
        exampleKey: example.key, exampleHash: example.contentHash };
    });
    return { runId: run.id, datasetVersion: run.request.datasetVersion, datasetDigest: run.datasetDigest,
      modelVersionId: run.id, artifactDigest: run.artifact?.adapterDigest ?? null, activation: run.activation,
      evaluationSuite: run.evaluation?.suiteVersion ?? null,
      evaluationTaskIds: run.evaluation?.cases.map(v => v.taskId) ?? [], examples };
  }
  async authorizeVersion(run: DistillationRecord, requireActive: boolean) {
    try {
      await this.guard(this.scope(run));
      if (run.state !== "TRAINED" || run.artifact?.evidence !== "REAL" || run.evaluation?.evidence !== "REAL" || run.promotion !== "ELIGIBLE" || run.activation === "RETIRED" || (requireActive && run.activation !== "ACTIVE")) return false;
      await this.prepared(run);
      return run.evaluation.artifactDigest === run.artifact.adapterDigest && decidePromotion(run.evaluation, this.policy).promotion === "ELIGIBLE";
    } catch { return false; }
  }
}
