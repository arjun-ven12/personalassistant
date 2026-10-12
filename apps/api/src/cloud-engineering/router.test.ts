import { describe, expect, it } from "vitest";
import { routeEngineeringExecution } from "./router.js";

const facts = {
  repositoryPlacement: "GITHUB",
  taskType: "FRONTEND",
  requiresOwnerLocalFiles: false,
  requiresDeviceResources: false,
  cloudWorker: {
    registered: true,
    healthy: true,
    capabilities: ["repository.file_patch", "repository.validate"],
  },
  macAgent: { trusted: true, online: true },
  requiredCapabilities: ["repository.file_patch", "repository.validate"],
};

describe("deterministic engineering execution routing", () => {
  it("selects healthy registered cloud for ordinary repository work", () => {
    expect(routeEngineeringExecution(facts)).toMatchObject({
      type: "CLOUD",
      availability: "READY",
    });
  });
  it("requires Mac for local/native work and waits for offline agent", () => {
    expect(
      routeEngineeringExecution({
        ...facts,
        taskType: "MAC_NATIVE",
        macAgent: { trusted: true, online: false },
      }),
    ).toMatchObject({
      type: "MAC",
      reason: "MAC_NATIVE",
      availability: "WAITING_FOR_DEVICE",
    });
    expect(
      routeEngineeringExecution({ ...facts, repositoryPlacement: "MAC_LOCAL" }),
    ).toMatchObject({ type: "MAC" });
  });
  it("does not silently fall back to Mac when cloud capability is absent", () => {
    expect(
      routeEngineeringExecution({
        ...facts,
        cloudWorker: { registered: true, healthy: true, capabilities: [] },
      }),
    ).toMatchObject({
      type: "CLOUD",
      availability: "UNAVAILABLE",
      reason: "CLOUD_UNAVAILABLE",
    });
  });
  it("rejects caller-supplied target and unknown context", () => {
    expect(() => routeEngineeringExecution({ ...facts, type: "MAC" })).toThrow();
    expect(() =>
      routeEngineeringExecution({ ...facts, cloudWorker: undefined }),
    ).toThrow();
  });
});
