import { type UniversalTool } from "@alexa-control/shared";
import type { ToolInvocationReceipt } from "./store.js";
import type { TrustedToolContext, UniversalToolGateway } from "./gateway.js";

/** Only current-version, company-scoped receipts are evidence. Unknown billing stays unknown. */
export function toolEvidence(tool: UniversalTool, receipts: readonly ToolInvocationReceipt[]) {
  const matching = receipts.filter(v => v.ownerId === tool.ownerId && v.companyId === tool.companyId && v.toolId === tool.id && v.result?.toolVersion === tool.version && v.result.toolSchemaDigest === tool.schemaDigest && v.result.capabilityCategory === tool.capabilityCategory);
  const accepted = matching.filter(v => v.result?.ownerAcceptance === "ACCEPTED").length;
  const reviewed = matching.filter(v => v.result?.ownerAcceptance).length;
  const failures = matching.filter(v => v.result?.status !== "SUCCEEDED").length;
  const durations = matching.flatMap(v => v.result ? [v.result.latencyMs] : []);
  const costs = matching.flatMap(v => v.result?.costMinor !== null && v.result?.costMinor !== undefined && v.result.costCurrency ? [{ value: v.result.costMinor, currency: v.result.costCurrency }] : []);
  const knownCostMinorByCurrency: Record<string, number> = {};
  for (const cost of costs) knownCostMinorByCurrency[cost.currency] = (knownCostMinorByCurrency[cost.currency] ?? 0) + cost.value;
  return { toolId: tool.id, version: tool.version, schemaDigest: tool.schemaDigest, category: tool.capabilityCategory,
    samples: matching.length, reviewedSamples: reviewed, acceptedSamples: accepted, acceptanceRate: reviewed ? accepted / reviewed : null,
    failureRate: matching.length ? failures / matching.length : null, averageDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    retryCount: matching.reduce((sum, v) => sum + (v.result?.retryCount ?? 0), 0),
    costKnownSamples: costs.length, costUnknownSamples: matching.length - costs.length, knownCostMinorByCurrency,
    evidenceStrong: reviewed >= 20 && accepted / reviewed >= 0.9 && failures / matching.length <= 0.1 };
}
export function rankTools(tools: readonly UniversalTool[], receipts: readonly ToolInvocationReceipt[]) {
  return tools.filter(v => v.enabled && v.riskLevel !== "prohibited" && v.approvalRequirement !== "prohibited").map(tool => ({ tool, evidence: toolEvidence(tool, receipts) })).sort((a, b) => {
    if (a.evidence.evidenceStrong && b.evidence.evidenceStrong) return (b.evidence.acceptanceRate! - a.evidence.acceptanceRate!) || (a.evidence.averageDurationMs! - b.evidence.averageDurationMs!) || a.tool.id.localeCompare(b.tool.id);
    return Number(b.evidence.evidenceStrong) - Number(a.evidence.evidenceStrong) || a.tool.id.localeCompare(b.tool.id);
  });
}
/** Advisory preference only. invoke still revalidates exact policy, approval, credentials, schema and health. */
export class ToolIntelligenceService {
  constructor(private readonly gateway: UniversalToolGateway) {}
  async recommend(context: TrustedToolContext, category: string) {
    if (!context.companyId || context.emergencyStopActive) return { requiresGatewayAuthorization: true, recommendations: [] };
    const [tools, receipts] = await Promise.all([this.gateway.select(context, category, 20, true), this.gateway.store.listReceipts(context.ownerId, context.companyId, 500)]);
    return { requiresGatewayAuthorization: true, selectionAuthority: "TOOL_GATEWAY" as const,
      recommendations: rankTools(tools, receipts).map(({ tool, evidence }) => ({ toolId: tool.id, evidence,
        risk: tool.riskLevel, approvalRequirement: tool.approvalRequirement, preference: evidence.evidenceStrong ? "MEASURED_PREFERENCE" : "DETERMINISTIC_REGISTRY_ORDER" })) };
  }
}
