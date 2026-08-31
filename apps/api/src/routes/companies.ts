import {
  CompanyListResponseSchema,
  CompanyDetailResponseSchema,
  CompanyLifecycleActionSchema,
  CreateCompanyRequestSchema,
  SelectCompanyRequestSchema,
  UpdateCompanyRequestSchema,
  UpdateCompanyLimitRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const CompanyParamsSchema = z.object({ companyId: z.string().uuid() }).strict();
const CompanyActionParamsSchema = CompanyParamsSchema.extend({ action: CompanyLifecycleActionSchema }).strict();
const mutationGuards = (context: ApiRouteContext) => [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf];

export const registerCompanyRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  app.get("/api/companies", { preHandler: [context.security.requireAuthentication] }, async (request) =>
    CompanyListResponseSchema.parse(await context.companies.list(context.security.getIdentity(request))),
  );
  app.post("/api/companies", { preHandler: mutationGuards(context) }, async (request) =>
    CompanyListResponseSchema.parse(await context.companies.create(context.security.getIdentity(request), CreateCompanyRequestSchema.parse(request.body), { requestId: request.id, ipAddress: request.ip })),
  );
  app.get("/api/companies/:companyId", { preHandler: [context.security.requireAuthentication] }, async (request) => {
    const { companyId } = CompanyParamsSchema.parse(request.params);
    return CompanyDetailResponseSchema.parse(await context.companies.detail(context.security.getIdentity(request), companyId));
  });
  app.patch("/api/companies/:companyId", { preHandler: mutationGuards(context) }, async (request) => {
    const { companyId } = CompanyParamsSchema.parse(request.params);
    return CompanyDetailResponseSchema.parse(await context.companies.update(context.security.getIdentity(request), companyId, UpdateCompanyRequestSchema.parse(request.body), { requestId: request.id, ipAddress: request.ip }));
  });
  app.post("/api/companies/select", { preHandler: mutationGuards(context) }, async (request) => {
    const { companyId } = SelectCompanyRequestSchema.parse(request.body);
    return CompanyListResponseSchema.parse(await context.companies.select(context.security.getIdentity(request), companyId, { requestId: request.id, ipAddress: request.ip }));
  });
  app.patch("/api/companies/limit", { preHandler: mutationGuards(context) }, async (request) => {
    const { companyLimit } = UpdateCompanyLimitRequestSchema.parse(request.body);
    return CompanyListResponseSchema.parse(await context.companies.updateLimit(context.security.getIdentity(request), companyLimit, { requestId: request.id, ipAddress: request.ip }));
  });
  app.post("/api/companies/:companyId/archive", { preHandler: mutationGuards(context) }, async (request) => {
    const { companyId } = CompanyParamsSchema.parse(request.params);
    return CompanyListResponseSchema.parse(await context.companies.archive(context.security.getIdentity(request), companyId, { requestId: request.id, ipAddress: request.ip }));
  });
  app.post("/api/companies/:companyId/:action", { preHandler: mutationGuards(context) }, async (request) => {
    const { companyId, action } = CompanyActionParamsSchema.parse(request.params);
    return CompanyDetailResponseSchema.parse(await context.companies.transition(context.security.getIdentity(request), companyId, action, { requestId: request.id, ipAddress: request.ip }));
  });
};
