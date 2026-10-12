import { z } from "zod";
import { AthenaCoderRuntimeMetadataSchema, DistillationScopeSchema, type DistillationEvaluation } from "@alexa-control/shared";
import type { AthenaCoderEngineeringBenchmarkHarness } from "../../engineering-dataset/benchmark.js";
import { athenaCoderEngineeringCases } from "../../engineering-dataset/benchmark.js";
import type { AIRuntimeService } from "../runtime-service.js";
import type { ReviewedEvaluator } from "./service.js";
import { engineeringEvaluationCategories } from "./evaluation.js";

const CaseBinding = z.object({ caseId: z.enum(athenaCoderEngineeringCases.map(v => v.id)),
  category: z.enum(engineeringEvaluationCategories), candidateDeliveryId: z.string().uuid(),
  lunaDeliveryId: z.string().uuid(), currentDeliveryId: z.string().uuid().nullable() }).strict();
export const EngineeringEvaluationBindingSchema = z.object({ ...DistillationScopeSchema.shape,
  runId: z.string().uuid(), adapterDigest: z.string().regex(/^[a-f0-9]{64}$/), candidateModelId: z.string().min(1).max(160),
  lunaModelId: z.string().min(1).max(160), currentModelId: z.string().min(1).max(160).nullable(),
  currentVersionId: z.string().uuid().nullable(), currentArtifactDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  cases: z.array(CaseBinding).min(8).max(200), evidence: z.enum(["REAL", "SYNTHETIC"]),
}).strict().superRefine((binding, context) => {
  const deliveries = binding.cases.flatMap(v => [v.candidateDeliveryId, v.lunaDeliveryId, ...(v.currentDeliveryId ? [v.currentDeliveryId] : [])]);
  if (new Set(deliveries).size !== deliveries.length || new Set(binding.cases.map(v => v.caseId)).size !== binding.cases.length)
    context.addIssue({ code: "custom", message: "Benchmark deliveries and workloads must be independent." });
  for (const item of binding.cases) {
    const scenario = athenaCoderEngineeringCases.find(v => v.id === item.caseId)!;
    if (item.category !== (scenario.category === "ESCALATION" ? "SECURITY" : scenario.category)) context.addIssue({ code: "custom", message: "Registered workload category mismatch." });
    if (Boolean(item.currentDeliveryId) !== Boolean(binding.currentVersionId)) context.addIssue({ code: "custom", message: "Current baseline coverage mismatch." });
  }
  if (Boolean(binding.currentVersionId) !== Boolean(binding.currentModelId) || Boolean(binding.currentVersionId) !== Boolean(binding.currentArtifactDigest)) context.addIssue({ code: "custom", message: "Current baseline identity incomplete." });
});
/** Projects reviewed canonical benchmark deliveries, never client/model-reported scores.
 * Workload dispatch remains in the existing benchmark/Engineering paths. */
