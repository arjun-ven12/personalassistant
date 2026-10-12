import type { CloudResourceLimits, CloudUsage } from "@alexa-control/shared";
/** Infrastructure only. These server-owned values never originate in a model or client. */
export interface WorkspaceProvisionRequest {
  workspaceId: string;
  ownerId: string;
  companyId: string;
  repositoryId: string;
  workerId: string;
  generation: number;
  limits: CloudResourceLimits;
  bootstrap: {
    backendOrigin: string;
    token: string;
    expiresAt: string;
    serverPublicKeyX: string;
    baseCommit: string;
    defaultBranch: string;
    workspaceLocatorId: string;
  };
}
export interface ProviderWorkspace {
  resourceId: string;
  state: "BOOTING" | "RUNNING" | "STOPPED" | "FAILED" | "DESTROYED";
}
export interface CloudWorkspaceProvider {
  readonly id: string;
  provision(
    input: WorkspaceProvisionRequest,
    onBooting?: (workspace: ProviderWorkspace) => Promise<void>,
  ): Promise<ProviderWorkspace>;
  reconcile(
    input: Pick<WorkspaceProvisionRequest, "workspaceId" | "companyId" | "generation">,
  ): Promise<ProviderWorkspace | null>;
  /** Provider-specific resource/runtime proof, required before trust for adapters exposing it. */
  attest?(
    resourceId: string,
    input: Pick<
      WorkspaceProvisionRequest,
      "companyId" | "workspaceId" | "repositoryId" | "workerId" | "generation"
    >,
  ): Promise<unknown>;
  getStatus(resourceId: string): Promise<ProviderWorkspace>;
  stop(resourceId: string): Promise<void>;
  destroy(resourceId: string): Promise<void>;
  getUsage(resourceId: string): Promise<CloudUsage>;
  getConnectionInfo(
    resourceId: string,
  ): Promise<{ privateHost: string; previewPort: 8080 }>;
}
export class CloudProviderError extends Error {
  constructor(
    readonly code:
      "UNCERTAIN" | "UNAVAILABLE" | "INVALID_CONFIGURATION" | "SCOPE_MISMATCH",
  ) {
    super(`Cloud provider ${code.toLowerCase().replaceAll("_", " ")}.`);
  }
}
