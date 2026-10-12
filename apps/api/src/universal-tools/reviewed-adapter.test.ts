import { describe, expect, it, vi } from "vitest";
import { ReviewedDelegatingAdapter } from "./reviewed-adapter.js";
import { UniversalToolGateway, type TrustedToolContext } from "./gateway.js";
import { InMemoryUniversalToolStore } from "./store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const context: TrustedToolContext = { ownerId, companyId, agentId: null, requestId: "test", emergencyStopActive: false };
const schema = { type: "object", properties: {}, required: [], additionalProperties: false };

describe("reviewed adapter", () => {
  it.each(["API", "NATIVE", "LOCAL"] as const)("uses the same gateway for %s without accepting caller endpoints", async (sourceType) => {
    const provider = { id: `reviewed.${sourceType.toLowerCase()}`, ownerId, companyId, sourceType, displayName: sourceType, endpoint: null, credentialReferenceId: null, status: "REVIEW_REQUIRED" as const, health: "HEALTHY" as const, version: "1", updatedAt: new Date().toISOString() };
    const handler = vi.fn(() => Promise.resolve({ structuredOutput: {} }));
    const adapter = new ReviewedDelegatingAdapter(sourceType, [{ providerId: provider.id, descriptor: { name: "inspect", description: "Read reviewed data", inputSchema: schema, outputSchema: schema, capabilityCategory: "reviewed_read", department: "engineering", operationClass: "READ", riskLevel: "read_only", approvalRequirement: "none", costModel: "FREE" }, invoke: handler }]);
    const store = new InMemoryUniversalToolStore();
    const gateway = new UniversalToolGateway(store, (input) => Promise.resolve({
      kind: "REVIEWED_EXECUTION_GRANT" as const, ownerId, companyId, requestId: context.requestId,
      invocationId: input.invocationId, toolId: input.tool.id, providerId: input.provider.id,
      schemaDigest: input.tool.schemaDigest, providerVersion: input.provider.version,
      credentialReferenceId: null, requestDigest: input.requestDigest, approvalId: null,
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    }), () => Promise.resolve(), [adapter]);
    await gateway.registerReviewedProvider(context, provider);
    const [tool] = await gateway.discover(context, provider.id);
    if (!tool) throw new Error("Missing tool.");
    await store.saveProvider({ ...provider, status: "ENABLED" });
    await store.saveTools(ownerId, provider.id, [{ ...tool, enabled: true }]);
    await store.saveReview({ ownerId, companyId, providerId: provider.id, toolId: tool.id,
      schemaDigest: tool.schemaDigest, providerVersion: provider.version, riskLevel: tool.riskLevel,
      approvalRequirement: tool.approvalRequirement, credentialReferenceId: null,
      governanceToolName: "universal.external_read", status: "ENABLED",
      reviewedAt: provider.updatedAt, updatedAt: provider.updatedAt });
    const result = await gateway.invoke(context, { invocationId: crypto.randomUUID(), toolId: tool.id, arguments: {}, approvalId: null, idempotencyKey: null, requestedAt: new Date().toISOString() });
    expect(result.status).toBe("SUCCEEDED");
    expect(handler).toHaveBeenCalledOnce();
    await expect(gateway.registerReviewedProvider(context, { ...provider, endpoint: "https://example.com" })).rejects.toThrow();
  });
});
