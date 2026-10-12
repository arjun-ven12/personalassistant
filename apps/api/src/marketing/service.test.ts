import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { TrustedToolContext } from "../universal-tools/gateway.js";
import { MarketingService, decomposeMarketingObjective } from "./service.js";
import { InMemoryMarketingStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const otherCompanyId = "30000000-0000-4000-8000-000000000003";
const objectiveId = "40000000-0000-4000-8000-000000000004";
const now = new Date("2026-09-30T09:00:00.000Z");
const requestContext = {
  ownerId,
  companyId,
  requestId: "marketing-test-request",
  ipAddress: "100.64.0.1",
};

const request = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: "marketing-campaign-key",
  title: "Launch the product",
  productOrCompany: "Alexa Control",
  objectiveType: "SOCIAL_CAMPAIGN",
  ...overrides,
});

const brandContent = {
  positioning: "The secure personal assistant foundation.", targetAudience: "Security-conscious teams.",
  brandPromise: "Controlled assistance with auditable governance.", messagingPillars: ["Explicit authority"],
  valuePropositions: ["Reviewable actions"], toneOfVoice: "Clear and measured.",
  visualDirection: "Calm, high-contrast controls.", campaignThemes: ["Trust"], contentThemes: ["Governance"],
  competitorObservations: [], prohibitedClaims: ["Fully autonomous operation"],
};
const webCopy = {
  title: "Campaign message",
  variants: [{ channel: "WEB", headline: "Governed assistance", body: "A bounded marketing message.", cta: "Request access" }],
};
const engineeringContext = { ...requestContext, sessionId: "50000000-0000-4000-8000-000000000005", networkState: "PRIVATE_NETWORK" as const };

const setup = (dependencies: { tools?: unknown; engineering?: unknown; engineeringStore?: unknown; aiRouter?: unknown; workforce?: unknown; agents?: unknown; workforceStore?: unknown } = {}) => {
  const store = new InMemoryMarketingStore();
  const auditEvents: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    auditEvents.push(event);
  };
  const objectives = {
    create: vi.fn((input: { body: { organizationId: string } }) => Promise.resolve({
      objective: { id: objectiveId, organizationId: input.body.organizationId },
      projects: [],
      clarificationQuestions: [],
    })),
  };
  const service = new MarketingService(store, objectives as never, audit, dependencies.tools as never, () => now,
    dependencies.engineering as never, dependencies.engineeringStore as never, dependencies.aiRouter as never,
    undefined, undefined, dependencies.workforce as never, dependencies.agents as never, dependencies.workforceStore as never);
  return { store, auditEvents, objectives, service };
};

