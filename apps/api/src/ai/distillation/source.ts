import { EngineeringDatasetExampleSchema } from "@alexa-control/shared";
import { z } from "zod";
import type { EngineeringDatasetService } from "../../engineering-dataset/service.js";
import type { AcceptedDatasetSource } from "./service.js";

/** Reuses accepted dataset authority, then rechecks canonical merge/review/task state. */
export function verifiedDatasetSource(dataset: EngineeringDatasetService): AcceptedDatasetSource {
  return { exportVerified: async (scope, version) => {
    const exported = await dataset.exportJsonl(scope.ownerId, scope.companyId, version);
    const sources = new Map<string, Awaited<ReturnType<EngineeringDatasetService["collectAccepted"]>>>();
    for (const line of exported.jsonl.split("\n").filter(Boolean)) {
      const { example } = z.object({ example: EngineeringDatasetExampleSchema }).parse(JSON.parse(line));
      let current = sources.get(example.integrationRunId);
      if (!current) {
        current = await dataset.collectAccepted(scope.ownerId, scope.companyId, example.integrationRunId);
        sources.set(example.integrationRunId, current);
      }
      if (!current.some(v => v.key === example.key && v.contentHash === example.contentHash)) throw new Error("TRAINING_CANONICAL_SOURCE_REVOKED");
    }
    const final = await dataset.exportJsonl(scope.ownerId, scope.companyId, version);
    if (final.contentHash !== exported.contentHash || final.jsonl !== exported.jsonl) throw new Error("TRAINING_SOURCE_CHANGED_DURING_PREPARATION");
    return final;
  } };
}
