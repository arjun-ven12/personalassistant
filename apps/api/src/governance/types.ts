import type {
  AllowedApplication,
  AllowedWorkspace,
  ApprovalRequest,
  NetworkVerificationState,
  PolicyEvaluation,
  ProposedAction,
  ToolDefinition,
} from "@alexa-control/shared";

export interface StoredApprovalRequest extends ApprovalRequest {
  companyId: string | null;
  action: ProposedAction;
}

export interface GovernanceSecurityState {
  emergencyStopActive: boolean;
  privilegedExecutionAvailable: false;
  updatedAt: string;
}

export interface TrustedPolicyInput {
  ownerId: string;
  sessionId: string;
  deviceId?: string;
  deviceTrusted: boolean;
  signedEnvelopeVerified: boolean;
  /** Internal Gateway assertion after exact server-reviewed READ binding/session checks.
   * Never populated from request bodies or network/identity headers. */
  reviewedExternalReadSession?: boolean;
  /** Internal exact artifact-review service assertion; no execution authority. */
  reviewedArtifactSession?: boolean;
  networkVerification: NetworkVerificationState;
  recentAuthentication: false;
  ipAddress: string;
  requestId: string;
  action: ProposedAction;
  tool?: ToolDefinition;
  application?: AllowedApplication;
  workspace?: AllowedWorkspace;
  approvedRequest?: StoredApprovalRequest;
  emergencyStopActive: boolean;
}

export type StoredPolicyEvaluation = PolicyEvaluation;
