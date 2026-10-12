import {
  MarketingArtifactSchema,
  MarketingCampaignSchema,
  type MarketingArtifact,
  type MarketingCampaign,
} from "@alexa-control/shared";

export interface MarketingStore {
  createCampaign(value: MarketingCampaign): Promise<MarketingCampaign>;
  findCampaign(ownerId: string, companyId: string, campaignId: string): Promise<MarketingCampaign | null>;
  findByKey(ownerId: string, companyId: string, key: string): Promise<MarketingCampaign | null>;
  listCampaigns(ownerId: string, companyId: string, limit: number): Promise<MarketingCampaign[]>;
  listActiveCampaigns(limit: number): Promise<MarketingCampaign[]>;
  updateCampaign(value: MarketingCampaign, expectedVersion: number): Promise<boolean>;
  createArtifact(value: MarketingArtifact): Promise<MarketingArtifact>;
  updateArtifactStatus(ownerId: string, companyId: string, campaignId: string, artifactId: string,
    expectedStatus: MarketingArtifact["status"], status: MarketingArtifact["status"], approvalRequestId: string | null): Promise<MarketingArtifact | null>;
  listArtifacts(ownerId: string, companyId: string, campaignId: string): Promise<MarketingArtifact[]>;
}

export const validMarketingArtifactTransition = (from: MarketingArtifact["status"], to: MarketingArtifact["status"]) =>
  (from === "DRAFT" && to === "IN_REVIEW") ||
  (from === "IN_REVIEW" && (to === "APPROVED" || to === "REJECTED")) ||
  (["APPROVED", "IN_REVIEW", "REJECTED"].includes(from) && to === "SUPERSEDED");

/** Test-only store. Production wiring must use PostgreSQL. */
export class InMemoryMarketingStore implements MarketingStore {
  readonly #campaigns = new Map<string, MarketingCampaign>();
  readonly #artifacts = new Map<string, MarketingArtifact>();
  private key(ownerId: string, companyId: string, id: string) { return `${ownerId}:${companyId}:${id}`; }
  async createCampaign(value: MarketingCampaign) {
    const item = MarketingCampaignSchema.parse(value);
    const existing = await this.findByKey(item.ownerId, item.companyId, item.idempotencyKey);
    if (existing) return existing;
    this.#campaigns.set(this.key(item.ownerId, item.companyId, item.id), structuredClone(item));
    return structuredClone(item);
  }
  findCampaign(ownerId: string, companyId: string, campaignId: string) {
    return Promise.resolve(structuredClone(this.#campaigns.get(this.key(ownerId, companyId, campaignId)) ?? null));
  }
  findByKey(ownerId: string, companyId: string, idempotencyKey: string) {
    return Promise.resolve(structuredClone([...this.#campaigns.values()].find((item) => item.ownerId === ownerId && item.companyId === companyId && item.idempotencyKey === idempotencyKey) ?? null));
  }
  listCampaigns(ownerId: string, companyId: string, limit: number) {
    return Promise.resolve([...this.#campaigns.values()].filter((item) => item.ownerId === ownerId && item.companyId === companyId).slice(-Math.min(limit, 100)).map((item) => structuredClone(item)));
  }
  listActiveCampaigns(limit: number) {
    return Promise.resolve([...this.#campaigns.values()].filter((item) => item.status === "ACTIVE" && item.automationContext !== null)
      .slice(0, Math.min(Math.max(limit, 0), 50)).map((item) => structuredClone(item)));
  }
  async updateCampaign(value: MarketingCampaign, expectedVersion: number) {
    const item = MarketingCampaignSchema.parse(value);
    const current = await this.findCampaign(item.ownerId, item.companyId, item.id);
    if (!current || current.version !== expectedVersion || item.version !== expectedVersion + 1) return false;
    this.#campaigns.set(this.key(item.ownerId, item.companyId, item.id), structuredClone(item));
    return true;
  }
  async createArtifact(value: MarketingArtifact) {
    const item = MarketingArtifactSchema.parse(value);
    const existing = [...this.#artifacts.values()].find((candidate) => candidate.ownerId === item.ownerId && candidate.companyId === item.companyId && candidate.deliverableId === item.deliverableId && candidate.version === item.version);
    if (existing) {
      if (existing.contentDigest !== item.contentDigest) throw new Error("Artifact version conflict.");
      return structuredClone(existing);
    }
    const campaign = await this.findCampaign(item.ownerId, item.companyId, item.campaignId);
    if (!campaign || !campaign.deliverables.some((entry) => entry.id === item.deliverableId && entry.type === item.type)) throw new Error("Artifact campaign scope mismatch.");
    this.#artifacts.set(this.key(item.ownerId, item.companyId, item.id), structuredClone(item));
    return structuredClone(item);
  }
  updateArtifactStatus(ownerId: string, companyId: string, campaignId: string, artifactId: string,
    expectedStatus: MarketingArtifact["status"], status: MarketingArtifact["status"], approvalRequestId: string | null) {
    if (!validMarketingArtifactTransition(expectedStatus, status)) throw new Error("Invalid artifact review transition.");
    const key = this.key(ownerId, companyId, artifactId);
    const current = this.#artifacts.get(key);
    if (!current || current.campaignId !== campaignId || current.status !== expectedStatus) return Promise.resolve(null);
    if (expectedStatus !== "DRAFT" && current.approvalRequestId !== approvalRequestId) return Promise.resolve(null);
    const updated = MarketingArtifactSchema.parse({ ...current, status, approvalRequestId });
    this.#artifacts.set(key, structuredClone(updated));
    return Promise.resolve(structuredClone(updated));
  }
  listArtifacts(ownerId: string, companyId: string, campaignId: string) {
    return Promise.resolve([...this.#artifacts.values()].filter((item) => item.ownerId === ownerId && item.companyId === companyId && item.campaignId === campaignId).map((item) => structuredClone(item)));
  }
}
