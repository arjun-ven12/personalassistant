import type { MarketingCampaign, WorkforceRuntimeTask } from "@alexa-control/shared";

import type { MarketingService } from "./service.js";
import type { MarketingStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

export type MarketingAdvanceContext = Parameters<MarketingService["advance"]>[0];

type Scope = { ownerId: string; companyId: string; campaignId: string };
type AdvanceResult = Awaited<ReturnType<MarketingService["advance"]>>;

export type MarketingCoordinatorOutcome =
  | { status: "CONTEXT_UNAVAILABLE" | "CANCELLED" | "APPROVAL_REQUIRED" | "BLOCKED" | "IN_PROGRESS" | "STEP_LIMIT"; campaignId: string; steps: number }
  | { status: "PACKAGE_READY"; campaignId: string; steps: number };

export interface MarketingCampaignCoordinatorDependencies {
  service: Pick<MarketingService, "advance" | "refreshSpecialist" | "refreshLandingPage"> & Partial<Pick<MarketingService, "blockCampaign">>;
  store: Pick<MarketingStore, "findCampaign" | "updateCampaign">;
  /** Produces verified server-owned authority; callers cannot provide it. */
  trustedContext: (scope: Scope) => Promise<MarketingAdvanceContext | null>;
  /** Creates existing governed review work; it never grants approval itself. */
  onApprovalRequired?: (context: MarketingAdvanceContext, campaign: MarketingCampaign) => Promise<void>;
  queueMicrotask?: (callback: () => void) => void;
}

const keyFor = ({ ownerId, companyId, campaignId }: Scope) =>
  `${ownerId}:${companyId}:${campaignId}`;

const needsApproval = (campaign: MarketingCampaign) =>
  campaign.deliverables.some((item) => item.approvalState === "REQUIRED");

const terminal = (result: AdvanceResult) =>
  ["PACKAGE_READY", "BLOCKED", "IN_PROGRESS", "DRAFT_REQUIRED", "ANALYTICS_INPUT_REQUIRED", "CREATIVE_REVIEW_REQUIRED"].includes(result.status);

const meaningful = (result: AdvanceResult) => {
  if (["DRAFT_READY", "TOOL_UNAVAILABLE"].includes(result.status)) return true;
  if (result.status === "SPECIALIST_PROGRESS")
    return result.deliverableStatus === "READY" || result.deliverableStatus === "DRAFT_READY";
  if (result.status === "ENGINEERING_PROGRESS") return result.deliverableStatus === "DRAFT_READY";
  return false;
};

/**
 * Bounded event-driven campaign progression. This is deliberately not a
 * scheduler: durable scheduling and trusted-context construction stay with the
 * existing application runtime.
 */
export class MarketingCampaignCoordinator {
  readonly #running = new Map<string, Promise<MarketingCoordinatorOutcome>>();
  readonly #pending = new Set<string>();
  readonly #queued = new Set<string>();
  readonly #scopes = new Map<string, Scope>();
  readonly #queueMicrotask: (callback: () => void) => void;

  constructor(readonly dependencies: MarketingCampaignCoordinatorDependencies) {
    this.#queueMicrotask = dependencies.queueMicrotask ?? queueMicrotask;
  }

  /** HTTP requests persist context first, then request the existing event loop. */
  requestProgress(scope: Scope): void {
    this.#scopes.set(keyFor(scope), scope);
    if (this.#running.has(keyFor(scope))) this.#pending.add(keyFor(scope));
    else this.#enqueue(scope);
  }

  run(scope: Scope): Promise<MarketingCoordinatorOutcome> {
    const key = keyFor(scope);
    const current = this.#running.get(key);
    if (current) {
      this.#pending.add(key);
      return current;
    }
    this.#scopes.set(key, scope);
    const running = this.#run(scope).finally(() => {
      this.#running.delete(key);
      if (this.#pending.delete(key)) this.#enqueue(scope);
    });
    this.#running.set(key, running);
    return running;
  }

  /** Workforce callbacks must never await a campaign pass that dispatched them. */
  handleWorkforceTaskChanged(task: WorkforceRuntimeTask): Promise<void> {
    const campaignId = typeof task.inputs.marketingCampaignId === "string"
      ? task.inputs.marketingCampaignId : null;
    const companyId = typeof task.inputs.marketingCompanyId === "string"
      ? task.inputs.marketingCompanyId : null;
    if (!campaignId || !companyId || !task.ownerId || !isUuid(campaignId) || !isUuid(companyId)) return Promise.resolve();
    const scope = { ownerId: task.ownerId, companyId, campaignId };
    const key = keyFor(scope);
    this.#scopes.set(key, scope);
    if (this.#running.has(key)) {
      this.#pending.add(key);
      return Promise.resolve();
    }
    this.#enqueue(scope);
    return Promise.resolve();
  }

  handleEngineeringDeliveryChanged(scope: Scope): void {
    this.#scopes.set(keyFor(scope), scope);
    if (this.#running.has(keyFor(scope))) this.#pending.add(keyFor(scope));
    else this.#enqueue(scope);
  }

  #enqueue(scope: Scope) {
    const key = keyFor(scope);
    if (this.#queued.has(key)) return;
    this.#queued.add(key);
    this.#queueMicrotask(() => {
      this.#queued.delete(key);
      const latest = this.#scopes.get(key);
      if (latest) void this.run(latest).catch(() => undefined);
    });
  }

  async #run(scope: Scope): Promise<MarketingCoordinatorOutcome> {
    let context: MarketingAdvanceContext | null;
    try {
      context = await this.dependencies.trustedContext(scope);
    } catch {
      return { status: "CONTEXT_UNAVAILABLE", campaignId: scope.campaignId, steps: 0 };
    }
    if (!context || context.ownerId !== scope.ownerId || context.companyId !== scope.companyId)
      return { status: "CONTEXT_UNAVAILABLE", campaignId: scope.campaignId, steps: 0 };

    return companyScope.run({
      ownerId: context.ownerId,
      companyId: context.companyId,
      role: "OWNER",
      requestId: context.requestId,
    }, () => this.#runScoped(scope, context));
  }

  async #runScoped(scope: Scope, context: MarketingAdvanceContext): Promise<MarketingCoordinatorOutcome> {
    for (let steps = 0; steps < 40; steps += 1) {
      const fresh = await this.dependencies.trustedContext(scope).catch(() => null);
      if (!fresh || fresh.ownerId !== scope.ownerId || fresh.companyId !== scope.companyId || fresh.emergencyStopActive)
        return { status: "CONTEXT_UNAVAILABLE", campaignId: scope.campaignId, steps };
      context = fresh;
      const campaign = await this.dependencies.store.findCampaign(scope.ownerId, scope.companyId, scope.campaignId);
      if (!campaign || campaign.status === "CANCELLED")
        return { status: "CANCELLED", campaignId: scope.campaignId, steps };
      if (campaign.status === "PACKAGE_READY")
        return { status: "PACKAGE_READY", campaignId: scope.campaignId, steps };
      if (campaign.status === "PAUSED") return { status: "IN_PROGRESS", campaignId: scope.campaignId, steps };
      if (campaign.status === "BLOCKED")
        return { status: "BLOCKED", campaignId: scope.campaignId, steps };
      if (needsApproval(campaign)) {
        try {
          await this.dependencies.onApprovalRequired?.(context, campaign);
        } catch {
          await this.#blockIfCurrent(scope, context);
          return { status: "BLOCKED", campaignId: scope.campaignId, steps };
        }
        return { status: "APPROVAL_REQUIRED", campaignId: scope.campaignId, steps };
      }

      if (campaign.status === "DRAFT") {
        const active = { ...campaign, status: "ACTIVE" as const, version: campaign.version + 1, updatedAt: new Date().toISOString() };
        if (!await this.dependencies.store.updateCampaign(active, campaign.version)) continue;
      }

      let result: AdvanceResult;
      try {
        result = await this.dependencies.service.advance(context, scope.campaignId);
      } catch (error) {
        await this.#blockIfCurrent(scope, context, error instanceof Error ? error.message : undefined);
        return { status: "BLOCKED", campaignId: scope.campaignId, steps: steps + 1 };
      }
      if (result.status === "PACKAGE_READY")
        return { status: "PACKAGE_READY", campaignId: scope.campaignId, steps: steps + 1 };
      if (result.status === "BLOCKED") await this.#blockIfCurrent(scope, context);
      if (terminal(result) || !meaningful(result))
        return { status: result.status === "BLOCKED" ? "BLOCKED" : "IN_PROGRESS", campaignId: scope.campaignId, steps: steps + 1 };
    }
    return { status: "STEP_LIMIT", campaignId: scope.campaignId, steps: 40 };
  }

  async #blockIfCurrent(scope: Scope, context: MarketingAdvanceContext, code?: string) {
    if (this.dependencies.service.blockCampaign) return this.dependencies.service.blockCampaign(context, scope.campaignId, code);
    const campaign = await this.dependencies.store.findCampaign(scope.ownerId, scope.companyId, scope.campaignId);
    if (!campaign || ["CANCELLED", "PACKAGE_READY", "BLOCKED", "PAUSED"].includes(campaign.status)) return;
    await this.dependencies.store.updateCampaign({
      ...campaign,
      status: "BLOCKED",
      version: campaign.version + 1,
      updatedAt: new Date().toISOString(),
    }, campaign.version);
  }
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
