import { CompanyListResponseSchema, CsrfTokenResponseSchema, MarketingCampaignSchema, ObjectiveDashboardSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../app.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";

const origin = "http://localhost:5173";
const cookieFrom = (value: string | string[] | undefined) => {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error("Session cookie missing.");
  return header.split(";")[0]!;
};

describe("marketing campaign route security", () => {
  let app: FastifyInstance;
  afterEach(async () => { await app?.close(); });

  it.each([false, true])("preserves the configured private-network requirement (%s) in background coordination", async privateNetworkRequired => {
    let networkState: "PRIVATE_NETWORK" | "UNKNOWN" = "PRIVATE_NETWORK";
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired, nodeEnvironment: "test", logger: false,
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      networkVerifier: { verify: input => new StaticNetworkVerifier(networkState).verify(input) } });
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: "cloud-marketing@example.com", displayName: "Cloud Owner", password: "Violet-Harbor-2026!" } });
    const cookie = cookieFrom(registration.headers["set-cookie"]);
    const companyId = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json()).currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-company-id": companyId, "x-csrf-token": csrf };
    const created = await app.inject({ method: "POST", url: "/api/marketing-campaigns", headers,
      payload: { idempotencyKey: "cloud-marketing-network", title: "Research", productOrCompany: "Athena", objectiveType: "MARKET_RESEARCH" } });
    expect(created.statusCode).toBe(200);
    const campaign = MarketingCampaignSchema.parse(created.json());
    networkState = "UNKNOWN";
    const started = await app.inject({ method: "POST", url: `/api/marketing-campaigns/${campaign.id}/start`, headers, payload: {} });
    expect(started.statusCode).toBe(privateNetworkRequired ? 403 : 200);
    let status = "";
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise<void>(resolve => setImmediate(resolve));
      const response = await app.inject({ method: "GET", url: `/api/marketing-campaigns/${campaign.id}`, headers });
      status = MarketingCampaignSchema.parse(response.json<{ campaign: unknown }>().campaign).status;
      if (status === "BLOCKED" || privateNetworkRequired) break;
    }
    // The cloud profile reaches the ordinary governed provider check, which
    // blocks this fixture's unreviewed tool. Private profiles still deny start.
    expect(status).toBe(privateNetworkRequired ? "DRAFT" : "BLOCKED");
  });

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
    expect((await app.inject({ method: "POST", url: `${url}/${campaign.id}/pause`, headers: scoped, payload: {} })).statusCode).not.toBe(200);
    const paused = await app.inject({ method: "POST", url: `${url}/${campaign.id}/pause`, headers: { ...scoped, "x-csrf-token": csrf }, payload: {} });
    expect(paused.statusCode).toBe(200);
    expect(MarketingCampaignSchema.parse(paused.json()).status).toBe("PAUSED");
    const objectiveView = await app.inject({ method: "GET", url: "/api/objectives", headers: scoped });
    expect(objectiveView.statusCode).toBe(200);
    const dashboard = ObjectiveDashboardSchema.parse(objectiveView.json());
    const parent = dashboard.objectives.find(item => item.id === campaign.objectiveId)!;
    expect(parent).toMatchObject({ status: "PAUSED", executionSource: { kind: "MARKETING_CAMPAIGN", campaignId: campaign.id } });
    expect(dashboard.projects.filter(item => item.objectiveExecutionId === parent.id && item.status !== "CANCELLED").map(item => item.id).sort()).toEqual(campaign.deliverables.map(item => item.id).sort());
    const duplicateDispatch = await app.inject({ method: "POST", url: `/api/objectives/${parent.id}/activate`, headers: { ...scoped, "x-csrf-token": csrf }, payload: { idempotencyKey: "do-not-dispatch-generic-plan" } });
    expect(duplicateDispatch.statusCode).toBe(409);
    expect(duplicateDispatch.body).toContain("CAMPAIGN_CONTROL_REQUIRED");
    expect((await app.inject({ method: "GET", url: `${url}/${campaign.id}`, headers: scoped })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${url}/${campaign.id}`, headers: { ...scoped, "x-company-id": crypto.randomUUID() } })).statusCode).not.toBe(200);
  });
});
