import {
  AIUsageLedgerEntrySchema, EngineeringDeliverySchema, MarketingCampaignSchema,
  UniversalToolResultSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { decomposeMarketingObjective } from "./service.js";
import { buildMarketingTelemetry } from "./telemetry.js";

const ownerId = crypto.randomUUID();
const companyId = crypto.randomUUID();
const at = "2026-09-30T09:00:00.000Z";
const later = "2026-09-30T09:02:00.000Z";

const fixture = () => {
  const objectiveId = crypto.randomUUID();
  const invocationId = crypto.randomUUID();
  const engineeringObjectiveId = crypto.randomUUID();
  const deliverables = decomposeMarketingObjective("PRODUCT_LAUNCH", at).map((item) => item.type === "IMAGE_ASSET"
    ? { ...item, creativeExecution: { invocationId, toolId: "image.generate", brief: "Bounded image",
      mediaType: "IMAGE" as const, idempotencyKey: "marketing-image", approvalId: null,
      state: "RECONCILED" as const, evidenceCode: "COMPLETED_RECEIPT" }, status: "DRAFT_READY" as const }
    : item.type === "LANDING_PAGE" ? { ...item, engineeringObjectiveId } : item);
  const campaign = MarketingCampaignSchema.parse({ id: crypto.randomUUID(), ownerId, companyId,
    objectiveId, idempotencyKey: "marketing-telemetry-test", title: "Launch", productOrCompany: "Assistant",
    objectiveType: "PRODUCT_LAUNCH", targetAudience: null, channels: [], constraints: [],
    status: "ACTIVE", complexity: "LARGE", version: 1, deliverables,
    brandStrategyArtifactRef: null, engineeringRepositoryId: crypto.randomUUID(),
    modelBudgetCredits: 100, toolBudgetMinor: 500, adBudgetMinor: 0,
    knownToolCostMinor: 0, unknownToolCostCount: 0, firstDraftAt: null, firstAssetAt: later,
    firstEngineeringPreviewAt: later, packageReadyAt: null, createdAt: at, updatedAt: later });
  return { campaign, invocationId, engineeringObjectiveId };
};

describe("marketing durable telemetry projection", () => {
  it("sums only exact linked receipts and task ledger entries, preserving unknown costs", () => {
    const { campaign, invocationId } = fixture();
    const taskId = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!.id;
    const result = UniversalToolResultSchema.parse({ invocationId, toolId: "image.generate", providerId: "reviewed-image",
      status: "SUCCEEDED", structuredOutput: {}, boundedTextOutput: null, externalOperationId: "asset-1",
      failureCode: null, retryable: false, latencyMs: 120, costMinor: 25, costCurrency: "USD",
      retryCount: 0, ownerAcceptance: null, startedAt: at, completedAt: later });
    const receipt = { invocationId, ownerId, companyId, toolId: "image.generate", requestDigest: "a".repeat(64),
      status: "COMPLETED" as const, result };
    const ledger = AIUsageLedgerEntrySchema.parse({ id: crypto.randomUUID(), ownerId, requestId: crypto.randomUUID(),
      providerId: "model", modelId: "bounded", taskId, purpose: "REASONING", locality: "CLOUD",
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 0, totalTokens: 150,
        source: "PROVIDER_REPORTED" }, actualCostUsd: "0.01000000", status: "SETTLED", startedAt: at,
      completedAt: later });
    const projected = buildMarketingTelemetry(campaign, { receipts: [receipt, { ...receipt, invocationId: crypto.randomUUID(),
      companyId: crypto.randomUUID() }], modelLedger: [ledger, { ...ledger, id: crypto.randomUUID(),
      taskId: crypto.randomUUID() }], engineeringDelivery: null });
    expect(projected).toMatchObject({ knownUsd: "0.26000000", modelKnownUsd: "0.01000000",
      toolCostMinorByCurrency: { USD: 25 }, modelCalls: 1, inputTokens: 100, outputTokens: 50,
      linkedCreativeInvocations: 1, knownToolCalls: 1, unknownToolCostCount: 0,
      analyticsReceiptsAttributable: false, engineeringBenchmark: null });
    expect(buildMarketingTelemetry(campaign, { receipts: [], modelLedger: [], engineeringDelivery: null }))
      .toMatchObject({ knownUsd: "0.00000000", unknownToolCostCount: 1, completeCostAttribution: false });
  });

  it("derives an Engineering benchmark only from exact scoped delivery evidence", () => {
    const { campaign, engineeringObjectiveId } = fixture();
    const delivery = EngineeringDeliverySchema.parse({ schemaVersion: "1", id: crypto.randomUUID(), ownerId, companyId,
      objectiveId: engineeringObjectiveId, repositoryId: crypto.randomUUID(), integrationRunId: null,
      candidateId: null, intent: "BUILD_SOFTWARE", projectMode: "NEW", projectName: "Launch page",
      sourceRequest: "Build a reviewable launch page", complexity: "SMALL", stack: [], features: [{
        id: crypto.randomUUID(), name: "Landing page", acceptanceCriteria: [], taskIds: [], weight: 1, status: "DONE" }],
      status: "DONE", visibleMode: true, preview: null,
      validation: { lint: "PASS", typecheck: "PASS", tests: "PASS", build: "PASS", review: "PASS" },
      filesChanged: [], modelUsage: [{ tier: "LUNA", calls: 2, inputTokens: 200, outputTokens: 100, costUsd: "0.03000000" }],
      warnings: [], instructionKeys: [], planningStartedAt: at, firstCodeAt: later, firstPreviewAt: later,
      validatedAt: later, completedAt: later, createdAt: at, updatedAt: later });
    const projected = buildMarketingTelemetry(campaign, { receipts: [], modelLedger: [], engineeringDelivery: delivery });
    expect(projected).toMatchObject({ engineeringKnownUsd: "0.03000000", knownUsd: "0.03000000",
      engineeringBenchmark: { taskId: delivery.id, firstPatchAt: later, previewAt: later, modelCalls: 2,
        toolCalls: null, firstActionAt: null, inputTokens: 200, outputTokens: 100, finalSuccess: true } });
    expect(() => buildMarketingTelemetry(campaign, { receipts: [], modelLedger: [], engineeringDelivery: {
      ...delivery, companyId: crypto.randomUUID(),
    } })).toThrow("scope mismatch");
  });
});
