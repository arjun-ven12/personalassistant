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
