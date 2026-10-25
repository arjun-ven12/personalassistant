import { UniversalToolRequestSchema, UniversalToolResultSchema, UniversalToolInspectionSchema } from "@alexa-control/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { TrustedToolContext } from "../universal-tools/gateway.js";
import { summarizeToolReceipts } from "../universal-tools/telemetry.js";
import { ToolIntelligenceService } from "../universal-tools/intelligence.js";
import type { ApiRouteContext } from "./context.js";
import { installCompanyRouteGuard } from "./company-guard.js";

const ProviderParameters = z.object({ providerId: z.string().min(3).max(120) }).strict();
const ToolParameters = z.object({ toolId: z.string().min(3).max(120) }).strict();
const ReviewBody = z.object({ schemaDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const InvocationParameters = z.object({ invocationId: z.string().uuid() }).strict();
const AcceptanceBody = z.object({ acceptance: z.enum(["ACCEPTED", "REJECTED"]) }).strict();

export const registerUniversalToolRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  installCompanyRouteGuard(app, "/api/universal-tools", context);
  const mutations = [context.security.requireAuthentication, context.security.requireTrustedOrigin, context.security.requireCsrf, context.security.inspectNetwork];
  const runtime = () => {
    if (!context.universalTools) throw Object.assign(new Error("Universal tool runtime is not configured."), { statusCode: 503, code: "UNIVERSAL_TOOLS_UNAVAILABLE" });
    return context.universalTools;
  };
  const trusted = async (request: FastifyRequest): Promise<TrustedToolContext> => {
    const identity = context.security.getIdentity(request);
    const company = context.companyContext.get(request);
    if (company.ownerId !== identity.user.id) throw new Error("Company identity mismatch.");
    return {
      ownerId: identity.user.id, companyId: company.companyId, agentId: null,
      requestId: request.id, emergencyStopActive: await context.emergencyStopActive(),
      sessionId: identity.session.id, ipAddress: request.ip,
      networkVerification: context.security.getNetworkState(request),
    };
  };

  app.get("/api/universal-tools", { preHandler: [context.security.requireAuthentication, context.security.inspectNetwork] }, async (request) => runtime().gateway.select(await trusted(request), z.string().min(3).max(120).parse((request.query as { category?: unknown }).category)));
  app.get("/api/universal-tools/recommendations", { preHandler: [context.security.requireAuthentication, context.security.inspectNetwork] }, async request => {
    const query = z.object({ category: z.string().regex(/^[a-z][a-z0-9_.:-]{2,119}$/) }).strict().parse(request.query);
    return new ToolIntelligenceService(runtime().gateway).recommend(await trusted(request), query.category);
  });
  app.post("/api/universal-tools/providers", { preHandler: mutations }, async (request) => runtime().lifecycle.registerRemote(await trusted(request), request.body));
  app.post("/api/universal-tools/finite-providers", { preHandler: mutations }, async (request) => runtime().lifecycle.registerFinite(await trusted(request), request.body));
  app.get("/api/universal-tools/tools/:toolId", { preHandler: [context.security.requireAuthentication, context.security.inspectNetwork] }, async request => {
    const scope = await trusted(request);
    const tool = await runtime().store.findTool(scope.ownerId, ToolParameters.parse(request.params).toolId);
    const provider = tool ? await runtime().store.findProvider(scope.ownerId, tool.providerId) : null;
    if (!scope.companyId || !tool || tool.ownerId !== scope.ownerId || tool.companyId !== scope.companyId ||
        !provider || provider.ownerId !== scope.ownerId || provider.companyId !== scope.companyId)
      throw Object.assign(Error("Reviewed tool not found in this company."), { statusCode: 404 });
    const review = await runtime().store.findReview(scope.ownerId, tool.id);
    if (review && (review.ownerId !== scope.ownerId || review.companyId !== scope.companyId || review.providerId !== provider.id || review.toolId !== tool.id))
      throw Object.assign(Error("Reviewed tool not found in this company."), { statusCode: 404 });
    return UniversalToolInspectionSchema.parse({ tool, review, providerStatus: provider.status, providerHealth: provider.health });
  });
  app.post("/api/universal-tools/providers/:providerId/discover", { preHandler: mutations }, async (request) => runtime().lifecycle.discover(await trusted(request), ProviderParameters.parse(request.params).providerId));
  app.post("/api/universal-tools/tools/:toolId/review", { preHandler: mutations }, async (request) => runtime().lifecycle.review(await trusted(request), ToolParameters.parse(request.params).toolId, ReviewBody.parse(request.body).schemaDigest));
  app.post("/api/universal-tools/tools/:toolId/activate", { preHandler: mutations }, async (request) => runtime().lifecycle.activate(await trusted(request), ToolParameters.parse(request.params).toolId));
  app.post("/api/universal-tools/tools/:toolId/disable", { preHandler: mutations }, async (request) => runtime().lifecycle.disable(await trusted(request), ToolParameters.parse(request.params).toolId));
  app.post("/api/universal-tools/tools/:toolId/revoke", { preHandler: mutations }, async (request) => runtime().lifecycle.disable(await trusted(request), ToolParameters.parse(request.params).toolId, true));
  app.post("/api/universal-tools/invocations", { preHandler: mutations }, async (request) => UniversalToolResultSchema.parse(await runtime().gateway.invoke(await trusted(request), UniversalToolRequestSchema.parse(request.body))));
  app.get("/api/universal-tools/telemetry", { preHandler: [context.security.requireAuthentication, context.security.inspectNetwork] }, async (request) => {
    const scope = await trusted(request);
    if (!scope.companyId) throw new Error("Company required.");
    return summarizeToolReceipts(await runtime().store.listReceipts(scope.ownerId, scope.companyId, 500));
  });
  app.post("/api/universal-tools/invocations/:invocationId/reconcile", { preHandler: mutations }, async (request) => {
    const scope = await trusted(request);
    if (!scope.companyId) throw new Error("Company required.");
    const invocationId = InvocationParameters.parse(request.params).invocationId;
    const receipt = await runtime().gateway.reconcileReceipt(scope, invocationId);
    if (!receipt) throw Object.assign(new Error("Invocation receipt not found."), { statusCode: 404 });
    await context.governanceAudit({ eventType: "INTEGRATION_OPERATION_REQUESTED", ownerId: scope.ownerId,
      companyId: scope.companyId, outcome: "SUCCESS", reason: "Universal tool receipt reconciled without provider replay.",
      metadata: { invocationId, toolId: receipt.toolId, requestDigest: receipt.requestDigest, receiptStatus: receipt.status },
      requestId: scope.requestId, ipAddress: scope.ipAddress ?? "internal" });
    return { invocationId, status: receipt.status === "COMPLETED" ? receipt.result?.status ?? "INDETERMINATE" : "INDETERMINATE",
      externalOperationId: receipt.result?.externalOperationId ?? null, providerStatusVerified: receipt.status === "COMPLETED" && receipt.result?.status !== "INDETERMINATE", retryAllowed: false };
  });
  app.post("/api/universal-tools/invocations/:invocationId/acceptance", { preHandler: mutations }, async (request) => {
    const scope = await trusted(request);
    if (!scope.companyId) throw new Error("Company required.");
    const invocationId = InvocationParameters.parse(request.params).invocationId;
    const acceptance = AcceptanceBody.parse(request.body).acceptance;
    const receipt = await runtime().store.findReceipt(scope.ownerId, scope.companyId, invocationId);
    if (!receipt || receipt.status !== "COMPLETED" || receipt.result?.status !== "SUCCEEDED" || receipt.result.ownerAcceptance) throw Object.assign(new Error("Completed unreviewed outcome not found."), { statusCode: 409 });
    await context.governanceAudit({ eventType: "INTEGRATION_OPERATION_REQUESTED", ownerId: scope.ownerId,
      companyId: scope.companyId, outcome: "SUCCESS", reason: "Owner requested universal tool outcome acceptance.",
      metadata: { invocationId, toolId: receipt.toolId, requestDigest: receipt.requestDigest, acceptance },
      requestId: scope.requestId, ipAddress: scope.ipAddress ?? "internal" });
    if (!await runtime().store.setOwnerAcceptance(scope.ownerId, scope.companyId, invocationId, acceptance)) throw Object.assign(new Error("Outcome acceptance conflict."), { statusCode: 409 });
    return { invocationId, acceptance };
  });
};
