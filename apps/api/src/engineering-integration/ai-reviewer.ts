import { z } from "zod";
import { EngineeringAcceptanceEvidenceSchema } from "@alexa-control/shared";

import type { AIRouterService } from "../ai/router/service.js";
import type { AgentStore } from "../agents/store.js";
import type { EngineeringIntegrationReviewer } from "./service.js";

const ReviewOutputSchema = z
  .object({
    verdict: z.enum(["PASS", "PASS_WITH_WARNINGS", "CHANGES_REQUIRED", "BLOCK"]),
    dimensions: z
      .object({
        correctness: z.number().int().min(0).max(100),
        scopeAdherence: z.number().int().min(0).max(100),
        architectureConsistency: z.number().int().min(0).max(100),
        maintainability: z.number().int().min(0).max(100),
        security: z.number().int().min(0).max(100),
        tests: z.number().int().min(0).max(100),
        regressionRisk: z.number().int().min(0).max(100),
        acceptanceCoverage: z.number().int().min(0).max(100),
      })
      .strict(),
    findings: z.array(z.string().min(1).max(1_000)).max(50),
    evidence: z.array(z.string().min(1).max(500)).max(100),
    acceptanceEvidence: z.array(EngineeringAcceptanceEvidenceSchema).max(30),
  })
  .strict();

/** Independent review is advisory only; it cannot execute capabilities or mutate the candidate. */
export class AIRouterEngineeringIntegrationReviewer implements EngineeringIntegrationReviewer {
  constructor(readonly router: AIRouterService, readonly agents: AgentStore) {}

  async review(input: Parameters<EngineeringIntegrationReviewer["review"]>[0]) {
    const assignment = (await this.agents.listAssignments(input.run.ownerId, input.run.companyId))
      .find((item) => item.id === input.reviewerAgentId &&
        item.companyId === input.run.companyId &&
        ["ACTIVE", "DORMANT"].includes(item.status));
    if (!assignment) throw new Error("The independent reviewer has no active company assignment.");
    const response = await this.router.executeStructured(
      {
        requestId: crypto.randomUUID(),
        purpose: "EVALUATION",
        requestedRole: "DEEP_REASONER",
        risk: input.security ? "CRITICAL" : "HIGH",
        complexityHint: {
          level: "HIGH",
          reason: input.security
            ? "Independent security review of an integrated engineering candidate."
            : "Independent correctness and acceptance review of an integrated engineering candidate.",
        },
        reasoning: "HIGH",
        outputMode: "STRUCTURED",
        input: [
          {
            role: "user",
            content: [
              {
                type: "json",
                value: {
                  integration: {
                    id: input.run.id,
                    objectiveId: input.run.objectiveId,
                    baseCommit: input.run.baseCommit,
                    headCommit: input.headCommit,
                    integrationOrder: input.run.integrationOrder,
                    changeMap: input.run.changeMap,
                  },
                  acceptanceCriteria: input.acceptanceCriteria,
                  integrationValidation: {
                    reportId: input.validationReport.id,
                    status: input.validationReport.status,
                    steps: input.validationReport.steps.map((step) => ({
                      commandId: step.commandId,
                      kind: step.kind,
                      status: step.status,
                      exitCode: step.result?.exitCode ?? null,
                    })),
                  },
                  filesChanged: input.filesChanged,
                  combinedPatch: input.combinedPatch,
                  taskResults: input.taskResults.map((result) => ({
                    taskId: result.taskId,
                    status: result.status,
                    validationStatus: result.validationStatus,
                    reviewStatus: result.reviewStatus,
                    diffSummary: result.diffSummary,
                    warnings: result.warnings,
                  })),
                  reviewKind: input.security ? "SECURITY" : "INTEGRATION",
                },
              },
            ],
          },
        ],
        systemInstructions: [
          "Review only the bounded evidence supplied. Do not execute tools, infer hidden code, or grant capabilities.",
          "Fail closed when evidence is missing. Acceptance criteria require cited validation or task evidence.",
          "Map each acceptance criterion exactly to concrete evidence; mark unsatisfied when evidence is insufficient.",
          "Security review must flag protected-path, dependency, secret, authorization, tenant-scope, and unsafe-execution risks.",
          "Return findings and evidence summaries only; never include chain-of-thought or secrets.",
        ],
        // Reasoning tokens share this budget with the structured review response.
        maxOutputTokens: 8_192,
        maxAttempts: 2,
        maxCloudEscalations: 1,
        economicContext: {
          ownerId: input.run.ownerId,
          companyId: input.run.companyId,
          agentId: input.reviewerAgentId,
          taskId: input.run.id,
          purpose: "EVALUATION",
          autonomyMode: "AUTONOMOUS",
          costCenter: `engineering-integration:${input.run.id}`,
          metadata: { reviewKind: input.security ? "SECURITY" : "INTEGRATION" },
        },
        objectiveId: input.run.objectiveId,
        taskId: input.run.id,
        agentId: assignment.agentDefinitionId,
        agentDefinitionId: assignment.agentDefinitionId,
        companyAgentAssignmentId: assignment.id,
        taskClass: input.security ? "SECURITY" : "INTEGRATION_PREP",
        schema: ReviewOutputSchema,
        jsonSchema: z.toJSONSchema(ReviewOutputSchema),
        schemaName: input.security
          ? "engineering_integration_security_review_v1"
          : "engineering_integration_review_v1",
      },
      { signal: input.signal },
    );
    if (response.outcome !== "SUCCESS" || !response.structuredOutput)
      return {
        verdict: "BLOCK" as const,
        dimensions: {
          correctness: 0,
          scopeAdherence: 0,
          architectureConsistency: 0,
          maintainability: 0,
          security: 0,
          tests: 0,
          regressionRisk: 0,
          acceptanceCoverage: 0,
        },
        findings: [(response.attempts.at(-1)?.reason ?? response.decision.reason).slice(0, 1_000)],
        evidence: [],
        acceptanceEvidence: [],
        providerId: response.providerId ?? null,
        modelId: response.modelId ?? null,
        inputTokens: Math.round(response.usage?.inputTokens ?? 0),
        outputTokens: Math.round(response.usage?.outputTokens ?? 0),
        costUsd: response.decision.economic?.estimatedCostUsd ?? "0.0",
      };
    return {
      ...ReviewOutputSchema.parse(response.structuredOutput),
      providerId: response.providerId ?? null,
      modelId: response.modelId ?? null,
      inputTokens: Math.round(response.usage?.inputTokens ?? 0),
      outputTokens: Math.round(response.usage?.outputTokens ?? 0),
      costUsd: response.decision.economic?.estimatedCostUsd ?? "0.0",
    };
  }
}
