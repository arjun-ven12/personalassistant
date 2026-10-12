import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { EngineeringTransportRequest } from "@alexa-control/shared";
import type { IdentityStore } from "../identity/store.js";
import type { EngineeringExecutionPlacementResolver } from "../execution/service.js";
import type { EngineeringGitHubStore } from "./github-store.js";
import type { EngineeringGitHubService } from "./github.js";

/** Company-scoped registered GitHub repos route only to fresh trusted workers. */
export class RegisteredEngineeringPlacementResolver implements EngineeringExecutionPlacementResolver {
  constructor(
    readonly githubStore: EngineeringGitHubStore,
    readonly github: EngineeringGitHubService,
    readonly identities: IdentityStore,
    readonly now: () => Date = () => new Date(),
    readonly tasks?: EngineeringOrchestrationStore,
  ) {}

  async resolve(input: {
    ownerId: string;
    request: EngineeringTransportRequest;
  }): Promise<{ type: "MAC" } | { type: "CLOUD"; workerDeviceId: string }> {
    if (input.request.taskId) {
      const task = await this.tasks?.findTask(
        input.ownerId,
        input.request.companyId,
        input.request.taskId,
      );
      if (!task)
        throw Error("Canonical Engineering task is unavailable for placement.");
      if (task.taskType === "MAC_NATIVE") return { type: "MAC" };
    }
    const registrations = await this.githubStore.list(
      input.ownerId,
      input.request.companyId,
    );
    const registration = registrations.find(
      (item) => item.engineeringRepositoryId === input.request.repositoryId,
    );
    if (!registration) return { type: "MAC" };
    if (registration.status !== "ACTIVE")
      throw Error("Cloud repository registration was revoked.");
    await this.github.requireRegistration(
      input.ownerId,
      input.request.companyId,
      registration.repository.providerRepositoryId,
    );
    const now = this.now().getTime();
    const candidates = (await this.identities.listDevices(input.ownerId))
      .filter(
        (device) =>
          device.deviceType === "CLOUD_WORKER" &&
          device.trustStatus === "TRUSTED" &&
          device.metadata.companyId === input.request.companyId &&
          device.metadata.executionScope === "ENGINEERING_ONLY" &&
          device.metadata.repositoryId === input.request.repositoryId &&
          device.metadata.workspaceLocatorId === input.request.workspaceLocatorId &&
          typeof device.metadata.workloadExpiresAt === "string" &&
          Date.parse(device.metadata.workloadExpiresAt) > now &&
          device.lastSeen &&
          now >= Date.parse(device.lastSeen) &&
          now - Date.parse(device.lastSeen) <= 45_000,
      )
      .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
    const worker = candidates[0];
    if (!worker) throw Error("A healthy registered cloud worker is unavailable.");
    return { type: "CLOUD", workerDeviceId: worker.id };
  }
}
