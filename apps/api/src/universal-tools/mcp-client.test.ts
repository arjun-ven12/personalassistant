import { describe, expect, it, vi } from "vitest";
import { RemoteMcpAdapter, boundedMcpBody } from "./mcp-client.js";

const provider = { id: "demo.mcp", ownerId: "11111111-1111-4111-8111-111111111111", companyId: null, sourceType: "MCP_REMOTE" as const, displayName: "Demo", endpoint: "https://mcp.example.test/mcp", credentialReferenceId: null, status: "REVIEW_REQUIRED" as const, health: "HEALTHY" as const, version: "1", updatedAt: new Date().toISOString() };
const reply = (id: number, result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });

describe("remote MCP adapter", () => {
  it("cancels hostile chunked bodies as soon as the byte quota is exceeded", async () => {
    let chunks = 0, cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(40_000)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    await expect(boundedMcpBody(new Response(body, { headers: { "content-length": "1" } }))).rejects.toThrow("too large");
    expect(cancelled).toBe(true); expect(chunks).toBe(2);
  });
  it("rejects credential-bearing URLs, unreviewed ports, session metadata and redirects", async () => {
    const adapter = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}));
    for (const endpoint of ["https://user:pass@mcp.example.test/mcp", "https://mcp.example.test:444/mcp", "http://mcp.example.test/mcp", "https://localhost/mcp"]) await expect(adapter.discover({ ...provider, endpoint })).rejects.toThrow("not reviewed");
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new Error("fixture redirect refused")));
    const redirected = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), fetcher);
    await expect(redirected.discover(provider)).rejects.toThrow("redirect refused");
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
    const malformed = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), () => Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }), { headers: { "content-type": "application/json", "mcp-session-id": "x".repeat(300) } })));
    await expect(malformed.discover(provider)).rejects.toThrow("session metadata");
  });
  it("bounds initialized notification bodies and does not persist failed sessions", async () => {
    let initialized = 0;
    const adapter = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), (_url, init) => {
      if (typeof init?.body !== "string") throw new Error("JSON request required.");
      const request = JSON.parse(init.body) as { method: string; id: number };
      if (request.method === "initialize") { initialized++; return Promise.resolve(reply(request.id, { protocolVersion: "2025-06-18" })); }
      return Promise.resolve(new Response("x".repeat(70_000)));
    });
    await expect(adapter.discover(provider)).rejects.toThrow("too large");
    await expect(adapter.discover(provider)).rejects.toThrow("too large");
    expect(initialized).toBe(2);
  });
  it("initializes once, discovers bounded tools, and uses a reviewed host", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Missing request body.");
      const body = JSON.parse(init.body) as { id: number; method: string };
      if (body.method === "initialize") return Promise.resolve(reply(body.id, { protocolVersion: "2025-06-18", capabilities: {} }));
      if (body.method === "notifications/initialized") return Promise.resolve(new Response(null, { status: 202 }));
      return Promise.resolve(reply(body.id, { tools: [{ name: "lookup", description: "Read metadata", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }] }));
    });
    const adapter = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), fetcher);
    const discovered = await adapter.discover(provider);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.riskLevel).toBe("high");
    await adapter.discover(provider);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(adapter.discover({ ...provider, endpoint: "https://localhost/mcp" })).rejects.toThrow();
  });
  it("rejects oversized and malformed JSON-RPC responses", async () => {
    const oversized = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), () => Promise.resolve(new Response("x".repeat(70_000), { headers: { "content-type": "application/json" } })));
    await expect(oversized.discover(provider)).rejects.toThrow();
    const malformed = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({}), () => Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { headers: { "content-type": "text/html" } })));
    await expect(malformed.discover(provider)).rejects.toThrow();
  });
  it("sends only the server-resolved scoped credential header", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected JSON request body.");
      const body = JSON.parse(init.body) as { id?: number; method: string };
      if (body.method === "notifications/initialized") return Promise.resolve(new Response(null, { status: 202 }));
      return Promise.resolve(reply(body.id ?? 1, body.method === "initialize"
        ? { protocolVersion: "2025-06-18", capabilities: {} }
        : { tools: [{ name: "lookup", description: "Read metadata", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }] }));
    });
    const adapter = new RemoteMcpAdapter(["mcp.example.test"], () => Promise.resolve({ authorization: "Bearer test-secret-value-over-20-chars" }), fetcher);
    await adapter.discover({ ...provider, credentialReferenceId: crypto.randomUUID() });
    expect(fetcher.mock.calls.every((call) => new Headers(call[1]?.headers).get("authorization") === "Bearer test-secret-value-over-20-chars")).toBe(true);
  });
});
