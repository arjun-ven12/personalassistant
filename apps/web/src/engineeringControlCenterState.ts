import type { AllowedWorkspace } from "@alexa-control/shared";

import { ApiClientError } from "./api.js";

export const isEligibleEngineeringRoot = (
  workspace: Pick<AllowedWorkspace, "enabled" | "permissions" | "gitPermissions">,
) =>
  workspace.enabled &&
  workspace.permissions.write &&
  workspace.permissions.createFile &&
  workspace.permissions.modifyFile &&
  workspace.permissions.runScripts &&
  workspace.gitPermissions.createBranch &&
  workspace.gitPermissions.commit;

export const formatEngineeringLoadError = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? `${fallback} ${error.message}` : fallback;

export const engineeringFirstRunMessage = ({
  workspaceCount,
  eligibleRootCount,
  deliveryCount,
}: {
  workspaceCount: number;
  eligibleRootCount: number;
  deliveryCount: number;
}) => {
  if (deliveryCount > 0) return null;
  if (workspaceCount === 0)
    return "First build: configure a governed workspace, then return here to select New project, enter an objective, and Build.";
  if (eligibleRootCount === 0)
    return "Development root exists but is missing required Engineering permissions. Enable write, createFile, modifyFile, runScripts, Git createBranch, and Git commit in Workspace.";
  return "Ready for your first build: select New project, choose an eligible root, enter an objective, and Build.";
};
