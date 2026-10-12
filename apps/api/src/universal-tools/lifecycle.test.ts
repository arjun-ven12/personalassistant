import { describe, expect, it, vi } from "vitest";

import { UniversalToolGateway, type ToolAdapter } from "./gateway.js";
import { UniversalToolLifecycle } from "./lifecycle.js";
import { InMemoryUniversalToolStore } from "./store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const context = { ownerId, companyId, agentId: null, requestId: "lifecycle-test", emergencyStopActive: false };
const endpoint = "https://mcp.example.test/mcp";

describe("reviewed remote MCP lifecycle", () => {
  it("registers, discovers disabled, reviews exact schema, activates, and revokes", async () => {
    const store = new InMemoryUniversalToolStore();
    const adapter: ToolAdapter = {
      sourceType: "MCP_REMOTE",
      discover: () => Promise.resolve([{ name: "lookup", description: "Read reviewed metadata",
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
        outputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
        capabilityCategory: "metadata.read", department: "engineering", operationClass: "WRITE",
        riskLevel: "high", approvalRequirement: "recent_authentication", costModel: "UNKNOWN" }]),
      invoke: () => Promise.resolve({ structuredOutput: {} }),
    };
    const gateway = new UniversalToolGateway(store, () => Promise.resolve("DENY"), () => Promise.resolve(), [adapter]);
    const credentialReady = vi.fn(() => Promise.resolve(true));
    const audit = vi.fn(() => Promise.resolve());
    const bootstrap = new UniversalToolLifecycle(store, gateway, [], ["mcp.example.test"], credentialReady, audit);
    await expect(bootstrap.registerRemote(context, { id: "sample.mcp", displayName: "Sample", endpoint: "https://localhost/mcp", credentialReferenceId: null })).rejects.toThrow();
    await bootstrap.registerRemote(context, { id: "sample.mcp", displayName: "Sample", endpoint, credentialReferenceId: null });
    const [discovered] = await bootstrap.discover(context, "sample.mcp");
    expect(discovered?.enabled).toBe(false);
    if (!discovered) throw new Error("Tool missing.");
    const lifecycle = new UniversalToolLifecycle(store, gateway, [{
      providerId: "sample.mcp", toolName: "lookup", schemaDigest: discovered.schemaDigest,
      endpoint,
      providerVersion: "2025-06-18", governanceToolName: "security.view",
      operationClass: "READ", riskLevel: "read_only", approvalRequirement: "none",
      credentialRequired: false,
    }], ["mcp.example.test"], credentialReady, audit);
    await expect(lifecycle.registerRemote(context, { id: "sample.mcp", displayName: "Sample", endpoint: "https://mcp.example.test/other", credentialReferenceId: null })).rejects.toThrow("differs");
    await expect(lifecycle.review(context, discovered.id, "0".repeat(64))).rejects.toThrow();
    expect((await lifecycle.review(context, discovered.id, discovered.schemaDigest)).status).toBe("REVIEWED");
    expect((await lifecycle.activate(context, discovered.id))?.status).toBe("ENABLED");
    expect((await gateway.select(context, "metadata.read"))).toHaveLength(1);
    await lifecycle.disable(context, discovered.id, true);
    expect((await gateway.select(context, "metadata.read"))).toHaveLength(0);
    await expect(lifecycle.review(context, discovered.id, discovered.schemaDigest)).rejects.toThrow();
  });

  it("invalidates activation after a schema change", async () => {
    const store = new InMemoryUniversalToolStore();
    const adapter: ToolAdapter = { sourceType: "API", discover: () => Promise.resolve([]), invoke: () => Promise.resolve({ structuredOutput: {} }) };
    const gateway = new UniversalToolGateway(store, () => Promise.resolve("DENY"), () => Promise.resolve(), [adapter]);
    const at = new Date().toISOString();
    await store.saveProvider({ id: "test.api", ownerId, companyId, sourceType: "API", displayName: "Test", endpoint: null, credentialReferenceId: null, status: "ENABLED", health: "HEALTHY", version: "1", updatedAt: at });
    const tool = { id: "test.api:lookup", providerId: "test.api", ownerId, companyId, name: "lookup", description: "Read metadata", capabilityCategory: "metadata.read", department: "engineering", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, outputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, schemaDigest: "a".repeat(64), operationClass: "READ" as const, riskLevel: "read_only" as const, approvalRequirement: "none" as const, costModel: "FREE" as const, rateLimitPerMinute: 30, enabled: true, version: "1", updatedAt: at };
    await store.saveTools(ownerId, "test.api", [tool]);
    await store.saveReview({ ownerId, companyId, providerId: "test.api", toolId: tool.id, schemaDigest: tool.schemaDigest, providerVersion: "1", riskLevel: "read_only", approvalRequirement: "none", credentialReferenceId: null, governanceToolName: "security.view", status: "ENABLED", reviewedAt: at, updatedAt: at });
    expect(await gateway.select(context, "metadata.read")).toHaveLength(1);
    await store.saveTools(ownerId, "test.api", [{ ...tool, schemaDigest: "b".repeat(64) }]);
    expect(await gateway.select(context, "metadata.read")).toHaveLength(0);
  });
});
