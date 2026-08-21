import {
  BenchmarkResultRecordSchema,
  CapabilityMarketplaceRecordSchema,
  CreateEvolutionProposalRequestSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionDashboardResponseSchema,
  EvolutionProposalRecordSchema,
  EvolutionRecordSchema,
  EvolutionTimelineRecordSchema,
  ExpertiseHistoryRecordSchema,
  ImprovementRecordSchema,
  RunEvolutionAnalysisRequestSchema,
  SelfEvaluationRecordSchema,
  VersionRecordSchema,
  type AgentRecord,
  type EvolutionProposalRecord,
  type MemoryEvidence,
  type RunEvolutionAnalysisRequest,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentCognitionService } from "../agent-cognition/service.js";
import type { AgentStore } from "../agents/store.js";
import type { AgentEvolutionStore } from "./store.js";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "general";

const uuidFromHash = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${
    variant
  }${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
};

const levelFor = (experienceCount: number, successRate: number) => {
  if (experienceCount >= 200 && successRate >= 0.95) return "master";
  if (experienceCount >= 120 && successRate >= 0.9) return "specialist";
  if (experienceCount >= 60 && successRate >= 0.85) return "expert";
  if (experienceCount >= 20 && successRate >= 0.75) return "advanced";
  if (experienceCount >= 5) return "intermediate";
  return "beginner";
};

const evidenceFor = (at: string, reference: string): MemoryEvidence[] => [
  {
    sourceType: "agent",
    reference,
    excerpt:
      "Generated from registered Agent OS, cognitive memory, workflow, and capability metadata. Evolution is advisory and approval-gated.",
    observedAt: at,
  },
];

const proposalForFocus = (
  focus: RunEvolutionAnalysisRequest["focus"],
): Pick<EvolutionProposalRecord, "type" | "title" | "summary" | "impact" | "risk"> => {
  switch (focus) {
    case "capabilities":
      return {
        type: "refine_capability",
        title: "Refine capability based on repeated usage",
        summary:
          "The agent has accumulated enough capability evidence to justify a reviewed refinement proposal. This does not grant new permissions.",
        impact: "medium",
        risk: "low",
      };
    case "prompt":
      return {
        type: "prompt_improvement",
        title: "Propose prompt improvement from historical outcomes",
        summary:
          "Historical self-evaluation indicates the agent prompt could be made more precise while preserving existing constraints.",
        impact: "medium",
        risk: "medium",
      };
    case "reasoning":
      return {
        type: "confidence_calibration",
        title: "Calibrate reasoning confidence",
        summary:
          "Benchmark comparison suggests confidence estimates should be reviewed against observed outcomes before future use.",
        impact: "medium",
        risk: "low",
      };
    case "workflow":
      return {
        type: "workflow_improvement",
        title: "Recommend reusable workflow improvement",
        summary:
          "Repeated workflow patterns can be documented as a reusable, approval-gated operating procedure.",
        impact: "medium",
        risk: "low",
      };
    case "knowledge":
      return {
        type: "knowledge_organization",
        title: "Organize high-value agent knowledge",
        summary:
          "Frequently reused knowledge should be consolidated into clearer procedural or semantic memory while preserving source evidence.",
        impact: "low",
        risk: "low",
      };
    case "expertise":
    default:
      return {
        type: "specialization_change",
        title: "Recommend specialization review",
        summary:
          "Expertise trends indicate this agent may be developing a specialist focus that should be reviewed by the owner.",
        impact: "medium",
        risk: "low",
      };
  }
};

