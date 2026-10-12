import { CompanyListResponseSchema, CsrfTokenResponseSchema } from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { buildApi } from "../app.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { StaticNetworkVerifier } from "../identity/network.js";
import { McpTextOutputSchema } from "./mcp-client.js";
import { normalizeSchema, schemaDigest } from "./schema.js";
import { InMemoryUniversalToolStore } from "./store.js";

const origin = "http://localhost:5173";
const endpoint = "https://mcp.example.test/mcp";
const inputSchema = { type: "object", properties: { query: { type: "string", maxLength: 80 } }, required: ["query"], additionalProperties: false };
const normalizedInput = normalizeSchema(inputSchema);
const normalizedOutput = normalizeSchema(McpTextOutputSchema);
const digest = schemaDigest({ type: "object", properties: { input: normalizedInput, output: normalizedOutput }, required: ["input", "output"], additionalProperties: false });
const cookieFrom = (value: string | string[] | undefined) => {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error("Session cookie missing.");
  return header.split(";")[0]!;
};

describe("authenticated universal tool production route", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    vi.unstubAllGlobals();
    await app?.close();
  });

  it("registers a reviewed remote MCP read and invokes only its exact enabled schema", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected JSON request body.");
      const body = JSON.parse(init.body) as { id?: number; method: string };
      if (body.method === "notifications/initialized") return Promise.resolve(new Response(null, { status: 202 }));
      const result = body.method === "initialize"
        ? { protocolVersion: "2025-06-18", capabilities: {} }
        : body.method === "tools/list"
          ? { tools: [{ name: "lookup", description: "Read bounded metadata", inputSchema }] }
          : { content: [{ type: "text", text: "safe result" }] };
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetcher);
    const store = new InMemoryUniversalToolStore();
    app = await buildApi({
      corsOrigin: origin, privateNetworkRequired: true, nodeEnvironment: "test", logger: false,
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      universalToolStore: store,
      universalMcpAllowedHosts: ["mcp.example.test"],
      universalToolManifests: [{ providerId: "sample.mcp", toolName: "lookup", schemaDigest: digest,
        providerVersion: "2025-06-18", governanceToolName: "universal.external_read",
        operationClass: "READ", riskLevel: "read_only", approvalRequirement: "none", credentialRequired: false }],
    });
    const registration = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin }, payload: { email: "universal@example.com", displayName: "Universal Owner", password: "Violet-Harbor-2026!" } });
    expect(registration.statusCode).toBe(200);
    const cookie = cookieFrom(registration.headers["set-cookie"]);
    const companies = CompanyListResponseSchema.parse((await app.inject({ method: "GET", url: "/api/companies", headers: { cookie, origin } })).json());
    const companyId = companies.currentCompany.id;
    const csrf = CsrfTokenResponseSchema.parse((await app.inject({ method: "GET", url: "/api/security/csrf", headers: { cookie, origin } })).json()).token;
    const headers = { cookie, origin, "x-csrf-token": csrf, "x-company-id": companyId };
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/providers", payload: { id: "sample.mcp", displayName: "Sample", endpoint, credentialReferenceId: null } })).statusCode).toBe(401);
    const providerResponse = await app.inject({ method: "POST", url: "/api/universal-tools/providers", headers, payload: { id: "sample.mcp", displayName: "Sample", endpoint, credentialReferenceId: null } });
    expect(providerResponse.statusCode).toBe(200);
    const discovered = await app.inject({ method: "POST", url: "/api/universal-tools/providers/sample.mcp/discover", headers });
    expect(discovered.statusCode).toBe(200);
    expect(discovered.json()).toMatchObject([{ id: "sample.mcp:lookup", enabled: false }]);
    const invocation = { invocationId: crypto.randomUUID(), toolId: "sample.mcp:lookup", arguments: { query: "hello" }, approvalId: null, idempotencyKey: null, requestedAt: new Date().toISOString() };
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: invocation })).json()).toMatchObject({ status: "DENIED" });
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/tools/sample.mcp:lookup/review", headers, payload: { schemaDigest: digest } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/tools/sample.mcp:lookup/activate", headers })).statusCode).toBe(200);
    const executed = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: invocation });
    expect(executed.statusCode).toBe(200);
    expect(executed.json()).toMatchObject({ status: "SUCCEEDED", structuredOutput: { content: "safe result" } });
    const duplicate = await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: invocation });
    expect(duplicate.json()).toMatchObject({ status: "SUCCEEDED" });
    const telemetry = await app.inject({ method: "GET", url: "/api/universal-tools/telemetry", headers });
    expect(telemetry.json()).toContainEqual(expect.objectContaining({ toolId: "sample.mcp:lookup", callCount: 1, successCount: 1 }));
    const acceptance = await app.inject({ method: "POST", url: `/api/universal-tools/invocations/${invocation.invocationId}/acceptance`, headers, payload: { acceptance: "ACCEPTED" } });
    expect(acceptance.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/universal-tools/telemetry", headers })).json()).toContainEqual(expect.objectContaining({ acceptedCount: 1 }));
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/invocations/${invocation.invocationId}/reconcile`, headers })).json()).toMatchObject({ status: "SUCCEEDED", providerStatusVerified: true, retryAllowed: false });
    const crashedInvocationId = crypto.randomUUID();
    await store.reserve({ invocationId: crashedInvocationId, ownerId: z.object({ user: z.object({ id: z.string().uuid() }) }).parse(registration.json()).user.id,
      companyId, toolId: "sample.mcp:lookup", requestDigest: "f".repeat(64), status: "RESERVED", result: null });
    expect((await app.inject({ method: "POST", url: `/api/universal-tools/invocations/${crashedInvocationId}/reconcile`, headers })).json()).toMatchObject({ status: "INDETERMINATE", providerStatusVerified: false, retryAllowed: false });
    expect(fetcher.mock.calls.filter((call) => typeof call[1]?.body === "string" && (JSON.parse(call[1].body) as { method: string }).method === "tools/call")).toHaveLength(1);
    await app.inject({ method: "POST", url: "/api/universal-tools/tools/sample.mcp:lookup/revoke", headers });
    expect((await app.inject({ method: "POST", url: "/api/universal-tools/invocations", headers, payload: { ...invocation, invocationId: crypto.randomUUID() } })).json()).toMatchObject({ status: "DENIED" });
  });
});
