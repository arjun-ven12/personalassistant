import { describe, expect, it, vi } from "vitest";
import { MarketingCreativeCoordinator } from "./creative.js";
import { UniversalToolGateway, type ToolAdapter, type TrustedToolContext } from "../universal-tools/gateway.js";
import { InMemoryUniversalToolStore } from "../universal-tools/store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const approvalId = "33333333-3333-4333-8333-333333333333";
const context: TrustedToolContext = { ownerId, companyId, agentId: null, requestId: "creative-sandbox", emergencyStopActive: false };
const request = { campaignId: "44444444-4444-4444-8444-444444444444", deliverableId: "55555555-5555-4555-8555-555555555555", version: 1, mediaType: "IMAGE", brief: "A blue geometric product illustration." };
const inputSchema = { type: "object", properties: {
  campaignId: { type: "string", maxLength: 36 }, deliverableId: { type: "string", maxLength: 36 },
  version: { type: "integer", minimum: 1 }, mediaType: { type: "string", enum: ["IMAGE", "VIDEO"] },
  brief: { type: "string", minLength: 1, maxLength: 4000 },
}, required: ["campaignId", "deliverableId", "version", "mediaType", "brief"], additionalProperties: false };
const outputSchema = { type: "object", properties: { assetRef: { type: "string", maxLength: 169 }, mediaType: { type: "string", enum: ["IMAGE", "VIDEO"] } }, required: ["assetRef", "mediaType"], additionalProperties: false };

async function setup(fail = false) {
  const store = new InMemoryUniversalToolStore();
  const invoke = vi.fn(() => {
    if (fail) throw new Error("Lost provider result");
    return Promise.resolve({ structuredOutput: { assetRef: "artifact:sandbox_hero", mediaType: "IMAGE" }, externalOperationId: "sandbox_hero", costMinor: 0, costCurrency: "USD" });
  });
  const adapter: ToolAdapter = { sourceType: "API", writeRecovery: "PROVIDER_IDEMPOTENT_RECONCILABLE",
    reconcile: () => Promise.resolve({ status: "UNKNOWN", externalOperationId: null }), invoke,
    discover: () => Promise.resolve([{ name: "generate", description: "Sandbox finite creative generation", inputSchema, outputSchema, capabilityCategory: "image.generate", department: "marketing", operationClass: "WRITE", riskLevel: "medium", approvalRequirement: "explicit", costModel: "FREE" }]),
  };
  const audit = vi.fn(() => Promise.resolve());
  const gateway = new UniversalToolGateway(store, (input) => Promise.resolve(input.approvalId !== approvalId ? "APPROVAL_REQUIRED" : {
    kind: "REVIEWED_EXECUTION_GRANT", ownerId, companyId, requestId: input.context.requestId,
    invocationId: input.invocationId, toolId: input.tool.id, providerId: input.provider.id,
    schemaDigest: input.tool.schemaDigest, providerVersion: input.provider.version,
    credentialReferenceId: null, requestDigest: input.requestDigest, approvalId,
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
  }), audit, [adapter]);
  const provider = { id: "sandbox.creative", ownerId, companyId, sourceType: "API" as const, displayName: "Sandbox", endpoint: null, credentialReferenceId: null, status: "REVIEW_REQUIRED" as const, health: "HEALTHY" as const, version: "1", updatedAt: new Date().toISOString() };
  await gateway.registerReviewedProvider(context, provider);
  const [tool] = await gateway.discover(context, provider.id);
  if (!tool) throw new Error("Missing sandbox tool");
  await store.saveProvider({ ...provider, status: "ENABLED" });
  await store.saveTools(ownerId, provider.id, [{ ...tool, enabled: true }]);
  await store.saveReview({ ownerId, companyId, providerId: provider.id, toolId: tool.id, schemaDigest: tool.schemaDigest, providerVersion: "1", riskLevel: tool.riskLevel, approvalRequirement: tool.approvalRequirement, credentialReferenceId: null, governanceToolName: "universal.external_write", status: "ENABLED", reviewedAt: provider.updatedAt, updatedAt: provider.updatedAt });
  return { coordinator: new MarketingCreativeCoordinator(gateway), store, invoke, audit, tool, provider };
}

describe("marketing creative gateway", () => {
  it("requires approval, stores a receipt and reuses the same creative write on retry", async () => {
    const { coordinator, store, invoke, audit } = await setup();
    expect((await coordinator.generate(context, request)).status).toBe("APPROVAL_REQUIRED");
    expect(invoke).not.toHaveBeenCalled();
    const result = await coordinator.generate(context, request, approvalId);
    expect(result.status).toBe("SUCCEEDED");
    if (result.status !== "SUCCEEDED") throw new Error("Expected asset");
    expect(result.content.externalAssetRef).toBe("artifact:sandbox_hero");
    expect((await store.findReceipt(ownerId, companyId, result.result.invocationId))?.status).toBe("COMPLETED");
    expect((await coordinator.generate(context, request, approvalId)).status).toBe("SUCCEEDED");
    expect(invoke).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalled();
  });
  it("never retries a creative write with an indeterminate provider outcome", async () => {
    const { coordinator, invoke } = await setup(true);
    expect((await coordinator.generate(context, request, approvalId)).status).toBe("INDETERMINATE");
    expect((await coordinator.generate(context, request, approvalId)).status).toBe("INDETERMINATE");
    expect(invoke).toHaveBeenCalledOnce();
  });
  it("denies cross-company, missing video provider, emergency stop, and unknown arguments", async () => {
    const { coordinator, invoke } = await setup();
    expect((await coordinator.generate({ ...context, companyId: crypto.randomUUID() }, request, approvalId)).status).toBe("TOOL_UNAVAILABLE");
    expect((await coordinator.generate(context, { ...request, mediaType: "VIDEO" }, approvalId)).status).toBe("TOOL_UNAVAILABLE");
    await expect(coordinator.generate({ ...context, emergencyStopActive: true }, request, approvalId)).rejects.toThrow();
    await expect(coordinator.generate(context, { ...request, endpoint: "https://example.com" }, approvalId)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
