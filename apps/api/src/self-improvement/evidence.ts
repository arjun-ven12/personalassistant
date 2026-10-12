import { EngineeringBenchmarkRunSchema, EngineeringEventSchema } from "@alexa-control/shared";

import type { AIEconomicsService } from "../ai/economics/service.js";
import type { EngineeringDeliveryContext } from "../engineering-delivery/service.js";
import type { EngineeringManagerService } from "../engineering-orchestration/service.js";
import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { ExecutionStore } from "../execution/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { SelfImprovementService } from "./service.js";
import { buildSelfImprovementTelemetry } from "./telemetry.js";

/** Uses existing durable evidence stores; contains no execution or acceptance authority. */
export class SelfImprovementEvidence {
  constructor(readonly service: SelfImprovementService, readonly manager: EngineeringManagerService,
    readonly store: EngineeringOrchestrationStore, readonly economics: AIEconomicsService,
    readonly executions: ExecutionStore, readonly audit: GovernanceAuditWriter) {}

  async read(ownerId: string, companyId: string, deliveryId: string) {
    const view = await this.service.view(ownerId, companyId, deliveryId);
    const [objective, ledger, executions] = await Promise.all([
      this.manager.view(ownerId, companyId, view.objectiveId),
      this.economics.listLedger(ownerId, 100_000), this.executions.list(ownerId, 10_000),
    ]);
    return buildSelfImprovementTelemetry(view, objective, { ledger, executions });
  }

  async capture(context: EngineeringDeliveryContext, deliveryId: string) {
    const value = await this.read(context.ownerId, context.companyId, deliveryId);
    const view = await this.service.view(context.ownerId, context.companyId, deliveryId);
    const at = new Date().toISOString();
    await this.store.saveEvent(EngineeringEventSchema.parse({ id: crypto.randomUUID(), ownerId: context.ownerId,
      companyId: context.companyId, objectiveId: value.objectiveId, taskId: null, type: "BENCHMARK_RECORDED",
      summary: "Recorded self-improvement benchmark from existing runtime evidence.",
      metadata: { deliveryId, candidateId: view.integration?.candidate?.id ?? null,
        candidateHead: view.integration?.candidate?.headCommit ?? null, telemetry: value }, createdAt: at }));
    await this.audit({ eventType: "OBJECTIVE_STATE_CHANGED", ownerId: context.ownerId, companyId: context.companyId,
      outcome: "SUCCESS", reason: "Persisted self-improvement runtime benchmark evidence.",
      requestId: context.requestId, ipAddress: context.ipAddress,
      metadata: { objectiveId: value.objectiveId, deliveryId } });
    return value;
  }

  async recordComparison(context: EngineeringDeliveryContext, deliveryId: string, raw: unknown) {
    const view = await this.service.view(context.ownerId, context.companyId, deliveryId);
    const value = EngineeringBenchmarkRunSchema.parse(raw);
    if (value.taskId !== view.deliveryId || value.source !== "OWNER_ENTERED" || value.system === "ATHENA")
      throw Object.assign(new Error("Comparison must be owner-entered and bound to this self-improvement run."), { statusCode: 400 });
    await this.store.saveEvent(EngineeringEventSchema.parse({ id: crypto.randomUUID(), ownerId: context.ownerId,
      companyId: context.companyId, objectiveId: view.objectiveId, taskId: null, type: "BENCHMARK_RECORDED",
      summary: "Owner supplied a comparison benchmark; it is not measured Athena runtime evidence.",
      metadata: { deliveryId, comparison: value }, createdAt: new Date().toISOString() }));
    await this.audit({ eventType: "OBJECTIVE_STATE_CHANGED", ownerId: context.ownerId, companyId: context.companyId,
      outcome: "SUCCESS", reason: "Recorded owner-entered self-improvement benchmark comparison.",
      requestId: context.requestId, ipAddress: context.ipAddress, metadata: { objectiveId: view.objectiveId, deliveryId } });
    return value;
  }
}
