import type { MarketingCampaign } from "@alexa-control/shared";

/** The canonical objective allocation, shared by projection and task dispatch.
 * Credits are internal Workforce credits, never an inferred USD model budget.
 */
export function marketingDeliverableBudget(campaign: MarketingCampaign, deliverableId: string): number {
  const index = campaign.deliverables.findIndex(item => item.id === deliverableId);
  if (index < 0 || !campaign.deliverables.length) throw Error("CAMPAIGN_BUDGET_SCOPE_DENIED");
  const allocation = Math.floor(campaign.modelBudgetCredits / campaign.deliverables.length);
  return allocation + (index === 0 ? campaign.modelBudgetCredits % campaign.deliverables.length : 0);
}
