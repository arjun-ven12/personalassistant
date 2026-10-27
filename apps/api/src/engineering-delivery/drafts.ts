import { createHash } from "node:crypto";
import {
  ENGINEERING_DRAFT_TOOL,
  EngineeringDraftCreateOperationSchema,
  EngineeringDraftResponseSchema,
  canonicalizeExecutionPayload,
  type EngineeringDraftCreateOperation,
  type NetworkVerificationState,
} from "@alexa-control/shared";
import { companyScope } from "../companies/scope.js";
import type { CompanyService } from "../companies/service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { GovernanceStore } from "../governance/store.js";
import type { PolicyEngine } from "../governance/policy-engine.js";
import type { IdentityStore } from "../identity/store.js";
import type { PostgresDatabase } from "../persistence/database.js";
import type { EngineeringDeliveryService } from "./service.js";

export interface EngineeringDraftContext {
  ownerId: string;
  companyId: string;
  sessionId: string;
  deviceId: string;
  operationId: string;
  signedExpiresAt: string;
  requestId: string;
  ipAddress: string;
  networkState: NetworkVerificationState;
}
export class EngineeringDraftError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 403,
  ) {
    super(code);
  }
}
const validUntil = (value: string) =>
  Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
const fingerprint = (value: unknown) =>
  createHash("sha256").update(canonicalizeExecutionPayload(value)).digest("hex");

