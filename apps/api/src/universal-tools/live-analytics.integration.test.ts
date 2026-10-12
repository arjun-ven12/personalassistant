import { CompanyCredentialReferenceSchema, CompanyIntegrationBindingSchema, CompanyListResponseSchema, CsrfTokenResponseSchema, IntegrationPermissionSchema, UniversalToolResultSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApi } from "../app.js";
import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { GoogleAnalytics4Provider } from "../integrations/commercial-read-providers.js";
import { AllowlistedEnvironmentSecretResolver } from "../integrations/secret-resolver.js";
import { InMemoryIntegrationStore } from "../integrations/store.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresUniversalToolStore } from "./postgres-store.js";

const databaseUrl = safeTestDatabaseUrl();
const enabled = process.env.ATHENA_LIVE_UNIVERSAL_GA4 === "1";
const origin = "http://localhost:5173";
const metricId = process.env.ATHENA_GA4_TEST_METRIC_ID ?? "activeUsers";
const end = new Date();
const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1_000);

/** Opt-in live read. The credential is supplied by server bootstrap, never the test source. */
describe.skipIf(!enabled || !databaseUrl || !process.env.GOOGLE_ANALYTICS_CREDENTIAL_JSON)("live governed GA4 universal API read", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let app: FastifyInstance;
  const companyData = new InMemoryCompanyDataStore();
  const integrations = new InMemoryIntegrationStore();
  const identity = new InMemoryIdentityStore();
  const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(databaseUrl!, "univga4281");
    database = isolated.database;
    cleanup = isolated.cleanup;
    app = await buildApi({ corsOrigin: origin, privateNetworkRequired: true, nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"), identityStore: identity,
      governanceStore: governance, companyDataStore: companyData, integrationStore: integrations,
      universalToolStore: new PostgresUniversalToolStore(database.pool),
      integrationSecretResolver: new AllowlistedEnvironmentSecretResolver({ "analytics:ga4": process.env.GOOGLE_ANALYTICS_CREDENTIAL_JSON }),
      businessProviders: [new GoogleAnalytics4Provider()] });
  }, 60_000);
  afterAll(async () => { await app?.close(); await cleanup?.(); });

  it("returns a verified company-bound metric through the authenticated gateway", async () => {
    const registered = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: `univ-ga4-${crypto.randomUUID()}@example.com`, displayName: "GA4 Test Owner", password: "Violet-Harbor-2026!" } });
    expect(registered.statusCode).toBe(200);
    const ownerId = z.object({ user: z.object({ id: z.string().uuid() }) }).parse(registered.json()).user.id;
    const setCookie = registered.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const companyId = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json()).currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-csrf-token": csrf, "x-company-id": companyId };
    const at = new Date().toISOString();
    const credentialId = crypto.randomUUID();
    companyData.saveCredentialReference(CompanyCredentialReferenceSchema.parse({ id: credentialId, ownerId, companyId,
      provider: "analytics", secretLocator: "ga4", status: "READY", lastVerifiedAt: at, createdAt: at, updatedAt: at }));
    companyData.saveIntegrationBinding(CompanyIntegrationBindingSchema.parse({ id: crypto.randomUUID(), ownerId, companyId,
      provider: "analytics", integrationType: "analytics", integrationId: "analytics", credentialRef: credentialId,
      status: "READY", capabilitiesExposed: ["analytics.query_metric"], metadata: {}, lastSyncAt: null, createdAt: at, updatedAt: at }));
    companyScope.run({ ownerId, companyId, role: "OWNER", requestId: crypto.randomUUID() }, () =>
      integrations.savePermission(IntegrationPermissionSchema.parse({ id: crypto.randomUUID(), ownerId, integrationId: "analytics",
        capabilityId: "analytics.metric.read", state: "granted", approvalRequired: false, rateLimitPerMinute: 30,
        grantedAt: at, updatedAt: at })));
    const discovered = await app.inject({ method: "POST", url: "/api/universal-tools/finite-providers", headers,
      payload: { providerId: "analytics", credentialReferenceId: credentialId } });
    expect(discovered.statusCode).toBe(200);
    const tool = z.array(z.object({ id: z.string(), schemaDigest: z.string(), enabled: z.boolean() })).parse(discovered.json())[0]!;
    expect(tool).toMatchObject({ id: "analytics:read_metric", enabled: false });
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/review`, headers,
      payload: { schemaDigest: tool.schemaDigest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/tools/${tool.id}/activate`, headers })).statusCode).toBe(200);
    const invocationId = crypto.randomUUID();
    const started = performance.now();
    const response = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers,
      payload: { invocationId, toolId: tool.id, arguments: { metricId, windowStart: start.toISOString(), windowEnd: end.toISOString() },
        approvalId: null, idempotencyKey: null, requestedAt: at } });
    const latencyMs = performance.now() - started;
    expect(response.statusCode).toBe(200);
    const result = UniversalToolResultSchema.parse(response.json());
    expect(result.status).toBe("SUCCEEDED");
    const observation = z.object({ status: z.literal("VERIFIED"), metricId: z.string(), value: z.number().finite(), unit: z.string() }).parse(result.structuredOutput);
    expect(observation.metricId).toBe(metricId);
    const receipts = await database.pool.query<{ status: string }>("SELECT status FROM universal_tool_invocation_receipts WHERE invocation_id=$1", [invocationId]);
    expect(receipts.rows[0]?.status).toBe("COMPLETED");
    expect(governance.listPolicyEvaluations(ownerId, 10).length).toBeGreaterThan(0);
    expect(identity.listAudit(ownerId, 100).some((event) => event.eventType === "INTEGRATION_OPERATION_COMPLETED")).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/universal-tools/telemetry", headers })).json()).toContainEqual(expect.objectContaining({ toolId: tool.id, successCount: 1 }));
    console.info(`Live GA4 universal route latency: ${latencyMs.toFixed(1)} ms; provider cost: unavailable.`);
  }, 30_000);
});
