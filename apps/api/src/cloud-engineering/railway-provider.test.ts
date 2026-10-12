import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CLOUD_ENGINEERING_LIMITS } from "@alexa-control/shared";
import { RailwayCloudWorkspaceProvider } from "./railway-provider.js";
import type { WorkspaceProvisionRequest } from "./provider.js";
const write = vi.fn(() => Promise.resolve()),
  detach = vi.fn(() => Promise.resolve());
vi.mock("railway", () => ({
  Sandbox: {
    connect: vi.fn(() =>
      Promise.resolve({
        files: { write },
        exec: vi.fn(() => ({ sessionName: Promise.resolve("fixed-worker"), detach })),
      }),
    ),
  },
}));
const company = crypto.randomUUID(),
  workspace = crypto.randomUUID(),
  environment = crypto.randomUUID();
const prefix = `athena-${createHash("sha256").update(company).digest("hex").slice(0, 8)}-${createHash("sha256").update(`${workspace}:1`).digest("hex").slice(0, 28)}`;
const info = {
  id: "test-resource",
  environmentId: environment,
  status: "RUNNING",
  createdAt: "2026-10-03T00:00:00.000Z",
  networkIsolation: "PRIVATE",
  idleTimeoutMinutes: 5,
  domains: [{ domain: `${prefix}.up.railway.app`, prefix, port: 8080 }],
};
const request: WorkspaceProvisionRequest = {
  workspaceId: workspace,
  ownerId: crypto.randomUUID(),
  companyId: company,
  repositoryId: crypto.randomUUID(),
  workerId: crypto.randomUUID(),
  generation: 1,
  limits: CLOUD_ENGINEERING_LIMITS,
  bootstrap: {
    backendOrigin: "https://athena.example/",
    token: "narrow-bootstrap-token",
    expiresAt: "2026-10-03T00:03:00.000Z",
    serverPublicKeyX: "a".repeat(43),
    baseCommit: "a".repeat(40),
    defaultBranch: "main",
    workspaceLocatorId: "cloud-site",
  },
};
function fixture(
  fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    await Promise.resolve();
    const q = JSON.parse(init?.body as string) as { query: string };
    return Response.json({
      data: q.query.includes("sandboxCreate")
        ? { sandboxCreate: info }
        : q.query.includes("sandboxes(")
          ? { sandboxes: { edges: [] } }
          : { sandbox: info },
    });
  }),
) {
  return {
    fetcher,
    provider: new RailwayCloudWorkspaceProvider(
      {
        projectId: crypto.randomUUID(),
        environmentId: environment,
        companyId: company,
        checkpoint: `athena-worker-${"a".repeat(64)}`,
        accessToken: "secret-for-test-only-never-log",
      },
      fetcher,
    ),
  };
}
describe("Railway infrastructure adapter", () => {
  it("provisions only a bounded VM from the approved checkpoint and starts a fixed worker", async () => {
    const f = fixture();
    const result = await f.provider.provision(request);
    expect(result.state).toBe("RUNNING");
    const body = JSON.parse(f.fetcher.mock.calls[1]![1]?.body as string) as {
      variables: { input: Record<string, unknown> };
    };
    expect(body.variables.input).toMatchObject({
      environmentId: environment,
      resources: { cpu: 2, memoryGB: 4 },
      idleTimeoutMinutes: 5,
      networkIsolation: "PRIVATE",
      template: { name: `athena-worker-${"a".repeat(64)}` },
    });
    expect(JSON.stringify(body)).not.toContain("secret-for-test-only");
    expect(write).toHaveBeenCalledWith(
      "/run/athena/bootstrap.json",
      expect.any(String),
      { mode: 0o600 },
    );
  });
  it("reconciles a prior VM instead of duplicating provisioning", async () => {
    const f = fixture(
      vi.fn(() =>
        Promise.resolve(
          Response.json({ data: { sandboxes: { edges: [{ node: info }] } } }),
        ),
      ),
    );
    expect((await f.provider.provision(request)).resourceId).toBe(info.id);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("denies resource increases and cross-company requests before mutation", async () => {
    const f = fixture();
    await expect(
      f.provider.provision({
        ...request,
        limits: { ...request.limits, cpu: 8 } as never,
      }),
    ).rejects.toThrow();
    await expect(
      f.provider.provision({ ...request, companyId: crypto.randomUUID() }),
    ).rejects.toThrow("scope mismatch");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("does not retry uncertain provider writes or expose provider secrets in errors", async () => {
    const f = fixture(
      vi.fn(async (_url, init) => {
        await Promise.resolve();
        const q = JSON.parse(init?.body as string) as { query: string };
        if (q.query.includes("sandboxCreate"))
          throw Error("secret-for-test-only-never-log");
        return Response.json({ data: { sandboxes: { edges: [] } } });
      }),
    );
    await expect(f.provider.provision(request)).rejects.toThrow("uncertain");
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("denies another company ingress and arbitrary preview port", async () => {
    for (const domains of [
      [{ ...info.domains[0], prefix: "athena-other-company" }],
      [{ ...info.domains[0], port: 22 }],
    ]) {
      const f = fixture(
        vi.fn(() =>
          Promise.resolve(Response.json({ data: { sandbox: { ...info, domains } } })),
        ),
      );
      await expect(f.provider.getConnectionInfo(info.id)).rejects.toThrow();
    }
  });
  it("reports unknown metering as null rather than zero", async () => {
    const f = fixture();
    expect(await f.provider.getUsage(info.id)).toMatchObject({
      costStatus: "UNKNOWN",
      costUsd: null,
      runtimeSeconds: null,
    });
  });
  it("rejects provider unavailability and oversized responses safely", async () => {
    const f = fixture(
      vi.fn(() => Promise.reject(Error("private infrastructure details"))),
    );
    await expect(f.provider.getStatus(info.id)).rejects.toThrow("unavailable");
    const g = fixture(vi.fn(() => Promise.resolve(new Response("x".repeat(600_000)))));
    await expect(g.provider.getStatus(info.id)).rejects.toThrow("unavailable");
  });
});
