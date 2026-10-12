import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApi } from "../../app.js";
import { fixtureRequest } from "./fixtures.js";
const origin = "http://localhost:5173";
describe("distillation HTTP authority", () => {
  let app: FastifyInstance, cookie: string, csrf: string;
  beforeAll(async () => {
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false });
    const auth = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin }, payload: { email: "distillation-owner@example.test", displayName: "Fixture Owner", password: "Violet-Harbor-2026!" } });
    expect(auth.statusCode).toBe(200);
    const values = auth.headers["set-cookie"];
    cookie = (Array.isArray(values) ? values : [values]).filter((v): v is string => typeof v === "string").map(v => v.split(";")[0]).join("; ");
    csrf = (await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json<{ token: string }>().token;
  });
  afterAll(async () => { await app.close(); });
  it("keeps owner metadata authenticated and has no import/register/delete endpoints", async () => {
    expect((await app.inject({ method: "GET", url: "/api/athena-distillation" })).statusCode).toBe(401);
    const view = await app.inject({ method: "GET", url: "/api/athena-distillation", headers: { cookie } });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({ models: [], liveAcceptance: "NOT_VERIFIED" });
    expect(view.headers["cache-control"]).toBe("no-store");
    for (const name of ["trainers", "artifacts", "evaluations", "register"]) expect((await app.inject({ method: "POST", url: `/api/athena-distillation/${name}`, headers: { cookie, origin, "x-csrf-token": csrf }, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/api/athena-distillation", headers: { cookie, origin, "x-csrf-token": csrf } })).statusCode).toBe(404);
  });
  it("requires exact trusted origin/CSRF and rejects invented authority fields", async () => {
    const request = { method: "POST" as const, url: "/api/athena-distillation/prepare", payload: fixtureRequest };
    expect((await app.inject({ ...request, headers: { cookie, origin } })).statusCode).toBe(403);
    expect((await app.inject({ ...request, headers: { cookie, origin: "https://untrusted.example", "x-csrf-token": csrf } })).statusCode).toBe(403);
    expect((await app.inject({ ...request, headers: { cookie, origin, "x-csrf-token": csrf }, payload: { ...fixtureRequest, evidence: "REAL", trainerPath: "/tmp/arbitrary" } })).statusCode).toBe(400);
  });
  it("normal login, voice and caller supplied evaluation cannot authorize model work", async () => {
    const headers = { cookie, origin, "x-csrf-token": csrf };
    expect((await app.inject({ method: "POST", url: "/api/athena-distillation/prepare", headers, payload: fixtureRequest })).statusCode).toBe(409);
    for (const action of ["TRAIN", "EVALUATE", "ACTIVATE", "ROLLBACK", "RETIRE"]) expect((await app.inject({ method: "POST", url: "/api/athena-distillation/actions", headers, payload: { action, runId: crypto.randomUUID() } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/athena-distillation/actions", headers, payload: { action: "ACTIVATE", runId: crypto.randomUUID(), recentAuthentication: true, source: "voice", evaluation: { passed: true } } })).statusCode).toBe(400);
    const routing = await app.inject({ method: "GET", url: "/api/athena-distillation/routing-evidence", headers: { cookie } });
    expect(routing.json()).toMatchObject({ authority: "DETERMINISTIC_SERVER_POLICY", learnedRouting: "SHADOW_NOT_ENABLED", cohorts: [] });
  });
});
