import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  MCP_LOCAL_SERVER_ID,
  MCP_PROTOCOL_VERSION,
  MCP_STATUS_TOOL,
  McpDiscoverySchema,
  McpStatusInputSchema,
  McpStatusOutputSchema,
  McpStatusInputJsonSchema,
  McpStatusOutputJsonSchema,
  type McpLocalRequest,
  type McpStatusInput,
} from "@alexa-control/shared";
import { z } from "zod";
import { McpLocalError } from "./errors.js";

const canonical = (v: unknown, depth = 0): string => {
  if (depth > 8) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
  if (Array.isArray(v))
    return `[${v.map((value) => canonical(value, depth + 1)).join(",")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, value]) => `${JSON.stringify(k)}:${canonical(value, depth + 1)}`)
      .join(",")}}`;
  return JSON.stringify(v);
};
const reviewedSchema = (expected: unknown) =>
  z.unknown().refine((v) => canonical(v) === canonical(expected));
const discovery = z
  .object({
    tools: z.tuple([
      z
        .object({
          name: z.literal(MCP_STATUS_TOOL),
          description: z.string().max(500).optional(),
          inputSchema: reviewedSchema(McpStatusInputJsonSchema),
          outputSchema: reviewedSchema(McpStatusOutputJsonSchema),
          annotations: z
            .object({ readOnlyHint: z.literal(true) })
            .strict()
            .optional(),
        })
        .strict(),
    ]),
  })
  .strict();
const output = z
  .object({
    content: z.tuple([]),
    structuredContent: McpStatusOutputSchema,
    isError: z.literal(false).optional(),
  })
  .strict();

/** SDK protocol handling with a single reviewed schema/tool mapping. */
export class McpProtocolClient {
  private readonly client: Client;
  private invalidated = false;
  private readonly transport: Transport;

  constructor(raw: Transport) {
    this.client = new Client(
      { name: "athena-governed-mcp-client", version: "1.0.0" },
      {
        capabilities: {},
        jsonSchemaValidator: {
          getValidator: () => {
            throw new McpLocalError("MCP_PROTOCOL_REJECTED");
          },
        },
      },
    );
    // The SDK accepts older versions by default; this adapter intentionally does not.
    this.transport = {
      start: async () => {
        raw.onmessage = (message) => {
          if ("method" in message) {
            // No server-initiated requests or mutable capability notifications.
            this.invalidated = true;
            this.transport.onerror?.(new McpLocalError("MCP_PROTOCOL_REJECTED"));
            void raw.close();
            return;
          }
          this.transport.onmessage?.(message);
        };
        raw.onerror = () =>
          this.transport.onerror?.(new McpLocalError("MCP_PROTOCOL_REJECTED"));
        raw.onclose = () => this.transport.onclose?.();
        await raw.start();
      },
      send: (message) => raw.send(message),
      close: () => raw.close(),
      setProtocolVersion: (version) => {
        if (version !== MCP_PROTOCOL_VERSION)
          throw new McpLocalError("MCP_PROTOCOL_REJECTED");
      },
    };
  }

  async execute(
    operation: McpLocalRequest["operation"],
    input: McpStatusInput,
    signal: AbortSignal,
    beforeOperation: () => Promise<void> = async () => {},
  ) {
    try {
      signal.throwIfAborted();
      const parsed = McpStatusInputSchema.parse(input);
      await beforeOperation();
      await this.client.connect(this.transport, { signal, timeout: 5_000 });
      const server = this.client.getServerVersion();
      const capabilities = this.client.getServerCapabilities();
      if (
        server?.name !== "athena-local-fixture" ||
        server.version !== "1.0.0" ||
        !capabilities?.tools ||
        Object.keys(capabilities).some((k) => k !== "tools") ||
        Object.keys(capabilities.tools).length !== 0
      )
        throw new McpLocalError("MCP_PROTOCOL_REJECTED");
      // Low-level request avoids SDK listTools' automatic compilation of untrusted
      // output schemas. Only the reviewed Zod contracts below validate output.
      await beforeOperation();
      await this.client.request({ method: "tools/list" }, discovery, {
        signal,
        timeout: 5_000,
      });
      if (this.invalidated) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
      if (operation === "discover")
        return McpDiscoverySchema.parse({
          serverId: MCP_LOCAL_SERVER_ID,
          protocolVersion: MCP_PROTOCOL_VERSION,
          tools: [{ name: MCP_STATUS_TOOL, readOnly: true }],
        });
      await beforeOperation();
      const result = await this.client.request(
        { method: "tools/call", params: { name: MCP_STATUS_TOOL, arguments: parsed } },
        output,
        { signal, timeout: 5_000 },
      );
      if (this.invalidated) throw new McpLocalError("MCP_PROTOCOL_REJECTED");
      return McpStatusOutputSchema.parse(result.structuredContent);
    } catch {
      throw new McpLocalError(
        signal.aborted ? "MCP_CANCELLED" : "MCP_PROTOCOL_REJECTED",
        502,
      );
    } finally {
      await this.close();
    }
  }

  async close() {
    await this.transport.close();
  }
}

export type McpSession = Pick<McpProtocolClient, "execute" | "close">;
export type McpSessionFactory = () => McpSession;
