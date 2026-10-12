import { describe, it, expect } from "vitest";
import { UniversalToolSchema, UniversalToolResultSchema } from "@alexa-control/shared";
import { rankTools, toolEvidence } from "./intelligence.js";
import type { ToolInvocationReceipt } from "./store.js";
const scope = { ownerId: "11111111-1111-4111-8111-111111111111", companyId: "22222222-2222-4222-8222-222222222222" };
const tool = (id: string) => UniversalToolSchema.parse({ ...scope, id, providerId: "fixture.api", name: "fixture", description: "Synthetic tool", capabilityCategory: "image.generate", department: "creative", inputSchema: {}, outputSchema: {}, schemaDigest: "a".repeat(64), operationClass: "WRITE", riskLevel: "medium", approvalRequirement: "explicit", costModel: "UNKNOWN", rateLimitPerMinute: 30, enabled: true, version: "1", updatedAt: "2026-10-05T01:00:00.000Z" });
const receipts = (id: string, count: number): ToolInvocationReceipt[] => Array.from({ length: count }, () => {
  const invocationId = crypto.randomUUID();
  return { ...scope, invocationId, toolId: id, requestDigest: "a".repeat(64), status: "COMPLETED", result: UniversalToolResultSchema.parse({ invocationId, toolId: id, providerId: "fixture.api", status: "SUCCEEDED", structuredOutput: null, boundedTextOutput: null, externalOperationId: null, failureCode: null, retryable: false, ownerAcceptance: "ACCEPTED", costMinor: null, costCurrency: null, retryCount: 0, latencyMs: 10, startedAt: "2026-10-05T01:00:00.000Z", completedAt: "2026-10-05T01:00:00.000Z", toolVersion: "1", toolSchemaDigest: "a".repeat(64), capabilityCategory: "image.generate", environment: "API" }) };
});
describe("telemetry-informed tool preference without execution authority", () => {
  it("requires sufficient reviewed evidence and preserves unknown costs", () => {
    const a = tool("fixture.alpha"), b = tool("fixture.beta");
    expect(rankTools([b, a], receipts(b.id, 1))[0]?.tool.id).toBe(a.id);
    expect(rankTools([a, b], receipts(b.id, 20))[0]?.tool.id).toBe(b.id);
    expect(toolEvidence(b, receipts(b.id, 20))).toMatchObject({ costUnknownSamples: 20, costKnownSamples: 0, knownCostMinorByCurrency: {}, evidenceStrong: true });
  });
  it("does not reuse another tenant, old version/schema or unknown historical receipts", () => {
    const a = tool("fixture.alpha"), history = receipts(a.id, 30);
    for (const entry of history) { entry.companyId = crypto.randomUUID(); }
    expect(toolEvidence(a, history).samples).toBe(0);
    expect(toolEvidence({ ...a, version: "2" }, receipts(a.id, 30)).samples).toBe(0);
    expect(toolEvidence({ ...a, schemaDigest: "b".repeat(64) }, receipts(a.id, 30)).samples).toBe(0);
    const old = receipts(a.id, 30);
    for (const entry of old) delete entry.result!.toolVersion;
    expect(toolEvidence(a, old).samples).toBe(0);
  });
  it("excludes disabled/prohibited tools even with excellent historical outcomes", () => {
    const a = tool("fixture.alpha");
    expect(rankTools([{ ...a, enabled: false }, { ...a, riskLevel: "prohibited" }], receipts(a.id, 100))).toEqual([]);
    const unknown = receipts(a.id, 30).map(v => ({ ...v, status: "INDETERMINATE" as const, result: { ...v.result!, status: "INDETERMINATE" as const, ownerAcceptance: null } }));
    expect(toolEvidence(a, unknown).evidenceStrong).toBe(false);
  });
});
