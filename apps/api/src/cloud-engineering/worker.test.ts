import { describe, expect, it, vi } from "vitest";
import { CloudEngineeringWorker } from "./worker.js";
import type { LocalDeviceIdentity } from "../../../mac-agent/electron/services.js";
import type { NativeEngineeringRuntime } from "../../../mac-agent/electron/engineering-runtime/runtime.js";
import type { ReadOnlyExecutionRequest } from "@alexa-control/shared";
const id = "11111111-1111-4111-8111-111111111111";
const input = {
  apiBaseUrl: "https://private-api.example.test",
  deviceId: id,
  companyId: id,
  repositoryId: id,
  workspaceLocatorId: "cloud-site",
  serverPublicKeyX: "a".repeat(43),
  repositoryRoot: `/workspace/repositories/${id}`,
  runtime: {} as NativeEngineeringRuntime,
  identity: {} as LocalDeviceIdentity,
};
const request = {
  toolName: "engineering.repository_capability",
  workspaceId: "cloud-site",
  workspaceRootPath: input.repositoryRoot,
  actionId: id,
  arguments: {
    schemaVersion: "1",
    companyId: id,
    repositoryId: id,
    engineeringWorkspaceId: null,
    workspaceLocatorId: "cloud-site",
    worktreeLocator: null,
    taskId: null,
    agentId: null,
    operationId: id,
    idempotencyKey: "inspect-repo-001",
    requestId: id,
    capability: "repository.inspect",
    input: {},
  },
} as unknown as ReadOnlyExecutionRequest;
describe("signed cloud worker scope guard", () => {
  it("updates idle activity only for scope-verified finite Engineering requests", () => {
    const activity = vi.fn();
    const worker = new CloudEngineeringWorker({ ...input, onAuthorizedWork: activity });
    expect(() =>
      worker.client.requestGuard!({ ...request, workspaceId: "another-company" }),
    ).toThrow();
    expect(activity).not.toHaveBeenCalled();
    worker.client.requestGuard!(request);
    expect(activity).toHaveBeenCalledTimes(1);
  });
  it("rejects roots outside the dedicated container workspace", () => {
    for (const repositoryRoot of [
      "/",
      "/Users/owner/project",
      "relative",
      "/workspace/../etc",
    ])
      expect(() => new CloudEngineeringWorker({ ...input, repositoryRoot })).toThrow();
  });
  it("denies non-engineering, mismatched identity and changed canonical paths before claiming work", () => {
    const worker = new CloudEngineeringWorker(input);
    const guard = worker.client.requestGuard!;
    expect(() => guard(request)).not.toThrow();
    expect(() => guard({ ...request, toolName: "git.status" })).toThrow(
      "finite engineering",
    );
    expect(() =>
      guard({ ...request, workspaceRootPath: "/workspace/repositories/other" }),
    ).toThrow();
    expect(() => guard({ ...request, workspaceId: "other-company-site" })).toThrow();
    expect(() => guard({ ...request, actionId: crypto.randomUUID() })).toThrow();
  });
});
