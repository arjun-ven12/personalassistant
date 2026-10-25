import {
  CreateMarketingCampaignRequestSchema,
  MarketingArtifactSchema,
  MarketingCampaignSchema,
  MarketingAnalyticsMetricRequestSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { installCompanyRouteGuard } from "./company-guard.js";
import type { ApiRouteContext } from "./context.js";
import { buildMarketingTelemetry } from "../marketing/telemetry.js";

const CampaignParamsSchema = z.object({ campaignId: z.string().uuid() }).strict();
const DeliverableParamsSchema = z.object({
  campaignId: z.string().uuid(),
  deliverableId: z.string().uuid(),
}).strict();
const ListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const DraftBodySchema = z.object({ content: z.json() }).strict();
const CampaignViewSchema = z.object({
  campaign: MarketingCampaignSchema,
  artifacts: z.array(MarketingArtifactSchema),
  progressPercent: z.number().int().min(0).max(100),
  approvalsPending: z.number().int().nonnegative(),
}).strict();

/** Campaign drafting only. Publishing, ad spend, and external actions have no route here. */
export const registerMarketingRoutes = (app: FastifyInstance, context: ApiRouteContext) => {
  installCompanyRouteGuard(app, "/api/marketing-campaigns", context);
  const mutations = [
    context.security.requireTrustedOrigin,
    context.security.requireCsrf,
    context.security.verifyTransportNetwork,
  ];
  const scoped = (request: Parameters<typeof context.companyContext.get>[0]) => {
    const company = context.companyContext.get(request);
    return { ownerId: company.ownerId, companyId: company.companyId, requestId: request.id, ipAddress: request.ip };
  };

  app.get("/api/marketing-campaigns", async (request) => {
    const company = context.companyContext.get(request);
    const { limit } = ListQuerySchema.parse(request.query);
    return { campaigns: z.array(MarketingCampaignSchema).parse(await context.marketing.store.listCampaigns(company.ownerId, company.companyId, limit)) };
  });
  app.post("/api/marketing-campaigns", { preHandler: mutations }, async (request) =>
    MarketingCampaignSchema.parse(await context.marketing.create(scoped(request), CreateMarketingCampaignRequestSchema.parse(request.body))),
  );
  app.post("/api/marketing-campaigns/:campaignId/start", { preHandler: mutations }, async (request) => {
    const trusted = scoped(request);
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const identity = context.security.getIdentity(request);
    await context.marketing.start({ ...trusted, sessionId: identity.session.id, emergencyStopActive: await context.emergencyStopActive() }, campaignId);
    context.marketingCoordinator.requestProgress({ ...trusted, campaignId });
    return z.object({ status: z.literal("QUEUED"), campaignId: z.string().uuid() }).strict().parse({ status: "QUEUED", campaignId });
  });
  app.post("/api/marketing-campaigns/:campaignId/pause", { preHandler: mutations }, async request => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    return context.marketing.pause(scoped(request), campaignId);
  });
  const reviewParams = CampaignParamsSchema.extend({ artifactId: z.string().uuid() });
  for (const operation of ["request", "finalize"] as const) {
    app.post(`/api/marketing-campaigns/:campaignId/artifacts/:artifactId/review/${operation}`, { preHandler: mutations }, async (request) => {
      const params = reviewParams.parse(request.params);
      const trusted = scoped(request);
      const identity = context.security.getIdentity(request);
      const result = await context.marketingReview[operation]({ ...trusted, sessionId: identity.session.id,
        deviceTrusted: false, signedEnvelopeVerified: false, emergencyStopActive: await context.emergencyStopActive(),
        networkVerification: context.security.getNetworkState(request) }, params.campaignId, params.artifactId);
      if (operation === "finalize") {
        const artifact = (await context.marketing.store.listArtifacts(trusted.ownerId, trusted.companyId, params.campaignId)).find((item) => item.id === params.artifactId);
        if (artifact?.type === "BRAND_STRATEGY" && artifact.status === "APPROVED") await context.marketing.promoteBrand(trusted, params.campaignId, artifact.contentDigest);
        context.marketingCoordinator.requestProgress({ ...trusted, campaignId: params.campaignId });
      }
      return result;
    });
  }
  app.post("/api/marketing-campaigns/:campaignId/initiatives/draft", { preHandler: mutations }, async request => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const { artifactId, index } = z.object({ artifactId: z.string().uuid(), index: z.number().int().min(0).max(5) }).strict().parse(request.body);
    return context.marketing.draftInitiative(scoped(request), campaignId, artifactId, index);
  });
  app.post("/api/marketing-campaigns/:campaignId/brand-memory", { preHandler: mutations }, async (request) => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const { contentDigest } = z.object({ contentDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(request.body);
    return { memoryId: await context.marketing.promoteBrand(scoped(request), campaignId, contentDigest) };
  });
  app.post("/api/marketing-campaigns/:campaignId/cancel", { preHandler: mutations }, async (request) => {
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    return MarketingCampaignSchema.parse(await context.marketing.cancel({
      ownerId: company.ownerId, companyId: company.companyId, requestId: request.id, ipAddress: request.ip,
      sessionId: identity.session.id, networkState: context.security.getNetworkState(request),
    }, campaignId));
  });
  app.get("/api/marketing-campaigns/:campaignId", async (request) => {
    const company = context.companyContext.get(request);
    const campaignId = CampaignParamsSchema.parse(request.params).campaignId;
    await context.marketing.refreshLandingPage(company.ownerId, company.companyId, campaignId);
    return CampaignViewSchema.parse(await context.marketing.view(
      company.ownerId, company.companyId, campaignId,
    ));
  });
  const telemetry = async (request: Parameters<typeof context.companyContext.get>[0], campaignId: string) => {
    const company = context.companyContext.get(request);
    const campaign = await context.marketing.store.findCampaign(company.ownerId, company.companyId, campaignId);
    if (!campaign) throw Object.assign(new Error("Campaign not found."), { statusCode: 404 });
    const receipts = context.universalTools ? await context.universalTools.store.listReceipts(company.ownerId, company.companyId, 500) : [];
    const modelLedger = await context.aiEconomics.listLedger(company.ownerId, 100_000);
    const engineeringDelivery = await context.marketing.engineeringStore?.findByIdempotencyKey(company.ownerId, company.companyId, `marketing-landing-${campaignId}`) ?? null;
    return { campaign, projection: buildMarketingTelemetry(campaign, { receipts, modelLedger, engineeringDelivery, artifacts: await context.marketing.store.listArtifacts(company.ownerId, company.companyId, campaignId) }) };
  };
  app.get("/api/marketing-campaigns/:campaignId/telemetry", async (request) => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    return (await telemetry(request, campaignId)).projection;
  });
  app.post("/api/marketing-campaigns/:campaignId/benchmark/capture", { preHandler: mutations }, async (request) => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const { campaign, projection } = await telemetry(request, campaignId);
    if (!projection.engineeringBenchmark) throw new Error("A linked Engineering delivery is required for benchmark capture.");
    if (!await context.marketing.store.updateCampaign(MarketingCampaignSchema.parse({ ...campaign, version: campaign.version + 1,
      engineeringBenchmark: projection.engineeringBenchmark }), campaign.version)) throw new Error("Campaign changed before benchmark capture.");
    await context.governanceAudit({ ...scoped(request), eventType: "OBJECTIVE_STATE_CHANGED", outcome: "SUCCESS", reason: "Recorded Engineering benchmark snapshot from linked runtime evidence.", metadata: { campaignId, objectiveId: campaign.objectiveId } });
    return projection;
  });
  app.post(
    "/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/drafts",
    { preHandler: mutations },
    async (request) => {
      const params = DeliverableParamsSchema.parse(request.params);
      const { content } = DraftBodySchema.parse(request.body);
      return MarketingArtifactSchema.parse(await context.marketing.saveDraft(
        scoped(request), params.campaignId, params.deliverableId, content,
      ));
    },
  );
  app.post("/api/marketing-campaigns/:campaignId/landing-page/handoff", { preHandler: mutations }, async (request) => {
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const engineeringObjectiveId = await context.marketing.handoffLandingPage({
      ownerId: company.ownerId, companyId: company.companyId, requestId: request.id,
      ipAddress: request.ip, sessionId: identity.session.id,
      networkState: context.security.getNetworkState(request),
    }, campaignId);
    return { engineeringObjectiveId };
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/generate", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    const trusted = scoped(request);
    const campaign = await context.marketing.store.findCampaign(trusted.ownerId, trusted.companyId, params.campaignId);
    if (campaign?.deliverables.find(item => item.id === params.deliverableId)?.type === "RESEARCH") {
      const identity = context.security.getIdentity(request);
      return MarketingArtifactSchema.parse(await context.marketing.research({ ...trusted, agentId: null,
        sessionId: identity.session.id, networkVerification: context.security.getNetworkState(request),
        emergencyStopActive: await context.emergencyStopActive() }, params.campaignId, params.deliverableId));
    }
    return MarketingArtifactSchema.parse(await context.marketing.generateDraft(scoped(request), params.campaignId, params.deliverableId));
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/recover", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    return context.marketing.recoverBlockedDraft(scoped(request), params.campaignId, params.deliverableId);
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/specialist", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    return { workforceTaskId: await context.marketing.dispatchSpecialist(scoped(request), params.campaignId, params.deliverableId) };
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/specialist/refresh", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    const company = context.companyContext.get(request);
    return context.marketing.refreshSpecialist(company.ownerId, company.companyId, params.campaignId, params.deliverableId);
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/creative-availability", { preHandler: mutations }, async (request) => {
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    const params = DeliverableParamsSchema.parse(request.params);
    return context.marketing.checkCreativeAvailability({
      ownerId: company.ownerId, companyId: company.companyId, agentId: null,
      requestId: request.id, ipAddress: request.ip, sessionId: identity.session.id,
      emergencyStopActive: await context.emergencyStopActive(),
      networkVerification: context.security.getNetworkState(request),
    }, params.campaignId, params.deliverableId);
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/creative", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    const body = z.object({ brief: z.string().trim().min(1).max(2_000), approvalId: z.string().uuid().nullable() }).strict().parse(request.body);
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    return context.marketing.generateCreative({ ...scoped(request), agentId: null, sessionId: identity.session.id,
      emergencyStopActive: await context.emergencyStopActive(), networkVerification: context.security.getNetworkState(request),
      companyId: company.companyId }, params.campaignId, params.deliverableId, body.brief, body.approvalId);
  });
  app.post("/api/marketing-campaigns/:campaignId/deliverables/:deliverableId/creative/reconcile", { preHandler: mutations }, async (request) => {
    const params = DeliverableParamsSchema.parse(request.params);
    const identity = context.security.getIdentity(request);
    return context.marketing.reconcileCreative({ ...scoped(request), agentId: null, sessionId: identity.session.id,
      emergencyStopActive: await context.emergencyStopActive(), networkVerification: context.security.getNetworkState(request) }, params.campaignId, params.deliverableId);
  });
  app.post("/api/marketing-campaigns/:campaignId/package", { preHandler: mutations }, async (request) => {
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    return MarketingArtifactSchema.parse(await context.marketing.preparePackage(scoped(request), campaignId));
  });
  app.post("/api/marketing-campaigns/:campaignId/analytics/read-metric", { preHandler: mutations }, async (request) => {
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    const trusted = { ownerId: company.ownerId, companyId: company.companyId, agentId: null,
      requestId: request.id, ipAddress: request.ip, sessionId: identity.session.id,
      emergencyStopActive: await context.emergencyStopActive(),
      networkVerification: context.security.getNetworkState(request) };
    const artifact = MarketingArtifactSchema.parse(await context.marketing.readAnalyticsMetric(trusted, campaignId, MarketingAnalyticsMetricRequestSchema.parse(request.body)));
    context.marketingCoordinator.requestProgress({ ...trusted, campaignId });
    return artifact;
  });
  app.post("/api/marketing-campaigns/:campaignId/advance", { preHandler: mutations }, async (request) => {
    const company = context.companyContext.get(request);
    const identity = context.security.getIdentity(request);
    const { campaignId } = CampaignParamsSchema.parse(request.params);
    return context.marketing.advance({ ownerId: company.ownerId, companyId: company.companyId,
      requestId: request.id, ipAddress: request.ip, sessionId: identity.session.id,
      networkState: context.security.getNetworkState(request),
      emergencyStopActive: await context.emergencyStopActive() }, campaignId);
  });
};
