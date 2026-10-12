import { MarketingArtifactSchema, MarketingCampaignSchema } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "../persistence/test-database.js";
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
