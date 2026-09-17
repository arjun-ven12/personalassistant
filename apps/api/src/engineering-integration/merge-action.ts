import type { EngineeringMergeCandidate } from "@alexa-control/shared";

/** Canonical digest input for the existing short-lived approval engine. */
export function engineeringMergeAction(
  candidate: EngineeringMergeCandidate,
  workspaceLocatorId: string,
  targetBranch: string,
  idempotencyKey: string,
) {
  return {
    actionId: candidate.id,
    toolName: "engineering.merge_candidate",
    workspaceId: workspaceLocatorId,
    arguments: {
      companyId: candidate.companyId,
      repositoryId: candidate.repositoryId,
      runId: candidate.runId,
      candidateId: candidate.id,
      baseCommit: candidate.baseCommit,
      headCommit: candidate.headCommit,
      targetBranch,
      idempotencyKey,
    },
    requestedCapabilities: ["repository.merge_candidate" as const],
  };
}
