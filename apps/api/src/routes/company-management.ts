import {
  CompanyManagementDashboardSchema,
  CompanyManagementReviewSchema,
  GenerateManagementReviewRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";

import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

export const registerCompanyManagementRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  installCompanyRouteGuard(app, "/api/company-management", context);
  app.get("/api/company-management", async (request) =>
    CompanyManagementDashboardSchema.parse(
      await context.companyManagement.dashboard(
        context.security.getIdentity(request).user.id,
        context.companyContext.get(request).companyId,
      ),
    ),
  );
  app.post(
    "/api/company-management/reviews",
    { preHandler: [context.security.requireTrustedOrigin, context.security.requireCsrf] },
    async (request) =>
      CompanyManagementReviewSchema.parse(
        await context.companyManagement.generateReview(
          context.security.getIdentity(request).user.id,
          context.companyContext.get(request).companyId,
          GenerateManagementReviewRequestSchema.parse(request.body),
          { requestId: request.id, ipAddress: request.ip },
        ),
      ),
  );
};
