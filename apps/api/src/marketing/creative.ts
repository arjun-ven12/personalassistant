import { createHash } from "node:crypto";
import { z } from "zod";
import type { UniversalToolGateway, TrustedToolContext } from "../universal-tools/gateway.js";
import { hasSensitiveMemoryContent } from "../memory/sensitive-content.js";

// Providers opt into this finite contract through the existing reviewed registry.
// Neither endpoint selection nor arbitrary provider arguments come from a model.
export const CreativeRequestSchema = z.object({
  campaignId: z.string().uuid(), deliverableId: z.string().uuid(),
  version: z.number().int().positive(), mediaType: z.enum(["IMAGE", "VIDEO"]),
  brief: z.string().trim().min(1).max(2_000),
}).strict();
export const CreativeOutputSchema = z.object({
  assetRef: z.string().regex(/^artifact:[a-zA-Z0-9_-]{1,160}$/),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
}).strict();

export class MarketingCreativeCoordinator {
  constructor(readonly gateway: Pick<UniversalToolGateway, "select" | "invoke">,
    readonly now: () => Date = () => new Date()) {}

  async prepare(context: TrustedToolContext, raw: unknown) {
    const request = CreativeRequestSchema.parse(raw);
    if (!context.companyId || context.emergencyStopActive) throw new Error("Creative authority unavailable.");
    if (hasSensitiveMemoryContent(request.brief)) throw new Error("Sensitive creative brief denied.");
    const category = request.mediaType === "IMAGE" ? "image.generate" : "video.generate";
    const candidates = (await this.gateway.select(context, category, 10)).filter((tool) =>
      tool.operationClass === "WRITE" && tool.riskLevel !== "prohibited" &&
      tool.approvalRequirement !== "prohibited");
    // Gateway ordering uses current-version acceptance evidence, or stable registered IDs.
    // An unmeasured FREE label is not a measured total-cost advantage.
    const tool = candidates[0];
    if (!tool) return null;
    const key = createHash("sha256").update(JSON.stringify({
      ownerId: context.ownerId, companyId: context.companyId, toolId: tool.id, request,
    })).digest("hex");
    const invocationId = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
    return { invocationId, toolId: tool.id, arguments: request, idempotencyKey: `marketing-creative-${key}` };
  }

  async generate(context: TrustedToolContext, raw: unknown, approvalId: string | null = null) {
    const prepared = await this.prepare(context, raw);
    if (!prepared) return { status: "TOOL_UNAVAILABLE" as const };
    return this.execute(context, prepared, approvalId);
  }

  async execute(context: TrustedToolContext, prepared: NonNullable<Awaited<ReturnType<MarketingCreativeCoordinator["prepare"]>>>, approvalId: string | null) {
    const request = CreativeRequestSchema.parse(prepared.arguments);
    const result = await this.gateway.invoke(context, { ...prepared, approvalId, requestedAt: this.now().toISOString() });
    // A write with an unknown outcome never falls back to another provider.
    if (result.status !== "SUCCEEDED") return { status: result.status, result };
    const output = CreativeOutputSchema.parse(result.structuredOutput);
    if (output.mediaType !== request.mediaType) throw new Error("Creative output media type mismatch.");
    return { status: "SUCCEEDED" as const, result, content: {
      brief: request.brief, toolInvocationId: result.invocationId,
      externalAssetRef: output.assetRef, providerId: result.providerId,
    } };
  }
}
