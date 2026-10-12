import { z } from "zod";
import {
  AthenaCoderControlMutationSchema,
  AthenaCoderControlStateSchema,
  AthenaCoderEligibilitySchema,
  AthenaCoderRuntimeMetadataSchema,
  type AthenaCoderControlMutation,
  type AthenaCoderControlState,
  type AthenaCoderEligibility,
} from "@alexa-control/shared";
import type { AIRuntimeService } from "../runtime-service.js";
import {
  AthenaCoderProvider,
  ATHENA_CODER_PROVIDER_ID,
} from "../providers/athena-coder.js";

const ownerSchema = z.string().uuid();
const trustedTaskSchema = AthenaCoderEligibilitySchema.pick({
  size: true,
  category: true,
  risk: true,
  securitySensitive: true,
  authenticationRelated: true,
  tenantIsolationRelated: true,
  approvalRelated: true,
  migrationRelated: true,
}).strict();
export type TrustedAthenaCoderTask = z.infer<typeof trustedTaskSchema>;

/** Supply a durable, owner-scoped implementation before activation in production. */
export interface AthenaCoderControlStore {
  get(ownerId: string): Promise<AthenaCoderControlState | undefined>;
  put(state: AthenaCoderControlState): Promise<void>;
}

export class AthenaCoderControlError extends Error {
  constructor(
    readonly code: "STORE_UNAVAILABLE" | "MODEL_UNREVIEWED" | "RUNTIME_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "AthenaCoderControlError";
  }
}

/** The model catalogue and measurements come from the server, never a mutation body. */
export class AthenaCoderControlService {
  private versionAuthority: ((ownerId: string, modelId: string, requireActive: boolean) => Promise<boolean>) | undefined;
  /** Composition-root hook; never exposed by routes or model messages. */
  setVersionAuthority(authority: (ownerId: string, modelId: string, requireActive: boolean) => Promise<boolean>) { this.versionAuthority = authority; }
  async selectEvaluatedVersion(ownerId: string, modelId: string) {
    if (!this.versionAuthority || !(await this.versionAuthority(ownerId, modelId, false))) throw new AthenaCoderControlError("MODEL_UNREVIEWED", "Evaluated trained version authority required.");
    await this.mutateInternal(ownerId, { action: "SELECT_VERSION", modelId }, true);
    await this.mutateInternal(ownerId, { action: "SET_CATEGORIES", categories: ["UI", "TESTS", "DOCS"] }, true);
    return this.mutateInternal(ownerId, { action: "ENABLE" }, true);
  }
  private readonly categoryFailures = new Map<string, { failures: number; skipUntil: number }>();
  /** Internal observable outcomes only; never accepts client-reported quality. */
  recordTaskOutcome(ownerId: string, category: TrustedAthenaCoderTask["category"], outcome: {attempted: boolean; succeeded: boolean}) {
    const owner = ownerSchema.parse(ownerId);
    if (!outcome.attempted) return;
    const key = `${owner}:${category}`;
    if (outcome.succeeded) { this.categoryFailures.delete(key); return; }
    const previous = this.categoryFailures.get(key);
    const failures = (previous?.failures ?? 0) + 1;
    if (this.categoryFailures.size >= 1000 && !previous) this.categoryFailures.delete(this.categoryFailures.keys().next().value!);
    this.categoryFailures.set(key, {failures, skipUntil: failures >= 2 ? Date.now() + 60_000 : 0});
  }
  categoryAvailable(ownerId: string, category: TrustedAthenaCoderTask["category"]) {
    const key = `${ownerSchema.parse(ownerId)}:${category}`;
    const state = this.categoryFailures.get(key);
    if (state && state.skipUntil > Date.now()) return false;
    if (state && state.skipUntil !== 0) this.categoryFailures.delete(key);
    return true;
  }
  constructor(
    private readonly runtime: AIRuntimeService,
    private readonly store?: AthenaCoderControlStore,
  ) {}

  async get(ownerId: string): Promise<AthenaCoderControlState> {
    const owner = ownerSchema.parse(ownerId);
    if (!this.store) return this.disabled(owner);
    const record = await this.store.get(owner);
    if (!record) return this.disabled(owner);
    const parsed = AthenaCoderControlStateSchema.parse(record);
    if (parsed.ownerId !== owner)
      throw new AthenaCoderControlError(
        "STORE_UNAVAILABLE",
        "AthenaCoder owner scope is inconsistent.",
      );
    return parsed;
  }

