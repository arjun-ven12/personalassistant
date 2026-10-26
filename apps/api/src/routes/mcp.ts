import type { FastifyInstance } from "fastify";
import type { ApiRouteContext } from "./context.js";
import { McpLocalError } from "../mcp/errors.js";

/** Finite routes; no registration, command composer or arbitrary tool selector. */
export const registerMcpLocalRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const guards = [
    context.security.requireAuthentication,
    context.companyContext.requireCompany,
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
    context.security.requireTrustedDevice,
    context.security.verifySignedRequest,
    context.security.verifyTransportNetwork,
  ];
  for (const [path, operation] of [
    ["discover", "discover"],
    ["read-status", "read_status"],
  ] as const) {
    app.post(
      `/api/mcp/local-fixture/${path}`,
      { preHandler: guards },
      async (request, reply) => {
        const identity = context.security.getIdentity(request);
        const company = context.companyContext.get(request);
        const envelope = context.security.getEnvelope(request);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        request.raw.once("aborted", cancel);
        const disconnected = () => {
          if (!reply.raw.writableEnded) cancel();
        };
        reply.raw.once("close", disconnected);
        try {
          const body = envelope.payload;
          // Bind signed operation to the finite endpoint, preventing cross-route reuse.
          if (body.operation !== operation) {
            await context.governanceAudit({
              eventType: "INTEGRATION_OPERATION_DENIED",
              ownerId: identity.user.id,
              companyId: company.companyId,
              deviceId: context.security.getDevice(request).id,
              outcome: "DENIED",
              reason: "The signed MCP operation did not match its finite route.",
              requestId: request.id,
              ipAddress: request.ip,
              metadata: { operationId: envelope.commandId },
            });
            throw new McpLocalError("MCP_INVALID_REQUEST", 400);
          }
          return await context.mcpLocal.execute(
            {
              ownerId: identity.user.id,
              companyId: company.companyId,
              sessionId: identity.session.id,
              deviceId: context.security.getDevice(request).id,
              operationId: envelope.commandId,
              networkVerification: context.security.getNetworkState(request),
              requestId: request.id,
              ipAddress: request.ip,
            },
            body,
            controller.signal,
          );
        } finally {
          request.raw.off("aborted", cancel);
          reply.raw.off("close", disconnected);
        }
      },
    );
  }
};
