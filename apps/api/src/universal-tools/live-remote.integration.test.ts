import { CompanyListResponseSchema, CsrfTokenResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../app.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresUniversalToolStore } from "./postgres-store.js";
import { REVIEWED_REMOTE_MCP_MANIFESTS } from "./reviewed-manifests.js";

const databaseUrl = safeTestDatabaseUrl();
const enabled = process.env.ATHENA_LIVE_UNIVERSAL_MCP === "1";
const origin = "http://localhost:5173";
const schemaDigest = REVIEWED_REMOTE_MCP_MANIFESTS[0]!.schemaDigest;

describe.skipIf(!enabled || !databaseUrl)("live governed remote MCP read", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let app: FastifyInstance;
  const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
  const identities = new InMemoryIdentityStore();

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(databaseUrl!, "univlive281");
    database = isolated.database;
    cleanup = isolated.cleanup;
    app = await buildApi({
      corsOrigin: origin, privateNetworkRequired: true, nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"), governanceStore: governance,
      identityStore: identities,
      universalToolStore: new PostgresUniversalToolStore(database.pool),
      universalMcpAllowedHosts: ["mcp.deepwiki.com"],
      universalToolManifests: [...REVIEWED_REMOTE_MCP_MANIFESTS],
    });
  }, 60_000);
  afterAll(async () => { await app?.close(); await cleanup?.(); });

  it("uses authenticated review, exact authority, a real read, and a durable receipt", async () => {
    const register = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin },
      payload: { email: `univ-live-${crypto.randomUUID()}@example.com`, displayName: "Live Tool Owner", password: "Violet-Harbor-2026!" } });
    expect(register.statusCode).toBe(200);
    const cookieHeader = register.headers["set-cookie"];
    const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader)?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const companies = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json());
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-csrf-token": csrf, "x-company-id": companies.currentCompany.id };
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/providers", headers,
      payload: { id: "deepwiki.mcp", displayName: "DeepWiki", endpoint: "https://mcp.deepwiki.com/mcp", credentialReferenceId: null } })).statusCode).toBe(200);
    const discovered = await app.inject({ method: "POST", url: "/api/universal-tools/providers/deepwiki.mcp/discover", headers });
    expect(discovered.statusCode).toBe(200);
    expect(discovered.json()).toContainEqual(expect.objectContaining({ id: "deepwiki.mcp:read_wiki_structure", schemaDigest, enabled: false }));
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/tools/deepwiki.mcp:read_wiki_structure/review", headers, payload: { schemaDigest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/tools/deepwiki.mcp:read_wiki_structure/activate", headers })).statusCode).toBe(200);
    const invocationId = crypto.randomUUID();
    const started = performance.now();
    const response = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers,
      payload: { invocationId, toolId: "deepwiki.mcp:read_wiki_structure", arguments: { repoName: "modelcontextprotocol/servers" }, approvalId: null, idempotencyKey: null, requestedAt: new Date().toISOString() } });
    const wallLatencyMs = performance.now() - started;
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ invocationId, status: "SUCCEEDED", providerId: "deepwiki.mcp" });
    const rows = await database.pool.query<{ owner_id: string; status: string; result: { latencyMs: number; structuredOutput: { result: string } } }>(
      "SELECT owner_id,status,result FROM universal_tool_invocation_receipts WHERE invocation_id=$1", [invocationId]);
    expect(rows.rows[0]?.status).toBe("COMPLETED");
    expect(rows.rows[0]?.result.structuredOutput.result).toContain("Available pages");
    expect(rows.rows[0]?.result.latencyMs).toBeGreaterThan(0);
    expect(governance.listPolicyEvaluations(rows.rows[0]!.owner_id, 10).length).toBeGreaterThan(0);
    expect(identities.listAudit(rows.rows[0]!.owner_id, 100).some((event) =>
      event.eventType === "INTEGRATION_OPERATION_COMPLETED" && event.requestId !== "")).toBe(true);
    const telemetry = await app.inject({ method: "GET", url: "/api/universal-tools/telemetry", headers });
    expect(telemetry.statusCode).toBe(200);
    expect(telemetry.json()).toContainEqual(expect.objectContaining({ toolId: "deepwiki.mcp:read_wiki_structure", callCount: 1, successCount: 1 }));
    console.info(`Live remote MCP route latency: ${wallLatencyMs.toFixed(1)} ms; receipt latency: ${rows.rows[0]?.result.latencyMs} ms; cost: unavailable.`);
  }, 30_000);
});
