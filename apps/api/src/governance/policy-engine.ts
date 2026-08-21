import {
  PolicyEvaluationSchema,
  type ApprovalRequirement,
  type PolicyDecision,
  type PolicyEvaluation,
  type RiskLevel,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "./approval-service.js";
import type { ApprovalService } from "./approval-service.js";
import type { GovernanceStore } from "./store.js";
import type { RiskEngine } from "./risk-engine.js";
import type { TrustedPolicyInput } from "./types.js";

interface DecisionInput {
  decision: PolicyDecision;
  code: string;
  reason: string;
  rules: string[];
  riskLevel: RiskLevel;
  approvalRequirement: ApprovalRequirement;
  approvalRequestId?: string;
}

export class PolicyEngine {
  constructor(
    readonly store: GovernanceStore,
    readonly riskEngine: RiskEngine,
    readonly approvals: ApprovalService,
    readonly audit: GovernanceAuditWriter,
  ) {}

  async evaluate(input: TrustedPolicyInput): Promise<PolicyEvaluation> {
    try {
      return await this.evaluateTrusted(input);
    } catch {
      return this.record(input, {
        decision: "deny",
        code: "INTERNAL_POLICY_INCONSISTENCY",
        reason: "Policy state was inconsistent, so the request was denied.",
        rules: ["policy.fail_closed.internal_inconsistency"],
        riskLevel: "prohibited",
        approvalRequirement: "prohibited",
      });
    }
  }

  private async evaluateTrusted(input: TrustedPolicyInput): Promise<PolicyEvaluation> {
    const tool = input.tool;
    if (!tool) {
      return this.record(input, {
        decision: "deny",
        code: "UNKNOWN_TOOL",
        reason: "The proposed tool is not registered.",
        rules: ["registry.tool.unknown"],
        riskLevel: "prohibited",
        approvalRequirement: "prohibited",
      });
    }

    const risk = this.riskEngine.evaluate({
      tool,
      action: input.action,
      ...(input.application ? { application: input.application } : {}),
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });
    if (risk.denial?.prohibited) {
      return this.record(input, {
        decision: "prohibited",
        code: risk.denial.code,
        reason: risk.denial.reason,
        rules: risk.matchedRules,
        riskLevel: "prohibited",
        approvalRequirement: "prohibited",
      });
    }
    if (!tool.enabled) {
      return this.record(input, {
        decision: "deny",
        code: "TOOL_DISABLED",
        reason: "The registered tool is disabled.",
        rules: [...risk.matchedRules, "registry.tool.disabled"],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }
    const targetDecision = this.validateTarget(input);
    if (targetDecision) {
      return this.record(input, targetDecision);
    }
    if (risk.denial) {
      return this.record(input, {
        decision: "deny",
        code: risk.denial.code,
        reason: risk.denial.reason,
        rules: risk.matchedRules,
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }
    if (input.emergencyStopActive) {
      return this.record(input, {
        decision: "deny",
        code: "EMERGENCY_STOP_ACTIVE",
        reason: "The global emergency stop is active.",
        rules: [...risk.matchedRules, "security.emergency_stop.active"],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }
    if (tool.requiresTrustedDevice && !input.deviceTrusted) {
      return this.record(input, {
        decision: "deny",
        code: "TRUSTED_DEVICE_REQUIRED",
        reason: "This proposal requires a trusted registered device.",
        rules: [...risk.matchedRules, "identity.device.trusted.required"],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }
    if (tool.requiresTrustedDevice && !input.signedEnvelopeVerified) {
      return this.record(input, {
        decision: "deny",
        code: "SIGNED_REQUEST_REQUIRED",
        reason: "This proposal requires a verified signed envelope.",
        rules: [...risk.matchedRules, "identity.signature.verified.required"],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }
    if (input.networkVerification !== "PRIVATE_NETWORK") {
      return this.record(input, {
        decision: "deny",
        code: "NETWORK_NOT_VERIFIED",
        reason: `Network verification returned ${input.networkVerification}.`,
        rules: [
          ...risk.matchedRules,
          `network.${input.networkVerification.toLowerCase()}.denied`,
        ],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
      });
    }

    if (
      risk.approvalRequirement === "explicit" ||
      risk.approvalRequirement === "recent_authentication"
    ) {
      const approved = await this.approvals.findMatchingApproved(
        input.ownerId,
        input.action,
      );
      if (approved?.status === "APPROVED" && risk.approvalRequirement === "explicit") {
        return this.record(input, {
          decision: "allow",
          code: "POLICY_ALLOWED_WITH_APPROVAL",
          reason: "A matching explicit approval authorizes this governance proposal.",
          rules: [...risk.matchedRules, "approval.digest.match"],
          riskLevel: risk.riskLevel,
          approvalRequirement: risk.approvalRequirement,
          approvalRequestId: approved.id,
        });
      }
      const approval = await this.approvals.create({
        ownerId: input.ownerId,
        ...(input.deviceId ? { requestedByDeviceId: input.deviceId } : {}),
        action: input.action,
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
      });
      return this.record(input, {
        decision: "require_approval",
        code:
          risk.approvalRequirement === "recent_authentication"
            ? "RECENT_AUTHENTICATION_REQUIRED"
            : "APPROVAL_REQUIRED",
        reason:
          risk.approvalRequirement === "recent_authentication"
            ? "A purpose-bound recent-authentication grant is required."
            : "An exact matching explicit approval is required.",
        rules: [...risk.matchedRules, `approval.${risk.approvalRequirement}.required`],
        riskLevel: risk.riskLevel,
        approvalRequirement: risk.approvalRequirement,
        approvalRequestId: approval.id,
      });
    }

    return this.record(input, {
      decision: "allow",
      code: "POLICY_ALLOWED",
      reason:
        "The governance proposal satisfies the current deterministic policy rules.",
      rules: [...risk.matchedRules, "policy.authorization.allow"],
      riskLevel: risk.riskLevel,
      approvalRequirement: risk.approvalRequirement,
    });
  }

  private validateTarget(input: TrustedPolicyInput): DecisionInput | undefined {
    const tool = input.tool;
    if (!tool) return undefined;
    const base = {
      rules: ["registry.target.validation"],
      riskLevel: tool.riskLevel,
      approvalRequirement: tool.approvalRequirement,
    };
    if (
      (tool.targetType === "application" && !input.action.applicationId) ||
      (tool.targetType === "workspace" && !input.action.workspaceId)
    ) {
      return {
        ...base,
        decision: "deny",
        code:
          tool.targetType === "application"
            ? "UNKNOWN_APPLICATION"
            : "UNKNOWN_WORKSPACE",
        reason: `The tool requires a registered ${tool.targetType} target.`,
      };
    }
    if (
      (tool.targetType !== "application" && input.action.applicationId) ||
      (tool.targetType !== "workspace" && input.action.workspaceId)
    ) {
      return {
        ...base,
        decision: "deny",
        code: "INVALID_POLICY_REQUEST",
        reason: "The proposed action contains an unexpected target.",
      };
    }
    if (tool.targetType === "application") {
      if (!input.application || input.application.ownerId !== input.ownerId) {
        return {
          ...base,
          decision: "deny",
          code: "UNKNOWN_APPLICATION",
          reason: "The application target is not registered for this owner.",
        };
      }
      if (!input.application.enabled) {
        return {
          ...base,
          decision: "deny",
          code: "APPLICATION_DISABLED",
          reason: "The registered application is disabled.",
        };
      }
    }
    if (tool.targetType === "workspace") {
      if (!input.workspace || input.workspace.ownerId !== input.ownerId) {
        return {
          ...base,
          decision: "deny",
          code: "UNKNOWN_WORKSPACE",
          reason: "The workspace target is not registered for this owner.",
        };
      }
      if (!input.workspace.enabled) {
        return {
          ...base,
          decision: "deny",
          code: "WORKSPACE_DISABLED",
          reason: "The registered workspace is disabled.",
        };
      }
    }
    return undefined;
  }

  private async record(input: TrustedPolicyInput, decision: DecisionInput) {
    const evaluation = PolicyEvaluationSchema.parse({
      id: crypto.randomUUID(),
      actionId: input.action.actionId,
      ownerId: input.ownerId,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      decision: decision.decision,
      reasonCode: decision.code,
      humanReadableReason: decision.reason,
      matchedRules: decision.rules,
      riskLevel: decision.riskLevel,
      approvalRequirement: decision.approvalRequirement,
      ...(decision.approvalRequestId
        ? { approvalRequestId: decision.approvalRequestId }
        : {}),
      executionAllowed: false,
      evaluatedAt: new Date().toISOString(),
    });
    await this.store.appendPolicyEvaluation(evaluation);
    await this.audit({
      eventType: "POLICY_EVALUATED",
      ownerId: input.ownerId,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      outcome: decision.decision === "allow" ? "SUCCESS" : "DENIED",
      reason: decision.reason,
      metadata: {
        policyEvaluationId: evaluation.id,
        actionId: evaluation.actionId,
        toolName: input.action.toolName,
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
        riskLevel: evaluation.riskLevel,
        approvalRequirement: evaluation.approvalRequirement,
        ...(input.action.applicationId
          ? { applicationId: input.action.applicationId }
          : {}),
        ...(input.action.workspaceId ? { workspaceId: input.action.workspaceId } : {}),
      },
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    return evaluation;
  }
}
