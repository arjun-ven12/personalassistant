import { z } from "zod";
import type { UniversalTool, UniversalToolProvider, UniversalToolReview } from "@alexa-control/shared";

import type { TrustedToolContext } from "./gateway.js";
import type { UniversalToolGateway } from "./gateway.js";
import type { UniversalToolStore } from "./store.js";

const RemoteRegistrationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.:-]{2,119}$/),
  displayName: z.string().trim().min(1).max(120),
  endpoint: z.url(),
  credentialReferenceId: z.string().uuid().nullable(),
}).strict();

export interface ReviewedToolManifest {
  providerId: string;
  toolName: string;
  sourceType?: "MCP_REMOTE" | "API" | "NATIVE";
  endpoint?: string;
  schemaDigest: string;
  providerVersion: string;
  governanceToolName: string;
  operationClass: UniversalTool["operationClass"];
  riskLevel: UniversalTool["riskLevel"];
  approvalRequirement: UniversalTool["approvalRequirement"];
  credentialRequired: boolean;
}

const riskRank = { read_only: 0, low: 1, medium: 2, high: 3, prohibited: 4 } as const;
const approvalRank = { none: 0, session: 1, explicit: 2, recent_authentication: 3, prohibited: 4 } as const;
const riskFloor = { READ: "read_only", WRITE: "medium", DESTRUCTIVE: "prohibited", EXTERNAL_PUBLISH: "high", FINANCIAL: "high" } as const;
const approvalFloor = { READ: "none", WRITE: "explicit", DESTRUCTIVE: "prohibited", EXTERNAL_PUBLISH: "recent_authentication", FINANCIAL: "recent_authentication" } as const;
const forbiddenHost = (hostname: string) => hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "metadata.google.internal" || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(":");

