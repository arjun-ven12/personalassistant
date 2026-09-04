import {
  ApprovalRequestSchema,
  type ApprovalRequest,
  type ApprovalStatus,
  type ProposedAction,
  type RiskLevel,
  type ApprovalRequirement,
  type AuditEventType,
} from "@alexa-control/shared";

import { digestProposedAction } from "./digest.js";
import { GovernanceError } from "./errors.js";
import type { GovernanceStore } from "./store.js";
import type { StoredApprovalRequest } from "./types.js";
import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export interface GovernanceAuditInput {
  eventType: AuditEventType;
  ownerId: string;
  companyId?: string | null;
  deviceId?: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  reason: string;
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress: string;
  requestId: string;
}

export type GovernanceAuditWriter = (input: GovernanceAuditInput) => Awaitable<void>;

type ApprovalNotificationSink = {
  dispatch(input: {
    ownerId: string;
    eventId: string;
    category: "APPROVAL_REQUIRED";
    severity: "NORMAL" | "HIGH" | "CRITICAL";
    objectKind: "APPROVAL";
    objectId: string;
    stateVersion: string;
    title: string;
  }): Promise<void>;
};

export class ApprovalService {
  #notificationSink?: ApprovalNotificationSink;

  constructor(
    readonly store: GovernanceStore,
    readonly audit: GovernanceAuditWriter,
    readonly ttlSeconds = 900,
  ) {}

  setNotificationSink(sink: ApprovalNotificationSink) {
    this.#notificationSink = sink;
  }

