import {
  ToolListResponseSchema,
  ToolNameParametersSchema,
  ToolResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";

export const registerToolRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get(
    "/api/tools",
    { preHandler: [context.security.requireAuthentication] },
    async () => ToolListResponseSchema.parse(await context.registry.listTools()),
  );

  app.get(
    "/api/tools/:toolName",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const { toolName } = ToolNameParametersSchema.parse(request.params);
      return ToolResponseSchema.parse(await context.registry.getTool(toolName));
    },
  );
};
