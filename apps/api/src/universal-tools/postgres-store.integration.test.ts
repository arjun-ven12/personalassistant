import {
  UniversalToolProviderSchema,
  UniversalToolResultSchema,
  UniversalToolSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresUniversalToolStore } from "./postgres-store.js";
import { summarizeToolReceipts } from "./telemetry.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("universal tool PostgreSQL receipts", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresUniversalToolStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const otherCompanyId = crypto.randomUUID();
  const at = "2026-09-30T00:00:00.000Z";

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(connectionString!, "universaltools281");
    database = isolated.database;
    cleanup = isolated.cleanup;
    store = new PostgresUniversalToolStore(database.pool);
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("persists scoped definitions and atomically claims a request once", async () => {
    const provider = UniversalToolProviderSchema.parse({
      id: "test.provider", ownerId, companyId, sourceType: "API", displayName: "Test",
      endpoint: "https://example.test/mcp", credentialReferenceId: null,
      status: "ENABLED", health: "HEALTHY", version: "1", updatedAt: at,
    });
    await store.saveProvider(provider);
    const tool = UniversalToolSchema.parse({
      id: "test.provider.read", providerId: provider.id, ownerId, companyId,
      name: "Read test record", description: "Bounded read fixture", capabilityCategory: "test.read",
      department: "engineering", inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: { type: "object", properties: {}, additionalProperties: false },
      schemaDigest: "a".repeat(64), operationClass: "READ", riskLevel: "read_only",
      approvalRequirement: "session", costModel: "FREE", rateLimitPerMinute: 60,
      enabled: true, version: "1", updatedAt: at,
    });
    await expect(store.saveTools(ownerId, provider.id, [{ ...tool, companyId: otherCompanyId }])).rejects.toThrow("scope");
    await store.saveTools(ownerId, provider.id, [tool]);
    expect(await store.findTool(ownerId, tool.id)).toEqual(tool);
    expect(await store.findTool(crypto.randomUUID(), tool.id)).toBeNull();
    const base = {
      invocationId: crypto.randomUUID(), ownerId, companyId, toolId: tool.id,
      requestDigest: "b".repeat(64), status: "RESERVED" as const, result: null,
    };
    expect(await store.reserve(base)).toEqual(base);
    expect(await store.reserve(base)).toEqual(base);
    const claims = await Promise.all([store.claim(ownerId, base.invocationId), store.claim(ownerId, base.invocationId)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(store.complete({ ...base, requestDigest: "c".repeat(64), status: "INDETERMINATE" })).rejects.toThrow("receipt");
    await store.complete({ ...base, status: "INDETERMINATE" });
    expect((await store.reserve(base)).status).toBe("INDETERMINATE");
    expect((await store.findReceipt(ownerId, companyId, base.invocationId))?.status).toBe("INDETERMINATE");
    expect(await store.findReceipt(ownerId, otherCompanyId, base.invocationId)).toBeNull();
    expect(await store.setOwnerAcceptance(ownerId, companyId, base.invocationId, "ACCEPTED")).toBe(false);
    const completed = { ...base, invocationId: crypto.randomUUID(), requestDigest: "d".repeat(64) };
    await store.reserve(completed);
    expect(await store.claim(ownerId, completed.invocationId)).toBe(true);
    const success = UniversalToolResultSchema.parse({ invocationId: completed.invocationId, toolId: tool.id, providerId: provider.id,
      status: "SUCCEEDED", structuredOutput: {}, boundedTextOutput: null, externalOperationId: null,
      failureCode: null, retryable: false, latencyMs: 12, costMinor: 25, costCurrency: "USD", retryCount: 1,
      ownerAcceptance: null, startedAt: at, completedAt: at });
    await store.complete({ ...completed, status: "COMPLETED", result: success });
    const recovered = { ...base, invocationId: crypto.randomUUID(), requestDigest: "e".repeat(64) };
    await store.reserve(recovered);
    expect(await store.claim(ownerId, recovered.invocationId)).toBe(true);
    await store.complete({ ...recovered, status: "INDETERMINATE" });
    const recoveredResult = UniversalToolResultSchema.parse({ ...success, invocationId: recovered.invocationId });
    await store.complete({ ...recovered, status: "COMPLETED", result: recoveredResult });
    expect((await store.findReceipt(ownerId, companyId, recovered.invocationId))?.result?.status).toBe("SUCCEEDED");
    expect(await store.setOwnerAcceptance(ownerId, companyId, completed.invocationId, "ACCEPTED")).toBe(true);
    expect(await store.setOwnerAcceptance(ownerId, companyId, completed.invocationId, "REJECTED")).toBe(false);
    const rebuilt = new PostgresUniversalToolStore(database.pool);
    const telemetry = summarizeToolReceipts(await rebuilt.listReceipts(ownerId, companyId, 50));
    expect(telemetry).toContainEqual(expect.objectContaining({ toolId: tool.id, callCount: 3, successCount: 2,
      indeterminateCount: 1, retryCount: 2, acceptedCount: 1, knownCostMinorByCurrency: { USD: 50 } }));
  });
});
