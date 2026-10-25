import { z } from "zod";
import { MarketingBrandStrategySchema, MarketingBrandDirectionSchema } from "@alexa-control/shared";

import { companyScope } from "../companies/scope.js";
import type { MemoryStore } from "../memory/store.js";
import type { MarketingStore } from "./store.js";

/** Fits the existing 10,000-character memory contract and 12,000-character
 * Marketing request guard. Shared by persistence and aggregate context reads. */
export const APPROVED_BRAND_CONTEXT_CHAR_LIMIT = 8_000;

const StableBrandSchema = z.object({
  direction: MarketingBrandDirectionSchema.optional(),
  positioning: z.string().min(1).max(2_000),
  targetAudience: z.string().min(1).max(2_000),
  brandPromise: z.string().min(1).max(2_000),
  toneOfVoice: z.string().min(1).max(2_000),
  messagingPillars: z.array(z.string().min(1).max(2_000)).max(6),
  visualDirection: z.string().min(1).max(2_000),
  prohibitedClaims: z.array(z.string().min(1).max(2_000)).max(20),
}).strict();

/** Returns only stable, approved facts whose source is still the current artifact. */
export const approvedBrandContext = async (
  ownerId: string,
  companyId: string,
  marketing: Pick<MarketingStore, "findCampaign" | "listArtifacts">,
  memory: Pick<MemoryStore, "listMemories">,
  productOrCompany?: string,
): Promise<string[]> => {
  if (companyScope.companyId(ownerId) !== companyId) return [];
  const records = await memory.listMemories(ownerId, 2_000);
  const result: string[] = [];
  for (const record of records) {
    if (result.length >= 3) break;
    if (!record.tags.includes("marketing-brand-approved") || !record.tags.includes(`marketing-company:${companyId}`)) continue;
    const campaignTag = record.tags.find((tag) => tag.startsWith("marketing-campaign:"));
    const campaignId = campaignTag?.slice("marketing-campaign:".length);
    if (!campaignId || !z.uuid().safeParse(campaignId).success) continue;
    const campaign = await marketing.findCampaign(ownerId, companyId, campaignId);
    if (!campaign || campaign.status === "CANCELLED" || (productOrCompany !== undefined && campaign.productOrCompany.trim().toLocaleLowerCase() !== productOrCompany.trim().toLocaleLowerCase())) continue;
    const brand = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY");
    if (!brand?.artifactRef?.startsWith("marketing-artifact:") || !brand.contentDigest || brand.approvalState !== "APPROVED") continue;
    const artifactId = brand.artifactRef.slice("marketing-artifact:".length);
    const artifact = (await marketing.listArtifacts(ownerId, companyId, campaignId)).find((item) => item.id === artifactId);
    if (!artifact || artifact.type !== "BRAND_STRATEGY" || artifact.status !== "APPROVED" ||
        artifact.version !== brand.version || artifact.contentDigest !== brand.contentDigest ||
        !record.tags.includes(`brand:${artifact.contentDigest}`) ||
        !record.evidence.some((entry) => entry.reference === `marketing-artifact:${artifact.id}:${artifact.contentDigest}`)) continue;
    let content: unknown;
    try { content = JSON.parse(record.content); } catch { continue; }
    const parsed = StableBrandSchema.safeParse(content);
    if (!parsed.success) continue;
    const source = MarketingBrandStrategySchema.safeParse(artifact.content);
    if (!source.success) continue;
    const expected = StableBrandSchema.parse({
      ...(source.data.direction ? { direction: source.data.direction } : {}),
      positioning: source.data.positioning,
      targetAudience: source.data.targetAudience,
      brandPromise: source.data.brandPromise,
      toneOfVoice: source.data.toneOfVoice,
      messagingPillars: source.data.messagingPillars,
      visualDirection: source.data.visualDirection,
      prohibitedClaims: source.data.prohibitedClaims,
    });
    if (JSON.stringify(parsed.data) !== JSON.stringify(expected)) continue;
    const encoded = JSON.stringify(parsed.data);
    if (encoded.length + result.reduce((sum, item) => sum + item.length, 0) > APPROVED_BRAND_CONTEXT_CHAR_LIMIT) continue;
    result.push(encoded);
  }
  return result;
};
