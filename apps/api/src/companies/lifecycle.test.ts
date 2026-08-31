import { CompanyDetailResponseSchema, CompanyListResponseSchema, CsrfTokenResponseSchema, UserSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../app.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import type { AuthenticatedIdentity } from "../identity/types.js";
import { CompanyService } from "./service.js";
import { InMemoryCompanyStore } from "./store.js";

const origin = "http://localhost:5173";
const cookieFrom = (headers: OutgoingHttpHeaders) => {
  const header = headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected session cookie.");
  return value.split(";")[0]!;
};

const authenticate = async (app: FastifyInstance, suffix: string) => {
  const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin }, payload: { email: `lifecycle-${suffix}@example.com`, displayName: "Owner", password: "Violet-Harbor-2026!" } });
  const cookie = cookieFrom(registration.headers);
  const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
  return { cookie, csrf, headers: { cookie, origin, "x-csrf-token": csrf } };
};

describe("Phase 25.2 company lifecycle", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it("provisions a minimal zero-credit company and deduplicates creation retries", async () => {
    const app = await buildApi({ corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false });
    apps.push(app);
    const auth = await authenticate(app, "idempotent");
    const payload = { name: "Atlas Labs", industry: "Research", idempotencyKey: "create-atlas-labs-001" };
    const first = CompanyListResponseSchema.parse((await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload })).json());
    const second = CompanyListResponseSchema.parse((await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload })).json());
    expect(second.companies).toHaveLength(2);
    expect(second.currentCompany.id).toBe(first.currentCompany.id);

    const detail = CompanyDetailResponseSchema.parse((await app.inject({ method: "GET", url: `/api/companies/${first.currentCompany.id}`, headers: { cookie: auth.cookie } })).json());
    expect(detail.company.status).toBe("ACTIVE");
    expect(detail.company.memoryScopeId).toBe(`company:${detail.company.id}:memory`);
    expect(detail.company.economyAccountId).toBe(`company:${detail.company.id}:economy`);
    expect(detail.company.governorAgentId).toBe(`company:${detail.company.id}:governor:dormant`);
    expect(detail.company.settings).toMatchObject({ starterCredits: 0, autonomyLevel: "SUPERVISED", defaultApprovalPolicy: "SUPERVISED" });
    expect(detail.provisioning?.steps.every((step) => step.status === "COMPLETED")).toBe(true);
  });

  it("keeps paused and archived data readable while blocking new tenant mutations", async () => {
    const app = await buildApi({ corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false });
    apps.push(app);
    const auth = await authenticate(app, "readonly");
    const created = CompanyListResponseSchema.parse((await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload: { name: "Read Only Co", idempotencyKey: "read-only-company-001" } })).json());
    const companyId = created.currentCompany.id;

    await app.inject({ method: "POST", url: `/api/companies/${companyId}/pause`, headers: auth.headers, payload: {} });
    expect((await app.inject({ method: "GET", url: "/api/objectives", headers: { cookie: auth.cookie, "x-company-id": companyId } })).statusCode).toBe(200);
    const blocked = await app.inject({ method: "POST", url: "/api/objectives", headers: { ...auth.headers, "x-company-id": companyId }, payload: {} });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: "COMPANY_MUTATIONS_BLOCKED" } });

    const resumed = CompanyDetailResponseSchema.parse((await app.inject({ method: "POST", url: `/api/companies/${companyId}/resume`, headers: auth.headers, payload: {} })).json());
    expect(resumed.company.status).toBe("ACTIVE");
    const archived = CompanyListResponseSchema.parse((await app.inject({ method: "POST", url: `/api/companies/${companyId}/archive`, headers: auth.headers, payload: {} })).json());
    expect(archived.companies.find((item) => item.id === companyId)?.status).toBe("ARCHIVED");
    expect((await app.inject({ method: "GET", url: "/api/objectives", headers: { cookie: auth.cookie, "x-company-id": companyId } })).statusCode).toBe(200);
  });

  it("fails closed at a provisioning checkpoint and resumes without duplicates", async () => {
    let failOnce = true;
    const app = await buildApi({
      corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false,
      companyProvisioningHook: (step) => { if (step === "CAPABILITY_PROFILE_READY" && failOnce) { failOnce = false; throw new Error("injected"); } },
    });
    apps.push(app);
    const auth = await authenticate(app, "repair");
    const failed = await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload: { name: "Repair Co", idempotencyKey: "repair-company-001" } });
    expect(failed.statusCode).toBe(409);
    const list = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie: auth.cookie } })).json());
    const company = list.companies.find((item) => item.name === "Repair Co")!;
    expect(company.status).toBe("FAILED_PROVISIONING");

    const repaired = CompanyDetailResponseSchema.parse((await app.inject({ method: "POST", url: `/api/companies/${company.id}/retry-provisioning`, headers: auth.headers, payload: {} })).json());
    expect(repaired.company.status).toBe("ACTIVE");
    expect(repaired.provisioning?.steps.every((step) => step.status === "COMPLETED")).toBe(true);
    expect(CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie: auth.cookie } })).json()).companies).toHaveLength(2);
  });

  it("enforces the owner-configured company limit before creating a draft", async () => {
    const app = await buildApi({ corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false, companyLimit: 1 });
    apps.push(app);
    const auth = await authenticate(app, "limit");
    const response = await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload: { name: "Over Limit", idempotencyKey: "over-limit-company-001" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "COMPANY_LIMIT_REACHED" } });
    const updated = CompanyListResponseSchema.parse((await app.inject({ method: "PATCH", url: "/api/companies/limit", headers: auth.headers, payload: { companyLimit: 2 } })).json());
    expect(updated.companyLimit).toBe(2);
    const created = await app.inject({ method: "POST", url: "/api/companies", headers: auth.headers, payload: { name: "Within Limit", idempotencyKey: "within-limit-company-001" } });
    expect(created.statusCode).toBe(200);
  });

  it("handles explicit company conversation commands without model authority", async () => {
    const identities = new InMemoryIdentityStore();
    const at = "2026-09-01T00:00:00.000Z";
    const user = UserSchema.parse({ id: crypto.randomUUID(), email: "conversation@example.com", displayName: "Owner", passwordHash: "hash", createdAt: at, updatedAt: at, lastLoginAt: null, accountStatus: "ACTIVE" });
    const session = { id: crypto.randomUUID(), userId: user.id, tokenHash: "token", createdAt: at, expiresAt: "2026-09-02T00:00:00.000Z", idleExpiresAt: "2026-09-02T00:00:00.000Z", absoluteExpiresAt: "2026-09-02T00:00:00.000Z", lastSeenAt: at, revokedAt: null, revocationReason: null, ipAddress: "127.0.0.1", userAgent: "test" };
    identities.createUser(user);
    identities.createSession(session);
    const identity: AuthenticatedIdentity = { user, session };
    const service = new CompanyService(new InMemoryCompanyStore(), identities, () => new Date(at));

    expect(await service.handleConversation(identity, "Create a company named Northstar", { requestId: "conversation" })).toContain("zero starter credits");
    expect((await service.list(identity)).companies).toHaveLength(2);
    expect(await service.handleConversation(identity, "What company am I in?", { requestId: "conversation" })).toBe("You are currently in Northstar.");
    expect(await service.handleConversation(identity, "Switch to Default Company", { requestId: "conversation" })).toBe("Switched to Default Company.");
    expect(await service.handleConversation(identity, "Create a company", { requestId: "conversation" })).toBe("What should the new company be called?");
  });

  it("provisions 25 lightweight companies without materializing worker fleets", async () => {
    const identities = new InMemoryIdentityStore();
    const store = new InMemoryCompanyStore();
    const at = "2026-09-01T00:00:00.000Z";
    const user = UserSchema.parse({ id: crypto.randomUUID(), email: "scale@example.com", displayName: "Owner", passwordHash: "hash", createdAt: at, updatedAt: at, lastLoginAt: null, accountStatus: "ACTIVE" });
    const session = { id: crypto.randomUUID(), userId: user.id, tokenHash: "scale-token", createdAt: at, expiresAt: "2026-09-02T00:00:00.000Z", idleExpiresAt: "2026-09-02T00:00:00.000Z", absoluteExpiresAt: "2026-09-02T00:00:00.000Z", lastSeenAt: at, revokedAt: null, revocationReason: null, ipAddress: "127.0.0.1", userAgent: "test" };
    identities.createUser(user);
    identities.createSession(session);
    const identity: AuthenticatedIdentity = { user, session };
    const service = new CompanyService(store, identities, () => new Date(at), 30);
    for (let index = 1; index <= 25; index += 1) {
      await service.create(identity, { name: `Dormant Company ${index}`, idempotencyKey: `scale-company-${index.toString().padStart(3, "0")}` });
    }
    const companies = store.listCompanies(user.id);
    expect(companies).toHaveLength(26);
    expect(companies.slice(1).every((company) => company.status === "ACTIVE" && company.settings.starterCredits === 0 && company.governorAgentId?.endsWith(":governor:dormant"))).toBe(true);
  });
});
