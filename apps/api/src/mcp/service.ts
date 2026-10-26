import {
  MCP_CAPABILITY_ID,
  MCP_INTEGRATION_ID,
  MCP_POLICY_TOOL,
  McpLocalRequestSchema,
  McpLocalResponseSchema,
  type McpLocalRequest,
  type NetworkVerificationState,
} from "@alexa-control/shared";
import { companyScope } from "../companies/scope.js";
import type { CompanyService } from "../companies/service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { GovernanceStore } from "../governance/store.js";
import type { PolicyEngine } from "../governance/policy-engine.js";
import type { IdentityStore } from "../identity/store.js";
import type { IntegrationRegistryService } from "../integrations/service.js";
import { McpLocalError } from "./errors.js";
import type { McpSession, McpSessionFactory } from "./protocol.js";

/** Internal context assembled only by authenticated signed-request middleware. */
export interface McpCallContext {
  ownerId: string;
  companyId: string;
  sessionId: string;
  deviceId: string;
  operationId: string;
  networkVerification: NetworkVerificationState;
  requestId: string;
  ipAddress: string;
}

interface Dependencies {
  enabled: boolean;
  nodeEnvironment: string;
  identity: IdentityStore;
  companies: CompanyService;
  governance: GovernanceStore;
  policy: PolicyEngine;
  integrations: IntegrationRegistryService;
  audit: GovernanceAuditWriter;
  factory: McpSessionFactory;
  timeoutMs?: number;
}
const validUntil = (value: string) =>
  Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();

/** Finite integration adapter; it does not register or execute arbitrary tools. */
export class McpLocalService {
  private active: { controller: AbortController; done: Promise<void> } | undefined;
  private stopped = false;
  private starts: number[] = [];
  constructor(private readonly deps: Dependencies) {
    if (deps.enabled && deps.nodeEnvironment === "production")
      throw new McpLocalError("MCP_FIXTURE_PRODUCTION_PROHIBITED");
    if (
      deps.timeoutMs !== undefined &&
      (!Number.isInteger(deps.timeoutMs) ||
        deps.timeoutMs < 10 ||
        deps.timeoutMs > 5_000)
    )
      throw new McpLocalError("MCP_INVALID_BUDGET");
  }

  async execute(context: McpCallContext, body: unknown, signal?: AbortSignal) {
    let session: McpSession | undefined;
    let finish: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watcher: ReturnType<typeof setInterval> | undefined;
    let detach: (() => void) | undefined;
    const controller = new AbortController();
    let abortCode = "MCP_CANCELLED";
    let claimed = false;
    try {
      await this.record(
        context,
        "INTEGRATION_OPERATION_REQUESTED",
        "SUCCESS",
        "MCP_REQUESTED",
      );
      const parsed = McpLocalRequestSchema.safeParse(body);
      if (!parsed.success) throw new McpLocalError("MCP_INVALID_REQUEST", 400);
      const request = parsed.data;
      if (!this.deps.enabled || this.stopped)
        throw new McpLocalError("MCP_UNAVAILABLE", 503);
      if (signal?.aborted) throw new McpLocalError("MCP_CANCELLED", 409);
      // Claim before any yielding authorization/transport work; one host process
      // owns at most one bounded fixture operation across all company scopes.
      if (this.active) throw new McpLocalError("MCP_RESOURCE_LIMIT", 429);
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      this.active = { controller, done };
      claimed = true;
      let policyEvaluationId = await this.authorize(context, request);
      const permission = await this.deps.integrations.store.findPermission(
        context.ownerId,
        MCP_INTEGRATION_ID,
        MCP_CAPABILITY_ID,
      );
      const now = Date.now();
      this.starts = this.starts.filter((at) => at > now - 60_000);
      if (
        !permission ||
        this.starts.length >= Math.min(30, permission.rateLimitPerMinute)
      )
        throw new McpLocalError("MCP_RESOURCE_LIMIT", 429);
      if (
        !(await this.deps.identity.consumeNonce(
          context.deviceId,
          `mcp:${context.operationId}`,
          new Date(now + 60_000),
          new Date(now),
        ))
      )
        throw new McpLocalError("MCP_REPLAY", 409);
      this.starts.push(now);
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      detach = () => signal?.removeEventListener("abort", cancel);
      if (signal?.aborted) controller.abort();
      timer = setTimeout(() => {
        abortCode = "MCP_TIMEOUT";
        controller.abort();
      }, this.deps.timeoutMs ?? 5_000);
      let checking = false;
      watcher = setInterval(() => {
        if (checking || controller.signal.aborted) return;
        checking = true;
        void this.assertCurrent(context, request)
          .catch(() => {
            abortCode = "MCP_AUTHORIZATION_CHANGED";
            controller.abort();
          })
          .finally(() => {
            checking = false;
          });
      }, 25);
      const aborted = new Promise<never>((_resolve, reject) => {
        const deny = () => reject(new McpLocalError(abortCode, 409));
        if (controller.signal.aborted) deny();
        else controller.signal.addEventListener("abort", deny, { once: true });
      });
      session = this.deps.factory();
      const beforeOperation = async () => {
        controller.signal.throwIfAborted();
        policyEvaluationId = await this.authorize(context, request);
        controller.signal.throwIfAborted();
      };
      const result = await Promise.race([
        session.execute(
          request.operation,
          request.input,
          controller.signal,
          beforeOperation,
        ),
        aborted,
      ]);
      await beforeOperation();
      const response = McpLocalResponseSchema.parse({
        operationId: context.operationId,
        policyEvaluationId,
        trust: "UNTRUSTED_DATA",
        result,
      });
      try {
        await session.close();
      } catch {
        throw new McpLocalError("MCP_CLEANUP_FAILED", 503);
      }
      session = undefined;
      await this.assertCurrent(context, request);
      await this.record(
        context,
        "INTEGRATION_OPERATION_COMPLETED",
        "SUCCESS",
        "MCP_COMPLETED",
      );
      return response;
    } catch (error) {
      const normalized = controller.signal.aborted
        ? new McpLocalError(abortCode, 409)
        : error instanceof McpLocalError
          ? error
          : new McpLocalError("MCP_STATE_UNAVAILABLE", 503);
      await this.record(
        context,
        normalized.statusCode >= 500
          ? "INTEGRATION_OPERATION_FAILED"
          : "INTEGRATION_OPERATION_DENIED",
        "DENIED",
        normalized.code,
      );
      throw normalized;
    } finally {
      if (timer) clearTimeout(timer);
      if (watcher) clearInterval(watcher);
      detach?.();
      try {
        await session?.close();
      } catch {
        await this.record(
          context,
          "INTEGRATION_OPERATION_FAILED",
          "DENIED",
          "MCP_CLEANUP_FAILED",
        );
      } finally {
        if (claimed) {
          this.active = undefined;
          finish?.();
        }
      }
    }
  }

