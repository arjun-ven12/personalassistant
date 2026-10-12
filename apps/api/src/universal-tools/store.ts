import { UniversalToolReviewSchema, type UniversalTool, type UniversalToolProvider, type UniversalToolResult, type UniversalToolReview } from "@alexa-control/shared";

export interface ToolInvocationReceipt {
  invocationId: string;
  ownerId: string;
  companyId: string | null;
  toolId: string;
  requestDigest: string;
  status: "RESERVED" | "COMPLETED" | "INDETERMINATE";
  result: UniversalToolResult | null;
}

/** Production implementations must persist reservations atomically before a provider call. */
export interface UniversalToolStore {
  saveProvider(provider: UniversalToolProvider): Promise<void>;
  findProvider(ownerId: string, providerId: string): Promise<UniversalToolProvider | null>;
  saveTools(ownerId: string, providerId: string, tools: UniversalTool[]): Promise<void>;
  findTool(ownerId: string, toolId: string): Promise<UniversalTool | null>;
  listTools(ownerId: string): Promise<UniversalTool[]>;
  saveReview(review: UniversalToolReview): Promise<void>;
  findReview(ownerId: string, toolId: string): Promise<UniversalToolReview | null>;
  reserve(receipt: ToolInvocationReceipt): Promise<ToolInvocationReceipt>;
  claim(ownerId: string, invocationId: string): Promise<boolean>;
  complete(receipt: ToolInvocationReceipt): Promise<void>;
  findReceipt(ownerId: string, companyId: string, invocationId: string): Promise<ToolInvocationReceipt | null>;
  listReceipts(ownerId: string, companyId: string, limit: number): Promise<ToolInvocationReceipt[]>;
  setOwnerAcceptance(ownerId: string, companyId: string, invocationId: string, acceptance: "ACCEPTED" | "REJECTED"): Promise<boolean>;
}

/** Test-only store. Never use as production fallback. */
export class InMemoryUniversalToolStore implements UniversalToolStore {
  readonly #providers = new Map<string, UniversalToolProvider>();
  readonly #tools = new Map<string, UniversalTool>();
  readonly #receipts = new Map<string, ToolInvocationReceipt>();
  readonly #reviews = new Map<string, UniversalToolReview>();
  readonly #claims = new Set<string>();
  private key(ownerId: string, id: string) { return `${ownerId}:${id}`; }
  saveProvider(provider: UniversalToolProvider) { this.#providers.set(this.key(provider.ownerId, provider.id), structuredClone(provider)); return Promise.resolve(); }
  findProvider(ownerId: string, id: string) { return Promise.resolve(structuredClone(this.#providers.get(this.key(ownerId, id)) ?? null)); }
  saveTools(ownerId: string, providerId: string, tools: UniversalTool[]) {
    for (const tool of tools) if (tool.ownerId !== ownerId || tool.providerId !== providerId) throw new Error("Tool scope mismatch.");
    for (const tool of tools) this.#tools.set(this.key(ownerId, tool.id), structuredClone(tool));
    return Promise.resolve();
  }
  findTool(ownerId: string, id: string) { return Promise.resolve(structuredClone(this.#tools.get(this.key(ownerId, id)) ?? null)); }
  listTools(ownerId: string) { return Promise.resolve([...this.#tools.values()].filter((tool) => tool.ownerId === ownerId).map((tool) => structuredClone(tool))); }
  async saveReview(review: UniversalToolReview) {
    const item = UniversalToolReviewSchema.parse(review);
    const tool = await this.findTool(item.ownerId, item.toolId);
    if (!tool || tool.providerId !== item.providerId || tool.companyId !== item.companyId) throw new Error("Review scope mismatch.");
    const current = this.#reviews.get(this.key(item.ownerId, item.toolId));
    if (current?.status === "REVOKED" && item.status !== "REVOKED") throw new Error("Revoked review cannot be reactivated.");
    this.#reviews.set(this.key(item.ownerId, item.toolId), structuredClone(item));
  }
  findReview(ownerId: string, toolId: string) { return Promise.resolve(structuredClone(this.#reviews.get(this.key(ownerId, toolId)) ?? null)); }
  reserve(receipt: ToolInvocationReceipt) {
    const key = this.key(receipt.ownerId, receipt.invocationId);
    const existing = this.#receipts.get(key);
    if (existing) return Promise.resolve(structuredClone(existing));
    this.#receipts.set(key, structuredClone(receipt));
    return Promise.resolve(structuredClone(receipt));
  }
  claim(ownerId: string, invocationId: string) {
    const key = this.key(ownerId, invocationId);
    if (!this.#receipts.has(key) || this.#claims.has(key)) return Promise.resolve(false);
    this.#claims.add(key);
    return Promise.resolve(true);
  }
  complete(receipt: ToolInvocationReceipt) {
    const key = this.key(receipt.ownerId, receipt.invocationId);
    const existing = this.#receipts.get(key);
    if (!existing || existing.requestDigest !== receipt.requestDigest || !this.#claims.has(key) || existing.status === "COMPLETED") throw new Error("Receipt mismatch.");
    this.#receipts.set(key, structuredClone(receipt));
    return Promise.resolve();
  }
  findReceipt(ownerId: string, companyId: string, invocationId: string) {
    const item = this.#receipts.get(this.key(ownerId, invocationId));
    return Promise.resolve(structuredClone(item?.companyId === companyId ? item : null));
  }
  listReceipts(ownerId: string, companyId: string, limit: number) {
    return Promise.resolve([...this.#receipts.values()].filter((item) => item.ownerId === ownerId && item.companyId === companyId)
      .slice(-Math.min(Math.max(limit, 0), 500)).map((item) => structuredClone(item)));
  }
  setOwnerAcceptance(ownerId: string, companyId: string, invocationId: string, acceptance: "ACCEPTED" | "REJECTED") {
    const key = this.key(ownerId, invocationId);
    const item = this.#receipts.get(key);
    if (!item || item.companyId !== companyId || item.status !== "COMPLETED" || item.result?.status !== "SUCCEEDED" || item.result.ownerAcceptance) return Promise.resolve(false);
    this.#receipts.set(key, { ...item, result: { ...item.result, ownerAcceptance: acceptance } });
    return Promise.resolve(true);
  }
}