export class AgentEvolutionService {
  constructor(
    readonly store: AgentEvolutionStore,
    readonly agentStore: AgentStore,
    readonly cognition: AgentCognitionService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return EvolutionDashboardResponseSchema.parse({
      expertise: await this.store.listExpertise(ownerId),
      expertiseHistory: await this.store.listExpertiseHistory(ownerId, 200),
      proposals: await this.store.listProposals(ownerId, 200),
      capabilityVersions: await this.store.listVersions(ownerId, "capability", 200),
      promptVersions: await this.store.listVersions(ownerId, "prompt", 200),
      reasoningVersions: await this.store.listVersions(ownerId, "reasoning", 200),
      workflowImprovements: await this.store.listImprovements(ownerId, "workflow", 200),
      knowledgeImprovements: await this.store.listImprovements(
        ownerId,
        "knowledge",
        200,
      ),
      failureHistory: await this.store.listOutcomes(ownerId, "failure", 200),
      successHistory: await this.store.listOutcomes(ownerId, "success", 200),
      benchmarks: await this.store.listBenchmarks(ownerId, 200),
      timeline: await this.store.listTimeline(ownerId, 200),
      selfEvaluations: await this.store.listSelfEvaluations(ownerId, 200),
      marketplace: await this.store.listMarketplace(ownerId),
      approvalRequired: true,
      automaticMutationEnabled: false,
    });
  }

