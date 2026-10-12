import { CompanyListResponseSchema, CsrfTokenResponseSchema, MarketingCampaignSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../app.js";
import { StaticNetworkVerifier } from "../identity/network.js";

const origin = "http://localhost:5173";
const cookieFrom = (value: string | string[] | undefined) => {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error("Session cookie missing.");
  return header.split(";")[0]!;
};

describe("marketing campaign route security", () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });

  it("requires authentication, exact company scope, CSRF, and trusted origin for drafts", async () => {
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: true,
      nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK") });
    const payload = { idempotencyKey: "marketing-route-test", title: "Brand package",
      productOrCompany: "Sample Product", objectiveType: "BRAND_PACKAGE" };
    const url = "/api/marketing-campaigns";
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);

    const registration = await app.inject({ method: "POST", url: "/api/auth/register",
      headers: { origin }, payload: { email: "marketing-route@example.com",
        displayName: "Marketing Owner", password: "Violet-Harbor-2026!" } });
    expect(registration.statusCode).toBe(200);
    const cookie = cookieFrom(registration.headers["set-cookie"]);
    const companies = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies",
      headers: { cookie, origin } })).json());
    const companyId = companies.currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf",
      headers: { cookie, origin } })).json()).token;
    const scoped = { cookie, origin, "x-company-id": companyId };

    expect((await app.inject({ method: "POST", url, headers: scoped, payload })).statusCode).not.toBe(200);
    expect((await app.inject({ method: "POST", url, headers: { ...scoped, origin: "https://untrusted.example", "x-csrf-token": csrf }, payload })).statusCode).not.toBe(200);
    const created = await app.inject({ method: "POST", url,
      headers: { ...scoped, "x-csrf-token": csrf }, payload });
    expect(created.statusCode).toBe(200);
    const campaign = MarketingCampaignSchema.parse(created.json());
    expect(campaign.companyId).toBe(companyId);
    expect((await app.inject({ method: "GET", url: `${url}/${campaign.id}`, headers: scoped })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${url}/${campaign.id}`, headers: { ...scoped, "x-company-id": crypto.randomUUID() } })).statusCode).not.toBe(200);
  });
});
