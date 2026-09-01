import {
  AgentCatalogResponseSchema,
  DepartmentTemplateListResponseSchema,
  WorkforceGraphResponseSchema,
  MoveWorkforceAgentRequestSchema,
  AssignCatalogAgentRequestSchema,
  UpdateWorkforceActivationRequestSchema,
  WorkforceAgentDetailSchema,
  WorkforceImportReportSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const AgentParametersSchema = z
  .object({ agentId: z.string().min(3).max(120) })
  .strict();
const DefinitionParametersSchema = z
  .object({ definitionId: z.string().min(3).max(160) })
  .strict();
const DepartmentParametersSchema = z
  .object({ departmentId: z.string().uuid() })
  .strict();

const mutationGuards = (context: ApiRouteContext) => [
  context.security.requireAuthentication,
  context.companyContext.requireCompany,
  context.security.requireTrustedOrigin,
  context.security.requireCsrf,
];

export const registerAgentWorkforceRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-workforce/catalog",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentCatalogResponseSchema.parse(
        await context.agentWorkforce.catalog(identity.user.id, request.query),
      );
    },
  );

  app.get(
    "/api/agent-workforce/department-templates",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    () =>
      DepartmentTemplateListResponseSchema.parse(
        context.agentWorkforce.departmentTemplates(),
      ),
  );

  app.post(
    "/api/agent-workforce/departments",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.createDepartment(
          identity.user.id,
          request.body,
          request.id,
          request.ip,
        ),
      );
    },
  );

  app.patch(
    "/api/agent-workforce/departments/:departmentId",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { departmentId } = DepartmentParametersSchema.parse(request.params);
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.updateDepartment(
          identity.user.id,
          departmentId,
          request.body,
          request.id,
          request.ip,
        ),
      );
    },
  );

  app.post(
    "/api/agent-workforce/departments/:departmentId/archive",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { departmentId } = DepartmentParametersSchema.parse(request.params);
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.archiveDepartment(
          identity.user.id,
          departmentId,
          request.body,
          request.id,
          request.ip,
        ),
      );
    },
  );

  app.patch(
    "/api/agent-workforce/agents/:agentId/department",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const { departmentId } = MoveWorkforceAgentRequestSchema.parse(request.body);
      await context.agentWorkforce.moveAssignment(
        identity.user.id,
        agentId,
        departmentId,
        request.id,
        request.ip,
      );
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.graph(identity.user.id, {}),
      );
    },
  );

  app.post(
    "/api/agent-workforce/catalog/:definitionId/assign",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { definitionId } = DefinitionParametersSchema.parse(request.params);
      const body = AssignCatalogAgentRequestSchema.parse(request.body);
      return AgentCatalogResponseSchema.parse(
        await context.agentWorkforce.assignDefinition({
          ownerId: identity.user.id,
          definitionId,
          ...(body.departmentId ? { departmentId: body.departmentId } : {}),
          ...(body.companyInstructions
            ? { companyInstructions: body.companyInstructions }
            : {}),
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.delete(
    "/api/agent-workforce/catalog/:definitionId/assignment",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { definitionId } = DefinitionParametersSchema.parse(request.params);
      return AgentCatalogResponseSchema.parse(
        await context.agentWorkforce.revokeAssignment(
          identity.user.id,
          definitionId,
          request.id,
          request.ip,
        ),
      );
    },
  );

  app.get(
    "/api/agent-workforce/preview",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceImportReportSchema.parse(
        await context.agentWorkforce.preview(identity.user.id),
      );
    },
  );

  app.get(
    "/api/agent-workforce/graph",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceGraphResponseSchema.parse(
        await context.agentWorkforce.graph(identity.user.id, request.query),
      );
    },
  );

  app.get(
    "/api/agent-workforce/agents/:agentId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.companyContext.requireCompany,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      return WorkforceAgentDetailSchema.parse(
        await context.agentWorkforce.detail(identity.user.id, agentId),
      );
    },
  );

  app.post(
    "/api/agent-workforce/bootstrap",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return WorkforceImportReportSchema.parse(
        await context.agentWorkforce.bootstrap(
          identity.user.id,
          request.id,
          request.ip,
        ),
      );
    },
  );

  app.post(
    "/api/agent-workforce/agents/:agentId/activation",
    { preHandler: mutationGuards(context) },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const { agentId } = AgentParametersSchema.parse(request.params);
      const { state } = UpdateWorkforceActivationRequestSchema.parse(request.body);
      return WorkforceAgentDetailSchema.parse(
        await context.agentWorkforce.setActivation(
          identity.user.id,
          agentId,
          state,
          request.id,
          request.ip,
        ),
      );
    },
  );
};
