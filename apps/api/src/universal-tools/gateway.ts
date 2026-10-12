import { createHash } from "node:crypto";
import {
  UniversalToolProviderSchema, UniversalToolRequestSchema, UniversalToolResultSchema, UniversalToolSchema,
  type UniversalTool, type UniversalToolProvider, type UniversalToolResult, type UniversalToolReview,
} from "@alexa-control/shared";
import { normalizeSchema, schemaDigest, validateValue } from "./schema.js";
import type { UniversalToolStore } from "./store.js";
import { containsDatasetSecret } from "../engineering-dataset/service.js";
import { rankTools } from "./intelligence.js";

export type TrustedToolContext = Readonly<{
  ownerId: string;
  companyId: string | null;
  agentId: string | null;
  requestId: string;
  emergencyStopActive: boolean;
  sessionId?: string;
  ipAddress?: string;
  networkVerification?: "PRIVATE_NETWORK" | "PUBLIC_NETWORK" | "UNKNOWN" | "UNAVAILABLE";
}>;
export type ToolExecutionGrant = Readonly<{
  kind: "REVIEWED_EXECUTION_GRANT";
  ownerId: string;
  companyId: string;
  requestId: string;
  invocationId: string;
  toolId: string;
  providerId: string;
  schemaDigest: string;
  providerVersion: string;
  credentialReferenceId: string | null;
  requestDigest: string;
  approvalId: string | null;
  expiresAt: string;
}>;
export type ToolAuthority = (input: { context: TrustedToolContext; tool: UniversalTool; provider: UniversalToolProvider; review: UniversalToolReview; invocationId: string; requestDigest: string; approvalId: string | null }) => Promise<ToolExecutionGrant | "ALLOW" | "APPROVAL_REQUIRED" | "DENY">;
export type ToolAudit = (input: { context: TrustedToolContext; toolId: string; providerId: string; requestDigest: string; status: UniversalToolResult["status"]; failureCode: string | null; latencyMs: number; costMinor: number | null; costCurrency: string | null; retryCount: number }) => Promise<void>;
export interface ToolAdapter {
  readonly sourceType: UniversalToolProvider["sourceType"];
  /** Must be declared only after provider-side idempotency and status reconciliation are reviewed. */
  readonly writeRecovery?: "PROVIDER_IDEMPOTENT_RECONCILABLE";
  reconcile?(input: { provider: UniversalToolProvider; tool: UniversalTool; invocationId: string; requestDigest: string }): Promise<{ status: "SUCCEEDED" | "FAILED" | "UNKNOWN"; structuredOutput?: unknown; externalOperationId: string | null }>;
  discover(provider: UniversalToolProvider): Promise<{ name: string; description: string; inputSchema: unknown; outputSchema: unknown; capabilityCategory: string; department: string; operationClass: UniversalTool["operationClass"]; riskLevel: UniversalTool["riskLevel"]; approvalRequirement: UniversalTool["approvalRequirement"]; costModel: UniversalTool["costModel"] }[]>;
  invoke(input: { context: TrustedToolContext; provider: UniversalToolProvider; tool: UniversalTool; arguments: unknown; invocationId: string; idempotencyKey: string | null }): Promise<{ structuredOutput: unknown; boundedTextOutput?: string | null; externalOperationId?: string | null; costMinor?: number | null; costCurrency?: string | null; retryCount?: number }>;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const maxRisk = { read_only: 0, low: 1, medium: 2, high: 3, prohibited: 4 } as const;
const minRisk = { READ: "read_only", WRITE: "medium", DESTRUCTIVE: "prohibited", EXTERNAL_PUBLISH: "high", FINANCIAL: "high" } as const;
const minApproval = { READ: "none", WRITE: "explicit", DESTRUCTIVE: "prohibited", EXTERNAL_PUBLISH: "recent_authentication", FINANCIAL: "recent_authentication" } as const;
const approvalRank = { none: 0, session: 1, explicit: 2, recent_authentication: 3, prohibited: 4 } as const;
const grantMatches = (grant: ToolExecutionGrant | string, input: { context: TrustedToolContext; tool: UniversalTool; provider: UniversalToolProvider; review: UniversalToolReview; invocationId: string; requestDigest: string; approvalId: string | null; now: Date }) =>
  typeof grant !== "string" && grant.kind === "REVIEWED_EXECUTION_GRANT" &&
  grant.ownerId === input.context.ownerId && grant.companyId === input.context.companyId &&
  grant.requestId === input.context.requestId && grant.invocationId === input.invocationId &&
  grant.toolId === input.tool.id && grant.providerId === input.provider.id &&
  grant.schemaDigest === input.tool.schemaDigest && grant.providerVersion === input.provider.version &&
  grant.credentialReferenceId === input.review.credentialReferenceId &&
  grant.requestDigest === input.requestDigest && grant.approvalId === input.approvalId &&
  Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > input.now.getTime() &&
  Date.parse(grant.expiresAt) <= input.now.getTime() + 30_000;

export class UniversalToolGateway {
  readonly #adapters: Map<string, ToolAdapter>;
  constructor(readonly store: UniversalToolStore, readonly authority: ToolAuthority, readonly audit: ToolAudit, adapters: ToolAdapter[], readonly now: () => Date = () => new Date()) {
    this.#adapters = new Map(adapters.map((adapter) => [adapter.sourceType, adapter]));
    if (this.#adapters.size !== adapters.length) throw new Error("Duplicate source adapter.");
  }
  async registerReviewedProvider(context: TrustedToolContext, candidate: unknown) {
    const provider = UniversalToolProviderSchema.parse(candidate);
    if (provider.ownerId !== context.ownerId || provider.companyId !== context.companyId || provider.status !== "REVIEW_REQUIRED") throw new Error("Provider registration scope or review state invalid.");
    if (provider.sourceType === "MCP_REMOTE" && (!provider.endpoint || new URL(provider.endpoint).protocol !== "https:")) throw new Error("Remote MCP requires reviewed HTTPS endpoint.");
    if (provider.sourceType !== "MCP_REMOTE" && provider.endpoint) throw new Error("Only remote MCP may supply an endpoint.");
    await this.store.saveProvider(provider);
    return provider;
  }
  async discover(context: TrustedToolContext, providerId: string) {
    const provider = await this.store.findProvider(context.ownerId, providerId);
    if (!provider || provider.companyId !== context.companyId || provider.status !== "REVIEW_REQUIRED") throw new Error("Provider is not in review state.");
    const adapter = this.#adapters.get(provider.sourceType);
    if (!adapter) throw new Error("No reviewed adapter registered.");
    const discovered = await adapter.discover(provider);
    if (discovered.length > 100) throw new Error("Too many tools.");
    const tools = discovered.map((candidate) => {
      const inputSchema = normalizeSchema(candidate.inputSchema);
      const outputSchema = normalizeSchema(candidate.outputSchema);
      const id = `${provider.id}:${candidate.name}`;
      return UniversalToolSchema.parse({
        id, providerId, ownerId: context.ownerId, companyId: context.companyId,
        name: candidate.name, description: candidate.description, capabilityCategory: candidate.capabilityCategory,
        department: candidate.department, inputSchema, outputSchema, schemaDigest: schemaDigest({ type: "object", properties: { input: inputSchema, output: outputSchema }, required: ["input", "output"], additionalProperties: false }),
        operationClass: candidate.operationClass,
        riskLevel: maxRisk[candidate.riskLevel] >= maxRisk[minRisk[candidate.operationClass]] ? candidate.riskLevel : minRisk[candidate.operationClass],
        approvalRequirement: approvalRank[candidate.approvalRequirement] >= approvalRank[minApproval[candidate.operationClass]] ? candidate.approvalRequirement : minApproval[candidate.operationClass],
        costModel: candidate.costModel, rateLimitPerMinute: 30, enabled: false, version: provider.version, updatedAt: this.now().toISOString(),
      });
    });
    if (new Set(tools.map((tool) => tool.id)).size !== tools.length) throw new Error("Duplicate tool ID.");
    await this.store.saveTools(context.ownerId, providerId, tools);
    return tools;
  }
  async select(context: TrustedToolContext, category: string, limit = 10, authorizeRecommendation = false) {
    if (context.emergencyStopActive) return [];
    const tools = await this.store.listTools(context.ownerId);
    const eligible: UniversalTool[] = [];
    for (const tool of tools) {
      if (tool.companyId !== context.companyId || !tool.enabled || tool.capabilityCategory !== category) continue;
      const provider = await this.store.findProvider(context.ownerId, tool.providerId);
      const review = await this.store.findReview(context.ownerId, tool.id);
      if (provider?.status !== "ENABLED" || provider.health !== "HEALTHY" || provider.companyId !== context.companyId || review?.status !== "ENABLED" || review.schemaDigest !== tool.schemaDigest || review.providerVersion !== provider.version) continue;
      if (authorizeRecommendation) {
        // An argument-free recommendation cannot establish action-bound approval.
        if (!["none", "session"].includes(tool.approvalRequirement) || tool.operationClass !== "READ") continue;
        const invocationId = crypto.randomUUID();
        const requestDigest = digest({ purpose: "SELECTION_PREFLIGHT_ONLY", invocationId, ownerId: context.ownerId, companyId: context.companyId, toolId: tool.id, schemaDigest: tool.schemaDigest });
        const input = { context, tool, provider, review, invocationId, requestDigest, approvalId: null };
        try { if (!grantMatches(await this.authority(input), { ...input, now: this.now() })) continue; }
        catch { continue; }
        // Discard the preflight grant. Invocation requires a new exact request grant.
      }
      eligible.push(tool);
    }
    const receipts = context.companyId ? await this.store.listReceipts(context.ownerId, context.companyId, 500) : [];
    return rankTools(eligible, receipts).map(v => v.tool).slice(0, Math.min(Math.max(limit, 0), 20));
  }
  async invoke(context: TrustedToolContext, raw: unknown): Promise<UniversalToolResult> {
    const request = UniversalToolRequestSchema.parse(raw);
    const start = this.now();
    const tool = await this.store.findTool(context.ownerId, request.toolId);
    const provider = tool ? await this.store.findProvider(context.ownerId, tool.providerId) : null;
    const review = tool ? await this.store.findReview(context.ownerId, tool.id) : null;
    if (!tool || !provider || tool.companyId !== context.companyId || provider.companyId !== context.companyId) throw new Error("Unknown or cross-company tool.");
    const requestDigest = digest({ ownerId: context.ownerId, companyId: context.companyId, invocationId: request.invocationId, toolId: tool.id, providerId: provider.id, providerVersion: provider.version, schemaDigest: tool.schemaDigest, idempotencyKey: request.idempotencyKey, arguments: request.arguments });
    const finish = async (status: UniversalToolResult["status"], failureCode: string | null, structuredOutput: unknown = null, boundedTextOutput: string | null = null, externalOperationId: string | null = null, costMinor: number | null = null, costCurrency: string | null = null, retryCount = 0): Promise<UniversalToolResult> => {
      const result = UniversalToolResultSchema.parse({ invocationId: request.invocationId, toolId: tool.id, providerId: provider.id, status, structuredOutput, boundedTextOutput, externalOperationId, failureCode, retryable: false, costMinor, costCurrency, retryCount, ownerAcceptance: null, toolVersion: tool.version, toolSchemaDigest: tool.schemaDigest, capabilityCategory: tool.capabilityCategory, environment: provider.sourceType, latencyMs: Math.max(0, this.now().getTime() - start.getTime()), startedAt: start.toISOString(), completedAt: this.now().toISOString() });
      await this.audit({ context, toolId: tool.id, providerId: provider.id, requestDigest, status, failureCode, latencyMs: result.latencyMs, costMinor, costCurrency, retryCount });
      return result;
    };
    if (context.emergencyStopActive || !tool.enabled || provider.status !== "ENABLED" || provider.health !== "HEALTHY" || !this.#adapters.has(provider.sourceType) || review?.status !== "ENABLED" || review.companyId !== context.companyId || review.providerId !== provider.id || review.schemaDigest !== tool.schemaDigest || review.providerVersion !== provider.version || review.riskLevel !== tool.riskLevel || review.approvalRequirement !== tool.approvalRequirement || review.credentialReferenceId !== provider.credentialReferenceId) return finish("DENIED", "TOOL_UNAVAILABLE");
    if (tool.operationClass !== "READ" && !request.idempotencyKey) return finish("DENIED", "IDEMPOTENCY_KEY_REQUIRED");
    const activeAdapter = this.#adapters.get(provider.sourceType)!;
    if (tool.operationClass !== "READ" && (activeAdapter.writeRecovery !== "PROVIDER_IDEMPOTENT_RECONCILABLE" || !activeAdapter.reconcile)) return finish("DENIED", "PROVIDER_RECONCILIATION_UNAVAILABLE");
    try { validateValue(normalizeSchema(tool.inputSchema), request.arguments); } catch { return finish("DENIED", "INVALID_ARGUMENT"); }
    const decision = await this.authority({ context, tool, provider, review, invocationId: request.invocationId, requestDigest, approvalId: request.approvalId });
    if (!grantMatches(decision, { context, tool, provider, review, invocationId: request.invocationId, requestDigest, approvalId: request.approvalId, now: this.now() })) return finish(decision === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "DENIED", decision === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "EXECUTION_AUTHORITY_DENIED");
    const [currentTool, currentProvider, currentReview] = await Promise.all([
      this.store.findTool(context.ownerId, tool.id),
      this.store.findProvider(context.ownerId, provider.id),
      this.store.findReview(context.ownerId, tool.id),
    ]);
    if (!currentTool?.enabled || currentTool.schemaDigest !== tool.schemaDigest || currentProvider?.status !== "ENABLED" || currentProvider.version !== provider.version || currentProvider.health !== "HEALTHY" || currentReview?.status !== "ENABLED" || currentReview.schemaDigest !== review.schemaDigest) return finish("DENIED", "TOOL_REVOKED_DURING_AUTHORIZATION");
    const reserved = await this.store.reserve({ invocationId: request.invocationId, ownerId: context.ownerId, companyId: context.companyId, toolId: tool.id, requestDigest, status: "RESERVED", result: null });
    if (reserved.requestDigest !== requestDigest || reserved.toolId !== tool.id || reserved.companyId !== context.companyId) return finish("DENIED", "IDEMPOTENCY_CONFLICT");
    if (reserved.status === "COMPLETED" && reserved.result) return reserved.result;
    if (reserved.status !== "RESERVED") return finish("INDETERMINATE", "PREVIOUS_OUTCOME_UNKNOWN");
    // A reservation is never replayed after a crash or concurrent duplicate.
    const claim = await this.store.claim(context.ownerId, request.invocationId);
    if (!claim) return finish("INDETERMINATE", "PREVIOUS_OUTCOME_UNKNOWN");
    const adapter = activeAdapter;
    try {
      const output = await adapter.invoke({ context, provider, tool, arguments: request.arguments, invocationId: request.invocationId, idempotencyKey: request.idempotencyKey });
      validateValue(normalizeSchema(tool.outputSchema), output.structuredOutput);
      if (containsDatasetSecret(output.structuredOutput) || containsDatasetSecret(output.boundedTextOutput)) throw new Error("Sensitive tool output denied.");
      if (output.boundedTextOutput && Buffer.byteLength(output.boundedTextOutput) > 16_384) throw new Error("Oversized response.");
      const result = await finish("SUCCEEDED", null, output.structuredOutput, output.boundedTextOutput ?? null, output.externalOperationId ?? null, output.costMinor ?? null, output.costCurrency ?? null, output.retryCount ?? 0);
      await this.store.complete({ ...reserved, status: "COMPLETED", result });
      return result;
    } catch {
      const result = await finish("INDETERMINATE", "PROVIDER_OUTCOME_UNKNOWN");
      await this.store.complete({ ...reserved, status: "INDETERMINATE", result });
      return result;
    }
  }

  /** Queries a reviewed provider receipt by exact invocation ID; never dispatches the action again. */
  async receipt(context: TrustedToolContext, invocationId: string) {
    if (!context.companyId || context.emergencyStopActive) throw new Error("Receipt scope unavailable.");
    return this.store.findReceipt(context.ownerId, context.companyId, invocationId);
  }

  async reconcileReceipt(context: TrustedToolContext, invocationId: string) {
    if (!context.companyId) throw new Error("Company scope required.");
    const receipt = await this.store.findReceipt(context.ownerId, context.companyId, invocationId);
    if (!receipt) throw Object.assign(new Error("Invocation receipt not found."), { statusCode: 404 });
    if (receipt.status === "COMPLETED") return receipt;
    const tool = await this.store.findTool(context.ownerId, receipt.toolId);
    const provider = tool ? await this.store.findProvider(context.ownerId, tool.providerId) : null;
    const adapter = provider ? this.#adapters.get(provider.sourceType) : null;
    if (!tool || !provider || tool.companyId !== context.companyId || provider.companyId !== context.companyId || tool.operationClass === "READ" || adapter?.writeRecovery !== "PROVIDER_IDEMPOTENT_RECONCILABLE" || !adapter.reconcile) return receipt;
    let recovered: Awaited<ReturnType<NonNullable<ToolAdapter["reconcile"]>>>;
    try {
      recovered = await adapter.reconcile({ provider, tool, invocationId, requestDigest: receipt.requestDigest });
      if (recovered.status === "SUCCEEDED") validateValue(normalizeSchema(tool.outputSchema), recovered.structuredOutput);
    } catch { return receipt; }
    if (recovered.status === "UNKNOWN") return receipt;
    const at = this.now();
    const startedAt = receipt.result?.startedAt ?? at.toISOString();
    const result = UniversalToolResultSchema.parse({ invocationId, toolId: tool.id, providerId: provider.id,
      status: recovered.status, structuredOutput: recovered.status === "SUCCEEDED" ? recovered.structuredOutput : null,
      boundedTextOutput: null, externalOperationId: recovered.externalOperationId,
      failureCode: recovered.status === "FAILED" ? "PROVIDER_RECONCILED_FAILURE" : null, retryable: false,
      costMinor: null, costCurrency: null, retryCount: receipt.result?.retryCount ?? 0,
      ownerAcceptance: null, latencyMs: Math.max(0, at.getTime() - Date.parse(startedAt)),
      startedAt, completedAt: at.toISOString() });
    await this.audit({ context, toolId: tool.id, providerId: provider.id, requestDigest: receipt.requestDigest,
      status: result.status, failureCode: result.failureCode, latencyMs: result.latencyMs,
      costMinor: result.costMinor ?? null, costCurrency: result.costCurrency ?? null, retryCount: result.retryCount ?? 0 });
    const completed = { ...receipt, status: "COMPLETED" as const, result };
    await this.store.complete(completed);
    return completed;
  }
}