/** Owner actions select only server-reviewed manifests. No model-supplied risk or endpoint policy. */
export class UniversalToolLifecycle {
  readonly #manifests: ReadonlyMap<string, ReviewedToolManifest>;
  readonly #allowedHosts: ReadonlySet<string>;
  constructor(
    readonly store: UniversalToolStore,
    readonly gateway: UniversalToolGateway,
    manifests: readonly ReviewedToolManifest[],
    allowedHosts: readonly string[],
    readonly credentialReady: (input: { context: TrustedToolContext; provider: UniversalToolProvider; required: boolean }) => Promise<boolean>,
    readonly audit: (input: { context: TrustedToolContext; action: string; providerId: string; toolId: string | null; schemaDigest: string | null }) => Promise<void>,
    readonly now: () => Date = () => new Date(),
    readonly finiteHandlerReady: (toolId: string, sourceType: "API" | "NATIVE") => boolean = () => false,
  ) {
    this.#manifests = new Map(manifests.map((item) => [`${item.providerId}:${item.toolName}`, item]));
    if (this.#manifests.size !== manifests.length) throw new Error("Duplicate reviewed tool manifest.");
    this.#allowedHosts = new Set(allowedHosts);
  }

  async registerFinite(context: TrustedToolContext, body: unknown) {
    if (!context.companyId || context.emergencyStopActive) throw new Error("Trusted company context required.");
    const input = z.object({ providerId: z.string().regex(/^[a-z][a-z0-9_.:-]{2,119}$/), credentialReferenceId: z.string().uuid().nullable() }).strict().parse(body);
    const manifests = [...this.#manifests.values()].filter((item) => item.providerId === input.providerId);
    const sourceType = manifests[0]?.sourceType;
    if (sourceType !== "API" && sourceType !== "NATIVE") throw new Error("No finite server-reviewed adapter is registered.");
    if (manifests.some((item) => item.sourceType !== sourceType || !this.finiteHandlerReady(`${item.providerId}:${item.toolName}`, sourceType))) throw new Error("No finite server-reviewed adapter is registered.");
    if (await this.store.findProvider(context.ownerId, input.providerId)) throw new Error("Provider ID already registered.");
    const provider: UniversalToolProvider = {
      id: input.providerId, ownerId: context.ownerId, companyId: context.companyId,
      sourceType, displayName: input.providerId, endpoint: null,
      credentialReferenceId: input.credentialReferenceId, status: "REVIEW_REQUIRED", health: "HEALTHY",
      version: manifests[0]!.providerVersion, updatedAt: this.now().toISOString(),
    };
    if (!await this.credentialReady({ context, provider, required: manifests.some((item) => item.credentialRequired) })) throw new Error("Credential scope is not ready.");
    await this.audit({ context, action: "PROVIDER_REGISTERED", providerId: provider.id, toolId: null, schemaDigest: null });
    await this.gateway.registerReviewedProvider(context, provider);
    const tools = await this.gateway.discover(context, provider.id);
    await this.audit({ context, action: "PROVIDER_DISCOVERED", providerId: provider.id, toolId: null, schemaDigest: null });
    return tools;
  }

  async registerRemote(context: TrustedToolContext, body: unknown) {
    if (!context.companyId || context.emergencyStopActive) throw new Error("Trusted company context required.");
    const input = RemoteRegistrationSchema.parse(body);
    if ([...this.#manifests.values()].some((manifest) => manifest.providerId === input.id && manifest.sourceType && manifest.sourceType !== "MCP_REMOTE")) throw new Error("Provider ID belongs to a finite reviewed adapter.");
    const url = new URL(input.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port || forbiddenHost(url.hostname) || !this.#allowedHosts.has(url.hostname)) throw new Error("MCP endpoint is not server-approved.");
    const pinnedEndpoints = [...this.#manifests.values()].filter((manifest) => manifest.providerId === input.id && manifest.endpoint).map((manifest) => manifest.endpoint);
    if (pinnedEndpoints.length && !pinnedEndpoints.includes(url.href)) throw new Error("MCP endpoint differs from its server-reviewed manifest.");
    if (await this.store.findProvider(context.ownerId, input.id)) throw new Error("Provider ID already registered.");
    const provider: UniversalToolProvider = {
      ...input, ownerId: context.ownerId, companyId: context.companyId,
      sourceType: "MCP_REMOTE", status: "REVIEW_REQUIRED", health: "UNKNOWN",
      version: "2025-06-18", updatedAt: this.now().toISOString(),
    };
    if (!await this.credentialReady({ context, provider, required: input.credentialReferenceId !== null })) throw new Error("Credential reference is not ready for this company/provider.");
    await this.audit({ context, action: "PROVIDER_REGISTERED", providerId: provider.id, toolId: null, schemaDigest: null });
    return this.gateway.registerReviewedProvider(context, provider);
  }

  async discover(context: TrustedToolContext, providerId: string) {
    const provider = await this.requireProvider(context, providerId);
    if (provider.status !== "REVIEW_REQUIRED" || provider.sourceType !== "MCP_REMOTE") throw new Error("Provider is not eligible for remote discovery.");
    const tools = await this.gateway.discover(context, providerId);
    await this.store.saveProvider({ ...provider, health: "HEALTHY", updatedAt: this.now().toISOString() });
    await this.audit({ context, action: "PROVIDER_DISCOVERED", providerId, toolId: null, schemaDigest: null });
    return tools;
  }

  async review(context: TrustedToolContext, toolId: string, expectedSchemaDigest: string) {
    const tool = await this.requireTool(context, toolId);
    const provider = await this.requireProvider(context, tool.providerId);
    const manifest = this.#manifests.get(toolId);
    if (!manifest || manifest.providerId !== provider.id || manifest.toolName !== tool.name || (manifest.sourceType ?? "MCP_REMOTE") !== provider.sourceType || manifest.schemaDigest !== expectedSchemaDigest || manifest.schemaDigest !== tool.schemaDigest || manifest.providerVersion !== provider.version || !["REVIEW_REQUIRED", "ENABLED"].includes(provider.status)) throw new Error("No exact server-reviewed manifest for this schema/version.");
    if (manifest.riskLevel === "prohibited" || manifest.approvalRequirement === "prohibited" || riskRank[manifest.riskLevel] < riskRank[riskFloor[manifest.operationClass]] || approvalRank[manifest.approvalRequirement] < approvalRank[approvalFloor[manifest.operationClass]]) throw new Error("Reviewed manifest weakens mandatory controls.");
    if (!await this.credentialReady({ context, provider, required: manifest.credentialRequired })) throw new Error("Credential scope is not ready.");
    const reviewedTool: UniversalTool = { ...tool, operationClass: manifest.operationClass, riskLevel: manifest.riskLevel, approvalRequirement: manifest.approvalRequirement, enabled: false, updatedAt: this.now().toISOString() };
    const review: UniversalToolReview = {
      ownerId: context.ownerId, companyId: context.companyId!, providerId: provider.id,
      toolId, schemaDigest: tool.schemaDigest, providerVersion: provider.version,
      riskLevel: reviewedTool.riskLevel, approvalRequirement: reviewedTool.approvalRequirement,
      credentialReferenceId: provider.credentialReferenceId,
      governanceToolName: manifest.governanceToolName, status: "REVIEWED",
      reviewedAt: this.now().toISOString(), updatedAt: this.now().toISOString(),
    };
    await this.store.saveTools(context.ownerId, provider.id, [reviewedTool]);
    await this.store.saveReview(review);
    await this.audit({ context, action: "TOOL_REVIEWED", providerId: provider.id, toolId, schemaDigest: tool.schemaDigest });
    return review;
  }

  async activate(context: TrustedToolContext, toolId: string) {
    const tool = await this.requireTool(context, toolId);
    const provider = await this.requireProvider(context, tool.providerId);
    const review = await this.store.findReview(context.ownerId, toolId);
    const manifest = this.#manifests.get(toolId);
    if (!review || review.status !== "REVIEWED" || !manifest || review.schemaDigest !== tool.schemaDigest || review.providerVersion !== provider.version || review.riskLevel !== tool.riskLevel || review.approvalRequirement !== tool.approvalRequirement || review.credentialReferenceId !== provider.credentialReferenceId || review.governanceToolName !== manifest.governanceToolName || provider.health !== "HEALTHY" || !["REVIEW_REQUIRED", "ENABLED"].includes(provider.status)) throw new Error("Tool review is stale or provider is not healthy.");
    if (!await this.credentialReady({ context, provider, required: manifest.credentialRequired })) throw new Error("Credential scope is not ready.");
    await this.audit({ context, action: "TOOL_ACTIVATION_REQUESTED", providerId: provider.id, toolId, schemaDigest: tool.schemaDigest });
    try {
      await this.store.saveReview({ ...review, status: "ENABLED", updatedAt: this.now().toISOString() });
      await this.store.saveTools(context.ownerId, provider.id, [{ ...tool, enabled: true, updatedAt: this.now().toISOString() }]);
      await this.store.saveProvider({ ...provider, status: "ENABLED", updatedAt: this.now().toISOString() });
      await this.audit({ context, action: "TOOL_ENABLED", providerId: provider.id, toolId, schemaDigest: tool.schemaDigest });
    } catch (error) {
      // Keep the review disabled even if the provider transition or final audit fails.
      await this.store.saveReview({ ...review, status: "DISABLED", updatedAt: this.now().toISOString() });
      await this.store.saveTools(context.ownerId, provider.id, [{ ...tool, enabled: false, updatedAt: this.now().toISOString() }]);
      throw error;
    }
    return this.store.findReview(context.ownerId, toolId);
  }

  async disable(context: TrustedToolContext, toolId: string, revoke = false) {
    const tool = await this.requireTool(context, toolId);
    const review = await this.store.findReview(context.ownerId, toolId);
    if (!review) throw new Error("Tool was not reviewed.");
    await this.store.saveReview({ ...review, status: revoke ? "REVOKED" : "DISABLED", updatedAt: this.now().toISOString() });
    await this.store.saveTools(context.ownerId, tool.providerId, [{ ...tool, enabled: false, updatedAt: this.now().toISOString() }]);
    await this.audit({ context, action: revoke ? "TOOL_REVOKED" : "TOOL_DISABLED", providerId: tool.providerId, toolId, schemaDigest: tool.schemaDigest });
  }

  private async requireProvider(context: TrustedToolContext, id: string) {
    const provider = await this.store.findProvider(context.ownerId, id);
    if (!provider || !context.companyId || provider.companyId !== context.companyId || context.emergencyStopActive || provider.status === "REVOKED") throw new Error("Provider is unavailable in this company.");
    return provider;
  }
  private async requireTool(context: TrustedToolContext, id: string) {
    const tool = await this.store.findTool(context.ownerId, id);
    if (!tool || !context.companyId || tool.companyId !== context.companyId || context.emergencyStopActive) throw new Error("Tool is unavailable in this company.");
    return tool;
  }
}
