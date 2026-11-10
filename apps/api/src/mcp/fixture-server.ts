import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  MCP_PROTOCOL_VERSION,
  MCP_STATUS_TOOL,
  McpStatusInputSchema,
  McpStatusInputJsonSchema,
  McpStatusOutputJsonSchema,
} from "@alexa-control/shared";

// Source-owned static diagnostics only. No filesystem, network, native operations,
// model calls, caller-defined tool registration or inherited credentials.
const server = new Server(
  { name: "athena-local-fixture", version: "1.0.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        name: MCP_STATUS_TOOL,
        inputSchema: McpStatusInputJsonSchema,
        outputSchema: McpStatusOutputJsonSchema,
        annotations: { readOnlyHint: true },
      },
    ],
  }),
);
server.setRequestHandler(CallToolRequestSchema, (request) => {
  if (request.params.name !== MCP_STATUS_TOOL) throw new Error("Unknown fixture tool.");
  McpStatusInputSchema.parse(request.params.arguments);
  return Promise.resolve({
    content: [],
    structuredContent: {
      status: "ok",
      readOnly: true,
      protocolVersion: MCP_PROTOCOL_VERSION,
    },
  });
});
await server.connect(new StdioServerTransport());
