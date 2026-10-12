import { describe, expect, it, vi } from "vitest";
import { RegisteredEngineeringPlacementResolver } from "./placement.js";
import type { EngineeringGitHubService } from "./github.js";
import type { EngineeringGitHubStore } from "./github-store.js";
import type { IdentityStore } from "../identity/store.js";
import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { EngineeringTransportRequest } from "@alexa-control/shared";
const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const repositoryId = "33333333-3333-4333-8333-333333333333";
const request = {
  companyId,
  repositoryId,
  workspaceLocatorId: "cloud-site",
  taskId: null,
} as EngineeringTransportRequest;
const at = "2026-10-03T00:00:00.000Z";
const fixture = (overrides: Record<string, unknown> = {}) => {
  const device = {
    id: ownerId,
    deviceType: "CLOUD_WORKER",
    trustStatus: "TRUSTED",
    lastSeen: at,
    metadata: {
      workloadExpiresAt: "2026-10-03T01:00:00.000Z",
      companyId,
      repositoryId,
      workspaceLocatorId: "cloud-site",
      executionScope: "ENGINEERING_ONLY",
    },
    ...overrides,
  };
  const registration = {
    engineeringRepositoryId: repositoryId,
    status: "ACTIVE",
    repository: { providerRepositoryId: 42 },
  };
  const github = { requireRegistration: vi.fn(() => Promise.resolve({})) };
  const resolver = new RegisteredEngineeringPlacementResolver(
    { list: () => [registration] } as unknown as EngineeringGitHubStore,
    github as unknown as EngineeringGitHubService,
    { listDevices: () => [device] } as unknown as IdentityStore,
    () => new Date(at),
  );
  return { resolver, github };
};
describe("registered cloud worker placement", () => {
  it("routes only a fresh exact company/repository/workspace worker", async () => {
    await expect(fixture().resolver.resolve({ ownerId, request })).resolves.toEqual({
      type: "CLOUD",
      workerDeviceId: ownerId,
    });
    for (const overrides of [
      { trustStatus: "REVOKED" },
      { lastSeen: "2026-10-02T00:00:00.000Z" },
      { lastSeen: "2026-10-04T00:00:00.000Z" },
      {
        metadata: {
          companyId: ownerId,
          repositoryId,
          workspaceLocatorId: "cloud-site",
          executionScope: "ENGINEERING_ONLY",
        },
      },
    ]) {
      await expect(
        fixture(overrides).resolver.resolve({ ownerId, request }),
      ).rejects.toThrow("healthy registered cloud worker");
    }
  });
  it("fails closed when canonical task or remote permission cannot be verified", async () => {
    await expect(
      fixture().resolver.resolve({ ownerId, request: { ...request, taskId: ownerId } }),
    ).rejects.toThrow("Canonical Engineering task");
    const { resolver, github } = fixture();
    github.requireRegistration.mockRejectedValueOnce(
      Error("GitHub permission revoked"),
    );
    await expect(resolver.resolve({ ownerId, request })).rejects.toThrow(
      "permission revoked",
    );
  });
  it("routes registered Mac-native tasks to the trusted Mac path", async () => {
    const { resolver, github } = fixture();
    const native = new RegisteredEngineeringPlacementResolver(
      resolver.githubStore,
      resolver.github,
      resolver.identities,
      resolver.now,
      {
        findTask: () => ({ taskType: "MAC_NATIVE" }),
      } as unknown as EngineeringOrchestrationStore,
    );
    await expect(
      native.resolve({ ownerId, request: { ...request, taskId: ownerId } }),
    ).resolves.toEqual({ type: "MAC" });
    expect(github.requireRegistration).not.toHaveBeenCalled();
  });
});