  async mutate(
    ownerId: string,
    rawMutation: AthenaCoderControlMutation,
  ): Promise<AthenaCoderControlState> {
    return this.mutateInternal(ownerId, rawMutation, false);
  }
  private async mutateInternal(ownerId: string, rawMutation: AthenaCoderControlMutation, evaluatedVersion: boolean): Promise<AthenaCoderControlState> {
    const owner = ownerSchema.parse(ownerId);
    const mutation = AthenaCoderControlMutationSchema.parse(rawMutation);
    const current = await this.get(owner);
    const selected = mutation.action === "SELECT_VERSION" ? mutation.modelId : current.selectedModelId;
    if (mutation.action !== "DISABLE" && selected) {
      const metadata = AthenaCoderRuntimeMetadataSchema.safeParse(this.registeredModel(selected).metadata);
      if (metadata.success && metadata.data.distillation && !evaluatedVersion)
        throw new AthenaCoderControlError("MODEL_UNREVIEWED", "Trained models require the governed distillation version path.");
    }
    if (mutation.action === "DISABLE") {
      const disabled = {
        ...current,
        enabled: false,
        updatedAt: new Date().toISOString(),
      };
      if (this.store) await this.store.put(disabled);
      return AthenaCoderControlStateSchema.parse(disabled);
    }
    if (!this.store)
      throw new AthenaCoderControlError(
        "STORE_UNAVAILABLE",
        "AthenaCoder controls require durable owner-scoped storage.",
      );
    if (mutation.action === "SELECT_VERSION") {
      this.registeredModel(mutation.modelId);
      const selected = AthenaCoderControlStateSchema.parse({
        ...current,
        selectedModelId: mutation.modelId,
        enabled: false,
        updatedAt: new Date().toISOString(),
      });
      await this.store.put(selected);
      return selected;
    }
    if (mutation.action === "SET_CATEGORIES") {
      const updated = AthenaCoderControlStateSchema.parse({
        ...current,
        allowedCategories: [...new Set(mutation.categories)],
        enabled: false,
        updatedAt: new Date().toISOString(),
      });
      await this.store.put(updated);
      return updated;
    }
    if (!current.selectedModelId || !current.allowedCategories.length)
      throw new AthenaCoderControlError(
        "MODEL_UNREVIEWED",
        "Select a registered reviewed model and bounded categories first.",
      );
    const model = this.registeredModel(current.selectedModelId);
    const metadata = AthenaCoderRuntimeMetadataSchema.safeParse(model.metadata);
    if (
      !model.enabled ||
      !metadata.success ||
      !metadata.data.reviewed ||
      metadata.data.availability !== "AVAILABLE" ||
      metadata.data.benchmarkStatus !== "MEASURED" ||
      !metadata.data.artifactDigest ||
      metadata.data.expectedLatencyMs === null ||
      metadata.data.observedSuccessRate === null ||
      metadata.data.memoryRequirementMb === null
    )
      throw new AthenaCoderControlError(
        "MODEL_UNREVIEWED",
        "Selected AthenaCoder runtime lacks approved digest or measured evidence.",
      );
    const provider = this.runtime.providers.get(ATHENA_CODER_PROVIDER_ID);
    if (
      !(provider instanceof AthenaCoderProvider) ||
      !(await provider.isReviewedModelHealthy(model.modelId))
    )
      throw new AthenaCoderControlError(
        "RUNTIME_UNAVAILABLE",
        "Selected AthenaCoder runtime is unavailable or digest verification failed.",
      );
    const enabled = AthenaCoderControlStateSchema.parse({
      ...current,
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    await this.store.put(enabled);
    return enabled;
  }

  async eligibilityForTask(
    ownerId: string,
    rawTask: TrustedAthenaCoderTask,
    companyId?: string,
  ): Promise<AthenaCoderEligibility | undefined> {
    const task = trustedTaskSchema.parse(rawTask);
    if (!this.categoryAvailable(ownerId, task.category)) return undefined;
    const control = await this.get(ownerId);
    if (
      !control.enabled ||
      !control.selectedModelId ||
      !control.allowedCategories.includes(task.category)
    )
      return undefined;
    const model = this.registeredModel(control.selectedModelId);
    const metadata = AthenaCoderRuntimeMetadataSchema.safeParse(model.metadata);
    if (
      !model.enabled ||
      !metadata.success ||
      !metadata.data.reviewed ||
      metadata.data.availability !== "AVAILABLE" ||
      metadata.data.benchmarkStatus !== "MEASURED" ||
      !metadata.data.artifactDigest ||
      metadata.data.expectedLatencyMs === null ||
      metadata.data.observedSuccessRate === null
    )
      return undefined;
    if (metadata.data.distillation) {
      if (metadata.data.distillation.ownerId !== ownerId || metadata.data.distillation.companyId !== companyId || !this.versionAuthority) return undefined;
      try { if (!(await this.versionAuthority(ownerId, model.modelId, true))) return undefined; } catch { return undefined; }
    }
    return AthenaCoderEligibilitySchema.parse({
      source: "TRUSTED_ENGINEERING_POLICY",
      activeModelId: model.modelId,
      ...task,
      measuredP95LatencyMs: metadata.data.expectedLatencyMs,
      measuredSuccessRate: metadata.data.observedSuccessRate,
      maxAcceptableP95LatencyMs: 10_000,
      minAcceptableSuccessRate: 0.8,
    });
  }

  private registeredModel(modelId: string) {
    const model = this.runtime
      .listModels()
      .find(
        (item) =>
          item.providerId === ATHENA_CODER_PROVIDER_ID && item.modelId === modelId,
      );
    if (!model)
      throw new AthenaCoderControlError(
        "MODEL_UNREVIEWED",
        "AthenaCoder version is not registered.",
      );
    return model;
  }
  private disabled(ownerId: string): AthenaCoderControlState {
    return AthenaCoderControlStateSchema.parse({
      ownerId,
      enabled: false,
      selectedModelId: null,
      allowedCategories: [],
      updatedAt: null,
    });
  }
}
