import {
  MarketingAdConceptSchema, GeneratedMarketingBrandSchema, MarketingCopySchema, MarketingCalendarSchema, GeneratedMarketingGrowthStrategySchema, MarketingMeasurementPlanSchema, MarketingAssetBriefSchema,
  MarketingResearchSchema, WorkforceMarketingResultSchema,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import { z } from "zod";
import { hasSensitiveMemoryContent } from "../memory/sensitive-content.js";

const BindingSchema = z.object({
  marketingCampaignId: z.string().uuid(),
  marketingObjectiveId: z.string().uuid(),
  marketingDeliverableId: z.string().uuid(),
  marketingDeliverableType: z.enum(["RESEARCH", "GROWTH_STRATEGY", "BRAND_STRATEGY", "MESSAGING", "SOCIAL_POST", "AD_CONCEPT", "AD_COPY", "CAMPAIGN_CALENDAR", "MEASUREMENT_PLAN", "LANDING_PAGE_BRIEF"]),
  marketingCompanyId: z.string().uuid(),
  marketingAgentId: z.string().min(1).max(160),
}).strict();

const contentSchema = {
  RESEARCH: MarketingResearchSchema,
  GROWTH_STRATEGY: GeneratedMarketingGrowthStrategySchema,
  MEASUREMENT_PLAN: MarketingMeasurementPlanSchema,
  LANDING_PAGE_BRIEF: MarketingAssetBriefSchema,
  BRAND_STRATEGY: GeneratedMarketingBrandSchema,
  MESSAGING: MarketingCopySchema,
  SOCIAL_POST: MarketingCopySchema,
  AD_CONCEPT: MarketingAdConceptSchema,
  AD_COPY: MarketingCopySchema,
  CAMPAIGN_CALENDAR: MarketingCalendarSchema,
} as const;

/** A finite task-specific output contract on the existing Workforce/Agent OS path. */
export const marketingExecutionContract = (task: WorkforceRuntimeTask) => {
  const hasMarker = Object.keys(task.inputs).some((key) => key.startsWith("marketing"));
  if (!hasMarker) return null;
  const binding = BindingSchema.parse({
    marketingCampaignId: task.inputs.marketingCampaignId,
    marketingObjectiveId: task.inputs.marketingObjectiveId,
    marketingDeliverableId: task.inputs.marketingDeliverableId,
    marketingDeliverableType: task.inputs.marketingDeliverableType,
    marketingCompanyId: task.inputs.marketingCompanyId,
    marketingAgentId: task.inputs.marketingAgentId,
  });
  if (!task.organizationId || task.assignedAgentId !== binding.marketingAgentId ||
      !task.companyAssignmentId ||
      task.idempotencyKey !== `marketing:${binding.marketingCampaignId}:${binding.marketingDeliverableId}` ||
      task.type !== "WORK" || task.riskLevel !== "LOW")
    throw new Error("Marketing Workforce task binding is inconsistent.");
  const schema = contentSchema[binding.marketingDeliverableType];
  const context = z.object({
    product: z.string().max(160), targetAudience: z.string().max(1000).nullable(),
    channels: z.array(z.string().max(60)).max(6), constraints: z.array(z.string().max(500)).max(20),
    approvedBrand: z.array(z.string().max(4000)).max(3), dependencyContent: z.array(z.json()).max(12), sourceCampaignContent: z.array(z.json()).max(8),
  }).strict().parse({ product: task.inputs.product ?? "", targetAudience: task.inputs.targetAudience ?? null,
    channels: task.inputs.channels ?? [], constraints: task.inputs.constraints ?? [],
    approvedBrand: task.inputs.approvedBrand ?? [], dependencyContent: task.inputs.dependencyContent ?? [], sourceCampaignContent: task.inputs.sourceCampaignContent ?? [] });
  if (Buffer.byteLength(JSON.stringify(context)) > 16000 || hasSensitiveMemoryContent(JSON.stringify(context))) throw Error("MARKETING_CONTEXT_TOO_LARGE");
  return {
    schema,
    binding,
    context,
    validate: (content: unknown) => WorkforceMarketingResultSchema.parse({
      companyId: binding.marketingCompanyId,
      campaignId: binding.marketingCampaignId,
      objectiveId: binding.marketingObjectiveId,
      deliverableId: binding.marketingDeliverableId,
      deliverableType: binding.marketingDeliverableType,
      agentId: binding.marketingAgentId,
      content: schema.parse(content),
    }),
  };
};
