import { performance } from "node:perf_hooks";

import { ApprovalService } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { UniversalToolGateway, type ToolAdapter } from "../universal-tools/gateway.js";
import { createGovernanceToolAuthority } from "../universal-tools/governance-authority.js";
import { normalizeSchema, validateValue } from "../universal-tools/schema.js";
import { InMemoryUniversalToolStore } from "../universal-tools/store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const now = new Date().toISOString();
const context = { ownerId, companyId, agentId: null, requestId: "benchmark", emergencyStopActive: false,
  sessionId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const };
const store = new InMemoryUniversalToolStore();
const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
const policyEngine = new PolicyEngine(governance, new RiskEngine(), new ApprovalService(governance, () => Promise.resolve()), () => Promise.resolve());
const adapter: ToolAdapter = {
  sourceType: "API",
  discover: () => Promise.resolve([{
    name: "lookup", description: "Deterministic benchmark read",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    capabilityCategory: "benchmark.read", department: "engineering", operationClass: "READ",
    riskLevel: "read_only", approvalRequirement: "session", costModel: "FREE",
  }]),
  invoke: () => Promise.resolve({ structuredOutput: { ok: true } }),
};
const authority = createGovernanceToolAuthority({
  store: governance, policyEngine,
  bindings: new Map([["benchmark.api:lookup", { governanceToolName: "universal.external_read", reviewedForExecution: true as const }]]),
  trustedSession: () => Promise.resolve({ sessionId: context.sessionId, ipAddress: context.ipAddress,
    networkVerification: context.networkVerification, deviceTrusted: false, signedEnvelopeVerified: false }),
  credentialReady: () => Promise.resolve(true), reviewedHandlerReady: () => Promise.resolve(true),
});
const gateway = new UniversalToolGateway(store, authority, () => Promise.resolve(), [adapter]);
const provider = {
  id: "benchmark.api", ownerId, companyId, sourceType: "API" as const,
  displayName: "Benchmark API", endpoint: null, credentialReferenceId: null,
  status: "REVIEW_REQUIRED" as const, health: "HEALTHY" as const,
  version: "1", updatedAt: now,
};
await gateway.registerReviewedProvider(context, provider);
const [tool] = await gateway.discover(context, provider.id);
if (!tool) throw new Error("Benchmark tool missing.");
await store.saveProvider({ ...provider, status: "ENABLED" });
await store.saveTools(ownerId, provider.id, [{ ...tool, enabled: true }]);
await store.saveReview({ ownerId, companyId, providerId: provider.id, toolId: tool.id,
  schemaDigest: tool.schemaDigest, providerVersion: provider.version, riskLevel: tool.riskLevel,
  approvalRequirement: tool.approvalRequirement, credentialReferenceId: null,
  governanceToolName: "universal.external_read", status: "ENABLED", reviewedAt: now, updatedAt: now });

const measure = async (count: number, operation: () => Promise<unknown>) => {
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  values.sort((a, b) => a - b);
  const at = (fraction: number) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]!;
  return { samples: count, p50Ms: at(0.5), p95Ms: at(0.95) };
};

// Warm the JIT and schema path before measuring. This is an in-process baseline,
// not a production database/network or complete engineering-task benchmark.
await measure(100, () => gateway.select(context, "benchmark.read"));
const selection = await measure(1_000, () => gateway.select(context, "benchmark.read"));
const lookup = await measure(1_000, () => store.findTool(ownerId, tool.id));
const schemaValidation = await measure(1_000, () => Promise.resolve(validateValue(normalizeSchema(tool.inputSchema), {})));
const review = await store.findReview(ownerId, tool.id);
if (!review) throw new Error("Benchmark review missing.");
const authorityEvaluation = await measure(200, () => authority({ context, tool: { ...tool, enabled: true },
  provider: { ...provider, status: "ENABLED" }, review,
  invocationId: crypto.randomUUID(), requestDigest: "a".repeat(64), approvalId: null }));
const invocation = await measure(200, () => gateway.invoke(context, {
  invocationId: crypto.randomUUID(), toolId: tool.id, arguments: {}, approvalId: null,
  idempotencyKey: null, requestedAt: now,
}));
process.stdout.write(`${JSON.stringify({ selection, lookup, schemaValidation, authorityEvaluation, gatewayDispatch: invocation, scope: "in_memory_no_network_no_model" }, null, 2)}\n`);