  async create(input: {
    ownerId: string;
    requestedByDeviceId?: string;
    action: ProposedAction;
    riskLevel: RiskLevel;
    approvalRequirement: ApprovalRequirement;
    ipAddress: string;
    requestId: string;
  }) {
    const actionDigest = digestProposedAction(input.action);
    const existing = await this.store.findApprovalByDigest(
      input.ownerId,
      actionDigest,
      ["PENDING"],
    );
    if (existing) {
      const current = await this.expireIfNeeded(existing);
      if (current.status === "PENDING") {
        return this.toPublic(current);
      }
    }
    const now = new Date();
    const stored: StoredApprovalRequest = {
      companyId: companyScope.companyId(input.ownerId) ?? null,
      ...ApprovalRequestSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        ...(input.requestedByDeviceId
          ? { requestedByDeviceId: input.requestedByDeviceId }
          : {}),
        actionId: input.action.actionId,
        actionDigest,
        toolName: input.action.toolName,
        ...(input.action.applicationId
          ? { applicationId: input.action.applicationId }
          : {}),
        ...(input.action.workspaceId ? { workspaceId: input.action.workspaceId } : {}),
        riskLevel: input.riskLevel,
        approvalRequirement: input.approvalRequirement,
        status: "PENDING",
        humanSummary: this.summary(input.action),
        requestedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.ttlSeconds * 1_000).toISOString(),
        decidedAt: null,
        decidedBySessionId: null,
        rejectionReason: null,
      }),
      action: structuredClone(input.action),
    };
    const created = await this.store.createApproval(stored);
    await this.audit({
      eventType: "APPROVAL_REQUESTED",
      ownerId: input.ownerId,
      ...(input.requestedByDeviceId ? { deviceId: input.requestedByDeviceId } : {}),
      outcome: "SUCCESS",
      reason: "Approval request created for a non-executing policy proposal.",
      metadata: {
        approvalId: created.id,
        actionId: created.actionId,
        actionDigest: created.actionDigest,
        toolName: created.toolName,
      },
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    await this.#notificationSink?.dispatch({
      ownerId: input.ownerId,
      eventId: `approval:${created.id}:requested`,
      category: "APPROVAL_REQUIRED",
      severity:
        created.riskLevel === "high"
          ? "CRITICAL"
          : created.riskLevel === "medium"
            ? "HIGH"
            : "NORMAL",
      objectKind: "APPROVAL",
      objectId: created.id,
      stateVersion: `PENDING:${created.requestedAt}`,
      title: "Athena approval required",
    }).catch(() => undefined);
    return this.toPublic(created);
  }

  async get(ownerId: string, id: string) {
    const approval = await this.store.findApprovalById(id);
    if (!approval || approval.ownerId !== ownerId) {
      throw new GovernanceError(
        404,
        "APPROVAL_NOT_FOUND",
        "Approval request was not found.",
      );
    }
    return this.toPublic(await this.expireIfNeeded(approval));
  }

  async list(ownerId: string, status?: ApprovalStatus) {
    const records = await Promise.all(
      (await this.store.listApprovals(ownerId)).map((approval) =>
        this.expireIfNeeded(approval),
      ),
    );
    return records
      .filter((approval) => !status || approval.status === status)
      .map((approval) => this.toPublic(approval));
  }

  async approve(
    ownerId: string,
    id: string,
    sessionId: string,
    auditContext: { ipAddress: string; requestId: string },
    recentAuthenticationVerified = false,
  ) {
    const approval = await this.requirePending(ownerId, id);
    if (
      approval.approvalRequirement === "recent_authentication" &&
      !recentAuthenticationVerified
    ) {
      throw new GovernanceError(
        409,
        "RECENT_AUTHENTICATION_REQUIRED",
        "A valid recent-authentication grant is required.",
      );
    }
    if (
      approval.approvalRequirement !== "explicit" &&
      approval.approvalRequirement !== "recent_authentication"
    ) {
      throw new GovernanceError(
        409,
        "APPROVAL_ALREADY_DECIDED",
        "This action does not support explicit approval.",
      );
    }
    return this.transition(approval, "APPROVED", sessionId, null, auditContext);
  }

  async reject(
    ownerId: string,
    id: string,
    sessionId: string,
    auditContext: { ipAddress: string; requestId: string },
    reason?: string,
  ) {
    return this.transition(
      await this.requirePending(ownerId, id),
      "REJECTED",
      sessionId,
      reason ?? null,
      auditContext,
    );
  }

  async cancel(
    ownerId: string,
    id: string,
    sessionId: string,
    auditContext: { ipAddress: string; requestId: string },
  ) {
    return this.transition(
      await this.requirePending(ownerId, id),
      "CANCELLED",
      sessionId,
      null,
      auditContext,
    );
  }

  async findMatchingApproved(ownerId: string, action: ProposedAction) {
    const approval = await this.store.findApprovalByDigest(
      ownerId,
      digestProposedAction(action),
      ["APPROVED"],
    );
    return approval ? this.expireIfNeeded(approval) : undefined;
  }

  private async requirePending(ownerId: string, id: string) {
    const approval = await this.store.findApprovalById(id);
    if (!approval || approval.ownerId !== ownerId) {
      throw new GovernanceError(
        404,
        "APPROVAL_NOT_FOUND",
        "Approval request was not found.",
      );
    }
    const current = await this.expireIfNeeded(approval);
    if (current.status === "EXPIRED") {
      throw new GovernanceError(
        409,
        "APPROVAL_EXPIRED",
        "Approval request has expired.",
      );
    }
    if (current.status !== "PENDING") {
      throw new GovernanceError(
        409,
        "APPROVAL_ALREADY_DECIDED",
        "Approval request is already in a terminal state.",
      );
    }
    return current;
  }

  private async transition(
    approval: StoredApprovalRequest,
    status: "APPROVED" | "REJECTED" | "CANCELLED",
    sessionId: string,
    reason: string | null,
    auditContext: { ipAddress: string; requestId: string },
  ) {
    const updated: StoredApprovalRequest = {
      ...approval,
      status,
      decidedAt: new Date().toISOString(),
      decidedBySessionId: sessionId,
      rejectionReason: status === "REJECTED" ? reason : null,
    };
    await this.store.updateApproval(updated);
    const eventType = {
      APPROVED: "APPROVAL_APPROVED",
      REJECTED: "APPROVAL_REJECTED",
      CANCELLED: "APPROVAL_CANCELLED",
    } as const;
    await this.audit({
      eventType: eventType[status],
      ownerId: approval.ownerId,
      outcome: "SUCCESS",
      reason: `Approval request marked ${status}.`,
      metadata: { approvalId: approval.id, actionDigest: approval.actionDigest },
      ...auditContext,
    });
    if (approval.action.toolName === "ai.economic_override" && status === "APPROVED") {
      await this.audit({
        eventType: "ECONOMIC_OVERRIDE_APPROVED",
        ownerId: approval.ownerId,
        outcome: "SUCCESS",
        reason: "Owner approved the bounded AI-spend exception; no tool or planner action was approved.",
        metadata: { approvalId: approval.id, actionDigest: approval.actionDigest },
        ...auditContext,
      });
    }
    return this.toPublic(updated);
  }

  private async expireIfNeeded(approval: StoredApprovalRequest) {
    if (
      (approval.status === "PENDING" || approval.status === "APPROVED") &&
      new Date(approval.expiresAt).getTime() <= Date.now()
    ) {
      const expired: StoredApprovalRequest = {
        ...approval,
        status: "EXPIRED",
        decidedAt: new Date().toISOString(),
      };
      await this.store.updateApproval(expired);
      await this.audit({
        eventType: "APPROVAL_EXPIRED",
        ownerId: approval.ownerId,
        outcome: "DENIED",
        reason: "Approval request expired.",
        metadata: { approvalId: approval.id, actionDigest: approval.actionDigest },
        ipAddress: "internal",
        requestId: `approval-expiry:${approval.id}`,
      });
      return expired;
    }
    return approval;
  }

  private summary(action: ProposedAction) {
    const target = action.applicationId ?? action.workspaceId;
    return `${action.toolName}${target ? ` targeting ${target}` : ""}`.slice(0, 300);
  }

  private toPublic(approval: StoredApprovalRequest): ApprovalRequest {
    const publicApproval = { ...approval } as Partial<StoredApprovalRequest>;
    delete publicApproval.action;
    delete publicApproval.companyId;
    return ApprovalRequestSchema.parse(publicApproval);
  }
}
