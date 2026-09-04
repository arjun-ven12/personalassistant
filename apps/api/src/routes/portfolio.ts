import {
  AIObservabilityTraceSchema,
  CreatePortfolioObjectiveRequestSchema,
  OwnerPortfolioDashboardSchema,
  PortfolioAIOverviewSchema,
  PortfolioAITraceQuerySchema,
  PortfolioAlertActionSchema,
  PortfolioAttentionSignalSchema,
  PortfolioExecutiveBriefSchema,
  PortfolioCompanyComparisonRequestSchema,
  PortfolioCompanyComparisonSchema,
  PortfolioMetricComparisonRequestSchema,
  PortfolioMetricCompatibilitySchema,
  PortfolioObjectiveSchema,
  PortfolioEconomySchema,
  PortfolioResourceTransferRequestSchema,
  PortfolioResourceTransferSchema,
  OwnerReserveFundingSchema,
  GovernorProposalSchema,
  GovernorProposalDecisionRequestSchema,
  PortfolioSearchRequestSchema,
  PortfolioSearchResponseSchema,
  PortfolioApprovalRowSchema,
  ApprovalDecisionRequestSchema,
  PortfolioSystemOverviewSchema,
  PortfolioTraceQuerySchema,
  SystemTelemetrySpanSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";
import { companyScope } from "../companies/scope.js";

const SignalParams = z.object({ signalId: z.string().min(1).max(240) }).strict();
const ProposalParams = z.object({ proposalId: z.string().uuid() }).strict();
const ProposalQuery = z.object({ portfolioObjectiveId: z.string().uuid().optional() }).strict();
const PortfolioApprovalQuery = z.object({
  status: z.enum(["PENDING", "COMPLETED", "ALL"]).default("PENDING"),
  risk: z.enum(["ALL", "HIGH"]).default("ALL"),
  companyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
const ApprovalParams = z.object({ approvalId: z.string().uuid() }).strict();
export const registerPortfolioRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  const owner = (request: Parameters<typeof context.security.getIdentity>[0]) =>
    context.security.getIdentity(request).user.id;
  const companyContext = (ownerId: string, companyId: string, requestId: string) =>
    ({ ownerId, companyId, role: "OWNER" as const, requestId });
  const approvalRows = async (identity: ReturnType<typeof context.security.getIdentity>) => {
    const ownerId = identity.user.id;
    const companies = (await context.companies.list(identity)).companies.filter((item) => item.status !== "ARCHIVED");
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const stored = await context.governanceStore.listApprovals(ownerId);
    const publicById = new Map((await context.approvals.list(ownerId)).map((approval) => [approval.id, approval]));
    return stored.flatMap((record) => {
      const company = record.companyId ? companyById.get(record.companyId) : undefined;
      const approval = publicById.get(record.id);
      if (!company || !approval) return [];
      return [PortfolioApprovalRowSchema.parse({
        id: approval.id, companyId: company.id, companyName: company.name,
        action: approval.humanSummary, risk: approval.riskLevel,
        requestingActor: approval.requestedByDeviceId ? `Device ${approval.requestedByDeviceId.slice(0, 8)}` : "Owner portfolio",
        objectiveId: null, expectedCostCredits: null, createdAt: approval.requestedAt,
        status: approval.status,
        deepLink: `/portfolio?companyId=${company.id}&approvalId=${approval.id}`,
      })];
    });
  };
  app.get(
    "/api/portfolio",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const ownerId = identity.user.id;
      const dashboard = OwnerPortfolioDashboardSchema.parse(
        await context.portfolio.dashboard(ownerId),
      );
      await context.portfolio.recordPortfolioQuery(ownerId, {
        requestId: request.id,
        ipAddress: request.ip,
      });
      return dashboard;
    },
  );
  app.post(
    "/api/portfolio/compare-companies",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioCompanyComparisonSchema.parse(
        await context.portfolio.compareCompanies(
          owner(request),
          PortfolioCompanyComparisonRequestSchema.parse(request.body),
        ),
      ),
  );
  app.get(
    "/api/portfolio/objectives",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      z.array(PortfolioObjectiveSchema).max(500).parse(
        await context.portfolio.listPortfolioObjectives(owner(request)),
      ),
  );
  app.post(
    "/api/portfolio/objectives",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) =>
      PortfolioObjectiveSchema.parse(
        await context.portfolio.createPortfolioObjective(
          owner(request),
          CreatePortfolioObjectiveRequestSchema.parse(request.body),
          { requestId: request.id, ipAddress: request.ip },
        ),
      ),
  );
  app.get(
    "/api/portfolio/economy",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => PortfolioEconomySchema.parse(
      await context.portfolio.portfolioEconomy(owner(request)),
    ),
  );
  app.post(
    "/api/portfolio/economy/funding",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => OwnerReserveFundingSchema.parse(
      await context.portfolio.fundOwnerReserve(
        owner(request), request.body,
        { requestId: request.id, ipAddress: request.ip },
      ),
    ),
  );
  app.post(
    "/api/portfolio/economy/transfers",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => PortfolioResourceTransferSchema.parse(
      await context.portfolio.transferPortfolioResources(
        owner(request),
        PortfolioResourceTransferRequestSchema.parse(request.body),
        { requestId: request.id, ipAddress: request.ip },
      ),
    ),
  );
  app.get(
    "/api/portfolio/governor-proposals",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = ProposalQuery.parse(request.query);
      return z.array(GovernorProposalSchema).max(1_000).parse(
        await context.portfolio.listGovernorProposals(owner(request), query.portfolioObjectiveId),
      );
    },
  );
  app.post(
    "/api/portfolio/governor-proposals/:proposalId/decision",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => GovernorProposalSchema.parse(
      await context.portfolio.decideGovernorProposal(
        owner(request), ProposalParams.parse(request.params).proposalId,
        GovernorProposalDecisionRequestSchema.parse(request.body),
        { requestId: request.id, ipAddress: request.ip },
      ),
    ),
  );
  app.get(
    "/api/portfolio/search",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const ownerId = identity.user.id;
      const input = PortfolioSearchRequestSchema.parse(request.query);
      const needle = input.query.toLocaleLowerCase();
      const companies = (await context.companies.list(identity)).companies.filter((item) => item.status !== "ARCHIVED");
      if (input.type === "COMPANIES") {
        const matches = companies.filter((company) =>
          company.name.toLocaleLowerCase().includes(needle) || company.slug.toLocaleLowerCase().includes(needle),
        );
        return PortfolioSearchResponseSchema.parse({
          query: input.query,
          results: matches.slice(0, input.limit).map((company) => ({
            type: "COMPANY" as const, id: company.id, title: company.name,
            companyId: company.id, companyName: company.name,
            subtitle: `Company · ${company.slug}`, status: company.status,
            deepLink: `/companies/${company.id}`,
          })),
          truncated: matches.length > input.limit,
        });
      }
      const definitions = new Map((await context.agentStore.listDefinitions(ownerId)).map((item) => [item.id, item]));
      const include = (kind: string) => input.type === "ALL" || input.type === kind;
      const matches = (...values: Array<string | null | undefined>) => values.some((value) => value?.toLocaleLowerCase().includes(needle));
      const results = [] as Array<z.infer<typeof PortfolioSearchResponseSchema>["results"][number]>;
      if (include("COMPANIES")) for (const company of companies) if (matches(company.name, company.slug)) results.push({
        type: "COMPANY", id: company.id, title: company.name, companyId: company.id,
        companyName: company.name, subtitle: `Company · ${company.slug}`, status: company.status,
        deepLink: `/companies/${company.id}`,
      });
      const companyResults: Array<typeof results> = [];
      for (const company of companies) {
        companyResults.push(await companyScope.run(
          companyContext(ownerId, company.id, request.id),
          async () => {
          const scoped = [] as typeof results;
          if (include("OBJECTIVES")) {
            const dashboard = await context.objectives.dashboard(ownerId);
            for (const objective of dashboard.objectives.slice(0, 100)) {
              const goal = dashboard.goals.find((item) => item.id === objective.executiveGoalId);
              if (goal && matches(goal.title, goal.description)) scoped.push({ type: "OBJECTIVE", id: objective.id, title: goal.title, companyId: company.id, companyName: company.name, subtitle: `Objective · ${goal.description}`.slice(0, 300), status: objective.status, deepLink: `/portfolio?companyId=${company.id}&objectiveId=${objective.id}` });
            }
          }
          if (include("AGENTS")) for (const assignment of (await context.agentStore.listAssignments(ownerId, company.id)).slice(0, 150)) {
            const definition = definitions.get(assignment.agentDefinitionId);
            if (matches(definition?.name, definition?.description, assignment.agentDefinitionId)) scoped.push({ type: "AGENT", id: assignment.id, title: definition?.name ?? assignment.agentDefinitionId, companyId: company.id, companyName: company.name, subtitle: `${assignment.isGovernor ? "Governor" : "Agent"} · ${definition?.role ?? "Specialist"}`, status: assignment.status, deepLink: `/companies/${company.id}?assignmentId=${assignment.id}` });
          }
          if (include("WORKFLOWS")) for (const workflow of await context.workflowStore.list(ownerId, 100)) if (matches(workflow.goal, workflow.planSummary)) scoped.push({ type: "WORKFLOW", id: workflow.id, title: workflow.goal.slice(0, 240), companyId: company.id, companyName: company.name, subtitle: `Workflow · ${workflow.planSummary}`.slice(0, 300), status: workflow.status, deepLink: `/portfolio?companyId=${company.id}&workflowId=${workflow.id}` });
          if (include("EXPERIMENTS")) for (const experiment of (await context.experiments.dashboard(ownerId)).experiments.slice(0, 100)) if (matches(experiment.title, experiment.hypothesis)) scoped.push({ type: "EXPERIMENT", id: experiment.id, title: experiment.title, companyId: company.id, companyName: company.name, subtitle: `Experiment · ${experiment.hypothesis}`.slice(0, 300), status: experiment.status, deepLink: `/portfolio?companyId=${company.id}&experimentId=${experiment.id}` });
            return scoped;
          },
        ));
      }
      results.push(...companyResults.flat());
      if (include("APPROVALS")) for (const approval of await approvalRows(identity)) if (matches(approval.action, approval.companyName, approval.requestingActor)) results.push({ type: "APPROVAL", id: approval.id, title: approval.action, companyId: approval.companyId, companyName: approval.companyName, subtitle: `Approval · ${approval.risk} risk`, status: approval.status, deepLink: approval.deepLink });
      results.sort((left, right) => left.companyName.localeCompare(right.companyName) || left.title.localeCompare(right.title));
      return PortfolioSearchResponseSchema.parse({ query: input.query, results: results.slice(0, input.limit), truncated: results.length > input.limit });
    },
  );
  app.get(
    "/api/portfolio/approvals",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = PortfolioApprovalQuery.parse(request.query);
      const rows = (await approvalRows(identity))
        .filter((item) => !query.companyId || item.companyId === query.companyId)
        .filter((item) => query.risk !== "HIGH" || item.risk === "high")
        .filter((item) => query.status === "ALL" || (query.status === "PENDING" ? item.status === "PENDING" : item.status !== "PENDING"))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, query.limit);
      return z.array(PortfolioApprovalRowSchema).max(200).parse(rows);
    },
  );
  for (const decision of ["approve", "reject"] as const) app.post(
    `/api/portfolio/approvals/:approvalId/${decision}`,
    {
      preHandler: [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf],
    },
    async (request) => {
      const input = ApprovalDecisionRequestSchema.parse(request.body ?? {});
      const identity = context.security.getIdentity(request);
      const approvalId = ApprovalParams.parse(request.params).approvalId;
      const stored = await context.governanceStore.findApprovalById(approvalId);
      if (!stored || stored.ownerId !== identity.user.id || !stored.companyId)
        throw Object.assign(new Error("Portfolio approval was not found."), { code: "APPROVAL_NOT_FOUND", statusCode: 404 });
      const company = (await context.companies.detail(identity, stored.companyId)).company;
      return companyScope.run(companyContext(identity.user.id, company.id, request.id), async () => {
        const current = await context.approvals.get(identity.user.id, approvalId);
        if ((decision === "approve" && current.status === "APPROVED") || (decision === "reject" && current.status === "REJECTED")) return current;
        if (decision === "approve" && current.approvalRequirement === "recent_authentication")
          await context.securityState.consumeGrant(identity, "approve_high_risk_action");
        let result;
        try {
          result = decision === "approve"
            ? await context.approvals.approve(identity.user.id, approvalId, identity.session.id, { ipAddress: request.ip, requestId: request.id }, current.approvalRequirement === "recent_authentication")
            : await context.approvals.reject(identity.user.id, approvalId, identity.session.id, { ipAddress: request.ip, requestId: request.id }, input.reason);
        } catch (error) {
          const canonical = await context.approvals.get(identity.user.id, approvalId);
          if ((decision === "approve" && canonical.status !== "APPROVED") || (decision === "reject" && canonical.status !== "REJECTED")) throw error;
          result = canonical;
        }
        await context.governanceAudit({ eventType: "PORTFOLIO_APPROVAL_DECIDED", ownerId: identity.user.id, companyId: company.id, outcome: "SUCCESS", reason: `Portfolio inbox routed ${decision} through the canonical company approval engine.`, requestId: request.id, ipAddress: request.ip, metadata: { approvalId, decision } });
        return result;
      });
    },
  );
  app.post(
    "/api/portfolio/compare",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioMetricCompatibilitySchema.parse(
        await context.portfolio.compareMetrics(
          owner(request),
          PortfolioMetricComparisonRequestSchema.parse(request.body),
        ),
      ),
  );
  app.get(
    "/api/portfolio/system",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioSystemOverviewSchema.parse(
        (await context.portfolio.dashboard(owner(request))).systemHealth,
      ),
  );
  app.get(
    "/api/portfolio/ai",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioAIOverviewSchema.parse(
        (await context.portfolio.dashboard(owner(request))).aiHealth,
      ),
  );
  app.get(
    "/api/portfolio/traces",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = PortfolioTraceQuerySchema.parse(request.query);
      return z
        .array(SystemTelemetrySpanSchema)
        .max(500)
        .parse(
          await context.portfolio.listSystemSpans(owner(request), {
            limit: query.limit,
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.traceId ? { traceId: query.traceId } : {}),
            ...(query.status ? { status: query.status } : {}),
          }),
        );
    },
  );
  app.get(
    "/api/portfolio/ai-traces",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const query = PortfolioAITraceQuerySchema.parse(request.query);
      return z
        .array(AIObservabilityTraceSchema)
        .max(500)
        .parse(
          await context.portfolio.listAITraces(owner(request), {
            limit: query.limit,
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.provider ? { provider: query.provider } : {}),
            ...(query.model ? { model: query.model } : {}),
            ...(query.taskClass ? { taskClass: query.taskClass } : {}),
          }),
        );
    },
  );
  app.get(
    "/api/portfolio/brief",
    { preHandler: [context.security.requireAuthentication] },
    async (request) =>
      PortfolioExecutiveBriefSchema.parse(
        await context.executive.ownerPortfolioBrief(owner(request)),
      ),
  );
  app.post(
    "/api/portfolio/attention/:signalId",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) =>
      PortfolioAttentionSignalSchema.parse(
        await context.portfolio.updateAlert(
          owner(request),
          SignalParams.parse(request.params).signalId,
          PortfolioAlertActionSchema.parse(request.body),
          { requestId: request.id, ipAddress: request.ip },
        ),
      ),
  );
};
