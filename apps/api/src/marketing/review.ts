import { MarketingArtifactSchema, MarketingCampaignSchema, ProposedActionSchema, type MarketingArtifact, type MarketingCampaign } from "@alexa-control/shared";

import { companyScope } from "../companies/scope.js";
import type { ApprovalService, GovernanceAuditWriter } from "../governance/approval-service.js";
import { digestProposedAction } from "../governance/digest.js";
import type { PolicyEngine } from "../governance/policy-engine.js";
import type { RegistryService } from "../governance/registry-service.js";
import type { TrustedPolicyInput } from "../governance/types.js";
import { artifactDigest } from "./service.js";
import type { UnitOfWork } from "../persistence/unit-of-work.js";
import type { MarketingStore } from "./store.js";

export type MarketingReviewContext = Pick<TrustedPolicyInput,
  "ownerId" | "sessionId" | "deviceId" | "deviceTrusted" | "signedEnvelopeVerified" |
  "networkVerification" | "ipAddress" | "requestId" | "emergencyStopActive"> & { companyId: string };

const hasSensitiveClaim = (artifact: MarketingArtifact) => {
  const content = artifact.type === "BRAND_STRATEGY" && typeof artifact.content === "object" && artifact.content !== null && !Array.isArray(artifact.content)
    ? Object.fromEntries(Object.entries(artifact.content).filter(([key]) => key !== "prohibitedClaims"))
    : artifact.content;
  const sensitive = /\b(financial|medical|legal|guaranteed|guarantee|regulated|investment|cure|diagnos|profit|return on investment)\b/i;
  const strings = (value: unknown): string[] => typeof value === "string" ? [value]
    : Array.isArray(value) ? value.flatMap(strings)
    : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  return strings(content).some(value => value.split(/(?<=[.!?])\s+/).some(sentence => {
    if (!sensitive.test(sentence)) return false;
    // Finite complete advisory phrases only, never a generic negation heuristic.
    // Any appended claim, condition, quote or unrecognized wording still denies.
    const prohibition = /^(?:Avoid imagery that implies (?:surveillance, )?(?:magical autonomy, )?(?:or )?guaranteed privacy|(?:Do not|Never) (?:claim|promise|imply) (?:guaranteed privacy|guaranteed security|guaranteed investment returns))[.!]?$/i;
    return !prohibition.test(sentence.trim());
  }));
};

