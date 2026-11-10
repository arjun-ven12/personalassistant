import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  CsrfTokenResponseSchema,
  MCP_POLICY_TOOL,
  McpLocalResponseSchema,
  canonicalizeSignedCommand,
  type SignedCommandEnvelope,
} from "@alexa-control/shared";
import { buildApi } from "../app.js";
import { companyScope } from "../companies/scope.js";
import { CompanyService } from "../companies/service.js";
import { PostgresCompanyStore } from "../companies/store.js";
import {
  ApprovalService,
  type GovernanceAuditWriter,
} from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { digestProposedAction } from "../governance/digest.js";
import { PostgresGovernanceStore } from "../governance/postgres-store.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { PostgresIntegrationStore } from "../integrations/postgres-store.js";
import { IntegrationRegistryService } from "../integrations/service.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresSecurityStateStore } from "../security-state/store.js";
import { McpProtocolClient, type McpSessionFactory } from "./protocol.js";
import { McpLocalService } from "./service.js";
import { createLocalFixtureTransport } from "./transport.js";

const url = safeTestDatabaseUrl();
const origin = "http://localhost:5173";
const route = "/api/mcp/local-fixture/read-status";
const body = {
  workspaceId: "mcp.acceptance.project",
  serverId: "athena.local.fixture",
  toolName: "athena_local_status",
  input: { probe: "health" },
  operation: "read_status",
};

