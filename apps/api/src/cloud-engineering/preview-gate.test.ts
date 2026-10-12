import { createHash } from "node:crypto";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createCloudPreviewGate, CloudPreviewGrantSchema } from "./preview-gate.js";
const workspace = crypto.randomUUID(),
  company = crypto.randomUUID(),
  token = "a".repeat(43),
  now = Date.parse("2026-10-03T00:00:00.000Z");
const grant = {
  workspaceId: workspace,
  companyId: company,
  previewId: crypto.randomUUID(),
  generation: 1,
  port: 4173,
  healthPath: "/",
  tokenHash: createHash("sha256").update(token).digest("hex"),
  expiresAt: new Date(now + 60_000).toISOString(),
};
async function request(raw: unknown, path: string, clock = now) {
  const gate = createCloudPreviewGate(
    { workspaceId: workspace, companyId: company, generation: 1 },
    () => Promise.resolve(raw),
    () => clock,
  );
  gate.listen(0, "127.0.0.1");
  await once(gate, "listening");
  const address = gate.address();
  if (!address || typeof address === "string") throw Error();
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      redirect: "manual",
    });
  } finally {
    gate.closeAllConnections();
    await new Promise<void>((resolve) => gate.close(() => resolve()));
  }
}
describe("fixed cloud preview gate", () => {
  it("requires an owner-issued capability link before serving the workspace", async () => {
    const r = await request(grant, `/p/${token}`);
    expect(r.status).toBe(303);
    expect(r.headers.get("set-cookie")).toContain("Secure; HttpOnly; SameSite=Strict");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("location")).toBe("/");
    expect((await request(grant, "/")).status).toBe(404);
  });
  it.each([
    { ...grant, companyId: crypto.randomUUID() },
    { ...grant, workspaceId: crypto.randomUUID() },
    { ...grant, port: 22 },
    { ...grant, generation: 2 },
    { ...grant, upstream: "http://169.254.169.254" },
  ])("denies cross-scope or arbitrary targets", async (raw) => {
    expect((await request(raw, `/p/${token}`)).status).toBe(404);
  });
  it("rejects expired, revoked and incorrect preview credentials", async () => {
    expect((await request(grant, `/p/${token}`, now + 60_000)).status).toBe(404);
    expect(
      (await request({ ...grant, tokenHash: "0".repeat(64) }, `/p/${token}`)).status,
    ).toBe(404);
    expect((await request(grant, `/p/${"b".repeat(43)}`)).status).toBe(404);
  });
  it("does not accept a host, port or executable path in its grant", () => {
    expect(() => CloudPreviewGrantSchema.parse({ ...grant, host: "other" })).toThrow();
  });
});
