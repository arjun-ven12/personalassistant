import {
  MarketingAdConceptSchema, MarketingBrandStrategySchema, MarketingCopySchema,
  MarketingResearchSchema, WorkforceMarketingResultSchema,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import { z } from "zod";

const BindingSchema = z.object({
  marketingCampaignId: z.string().uuid(),
  marketingObjectiveId: z.string().uuid(),
  marketingDeliverableId: z.string().uuid(),
  marketingDeliverableType: z.enum(["RESEARCH", "BRAND_STRATEGY", "MESSAGING", "SOCIAL_POST", "AD_CONCEPT", "AD_COPY", "CAMPAIGN_CALENDAR"]),
  marketingCompanyId: z.string().uuid(),
  marketingAgentId: z.string().min(1).max(160),
}).strict();

const contentSchema = {
  RESEARCH: MarketingResearchSchema,
  BRAND_STRATEGY: MarketingBrandStrategySchema,
  MESSAGING: MarketingCopySchema,
  SOCIAL_POST: MarketingCopySchema,
  AD_CONCEPT: MarketingAdConceptSchema,
  AD_COPY: MarketingCopySchema,
  CAMPAIGN_CALENDAR: MarketingCopySchema,
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
  return {
    schema,
    binding,
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
