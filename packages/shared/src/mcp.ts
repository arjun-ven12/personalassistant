import { z } from "zod";
import { RegistryIdSchema } from "./applications.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25" as const;
export const MCP_LOCAL_SERVER_ID = "athena.local.fixture" as const;
export const MCP_STATUS_TOOL = "athena_local_status" as const;
export const MCP_INTEGRATION_ID = "mcp_local_fixture" as const;
export const MCP_CAPABILITY_ID = "mcp.local_fixture.read" as const;
export const MCP_POLICY_TOOL = "mcp.local_fixture.read_status" as const;

export const McpStatusInputSchema = z.object({ probe: z.literal("health") }).strict();
export const McpStatusOutputSchema = z
  .object({
    status: z.literal("ok"),
    readOnly: z.literal(true),
    protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  })
  .strict();

// Deliberately finite schema vocabulary. Remote schemas are matched to these
// reviewed contracts, never compiled into code or fetched through $ref.
export const McpStatusInputJsonSchema = z.toJSONSchema(McpStatusInputSchema);
export const McpStatusOutputJsonSchema = z.toJSONSchema(McpStatusOutputSchema);

export const McpLocalRequestSchema = z
  .object({
    operation: z.enum(["discover", "read_status"]),
    workspaceId: RegistryIdSchema,
    serverId: z.literal(MCP_LOCAL_SERVER_ID),
    toolName: z.literal(MCP_STATUS_TOOL),
    input: McpStatusInputSchema,
  })
  .strict();

export const McpDiscoverySchema = z
  .object({
    serverId: z.literal(MCP_LOCAL_SERVER_ID),
    protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
    tools: z.tuple([
      z
        .object({ name: z.literal(MCP_STATUS_TOOL), readOnly: z.literal(true) })
        .strict(),
    ]),
  })
  .strict();

export const McpLocalResponseSchema = z
  .object({
    operationId: z.string().uuid(),
    policyEvaluationId: z.string().uuid(),
    trust: z.literal("UNTRUSTED_DATA"),
    result: z.union([McpDiscoverySchema, McpStatusOutputSchema]),
  })
  .strict();

export type McpLocalRequest = z.infer<typeof McpLocalRequestSchema>;
export type McpStatusInput = z.infer<typeof McpStatusInputSchema>;
