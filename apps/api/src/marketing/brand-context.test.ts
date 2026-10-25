import { describe, expect, it, vi } from "vitest";

import { companyScope } from "../companies/scope.js";
import { approvedBrandContext } from "./brand-context.js";
import { InMemoryMarketingStore } from "./store.js";
import { MarketingService } from "./service.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const otherCompanyId = "30000000-0000-4000-8000-000000000003";
const context = { ownerId, companyId, requestId: "brand-test", ipAddress: "100.64.0.1" };
const brandContent = {
  positioning: "Controlled assistance", targetAudience: "Teams", brandPromise: "Reviewable work",
  messagingPillars: ["Visible authority"], valuePropositions: ["Clear decisions"], toneOfVoice: "Direct",
  visualDirection: "Calm", campaignThemes: [], contentThemes: [], competitorObservations: [], prohibitedClaims: ["Guaranteed outcomes"],
};

describe("approved brand context", () => {
  it("promotes only exact approved current brand artifacts and retrieves stable facts for future campaigns", async () => {
    return companyScope.run({ ownerId, companyId, role: "OWNER", requestId: context.requestId }, async () => {
      const store = new InMemoryMarketingStore();
      const records: Array<{ tags: string[]; content: string; evidence: Array<{ reference: string }> }> = [];
      const memoryStore = { listMemories: vi.fn(() => Promise.resolve(records as never)) };
      const memory = { recordMemory: vi.fn((input: { body: { tags: string[]; content: string; evidence: Array<{ reference: string }> } }) => {
        records.push(input.body);
        return Promise.resolve({ memory: { id: crypto.randomUUID() } });
      }) };
      const objectives = { create: vi.fn(() => Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } })) };
      const service = new MarketingService(store, objectives as never, () => undefined, undefined,
        () => new Date("2026-10-03T00:00:00.000Z"), undefined, undefined, undefined,
        memory as never, memoryStore);
      const campaign = await service.create(context, { idempotencyKey: crypto.randomUUID(), title: "Brand",
        productOrCompany: "Product", objectiveType: "BRAND_PACKAGE" });
      const research = campaign.deliverables.find((item) => item.type === "RESEARCH")!;
      const brand = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;
      await service.saveDraft(context, campaign.id, research.id, { observations: [], summary: "No source available." });
      const artifact = await service.saveDraft(context, campaign.id, brand.id, brandContent);
      await expect(service.promoteBrand(context, campaign.id, artifact.contentDigest)).rejects.toThrow("Existing governance has not approved");
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore as never)).toEqual([]);
      const inReview = await store.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id, "DRAFT", "IN_REVIEW", crypto.randomUUID());
      expect(inReview?.status).toBe("IN_REVIEW");
      await store.updateArtifactStatus(ownerId, companyId, campaign.id, artifact.id, "IN_REVIEW", "REJECTED", inReview!.approvalRequestId);
      await expect(service.promoteBrand(context, campaign.id, artifact.contentDigest)).rejects.toThrow("Existing governance has not approved");
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore as never)).toEqual([]);
      const revised = await service.saveDraft(context, campaign.id, brand.id, { ...brandContent, positioning: "Reviewed positioning" });
      const revisedReview = await store.updateArtifactStatus(ownerId, companyId, campaign.id, revised.id, "DRAFT", "IN_REVIEW", crypto.randomUUID());
      const approved = await store.updateArtifactStatus(ownerId, companyId, campaign.id, revised.id, "IN_REVIEW", "APPROVED", revisedReview!.approvalRequestId);
      expect(approved?.status).toBe("APPROVED");
      const current = (await store.findCampaign(ownerId, companyId, campaign.id))!;
      await store.updateCampaign({ ...current, version: current.version + 1,
        deliverables: current.deliverables.map((item) => item.id === brand.id ? { ...item, approvalState: "APPROVED" } : item) }, current.version);
      await service.promoteBrand(context, campaign.id, revised.contentDigest);
      const retrieved = await approvedBrandContext(ownerId, companyId, store, memoryStore);
      expect(retrieved).toHaveLength(1);
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore, "Other Product")).toEqual([]);
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore, " product ")).toHaveLength(1);
      expect(JSON.parse(retrieved[0]!)).toMatchObject({ positioning: "Reviewed positioning",
        messagingPillars: brandContent.messagingPillars, prohibitedClaims: brandContent.prohibitedClaims });
      const originalContent = records[0]!.content;
      records[0]!.content = JSON.stringify({ ...JSON.parse(originalContent) as object, positioning: "Altered memory" });
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore)).toEqual([]);
      records[0]!.content = originalContent;
      expect(await approvedBrandContext(ownerId, otherCompanyId, store, memoryStore as never)).toEqual([]);
      await service.saveDraft(context, campaign.id, brand.id, { ...brandContent, positioning: "New draft" });
      expect(await approvedBrandContext(ownerId, companyId, store, memoryStore as never)).toEqual([]);
    });
  });
});
