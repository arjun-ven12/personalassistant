import { z } from "zod";

import type { AIRouterService } from "../ai/router/service.js";
import type { EngineeringIntegrationConflictResolver } from "./service.js";

const DecisionSchema = z.object({
  decision: z.enum(["RESOLVE_ADDITIVE", "ESCALATE"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(500),
}).strict();

/** Model advises eligibility only. The Mac runtime computes and verifies the exact merge. */
export class AIRouterEngineeringConflictResolver implements EngineeringIntegrationConflictResolver {
  constructor(readonly router: AIRouterService) {}

  async propose(input: Parameters<EngineeringIntegrationConflictResolver["propose"]>[0]) {
    const response = await this.router.executeStructured({
      requestId: crypto.randomUUID(),
      purpose: "CODING",
      requestedRole: "CODER",
      risk: "LOW",
      complexityHint: { level: "MEDIUM", reason: "Terra-policy bounded additive documentation conflict classification." },
      reasoning: "MEDIUM",
      outputMode: "STRUCTURED",
      input: [{ role: "user", content: [{ type: "json", value: {
        path: input.path,
        existingContent: input.existingContent,
        incomingContent: input.incomingContent,
        taskSummaries: input.taskSummaries,
      } }] }],
      systemInstructions: [
        "Classify only whether this low-risk Markdown conflict is independently additive. Never emit file content, a patch, shell, Git commands, or hidden reasoning.",
        "Escalate if edits can change existing meaning, security, permissions, contracts, or behavior, or if evidence is incomplete.",
        "The trusted runtime will independently prove append-only ancestry and construct any merge; your answer grants no execution authority.",
      ],
      maxOutputTokens: 256,
      maxAttempts: 1,
      maxCloudEscalations: 0,
      economicContext: {
        ownerId: input.ownerId,
        companyId: input.companyId,
        agentId: input.resolverAgentId,
        taskId: input.runId,
        purpose: "CODING",
        autonomyMode: "AUTONOMOUS",
        costCenter: `engineering-integration:${input.runId}`,
        metadata: { kind: "ADDITIVE_DOC_CONFLICT" },
      },
      objectiveId: input.objectiveId,
      taskId: input.runId,
      agentId: input.resolverAgentId,
      taskClass: "INTEGRATION_PREP",
      schema: DecisionSchema,
      schemaName: "engineering_additive_doc_conflict_decision_v1",
    }, { signal: input.signal });
    const decision = response.outcome === "SUCCESS" && response.structuredOutput
      ? DecisionSchema.parse(response.structuredOutput)
      : { decision: "ESCALATE" as const, confidence: 0, summary: "Resolver unavailable or inconclusive." };
    return {
      ...decision,
      providerId: response.providerId ?? null,
      modelId: response.modelId ?? null,
      inputTokens: Math.round(response.usage?.inputTokens ?? 0),
      outputTokens: Math.round(response.usage?.outputTokens ?? 0),
      costUsd: response.decision.economic?.estimatedCostUsd ?? "0.0",
    };
  }
}