/** Exact artifact approval uses the existing policy and approval records. */
export class MarketingArtifactReviewService {
  #transaction?: UnitOfWork;
  setTransaction(transaction: UnitOfWork) { this.#transaction = transaction; }
  constructor(
    readonly store: MarketingStore,
    readonly registry: Pick<RegistryService, "getTool">,
    readonly policy: Pick<PolicyEngine, "evaluate">,
    readonly approvals: Pick<ApprovalService, "get">,
    readonly audit: GovernanceAuditWriter,
  ) {}

  private async current(context: MarketingReviewContext, campaignId: string, artifactId: string) {
    if (companyScope.companyId(context.ownerId) !== context.companyId)
      throw new Error("Company artifact review scope is unavailable.");
    const campaign = await this.store.findCampaign(context.ownerId, context.companyId, campaignId);
    const artifact = (await this.store.listArtifacts(context.ownerId, context.companyId, campaignId))
      .find((item) => item.id === artifactId);
    const deliverable = campaign?.deliverables.find((item) => item.id === artifact?.deliverableId);
    if (!campaign || campaign.status === "CANCELLED" || !artifact || !deliverable ||
        deliverable.artifactRef !== `marketing-artifact:${artifact.id}` ||
        deliverable.version !== artifact.version || deliverable.contentDigest !== artifact.contentDigest || artifactDigest(artifact) !== artifact.contentDigest)
      throw new Error("Current artifact version was not found in company campaign scope.");
    return { campaign, artifact };
  }

  private action(campaign: MarketingCampaign, artifact: MarketingArtifact) {
    return ProposedActionSchema.parse({ actionId: artifact.id, toolName: "marketing.review_artifact", arguments: {
      companyId: campaign.companyId, campaignId: campaign.id, objectiveId: campaign.objectiveId,
      deliverableId: artifact.deliverableId, artifactId: artifact.id,
      version: artifact.version, contentDigest: artifact.contentDigest,
    } });
  }

  private async evaluate(context: MarketingReviewContext, campaign: MarketingCampaign, artifact: MarketingArtifact) {
    const tool = await this.registry.getTool("marketing.review_artifact");
    if (tool.name !== "marketing.review_artifact" || !tool.enabled || tool.riskLevel !== "medium" ||
        tool.approvalRequirement !== "explicit" || tool.targetType !== "none")
      throw new Error("Registered artifact review policy is unavailable or inconsistent.");
    return this.policy.evaluate({ ...context, reviewedArtifactSession: true,
      recentAuthentication: false, action: this.action(campaign, artifact), tool });
  }

  async request(context: MarketingReviewContext, campaignId: string, artifactId: string) {
    const work = () => this.requestAtomic(context, campaignId, artifactId);
    return this.#transaction ? this.#transaction(`portfolio:${context.ownerId}`, work) : work();
  }

  private async requestAtomic(context: MarketingReviewContext, campaignId: string, artifactId: string) {
    const { campaign, artifact } = await this.current(context, campaignId, artifactId);
    if (!["DRAFT", "IN_REVIEW"].includes(artifact.status)) throw new Error("Artifact cannot enter review from its current status.");
    if (hasSensitiveClaim(artifact))
      throw new Error("Sensitive claims require a separately registered high-risk recent-authentication review path.");
    const decision = await this.evaluate(context, campaign, artifact);
    if (decision.decision !== "require_approval" || !decision.approvalRequestId)
      throw new Error("Exact artifact approval was not requested by policy.");
    if (artifact.status === "IN_REVIEW") {
      if (artifact.approvalRequestId !== decision.approvalRequestId) throw new Error("Artifact review binding changed.");
      return { artifact, approvalRequestId: decision.approvalRequestId };
    }
    const updated = await this.store.updateArtifactStatus(context.ownerId, context.companyId, campaignId, artifactId,
      "DRAFT", "IN_REVIEW", decision.approvalRequestId);
    if (!updated) throw new Error("Artifact changed before review request; retry safely.");
    await this.audit({ eventType: "OBJECTIVE_STATE_CHANGED", ownerId: context.ownerId, companyId: context.companyId,
      outcome: "SUCCESS", reason: "Exact campaign artifact version entered governed review.",
      requestId: context.requestId, ipAddress: context.ipAddress,
      metadata: { campaignId, artifactId, version: artifact.version, contentDigest: artifact.contentDigest,
        approvalRequestId: decision.approvalRequestId } });
    return { artifact: updated, approvalRequestId: decision.approvalRequestId };
  }

  async finalize(context: MarketingReviewContext, campaignId: string, artifactId: string) {
    const work = () => this.finalizeAtomic(context, campaignId, artifactId);
    return this.#transaction ? this.#transaction(`portfolio:${context.ownerId}`, work) : work();
  }

  private async finalizeAtomic(context: MarketingReviewContext, campaignId: string, artifactId: string) {
    const { campaign, artifact } = await this.current(context, campaignId, artifactId);
    if (hasSensitiveClaim(artifact))
      throw new Error("Sensitive claims require a separately registered high-risk recent-authentication review path.");
    if (!artifact.approvalRequestId || !["IN_REVIEW", "APPROVED", "REJECTED"].includes(artifact.status))
      throw new Error("Artifact has no pending exact review binding.");
    const approval = await this.approvals.get(context.ownerId, artifact.approvalRequestId);
    if (approval.actionDigest !== digestProposedAction(this.action(campaign, artifact)) ||
        approval.actionId !== artifact.id || approval.toolName !== "marketing.review_artifact")
      throw new Error("Approval is not bound to this exact artifact version.");
    if (approval.status !== "APPROVED" && approval.status !== "REJECTED")
      throw new Error("Artifact review has no final owner decision.");
    if (approval.status === "APPROVED") {
      const decision = await this.evaluate(context, campaign, artifact);
      if (decision.decision !== "allow" || decision.approvalRequestId !== artifact.approvalRequestId)
        throw new Error("Current policy did not authorize this exact artifact approval.");
    }
    const target = approval.status;
    const updatedArtifact = artifact.status === "IN_REVIEW"
      ? await this.store.updateArtifactStatus(context.ownerId, context.companyId, campaignId, artifactId,
        "IN_REVIEW", target, artifact.approvalRequestId)
      : artifact.status === target ? artifact : null;
    if (!updatedArtifact) throw new Error("Artifact review changed concurrently; retry safely.");
    const latest = await this.store.findCampaign(context.ownerId, context.companyId, campaignId);
    const currentDeliverable = latest?.deliverables.find((item) => item.id === artifact.deliverableId);
    if (!latest || latest.status === "CANCELLED" || currentDeliverable?.artifactRef !== `marketing-artifact:${artifact.id}` ||
        currentDeliverable.version !== artifact.version || currentDeliverable.contentDigest !== artifact.contentDigest)
      throw new Error("Campaign artifact changed during review; stale approval cannot be applied.");
    if (currentDeliverable.approvalState !== target) {
      const at = new Date().toISOString();
      const updatedCampaign = MarketingCampaignSchema.parse({ ...latest, version: latest.version + 1, updatedAt: at,
        deliverables: latest.deliverables.map((item) => item.id === artifact.deliverableId
          ? { ...item, approvalState: target, status: target === "APPROVED" ? "COMPLETED" : "BLOCKED", updatedAt: at } : item) });
      if (!await this.store.updateCampaign(updatedCampaign, latest.version))
        throw new Error("Campaign review state changed; retry reconciliation safely.");
    }
    await this.audit({ eventType: "OBJECTIVE_STATE_CHANGED", ownerId: context.ownerId, companyId: context.companyId,
      outcome: target === "APPROVED" ? "SUCCESS" : "DENIED", reason: `Exact campaign artifact review ${target.toLowerCase()}.`,
      requestId: context.requestId, ipAddress: context.ipAddress,
      metadata: { campaignId, artifactId, version: artifact.version, contentDigest: artifact.contentDigest,
        approvalRequestId: artifact.approvalRequestId, reviewingSessionId: approval.decidedBySessionId ?? null } });
    return MarketingArtifactSchema.parse(updatedArtifact);
  }
}
