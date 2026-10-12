import { describe, expect, it } from "vitest";
import { Ec2LifetimeSchema } from "@alexa-control/shared";
import {
  deadlineTimer,
  validateTaskContainer,
  watchdogDecision,
  type Ec2WatchdogState,
} from "./ec2-image-runtime.js";
import { createRegistryProxy, isPublicRegistryAddress } from "./registry-proxy.js";
import { request } from "node:http";
import { once } from "node:events";

const repository = crypto.randomUUID();
const state: Ec2WatchdogState = {
  scope: {
    companyId: crypto.randomUUID(),
    repositoryId: repository,
    workspaceId: crypto.randomUUID(),
    workerId: crypto.randomUUID(),
    generation: 1,
  },
  lifetime: {
    expiresAt: "2026-10-04T01:00:00Z",
    idleSeconds: 300,
    runtimeDigest: "a".repeat(64),
  },
  monotonicDeadline: 3500,
  lastWorkMonotonic: 100,
  updatedAt: "2026-10-04T00:00:00Z",
  pid: 100,
};
const container = () => ({
  State: { Running: true, Pid: 100 },
  Id: "a".repeat(64),
  Image: `sha256:${"b".repeat(64)}`,
  Config: { User: "65532:65532", Labels: { "athena.role": "task" } },
  HostConfig: {
    Privileged: false,
    ReadonlyRootfs: true,
    PidsLimit: 256,
    Memory: 2 * 1024 ** 3,
    NanoCpus: 2e9,
    CapDrop: ["ALL"],
    CapAdd: null,
    SecurityOpt: ["no-new-privileges"],
    PidMode: "",
    IpcMode: "private",
    ShmSize: 64 * 1024 * 1024,
    NetworkMode: "none",
    Tmpfs: { "/tmp": "rw,nosuid,nodev,size=64m,mode=1777" },
  },
  Mounts: [
    {
      Type: "bind",
      Source: `/workspace/worktrees/ew-${crypto.randomUUID()}`,
      Destination: "/workspace",
    },
  ],
  NetworkSettings: { Networks: { none: { IPAddress: "" } } },
});
describe("independent EC2 image containment", () => {
  it("expires active work at the monotonic deadline even if wall time moved backwards", () => {
    expect(watchdogDecision(state, 3500, true, 0)).toBe("EXPIRE");
  });
  it("expires idle work without using heartbeat evidence", () => {
    expect(watchdogDecision(state, 401, false, 0)).toBe("EXPIRE");
    expect(watchdogDecision(state, 101, false, 0)).toBe("CONTINUE");
  });
  it("does not allow TTL or idle extension", () => {
    expect(
      Ec2LifetimeSchema.safeParse({ ...state.lifetime, idleSeconds: 301 }).success,
    ).toBe(false);
    expect(() => deadlineTimer(Number.NaN)).toThrow();
    expect(deadlineTimer(3500)).toContain("AccuracySec=1s");
  });
  it("accepts measured isolated task properties", () => {
    expect(
      validateTaskContainer(container(), repository, [`sha256:${"b".repeat(64)}`]),
    ).toBe(true);
  });
  it.each([
    { Privileged: true },
    { ReadonlyRootfs: false },
    { PidsLimit: 513 },
    { Memory: 5 * 1024 ** 3 },
    { NanoCpus: 3e9 },
    { CapAdd: ["SYS_ADMIN"] },
    { SecurityOpt: [] },
    { PidMode: "host" },
    { Tmpfs: { "/tmp": "size=1g" } },
  ])("rejects weakened container limits %j", (patch) => {
    const c = container();
    Object.assign(c.HostConfig, patch);
    expect(() => validateTaskContainer(c, repository, [c.Image])).toThrow();
  });
  it.each([
    "/run/athena",
    "/var/run/docker.sock",
    "/proc",
    "/workspace/worktrees/ew-x/../../run/athena",
  ])("rejects host/signing mounts %s", (source) => {
    const c = container();
    c.Mounts[0]!.Source = source;
    expect(() => validateTaskContainer(c, repository, [c.Image])).toThrow();
  });
  it("rejects outside networks and unexpected image digests", () => {
    const c = container();
    c.NetworkSettings.Networks = {
      bridge: {},
    } as unknown as typeof c.NetworkSettings.Networks;
    expect(() => validateTaskContainer(c, repository, [c.Image])).toThrow();
    expect(() => validateTaskContainer(container(), repository, [])).toThrow();
  });
});
describe("registry-only proxy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "224.0.0.1",
    "1.2.3.999",
  ])("denies reserved destination %s", (ip) => {
    expect(isPublicRegistryAddress(ip)).toBe(false);
  });
  it("accepts a public IPv4 destination", () =>
    expect(isPublicRegistryAddress("104.16.26.34")).toBe(true));
  it("denies ordinary HTTP and arbitrary CONNECT without a DNS/network call", async () => {
    const proxy = createRegistryProxy();
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const address = proxy.address();
    if (!address || typeof address === "string") throw Error();
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const r = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "http://169.254.169.254/",
            method: "GET",
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        r.on("error", reject);
        r.end();
      });
      expect(status).toBe(403);
      await new Promise<void>((resolve, reject) => {
        const r = request({
          hostname: "127.0.0.1",
          port: address.port,
          method: "CONNECT",
          path: "api.example.com:443",
        });
        r.once("error", () => resolve());
        r.once("connect", (_response, socket) => {
          socket.destroy();
          reject(Error("Unexpected tunnel"));
        });
        r.end();
      });
    } finally {
      proxy.close();
    }
  });
});
