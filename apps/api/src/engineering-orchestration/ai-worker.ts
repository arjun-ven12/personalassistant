import { z } from "zod";
import {
  EngineeringSearchRequestSchema,
  EngineeringFileReadRequestSchema,
  EngineeringFileCreateRequestSchema,
  EngineeringPatchSchema,
} from "@alexa-control/shared";

import type { AIRouterService } from "../ai/router/service.js";
import type { EngineeringTaskWorker } from "./service.js";

const ProposedOperationSchema = z
  .object({
    capability: z.enum([
      "repository.inspect",
      "repository.search",
      "repository.file_read",
      "repository.file_create",
      "repository.file_patch",
      "repository.git_status",
      "repository.git_diff",
      "repository.run_command",
      "repository.validate",
      "repository.install_dependencies",
      "repository.add_dependency",
      "repository.remove_dependency",
      "repository.revert_commit",
    ]),
    input: z.record(z.string().max(80), z.json()),
  })
  .strict();
const AgentProposalSchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    operations: z.array(ProposedOperationSchema).max(20),
    artifacts: z
      .array(
        z
          .object({
            type: z.enum([
              "API_CONTRACT",
              "SCHEMA_CHANGE",
              "COMPONENT_INTERFACE",
              "TEST_EXPECTATIONS",
              "MIGRATION_NOTES",
              "ARCHITECTURE_DECISION",
              "VALIDATION_SUMMARY",
              "BLOCKER",
            ]),
            title: z.string().min(1).max(255),
            summary: z.string().min(1).max(4_000),
            contract: z.record(z.string().max(80), z.json()).default({}),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
const ReviewSchema = z
  .object({
    status: z.enum(["PASS", "FAIL"]),
    summary: z.string().min(1).max(1_000),
  })
  .strict();

const operationInputSchemas = {
  "repository.search": EngineeringSearchRequestSchema,
  "repository.file_read": EngineeringFileReadRequestSchema,
  "repository.file_create": EngineeringFileCreateRequestSchema,
  "repository.file_patch": z.object({ patch: EngineeringPatchSchema }).strict(),
};

export interface GovernedEngineeringActionGateway {
  invoke(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string | null;
    taskId: string;
    agentId: string;
    capability: z.infer<typeof ProposedOperationSchema>["capability"];
    operationInput: Record<string, unknown>;
    signal: AbortSignal;
    transport: {
      sessionId: string;
      requestId: string;
      ipAddress: string;
      networkState: "UNKNOWN" | "PRIVATE_NETWORK" | "PUBLIC_NETWORK" | "UNAVAILABLE";
      deviceId?: string;
    };
  }): Promise<{
    output: unknown;
    validationStatus?: "PASS" | "FAIL" | "ERROR" | "NOT_CONFIGURED";
    validationReportId?: string | null;
    filesChanged?: string[];
    diffSummary?: string;
  }>;
}

export class UnavailableEngineeringActionGateway implements GovernedEngineeringActionGateway {
  invoke(): Promise<never> {
    return Promise.reject(
      Object.assign(
        new Error("The signed Mac-agent engineering action gateway is not configured."),
        { code: "ENGINEERING_SIGNED_TRANSPORT_UNAVAILABLE" },
      ),
    );
  }
}

const routing = (tier: "LUNA" | "TERRA" | "SOL" | "ASTRA") => ({
  requestedRole:
    tier === "SOL" || tier === "ASTRA"
      ? ("DEEP_REASONER" as const)
      : ("CODER" as const),
  complexityHint: {
    level:
      tier === "LUNA"
        ? ("LOW" as const)
        : tier === "TERRA"
          ? ("MEDIUM" as const)
          : tier === "SOL"
            ? ("HIGH" as const)
            : ("VERY_HIGH" as const),
    reason: `Engineering task policy selected ${tier}.`,
  },
  reasoning:
    tier === "LUNA"
      ? ("LOW" as const)
      : tier === "TERRA"
        ? ("MEDIUM" as const)
        : ("HIGH" as const),
});

/** Models only propose bounded operations; the gateway remains the execution authority. */
export class AIRouterEngineeringTaskWorker implements EngineeringTaskWorker {
  constructor(
    readonly router: AIRouterService,
    readonly gateway: GovernedEngineeringActionGateway,
  ) {}

  async execute(input: Parameters<EngineeringTaskWorker["execute"]>[0]) {
    if (!input.task.assignedAgentId)
      return {
        status: "BLOCKED" as const,
        failureCategory: "MISSING_CAPABILITY" as const,
        failureSummary: "No logical engineering agent assignment exists.",
      };
    const allowedCapabilities = ProposedOperationSchema.shape.capability.options.filter(
      (capability) => input.task.requiredCapabilities.includes(capability),
    );
    const proposalSchema = AgentProposalSchema.extend({
      operations: z.array(ProposedOperationSchema.extend({
        capability: z.enum(allowedCapabilities),
      })).max(20),
    });
    const response = await this.router.executeStructured(
      {
        requestId: crypto.randomUUID(),
        purpose: "CODING",
        taskText: `${input.task.title}: ${input.task.description}`,
        requestedRole: routing(input.modelTier).requestedRole,
        risk: input.task.riskLevel === "CRITICAL" ? "CRITICAL" : input.task.riskLevel,
        complexityHint: routing(input.modelTier).complexityHint,
        reasoning: routing(input.modelTier).reasoning,
        outputMode: "STRUCTURED",
        input: [
          {
            role: "user",
            content: [
              {
                type: "json",
                value: {
                  task: {
                    id: input.task.id,
                    title: input.task.title,
                    description: input.task.description,
                    acceptanceCriteria: input.task.acceptanceCriteria,
                    requiredCapabilities: input.task.requiredCapabilities,
                  },
                  context: input.context,
                  capabilityInputSchemas: z.json().parse(Object.fromEntries(
                    Object.entries(operationInputSchemas)
                      .filter(([capability]) => input.task.requiredCapabilities.some((allowed) => allowed === capability))
                      .map(([capability, schema]) => [capability, z.toJSONSchema(schema)]),
                  )),
                },
              },
            ],
          },
        ],
        contextProfile: "AGENT_TASK",
        context: [
          {
            sourceType: "AGENT",
            trustLevel: "TRUSTED",
            content: {
              agentDefinitionId: input.agentDefinitionId,
              companyAgentAssignmentId: input.task.assignedAgentId,
              taskId: input.task.id,
              role: input.task.assignedRole,
              requiredSkills: input.task.requiredSkills,
              requiredCapabilities: input.task.requiredCapabilities,
            },
          },
        ],
        systemInstructions: [
          "Return only a bounded engineering proposal. Use only required capabilities and registered IDs.",
          "Never emit shell text, executable paths, credentials, raw filesystem paths, deployment, merge, commit, or push actions.",
          "Protected paths remain approval-gated. Do not broaden scope beyond acceptance criteria.",
        ],
        maxOutputTokens: 4_096,
        maxAttempts: 3,
        maxCloudEscalations: input.modelTier === "LUNA" ? 0 : 1,
        maxCostUsd: input.objective.budget?.maxCostUsd ?? undefined,
        maxContextTokens: input.context.maxTokens,
        economicMaxInputTokens: Math.min(
          input.context.maxTokens,
          input.objective.budget?.maxTokens ?? input.context.maxTokens,
        ),
        economicContext: {
          ownerId: input.objective.ownerId,
          companyId: input.objective.companyId,
          agentId: input.task.assignedAgentId,
          taskId: input.task.id,
          workflowId: input.objective.workflowId ?? undefined,
          purpose: "CODING",
          autonomyMode: "AUTONOMOUS",
          costCenter: `engineering-objective:${input.objective.id}`,
          metadata: {
            objectiveId: input.objective.id,
            modelTier: input.modelTier,
            maxPremiumCostUsd: input.objective.budget?.maxPremiumCostUsd ?? null,
          },
        },
        objectiveId: input.objective.id,
        taskId: input.task.id,
        agentId: input.agentDefinitionId,
        agentDefinitionId: input.agentDefinitionId,
        companyAgentAssignmentId: input.task.assignedAgentId,
        taskClass: input.task.taskType,
        schema: proposalSchema,
        jsonSchema: z.toJSONSchema(proposalSchema),
        schemaName: "engineering_agent_proposal_v1",
      },
      { signal: input.signal },
    );
    if (response.outcome !== "SUCCESS" || !response.structuredOutput)
      return {
        status: "FAILED" as const,
        failureCategory: "MODEL_FAILURE" as const,
        failureSummary: response.attempts.at(-1)?.reason ?? response.decision.reason,
      };
    const proposal = AgentProposalSchema.parse(response.structuredOutput);
    let validationStatus: "PASS" | "FAIL" | "ERROR" | "NOT_CONFIGURED" | undefined;
    let validationReportId: string | null = null;
    const filesChanged = new Set<string>();
    let diffSummary = proposal.summary;
    for (const operation of proposal.operations) {
      if (!input.task.requiredCapabilities.includes(operation.capability))
        return {
          status: "BLOCKED" as const,
          failureCategory: "MISSING_CAPABILITY" as const,
          failureSummary: `The model requested undeclared capability ${operation.capability}.`,
        };
      const result = await this.gateway.invoke({
        ownerId: input.objective.ownerId,
        companyId: input.objective.companyId,
        repositoryId: input.objective.repositoryId,
        workspaceId: input.workspaceId,
        taskId: input.task.id,
        agentId: input.task.assignedAgentId,
        capability: operation.capability,
        operationInput: operation.input,
        signal: input.signal,
        transport: input.transport,
      });
      for (const file of result.filesChanged ?? []) filesChanged.add(file);
      if (result.diffSummary) diffSummary = result.diffSummary;
      if (result.validationStatus) validationStatus = result.validationStatus;
      if (result.validationReportId) validationReportId = result.validationReportId;
    }
    if (!input.task.readOnly && validationStatus !== "PASS")
      return {
        status: "FAILED" as const,
        validationStatus: validationStatus ?? "NOT_CONFIGURED",
        failureCategory: "TEST_FAILURE" as const,
        failureSummary:
          "A mutating task did not produce a passing governed validation result.",
      };
    return {
      status: "SUCCEEDED" as const,
      filesChanged: [...filesChanged],
      diffSummary,
      validationStatus: input.task.readOnly ? ("PASS" as const) : validationStatus!,
      validationReportId,
      modelProvider: response.providerId ?? null,
      modelName: response.modelId ?? null,
      aiRequestId: response.requestId,
      inputTokens: Math.round(response.usage?.inputTokens ?? 0),
      outputTokens: Math.round(response.usage?.outputTokens ?? 0),
      costUsd: response.decision.economic?.estimatedCostUsd ?? "0.0",
      artifacts: proposal.artifacts,
    };
  }

  async review(input: Parameters<EngineeringTaskWorker["review"]>[0]) {
    const response = await this.router.executeStructured(
      {
        requestId: crypto.randomUUID(),
        purpose: "EVALUATION",
        requestedRole: "DEEP_REASONER",
        risk: input.task.riskLevel,
        complexityHint: routing(input.modelTier).complexityHint,
        reasoning: "HIGH",
        outputMode: "STRUCTURED",
        input: [
          {
            role: "user",
            content: [
              {
                type: "json",
                value: {
                  task: input.task,
                  context: input.context,
                  authorAgentId: input.authorAgentId,
                  reviewerAgentId: input.reviewerAgentId,
                },
              },
            ],
          },
        ],
        contextProfile: "AGENT_TASK",
        context: [
          {
            sourceType: "AGENT",
            trustLevel: "TRUSTED",
            content: {
              agentDefinitionId: input.reviewerAgentDefinitionId,
              companyAgentAssignmentId: input.reviewerAgentId,
              authorAgentDefinitionId: input.authorAgentDefinitionId,
              taskId: input.task.id,
              review: true,
            },
          },
        ],
        systemInstructions: [
          "Perform an independent bounded review. Never execute tools or grant capabilities.",
        ],
        maxOutputTokens: 1_024,
        maxAttempts: 2,
        objectiveId: input.objective.id,
        taskId: input.task.id,
        agentId: input.reviewerAgentDefinitionId,
        agentDefinitionId: input.reviewerAgentDefinitionId,
        companyAgentAssignmentId: input.reviewerAgentId,
        schema: ReviewSchema,
        jsonSchema: z.toJSONSchema(ReviewSchema),
        schemaName: "engineering_independent_review_v1",
      },
      { signal: input.signal },
    );
    return response.outcome === "SUCCESS" && response.structuredOutput
      ? ReviewSchema.parse(response.structuredOutput)
      : { status: "FAIL" as const, summary: response.decision.reason };
  }
}
