import { describe, expect, it, vi } from "vitest";
import {
  CreateWorkspaceRequestSchema,
  MCP_PROTOCOL_VERSION,
  MCP_STATUS_TOOL,
} from "@alexa-control/shared";
import { companyScope } from "../companies/scope.js";
import { CompanyService } from "../companies/service.js";
import { InMemoryCompanyStore } from "../companies/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { RegistryService } from "../governance/registry-service.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RiskEngine } from "../governance/risk-engine.js";
import {
  ApprovalService,
  type GovernanceAuditInput,
} from "../governance/approval-service.js";
import { IntegrationRegistryService } from "../integrations/service.js";
import { InMemoryIntegrationStore } from "../integrations/store.js";
import { McpLocalService } from "./service.js";

const setup = async (options: { enabled?: boolean; nodeEnvironment?: string } = {}) => {
  const ownerId = crypto.randomUUID(),
    sessionId = crypto.randomUUID(),
    deviceId = crypto.randomUUID();
  const at = new Date().toISOString(),
    expiry = new Date(Date.now() + 60_000).toISOString();
  const identity = new InMemoryIdentityStore();
  identity.createUser({
    id: ownerId,
    email: "fixture@example.invalid",
    displayName: "Fixture",
    passwordHash: "unused-fixture-hash",
    createdAt: at,
    updatedAt: at,
    lastLoginAt: null,
    accountStatus: "ACTIVE",
  });
  identity.createSession({
    id: sessionId,
    userId: ownerId,
    tokenHash: "fixture-hash",
    createdAt: at,
    expiresAt: expiry,
    idleExpiresAt: expiry,
    absoluteExpiresAt: expiry,
    lastSeenAt: at,
    revokedAt: null,
    revocationReason: null,
    ipAddress: "127.0.0.1",
    userAgent: "fixture",
  });
  identity.createDevice({
    id: deviceId,
    ownerId,
    deviceName: "Fixture",
    deviceType: "MAC_AGENT",
    trustStatus: "TRUSTED",
    publicKey: { kty: "OKP", crv: "Ed25519", x: "a".repeat(43) },
    fingerprint: "fixture-public-fingerprint",
    pairingRequestTokenHash: "fixture-hash",
    pairedAt: at,
    createdAt: at,
    lastSeen: null,
    revokedAt: null,
    capabilities: [],
    metadata: {},
  });
  const companies = new CompanyService(new InMemoryCompanyStore(), identity);
  const company = await companies.ensureDefault(ownerId);
  const scope = {
    ownerId,
    companyId: company.id,
    role: "OWNER" as const,
    requestId: crypto.randomUUID(),
  };
  const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
  const events: GovernanceAuditInput[] = [];
  const audit = vi.fn((e: GovernanceAuditInput) => {
    events.push(e);
  });
  const integrations = new IntegrationRegistryService(
    new InMemoryIntegrationStore(),
    audit,
  );
  const registry = new RegistryService(governance);
  await companyScope.run(scope, async () => {
    await registry.createWorkspace(
      ownerId,
      CreateWorkspaceRequestSchema.parse({
        id: "project.fixture",
        displayName: "Fixture",
        rootPath: "/workspace/fixture",
        enabled: true,
        permissions: { read: true },
      }),
    );
    await integrations.setPermission({
      ownerId,
      integrationId: "mcp_local_fixture",
      capabilityId: "mcp.local_fixture.read",
      grant: true,
      requestId: scope.requestId,
      ipAddress: "127.0.0.1",
    });
  });
  const session = {
    execute: vi.fn(() =>
      Promise.resolve({
        status: "ok" as const,
        readOnly: true as const,
        protocolVersion: MCP_PROTOCOL_VERSION,
      }),
    ),
    close: vi.fn(async () => {}),
  };
  const factory = vi.fn(() => session);
  const policy = new PolicyEngine(
    governance,
    new RiskEngine(),
    new ApprovalService(governance, audit),
    audit,
  );
  const service = new McpLocalService({
    enabled: options.enabled ?? true,
    nodeEnvironment: options.nodeEnvironment ?? "test",
    identity,
    companies,
    governance,
    policy,
    integrations,
    audit,
    factory,
    timeoutMs: 100,
  });
  const context = {
    ...scope,
    sessionId,
    deviceId,
    operationId: crypto.randomUUID(),
    networkVerification: "PRIVATE_NETWORK" as const,
    ipAddress: "127.0.0.1",
  };
  const body = {
    workspaceId: "project.fixture",
    serverId: "athena.local.fixture",
    toolName: MCP_STATUS_TOOL,
    input: { probe: "health" },
    operation: "read_status",
  };
  const run = (payload: unknown = body, signal?: AbortSignal) =>
    companyScope.run(scope, () => service.execute(context, payload, signal));
  return {
    ownerId,
    scope,
    context,
    body,
    identity,
    companies,
    governance,
    integrations,
    events,
    audit,
    session,
    factory,
    service,
    run,
  };
};

