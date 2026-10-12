import { CompanyCredentialReferenceSchema, CompanyIntegrationBindingSchema, CompanyListResponseSchema, CsrfTokenResponseSchema, IntegrationPermissionSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApi } from "../app.js";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { DeterministicBusinessProvider } from "../integrations/business-providers.js";
import { InMemoryIntegrationStore } from "../integrations/store.js";
import { InMemoryUniversalToolStore } from "./store.js";

const origin = "http://localhost:5173";
describe("finite reviewed production adapters", () => {
  let app: FastifyInstance;
  afterEach(async () => app?.close());

  it("routes a native provider status read through review, authority, receipt, and audit", async () => {
    const store = new InMemoryUniversalToolStore();
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: true, nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false), universalToolStore: store });
    const registered = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: "native-universal@example.com", displayName: "Native Owner", password: "Violet-Harbor-2026!" } });
    expect(registered.statusCode).toBe(200);
    const setCookie = registered.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const companyId = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json()).currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-company-id": companyId, "x-csrf-token": csrf };
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/finite-providers", headers,
      payload: { providerId: "analytics", credentialReferenceId: null } })).statusCode).not.toBe(200);
    const discovered = await app.inject({ method: "POST", url: "/api/universal-tools/finite-providers", headers,
      payload: { providerId: "athena.native", credentialReferenceId: null } });
    expect(discovered.statusCode).toBe(200);
    const tool = z.array(z.object({ id: z.string(), schemaDigest: z.string(), enabled: z.boolean() })).parse(discovered.json())[0]!;
    expect(tool).toMatchObject({ id: "athena.native:provider_health", enabled: false });
    const focus = z.array(z.object({ id: z.string(), schemaDigest: z.string(), enabled: z.boolean() })).parse(discovered.json()).find((item) => item.id === "athena.native:focus_vscode");
    expect(focus).toMatchObject({ enabled: false });
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/review`, headers,
      payload: { schemaDigest: tool.schemaDigest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/activate`, headers })).statusCode).toBe(200);
    const invocationId = crypto.randomUUID();
    const result = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers,
      payload: { invocationId, toolId: tool.id, arguments: {}, approvalId: null, idempotencyKey: null, requestedAt: new Date().toISOString() } });
    const nativeResult = z.object({ status: z.literal("SUCCEEDED"), structuredOutput: z.object({ registeredProviders: z.number(), healthyProviders: z.number() }) }).parse(result.json());
    expect(nativeResult.structuredOutput.registeredProviders).toBeGreaterThanOrEqual(0);
    expect(nativeResult.structuredOutput.healthyProviders).toBeGreaterThanOrEqual(0);
    if (!focus) throw new Error("Reviewed native focus capability missing.");
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${focus.id}/review`, headers,
      payload: { schemaDigest: focus.schemaDigest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${focus.id}/activate`, headers })).statusCode).toBe(200);
    const focusInvocationId = crypto.randomUUID();
    const focusRequest = { invocationId: focusInvocationId, toolId: focus.id, arguments: {}, approvalId: null,
      idempotencyKey: focusInvocationId, requestedAt: new Date().toISOString() };
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: focusRequest })).json()).toMatchObject({ status: "APPROVAL_REQUIRED" });
  });

  it("routes an analytics API read through the same company-scoped gateway and verified business runtime", async () => {
    const companyData = new InMemoryCompanyDataStore();
    const integrationStore = new InMemoryIntegrationStore();
    const analytics = new DeterministicBusinessProvider("analytics", new Set(["analytics.query_metric"]));
    analytics.setMetric("active_users", 42, "count");
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: true, nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      universalToolStore: new InMemoryUniversalToolStore(), companyDataStore: companyData,
      integrationStore, businessProviders: [analytics] });
    const registered = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: "api-universal@example.com", displayName: "API Owner", password: "Violet-Harbor-2026!" } });
    expect(registered.statusCode).toBe(200);
    const ownerId = z.object({ user: z.object({ id: z.string().uuid() }) }).parse(registered.json()).user.id;
    const setCookie = registered.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const companyId = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json()).currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-company-id": companyId, "x-csrf-token": csrf };
    const credentialId = crypto.randomUUID();
    const at = new Date().toISOString();
    companyData.saveCredentialReference(CompanyCredentialReferenceSchema.parse({ id: credentialId, ownerId, companyId,
      provider: "analytics", secretLocator: "test.analytics", status: "READY", lastVerifiedAt: at, createdAt: at, updatedAt: at }));
    companyData.saveIntegrationBinding(CompanyIntegrationBindingSchema.parse({ id: crypto.randomUUID(), ownerId, companyId,
      provider: "analytics", integrationType: "analytics", integrationId: "analytics", credentialRef: credentialId,
      status: "READY", capabilitiesExposed: ["analytics.query_metric"], metadata: {}, lastSyncAt: null, createdAt: at, updatedAt: at }));
    companyScope.run({ ownerId, companyId, role: "OWNER", requestId: crypto.randomUUID() }, () => integrationStore.savePermission(IntegrationPermissionSchema.parse({ id: crypto.randomUUID(), ownerId,
      integrationId: "analytics", capabilityId: "analytics.metric.read", state: "granted", approvalRequired: false,
      rateLimitPerMinute: 30, grantedAt: at, updatedAt: at })));
    const discovered = await app.inject({ method: "POST", url: "/api/universal-tools/finite-providers", headers,
      payload: { providerId: "analytics", credentialReferenceId: credentialId } });
    expect(discovered.statusCode).toBe(200);
    const tool = z.array(z.object({ id: z.string(), schemaDigest: z.string(), enabled: z.boolean() })).parse(discovered.json())[0]!;
    expect(tool).toMatchObject({ id: "analytics:read_metric", enabled: false });
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/review`, headers,
      payload: { schemaDigest: tool.schemaDigest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/activate`, headers })).statusCode).toBe(200);
    const invocation = { invocationId: crypto.randomUUID(), toolId: tool.id,
      arguments: { metricId: "active_users", windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-09-30T00:00:00.000Z" },
      approvalId: null, idempotencyKey: null, requestedAt: at };
    const result = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: invocation });
    expect(result.json()).toMatchObject({ status: "SUCCEEDED", structuredOutput: { metricId: "active_users", value: 42, unit: "count" } });
    expect(analytics.executionCount).toBe(1);
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: invocation })).json()).toMatchObject({ status: "SUCCEEDED" });
    expect(analytics.executionCount).toBe(1);
  });
});