export class EngineeringBenchmarkEvaluator implements ReviewedEvaluator {
  constructor(private readonly harness: AthenaCoderEngineeringBenchmarkHarness, private readonly registry: AIRuntimeService,
    private readonly resolve: (runId: string) => Promise<unknown>, private readonly now: () => Date = () => new Date()) {}
  async evaluate({ run, signal }: Parameters<ReviewedEvaluator["evaluate"]>[0]): Promise<DistillationEvaluation> {
    const binding = EngineeringEvaluationBindingSchema.parse(await this.resolve(run.id));
    if (binding.ownerId !== run.ownerId || binding.companyId !== run.companyId || binding.runId !== run.id || binding.adapterDigest !== run.artifact?.adapterDigest) throw new Error("BENCHMARK_BINDING_MISMATCH");
    const model = this.registry.models.get("athena_coder", binding.candidateModelId);
    const metadata = AthenaCoderRuntimeMetadataSchema.parse(model.metadata);
    if (metadata.distillation?.runId !== run.id || metadata.distillation.adapterDigest !== binding.adapterDigest || metadata.distillation.ownerId !== run.ownerId || metadata.distillation.companyId !== run.companyId || metadata.distillation.baseDigest !== run.base.digest) throw new Error("BENCHMARK_MODEL_ARTIFACT_MISMATCH");
    const measure = async (id: string, item: z.infer<typeof CaseBinding>, expectedModel: string, candidate: boolean) => {
      if (signal.aborted) throw new Error("BENCHMARK_CANCELLED");
      const observed = await this.harness.observe(run.ownerId, run.companyId, id);
      const center = await this.harness.delivery.controlCenter(run.ownerId, run.companyId, id);
      const view = await this.harness.delivery.manager.view(run.ownerId, run.companyId, center.delivery.objectiveId);
      const scenario = athenaCoderEngineeringCases.find(v => v.id === item.caseId)!;
      if (item.category !== (scenario.category === "ESCALATION" ? "SECURITY" : scenario.category)) throw new Error("BENCHMARK_CATEGORY_MISMATCH");
      if (center.delivery.sourceRequest !== scenario.request || observed.run.completedAt === null || center.delivery.repositoryId !== view.objective.repositoryId) throw new Error("BENCHMARK_WORKLOAD_OR_COMPLETION_MISMATCH");
      const attempts = view.results.flatMap(result => result.modelAttempts);
      const finalModels = view.results.flatMap(result => result.modelName ? [result.modelName] : []);
      const attempted = attempts.some(v => v.modelId === expectedModel);
      if (candidate && item.category !== "SECURITY" && (!run.trainedAt || Date.parse(center.delivery.createdAt) < Date.parse(run.trainedAt) ||
        !attempts.some(v => v.modelId === expectedModel && v.athenaCoder?.artifactDigest === metadata.artifactDigest && v.athenaCoder.distillationRunId === run.id && v.athenaCoder.modelVersion === metadata.version))) throw new Error("BENCHMARK_CANDIDATE_ARTIFACT_NOT_OBSERVED");
      if (item.category !== "SECURITY" && !attempted && !finalModels.includes(expectedModel)) throw new Error("BENCHMARK_EXPECTED_MODEL_NOT_OBSERVED");
      const securityPass = item.category !== "SECURITY" ||
        (["HIGH", "CRITICAL"].includes(view.objective.riskLevel) && view.results.length > 0 && !attempts.some(v => v.providerId === "athena_coder") && !view.results.some(v => v.modelProvider === "athena_coder" || v.modelTier !== "SOL" || v.filesChanged.length > 0) && view.tasks.every(v => v.readOnly));
      const latencies = attempts.filter(v => v.modelId === expectedModel).flatMap(v => v.latencyMs === undefined ? [] : [v.latencyMs]);
      return { caseId: item.caseId, category: item.category, taskId: observed.run.taskId,
        validationPass: item.category === "SECURITY" ? securityPass && view.results.every(v => v.validationStatus === "PASS") : observed.run.validationPass === true,
        reviewPass: item.category === "SECURITY" ? securityPass && view.results.every(v => v.reviewStatus === "PASS") : observed.run.reviewPass === true,
        completed: item.category === "SECURITY" ? securityPass && ["DONE", "DONE_WITH_WARNINGS"].includes(center.delivery.status) : observed.run.finalSuccess === true, securityPass,
        durationMs: Date.parse(observed.run.completedAt) - Date.parse(observed.run.startedAt),
        modelDurationMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) : null,
        retries: observed.run.retries ?? 0, escalated: candidate && item.category !== "SECURITY" && (!finalModels.includes(expectedModel) || attempts.some((v, i) => v.modelId === expectedModel && attempts.slice(i + 1).some(next => next.modelId !== expectedModel))),
        inputTokens: observed.run.inputTokens, outputTokens: observed.run.outputTokens,
        paidCostUsd: observed.run.apiCostUsd === null ? null : Number(observed.run.apiCostUsd),
        computeCostUsd: null, ownerInterventions: observed.run.ownerInterventions };
    };
    const cases: DistillationEvaluation["cases"] = [], luna: DistillationEvaluation["cases"] = [], current: DistillationEvaluation["cases"] = [];
    for (const item of binding.cases) {
      cases.push(await measure(item.candidateDeliveryId, item, binding.candidateModelId, true));
      luna.push(await measure(item.lunaDeliveryId, item, binding.lunaModelId, false));
      if (binding.currentModelId && item.currentDeliveryId) current.push(await measure(item.currentDeliveryId, item, binding.currentModelId, false));
    }
    return { suiteVersion: "PHASE28_ENGINEERING_V1", artifactDigest: binding.adapterDigest, evidence: binding.evidence, evaluatedAt: this.now().toISOString(),
      cases, lunaBaseline: luna, currentBaseline: current.length ? current : null, currentVersionId: binding.currentVersionId, currentArtifactDigest: binding.currentArtifactDigest };
  }
}
