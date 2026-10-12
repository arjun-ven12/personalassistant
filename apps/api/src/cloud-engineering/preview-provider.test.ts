import { describe, expect, it, vi } from "vitest";
import { EngineeringPreviewResultSchema } from "@alexa-control/shared";
import { CloudHttpsPreviewProvider } from "./preview-provider.js";
import type { WorkspaceProvisioningService } from "./provisioning.js";
const owner = crypto.randomUUID(),
  company = crypto.randomUUID(),
  repository = crypto.randomUUID(),
  workspaceId = crypto.randomUUID(),
  at = "2026-10-03T00:00:00.000Z";
const preview = EngineeringPreviewResultSchema.parse({
  previewId: crypto.randomUUID(),
  serverId: "vite",
  state: "RUNNING",
  pid: 321,
  port: 4173,
  url: "http://localhost:4173",
  healthStatus: "PASS",
  startedAt: at,
  checkedAt: at,
  expiresAt: "2026-10-03T00:30:00.000Z",
  failureSummary: null,
});
function fixture() {
  const record = {
    id: workspaceId,
    ownerId: owner,
    companyId: company,
    repositoryId: repository,
    generation: 1,
    state: "READY",
    providerResourceId: "vm",
    expiresAt: "2026-10-03T01:00:00.000Z",
  };
  const write = vi.fn(() => Promise.resolve());
  const milestone = vi.fn(() => Promise.resolve());
  const service = {
    identities: { appendAudit: () => Promise.resolve() },
    authorizeProvider: () => Promise.resolve(),
    now: () => new Date(at),
    recordMilestone: milestone,
    store: {
      findByRepository: (o: string, c: string, r: string) =>
        Promise.resolve(
          o === owner && c === company && r === repository ? record : undefined,
        ),
    },
    provider: {
      getConnectionInfo: () =>
        Promise.resolve({
          privateHost: "athena-preview.up.railway.app",
          previewPort: 8080,
        }),
    },
  } as unknown as WorkspaceProvisioningService;
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(null, {
        status: 303,
        headers: {
          location: "/",
          "set-cookie": "athena_preview=test; Secure; HttpOnly",
        },
      }),
    ),
  );
  return {
    record,
    write,
    milestone,
    fetcher,
    provider: new CloudHttpsPreviewProvider(service, { write }, fetcher),
  };
}
describe("governed HTTPS preview publication", () => {
  it("requires external health after signed local health and stores only a hashed ticket in the VM", async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: {
            location: "/",
            "set-cookie": "athena_preview=test; Secure; HttpOnly",
          },
        }),
      )
      .mockResolvedValueOnce(new Response("ready"));
    const result = await f.provider.expose(owner, company, repository, preview);
    expect(result.url).toMatch(
      /^https:\/\/athena-preview\.up\.railway\.app\/p\/[A-Za-z0-9_-]{43}$/,
    );
    expect(result.expiresAt).toBe("2026-10-03T00:15:00.000Z");
    expect(JSON.stringify(f.write.mock.calls)).not.toContain(
      result.url!.split("/").at(-1),
    );
    expect(f.milestone).toHaveBeenCalled();
  });
  it("revokes a route when external health fails", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const result = await f.provider.expose(owner, company, repository, preview);
    expect(result.state).toBe("FAILED");
    expect(result.url).toBeNull();
    expect(f.write).toHaveBeenCalledTimes(2);
    expect(f.milestone).not.toHaveBeenCalled();
  });
  it.each([
    { company: owner },
    { repository: owner },
    { port: 4444 },
    { url: "https://untrusted.example/p/" + "a".repeat(43) },
    { healthStatus: "FAIL" as const },
    { expiresAt: at },
  ])("denies tenant, target, health and expiry violations %j", async (patch) => {
    const f = fixture();
    const {
      company: requestedCompany,
      repository: requestedRepository,
      ...override
    } = patch;
    await expect(
      f.provider.expose(
        owner,
        requestedCompany ?? company,
        requestedRepository ?? repository,
        { ...preview, ...override },
      ),
    ).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
  });
  it("does not fetch arbitrary health targets", async () => {
    const f = fixture();
    expect(await f.provider.healthCheck("http://127.0.0.1:3001/health")).toBe(false);
    expect(await f.provider.healthCheck("https://evil.example/")).toBe(false);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