describe("governed MCP local service", () => {
  it("uses existing policy and company permission and emits safe attributable events", async () => {
    const s = await setup();
    await expect(s.run()).resolves.toMatchObject({
      operationId: s.context.operationId,
      result: { status: "ok" },
    });
    expect(s.session.execute).toHaveBeenCalledTimes(1);
    expect(s.events.some((e) => e.eventType === "POLICY_EVALUATED")).toBe(true);
    expect(
      s.events.some(
        (e) =>
          e.eventType === "INTEGRATION_OPERATION_COMPLETED" &&
          e.companyId === s.scope.companyId &&
          e.deviceId === s.context.deviceId,
      ),
    ).toBe(true);
    expect(JSON.stringify(s.events)).not.toMatch(
      /tokenHash|privateKey|rootPath|structuredContent|probe/,
    );
  });

  it.each(["permission", "device", "session", "workspace", "company", "tool", "stop"])(
    "denies revoked/disabled %s before starting transport",
    async (kind) => {
      const s = await setup();
      await companyScope.run(s.scope, async () => {
        if (kind === "permission")
          await s.integrations.setPermission({
            ownerId: s.ownerId,
            integrationId: "mcp_local_fixture",
            capabilityId: "mcp.local_fixture.read",
            grant: false,
            requestId: s.context.requestId,
            ipAddress: "127.0.0.1",
          });
        if (kind === "device") {
          const d = s.identity.findDeviceById(s.context.deviceId)!;
          s.identity.updateDevice({ ...d, trustStatus: "REVOKED" });
        }
        if (kind === "session") {
          const v = s.identity.findSessionById(s.context.sessionId)!;
          s.identity.updateSession({ ...v, revokedAt: new Date().toISOString() });
        }
        if (kind === "workspace") {
          const w = s.governance.findWorkspaceById("project.fixture")!;
          s.governance.updateWorkspace({ ...w, enabled: false });
        }
        if (kind === "company") {
          const c = await s.companies.store.findCompany(s.ownerId, s.scope.companyId);
          await s.companies.store.updateCompany({ ...c!, status: "PAUSED" });
        }
        if (kind === "tool")
          vi.spyOn(s.governance, "findToolByName").mockReturnValue(undefined);
        if (kind === "stop")
          s.governance.activateEmergencyStop(new Date().toISOString());
      });
      await expect(s.run()).rejects.toBeDefined();
      expect(s.factory).not.toHaveBeenCalled();
      expect(s.events.some((e) => e.eventType === "INTEGRATION_OPERATION_DENIED")).toBe(
        true,
      );
    },
  );

  it("rejects foreign company, missing context, unknown tool and caller authorization fields", async () => {
    const s = await setup();
    await expect(s.service.execute(s.context, s.body)).rejects.toBeDefined();
    await expect(
      companyScope.run({ ...s.scope, companyId: crypto.randomUUID() }, () =>
        s.service.execute(s.context, s.body),
      ),
    ).rejects.toBeDefined();
    await expect(s.run({ ...s.body, toolName: "run_shell" })).rejects.toBeDefined();
    await expect(
      s.run({ ...s.body, risk: "read_only", approval: true }),
    ).rejects.toBeDefined();
    expect(s.factory).not.toHaveBeenCalled();
  });

  it("does not weaken a stronger permission or policy approval requirement", async () => {
    const s = await setup();
    await companyScope.run(s.scope, async () => {
      const p = await s.integrations.store.findPermission(
        s.ownerId,
        "mcp_local_fixture",
        "mcp.local_fixture.read",
      );
      await s.integrations.store.savePermission({ ...p!, approvalRequired: true });
    });
    await expect(s.run()).rejects.toBeDefined();
    expect(s.factory).not.toHaveBeenCalled();
  });

  it("denies duplicate operation IDs using the existing persistent nonce boundary", async () => {
    const s = await setup();
    await s.run();
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_REPLAY" });
    expect(s.factory).toHaveBeenCalledTimes(1);
  });

  it("suppresses success when stop is asserted during exchange", async () => {
    const s = await setup();
    s.session.execute.mockImplementation(() => {
      s.governance.activateEmergencyStop(new Date().toISOString());
      return Promise.resolve({
        status: "ok",
        readOnly: true,
        protocolVersion: MCP_PROTOCOL_VERSION,
      });
    });
    await expect(s.run()).rejects.toBeDefined();
    expect(
      s.events.some((e) => e.eventType === "INTEGRATION_OPERATION_COMPLETED"),
    ).toBe(false);
  });

  it("times out a non-cooperating transport and releases its concurrency slot", async () => {
    const s = await setup();
    s.session.execute.mockImplementation(() => new Promise(() => {}));
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_TIMEOUT" });
    expect(s.session.close).toHaveBeenCalled();
    s.context.operationId = crypto.randomUUID();
    s.session.execute.mockResolvedValue({
      status: "ok",
      readOnly: true,
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
    await expect(s.run()).resolves.toBeDefined();
  });

  it("cancels a non-cooperating exchange and supports service shutdown", async () => {
    const s = await setup();
    s.session.execute.mockImplementation(() => new Promise(() => {}));
    const abort = new AbortController();
    const running = s.run(s.body, abort.signal);
    abort.abort();
    await expect(running).rejects.toMatchObject({ code: "MCP_CANCELLED" });
    s.context.operationId = crypto.randomUUID();
    const next = s.run();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await s.service.close();
    await expect(next).rejects.toBeDefined();
    await expect(s.run()).rejects.toBeDefined();
  });

  it("fails closed on missing security state or audit persistence", async () => {
    const s = await setup();
    vi.spyOn(s.governance, "getSecurityState").mockImplementation(() => {
      throw new Error("private-db-error");
    });
    await expect(s.run()).rejects.toBeDefined();
    expect(s.factory).not.toHaveBeenCalled();
    const a = await setup();
    a.audit.mockImplementation(() => {
      throw new Error("private-db-error");
    });
    await expect(a.run()).rejects.toBeDefined();
    expect(a.factory).not.toHaveBeenCalled();
  });

  it("denies disabled fixture and prohibits production enablement", async () => {
    const s = await setup({ enabled: false });
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_UNAVAILABLE" });
    expect(s.factory).not.toHaveBeenCalled();
    await expect(setup({ nodeEnvironment: "production" })).rejects.toMatchObject({
      code: "MCP_FIXTURE_PRODUCTION_PROHIBITED",
    });
  });

  it("denies expired authorization, unknown network and unavailable workspace", async () => {
    const s = await setup();
    const session = s.identity.findSessionById(s.context.sessionId)!;
    s.identity.updateSession({ ...session, idleExpiresAt: new Date(0).toISOString() });
    await expect(s.run()).rejects.toBeDefined();
    s.identity.updateSession(session);
    await expect(
      companyScope.run(s.scope, () =>
        s.service.execute({ ...s.context, networkVerification: "UNKNOWN" }, s.body),
      ),
    ).rejects.toBeDefined();
    await expect(
      s.run({ ...s.body, workspaceId: "foreign.project" }),
    ).rejects.toBeDefined();
    expect(s.factory).not.toHaveBeenCalled();
  });

  it("retains stronger policy approval and denies disabled integration", async () => {
    const s = await setup();
    const original = s.governance.findToolByName.bind(s.governance);
    const spy = vi.spyOn(s.governance, "findToolByName").mockImplementation((name) => {
      const t = original(name);
      return t ? { ...t, approvalRequirement: "explicit" } : undefined;
    });
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_POLICY_DENIED" });
    spy.mockRestore();
    await companyScope.run(s.scope, () =>
      s.integrations.disable({
        ownerId: s.ownerId,
        integrationId: "mcp_local_fixture",
        requestId: s.context.requestId,
        ipAddress: "127.0.0.1",
      }),
    );
    await expect(s.run()).rejects.toBeDefined();
    expect(s.factory).not.toHaveBeenCalled();
  });

  it("rejects competing operations and cancels active work on permission revocation", async () => {
    const s = await setup();
    s.session.execute.mockImplementation(() => new Promise(() => {}));
    const pending = s.run();
    const observed = expect(pending).rejects.toMatchObject({
      code: "MCP_AUTHORIZATION_CHANGED",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_RESOURCE_LIMIT" });
    await companyScope.run(s.scope, () =>
      s.integrations.setPermission({
        ownerId: s.ownerId,
        integrationId: "mcp_local_fixture",
        capabilityId: "mcp.local_fixture.read",
        grant: false,
        requestId: s.context.requestId,
        ipAddress: "127.0.0.1",
      }),
    );
    await observed;
    expect(s.session.close).toHaveBeenCalled();
  });

  it("enforces the configured resource rate ceiling without a second transport", async () => {
    const s = await setup();
    await companyScope.run(s.scope, async () => {
      const p = await s.integrations.store.findPermission(
        s.ownerId,
        "mcp_local_fixture",
        "mcp.local_fixture.read",
      );
      await s.integrations.store.savePermission({ ...p!, rateLimitPerMinute: 1 });
    });
    await s.run();
    s.context.operationId = crypto.randomUUID();
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_RESOURCE_LIMIT" });
    expect(s.factory).toHaveBeenCalledTimes(1);
  });

  it("does not return success when completion audit persistence fails", async () => {
    const s = await setup();
    s.audit.mockImplementation((e) => {
      if (e.eventType === "INTEGRATION_OPERATION_COMPLETED")
        throw new Error("fixture storage failure");
      s.events.push(e);
    });
    await expect(s.run()).rejects.toMatchObject({ code: "MCP_AUDIT_UNAVAILABLE" });
    expect(s.events.some((e) => e.eventType === "INTEGRATION_OPERATION_FAILED")).toBe(
      true,
    );
  });
});
