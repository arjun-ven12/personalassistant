import { describe, expect, it } from "vitest";
import { ApprovalService } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { createGovernanceToolAuthority } from "./governance-authority.js";
import type { TrustedToolContext } from "./gateway.js";
import type { UniversalTool, UniversalToolProvider, UniversalToolReview } from "@alexa-control/shared";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const context: TrustedToolContext = { ownerId, companyId, agentId: null, requestId: "test", emergencyStopActive: false };
const now = new Date().toISOString();
const provider: UniversalToolProvider = { id: "test.api", ownerId, companyId, sourceType: "API", displayName: "Test", endpoint: null, credentialReferenceId: null, status: "ENABLED", health: "HEALTHY", version: "1", updatedAt: now };
const tool: UniversalTool = { id: "test.api:read", providerId: provider.id, ownerId, companyId, name: "read", description: "Read metadata", capabilityCategory: "test_read", department: "engineering", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, outputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, schemaDigest: "a".repeat(64), operationClass: "READ", riskLevel: "read_only", approvalRequirement: "none", costModel: "FREE", rateLimitPerMinute: 30, enabled: true, version: "1", updatedAt: now };
const review: UniversalToolReview = { ownerId, companyId, providerId: provider.id, toolId: tool.id, schemaDigest: tool.schemaDigest, providerVersion: provider.version, riskLevel: tool.riskLevel, approvalRequirement: tool.approvalRequirement, credentialReferenceId: null, governanceToolName: "security.view", status: "ENABLED", reviewedAt: now, updatedAt: now };
const audit = () => Promise.resolve();

