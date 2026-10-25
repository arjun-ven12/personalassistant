import { MarketingArtifactSchema, MarketingCampaignSchema } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, provisionTestDefaultCompany, safeTestDatabaseUrl } from "../persistence/test-database.js";
import { ObjectiveEngineService } from "../objectives/service.js";
import { PostgresExecutiveStore } from "../executive/postgres-store.js";
import { companyScope } from "../companies/scope.js";
import { PostgresMarketingStore } from "./postgres-store.js";
import { decomposeMarketingObjective, MarketingService } from "./service.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("marketing PostgreSQL scope and restart", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresMarketingStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const otherCompanyId = crypto.randomUUID();
  const at = "2026-09-30T00:00:00.000Z";

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(connectionString!, "marketing282");
    database = isolated.database;
    cleanup = isolated.cleanup;
    store = new PostgresMarketingStore(database.pool);
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("serializes cross-instance creation and rolls back the objective when campaign audit fails", async () => {
    await database.pool.query("CREATE TABLE marketing_test_objectives (id uuid PRIMARY KEY, company_id uuid NOT NULL)");
    const objectives = { create: async (input: { body: { organizationId: string } }) => {
      const id = crypto.randomUUID();
      await database.pool.query("INSERT INTO marketing_test_objectives(id,company_id) VALUES($1,$2)", [id, input.body.organizationId]);
      return { objective: { id, organizationId: input.body.organizationId } };
    } };
    const context = { ownerId, companyId, requestId: "atomic-marketing", ipAddress: "internal" };
    const request = { idempotencyKey: "atomic-marketing-key", title: "Brand", productOrCompany: "Assistant", objectiveType: "BRAND_PACKAGE" };
    const first = new MarketingService(store, objectives as never, () => undefined);
    const second = new MarketingService(new PostgresMarketingStore(database.pool), objectives as never, () => undefined);
    first.setTransaction(database.transaction);
    second.setTransaction(database.transaction);
    const [left, right] = await Promise.all([first.create(context, request), second.create(context, request)]);
    expect(left.id).toBe(right.id);
    expect(left.objectiveId).toBe(right.objectiveId);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM marketing_test_objectives")).rows[0]).toEqual({ count: 1 });
    const failing = new MarketingService(store, objectives as never, () => { throw new Error("Audit unavailable"); });
    failing.setTransaction(database.transaction);
    await expect(failing.create(context, { ...request, idempotencyKey: "atomic-rollback-key" })).rejects.toThrow("Audit unavailable");
    expect(await store.findByKey(ownerId, companyId, "atomic-rollback-key")).toBeNull();
    expect((await database.pool.query("SELECT count(*)::int AS count FROM marketing_test_objectives")).rows[0]).toEqual({ count: 1 });
  });

  it("rolls back artifact and campaign updates when the draft audit fails", async () => {
    const context = { ownerId, companyId, requestId: "draft-atomic", ipAddress: "internal" };
    const objectives = { create: () => Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } }) };
    const service = new MarketingService(store, objectives as never, () => undefined);
    service.setTransaction(database.transaction);
    const campaign = await service.create(context, { idempotencyKey: "atomic-draft-key", title: "Campaign", productOrCompany: "Product", objectiveType: "SOCIAL_CAMPAIGN" });
    const deliverable = campaign.deliverables.find(item => item.type === "MESSAGING")!;
    const failing = new MarketingService(store, objectives as never, () => { throw Error("Audit unavailable"); });
    failing.setTransaction(database.transaction);
    await expect(failing.saveDraft(context, campaign.id, deliverable.id, { title: "Draft", variants: [{ channel: "WEB", headline: "Hello", body: "Reviewable draft", cta: null }] })).rejects.toThrow("Audit unavailable");
    expect(await store.listArtifacts(ownerId, companyId, campaign.id)).toEqual([]);
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.version).toBe(campaign.version);
  });

  it("creates one inert initiative objective only from an approved strategy, with durable retry identity", async () => {
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "initiative-test" }, async () => {
      let creates = 0;
      const objectives = { create: () => { creates++; return Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } }); } };
      const service = new MarketingService(store, objectives as never, () => undefined);
      service.setTransaction(database.transaction);
      const context = { ownerId, companyId, requestId: "initiative-test", ipAddress: "internal" };
      const campaign = await service.create(context, { idempotencyKey: "initiative-draft-test", title: "Improve", productOrCompany: "Product", objectiveType: "BUSINESS_IMPROVEMENT" });
      const research = campaign.deliverables.find(item => item.type === "RESEARCH")!;
      const source = await service.saveDraft(context, campaign.id, research.id, { observations: [], summary: "Insufficient market evidence; review needed." });
      const strategy = campaign.deliverables.find(item => item.type === "GROWTH_STRATEGY")!;
      const artifact = await service.saveDraft(context, campaign.id, strategy.id, { diagnosis: ["Evidence gap"], uncertainties: ["Market unknown"], initiatives: [{ title: "Research market", outcome: "Collect reviewed sources", rationale: "Fill evidence gap", priority: "NORMAL", expectedImpactHypothesis: "Reduce uncertainty; no growth promise", estimatedCostUsd: null, confidence: 0.3, evidenceRefs: [`marketing-artifact:${source.id}`], requiresOwnerApproval: true }], executionEnabled: false });
      await expect(service.draftInitiative(context, campaign.id, artifact.id, 0)).rejects.toThrow("APPROVED_STRATEGY_REQUIRED");
      const approvalId = crypto.randomUUID();
      await store.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id, "DRAFT", "IN_REVIEW", approvalId);
      await store.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id, "IN_REVIEW", "APPROVED", approvalId);
      const current = (await store.findCampaign(ownerId, companyId, campaign.id))!;
      await store.updateCampaign({ ...current, version: current.version + 1, deliverables: current.deliverables.map(item => item.id === strategy.id ? { ...item, approvalState: "APPROVED" } : item) }, current.version);
      const results = await Promise.all([service.draftInitiative(context, campaign.id, artifact.id, 0), service.draftInitiative(context, campaign.id, artifact.id, 0)]);
      expect(results[0]).toEqual(results[1]);
      expect(creates).toBe(2);
      expect((await store.findCampaign(ownerId, companyId, campaign.id))?.initiativeObjectives).toEqual([results[0]]);
    });
  });

  it("reconstructs one canonical campaign objective and its actual department plan without generic dispatch", async () => {
    const scopedOwner = crypto.randomUUID();
    await database.pool.query("INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,NOW(),NOW())", [scopedOwner, `${scopedOwner}@example.test`, { id: scopedOwner }]);
    const scopedCompany = await provisionTestDefaultCompany(database.pool, scopedOwner);
    await companyScope.run({ ownerId: scopedOwner, companyId: scopedCompany, role: "OWNER", requestId: "canonical-campaign" }, async () => {
      const runtime = { dashboard: vi.fn(() => Promise.resolve({ tasks: [] })), createTask: vi.fn(), dispatch: vi.fn() };
      const executiveStore = new PostgresExecutiveStore(database.pool);
      const engine = new ObjectiveEngineService(executiveStore, runtime as never, () => undefined);
      engine.setTransaction(database.transaction);
      engine.setMarketingCampaignReader((owner, company, campaign) => store.findCampaign(owner, company, campaign));
      const service = new MarketingService(store, engine, () => undefined);
      service.setTransaction(database.transaction);
      const context = { ownerId: scopedOwner, companyId: scopedCompany, requestId: "canonical-campaign", ipAddress: "internal" };
      const campaign = await service.create(context, { idempotencyKey: "canonical-campaign-test", title: "Research market", productOrCompany: "Product", objectiveType: "MARKET_RESEARCH" });
      await service.pause(context, campaign.id);
      const restarted = new ObjectiveEngineService(new PostgresExecutiveStore(database.pool), runtime as never, () => undefined);
      restarted.setMarketingCampaignReader((owner, company, id) => new PostgresMarketingStore(database.pool).findCampaign(owner, company, id));
      const dashboard = await restarted.dashboard(scopedOwner);
      expect(dashboard.objectives.find(item => item.id === campaign.objectiveId)).toMatchObject({ status: "PAUSED", executionSource: { campaignId: campaign.id } });
      expect(dashboard.projects.filter(item => item.objectiveExecutionId === campaign.objectiveId && item.status !== "CANCELLED").map(item => item.id).sort()).toEqual(campaign.deliverables.map(item => item.id).sort());
      await expect(restarted.activate({ ...context, objectiveId: campaign.objectiveId, idempotencyKey: "no-second-dispatch" })).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_REQUIRED" });
      expect(runtime.createTask).not.toHaveBeenCalled();
      const eventCount = (await executiveStore.listObjectiveEvents(scopedOwner)).length;
      await restarted.dashboard(scopedOwner);
      expect((await executiveStore.listObjectiveEvents(scopedOwner)).length).toBe(eventCount);
    });
  });

  it("persists a scoped campaign and versioned artifact across store reconstruction", async () => {
    const campaign = MarketingCampaignSchema.parse({
      id: crypto.randomUUID(), ownerId, companyId, objectiveId: crypto.randomUUID(),
      idempotencyKey: "postgres-marketing-campaign", title: "Review launch", productOrCompany: "Assistant",
      objectiveType: "SOCIAL_CAMPAIGN", targetAudience: null, channels: [], constraints: [],
      status: "DRAFT", complexity: "SMALL", version: 1,
      deliverables: decomposeMarketingObjective("SOCIAL_CAMPAIGN", at), brandStrategyArtifactRef: null,
      engineeringRepositoryId: null, modelBudgetCredits: 100, toolBudgetMinor: 0, adBudgetMinor: 0,
      knownToolCostMinor: 0, unknownToolCostCount: 0,
      firstDraftAt: null, firstAssetAt: null, firstEngineeringPreviewAt: null, packageReadyAt: null,
      createdAt: at, updatedAt: at,
    });
    expect(await store.createCampaign(campaign)).toEqual(campaign);
    const conflicting = { ...campaign, id: crypto.randomUUID(), title: "Changed title" };
    expect(await store.createCampaign(conflicting)).toEqual(campaign);
    const updated = MarketingCampaignSchema.parse({ ...campaign, version: 2, status: "ACTIVE" });
    expect(await store.updateCampaign(updated, 1)).toBe(true);
    expect(await store.updateCampaign({ ...updated, version: 3 }, 1)).toBe(false);

    const deliverable = campaign.deliverables[0]!;
    const artifact = MarketingArtifactSchema.parse({
      id: crypto.randomUUID(), ownerId, companyId, campaignId: campaign.id, deliverableId: deliverable.id,
      type: deliverable.type, version: 1, status: "DRAFT", contentDigest: "a".repeat(64),
      content: { summary: "Bounded draft" }, externalRef: null, createdAt: at,
    });
    expect(await store.createArtifact(artifact)).toEqual(artifact);
    expect(await store.createArtifact({ ...artifact, id: crypto.randomUUID() })).toEqual(artifact);
    await expect(store.createArtifact({ ...artifact, id: crypto.randomUUID(), contentDigest: "b".repeat(64) }))
      .rejects.toThrow("Artifact version conflict");
    await expect(store.createArtifact({ ...artifact, id: crypto.randomUUID(), deliverableId: crypto.randomUUID() }))
      .rejects.toThrow();

    const restored = new PostgresMarketingStore(database.pool);
    expect(await restored.findByKey(ownerId, companyId, campaign.idempotencyKey)).toEqual(updated);
    expect(await restored.findCampaign(ownerId, companyId, campaign.id)).toEqual(updated);
    expect(await restored.listArtifacts(ownerId, companyId, campaign.id)).toEqual([artifact]);
    expect(await restored.findCampaign(ownerId, otherCompanyId, campaign.id)).toBeNull();
    expect(await restored.listCampaigns(ownerId, otherCompanyId, 10)).toEqual([]);
    expect(await restored.listArtifacts(ownerId, otherCompanyId, campaign.id)).toEqual([]);
    const approvalRequestId = crypto.randomUUID();
    expect(await restored.updateArtifactStatus(ownerId, otherCompanyId, campaign.id, artifact.id,
      "DRAFT", "IN_REVIEW", approvalRequestId)).toBeNull();
    expect(await restored.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id,
      "DRAFT", "IN_REVIEW", approvalRequestId)).toMatchObject({ status: "IN_REVIEW", approvalRequestId });
    expect(await restored.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id,
      "DRAFT", "IN_REVIEW", approvalRequestId)).toBeNull();
    expect(await restored.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id,
      "IN_REVIEW", "APPROVED", approvalRequestId)).toMatchObject({ status: "APPROVED" });
    expect(await restored.listActiveCampaigns(50)).toEqual([]);
    const automated = MarketingCampaignSchema.parse({ ...updated, version: 3, status: "ACTIVE",
      automationContext: { sessionId: crypto.randomUUID(), startedAt: at } });
    expect(await restored.updateCampaign(automated, 2)).toBe(true);
    expect((await restored.listActiveCampaigns(50)).map((item) => item.id)).toEqual([campaign.id]);
  });
});
