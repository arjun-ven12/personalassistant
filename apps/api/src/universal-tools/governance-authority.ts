import type { NetworkVerificationState, ProposedAction, UniversalToolProvider, UniversalToolReview } from "@alexa-control/shared";
import type { GovernanceStore } from "../governance/store.js";
import type { PolicyEngine } from "../governance/policy-engine.js";
import type { ToolAuthority, TrustedToolContext } from "./gateway.js";

export interface TrustedUniversalSession {
  sessionId: string;
  ipAddress: string;
  networkVerification: NetworkVerificationState;
  deviceId?: string;
  deviceTrusted: boolean;
  signedEnvelopeVerified: boolean;
}
const riskRank = { read_only: 0, low: 1, medium: 2, high: 3, prohibited: 4 } as const;
const approvalRank = { none: 0, session: 1, explicit: 2, recent_authentication: 3, prohibited: 4 } as const;
const actionIdFromDigest = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;

/** Maps reviewed universal IDs to existing governance tools. Policy remains non-executing. */
export function createGovernanceToolAuthority(input: {
  store: GovernanceStore;
  policyEngine: PolicyEngine;
  bindings: ReadonlyMap<string, string | { governanceToolName: string; reviewedForExecution: true }>;
  trustedSession: (context: TrustedToolContext) => Promise<TrustedUniversalSession | null>;
  credentialReady?: (input: { context: TrustedToolContext; provider: UniversalToolProvider; review: UniversalToolReview }) => Promise<boolean>;
  reviewedHandlerReady?: (input: { context: TrustedToolContext; provider: UniversalToolProvider; review: UniversalToolReview }) => Promise<boolean>;
  now?: () => Date;
}): ToolAuthority {
  return async ({ context, tool, provider, review, invocationId, requestDigest, approvalId }) => {
    const binding = input.bindings.get(tool.id);
    const toolName = typeof binding === "string" ? binding : binding?.governanceToolName;
    if (!toolName || context.emergencyStopActive || tool.ownerId !== context.ownerId || provider.ownerId !== context.ownerId || tool.companyId !== context.companyId || provider.companyId !== context.companyId || review.status !== "ENABLED" || review.governanceToolName !== toolName || review.schemaDigest !== tool.schemaDigest || review.providerVersion !== provider.version || review.credentialReferenceId !== provider.credentialReferenceId) return "DENY";
    const registered = await input.store.findToolByName(toolName);
    const session = await input.trustedSession(context);
    if (!registered || !registered.enabled || !session || riskRank[registered.riskLevel] < riskRank[tool.riskLevel] || approvalRank[registered.approvalRequirement] < approvalRank[tool.approvalRequirement] || registered.riskLevel === "prohibited" || registered.approvalRequirement === "prohibited") return "DENY";
    const security = await input.store.getSecurityState();
    if (security.emergencyStopActive) return "DENY";
    const action: ProposedAction = {
      actionId: actionIdFromDigest(requestDigest),
      toolName,
      arguments: { universalToolId: tool.id, providerId: provider.id, schemaDigest: tool.schemaDigest, requestDigest },
      requestedCapabilities: registered.requiredCapabilities,
    };
    const evaluation = await input.policyEngine.evaluate({
      ownerId: context.ownerId, sessionId: session.sessionId, ...(session.deviceId ? { deviceId: session.deviceId } : {}),
      deviceTrusted: session.deviceTrusted, signedEnvelopeVerified: session.signedEnvelopeVerified,
      networkVerification: session.networkVerification, recentAuthentication: false,
      ipAddress: session.ipAddress, requestId: context.requestId, action, tool: registered,
      emergencyStopActive: security.emergencyStopActive,
    });
    if (evaluation.decision === "require_approval") return !approvalId || evaluation.approvalRequestId === approvalId ? "APPROVAL_REQUIRED" : "DENY";
    if (evaluation.decision !== "allow" || typeof binding === "string" || !input.credentialReady || !input.reviewedHandlerReady) return "DENY";
    if (evaluation.approvalRequirement === "explicit" || evaluation.approvalRequirement === "recent_authentication") {
      if (!approvalId || evaluation.approvalRequestId !== approvalId) return "DENY";
    } else if (approvalId) return "DENY";
    if (!await input.credentialReady({ context, provider, review }) || !await input.reviewedHandlerReady({ context, provider, review })) return "DENY";
    // Policy remains non-executable. A separate reviewed, server-owned binding
    // authorizes only this exact external request for the current route call.
    const now = input.now?.() ?? new Date();
    return {
      kind: "REVIEWED_EXECUTION_GRANT", ownerId: context.ownerId, companyId: context.companyId!,
      requestId: context.requestId, invocationId, toolId: tool.id, providerId: provider.id,
      schemaDigest: tool.schemaDigest, providerVersion: provider.version,
      credentialReferenceId: review.credentialReferenceId, requestDigest,
      approvalId, expiresAt: new Date(now.getTime() + 5_000).toISOString(),
    };
  };
}
