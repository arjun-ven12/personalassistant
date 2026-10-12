/** Explicit synthetic test material. Never imported by the production composition root. */
import { EngineeringDatasetExampleSchema, EngineeringExperienceSchema, type DistillationScope, type DistillationEvaluation } from "@alexa-control/shared";
import { datasetHash } from "../../engineering-dataset/service.js";
import { engineeringEvaluationCategories } from "./evaluation.js";
export const fixtureScope = { ownerId: "11111111-1111-4111-8111-111111111111", companyId: "22222222-2222-4222-8222-222222222222" };
export const fixtureBase = { id: "qwen-fixture", digest: "a".repeat(64), family: "QWEN2_CAUSAL_LM" as const, licenseReviewed: true as const, trainingReviewed: true as const };
export const fixtureRequest = { datasetVersion: "synthetic-v1", baseModelId: fixtureBase.id, idempotencyKey: "fixture-run-1", config: { method: "LORA" as const, seed: 42, rank: 8, alpha: 16, epochs: 1, learningRate: 0.0001, maxSequenceTokens: 512 } };
export const fixtureTime = "2026-10-05T01:00:00.000Z";
export function fixtureExport(scope: DistillationScope = fixtureScope, count = 5) {
  scope = { ownerId: scope.ownerId, companyId: scope.companyId };
  const lines = Array.from({ length: count }, (_, i) => {
    const taskId = crypto.randomUUID(), objectiveId = crypto.randomUUID(), repositoryId = crypto.randomUUID(), candidateId = crypto.randomUUID();
    const patch = `diff --git a/src/card.tsx b/src/card.tsx\n+<Card value={${i}} />\n`;
    const experience = EngineeringExperienceSchema.parse({ ...scope, kind: "EXPERIENCE", key: datasetHash([taskId]), objectiveId, taskId, repositoryId, workspaceId: crypto.randomUUID(), attempt: 1, generation: 1,
      context: { objectiveId, taskId, repositorySummary: "Synthetic React fixture", relevantFiles: ["src/card.tsx"], dependencyArtifacts: [], acceptanceCriteria: ["Card renders"], constraints: [], protectedPaths: [".env"], priorFailureSummaries: [], memoryRefs: [], memorySummaries: [], maxTokens: 4000 },
      rounds: [{ requestId: crypto.randomUUID(), context: `Synthetic bounded user input ${i}`, provider: "fixture", model: "synthetic-model", outcome: "SUCCESS" }], toolActions: [], inspectedFiles: ["src/card.tsx"], failures: [], outcome: "SUCCEEDED", integrity: "CLEAN", startedAt: fixtureTime, completedAt: fixtureTime });
    const payload = { ...scope, kind: "EXAMPLE" as const, key: datasetHash([taskId, patch]), schemaVersion: "1" as const, objectiveId, taskId, repositoryId, candidateId, integrationRunId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), baseCommit: "b".repeat(40), headCommit: "c".repeat(40), taskCategory: "UI" as const, risk: "LOW" as const, complexity: "LOW" as const,
      instruction: `Synthetic fixture card ${i}`, repositoryMetadata: { languages: ["TypeScript"], frameworks: ["React"], packageManagers: ["pnpm"], importantFiles: [], contractBindings: [] }, experienceKeys: [experience.key], experienceHashes: [datasetHash(experience)], acceptedPatchHash: datasetHash(patch), acceptedPatchKey: datasetHash([patch]), validationId: crypto.randomUUID(), reviewIds: [crypto.randomUUID()], repairTaskIds: [], provider: "fixture", model: "synthetic-model", inputTokens: null, outputTokens: null, paidModelCostUsd: null, workspaceCostUsd: null, durationMs: 1, accepted: true as const, outcome: "SUCCEEDED" as const, createdAt: fixtureTime };
    const example = EngineeringDatasetExampleSchema.parse({ ...payload, contentHash: datasetHash(payload) });
    return { schemaVersion: "1", instruction: example.instruction, example, context: [experience], expectedPatch: patch };
  });
  return { contentHash: datasetHash(lines.map(v => ({ key: v.example.key, hash: v.example.contentHash }))), exampleCount: count, jsonl: lines.map(v => JSON.stringify(v)).join("\n") };
}
export function fixtureEvaluation(artifactDigest: string, evidence: "REAL" | "SYNTHETIC" = "SYNTHETIC"): DistillationEvaluation {
  const cases = engineeringEvaluationCategories.map(category => ({ caseId: `fixture-${category.toLowerCase().replaceAll("_", "-")}`, category,
    taskId: crypto.randomUUID(), validationPass: true, reviewPass: true, completed: true, securityPass: true,
    durationMs: 100, modelDurationMs: 10, retries: 0, escalated: false, inputTokens: null, outputTokens: null, paidCostUsd: null, computeCostUsd: null, ownerInterventions: null }));
  return { suiteVersion: "PHASE28_ENGINEERING_V1", artifactDigest, evidence, evaluatedAt: fixtureTime, cases, lunaBaseline: cases.map(v => ({ ...v, taskId: crypto.randomUUID() })), currentBaseline: null, currentVersionId: null, currentArtifactDigest: null };
}
