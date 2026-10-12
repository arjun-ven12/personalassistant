import { AthenaCoderRuntimeMetadataSchema, type DistillationRecord } from "@alexa-control/shared";
import type { AIRuntimeService } from "../runtime-service.js";
import type { AthenaCoderControlService } from "../athena-coder/control.js";
import type { ReviewedVersionRuntime } from "./service.js";
import { ATHENA_CODER_PROVIDER_ID } from "../providers/athena-coder.js";

/** Selection changes existing durable control records only, inside the caller's unit of work. */
export class ExistingAthenaCoderVersionRuntime implements ReviewedVersionRuntime {
  constructor(private readonly registry: AIRuntimeService, private readonly control: AthenaCoderControlService) {}
  private model(run: DistillationRecord) {
    const candidates = this.registry.models.list().filter(model => {
      const metadata = AthenaCoderRuntimeMetadataSchema.safeParse(model.metadata);
      const binding = metadata.success ? metadata.data.distillation : undefined;
      return model.providerId === ATHENA_CODER_PROVIDER_ID && model.enabled && metadata.success && metadata.data.reviewed &&
        metadata.data.availability === "AVAILABLE" && metadata.data.benchmarkStatus === "MEASURED" &&
        binding?.runId === run.id && binding.ownerId === run.ownerId && binding.companyId === run.companyId &&
        binding.baseDigest === run.base.digest && binding.adapterDigest === run.artifact?.adapterDigest &&
        binding.inferenceDigest === metadata.data.artifactDigest;
    });
    if (candidates.length !== 1) throw new Error("MODEL_RUNTIME_BINDING_UNAVAILABLE");
    return candidates[0]!;
  }
  matches(run: DistillationRecord) {
    try { this.model(run); return Promise.resolve(true); } catch { return Promise.resolve(false); }
  }
  async select(run: DistillationRecord) {
    await this.control.selectEvaluatedVersion(run.ownerId, this.model(run).modelId);
  }
  async disable(run: DistillationRecord) {
    // Owner-wide revocation must remain available when a model is offline,
    // unreviewed, removed or inconsistently selected. Never require health to stop it.
    await this.control.mutate(run.ownerId, { action: "DISABLE" });
  }
}
