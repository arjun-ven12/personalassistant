import { CompanyListResponseSchema, CsrfTokenResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi } from "../app.js";
import { StaticNetworkVerifier } from "../identity/network.js";

const origin = "http://localhost:5173";
describe("self-improvement owner route boundaries", () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });
  it("requires governed owner context and never guesses an unregistered self repository", async () => {
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: true,
      logger: false, nodeEnvironment: "test", networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK") });
    const url = "/api/self-improvement";
    const payload = { request: "Make your Engineering dashboard cards compact", idempotencyKey: "self-route-identity" };
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: "self-route@example.com", displayName: "Owner", password: "Violet-Harbor-2026!" } });
    expect(registration.statusCode).toBe(200);
    const rawCookie = registration.headers["set-cookie"];
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie)!.split(";")[0]!;
    const companies = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies",
      headers: { cookie, origin } })).json());
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf",
      headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-company-id": companies.currentCompany.id, "x-csrf-token": csrf };
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "x-csrf-token": "" }, payload })).statusCode).not.toBe(200);
    expect((await app.inject({ method: "POST", url, headers: { ...headers, origin: "https://untrusted.example" }, payload })).statusCode).not.toBe(200);
    expect((await app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(403);
    for (const extra of [{ riskLevel: "LOW" }, { repositoryId: crypto.randomUUID() }, { engineeringMode: "FAST" }])
      expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, ...extra } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "x-company-id": crypto.randomUUID() }, payload })).statusCode).not.toBe(200);
    const listed = await app.inject({ method: "GET", url, headers });
    expect(listed.json()).toEqual({ objectives: [] });
    expect((await app.inject({ method: "POST", url: `${url}/${crypto.randomUUID()}/reject`, headers,
      payload: { reason: null } })).statusCode).not.toBe(200);
  });
});
