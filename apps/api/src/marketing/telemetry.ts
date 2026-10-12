import {
  AIUsageLedgerEntrySchema, EngineeringBenchmarkRunSchema, EngineeringDeliverySchema,
  MarketingCampaignSchema,
  type AIUsageLedgerEntry, type EngineeringDelivery, type MarketingCampaign,
} from "@alexa-control/shared";

import type { ToolInvocationReceipt } from "../universal-tools/store.js";

const SCALE = 100_000_000n;
const decimalUnits = (value: string) => {
  if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("Invalid recorded USD amount.");
  const [whole = "0", fractional = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fractional.padEnd(8, "0"));
};
const unitsDecimal = (value: bigint) => `${value / SCALE}.${(value % SCALE).toString().padStart(8, "0")}`;

/** A bounded read projection over existing durable economic and execution records. */
export function buildMarketingTelemetry(
  rawCampaign: MarketingCampaign,
  source: { receipts: readonly ToolInvocationReceipt[]; modelLedger: readonly AIUsageLedgerEntry[]; engineeringDelivery: EngineeringDelivery | null },
) {
  const campaign = MarketingCampaignSchema.parse(rawCampaign);
  const taskIds = new Set(campaign.deliverables.flatMap((item) =>
    [item.id, ...(item.workforceTaskId ? [item.workforceTaskId] : [])]));
  const invocationIds = new Set(campaign.deliverables.flatMap((item) =>
    [...item.toolInvocationIds, ...(item.creativeExecution ? [item.creativeExecution.invocationId] : [])]));
  const receiptById = new Map(source.receipts
    .filter((item) => item.ownerId === campaign.ownerId && item.companyId === campaign.companyId && invocationIds.has(item.invocationId))
    .map((item) => [item.invocationId, item]));
  const toolCostMinorByCurrency: Record<string, number> = {};
  let unknownToolCostCount = 0;
  let knownToolCalls = 0;
  for (const invocationId of invocationIds) {
    const receipt = receiptById.get(invocationId);
    if (!receipt || receipt.status !== "COMPLETED" || !receipt.result) {
      unknownToolCostCount++;
      continue;
    }
    knownToolCalls++;
    const { costMinor, costCurrency } = receipt.result;
    if (costMinor === null || costMinor === undefined || !costCurrency) unknownToolCostCount++;
    else toolCostMinorByCurrency[costCurrency] = (toolCostMinorByCurrency[costCurrency] ?? 0) + costMinor;
  }
  let modelCostUnits = 0n;
  let unknownModelCostCount = 0;
  let modelCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const unparsed of source.modelLedger) {
    const entry = AIUsageLedgerEntrySchema.parse(unparsed);
    if (entry.ownerId !== campaign.ownerId || !entry.taskId || !taskIds.has(entry.taskId) ||
        !["SETTLED", "ADJUSTED"].includes(entry.status)) continue;
    modelCalls++;
    inputTokens += entry.usage.inputTokens ?? 0;
    outputTokens += entry.usage.outputTokens ?? 0;
    if (entry.actualCostUsd === undefined) unknownModelCostCount++;
    else modelCostUnits += decimalUnits(entry.actualCostUsd);
  }
  const linkedObjective = campaign.deliverables.find((item) => item.type === "LANDING_PAGE")?.engineeringObjectiveId;
  const delivery = source.engineeringDelivery ? EngineeringDeliverySchema.parse(source.engineeringDelivery) : null;
  if (delivery && (delivery.ownerId !== campaign.ownerId || delivery.companyId !== campaign.companyId ||
      !linkedObjective || delivery.objectiveId !== linkedObjective)) throw new Error("Engineering telemetry scope mismatch.");
  const engineeringCostUnits = delivery?.modelUsage.reduce((sum, item) => sum + decimalUnits(item.costUsd), 0n) ?? 0n;
  const unknownEngineeringCostCount = delivery && delivery.modelUsage.length === 0 ? 1 : 0;
  const terminal = delivery && ["DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED"].includes(delivery.status);
  const engineeringBenchmark = delivery ? EngineeringBenchmarkRunSchema.parse({
    schemaVersion: "1", taskId: delivery.id, taskCategory: "MARKETING_LANDING_PAGE", complexity: delivery.complexity,
    system: "ATHENA", route: null, startedAt: campaign.createdAt,
    firstActionAt: null, firstPatchAt: delivery.firstCodeAt, previewAt: delivery.firstPreviewAt,
    completedAt: terminal ? delivery.completedAt : null,
    modelCalls: delivery.modelUsage.reduce((sum, item) => sum + item.calls, 0),
    toolCalls: null, toolRoundTrips: null, managerCalls: null, validationRuns: null,
    inputTokens: delivery.modelUsage.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: delivery.modelUsage.reduce((sum, item) => sum + item.outputTokens, 0),
    apiCostUsd: unknownEngineeringCostCount ? null : Number(unitsDecimal(engineeringCostUnits)),
    retries: null, ownerInterventions: null,
    validationPass: delivery.validatedAt ? ["lint", "typecheck", "tests", "build"].every((key) =>
      delivery.validation[key as "lint" | "typecheck" | "tests" | "build"] === "PASS") : null,
    reviewPass: delivery.validation.review === "PASS" ? true : delivery.validation.review === "FAIL" ? false : null,
    finalSuccess: terminal ? ["DONE", "DONE_WITH_WARNINGS"].includes(delivery.status) : null,
    source: "RUNTIME",
  }) : null;
  const knownUsdUnits = modelCostUnits + engineeringCostUnits + BigInt(toolCostMinorByCurrency.USD ?? 0) * 1_000_000n;
  return {
    campaignId: campaign.id, objectiveId: campaign.objectiveId,
    knownUsd: unitsDecimal(knownUsdUnits), modelKnownUsd: unitsDecimal(modelCostUnits),
    engineeringKnownUsd: unitsDecimal(engineeringCostUnits), toolCostMinorByCurrency,
    modelCalls, inputTokens, outputTokens, linkedCreativeInvocations: invocationIds.size, knownToolCalls,
    unknownToolCostCount, unknownModelCostCount, unknownEngineeringCostCount,
    completeCostAttribution: unknownToolCostCount === 0 && unknownModelCostCount === 0 && unknownEngineeringCostCount === 0 &&
      source.receipts.length < 500 && source.modelLedger.length < 100_000,
    analyticsReceiptsAttributable: campaign.deliverables.filter((item) => item.type === "ANALYTICS_REPORT").every((item) => item.toolInvocationIds.length > 0 && item.toolInvocationIds.every((id) => receiptById.has(id))),
    engineeringChildCreatedAt: delivery?.createdAt ?? null,
    engineeringBenchmark,
  };
}
