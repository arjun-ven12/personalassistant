import type { UniversalTool, UniversalToolProvider } from "@alexa-control/shared";
import type { ToolAdapter } from "./gateway.js";
import { normalizeSchema, ToolSchemaError } from "./schema.js";

interface McpResult { content?: unknown; structuredContent?: unknown; isError?: boolean }
const textOutput = { type: "object", properties: { content: { type: "string", maxLength: 16_384 } }, required: ["content"], additionalProperties: false };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
/** Enforce bytes while reading, before buffering hostile chunked/SSE bodies. */
export async function boundedMcpBody(response: Response, maximum = 65_536): Promise<string> {
  const header = response.headers.get("content-length");
  if (header !== null && (!/^\d+$/.test(header) || Number(header) > maximum)) {
    await response.body?.cancel();
    throw new Error("MCP response too large or length invalid.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new Error("MCP response too large."); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, bytes).toString("utf8");
  } finally { reader.releaseLock(); }
}
/** Narrow permissive MCP objects to closed objects; reject every other unknown keyword. */
const projectMcpSchema = (value: unknown): Record<string, unknown> => {
  const walk = (node: unknown): unknown => {
    if (!isObject(node)) return node;
    const projected: Record<string, unknown> = { ...node };
    if (projected["x-fastmcp-wrap-result"] === true) delete projected["x-fastmcp-wrap-result"];
    if (projected.type === "object") {
      projected.additionalProperties ??= false;
      projected.required ??= [];
      if (isObject(projected.properties)) projected.properties = Object.fromEntries(Object.entries(projected.properties).map(([name, child]) => [name, walk(child)]));
    }
    if (projected.type === "array") projected.items = walk(projected.items);
    return projected;
  };
  return normalizeSchema(walk(value));
};

/** Reviewed HTTPS hosts only. No client-supplied URL, redirects, or local process launch. */
export class RemoteMcpAdapter implements ToolAdapter {
  readonly sourceType = "MCP_REMOTE" as const;
  readonly #sessions = new Map<string, { sessionId: string | null; version: string; expiresAt: number }>();
  readonly #initializing = new Map<string, Promise<{ sessionId: string | null; version: string; expiresAt: number }>>();
  readonly #allowedHosts: ReadonlySet<string>;
  constructor(allowedHosts: readonly string[], readonly credentialHeaders: (provider: UniversalToolProvider) => Promise<Record<string, string>>, readonly fetcher: typeof fetch = fetch) {
    this.#allowedHosts = new Set(allowedHosts);
  }
  private endpoint(provider: UniversalToolProvider) {
    if (!provider.endpoint) throw new Error("MCP endpoint missing.");
    const url = new URL(provider.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !this.#allowedHosts.has(url.hostname)) throw new Error("MCP endpoint is not reviewed.");
    return url;
  }
  private sessionKey(provider: UniversalToolProvider) { return JSON.stringify([provider.ownerId, provider.companyId, provider.id, provider.version, provider.endpoint, provider.credentialReferenceId, provider.updatedAt]); }
  private async rpc(provider: UniversalToolProvider, method: string, params: Record<string, unknown>, sessionId: string | null, id: number): Promise<{ result: unknown; sessionId: string | null }> {
    const endpoint = this.endpoint(provider);
    const headers = await this.credentialHeaders(provider);
    if (Object.keys(headers).some((key) => !/^(authorization|x-api-key)$/i.test(key))) throw new Error("Unreviewed MCP credential header.");
    const response = await this.fetcher(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    if (!response.ok) { await response.body?.cancel(); this.#sessions.delete(this.sessionKey(provider)); throw new Error("MCP request failed."); }
    const raw = await boundedMcpBody(response);
    const contentType = response.headers.get("content-type") ?? "";
    let payload: unknown;
    if (contentType.startsWith("application/json")) payload = JSON.parse(raw);
    else if (contentType.startsWith("text/event-stream")) {
      const events = raw.split(/\r?\n\r?\n/).flatMap((block) => block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()));
      const candidate = events.map((entry) => JSON.parse(entry) as unknown).find((entry) => isObject(entry) && entry.id === id);
      payload = candidate;
    } else throw new Error("Unexpected MCP content type.");
    if (!isObject(payload) || payload.jsonrpc !== "2.0" || payload.id !== id || "error" in payload || !Object.hasOwn(payload, "result")) throw new Error("Invalid MCP JSON-RPC response.");
    const nextSession = response.headers.get("mcp-session-id") ?? sessionId;
    if (nextSession !== null && !/^[\x21-\x7e]{1,256}$/.test(nextSession)) throw new Error("MCP session metadata invalid.");
    return { result: payload.result, sessionId: nextSession };
  }
  private async initialized(provider: UniversalToolProvider, sessionId: string | null) {
    const endpoint = this.endpoint(provider);
    const headers = await this.credentialHeaders(provider);
    if (Object.keys(headers).some((key) => !/^(authorization|x-api-key)$/i.test(key))) throw new Error("Unreviewed MCP credential header.");
    const response = await this.fetcher(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("MCP initialized notification failed."); }
    await boundedMcpBody(response);
  }
  private async session(provider: UniversalToolProvider) {
    const key = this.sessionKey(provider);
    const existing = this.#sessions.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing;
    this.#sessions.delete(key);
    const pending = this.#initializing.get(key);
    if (pending) return pending;
    if (this.#initializing.size >= 128) throw new Error("MCP session capacity unavailable.");
    const initialize = async () => {
      const started = await this.rpc(provider, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "athena", version: "1.0.0" } }, null, 1);
      if (!isObject(started.result) || started.result.protocolVersion !== "2025-06-18") throw new Error("Unsupported MCP protocol version.");
      await this.initialized(provider, started.sessionId);
      const session = { sessionId: started.sessionId, version: started.result.protocolVersion, expiresAt: Date.now() + 5 * 60_000 };
      if (this.#sessions.size >= 128) this.#sessions.delete(this.#sessions.keys().next().value!);
      this.#sessions.set(key, session);
      return session;
    };
    const task = initialize();
    this.#initializing.set(key, task);
    try { return await task; } finally { this.#initializing.delete(key); }
  }
  async discover(provider: UniversalToolProvider) {
    const session = await this.session(provider);
    const allTools: unknown[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const result = await this.rpc(provider, "tools/list", cursor ? { cursor } : {}, session.sessionId, 2 + page);
      if (!isObject(result.result) || !Array.isArray(result.result.tools) || allTools.length + result.result.tools.length > 100) throw new Error("Invalid MCP tool list.");
      allTools.push(...(result.result.tools as unknown[]));
      if (result.result.nextCursor === undefined) break;
      if (typeof result.result.nextCursor !== "string" || !result.result.nextCursor || seen.has(result.result.nextCursor)) throw new Error("Invalid MCP cursor.");
      cursor = result.result.nextCursor;
      seen.add(cursor);
      if (page === 9) throw new Error("MCP tool list exceeds ten pages.");
    }
    const supported = allTools.flatMap((candidate: unknown) => {
      if (!isObject(candidate) || typeof candidate.name !== "string" || !/^[a-z][a-z0-9_]{2,80}$/.test(candidate.name) || typeof candidate.description !== "string" || !candidate.inputSchema) throw new Error("Malformed MCP tool.");
      // Unreviewed MCP tools remain disabled and conservatively classified as writes.
      try {
        return [{ name: candidate.name, description: candidate.description, inputSchema: projectMcpSchema(candidate.inputSchema), outputSchema: projectMcpSchema(candidate.outputSchema ?? textOutput), capabilityCategory: "external_unreviewed", department: "general", operationClass: "WRITE" as const, riskLevel: "high" as const, approvalRequirement: "recent_authentication" as const, costModel: "UNKNOWN" as const }];
      } catch (error) {
        if (error instanceof ToolSchemaError) return [];
        throw error;
      }
    });
    if (supported.length === 0) throw new Error("MCP provider has no tools with bounded supported schemas.");
    return supported;
  }
  async invoke(input: { provider: UniversalToolProvider; tool: UniversalTool; arguments: unknown; invocationId: string; idempotencyKey: string | null }) {
    const session = await this.session(input.provider);
    const result = await this.rpc(input.provider, "tools/call", { name: input.tool.name, arguments: input.arguments }, session.sessionId, 3);
    if (!isObject(result.result) || result.result.isError === true) throw new Error("MCP tool failed.");
    const body = result.result as McpResult;
    if (body.structuredContent !== undefined) return { structuredOutput: body.structuredContent, boundedTextOutput: null, externalOperationId: null };
    if (!Array.isArray(body.content) || body.content.length > 20 || body.content.some((item) => !isObject(item) || item.type !== "text" || typeof item.text !== "string")) throw new Error("Unsupported MCP output.");
    const content = body.content.map((item) => (item as { text: string }).text).join("\n");
    if (Buffer.byteLength(content) > 16_384) throw new Error("MCP output too large.");
    return { structuredOutput: { content }, boundedTextOutput: content, externalOperationId: null };
  }
}
export const McpTextOutputSchema = textOutput;
