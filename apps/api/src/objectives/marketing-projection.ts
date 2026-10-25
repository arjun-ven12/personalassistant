import {
  MarketingCampaignSchema, ObjectiveExecutionSchema, ObjectiveProjectSchema,
  type MarketingCampaign, type ObjectiveExecution, type ObjectiveProject, type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import { marketingDeliverableBudget } from "../marketing/budget.js";

/** Read projection of the existing campaign coordinator; this never dispatches work. */
export function projectMarketingObjective(objective: ObjectiveExecution, raw: MarketingCampaign, previous: ObjectiveProject[], tasks: WorkforceRuntimeTask[], at: string) {
  const campaign = MarketingCampaignSchema.parse(raw);
  if (campaign.ownerId !== objective.ownerId || campaign.companyId !== objective.organizationId || campaign.objectiveId !== objective.id ||
      objective.executionSource?.campaignId !== campaign.id) throw Error("MARKETING_OBJECTIVE_BINDING_DENIED");
  const status: ObjectiveExecution["status"] = campaign.status === "DRAFT" ? "AWAITING_CONFIRMATION"
    : campaign.status === "PACKAGE_READY" ? "COMPLETED" : campaign.status;
  const total = campaign.deliverables.reduce((n, item) => n + item.weight, 0);
  const done = campaign.deliverables.filter(item => ["DRAFT_READY", "APPROVAL_READY", "COMPLETED"].includes(item.status)).reduce((n, item) => n + item.weight, 0);
  const boundTasks = new Set(campaign.deliverables.flatMap(item => item.workforceTaskId ? [item.workforceTaskId] : []));
  const spentCredits = tasks.filter(task => boundTasks.has(task.id) && task.ownerId === objective.ownerId && task.inputs.marketingCampaignId === campaign.id && task.inputs.marketingCompanyId === campaign.companyId).reduce((n, task) => n + task.actualCost, 0);
  const blockers = campaign.deliverables.filter(item => item.status === "BLOCKED" || item.status === "TOOL_UNAVAILABLE").map(item => `${item.type}: ${item.blockerCode ?? item.status}`).slice(0, 30);
  const next = ObjectiveExecutionSchema.parse({ ...objective, status, spentCredits,
    executionProgress: Math.round(100 * done / total), outcomeProgress: campaign.status === "PACKAGE_READY" ? 100 : 0,
    blockers, activatedAt: objective.activatedAt ?? campaign.automationContext?.startedAt ?? null,
    completedAt: campaign.status === "PACKAGE_READY" ? campaign.packageReadyAt : null,
  });
  const projects = campaign.deliverables.map((item, sequence) => {
    const old = previous.find(project => project.id === item.id);
    const status: ObjectiveProject["status"] = item.status === "COMPLETED" || (item.status === "DRAFT_READY" && item.approvalState !== "REQUIRED") ? "COMPLETED"
      : item.status === "DRAFT_READY" || item.status === "APPROVAL_READY" || item.status === "TOOL_UNAVAILABLE" ? "WAITING"
      : item.status === "READY" ? "QUEUED" : item.status;
    return ObjectiveProjectSchema.parse({
      id: item.id, ownerId: objective.ownerId, objectiveExecutionId: objective.id,
      title: item.type.replaceAll("_", " "), outcome: `Prepare the ${item.type.toLowerCase().replaceAll("_", " ")} campaign artifact under existing review and execution governance.`,
      status, sequence, departmentId: item.role.toLowerCase(), requiredSkills: ["marketing"], requiredCapabilities: [], capabilityReadiness: [],
      estimatedAiCostCredits: 0, memoryScopeRefs: [], budgetCredits: marketingDeliverableBudget(campaign, item.id),
      workforceTaskId: item.workforceTaskId, workflowId: null, selectedWorkflowTemplateId: null, workflowSelection: [],
      createdAt: old?.createdAt ?? campaign.createdAt, updatedAt: old?.updatedAt ?? at,
    });
  });
  return { objective: next, projects };
}