  async analyse(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = RunEvolutionAnalysisRequestSchema.parse(input.body);
    const agent = await this.requireAgent(input.ownerId, parsed.agentId);
    const at = this.now().toISOString();
    const evidence = evidenceFor(at, `${agent.displayName} evolution analysis`);
    const proposalSeed = proposalForFocus(parsed.focus);
    const proposal = EvolutionProposalRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      ...proposalSeed,
      evidence,
      confidence: this.confidenceFor(agent),
      rollbackPlan:
        "Reject or archive this proposal; no runtime, prompt, capability, permission, or tool assignment changes have been applied.",
      status: "proposed",
      requiresApproval: true,
      createdAt: at,
      updatedAt: at,
    });
    const benchmark = BenchmarkResultRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      benchmarkName: `${parsed.focus}_quality`,
      comparedTo: "historical_agent_baseline",
      score: this.confidenceFor(agent),
      trend: 0.08,
      summary:
        "Benchmark result compares current evidence-backed capability and cognition signals against the baseline profile.",
      evidence,
      createdAt: at,
    });
    const selfEvaluation = SelfEvaluationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      strengths: this.strengthsFor(agent),
      weaknesses: [
        "Evolution proposals are still advisory and require owner review before use.",
      ],
      blindSpots: [
        "External production outcomes are not inferred unless captured as audited evidence.",
      ],
      knowledgeGaps:
        parsed.focus === "knowledge"
          ? ["Review whether frequently retrieved memories should be consolidated."]
          : ["Continue collecting workflow evidence before automatic specialization."],
      reasoningQuality: this.confidenceFor(agent),
      planningQuality: Math.min(0.95, this.confidenceFor(agent) + 0.04),
      memoryQuality: 0.82,
      toolUsageQuality: 0.78,
      recommendations: [
        proposal.title,
        "Compare this proposal with future workflow outcomes before approving permanent changes.",
      ],
      evidence,
      createdAt: at,
    });
    await this.store.saveProposal(proposal);
    await this.store.saveBenchmark(benchmark);
    await this.store.saveSelfEvaluation(selfEvaluation);
    await this.store.saveTimeline(
      EvolutionTimelineRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        agentId: agent.id,
        eventType: "evolution_analysis",
        title: `Evolution analysis completed for ${agent.displayName}`,
        summary: `${proposal.title}; proposal is pending explicit approval.`,
        evidence,
        occurredAt: at,
      }),
    );
    if (parsed.focus === "workflow" || parsed.focus === "knowledge") {
      await this.store.saveImprovement(
        ImprovementRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          agentId: agent.id,
          area: parsed.focus,
          title: proposal.title,
          recommendation: proposal.summary,
          evidence,
          confidence: proposal.confidence,
          status: "proposed",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.audit({
      eventType: "AGENT_EVOLUTION_ANALYSED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent evolution analysis produced approval-required proposals only.",
      metadata: {
        agentId: agent.id,
        proposalId: proposal.id,
        focus: parsed.focus,
        automaticMutationEnabled: false,
      },
      requestId: input.requestId,
    });
    await this.audit({
      eventType: "AGENT_SELF_EVALUATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent self-evaluation recorded with evidence.",
      metadata: { agentId: agent.id, selfEvaluationId: selfEvaluation.id },
      requestId: input.requestId,
    });
    await this.audit({
      eventType: "AGENT_BENCHMARK_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent benchmark recorded for evolution tracking.",
      metadata: { agentId: agent.id, benchmarkId: benchmark.id },
      requestId: input.requestId,
    });
    return EvolutionAnalysisResponseSchema.parse({
      proposal,
      benchmark,
      selfEvaluation,
    });
  }

  async createProposal(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = CreateEvolutionProposalRequestSchema.parse(input.body);
    const agent = await this.requireAgent(input.ownerId, parsed.agentId);
    const at = this.now().toISOString();
    const proposal = EvolutionProposalRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      type: parsed.type,
      title: parsed.title,
      summary: parsed.summary,
      evidence:
        parsed.evidence.length > 0
          ? parsed.evidence
          : evidenceFor(at, `${agent.displayName} manual evolution proposal`),
      impact: parsed.impact,
      confidence: parsed.confidence,
      risk: parsed.risk,
      rollbackPlan: parsed.rollbackPlan,
      status: "proposed",
      requiresApproval: true,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveProposal(proposal);
    await this.store.saveTimeline(
      EvolutionTimelineRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        agentId: agent.id,
        eventType: "proposal_created",
        title: proposal.title,
        summary:
          "Evolution proposal created for owner review. No agent package, prompt, capability, or permission changes were applied.",
        evidence: proposal.evidence,
        occurredAt: at,
      }),
    );
    await this.audit({
      eventType: "AGENT_EVOLUTION_PROPOSAL_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Evolution proposal created; approval is required before use.",
      metadata: {
        agentId: agent.id,
        proposalId: proposal.id,
        proposalType: proposal.type,
        automaticMutationEnabled: false,
      },
      requestId: input.requestId,
    });
    return { proposal };
  }

  async proposals(ownerId: string, limit = 200) {
    await this.ensureBaseline(ownerId);
    return this.store.listProposals(ownerId, limit);
  }

  async expertise(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listExpertise(ownerId);
  }

  async timeline(ownerId: string, limit = 200) {
    await this.ensureBaseline(ownerId);
    return this.store.listTimeline(ownerId, limit);
  }

  async benchmarks(ownerId: string, limit = 200) {
    await this.ensureBaseline(ownerId);
    return this.store.listBenchmarks(ownerId, limit);
  }

  async marketplace(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listMarketplace(ownerId);
  }

  async selfEvaluations(ownerId: string, limit = 200) {
    await this.ensureBaseline(ownerId);
    return this.store.listSelfEvaluations(ownerId, limit);
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    await this.cognition.ensureBaseline(ownerId, requestId);
    const at = this.now().toISOString();
    const [agents, existingExpertise, existingMarketplace] = await Promise.all([
      this.agentStore.listAgents(ownerId),
      this.store.listExpertise(ownerId),
      this.store.listMarketplace(ownerId),
    ]);
    const existingExpertiseKeys = new Set(
      existingExpertise.map(
        (item) => `${item.agentId}:${item.category}:${normalize(item.name)}`,
      ),
    );
    const marketplaceIds = new Set(existingMarketplace.map((item) => item.id));
    for (const agent of agents) {
      const capabilities =
        agent.capabilities.length > 0 ? agent.capabilities : ["general_engineering"];
      for (const capability of capabilities) {
        const normalized = normalize(capability);
        const key = `${agent.id}:capability:${normalized}`;
        const evidence = evidenceFor(at, `${agent.displayName}:${capability}`);
        if (!existingExpertiseKeys.has(key)) {
          const experienceCount =
            agent.supportedTasks.length + agent.capabilities.length;
          const successRate = agent.status === "unhealthy" ? 0.5 : 0.8;
          const expertise = EvolutionRecordSchema.parse({
            id: uuidFromHash(`expertise:${ownerId}:${agent.id}:${normalized}`),
            ownerId,
            agentId: agent.id,
            category: "capability",
            name: capability,
            level: levelFor(experienceCount, successRate),
            experienceCount,
            confidence: this.confidenceFor(agent),
            successRate,
            recencyScore: agent.status === "available" ? 0.8 : 0.55,
            evidence,
            relatedProjects: [],
            growthTrend: 0,
            updatedAt: at,
          });
          await this.store.saveExpertise(expertise);
          await this.store.saveExpertiseHistory(
            ExpertiseHistoryRecordSchema.parse({
              id: crypto.randomUUID(),
              ownerId,
              agentId: agent.id,
              expertiseId: expertise.id,
              previousLevel: null,
              newLevel: expertise.level,
              reason: "Baseline expertise generated from registered agent metadata.",
              evidence,
              createdAt: at,
            }),
          );
          await this.audit({
            eventType: "AGENT_EXPERTISE_UPDATED",
            ownerId,
            ipAddress: "system",
            outcome: "SUCCESS",
            reason: "Baseline expertise initialized from agent metadata.",
            metadata: { agentId: agent.id, capability },
            requestId,
          });
        }
        if (!marketplaceIds.has(normalized)) {
          await this.store.saveMarketplace(
            CapabilityMarketplaceRecordSchema.parse({
              id: normalized,
              ownerId,
              name: capability,
              description: `Reusable capability module for ${capability}. Capability use remains permission-profile governed.`,
              popularity: agents.filter((candidate) =>
                candidate.capabilities.map(normalize).includes(normalized),
              ).length,
              reuseCount: 0,
              qualityScore: 0.75,
              dependencies: [],
              version: "1.0.0",
              evidence,
              createdAt: at,
              updatedAt: at,
            }),
          );
        }
      }
      await this.ensureBaselineVersion(ownerId, agent, at);
      await this.ensureBaselineTimeline(ownerId, agent, at);
    }
  }

  private async ensureBaselineVersion(ownerId: string, agent: AgentRecord, at: string) {
    const existing = await this.store.listVersions(ownerId, "reasoning", 500);
    if (existing.some((version) => version.agentId === agent.id)) return;
    await this.store.saveVersion(
      VersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        agentId: agent.id,
        subjectType: "reasoning",
        subjectId: "baseline_reasoning_profile",
        version: "1.0.0",
        changeSummary:
          "Baseline reasoning profile captured. No prompt or runtime mutation applied.",
        proposalId: null,
        approved: false,
        createdAt: at,
      }),
    );
  }

  private async ensureBaselineTimeline(
    ownerId: string,
    agent: AgentRecord,
    at: string,
  ) {
    const existing = await this.store.listTimeline(ownerId, 500);
    if (
      existing.some(
        (event) =>
          event.agentId === agent.id && event.eventType === "evolution_initialized",
      )
    ) {
      return;
    }
    await this.store.saveTimeline(
      EvolutionTimelineRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        agentId: agent.id,
        eventType: "evolution_initialized",
        title: `${agent.displayName} evolution tracking initialized`,
        summary:
          "Agent evolution telemetry is active. Evolution remains proposal-only and owner-governed.",
        evidence: evidenceFor(at, `${agent.displayName} baseline evolution`),
        occurredAt: at,
      }),
    );
  }

  private async requireAgent(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) {
      throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    }
    return agent;
  }

  private confidenceFor(agent: AgentRecord) {
    return agent.status === "unhealthy" ? 0.5 : 0.78;
  }

  private strengthsFor(agent: AgentRecord) {
    const capability = agent.capabilities[0] ?? "governed engineering analysis";
    return [
      `${agent.displayName} has registered capability coverage for ${capability}.`,
      "Agent evolution is constrained to evidence-backed proposals.",
    ];
  }
}
