import {
  CompanyListResponseSchema,
  CreateCompanyRequestSchema,
  SelectCompanyRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const CompanyParamsSchema = z.object({ companyId: z.string().uuid() }).strict();

export const registerCompanyRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get("/api/companies", { preHandler: [context.security.requireAuthentication] }, async (request) =>
    CompanyListResponseSchema.parse(await context.companies.list(context.security.getIdentity(request))),
  );
  app.post("/api/companies", { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] }, async (request) =>
    CompanyListResponseSchema.parse(await context.companies.create(context.security.getIdentity(request), CreateCompanyRequestSchema.parse(request.body))),
  );
  app.post("/api/companies/select", { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] }, async (request) => {
    const { companyId } = SelectCompanyRequestSchema.parse(request.body);
    return CompanyListResponseSchema.parse(await context.companies.select(context.security.getIdentity(request), companyId));
  });
  app.post("/api/companies/:companyId/archive", { preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf] }, async (request) => {
    const { companyId } = CompanyParamsSchema.parse(request.params);
    return CompanyListResponseSchema.parse(await context.companies.archive(context.security.getIdentity(request), companyId));
  });
};
