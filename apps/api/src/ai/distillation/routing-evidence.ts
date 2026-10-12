import { type DistillationScope } from "@alexa-control/shared";
import type { EngineeringOrchestrationStore } from "../../engineering-orchestration/store.js";
import type { EngineeringRuntimeStore } from "../../engineering-runtime/store.js";

/** Read-only canonical outcomes. Evidence cannot override deterministic risk policy. */
export class RoutingEvidenceService {
  constructor(private readonly orchestration: EngineeringOrchestrationStore, private readonly runtime: EngineeringRuntimeStore) {}
  async read(scope: DistillationScope) {
    const objectives = await this.orchestration.listObjectives(scope.ownerId, scope.companyId, 100);
    const groups = new Map<string, { model: string; provider: string; category: string; repositoryClass: string; samples: number; passes: number; validationFailures: number; reviewFailures: number; retries: number; escalations: number; attemptSamples: number; durations: number[]; modelLatencies: number[] }>();
    for (const objective of objectives) {
      const [tasks, results, repository] = await Promise.all([
        this.orchestration.listTasks(scope.ownerId, scope.companyId, objective.id),
        this.orchestration.listResults(scope.ownerId, scope.companyId, objective.id),
        this.runtime.findRepository(scope.ownerId, scope.companyId, objective.repositoryId),
      ]);
      if (!repository || repository.status !== "ACTIVE") continue;
      const repositoryClass = repository.metadata.languages.includes("Kotlin") ? "ANDROID" : repository.metadata.frameworks.some(v => /react|next/i.test(v)) ? "WEB" : "OTHER";
      for (const result of results) {
        const task = tasks.find(v => v.id === result.taskId && v.objectiveId === objective.id);
        if (!task || !result.modelName || !result.modelProvider) continue;
        const attributions = new Map(result.modelAttempts.map(v => [JSON.stringify([v.providerId, v.modelId]), { provider: v.providerId, model: v.modelId }]));
        attributions.set(JSON.stringify([result.modelProvider, result.modelName]), { provider: result.modelProvider, model: result.modelName });
        for (const attribution of attributions.values()) {
          const key = JSON.stringify([attribution.provider, attribution.model, task.taskType, repositoryClass]);
          const group = groups.get(key) ?? { ...attribution, category: task.taskType, repositoryClass, samples: 0, passes: 0, validationFailures: 0, reviewFailures: 0, retries: 0, escalations: 0, attemptSamples: 0, durations: [], modelLatencies: [] };
          const finalModel = result.modelProvider === attribution.provider && result.modelName === attribution.model;
          const attempts = result.modelAttempts.filter(v => v.providerId === attribution.provider && v.modelId === attribution.model);
          group.samples++;
          if (finalModel && result.status === "SUCCEEDED" && result.validationStatus === "PASS" && result.reviewStatus === "PASS") group.passes++;
          if (result.validationStatus === "FAIL") group.validationFailures++;
          if (result.reviewStatus === "FAIL") group.reviewFailures++;
          group.retries += Math.max(0, task.attempt - 1);
          group.durations.push(result.durationMs);
          if (attempts.length) {
            group.attemptSamples++;
            if (!finalModel) group.escalations++;
            const measured = attempts.flatMap(v => v.latencyMs === undefined ? [] : [v.latencyMs]);
            if (measured.length === attempts.length) group.modelLatencies.push(measured.reduce((a, b) => a + b, 0));
          }
          groups.set(key, group);
        }
      }
    }
    return { authority: "DETERMINISTIC_SERVER_POLICY" as const, learnedRouting: "SHADOW_NOT_ENABLED" as const, window: "LATEST_100_OBJECTIVES" as const,
      cohorts: [...groups.values()].map(({ durations, modelLatencies, ...group }) => {
        const p = group.passes / group.samples;
        const lower = (p + 1.9208 / group.samples - 1.96 * Math.sqrt(p * (1 - p) / group.samples + 0.9604 / (group.samples * group.samples))) / (1 + 3.8416 / group.samples);
        durations.sort((a, b) => a - b);
        return { ...group, successRate: p, confidenceLowerBound: lower,
          evidenceStrong: group.samples >= 30 && lower >= 0.8,
          validationFailureRate: group.validationFailures / group.samples, reviewFailureRate: group.reviewFailures / group.samples,
          p95EndToEndDurationMs: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? null,
          observedEscalationProbability: group.attemptSamples ? group.escalations / group.attemptSamples : null,
          escalationUnknownSamples: group.samples - group.attemptSamples,
          observedModelLatencyMs: modelLatencies.length ? modelLatencies.reduce((a, b) => a + b, 0) / modelLatencies.length : null,
          modelLatencyUnknownSamples: group.samples - modelLatencies.length,
          // Existing Engineering cost estimates do not establish provider billing or compute expense.
          paidCostUsd: null, computeCostUsd: null, costUnknownSamples: group.samples,
          automaticallyEligibleForLocalRouting: false as const };
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  }
}
