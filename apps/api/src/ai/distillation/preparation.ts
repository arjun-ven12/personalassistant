import { DistillationPreparedSchema, EngineeringDatasetExampleSchema, EngineeringExperienceSchema, type DistillationPrepared, type DistillationSample, type DistillationScope } from "@alexa-control/shared";
import { z } from "zod";
import { containsDatasetSecret, datasetHash } from "../../engineering-dataset/service.js";

const exportedLine = z.object({ schemaVersion: z.literal("1"), instruction: z.string().min(1).max(16000),
  example: EngineeringDatasetExampleSchema, context: z.array(EngineeringExperienceSchema).min(1).max(30), expectedPatch: z.string().min(1).max(131072),
}).strict();
/** Accepted final patches only; failed reasoning/attempt outputs are never targets. */
export function prepareDataset(scope: DistillationScope, version: string, source: { contentHash: string; exampleCount: number; jsonl: string }, seed: number): DistillationPrepared | null {
  if (Buffer.byteLength(source.jsonl) > 16 * 1024 * 1024) throw new Error("TRAINING_DATA_QUOTA");
  const lines = source.jsonl.split("\n").filter(Boolean);
  if (lines.length !== source.exampleCount || lines.length > 10000) throw new Error("TRAINING_COUNT_MISMATCH");
  if (!lines.length) return null;
  const unique = new Map<string, DistillationSample>();
  for (const line of lines) {
    const value = exportedLine.parse(JSON.parse(line));
    const example = value.example;
    if (containsDatasetSecret(value) || example.ownerId !== scope.ownerId || example.companyId !== scope.companyId || value.instruction !== example.instruction ||
      value.context.length !== example.experienceKeys.length || value.context.some((v, i) => v.ownerId !== scope.ownerId || v.companyId !== scope.companyId || v.integrity !== "CLEAN" || v.taskId !== example.taskId || v.key !== example.experienceKeys[i] || datasetHash(v) !== example.experienceHashes[i])) throw new Error("TRAINING_SOURCE_DENIED");
    const last = value.context.at(-1)!;
    if (last.outcome !== "SUCCEEDED" || !last.context) throw new Error("TRAINING_FINAL_CONTEXT_REQUIRED");
    // Only the input to the accepted final round: no tool observations or model/private reasoning.
    const context = last.rounds.at(-1)?.context;
    if (!context || containsDatasetSecret(context)) throw new Error("TRAINING_CONTEXT_REQUIRED");
    const contentHash = datasetHash([example.instruction, context, value.expectedPatch]);
    if (unique.has(contentHash)) continue;
    unique.set(contentHash, { key: example.key, objectiveId: example.objectiveId, candidateId: example.candidateId,
      repositoryId: example.repositoryId, taskId: example.taskId, category: example.taskCategory,
      instruction: example.instruction, context, response: value.expectedPatch, contentHash });
  }
  // Related tasks/candidates from one objective cannot straddle held-out splits.
  const groups = new Map<string, DistillationSample[]>();
  for (const sample of unique.values()) {
    const key = sample.objectiveId;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const ordered = [...groups].sort(([a], [b]) => datasetHash([seed, a]).localeCompare(datasetHash([seed, b])));
  if (ordered.length < 3) throw new Error("TRAINING_INDEPENDENT_GROUPS_REQUIRED");
  const heldOut = Math.max(1, Math.floor(ordered.length * 0.1));
  const flatten = (entries: typeof ordered) => entries.flatMap(([, samples]) => samples.sort((a, b) => a.key.localeCompare(b.key)));
  const splits = { train: flatten(ordered.slice(heldOut * 2)), validation: flatten(ordered.slice(heldOut, heldOut * 2)), evaluation: flatten(ordered.slice(0, heldOut)) };
  const manifest = { ...scope, datasetVersion: version, datasetDigest: source.contentHash, formatVersion: "ATHENA_PATCH_V1" as const,
    splits: Object.fromEntries(Object.entries(splits).map(([key, samples]) => [key, samples.map(v => ({ key: v.key, contentHash: v.contentHash }))])) };
  return DistillationPreparedSchema.parse({ ...scope, datasetVersion: version, datasetDigest: source.contentHash, formatVersion: "ATHENA_PATCH_V1", manifestDigest: datasetHash(manifest), ...splits });
}
