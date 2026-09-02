import type { CrossCompanySharingScope } from "@alexa-control/shared";

export type ServiceDraft = {
  sourceCompanyId: string;
  destinationCompanyId: string;
  requestedOutcome: string;
  serviceType: string;
  sharingScope: CrossCompanySharingScope;
  capabilities: string;
  sharedReferences: string;
  budgetCredits: number;
  deadline: string;
  confidentiality: "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
};

const splitList = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export const serviceReadiness = (
  draft: ServiceDraft,
  companies: Array<{ id: string; status: string }>,
  policies: Array<{
    companyId: string;
    status: string;
    allowedDestinationCompanyIds: string[];
    allowedServiceTypes: string[];
    allowedSharingScopes: string[];
    allowedCapabilities: string[];
    maxBudgetCredits: number;
    approvalThresholdCredits: number;
  }>,
  runtime?: { scheduler: "CENTRALIZED_ENABLED" | "NOT_ENABLED"; activityCapabilities: string[]; externalTransferCompanyIds: string[] },
) => {
  const blockers: string[] = [];
  const executionBlockers: string[] = [];
  const source = companies.find((item) => item.id === draft.sourceCompanyId);
  const destination = companies.find((item) => item.id === draft.destinationCompanyId);
  const sourcePolicy = policies.find((item) => item.companyId === draft.sourceCompanyId && item.status === "ACTIVE");
  const destinationPolicy = policies.find((item) => item.companyId === draft.destinationCompanyId && item.status === "ACTIVE");
  const capabilities = splitList(draft.capabilities);
  if (["SPECIFIC_ARTIFACTS", "SPECIFIC_METRICS", "TASK_BOUND_CONTEXT"].includes(draft.sharingScope) && !splitList(draft.sharedReferences).length) blockers.push("The selected sharing scope requires explicit references.");
  if (!source || source.status !== "ACTIVE") blockers.push("Source company is not active.");
  if (!destination || destination.status !== "ACTIVE") blockers.push("Destination company is not active.");
  if (draft.sourceCompanyId === draft.destinationCompanyId) blockers.push("Source and destination must be different companies.");
  for (const [label, policy, peer] of [["Source", sourcePolicy, draft.destinationCompanyId], ["Destination", destinationPolicy, draft.sourceCompanyId]] as const) {
    if (!policy) { blockers.push(`${label} collaboration policy is missing.`); continue; }
    if (!policy.allowedDestinationCompanyIds.includes(peer)) blockers.push(`${label} policy does not allow the peer company.`);
    if (!policy.allowedServiceTypes.includes(draft.serviceType)) blockers.push(`${label} policy does not allow this service type.`);
    if (!policy.allowedSharingScopes.includes(draft.sharingScope)) blockers.push(`${label} policy does not allow this sharing scope.`);
    if (capabilities.some((item) => !policy.allowedCapabilities.includes(item))) blockers.push(`${label} policy does not allow every requested capability.`);
    if (draft.budgetCredits > policy.maxBudgetCredits) blockers.push(`${label} policy budget limit is too low.`);
  }
  const approvalThreshold = Math.min(sourcePolicy?.approvalThresholdCredits ?? Number.POSITIVE_INFINITY, destinationPolicy?.approvalThresholdCredits ?? Number.POSITIVE_INFINITY);
  if (runtime && runtime.scheduler !== "CENTRALIZED_ENABLED") executionBlockers.push("INTEGRATION_NOT_READY: centralized durable scheduler is not enabled.");
  if (runtime && capabilities.some((item) => !runtime.activityCapabilities.includes(item))) executionBlockers.push("CAPABILITY_NOT_READY: a requested reviewed activity adapter is unavailable.");
  if (runtime && !runtime.externalTransferCompanyIds.includes(draft.sourceCompanyId)) blockers.push("Source company data policy does not allow external transfer.");
  if (runtime && !runtime.externalTransferCompanyIds.includes(draft.destinationCompanyId)) blockers.push("Destination company data policy does not allow external transfer.");
  return { blockers, executionBlockers, approvalRequired: draft.budgetCredits >= approvalThreshold || draft.confidentiality === "RESTRICTED" || draft.sharingScope === "SPECIFIC_DATASET" };
};