  private async assertCurrent(c: McpCallContext, request: McpLocalRequest) {
    const current = companyScope.current(c.ownerId);
    if (!current || current.companyId !== c.companyId || this.stopped)
      throw new McpLocalError("MCP_SCOPE_DENIED");
    const [
      user,
      session,
      device,
      company,
      membership,
      workspace,
      integration,
      permission,
      security,
    ] = await Promise.all([
      this.deps.identity.findUserById(c.ownerId),
      this.deps.identity.findSessionById(c.sessionId),
      this.deps.identity.findDeviceById(c.deviceId),
      this.deps.companies.store.findCompany(c.ownerId, c.companyId),
      this.deps.companies.store.findMembership(c.ownerId, c.companyId),
      this.deps.governance.findWorkspaceById(request.workspaceId),
      this.deps.integrations.store.findIntegration(c.ownerId, MCP_INTEGRATION_ID),
      this.deps.integrations.store.findPermission(
        c.ownerId,
        MCP_INTEGRATION_ID,
        MCP_CAPABILITY_ID,
      ),
      this.deps.governance.getSecurityState(),
    ]);
    if (
      user?.accountStatus !== "ACTIVE" ||
      session?.userId !== c.ownerId ||
      session.revokedAt !== null ||
      !validUntil(session.expiresAt) ||
      !validUntil(session.idleExpiresAt) ||
      !validUntil(session.absoluteExpiresAt) ||
      device?.ownerId !== c.ownerId ||
      device.trustStatus !== "TRUSTED" ||
      device.revokedAt !== null ||
      company?.status !== "ACTIVE" ||
      company.ownerId !== c.ownerId ||
      membership?.status !== "ACTIVE" ||
      membership.role !== "OWNER" ||
      c.networkVerification !== "PRIVATE_NETWORK" ||
      !workspace?.enabled ||
      workspace.ownerId !== c.ownerId ||
      workspace.permissions.read !== true ||
      !integration ||
      integration.provider !== "mcp_local" ||
      integration.version !== "1.0.0" ||
      !["installed", "ready"].includes(integration.status) ||
      integration.disabledAt !== null ||
      permission?.state !== "granted" ||
      permission.approvalRequired !== false ||
      !Number.isInteger(permission.rateLimitPerMinute) ||
      permission.rateLimitPerMinute < 1 ||
      security.emergencyStopActive !== false
    )
      throw new McpLocalError("MCP_AUTHORIZATION_DENIED");
  }

  private async authorize(c: McpCallContext, request: McpLocalRequest) {
    await this.assertCurrent(c, request);
    const tool = await this.deps.governance.findToolByName(MCP_POLICY_TOOL);
    const workspace = await this.deps.governance.findWorkspaceById(request.workspaceId);
    const decision = await this.deps.policy.evaluate({
      ownerId: c.ownerId,
      sessionId: c.sessionId,
      deviceId: c.deviceId,
      deviceTrusted: true,
      signedEnvelopeVerified: true,
      networkVerification: c.networkVerification,
      recentAuthentication: false,
      action: {
        actionId: c.operationId,
        toolName: MCP_POLICY_TOOL,
        workspaceId: request.workspaceId,
        arguments: { operation: request.operation },
      },
      ...(tool ? { tool } : {}),
      ...(workspace ? { workspace } : {}),
      emergencyStopActive: (await this.deps.governance.getSecurityState())
        .emergencyStopActive,
      ipAddress: c.ipAddress,
      requestId: c.requestId,
    });
    if (
      decision.decision !== "allow" ||
      !["none", "session"].includes(decision.approvalRequirement) ||
      decision.riskLevel !== "read_only"
    )
      throw new McpLocalError("MCP_POLICY_DENIED");
    return decision.id;
  }

  private async record(
    c: McpCallContext,
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    outcome: "SUCCESS" | "DENIED",
    code: string,
  ) {
    try {
      await this.deps.audit({
        eventType,
        ownerId: c.ownerId,
        companyId: c.companyId,
        deviceId: c.deviceId,
        outcome,
        reason: "Governed local read-only MCP lifecycle.",
        requestId: c.requestId,
        ipAddress: c.ipAddress,
        metadata: {
          operationId: c.operationId,
          integrationId: MCP_INTEGRATION_ID,
          capabilityId: MCP_CAPABILITY_ID,
          code,
        },
      });
    } catch {
      throw new McpLocalError("MCP_AUDIT_UNAVAILABLE", 503);
    }
  }

  async close() {
    this.stopped = true;
    const active = this.active;
    active?.controller.abort();
    await active?.done;
  }
}