describe("MarketingService", () => {
  it("claims creative work once, stores the governed asset reference and denies another concurrent brief", async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const called = new Promise<void>((resolve) => { started = resolve; });
    const invoke = vi.fn(async (context: TrustedToolContext, input: { invocationId: string; toolId: string }) => {
      started!();
      await gate;
      return { status: "SUCCEEDED", invocationId: input.invocationId, toolId: input.toolId, providerId: "sandbox.creative",
        structuredOutput: { assetRef: "artifact:hero", mediaType: "IMAGE" } };
    });
    const { service } = setup({ tools: {
      select: () => Promise.resolve([{ id: "sandbox.creative:image", operationClass: "WRITE", riskLevel: "medium", approvalRequirement: "explicit", costModel: "FREE" }]), invoke,
    } });
    const campaign = await service.create(requestContext, request({ objectiveType: "PRODUCT_LAUNCH" }));
    await service.saveDraft(requestContext, campaign.id, campaign.deliverables.find((item) => item.type === "RESEARCH")!.id, { observations: [], summary: "No verified external evidence available." });
    await service.saveDraft(requestContext, campaign.id, campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!.id, brandContent);
    const image = campaign.deliverables.find((item) => item.type === "IMAGE_ASSET")!;
    const context = { ...requestContext, agentId: null, emergencyStopActive: false };
    const first = service.generateCreative(context, campaign.id, image.id, "Blue geometric art", null);
    await called;
    await expect(service.generateCreative(context, campaign.id, image.id, "Different art", null)).rejects.toThrow("already claimed");
    release!();
    const outcome = await first;
    expect(outcome.status).toBe("SUCCEEDED");
    if (outcome.status !== "SUCCEEDED") throw new Error("Expected creative artifact");
    expect(outcome.artifact.content).toMatchObject({ externalAssetRef: "artifact:hero", providerId: "sandbox.creative" });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("decomposes campaign objectives into an ordered dependency DAG", () => {
    const deliverables = decomposeMarketingObjective("PRODUCT_LAUNCH", now.toISOString());
    const byType = new Map(deliverables.map((item) => [item.type, item]));

    expect(deliverables.map((item) => item.type)).toEqual([
      "RESEARCH", "BRAND_STRATEGY", "MESSAGING", "IMAGE_ASSET", "LANDING_PAGE",
      "SOCIAL_POST", "AD_CONCEPT", "ANALYTICS_REPORT", "LAUNCH_PACKAGE",
    ]);
    expect(byType.get("BRAND_STRATEGY")?.dependencies).toEqual([byType.get("RESEARCH")?.id]);
    expect(byType.get("LANDING_PAGE")?.dependencies).toEqual([
      byType.get("BRAND_STRATEGY")?.id, byType.get("MESSAGING")?.id,
    ]);
    expect(byType.get("LAUNCH_PACKAGE")?.dependencies).toEqual([
      byType.get("IMAGE_ASSET")?.id, byType.get("LANDING_PAGE")?.id,
      byType.get("SOCIAL_POST")?.id, byType.get("AD_CONCEPT")?.id,
      byType.get("ANALYTICS_REPORT")?.id,
    ]);
    expect(byType.get("RESEARCH")?.status).toBe("READY");
    expect(byType.get("LAUNCH_PACKAGE")?.status).toBe("PLANNED");
  });

  it("enforces company scope when viewing campaigns and artifacts", async () => {
    const { service } = setup();
    const campaign = await service.create(requestContext, request());

    await expect(service.view(ownerId, otherCompanyId, campaign.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.saveDraft({ ...requestContext, companyId: otherCompanyId }, campaign.id, campaign.deliverables[0]!.id, { body: "draft" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns the original campaign for the same idempotency key and denies conflicting reuse", async () => {
    const { service, objectives, auditEvents } = setup();
    const campaign = await service.create(requestContext, request());
    const duplicate = await service.create(requestContext, request());

    expect(duplicate.id).toBe(campaign.id);
    expect(objectives.create).toHaveBeenCalledTimes(1);
    expect(auditEvents).toHaveLength(1);
    await expect(service.create(requestContext, request({ title: "Different title" }))).rejects.toThrow("Campaign idempotency conflict.");
  });

  it("validates brand drafts and persists a digest-bound first artifact version", async () => {
    const { service, store } = setup();
    const campaign = await service.create(requestContext, request({ objectiveType: "LANDING_PAGE" }));
    const brand = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;

    await expect(service.saveDraft(requestContext, campaign.id, brand.id, { positioning: "missing required fields" })).rejects.toThrow();
    const artifact = await service.saveDraft(requestContext, campaign.id, brand.id, brandContent);
    const expectedDigest = createHash("sha256").update(JSON.stringify(brandContent)).digest("hex");

    expect(artifact.version).toBe(1);
    expect(artifact.contentDigest).toBe(expectedDigest);
    expect((await store.listArtifacts(ownerId, companyId, campaign.id))).toEqual([artifact]);
    const revised = await service.saveDraft(
      requestContext, campaign.id, brand.id, { ...brandContent, positioning: "A conflicting positioning statement." },
    );
    expect(revised).toMatchObject({ version: 2 });
    expect(revised.contentDigest).not.toBe(artifact.contentDigest);
  });

  it("selects only through the trusted gateway with a scoped context", async () => {
    const select = vi.fn(() => Promise.resolve([{ id: "reviewed-tool" }]));
    const service = new MarketingService(new InMemoryMarketingStore(), {} as never, () => undefined, { select } as never, () => now);
    const toolContext: TrustedToolContext = { ownerId, companyId, agentId: null, requestId: "tool-request", emergencyStopActive: false };

    await expect(service.eligibleTools(toolContext, "marketing.images")).resolves.toEqual([{ id: "reviewed-tool" }]);
    expect(select).toHaveBeenCalledWith(toolContext, "marketing.images", 10);
    await expect(service.eligibleTools({ ...toolContext, companyId: null }, "marketing.images")).resolves.toEqual([]);
  });

  it("reports weighted progress and releases direct dependents after a draft", async () => {
    const { service } = setup();
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;

    await service.saveDraft(requestContext, campaign.id, messaging.id, {
      title: "Campaign message",
      variants: [{ channel: "LINKEDIN", headline: "Governed assistance", body: "A bounded marketing message.", cta: null }],
    });
    const view = await service.view(ownerId, companyId, campaign.id);

    expect(view.progressPercent).toBe(17);
    expect(view.campaign.deliverables.find((item) => item.type === "SOCIAL_POST")?.status).toBe("READY");
    expect(view.campaign.deliverables.find((item) => item.type === "CAMPAIGN_CALENDAR")?.status).toBe("PLANNED");
  });

  it("uses the bounded AI router output to save a validated ready draft", async () => {
    const executeStructured = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve({ outcome: "SUCCESS", structuredOutput: webCopy });
    });
    const { service, store } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;

    const artifact = await service.generateDraft(requestContext, campaign.id, messaging.id);

    expect(artifact.content).toEqual(webCopy);
    expect(executeStructured).toHaveBeenCalledOnce();
    expect(executeStructured.mock.calls[0]?.[0]).toMatchObject({
      outputMode: "STRUCTURED", schemaName: "marketing_messaging", risk: "LOW", objectiveId: campaign.objectiveId,
    });
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.id === messaging.id)?.status).toBe("DRAFT_READY");
  });

  it("denies AI generation across company scope before invoking the model", async () => {
    const executeStructured = vi.fn();
    const { service } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());

    await expect(service.generateDraft({ ...requestContext, companyId: otherCompanyId }, campaign.id, campaign.deliverables[0]!.id)).rejects.toThrow("Marketing model runtime unavailable.");
    expect(executeStructured).not.toHaveBeenCalled();
  });

  it("marks a claimed deliverable blocked when bounded AI generation fails", async () => {
    const executeStructured = vi.fn(() => Promise.resolve({ outcome: "FAILED" }));
    const { service, store } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;

    await expect(service.generateDraft(requestContext, campaign.id, messaging.id)).rejects.toThrow("Marketing model generation did not produce a validated draft.");
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.id === messaging.id)?.status).toBe("BLOCKED");
  });

  it("requires an explicit scoped recovery before a failed draft can be retried", async () => {
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "recovery" }, async () => {
    const executeStructured = vi.fn(() => Promise.resolve({ outcome: "FAILED" }));
    const { service, store, auditEvents } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    await expect(service.generateDraft(requestContext, campaign.id, messaging.id)).rejects.toThrow();
    await expect(service.recoverBlockedDraft({ ...requestContext, companyId: otherCompanyId }, campaign.id, messaging.id)).rejects.toThrow();
    const recovered = await service.recoverBlockedDraft(requestContext, campaign.id, messaging.id);
    expect(recovered.status).toBe("READY");
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.version).toBe(4);
    expect(auditEvents.at(-1)).toMatchObject({ eventType: "OBJECTIVE_STATE_CHANGED", metadata: { recoveredStatus: "READY" } });
    await expect(service.recoverBlockedDraft(requestContext, campaign.id, messaging.id)).rejects.toThrow("Only blocked drafts");
    });
  });

  it("reconciles a stored artifact after an interrupted campaign update without another model call", async () => {
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "recovery" }, async () => {
    const executeStructured = vi.fn(() => Promise.resolve({ outcome: "FAILED" }));
    const { service, store } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    await expect(service.generateDraft(requestContext, campaign.id, messaging.id)).rejects.toThrow();
    const contentDigest = createHash("sha256").update(JSON.stringify(webCopy)).digest("hex");
    const orphan = await store.createArtifact({ id: crypto.randomUUID(), ownerId, companyId, campaignId: campaign.id,
      deliverableId: messaging.id, type: messaging.type, version: 1, status: "DRAFT", contentDigest,
      content: webCopy, externalRef: null, approvalRequestId: null, createdAt: now.toISOString() });
    const recovered = await service.recoverBlockedDraft(requestContext, campaign.id, messaging.id);
    expect(recovered).toMatchObject({ status: "DRAFT_READY", artifactRef: `marketing-artifact:${orphan.id}`, contentDigest });
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.type === "SOCIAL_POST")?.status).toBe("READY");
    expect(executeStructured).toHaveBeenCalledTimes(1);
    });
  });

  it("closes a campaign with CAS and keeps cancellation idempotent and company-scoped", async () => {
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "recovery" }, async () => {
    const { service, store, auditEvents } = setup();
    const campaign = await service.create(requestContext, request());
    await expect(service.cancel({ ...engineeringContext, companyId: otherCompanyId }, campaign.id)).rejects.toThrow();
    const cancelled = await service.cancel(engineeringContext, campaign.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.deliverables.every((item) => item.status === "CANCELLED")).toBe(true);
    await expect(service.saveDraft(requestContext, campaign.id, campaign.deliverables[0]!.id, webCopy)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.cancel(engineeringContext, campaign.id)).version).toBe(cancelled.version);
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.status).toBe("CANCELLED");
    expect(auditEvents.filter((item) => item.eventType === "OBJECTIVE_STATE_CHANGED")).toHaveLength(1);
    });
  });

  it("claims a ready deliverable with CAS before model generation so a concurrent request cannot duplicate it", async () => {
    let releaseGeneration: (() => void) | undefined;
    let generationStarted: (() => void) | undefined;
    const generationGate = new Promise<void>((resolve) => { releaseGeneration = resolve; });
    const started = new Promise<void>((resolve) => { generationStarted = resolve; });
    const executeStructured = vi.fn(async (input: unknown) => {
      void input;
      generationStarted?.();
      await generationGate;
      return { outcome: "SUCCESS", structuredOutput: webCopy };
    });
    const { service } = setup({ aiRouter: { executeStructured } });
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;

    const first = service.generateDraft(requestContext, campaign.id, messaging.id);
    await started;
    await expect(service.generateDraft(requestContext, campaign.id, messaging.id)).rejects.toThrow("Deliverable is not ready for bounded generation.");
    releaseGeneration?.();
    await expect(first).resolves.toMatchObject({ deliverableId: messaging.id });
    expect(executeStructured).toHaveBeenCalledOnce();
  });

  it("requires a registered repository and completed briefs before landing-page handoff", async () => {
    const engineering = { create: vi.fn() };
    const withoutRepository = setup({ engineering });
    const campaign = await withoutRepository.service.create(requestContext, request({ objectiveType: "LANDING_PAGE" }));
    await expect(withoutRepository.service.handoffLandingPage(engineeringContext, campaign.id)).rejects.toThrow("Registered Engineering delivery is unavailable.");

    const withRepository = setup({ engineering });
    const repositoryCampaign = await withRepository.service.create(requestContext, request({
      objectiveType: "LANDING_PAGE", idempotencyKey: "marketing-repository-key", engineeringRepositoryId: "60000000-0000-4000-8000-000000000006",
    }));
    await expect(withRepository.service.handoffLandingPage(engineeringContext, repositoryCampaign.id)).rejects.toThrow("Bounded brand and messaging briefs are required");
    expect(engineering.create).not.toHaveBeenCalled();
  });

  it("marks unavailable creative work and releases a package once its remaining inputs are ready", async () => {
    const select = vi.fn(() => Promise.resolve([]));
    const { service, store } = setup({ tools: { select } });
    const campaign = await service.create(requestContext, request({ objectiveType: "PRODUCT_LAUNCH" }));
    const image = campaign.deliverables.find((item) => item.type === "IMAGE_ASSET")!;
    const prepared = {
      ...campaign,
      version: campaign.version + 1,
      deliverables: campaign.deliverables.map((item) => item.id === image.id ? { ...item, status: "READY" as const }
        : ["LANDING_PAGE", "SOCIAL_POST", "AD_CONCEPT", "ANALYTICS_REPORT"].includes(item.type) ? { ...item, status: "DRAFT_READY" as const }
          : item),
    };
    expect(await store.updateCampaign(prepared, campaign.version)).toBe(true);

    await expect(service.checkCreativeAvailability({ ownerId, companyId, agentId: null, requestId: "creative-request", emergencyStopActive: false }, campaign.id, image.id)).resolves.toEqual({ candidates: [], status: "TOOL_UNAVAILABLE" });
    const updated = await store.findCampaign(ownerId, companyId, campaign.id);
    expect(updated?.deliverables.find((item) => item.id === image.id)?.status).toBe("TOOL_UNAVAILABLE");
    expect(updated?.deliverables.find((item) => item.type === "LAUNCH_PACKAGE")?.status).toBe("READY");
  });

  it("keeps creative work ready when a reviewed candidate is available", async () => {
    const select = vi.fn(() => Promise.resolve([{ id: "reviewed-image-tool" }]));
    const { service, store } = setup({ tools: { select } });
    const campaign = await service.create(requestContext, request({ objectiveType: "PRODUCT_LAUNCH", idempotencyKey: "creative-candidate-key" }));
    const image = campaign.deliverables.find((item) => item.type === "IMAGE_ASSET")!;
    const readyCampaign = { ...campaign, version: campaign.version + 1,
      deliverables: campaign.deliverables.map((item) => item.id === image.id ? { ...item, status: "READY" as const } : item) };
    expect(await store.updateCampaign(readyCampaign, campaign.version)).toBe(true);

    await expect(service.checkCreativeAvailability({ ownerId, companyId, agentId: null, requestId: "creative-request", emergencyStopActive: false }, campaign.id, image.id)).resolves.toEqual({ candidates: [{ id: "reviewed-image-tool" }], status: "READY" });
    expect(select).toHaveBeenCalledWith(expect.any(Object), "image.generate", 10);
  });

  it("prepares a review-only package from verified campaign artifacts", async () => {
    const { service } = setup();
    const campaign = await service.create(requestContext, request());
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    await service.saveDraft(requestContext, campaign.id, messaging.id, webCopy);
    const afterMessaging = await service.view(ownerId, companyId, campaign.id);
    const social = afterMessaging.campaign.deliverables.find((item) => item.type === "SOCIAL_POST")!;
    await service.saveDraft(requestContext, campaign.id, social.id, webCopy);
    const afterSocial = await service.view(ownerId, companyId, campaign.id);
    const calendar = afterSocial.campaign.deliverables.find((item) => item.type === "CAMPAIGN_CALENDAR")!;
    await service.saveDraft(requestContext, campaign.id, calendar.id, webCopy);

    const artifact = await service.preparePackage(requestContext, campaign.id);
    const view = await service.view(ownerId, companyId, campaign.id);
    expect(artifact.content).toMatchObject({ publicActionsPendingApproval: true, warnings: [] });
    expect(view.campaign.status).toBe("PACKAGE_READY");
  });

  it("records a verified governed analytics read and denies cross-company reads", async () => {
    const select = vi.fn(() => Promise.resolve([{
      id: "reviewed-analytics-tool", operationClass: "READ", riskLevel: "read_only", costModel: "FREE",
    }]));
    const invoke = vi.fn((_context: unknown, input: { invocationId: string; toolId: string }) => Promise.resolve({ status: "SUCCEEDED", invocationId: input.invocationId, toolId: input.toolId, structuredOutput: {
      status: "VERIFIED", metricId: "active_users", value: 42, unit: "users", observedAt: now.toISOString(),
    } }));
    const { service } = setup({ tools: { select, invoke } });
    const campaign = await service.create(requestContext, request({ objectiveType: "ANALYTICS", idempotencyKey: "analytics-campaign-key" }));
    const toolContext: TrustedToolContext = { ownerId, companyId, agentId: null, requestId: "analytics-request", emergencyStopActive: false, ipAddress: requestContext.ipAddress };
    const metric = { metricId: "active_users", windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-09-30T00:00:00.000Z" };

    const artifact = await service.readAnalyticsMetric(toolContext, campaign.id, metric);
    expect(artifact.content).toMatchObject({ metrics: [{ name: "active_users", value: 42, unit: "users", source: null }], causalityClaimed: false });
    expect(invoke).toHaveBeenCalledOnce();
    await expect(service.readAnalyticsMetric({ ...toolContext, companyId: otherCompanyId }, campaign.id, metric)).rejects.toThrow("Analytics deliverable is not ready.");
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("hands off a prepared landing page once and refreshes only a healthy scoped preview", async () => {
    const deliveryId = "70000000-0000-4000-8000-000000000007";
    const engineeringObjectiveId = "80000000-0000-4000-8000-000000000008";
    const delivery = {
      id: deliveryId, objectiveId: engineeringObjectiveId, firstPreviewAt: now.toISOString(),
      preview: { state: "RUNNING", healthStatus: "PASS", url: "https://preview.example.test", previewId: "preview-1" },
    };
    const engineering = { create: vi.fn((context: unknown, body: unknown) => {
      void context;
      void body;
      return Promise.resolve({ delivery });
    }) };
    const engineeringStore = { findByIdempotencyKey: vi.fn(() => Promise.resolve(delivery)) };
    const { service } = setup({ engineering, engineeringStore });
    const campaign = await service.create(requestContext, request({
      objectiveType: "LANDING_PAGE", idempotencyKey: "marketing-handoff-key", engineeringRepositoryId: "60000000-0000-4000-8000-000000000006",
    }));
    const brand = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;
    await service.saveDraft(requestContext, campaign.id, brand.id, brandContent);
    const afterBrand = await service.view(ownerId, companyId, campaign.id);
    const messaging = afterBrand.campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    await service.saveDraft(requestContext, campaign.id, messaging.id, webCopy);

    await expect(service.handoffLandingPage(engineeringContext, campaign.id)).resolves.toBe(engineeringObjectiveId);
    await expect(service.handoffLandingPage(engineeringContext, campaign.id)).resolves.toBe(engineeringObjectiveId);
    expect(engineering.create).toHaveBeenCalledOnce();
    expect(engineering.create.mock.calls[0]?.[1]).toMatchObject({ repositoryId: "60000000-0000-4000-8000-000000000006", idempotencyKey: `marketing-landing-${campaign.id}` });

    const refreshed = await service.refreshLandingPage(ownerId, companyId, campaign.id);
    const landing = refreshed.deliverables.find((item) => item.type === "LANDING_PAGE")!;
    expect(landing).toMatchObject({ status: "DRAFT_READY", approvalState: "NOT_REQUIRED", artifactRef: `engineering-delivery:${deliveryId}` });
    await expect(service.refreshLandingPage(ownerId, otherCompanyId, campaign.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(engineeringStore.findByIdempotencyKey).toHaveBeenCalledOnce();
  });

  it("binds a specialist dispatch to an active exact-company assignment and executed provenance", async () => {
    const agentId = "native_copywriter";
    const assignmentId = "90000000-0000-4000-8000-000000000009";
    const taskId = "a0000000-0000-4000-8000-00000000000a";
    const organizationId = "b0000000-0000-4000-8000-00000000000b";
    const task = { id: taskId, organizationId, companyAssignmentId: assignmentId,
      assignedAgentId: agentId, status: "COMPLETED", resultSummary: "Verified copy task summary.",
      inputs: {} as Record<string, unknown>, completionProvenance: { completionType: "EXECUTED",
        agentSessionId: crypto.randomUUID(), modelRequestId: crypto.randomUUID() },
      marketingResult: null as null | { companyId: string; campaignId: string; objectiveId: string;
        deliverableId: string; deliverableType: "MESSAGING"; agentId: string; content: typeof webCopy } };
    const workforce = { createTask: vi.fn(() => Promise.resolve({ task })), dispatch: vi.fn(() => Promise.resolve({ task })) };
    const agents = { findAgent: vi.fn(() => Promise.resolve({ id: agentId, workforce: { organizationId } })),
      findAssignment: vi.fn((_owner: string, _agent: string, company: string) => Promise.resolve({
        id: assignmentId, companyId: company, organizationId, status: "ACTIVE", departmentId: null,
      })) };
    const workforceStore = { findTask: vi.fn(() => Promise.resolve(task)) };
    const { service } = setup({ workforce, agents, workforceStore });
    const campaign = await service.create(requestContext, request({ idempotencyKey: "specialist-bridge-key" }));
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    task.inputs = { marketingCampaignId: campaign.id, marketingObjectiveId: campaign.objectiveId,
      marketingDeliverableId: messaging.id, marketingDeliverableType: "MESSAGING", marketingCompanyId: companyId,
      marketingAgentId: agentId };
    task.marketingResult = { companyId, campaignId: campaign.id, objectiveId: campaign.objectiveId,
      deliverableId: messaging.id, deliverableType: "MESSAGING", agentId, content: webCopy };
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "specialist" }, async () => {
      await expect(service.dispatchSpecialist(requestContext, campaign.id, messaging.id)).resolves.toBe(taskId);
      expect(workforce.createTask.mock.calls[0]).toMatchObject([{ body: {
        assignedAgentId: agentId, idempotencyKey: `marketing:${campaign.id}:${messaging.id}`,
      } }]);
      await expect(service.refreshSpecialist(ownerId, companyId, campaign.id, messaging.id)).resolves.toMatchObject({ deliverableStatus: "DRAFT_READY" });
      expect((await service.view(ownerId, companyId, campaign.id)).artifacts).toContainEqual(expect.objectContaining({
        deliverableId: messaging.id, content: webCopy,
      }));
      await expect(service.dispatchSpecialist(requestContext, campaign.id, messaging.id)).rejects.toThrow("not ready");
    });
    expect(workforce.dispatch).toHaveBeenCalledOnce();
    await companyScope.run({ ownerId, companyId: otherCompanyId, role: "OWNER", requestId: "other" }, async () => {
      await expect(service.refreshSpecialist(ownerId, companyId, campaign.id, messaging.id)).rejects.toThrow("Company workforce scope unavailable");
    });
  });

  it("advances a small campaign one bounded node and refuses emergency-stop progression", async () => {
    const aiRouter = { executeStructured: vi.fn(() => Promise.resolve({ outcome: "SUCCESS", structuredOutput: webCopy })) };
    const { service } = setup({ aiRouter });
    const campaign = await service.create(requestContext, request({ idempotencyKey: "advance-small-key" }));
    const context = { ...engineeringContext, emergencyStopActive: false };
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "advance" }, async () => {
      await expect(service.advance({ ...context, emergencyStopActive: true }, campaign.id)).rejects.toThrow("denied");
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "DRAFT_READY" });
    });
    expect(aiRouter.executeStructured).toHaveBeenCalledOnce();
  });

  it("re-enters a queued specialist task only with its exact active company assignment", async () => {
    const agentId = "native_copywriter";
    const assignmentId = "90000000-0000-4000-8000-000000000009";
    const taskId = "a0000000-0000-4000-8000-00000000000a";
    const organizationId = "b0000000-0000-4000-8000-00000000000b";
    const task = { id: taskId, organizationId, companyAssignmentId: assignmentId,
      assignedAgentId: agentId, status: "QUEUED", inputs: {} as Record<string, unknown> };
    const workforce = { dispatch: vi.fn(() => Promise.resolve({ task })) };
    const assignment = { id: assignmentId, companyId, organizationId, status: "ACTIVE", departmentId: null };
    const agents = { findAssignment: vi.fn(() => Promise.resolve(assignment)) };
    const workforceStore = { findTask: vi.fn(() => Promise.resolve(task)) };
    const { service, store } = setup({ workforce, agents, workforceStore });
    const campaign = await service.create(requestContext, request({ idempotencyKey: "queued-specialist-key" }));
    const messaging = campaign.deliverables.find((item) => item.type === "MESSAGING")!;
    task.inputs = { marketingCampaignId: campaign.id, marketingDeliverableId: messaging.id };
    const running = { ...campaign, version: campaign.version + 1,
      deliverables: campaign.deliverables.map((item) => item.id === messaging.id
        ? { ...item, status: "RUNNING" as const, workforceTaskId: taskId } : item) };
    expect(await store.updateCampaign(running, campaign.version)).toBe(true);
    const context = { ...engineeringContext, emergencyStopActive: false };
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "advance" }, async () => {
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "SPECIALIST_PROGRESS", taskStatus: "QUEUED" });
      expect(workforce.dispatch).toHaveBeenCalledOnce();
      assignment.status = "PAUSED";
      await expect(service.advance(context, campaign.id)).rejects.toThrow("recovery scope is inconsistent");
      expect(workforce.dispatch).toHaveBeenCalledOnce();
    });
  });

  it("coordinates one review-only product launch through creative availability, Engineering, and a governed analytics read", async () => {
    const delivery = { id: crypto.randomUUID(), objectiveId: crypto.randomUUID(), firstPreviewAt: now.toISOString(),
      preview: { state: "RUNNING", healthStatus: "PASS", url: "https://preview.example.test", previewId: "preview-1" } };
    const engineering = { create: vi.fn(() => Promise.resolve({ delivery })) };
    const engineeringStore = { findByIdempotencyKey: vi.fn(() => Promise.resolve(delivery)) };
    const select = vi.fn((_context: unknown, category: string) => Promise.resolve(category === "analytics.query_metric" ? [{
      id: "reviewed-analytics-tool", operationClass: "READ", riskLevel: "read_only", costModel: "FREE",
    }] : []));
    const invoke = vi.fn((_context: unknown, input: { invocationId: string; toolId: string }) => Promise.resolve({ status: "SUCCEEDED", invocationId: input.invocationId, toolId: input.toolId, structuredOutput: {
      status: "VERIFIED", metricId: "active_users", value: 42, unit: "users", observedAt: now.toISOString(),
    } }));
    const { service } = setup({ tools: { select, invoke }, engineering, engineeringStore });
    const campaign = await service.create(requestContext, request({ objectiveType: "PRODUCT_LAUNCH",
      idempotencyKey: "sandbox-product-launch", engineeringRepositoryId: "60000000-0000-4000-8000-000000000006" }));
    const ids = Object.fromEntries(campaign.deliverables.map((item) => [item.type, item.id]));
    const context = { ...engineeringContext, emergencyStopActive: false };
    const toolContext: TrustedToolContext = { ...requestContext, agentId: null, emergencyStopActive: false };
    await service.saveDraft(requestContext, campaign.id, ids.RESEARCH!, { observations: [], summary: "Verified sources unavailable." });
    await service.saveDraft(requestContext, campaign.id, ids.BRAND_STRATEGY!, brandContent);
    await service.saveDraft(requestContext, campaign.id, ids.MESSAGING!, webCopy);
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "sandbox-launch" }, async () => {
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "TOOL_UNAVAILABLE", deliverableId: ids.IMAGE_ASSET });
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "ENGINEERING_STARTED", deliverableId: ids.LANDING_PAGE });
    });
    await expect(service.refreshLandingPage(ownerId, companyId, campaign.id)).resolves.toMatchObject({ firstEngineeringPreviewAt: now.toISOString() });
    await service.saveDraft(requestContext, campaign.id, ids.SOCIAL_POST!, webCopy);
    await service.saveDraft(requestContext, campaign.id, ids.AD_CONCEPT!, { concepts: [{ angle: "Governed assistance", copy: "Reviewable actions",
      audienceHypothesis: "Teams seek control", offer: "Request access", targetMetric: "active users", stopCondition: "No lift" }] });
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "sandbox-launch" }, async () => {
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "ANALYTICS_INPUT_REQUIRED", deliverableId: ids.ANALYTICS_REPORT });
    });
    await service.readAnalyticsMetric(toolContext, campaign.id, { metricId: "active_users",
      windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-09-30T00:00:00.000Z" });
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "sandbox-launch" }, async () => {
      await expect(service.advance(context, campaign.id)).resolves.toMatchObject({ status: "PACKAGE_READY" });
    });
    expect(select).toHaveBeenCalledWith(expect.any(Object), "image.generate", 10);
    expect(select).toHaveBeenCalledWith(expect.any(Object), "analytics.query_metric", 10);
    expect(invoke).toHaveBeenCalledOnce();
    expect(engineering.create).toHaveBeenCalledOnce();
    const view = await service.view(ownerId, companyId, campaign.id);
    expect(view.campaign.status).toBe("PACKAGE_READY");
    expect(view.campaign.deliverables.find((item) => item.type === "IMAGE_ASSET")?.status).toBe("TOOL_UNAVAILABLE");
    expect(view.artifacts.find((item) => item.type === "LAUNCH_PACKAGE")?.content).toMatchObject({
      publicActionsPendingApproval: true, warnings: ["IMAGE_ASSET provider unavailable."],
    });
  });
});