describe("governance bridge", () => {
  it.each([
    { privateNetwork: false, network: "UNKNOWN", sessionMatches: true, reviewed: true, expected: true },
    { privateNetwork: false, network: "PUBLIC_NETWORK", sessionMatches: true, reviewed: true, expected: true },
    { privateNetwork: true, network: "UNKNOWN", sessionMatches: true, reviewed: true, expected: false },
    { privateNetwork: false, network: "UNAVAILABLE", sessionMatches: true, reviewed: true, expected: false },
    { privateNetwork: false, network: "UNKNOWN", sessionMatches: false, reviewed: true, expected: false },
    { privateNetwork: false, network: "UNKNOWN", sessionMatches: true, reviewed: false, expected: false },
  ] as const)("bounds reviewed cloud READ session authority: %j", async scenario => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), new ApprovalService(store, audit), audit, scenario.privateNetwork);
    const sessionId = crypto.randomUUID();
    const authority = createGovernanceToolAuthority({ store, policyEngine,
      bindings: new Map([[tool.id, scenario.reviewed ? { governanceToolName: "universal.external_read", reviewedForExecution: true as const } : "universal.external_read"]]),
      trustedSession: () => Promise.resolve({ sessionId, ipAddress: "127.0.0.1", networkVerification: scenario.network, deviceTrusted: false, signedEnvelopeVerified: false }),
      credentialReady: () => Promise.resolve(true), reviewedHandlerReady: () => Promise.resolve(true) });
    const result = await authority({ context: { ...context, sessionId: scenario.sessionMatches ? sessionId : crypto.randomUUID() },
      provider, tool: { ...tool, approvalRequirement: "session" },
      review: { ...review, governanceToolName: "universal.external_read", approvalRequirement: "session" },
      invocationId: crypto.randomUUID(), requestDigest: "b".repeat(64), approvalId: null });
    if (scenario.expected) expect(result).toMatchObject({ kind: "REVIEWED_EXECUTION_GRANT" });
    else expect(result).toBe("DENY");
    expect(store.listPolicyEvaluations(ownerId, 10)[0]?.executionAllowed).toBe(false);
  });
  it("issues a short-lived exact grant only for a server-reviewed binding", async () => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const approvals = new ApprovalService(store, audit);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), approvals, audit);
    const authority = createGovernanceToolAuthority({
      store, policyEngine,
      bindings: new Map([[tool.id, { governanceToolName: "security.view", reviewedForExecution: true as const }]]),
      trustedSession: () => Promise.resolve({ sessionId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const, deviceTrusted: false, signedEnvelopeVerified: false }),
      credentialReady: () => Promise.resolve(true),
      reviewedHandlerReady: () => Promise.resolve(true),
    });
    const invocationId = crypto.randomUUID();
    const result = await authority({ context, provider, tool, review, invocationId, requestDigest: "b".repeat(64), approvalId: null });
    expect(result).toMatchObject({ kind: "REVIEWED_EXECUTION_GRANT", companyId, toolId: tool.id, invocationId, requestDigest: "b".repeat(64) });
    expect(store.listPolicyEvaluations(ownerId, 10)[0]?.executionAllowed).toBe(false);
  });
  it("denies unbound tools and keeps policy allow non-executable", async () => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const approvals = new ApprovalService(store, audit);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), approvals, audit);
    const trustedSession = () => Promise.resolve({ sessionId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const, deviceTrusted: false, signedEnvelopeVerified: false });
    const unbound = createGovernanceToolAuthority({ store, policyEngine, bindings: new Map(), trustedSession });
    expect(await unbound({ context, provider, tool, review, invocationId: crypto.randomUUID(), requestDigest: "b".repeat(64), approvalId: null })).toBe("DENY");
    const bound = createGovernanceToolAuthority({ store, policyEngine, bindings: new Map([[tool.id, "security.view"]]), trustedSession });
    expect(await bound({ context, provider, tool, review, invocationId: crypto.randomUUID(), requestDigest: "b".repeat(64), approvalId: null })).toBe("DENY");
    expect(store.listPolicyEvaluations(ownerId, 10)[0]?.executionAllowed).toBe(false);
  });
  it.each(["universal.external_write", "security.view"])("does not extend cloud browser authority to %s", async governanceToolName => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), new ApprovalService(store, audit), audit, false);
    const sessionId = crypto.randomUUID();
    const authority = createGovernanceToolAuthority({ store, policyEngine,
      bindings: new Map([[tool.id, { governanceToolName, reviewedForExecution: true as const }]]),
      trustedSession: () => Promise.resolve({ sessionId, ipAddress: "127.0.0.1", networkVerification: "UNKNOWN", deviceTrusted: false, signedEnvelopeVerified: false }),
      credentialReady: () => Promise.resolve(true), reviewedHandlerReady: () => Promise.resolve(true) });
    expect(await authority({ context: { ...context, sessionId }, provider, tool,
      review: { ...review, governanceToolName }, invocationId: crypto.randomUUID(), requestDigest: "b".repeat(64), approvalId: null })).toBe("DENY");
    expect(store.listPolicyEvaluations(ownerId, 10)[0]?.reasonCode).toBe("NETWORK_NOT_VERIFIED");
  });
  it("denies weaker governance binding and cross-company scope", async () => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), new ApprovalService(store, audit), audit);
    const authority = createGovernanceToolAuthority({ store, policyEngine, bindings: new Map([[tool.id, "security.view"]]), trustedSession: () => Promise.resolve({ sessionId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const, deviceTrusted: false, signedEnvelopeVerified: false }) });
    expect(await authority({ context, provider, tool: { ...tool, riskLevel: "high" }, review, invocationId: crypto.randomUUID(), requestDigest: "c".repeat(64), approvalId: null })).toBe("DENY");
    expect(await authority({ context: { ...context, companyId: crypto.randomUUID() }, provider, tool, review, invocationId: crypto.randomUUID(), requestDigest: "d".repeat(64), approvalId: null })).toBe("DENY");
  });
  it("requires exact approved request before issuing a medium-risk reviewed grant", async () => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const approvals = new ApprovalService(store, audit);
    const policyEngine = new PolicyEngine(store, new RiskEngine(), approvals, audit);
    const sessionId = crypto.randomUUID();
    const authority = createGovernanceToolAuthority({ store, policyEngine,
      bindings: new Map([[tool.id, { governanceToolName: "universal.external_write", reviewedForExecution: true as const }]]),
      trustedSession: () => Promise.resolve({ sessionId, ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const, deviceTrusted: false, signedEnvelopeVerified: false }),
      credentialReady: () => Promise.resolve(true), reviewedHandlerReady: () => Promise.resolve(true) });
    const writeTool = { ...tool, operationClass: "WRITE" as const, riskLevel: "medium" as const, approvalRequirement: "explicit" as const };
    const writeReview = { ...review, governanceToolName: "universal.external_write", riskLevel: "medium" as const, approvalRequirement: "explicit" as const };
    const input = { context, provider, tool: writeTool, review: writeReview, invocationId: crypto.randomUUID(), requestDigest: "e".repeat(64), approvalId: null };
    expect(await authority(input)).toBe("APPROVAL_REQUIRED");
    const pending = store.listApprovals(ownerId)[0]!;
    await approvals.approve(ownerId, pending.id, sessionId, { ipAddress: "127.0.0.1", requestId: context.requestId });
    expect(await authority({ ...input, approvalId: crypto.randomUUID() })).toBe("DENY");
    expect(await authority({ ...input, requestDigest: "f".repeat(64), approvalId: pending.id })).not.toMatchObject({ kind: "REVIEWED_EXECUTION_GRANT" });
    expect(await authority({ ...input, approvalId: pending.id })).toMatchObject({ kind: "REVIEWED_EXECUTION_GRANT", approvalId: pending.id, requestDigest: input.requestDigest });
  });
});
