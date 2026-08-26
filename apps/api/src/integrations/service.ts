import {
  IntegrationDashboardResponseSchema,
  IntegrationHealthResponseSchema,
  IntegrationOperationListResponseSchema,
  IntegrationOperationRequestSchema,
  IntegrationOperationResponseSchema,
  IntegrationPermissionListResponseSchema,
  IntegrationRecordSchema,
  type IntegrationOperationRequest,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApprovalService } from "../governance/approval-service.js";
import { ExecutionError } from "../execution/errors.js";
import { BUILT_IN_INTEGRATIONS, builtInCapabilities } from "./builtins.js";
import type { IntegrationStore } from "./store.js";
import { BusinessOperationsRuntime, type AgentBusinessAuthorityVerifier, type BusinessOutcomeSinks } from "./business-runtime.js";
import type { ReviewedBusinessProvider } from "./business-providers.js";

export class IntegrationRegistryService {
  #business?:BusinessOperationsRuntime;
  constructor(
    readonly store: IntegrationStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  enableBusinessOperations(approvals:ApprovalService){this.#business=new BusinessOperationsRuntime(this.store,approvals,this.audit,this.now);return this.#business;}
  setBusinessProvider(provider:ReviewedBusinessProvider){this.requireBusiness().setProvider(provider);}
  setBusinessOutcomeSinks(sinks:BusinessOutcomeSinks){this.requireBusiness().setOutcomeSinks(sinks);}
  setAgentBusinessAuthorityVerifier(verifier:AgentBusinessAuthorityVerifier){this.requireBusiness().setAgentAuthorityVerifier(verifier);}
  async businessDashboard(ownerId:string){await this.ensureBuiltIns(ownerId);return this.requireBusiness().dashboard(ownerId);}
  async requestBusinessAction(input:{ownerId:string;body:unknown;requestId:string;ipAddress:string}){await this.ensureBuiltIns(input.ownerId,input.requestId);return this.requireBusiness().request(input);}
  async reconcileBusinessAction(input:{ownerId:string;executionId:string;requestId:string;ipAddress:string}){return this.requireBusiness().reconcile(input);}
  async ingestBusinessWebhook(input:{ownerId:string;body:unknown;signature:string;timestamp:string;secret:string;requestId:string;ipAddress:string}){await this.ensureBuiltIns(input.ownerId,input.requestId);return this.requireBusiness().ingestWebhook(input);}
  async saveBusinessCheckpoint(ownerId:string,integrationId:string,stream:string,cursor:string,sourceTimestamp:string|null){return this.requireBusiness().checkpoint(ownerId,integrationId,stream,cursor,sourceTimestamp);}

  async ensureBuiltIns(ownerId: string, requestId = "system") {
    const at = this.now().toISOString();
    const existing = new Set(
      (await this.store.listIntegrations(ownerId)).map((integration) => integration.id),
    );
    for (const builtin of BUILT_IN_INTEGRATIONS) {
      if (existing.has(builtin.id)) continue;
      await this.store.upsertIntegration(
        IntegrationRecordSchema.parse({
          schemaVersion: "1",
          id: builtin.id,
          ownerId,
          provider: builtin.provider,
          category: builtin.category,
          displayName: builtin.displayName,
          version: builtin.version,
          status: "installed",
          installedAt: at,
          updatedAt: at,
          disabledAt: null,
          configuration: {},
          supportedAuth: builtin.supportedAuth,
          healthSummary: builtin.healthSummary,
        }),
      );
      await this.store.saveHealth({
        integrationId: builtin.id,
        state: "unknown",
        checkedAt: at,
        latencyMs: null,
        reasonCode: "CREDENTIALS_NOT_CONFIGURED",
        credentialStatus: builtin.provider === "vscode" ? "configured" : "missing",
        rateLimitRemaining: null,
      });
      await this.audit({
        eventType: "INTEGRATION_INSTALLED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: `${builtin.displayName} integration descriptor installed.`,
        requestId,
        metadata: { integrationId: builtin.id, provider: builtin.provider },
      });
    }
  }

  capabilities() {
    return builtInCapabilities();
  }

  async dashboard(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    return IntegrationDashboardResponseSchema.parse({
      integrations: await this.store.listIntegrations(ownerId),
      capabilities: this.capabilities(),
      permissions: await this.store.listPermissions(ownerId),
      health: await this.store.listHealth(ownerId),
      usage: await this.store.listUsage(ownerId),
      operations: await this.store.listOperations(ownerId, 50),
    });
  }

  async list(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    return this.store.listIntegrations(ownerId);
  }

  async health(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    return IntegrationHealthResponseSchema.parse({
      health: await this.store.listHealth(ownerId),
    });
  }

  async permissions(ownerId: string) {
    await this.ensureBuiltIns(ownerId);
    return IntegrationPermissionListResponseSchema.parse(
      await this.store.listPermissions(ownerId),
    );
  }

  async operations(ownerId: string) {
    return IntegrationOperationListResponseSchema.parse(
      await this.store.listOperations(ownerId, 100),
    );
  }

  async setPermission(input: {
    ownerId: string;
    integrationId: string;
    capabilityId: string;
    grant: boolean;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltIns(input.ownerId, input.requestId);
    const integration = await this.requireIntegration(
      input.ownerId,
      input.integrationId,
    );
    const capability = this.requireCapability(input.integrationId, input.capabilityId);
    const at = this.now().toISOString();
    const existing = await this.store.findPermission(
      input.ownerId,
      input.integrationId,
      input.capabilityId,
    );
    const permission = {
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      integrationId: integration.id,
      capabilityId: capability.id,
      state: input.grant ? "granted" : "revoked",
      approvalRequired: capability.approvalRequired,
      rateLimitPerMinute: capability.risk === "high" ? 5 : 30,
      grantedAt: existing?.grantedAt ?? at,
      updatedAt: at,
    } as const;
    await this.store.savePermission(permission);
    await this.audit({
      eventType: input.grant
        ? "INTEGRATION_PERMISSION_GRANTED"
        : "INTEGRATION_PERMISSION_REVOKED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `${input.grant ? "Granted" : "Revoked"} ${capability.id}.`,
      requestId: input.requestId,
      metadata: { integrationId: integration.id, capabilityId: capability.id },
    });
    return IntegrationPermissionListResponseSchema.parse(
      await this.store.listPermissions(input.ownerId),
    );
  }

  async disable(input: {
    ownerId: string;
    integrationId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const integration = await this.requireIntegration(
      input.ownerId,
      input.integrationId,
    );
    const at = this.now().toISOString();
    await this.store.upsertIntegration({
      ...integration,
      status: "disabled",
      disabledAt: at,
      updatedAt: at,
    });
    await this.audit({
      eventType: "INTEGRATION_DISABLED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: `${integration.displayName} disabled.`,
      requestId: input.requestId,
      metadata: { integrationId: integration.id },
    });
    return this.dashboard(input.ownerId);
  }

  async requestOperation(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBuiltIns(input.ownerId, input.requestId);
    const parsed: IntegrationOperationRequest = IntegrationOperationRequestSchema.parse(
      input.body,
    );
    const integration = await this.requireIntegration(
      input.ownerId,
      parsed.integrationId,
    );
    const capability = this.requireCapability(
      parsed.integrationId,
      parsed.capabilityId,
    );
    const permission = await this.store.findPermission(
      input.ownerId,
      parsed.integrationId,
      parsed.capabilityId,
    );
    const denied =
      integration.status === "disabled" ||
      !permission ||
      permission.state !== "granted" ||
      !capability.operations.includes(parsed.operation);
    const approvalRequired = capability.approvalRequired || !parsed.dryRun;
    const at = this.now().toISOString();
    const operation = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      integrationId: parsed.integrationId,
      capabilityId: parsed.capabilityId,
      operation: parsed.operation,
      target: parsed.target,
      reason: parsed.reason,
      dryRun: parsed.dryRun,
      status: denied ? "DENIED" : approvalRequired ? "WAITING_APPROVAL" : "COMPLETED",
      approvalRequired,
      policyDecision: denied
        ? "deny"
        : approvalRequired
          ? "approval_required"
          : "allow",
      resultSummary: denied
        ? "Operation denied by integration permission policy."
        : approvalRequired
          ? "Operation recorded and waiting for the existing approval engine."
          : "Dry-run/read-only operation accepted. Live third-party execution is not enabled.",
      requestedAt: at,
      updatedAt: at,
      parameters: parsed.parameters,
    } as const;
    await this.store.saveOperation(operation);
    await this.store.incrementUsage({
      ownerId: input.ownerId,
      integrationId: parsed.integrationId,
      denied,
      at,
    });
    await this.audit({
      eventType: denied
        ? "INTEGRATION_OPERATION_DENIED"
        : approvalRequired
          ? "INTEGRATION_OPERATION_APPROVAL_REQUIRED"
          : "INTEGRATION_OPERATION_COMPLETED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: denied ? "DENIED" : "SUCCESS",
      reason: operation.resultSummary,
      requestId: input.requestId,
      metadata: {
        integrationId: parsed.integrationId,
        capabilityId: parsed.capabilityId,
        operation: parsed.operation,
        dryRun: parsed.dryRun,
      },
    });
    return IntegrationOperationResponseSchema.parse({ operation });
  }

  private async requireIntegration(ownerId: string, integrationId: string) {
    const integration = await this.store.findIntegration(ownerId, integrationId);
    if (!integration)
      throw new ExecutionError(
        404,
        "INTEGRATION_NOT_FOUND",
        "Integration was not found.",
      );
    return integration;
  }

  private requireCapability(integrationId: string, capabilityId: string) {
    const capability = this.capabilities().find(
      (candidate) =>
        candidate.integrationId === integrationId && candidate.id === capabilityId,
    );
    if (!capability)
      throw new ExecutionError(
        404,
        "INTEGRATION_CAPABILITY_NOT_FOUND",
        "Integration capability was not found.",
      );
    return capability;
  }

  private requireBusiness(){if(!this.#business)throw new ExecutionError(503,"BUSINESS_OPERATIONS_NOT_CONFIGURED","The governed business operations runtime is not configured.");return this.#business;}
}
