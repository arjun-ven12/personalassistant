import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companyScope } from "../companies/scope.js";
import { CompanyService } from "../companies/service.js";
import { PostgresCompanyStore } from "../companies/store.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { IntegrationRegistryService } from "../integrations/service.js";
import { PostgresIntegrationStore } from "../integrations/postgres-store.js";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";

const url = safeTestDatabaseUrl();
describe.skipIf(!url)("MCP existing PostgreSQL permission/audit boundary", () => {
  let fixture: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
  beforeAll(async () => {
    fixture = await createIsolatedTestDatabase(url!, "mcp1a");
  }, 60_000);
  afterAll(async () => fixture?.cleanup());

  it("accepts the finite provider migration and retains company isolation/revocation/audit after store reconstruction", async () => {
    const identity = new PostgresIdentityStore(fixture.database.pool);
    const ownerId = crypto.randomUUID(),
      at = new Date().toISOString();
    await identity.createUser({
      id: ownerId,
      email: `${ownerId}@example.invalid`,
      displayName: "Fixture",
      passwordHash: "unused-fixture-hash",
      createdAt: at,
      updatedAt: at,
      lastLoginAt: null,
      accountStatus: "ACTIVE",
    });
    const company = await new CompanyService(
      new PostgresCompanyStore(fixture.database.pool),
      identity,
    ).ensureDefault(ownerId);
    const scope = {
      ownerId,
      companyId: company.id,
      role: "OWNER" as const,
      requestId: crypto.randomUUID(),
    };
    await companyScope.run(scope, async () => {
      const registry = new IntegrationRegistryService(
        new PostgresIntegrationStore(fixture.database.pool),
        async (input) => {
          await identity.appendAudit({
            ...input,
            userId: input.ownerId,
            companyId: scope.companyId,
          });
        },
      );
      await registry.setPermission({
        ownerId,
        integrationId: "mcp_local_fixture",
        capabilityId: "mcp.local_fixture.read",
        grant: true,
        requestId: scope.requestId,
        ipAddress: "127.0.0.1",
      });
      const reconstructed = new PostgresIntegrationStore(fixture.database.pool);
      expect(
        (await reconstructed.findIntegration(ownerId, "mcp_local_fixture"))?.provider,
      ).toBe("mcp_local");
      expect(
        (
          await reconstructed.findPermission(
            ownerId,
            "mcp_local_fixture",
            "mcp.local_fixture.read",
          )
        )?.state,
      ).toBe("granted");
      await registry.setPermission({
        ownerId,
        integrationId: "mcp_local_fixture",
        capabilityId: "mcp.local_fixture.read",
        grant: false,
        requestId: scope.requestId,
        ipAddress: "127.0.0.1",
      });
      expect(
        (
          await reconstructed.findPermission(
            ownerId,
            "mcp_local_fixture",
            "mcp.local_fixture.read",
          )
        )?.state,
      ).toBe("revoked");
      expect(
        (
          await new PostgresIdentityStore(fixture.database.pool).listAudit(ownerId, 100)
        ).some((e) => e.eventType === "INTEGRATION_PERMISSION_REVOKED"),
      ).toBe(true);
      await companyScope.run({ ...scope, companyId: crypto.randomUUID() }, async () => {
        expect(
          await reconstructed.findIntegration(ownerId, "mcp_local_fixture"),
        ).toBeUndefined();
        expect(
          await reconstructed.findPermission(
            ownerId,
            "mcp_local_fixture",
            "mcp.local_fixture.read",
          ),
        ).toBeUndefined();
      });
    });
  });
});
