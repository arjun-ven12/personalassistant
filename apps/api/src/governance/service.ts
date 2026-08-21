import type {
  ApprovalStatus,
  NetworkVerificationState,
  ProposedAction,
} from "@alexa-control/shared";

import type { ApprovalService } from "./approval-service.js";
import type { PolicyEngine } from "./policy-engine.js";
import type { RegistryService } from "./registry-service.js";
import type { GovernanceStore } from "./store.js";

export class GovernanceService {
  constructor(
    readonly store: GovernanceStore,
    readonly registry: RegistryService,
    readonly approvals: ApprovalService,
    readonly policyEngine: PolicyEngine,
  ) {}

  async evaluate(input: {
    ownerId: string;
    sessionId: string;
    action: ProposedAction;
    networkVerification: NetworkVerificationState;
    ipAddress: string;
    requestId: string;
  }) {
    const tool = await this.store.findToolByName(input.action.toolName);
    const application = input.action.applicationId
      ? await this.store.findApplicationById(input.action.applicationId)
      : undefined;
    const workspace = input.action.workspaceId
      ? await this.store.findWorkspaceById(input.action.workspaceId)
      : undefined;
    const securityState = await this.store.getSecurityState();
    return this.policyEngine.evaluate({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      deviceTrusted: false,
      signedEnvelopeVerified: false,
      networkVerification: input.networkVerification,
      recentAuthentication: false,
      action: input.action,
      ...(tool ? { tool } : {}),
      ...(application ? { application } : {}),
      ...(workspace ? { workspace } : {}),
      emergencyStopActive: securityState.emergencyStopActive,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
  }

  listEvaluations(ownerId: string, limit: number) {
    return this.store.listPolicyEvaluations(ownerId, limit);
  }

  listApprovals(ownerId: string, status?: ApprovalStatus) {
    return this.approvals.list(ownerId, status);
  }
}
