import { describe, expect, it } from "vitest";

import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { UniversalCredentialScope, UniversalMcpSecretResolver } from "./credentials.js";

const ownerId = crypto.randomUUID();
const companyId = crypto.randomUUID();
const credentialId = crypto.randomUUID();
const at = new Date().toISOString();
const provider = { id: "reviewed.mcp", ownerId, companyId, sourceType: "MCP_REMOTE" as const,
  displayName: "Reviewed", endpoint: "https://mcp.example.test/mcp", credentialReferenceId: credentialId,
  status: "ENABLED" as const, health: "HEALTHY" as const, version: "2025-06-18", updatedAt: at };
const context = { ownerId, companyId, agentId: null, requestId: "credential-test", emergencyStopActive: false };

describe("universal credential scope", () => {
  it("resolves only a ready company/provider-bound server locator and fails after revocation", async () => {
    const store = new InMemoryCompanyDataStore();
    const scope = new UniversalCredentialScope(store);
    const resolver = new UniversalMcpSecretResolver([{ providerId: provider.id, secretLocator: "reviewed-token",
      kind: "bearer", value: "test-secret-value-over-20-chars" }]);
    const reference = { id: credentialId, ownerId, companyId, provider: provider.id,
      secretLocator: "reviewed-token", status: "READY" as const, lastVerifiedAt: at, createdAt: at, updatedAt: at };
    store.saveCredentialReference(reference);
    expect(await scope.ready({ context, provider, required: true })).toBe(true);
    expect(await scope.headers(provider, resolver)).toEqual({ authorization: "Bearer test-secret-value-over-20-chars" });
    expect(await scope.state({ ...context, companyId: crypto.randomUUID() }, provider)).toBe("ERROR");
    store.saveCredentialReference({ ...reference, status: "REVOKED" });
    expect(await scope.ready({ context, provider, required: true })).toBe(false);
    await expect(scope.headers(provider, resolver)).rejects.toThrow("unavailable");
  });
});
