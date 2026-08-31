import { CompanyListResponseSchema, CsrfTokenResponseSchema, ExecutiveObjectiveSchema } from "@alexa-control/shared";
import type { Attributes } from "@opentelemetry/api";
import type { FastifyInstance } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "../app.js";
import { InMemoryExecutiveStore } from "../executive/store.js";
import { companyScope } from "./scope.js";
import type { TelemetrySink } from "../telemetry/service.js";

const origin = "http://localhost:5173";
const ownerId = "10000000-0000-4000-8000-000000000001";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";

const cookieFrom = (headers: OutgoingHttpHeaders) => {
  const header = headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected session cookie.");
  return value.split(";")[0]!;
};

describe("Phase 25.1 company isolation", () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;
  const spans: Array<{ name: string; attributes: Attributes }> = [];
  const telemetry: TelemetrySink = {
    async withSpan(name, attributes, operation) { spans.push({ name, attributes }); return operation(); },
    async shutdown() {},
  };

  beforeEach(async () => {
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: false, nodeEnvironment: "test", logger: false, telemetry });
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin }, payload: { email: "companies@example.com", displayName: "Owner", password: "Violet-Harbor-2026!" } });
    cookie = cookieFrom(registration.headers);
    const token = await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } });
    csrf = CsrfTokenResponseSchema.parse(token.json()).token;
  });

  afterEach(async () => { spans.length = 0; await app.close(); });

  it("creates one default company and persists an explicit session selection", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/companies", headers: { cookie } });
    expect(initial.statusCode, initial.body).toBe(200);
    const first = CompanyListResponseSchema.parse(initial.json());
    expect(first.companies).toHaveLength(1);
    expect(first.currentCompany.name).toBe("Default Company");

    const created = await app.inject({ method: "POST", url: "/api/companies", headers: { cookie, origin, "x-csrf-token": csrf }, payload: { name: "Company B", slug: "company-b", timezone: "Asia/Singapore", defaultCurrency: "SGD" } });
    expect(created.statusCode).toBe(200);
    const second = CompanyListResponseSchema.parse(created.json());
    expect(second.currentCompany.name).toBe("Company B");
    expect(second.companies).toHaveLength(2);

    const restored = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie } })).json());
    expect(restored.currentCompany.id).toBe(second.currentCompany.id);
  });

  it("does not disclose a company outside the authenticated membership list", async () => {
    const response = await app.inject({ method: "GET", url: "/api/objectives", headers: { cookie, "x-company-id": crypto.randomUUID() } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "COMPANY_NOT_FOUND" } });
    expect(spans.at(-1)?.attributes).not.toHaveProperty("prompt");
    expect(spans.at(-1)?.attributes).not.toHaveProperty("body");
  });

  it("partitions objectives with overlapping names by company before retrieval", () => {
    const store = new InMemoryExecutiveStore();
    const at = new Date().toISOString();
    const objective = (id: string) => ExecutiveObjectiveSchema.parse({ id, ownerId, goalId: crypto.randomUUID(), title: "Growth", description: null, status: "ACTIVE", targetDate: null, metric: null, targetValue: null, currentValue: null, progress: 0, confidence: 0.5, taskIds: [], kpiId: null, createdAt: at, updatedAt: at, completedAt: null });
    companyScope.run({ ownerId, companyId: companyA, role: "OWNER", requestId: "a" }, () => store.saveObjective(objective(crypto.randomUUID())));
    companyScope.run({ ownerId, companyId: companyB, role: "OWNER", requestId: "b" }, () => store.saveObjective(objective(crypto.randomUUID())));
    const a = companyScope.run({ ownerId, companyId: companyA, role: "OWNER", requestId: "read-a" }, () => store.listObjectives(ownerId));
    const b = companyScope.run({ ownerId, companyId: companyB, role: "OWNER", requestId: "read-b" }, () => store.listObjectives(ownerId));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.id).not.toBe(b[0]!.id);
  });
});