/** Signed metadata ingress only. No executor, model, command or host access. */
export class EngineeringDraftService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly identity: IdentityStore,
    private readonly companies: CompanyService,
    private readonly governance: GovernanceStore,
    private readonly policy: PolicyEngine,
    private readonly delivery: EngineeringDeliveryService,
    private readonly audit: GovernanceAuditWriter,
  ) {}

  async create(context: EngineeringDraftContext, body: unknown) {
    try {
      const input = EngineeringDraftCreateOperationSchema.parse(body);
      if (input.companyId !== context.companyId)
        throw new EngineeringDraftError("DRAFT_COMPANY_MISMATCH");
      if ((await this.database.status()).state !== "current")
        throw new EngineeringDraftError("DRAFT_STORAGE_NOT_READY", 503);
      const initial = await this.authority(context, input);
      const digest = fingerprint({ ownerId: context.ownerId, ...input });
      // Policy evidence survives rollback of business metadata. Identity and these
      // exact registry snapshots are revalidated under locks before commit.
      const decision = await this.policy.evaluate({
        ownerId: context.ownerId,
        sessionId: context.sessionId,
        deviceId: context.deviceId,
        deviceTrusted: true,
        signedEnvelopeVerified: true,
        networkVerification: context.networkState,
        recentAuthentication: false,
        action: {
          actionId: context.operationId,
          toolName: ENGINEERING_DRAFT_TOOL,
          workspaceId: initial.workspace.id,
          arguments: { operation: "create_draft", requestDigest: digest },
        },
        tool: initial.tool,
        workspace: initial.workspace,
        emergencyStopActive: false,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
      });
      if (
        decision.decision !== "allow" ||
        decision.riskLevel !== "read_only" ||
        !["none", "session"].includes(decision.approvalRequirement)
      )
        throw new EngineeringDraftError("DRAFT_POLICY_DENIED");
      return await this.database.transaction(
        `engineering-draft:${context.ownerId}:${context.companyId}:${fingerprint(input.request.idempotencyKey)}`,
        async () => {
          await this.lockAuthority(context, input, initial.workspace.id);
          const current = await this.authority(context, input);
          if (fingerprint(current) !== fingerprint(initial))
            throw new EngineeringDraftError("DRAFT_AUTHORIZATION_CHANGED", 409);
          const existing = await this.delivery.store.findByIdempotencyKey(
            context.ownerId,
            context.companyId,
            input.request.idempotencyKey,
          );
          if (existing && existing.draftRequestDigest !== digest)
            throw new EngineeringDraftError("DRAFT_IDEMPOTENCY_CONFLICT", 409);
          const result = existing
            ? await this.delivery.controlCenter(
                context.ownerId,
                context.companyId,
                existing.id,
              )
            : await this.delivery.create(context, input.request, {
                draftRequestDigest: digest,
                deferDrive: true,
              });
          const view = await this.delivery.manager.view(
            context.ownerId,
            context.companyId,
            result.delivery.objectiveId,
          );
          const objective = view.objective;
          if (
            result.delivery.ownerId !== context.ownerId ||
            result.delivery.companyId !== context.companyId ||
            result.delivery.repositoryId !== input.request.repositoryId ||
            objective.ownerId !== context.ownerId ||
            objective.companyId !== context.companyId ||
            objective.repositoryId !== input.request.repositoryId ||
            !["DRAFT", "CANCELLED"].includes(result.delivery.status) ||
            objective.status !== result.delivery.status ||
            view.tasks.length !== 0 ||
            view.results.length !== 0 ||
            view.artifacts.length !== 0 ||
            !objective.draftOnly ||
            result.delivery.draftRequestDigest !== digest
          )
            throw new EngineeringDraftError("DRAFT_STATE_INCONSISTENT", 503);
          await this.authority(context, input);
          return EngineeringDraftResponseSchema.parse({
            operationId: context.operationId,
            policyEvaluationId: decision.id,
            requestDigest: digest,
            executionState: "NOT_STARTED",
            delivery: result.delivery,
            objective,
          });
        },
      );
    } catch (error) {
      const normalized =
        error instanceof EngineeringDraftError
          ? error
          : new EngineeringDraftError("DRAFT_STATE_UNAVAILABLE", 503);
      try {
        await this.audit({
          eventType: "ENGINEERING_CAPABILITY_DENIED",
          ownerId: context.ownerId,
          companyId: context.companyId,
          deviceId: context.deviceId,
          outcome: "DENIED",
          reason: "Signed engineering draft creation denied; no execution authorized.",
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          metadata: { operationId: context.operationId, code: normalized.code },
        });
      } catch {
        throw new EngineeringDraftError("DRAFT_AUDIT_UNAVAILABLE", 503);
      }
      throw normalized;
    }
  }

  private async authority(
    c: EngineeringDraftContext,
    input: EngineeringDraftCreateOperation,
  ) {
    if (
      companyScope.current(c.ownerId)?.companyId !== c.companyId ||
      c.networkState !== "PRIVATE_NETWORK"
    )
      throw new EngineeringDraftError("DRAFT_SCOPE_DENIED");
    const [user, session, device, company, membership, repository, security, tool] =
      await Promise.all([
        this.identity.findUserById(c.ownerId),
        this.identity.findSessionById(c.sessionId),
        this.identity.findDeviceById(c.deviceId),
        this.companies.store.findCompany(c.ownerId, c.companyId),
        this.companies.store.findMembership(c.ownerId, c.companyId),
        this.delivery.runtime.findRepository(
          c.ownerId,
          c.companyId,
          input.request.repositoryId,
        ),
        this.governance.getSecurityState(),
        this.governance.findToolByName(ENGINEERING_DRAFT_TOOL),
      ]);
    if (
      !validUntil(c.signedExpiresAt) ||
      user?.accountStatus !== "ACTIVE" ||
      session?.userId !== c.ownerId ||
      session.revokedAt !== null ||
      !validUntil(session.expiresAt) ||
      !validUntil(session.idleExpiresAt) ||
      !validUntil(session.absoluteExpiresAt) ||
      device?.ownerId !== c.ownerId ||
      device.trustStatus !== "TRUSTED" ||
      device.revokedAt !== null ||
      company?.ownerId !== c.ownerId ||
      company.status !== "ACTIVE" ||
      membership?.status !== "ACTIVE" ||
      membership.role !== "OWNER" ||
      repository?.status !== "ACTIVE" ||
      repository.ownerId !== c.ownerId ||
      repository.companyId !== c.companyId ||
      security.emergencyStopActive !== false ||
      !tool
    )
      throw new EngineeringDraftError("DRAFT_AUTHORIZATION_DENIED");
    const workspace = await this.governance.findWorkspaceById(
      repository.workspaceLocatorId,
    );
    if (
      !workspace?.enabled ||
      workspace.ownerId !== c.ownerId ||
      workspace.permissions.read !== true
    )
      throw new EngineeringDraftError("DRAFT_WORKSPACE_DENIED");
    return { workspace, tool };
  }

  private async lockAuthority(
    c: EngineeringDraftContext,
    input: EngineeringDraftCreateOperation,
    workspaceId: string,
  ) {
    // Shared locks linearize metadata creation against revoke/stop/trust updates.
    // All SQL is source-owned and uses the existing transaction's connection.
    const queries: Array<[string, unknown[]]> = [
      ["SELECT id FROM owners WHERE id=$1 FOR SHARE", [c.ownerId]],
      [
        "SELECT id FROM sessions WHERE id=$1 AND owner_id=$2 FOR SHARE",
        [c.sessionId, c.ownerId],
      ],
      [
        "SELECT id FROM devices WHERE id=$1 AND owner_id=$2 FOR SHARE",
        [c.deviceId, c.ownerId],
      ],
      [
        "SELECT id FROM companies WHERE id=$1 AND owner_id=$2 FOR SHARE",
        [c.companyId, c.ownerId],
      ],
      [
        "SELECT principal_id FROM company_memberships WHERE company_id=$1 AND principal_id=$2 FOR SHARE",
        [c.companyId, c.ownerId],
      ],
      [
        "SELECT id FROM engineering_repositories WHERE id=$1 AND owner_id=$2 AND company_id=$3 FOR SHARE",
        [input.request.repositoryId, c.ownerId, c.companyId],
      ],
      [
        "SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2 AND company_id=$3 FOR SHARE",
        [workspaceId, c.ownerId, c.companyId],
      ],
      ["SELECT id FROM security_state WHERE id='global' FOR SHARE", []],
      [
        "SELECT name FROM tool_registry WHERE name=$1 FOR SHARE",
        [ENGINEERING_DRAFT_TOOL],
      ],
    ];
    for (const [sql, values] of queries) {
      const result = await this.database.pool.query(sql, values);
      if (result.rowCount !== 1)
        throw new EngineeringDraftError("DRAFT_AUTHORIZATION_DENIED");
    }
  }
}
