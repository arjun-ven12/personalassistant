import { describe, expect, it } from "vitest";
import {
  verifyCloudRuntimeEvidence,
  verifyEc2LocalEvidence,
  type RuntimeEvidence,
} from "./runtime-preflight.js";
const valid: RuntimeEvidence = {
  cpus: 2,
  memoryBytes: 4 * 1024 ** 3,
  processLimit: "512\n",
  workspace: { type: 0x01021994, bytes: 8 * 1024 ** 3 },
  docker: { type: 0x01021994, bytes: 2 * 1024 ** 3 },
};
describe("worker containment before authentication", () => {
  it("accepts bounded VM and dedicated task/container mounts", () =>
    expect(() => verifyCloudRuntimeEvidence(valid)).not.toThrow());
  it.each([
    { cpus: 8 },
    { memoryBytes: 8 * 1024 ** 3 },
    { processLimit: "max" },
    { processLimit: "513" },
    { workspace: { ...valid.workspace, type: 0xef53 } },
    { docker: { ...valid.docker, bytes: 3 * 1024 ** 3 } },
  ])("denies unknown or excessive resource evidence %j", (patch) => {
    expect(() => verifyCloudRuntimeEvidence({ ...valid, ...patch })).toThrow(
      "containment unavailable",
    );
  });
});

describe("EC2 local resource containment", () => {
  it("uses a whole-VM PID limit and bounded root disk without requiring tmpfs", () => {
    expect(() =>
      verifyEc2LocalEvidence({
        cpus: 2,
        memoryBytes: 4096 * 1024 * 1024,
        pidLimit: "512",
        rootBytes: 10240 * 1024 * 1024,
      }),
    ).not.toThrow();
  });
  it.each([
    { pidLimit: "max" },
    { pidLimit: "513" },
    { rootBytes: 10241 * 1024 * 1024 },
    { cpus: 3 },
  ])("rejects weakened resource proof %j", (patch) => {
    expect(() =>
      verifyEc2LocalEvidence({
        cpus: 2,
        memoryBytes: 4096 * 1024 * 1024,
        pidLimit: "512",
        rootBytes: 10240 * 1024 * 1024,
        ...patch,
      }),
    ).toThrow();
  });
});