// Required opt-in is the existing test database guard. All values are synthetic.
// The real stdio fixture is used; barriers below inject timing, never tool authority.
describe.skipIf(!url)("MCP-1B PostgreSQL and real local stdio acceptance", () => {
  let fixture: { schema: string; admin: PostgresDatabase };
  let database: PostgresDatabase;
  let identity: PostgresIdentityStore;
  let governance: PostgresGovernanceStore;
  let app: FastifyInstance;
  let cookie: string,
    csrf: string,
    ownerId: string,
    sessionId: string,
    deviceId: string;
  let scope: { ownerId: string; companyId: string; role: "OWNER"; requestId: string };
  let keys: CryptoKeyPair;
  const services: McpLocalService[] = [];
  const apps: FastifyInstance[] = [];
  const headers = () => ({
    cookie,
    origin,
    "x-csrf-token": csrf,
    "x-device-id": deviceId,
  });
  const scoped = <T>(fn: () => T) => companyScope.run(scope, fn);
  const signed = async (
    payload: SignedCommandEnvelope["payload"] = body,
    commandId = crypto.randomUUID(),
  ) => {
    const unsigned = {
      commandId,
      deviceId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: crypto.randomUUID(),
      payload,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const bytes = await webcrypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(unsigned)),
    );
    return { ...unsigned, signature: Buffer.from(bytes).toString("base64url") };
  };
  const send = async (
    envelope: SignedCommandEnvelope,
    instance = app,
    extraHeaders = {},
  ) =>
    instance.inject({
      method: "POST",
      url: route,
      headers: { ...headers(), ...extraHeaders },
      payload: envelope,
    });
  const openApi = async () => {
    identity = new PostgresIdentityStore(database.pool);
    governance = new PostgresGovernanceStore(database.pool, BUILT_IN_TOOLS);
    await governance.initialise();
    const result = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: true,
      nodeEnvironment: "test",
      logger: false,
      database,
      persistenceMode: "postgresql",
      identityStore: identity,
      governanceStore: governance,
      integrationStore: new PostgresIntegrationStore(database.pool),
      securityStateStore: new PostgresSecurityStateStore(database.pool),
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
      durableSchedulerEnabled: false,
      mcpLocalFixtureEnabled: true,
    });
    apps.push(result);
    return result;
  };
  const audit: GovernanceAuditWriter = async (input) => {
    await identity.appendAudit({
      ...input,
      userId: input.ownerId,
      companyId: input.companyId ?? companyScope.companyId(input.ownerId) ?? null,
    });
  };
  const integrationRegistry = () =>
    new IntegrationRegistryService(new PostgresIntegrationStore(database.pool), audit);
  const setPermission = (grant: boolean) =>
    scoped(() =>
      integrationRegistry().setPermission({
        ownerId,
        integrationId: "mcp_local_fixture",
        capabilityId: "mcp.local_fixture.read",
        grant,
        requestId: scope.requestId,
        ipAddress: "127.0.0.1",
      }),
    );
  const context = () => ({
    ...scope,
    sessionId,
    deviceId,
    operationId: crypto.randomUUID(),
    networkVerification: "PRIVATE_NETWORK" as const,
    ipAddress: "127.0.0.1",
  });
  const makeService = (
    factory: McpSessionFactory = () =>
      new McpProtocolClient(createLocalFixtureTransport()),
  ) => {
    const policy = new PolicyEngine(
      governance,
      new RiskEngine(),
      new ApprovalService(governance, audit),
      audit,
    );
    const service = new McpLocalService({
      enabled: true,
      nodeEnvironment: "test",
      identity,
      companies: new CompanyService(new PostgresCompanyStore(database.pool), identity),
      governance,
      policy,
      integrations: integrationRegistry(),
      audit,
      factory,
    });
    services.push(service);
    return service;
  };
  const completed = async (operationId: string) =>
    scoped(async () =>
      (await identity.listAudit(ownerId, 500)).filter(
        (e) =>
          e.metadata?.operationId === operationId &&
          e.eventType === "INTEGRATION_OPERATION_COMPLETED",
      ),
    );

  beforeEach(async () => {
    fixture = {
      schema: `mcp1b_${crypto.randomUUID().replaceAll("-", "")}`,
      admin: new PostgresDatabase(url!),
    };
    await fixture.admin.pool.query(`CREATE SCHEMA "${fixture.schema}"`);
    const isolated = new URL(url!);
    isolated.searchParams.set("options", `-c search_path=${fixture.schema}`);
    database = new PostgresDatabase(isolated.toString());
    await database.migrate();
    app = await openApi();
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "mcp-fixture@example.invalid",
        displayName: "MCP fixture",
        password: "Synthetic-Fixture-2026!",
      },
    });
    expect(registration.statusCode, registration.body).toBe(200);
    const cookies = registration.headers["set-cookie"];
    cookie = (Array.isArray(cookies) ? cookies[0] : cookies)!.split(";")[0]!;
    csrf = CsrfTokenResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/security/csrf",
          headers: { cookie, origin },
        })
      ).json(),
    ).token;
    ownerId = (await identity.findUserByEmail("mcp-fixture@example.invalid"))!.id;
    const company = await new CompanyService(
      new PostgresCompanyStore(database.pool),
      identity,
    ).ensureDefault(ownerId);
    scope = {
      ownerId,
      companyId: company.id,
      role: "OWNER",
      requestId: crypto.randomUUID(),
    };
    sessionId = (
      await database.pool.query<{ id: string }>(
        "SELECT id FROM sessions WHERE owner_id=$1",
        [ownerId],
      )
    ).rows[0]!.id;
    keys = (await webcrypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const publicKey = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
    deviceId = crypto.randomUUID();
    await identity.createDevice({
      id: deviceId,
      ownerId,
      deviceName: "MCP fixture",
      deviceType: "MAC_AGENT",
      trustStatus: "TRUSTED",
      publicKey: { kty: "OKP", crv: "Ed25519", x: publicKey.x! },
      fingerprint: "fixture-public",
      pairingRequestTokenHash: "fixture-hash",
      pairedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastSeen: null,
      revokedAt: null,
      capabilities: [],
      metadata: {},
    });
    await governance.releaseEmergencyStop(new Date().toISOString());
    const workspace = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: headers(),
      payload: {
        id: body.workspaceId,
        displayName: "MCP fixture",
        rootPath: "/workspace/fixture",
        enabled: true,
        permissions: { read: true },
      },
    });
    expect(workspace.statusCode, workspace.body).toBe(200);
    await setPermission(true);
  }, 60_000);
  afterEach(async () => {
    for (const s of services.splice(0)) await s.close();
    for (const a of apps.splice(0)) await a.close();
    await database?.close();
    if (fixture) {
      await fixture.admin.pool.query(`DROP SCHEMA "${fixture.schema}" CASCADE`);
      await fixture.admin.close();
    }
  }, 60_000);

  it("fresh migrations are digest-current and real signed stdio leaves persistent attributable policy/audit evidence", async () => {
    const status = await database.status();
    expect(status.state).toBe("current");
    expect(status.applied).toContain("0118_mcp_local_fixture_provider");
    expect(await database.pgvectorStatus()).toBe("ready");
    const envelope = await signed();
    const response = await send(envelope);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      trust: "UNTRUSTED_DATA",
      result: { status: "ok", readOnly: true },
    });
    await scoped(async () => {
      const result = McpLocalResponseSchema.parse(response.json());
      const evaluations = await governance.listPolicyEvaluations(ownerId, 100);
      expect(
        evaluations.some(
          (e) => e.id === result.policyEvaluationId && e.decision === "allow",
        ),
      ).toBe(true);
      const events = await identity.listAudit(ownerId, 500);
      const lifecycle = events.filter(
        (e) => e.metadata?.operationId === envelope.commandId,
      );
      expect(
        lifecycle.some(
          (e) =>
            e.eventType === "INTEGRATION_OPERATION_COMPLETED" &&
            e.companyId === scope.companyId &&
            e.deviceId === deviceId,
        ),
      ).toBe(true);
      for (const e of lifecycle) {
        expect(Object.keys(e.metadata ?? {}).sort()).toEqual([
          "capabilityId",
          "code",
          "integrationId",
          "operationId",
        ]);
        expect(JSON.stringify(e.metadata)).not.toContain(envelope.signature);
      }
    });
  });

  it("rejects foreign company and workspace access plus unknown servers/tools, side effects and tampered envelopes", async () => {
    expect(
      (await send(await signed(), app, { "x-company-id": crypto.randomUUID() }))
        .statusCode,
    ).toBe(404);
    for (const payload of [
      { ...body, workspaceId: "unknown.project" },
      { ...body, serverId: "untrusted.server" },
      { ...body, toolName: "delete_file" },
      { ...body, operation: "write" },
      { ...body, approval: true },
    ]) {
      const envelope = await signed(payload);
      expect((await send(envelope)).statusCode).toBeGreaterThanOrEqual(400);
      expect(await completed(envelope.commandId)).toHaveLength(0);
    }
    const envelope = await signed();
    const tampered = {
      ...envelope,
      payload: { ...body, workspaceId: "another.project" },
    };
    expect((await send(tampered)).statusCode).toBeGreaterThanOrEqual(400);
    expect(await completed(envelope.commandId)).toHaveLength(0);
  });

  it("isolates an authorized second company even for the same owner and hides the first company's audit records", async () => {
    const envelope = await signed();
    expect((await send(envelope)).statusCode).toBe(200);
    const companies = new CompanyService(
      new PostgresCompanyStore(database.pool),
      identity,
    );
    const second = await companies.create(
      {
        user: (await identity.findUserById(ownerId))!,
        session: (await identity.findSessionById(sessionId))!,
      },
      { name: "Other synthetic company", slug: "other-synthetic" },
    );
    const secondScope = { ...scope, companyId: second.currentCompany.id };
    await companyScope.run(secondScope, async () => {
      await integrationRegistry().setPermission({
        ownerId,
        integrationId: "mcp_local_fixture",
        capabilityId: "mcp.local_fixture.read",
        grant: true,
        requestId: scope.requestId,
        ipAddress: "127.0.0.1",
      });
      expect(await governance.findWorkspaceById(body.workspaceId)).toBeUndefined();
      expect(
        (await identity.listAudit(ownerId, 500)).some(
          (e) => e.metadata?.operationId === envelope.commandId,
        ),
      ).toBe(false);
      await expect(
        makeService().execute({ ...context(), companyId: secondScope.companyId }, body),
      ).rejects.toMatchObject({ code: "MCP_AUTHORIZATION_DENIED" });
    });
    expect(
      (await send(await signed(), app, { "x-company-id": secondScope.companyId }))
        .statusCode,
    ).toBeGreaterThanOrEqual(400);
  });

  it("persists replay denial across API/pool reconstruction and rejects duplicates concurrently across API instances", async () => {
    const envelope = await signed();
    expect((await send(envelope)).statusCode).toBe(200);
    const { rows } = await database.pool.query<{ schema: string }>(
      "SELECT current_schema() AS schema",
    );
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    await database.close();
    const reopened = new URL(url!);
    reopened.searchParams.set("options", `-c search_path=${rows[0]!.schema}`);
    database = new PostgresDatabase(reopened.toString());
    app = await openApi();
    expect((await send(envelope)).statusCode).toBe(409);
    expect(await completed(envelope.commandId)).toHaveLength(1);
    const second = await openApi();
    const duplicate = await signed();
    const responses = await Promise.all([send(duplicate), send(duplicate, second)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await completed(duplicate.commandId)).toHaveLength(1);
    const operationId = crypto.randomUUID();
    const ids = await Promise.all([
      signed(body, operationId),
      signed(body, operationId),
    ]);
    const sameOperation = await Promise.all([send(ids[0]), send(ids[1], second)]);
    expect(sameOperation.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await completed(operationId)).toHaveLength(1);
  });

  it.each(["permission", "session", "device"] as const)(
    "denies persisted %s revocation after service reconstruction",
    async (kind) => {
      const envelope = await signed();
      expect((await send(envelope)).statusCode).toBe(200);
      if (kind === "permission") await setPermission(false);
      if (kind === "session")
        await identity.updateSession({
          ...(await identity.findSessionById(sessionId))!,
          revokedAt: new Date().toISOString(),
          revocationReason: "Fixture acceptance",
        });
      if (kind === "device")
        await identity.updateDevice({
          ...(await identity.findDeviceById(deviceId))!,
          trustStatus: "REVOKED",
          revokedAt: new Date().toISOString(),
        });
      const service = makeService();
      await expect(
        scoped(() => service.execute(context(), body)),
      ).rejects.toBeDefined();
      const next = await signed();
      expect((await send(next)).statusCode).toBeGreaterThanOrEqual(400);
      expect(await completed(next.commandId)).toHaveLength(0);
    },
  );

  it("preserves exact approval digest and expiry without allowing approvals to elevate this read-only slice", async () => {
    const tool = (await governance.findToolByName(MCP_POLICY_TOOL))!;
    await database.pool.query("UPDATE tool_registry SET record=$2 WHERE name=$1", [
      MCP_POLICY_TOOL,
      { ...tool, approvalRequirement: "explicit" },
    ]);
    const c = context();
    const service = makeService();
    await scoped(async () => {
      await expect(service.execute(c, body)).rejects.toMatchObject({
        code: "MCP_POLICY_DENIED",
      });
      const pending = (await governance.listApprovals(ownerId, "PENDING"))[0]!;
      expect(pending.actionDigest).toBe(digestProposedAction(pending.action));
      const approvals = new ApprovalService(governance, audit);
      expect(
        await approvals.findMatchingApproved(ownerId, {
          ...pending.action,
          workspaceId: "foreign.project",
        }),
      ).toBeUndefined();
      await governance.updateApproval({
        ...pending,
        status: "APPROVED",
        decidedAt: new Date().toISOString(),
        decidedBySessionId: sessionId,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      });
      expect(
        (await approvals.findMatchingApproved(ownerId, pending.action))?.status,
      ).toBe("EXPIRED");
      await expect(service.execute(c, body)).rejects.toMatchObject({
        code: "MCP_POLICY_DENIED",
      });
      expect(await completed(c.operationId)).toHaveLength(0);
    });
  });

  it.each(["stop", "permission", "session", "cancel", "timeout"] as const)(
    "cancels real stdio at a deterministic pre-call barrier after %s and cleans up its child",
    async (kind) => {
      let entered!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const transport = createLocalFixtureTransport();
      const client = new McpProtocolClient(transport);
      const service = makeService(() => ({
        async execute(operation, input, signal, before) {
          let step = 0;
          return client.execute(operation, input, signal, async () => {
            await before?.();
            if (++step === 3) {
              entered();
              await new Promise<void>((resolve) =>
                signal.addEventListener("abort", () => resolve(), { once: true }),
              );
              signal.throwIfAborted();
            }
          });
        },
        close: () => client.close(),
      }));
      const c = context();
      const abort = new AbortController();
      const result = scoped(() => service.execute(c, body, abort.signal));
      // Observe rejection immediately, before mutating the deterministic barrier state.
      const denied = expect(result).rejects.toBeDefined();
      await reached;
      expect(transport.running).toBe(true);
      if (kind === "stop")
        await governance.activateEmergencyStop(new Date().toISOString());
      if (kind === "permission") await setPermission(false);
      if (kind === "session")
        await identity.updateSession({
          ...(await identity.findSessionById(sessionId))!,
          revokedAt: new Date().toISOString(),
          revocationReason: "Fixture acceptance",
        });
      if (kind === "cancel") abort.abort();
      await denied;
      expect(transport.running).toBe(false);
      expect(await completed(c.operationId)).toHaveLength(0);
      if (kind !== "cancel" && kind !== "timeout")
        await expect(
          scoped(() => service.execute(context(), body)),
        ).rejects.toBeDefined();
    },
  );

  it("reapplying the additive provider SQL preserves all existing provider records and rejects unknown providers", async () => {
    // Both constraints are executed against disposable synthetic data only.
    // Chronological pre-MCP migration acceptance is covered separately below.
    await scoped(async () => {
      const old = (
        await database.pool.query(
          "SELECT id,provider,record FROM integrations WHERE provider <> 'mcp_local' ORDER BY id",
        )
      ).rows;
      const sql = await readFile(
        "apps/api/migrations/0118_mcp_local_fixture_provider.sql",
        "utf8",
      );
      await database.pool.query(sql);
      expect(
        (
          await database.pool.query(
            "SELECT id,provider,record FROM integrations WHERE provider <> 'mcp_local' ORDER BY id",
          )
        ).rows,
      ).toEqual(old);
      const mcp = (
        await database.pool.query<{ record: unknown }>(
          "SELECT record FROM integrations WHERE provider='mcp_local'",
        )
      ).rows[0]!;
      expect(mcp).toBeDefined();
      await expect(
        database.pool.query(
          "UPDATE integrations SET provider='unknown_provider' WHERE provider='mcp_local'",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});

class BeforeMcpDatabase extends PostgresDatabase {
  override async migrationFiles() {
    return (await super.migrationFiles()).filter(
      (file) => file.version !== "0118_mcp_local_fixture_provider",
    );
  }
}

describe.skipIf(!url)("MCP-1B chronological existing-data migration", () => {
  it("migrates the real pre-0118 schema with existing integrations without rewriting records or broadening unknown providers", async () => {
    const admin = new PostgresDatabase(url!);
    const schema = `mcp_upgrade_${crypto.randomUUID().replaceAll("-", "")}`;
    await admin.pool.query(`CREATE SCHEMA "${schema}"`);
    const isolated = new URL(url!);
    isolated.searchParams.set("options", `-c search_path=${schema}`);
    const before = new BeforeMcpDatabase(isolated.toString());
    const after = new PostgresDatabase(isolated.toString());
    try {
      await before.migrate();
      const at = new Date().toISOString(),
        ownerId = crypto.randomUUID();
      const identity = new PostgresIdentityStore(before.pool);
      await identity.createUser({
        id: ownerId,
        email: "migration-fixture@example.invalid",
        displayName: "Migration fixture",
        passwordHash: "unused-fixture-hash",
        createdAt: at,
        updatedAt: at,
        lastLoginAt: null,
        accountStatus: "ACTIVE",
      });
      const company = await new CompanyService(
        new PostgresCompanyStore(before.pool),
        identity,
      ).ensureDefault(ownerId);
      await companyScope.run(
        {
          ownerId,
          companyId: company.id,
          role: "OWNER",
          requestId: crypto.randomUUID(),
        },
        async () => {
          const store = new PostgresIntegrationStore(before.pool);
          const record = {
            schemaVersion: "1" as const,
            id: "migration.github",
            ownerId,
            provider: "github" as const,
            category: "git_provider" as const,
            displayName: "Synthetic existing integration",
            version: "1.0.0",
            status: "installed" as const,
            installedAt: at,
            updatedAt: at,
            disabledAt: null,
            configuration: {},
            supportedAuth: ["local_app" as const],
            healthSummary: "Synthetic fixture",
          };
          await store.upsertIntegration(record);
          await expect(
            store.upsertIntegration({
              ...record,
              id: "migration.mcp",
              provider: "mcp_local",
            }),
          ).rejects.toMatchObject({ code: "23514" });
          const prior = await before.pool.query(
            "SELECT id,provider,record,company_id FROM integrations ORDER BY id",
          );
          await after.migrate();
          expect((await after.status()).state).toBe("current");
          expect(
            (
              await after.pool.query(
                "SELECT id,provider,record,company_id FROM integrations ORDER BY id",
              )
            ).rows,
          ).toEqual(prior.rows);
          await new PostgresIntegrationStore(after.pool).upsertIntegration({
            ...record,
            id: "migration.mcp",
            provider: "mcp_local",
          });
          await expect(
            after.pool.query(
              "UPDATE integrations SET provider='unknown' WHERE id='migration.mcp'",
            ),
          ).rejects.toMatchObject({ code: "23514" });
        },
      );
    } finally {
      await before.close();
      await after.close();
      await admin.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.close();
    }
  }, 60_000);
});
