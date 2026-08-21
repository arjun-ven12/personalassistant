import {
  CreateEngineeringGoalRequestSchema,
  CreateScenarioSimulationRequestSchema,
  type AdvisorDashboardResponse,
  type AdvisorEvidence,
  type CreateEngineeringGoalRequest,
  type CreateScenarioSimulationRequest,
  type EngineeringGoalRecord,
  type EngineeringMetricsRecord,
  type RecommendationRecord,
  type ReleaseAssessmentRecord,
  type RepositoryHealthRecord,
  type RoadmapRecord,
  type SimulationRunRecord,
  type StrategicPlanRecord,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentStore } from "../agents/store.js";
import type { MemoryStore } from "../memory/store.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { WorkflowStore } from "../workflows/store.js";
import type { AdvisorStore } from "./store.js";

const scoreAverage = (values: number[]) =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const effortFor = (text: string, repositoryCount: number) => {
  const lower = text.toLowerCase();
  if (
    repositoryCount > 1 ||
    ["migrate", "authentication", "security", "database", "architecture"].some(
      (needle) => lower.includes(needle),
    )
  ) {
    return "large";
  }
  if (
    ["test", "documentation", "refactor", "performance"].some((needle) =>
      lower.includes(needle),
    )
  ) {
    return "medium";
  }
  return "small";
};

export class EngineeringAdvisorService {
  constructor(
    readonly store: AdvisorStore,
    readonly repositories: RepositoryStore,
    readonly workflows: WorkflowStore,
    readonly memory: MemoryStore,
    readonly agents: AgentStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string): Promise<AdvisorDashboardResponse> {
    await this.ensureBaseline(ownerId);
    const [
      goals,
      recommendations,
      risks,
      repositoryHealth,
      architectureHealth,
      technicalDebt,
      roadmaps,
      releaseAssessments,
    ] = await Promise.all([
      this.store.listGoals(ownerId, 50),
      this.store.listRecommendations(ownerId, 50),
      this.store.listRisks(ownerId, 50),
      this.store.listRepositoryHealth(ownerId, 50),
      this.store.listArchitectureHealth(ownerId, 50),
      this.store.listTechnicalDebt(ownerId, 50),
      this.store.listRoadmaps(ownerId, 10),
      this.store.listReleaseAssessments(ownerId, 10),
    ]);
    const metrics = await this.calculateMetrics(ownerId, {
      goals,
      recommendations,
      risks,
      repositoryHealth,
      technicalDebt,
      releaseAssessments,
    });
    return {
      goals,
      recommendations,
      risks,
      repositoryHealth,
      architectureHealth,
      technicalDebt,
      roadmaps,
      releaseAssessments,
      metrics,
      advisoryOnly: true,
    };
  }

  async createGoal(input: {
    ownerId: string;
    ownerEmail: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body: CreateEngineeringGoalRequest = CreateEngineeringGoalRequestSchema.parse(
      input.body,
    );
    const now = this.now().toISOString();
    const goal: EngineeringGoalRecord = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: "proposed",
      dependencies: [],
      estimatedEffort: effortFor(
        body.title + " " + body.description,
        body.affectedRepositoryIds.length,
      ),
      risks: [
        "Requires explicit owner approval before any implementation workflow or patch can run.",
      ],
      affectedRepositoryIds: body.affectedRepositoryIds,
      completionPercent: 0,
      owner: input.ownerEmail,
      linkedWorkflowIds: [],
      rationale: body.rationale,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveGoal(goal);
    await this.audit({
      eventType: "ENGINEERING_GOAL_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Owner created a long-term engineering goal.",
      requestId: input.requestId,
      metadata: {
        goalId: goal.id,
        priority: goal.priority,
        advisoryOnly: true,
      },
    });
    return goal;
  }

  async goals(ownerId: string) {
    return this.store.listGoals(ownerId, 100);
  }

  async planGoal(input: {
    ownerId: string;
    goalId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const goal = await this.store.findGoal(input.ownerId, input.goalId);
    if (!goal) throw new Error("Engineering goal was not found.");
    const repositories = await this.repositories.listRepositories(input.ownerId);
    const targetRepositories =
      goal.affectedRepositoryIds.length === 0
        ? repositories
        : repositories.filter((repository) =>
            goal.affectedRepositoryIds.includes(repository.id),
          );
    const now = this.now().toISOString();
    const plan: StrategicPlanRecord = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      goalId: goal.id,
      architecturePlan:
        "Use existing repository intelligence, semantic indexes, workflow planning, validation, policy, approval, audit, and memory systems. Keep this plan advisory until the owner explicitly starts an approved workflow.",
      implementationPhases: [
        {
          title: "Evidence review",
          objective:
            "Collect repository health, semantic dependencies, prior decisions, and related workflows before choosing an implementation path.",
          dependencies: [],
          approvalCheckpoint: false,
        },
        {
          title: "Design proposal",
          objective:
            "Convert the goal into a bounded architecture proposal with affected repositories and risk controls.",
          dependencies: ["Evidence review"],
          approvalCheckpoint: true,
        },
        {
          title: "Human-approved implementation workflow",
          objective:
            "Only after approval, create small patch tasks through the existing human-in-the-loop workflow system.",
          dependencies: ["Design proposal"],
          approvalCheckpoint: true,
        },
        {
          title: "Validation and release readiness",
          objective:
            "Use the existing validation profiles and release assessment checks to decide whether the result is ready.",
          dependencies: ["Human-approved implementation workflow"],
          approvalCheckpoint: true,
        },
      ],
      milestones: [
        "Goal scope confirmed",
        "Architecture impact reviewed",
        "Risk mitigations accepted",
        "Validation plan approved",
      ],
      repositoryImpact:
        targetRepositories.length === 0
          ? ["No repository is currently linked; impact estimate is low-confidence."]
          : targetRepositories.map(
              (repository) =>
                `${repository.workspaceId} (${repository.indexStatus}) is in scope.`,
            ),
      testingStrategy:
        "Prefer existing validation profiles first, then add targeted tests through approved patches only when gaps are confirmed.",
      deploymentStrategy:
        "Do not deploy automatically. Treat deployment as a separate approved workflow with readiness checks and rollback notes.",
      rollbackStrategy:
        "Use repository generations, patch rollback snapshots, and validation reports created by existing Phase 5 systems.",
      documentationTasks: [
        "Update architecture notes if ownership or boundaries change.",
        "Update operational docs when deployment, recovery, or security behavior changes.",
      ],
      riskAnalysis: [
        "Architecture drift risk increases when changes cross shared packages.",
        "Security risk requires extra review for authentication, policy, approval, memory, or integration changes.",
      ],
      approvalCheckpoints: [
        "Approve the plan before implementation.",
        "Approve each generated patch according to policy.",
        "Review validation result before completion.",
      ],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveStrategicPlan(plan);
    await this.audit({
      eventType: "STRATEGIC_PLAN_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Advisor produced an advisory strategic plan.",
      requestId: input.requestId,
      metadata: { goalId: goal.id, planId: plan.id, advisoryOnly: true },
    });
    return plan;
  }

  async recommendations(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listRecommendations(ownerId, 100);
  }

  async risks(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listRisks(ownerId, 100);
  }

  async repositoryHealth(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listRepositoryHealth(ownerId, 100);
  }

  async architectureHealth(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listArchitectureHealth(ownerId, 100);
  }

  technicalDebt(ownerId: string) {
    return this.store.listTechnicalDebt(ownerId, 100);
  }

  async roadmaps(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listRoadmaps(ownerId, 50);
  }

  async releaseReadiness(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return this.store.listReleaseAssessments(ownerId, 50);
  }

  async metrics(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return (await this.store.latestMetrics(ownerId)) ?? this.calculateMetrics(ownerId);
  }

  async simulate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }): Promise<SimulationRunRecord> {
    const body: CreateScenarioSimulationRequest =
      CreateScenarioSimulationRequestSchema.parse(input.body);
    const repositories = await this.repositories.listRepositories(input.ownerId);
    const affectedRepositories =
      body.repositoryIds.length === 0
        ? repositories.map((repository) => repository.id)
        : body.repositoryIds;
    const effort = effortFor(body.scenario, affectedRepositories.length);
    const risk = effort === "large" ? "high" : effort === "medium" ? "medium" : "low";
    const now = this.now().toISOString();
    const simulation: SimulationRunRecord = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      scenario: body.scenario,
      affectedFilesEstimate:
        effort === "large"
          ? 18 + affectedRepositories.length * 6
          : effort === "medium"
            ? 8
            : 3,
      affectedRepositories,
      risk,
      migrationEffort:
        effort === "large"
          ? "Expect phased migration with explicit checkpoints."
          : "Expect a bounded change if semantic evidence confirms the scope.",
      testingEffort:
        "Run impacted unit tests, type checking, linting, build validation, and any repository-specific validation profiles.",
      deploymentSteps: [
        "Review advisory simulation.",
        "Create an approved workflow if the owner wants to proceed.",
        "Validate changes in the controlled execution pipeline.",
        "Perform deployment readiness assessment before release.",
      ],
      rollbackComplexity: risk,
      confidence: repositories.length === 0 ? 0.45 : 0.72,
      evidence: this.evidence(
        "manual",
        "simulation-request",
        "Scenario supplied by authenticated owner.",
      ),
      createdAt: now,
    };
    await this.store.saveSimulation(simulation);
    await this.audit({
      eventType: "SCENARIO_SIMULATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Advisor simulated a proposed engineering scenario.",
      requestId: input.requestId,
      metadata: {
        simulationId: simulation.id,
        affectedRepositoryCount: affectedRepositories.length,
        advisoryOnly: true,
      },
    });
    return simulation;
  }

  async ensureBaseline(ownerId: string) {
    const [repositories, existingRecommendations, existingRoadmaps] = await Promise.all(
      [
        this.repositories.listRepositories(ownerId),
        this.store.listRecommendations(ownerId, 1),
        this.store.listRoadmaps(ownerId, 1),
      ],
    );
    if (existingRecommendations.length > 0 && existingRoadmaps.length > 0) return;

    const now = this.now().toISOString();
    for (const repository of repositories) {
      const generation = await this.repositories.activeGeneration(repository.id);
      const health: RepositoryHealthRecord = {
        id: crypto.randomUUID(),
        ownerId,
        repositoryId: repository.id,
        repositoryName: repository.workspaceId,
        architecture: generation ? 78 : 50,
        documentation: generation ? 68 : 45,
        tests: generation ? 64 : 40,
        performance: 70,
        security: 72,
        complexity: generation ? 66 : 45,
        dependencies: generation ? 70 : 50,
        maintainability: generation ? 72 : 50,
        technicalDebt: generation ? 63 : 45,
        overall: generation ? 69 : 47,
        trend: generation ? "stable" : "unknown",
        evidence: this.evidence(
          "repository",
          repository.id,
          generation
            ? `Repository generation ${generation.generation} is available for advisor scoring.`
            : "Repository has not published an indexed generation yet.",
        ),
        assessedAt: now,
      };
      await this.store.saveRepositoryHealth(health);
      await this.store.saveArchitectureHealth({
        id: crypto.randomUUID(),
        ownerId,
        repositoryId: repository.id,
        score: health.architecture,
        drift: generation ? "low" : "unknown",
        layerViolations: 0,
        dependencyViolations: 0,
        couplingRisk: generation ? "medium" : "low",
        recommendations: [
          "Use semantic dependency graphs before planning cross-layer changes.",
          "Keep code modification behind the existing approval workflow.",
        ],
        evidence: health.evidence,
        assessedAt: now,
      });
    }

    if (existingRecommendations.length === 0) {
      const recommendations: RecommendationRecord[] = [
        {
          id: crypto.randomUUID(),
          ownerId,
          repositoryId: repositories[0]?.id ?? null,
          category: "architecture",
          title: "Review architecture health before large feature work",
          recommendation:
            "Use the advisor simulation and impact analysis before starting high-risk workflows so implementation tasks stay small and approval checkpoints remain clear.",
          priority: "high",
          estimatedImpact:
            "Reduces architecture drift and surprise validation failures.",
          estimatedEffort: "small",
          confidence: repositories.length === 0 ? 0.5 : 0.78,
          dependencies: ["Repository indexing", "Semantic code intelligence"],
          evidence: this.evidence(
            "architecture",
            "phase-10-baseline",
            "Advisor recommendation generated from existing repository intelligence capabilities.",
          ),
          status: "open",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          ownerId,
          repositoryId: null,
          category: "security",
          title: "Keep strategic intelligence advisory-only",
          recommendation:
            "Treat goals, plans, simulations, and recommendations as decision support. Do not let them approve patches, execute validations, or trigger integrations by themselves.",
          priority: "critical",
          estimatedImpact: "Preserves the human approval and audit model.",
          estimatedEffort: "small",
          confidence: 0.95,
          dependencies: ["Policy engine", "Approval engine", "Audit logging"],
          evidence: this.evidence(
            "decision",
            "phase-10-boundary",
            "Phase 10 explicitly forbids autonomous actions without approval.",
          ),
          status: "open",
          createdAt: now,
          updatedAt: now,
        },
      ];
      for (const recommendation of recommendations) {
        await this.store.saveRecommendation(recommendation);
        await this.audit({
          eventType: "ENGINEERING_RECOMMENDATION_CREATED",
          ownerId,
          ipAddress: "system",
          outcome: "SUCCESS",
          reason: "Advisor generated a baseline advisory recommendation.",
          requestId: "advisor-baseline",
          metadata: {
            recommendationId: recommendation.id,
            advisoryOnly: true,
          },
        });
      }
    }

    if (existingRoadmaps.length === 0) {
      const roadmapId = crypto.randomUUID();
      const roadmap: RoadmapRecord = {
        id: roadmapId,
        ownerId,
        title: "Engineering operating-system roadmap",
        horizon: "90_days",
        summary:
          "A living advisory roadmap for improving reliability, architecture clarity, test coverage, and release confidence.",
        items: [
          {
            id: crypto.randomUUID(),
            roadmapId,
            ownerId,
            title: "Stabilise repository health baselines",
            phase: "Current state",
            priority: "high",
            status: "not_started",
            dependencies: [],
            estimatedEffort: "medium",
            order: 0,
          },
          {
            id: crypto.randomUUID(),
            roadmapId,
            ownerId,
            title: "Review critical recommendations",
            phase: "Critical fixes",
            priority: "critical",
            status: "not_started",
            dependencies: [],
            estimatedEffort: "small",
            order: 1,
          },
          {
            id: crypto.randomUUID(),
            roadmapId,
            ownerId,
            title: "Run release readiness before major milestones",
            phase: "Release",
            priority: "medium",
            status: "not_started",
            dependencies: [],
            estimatedEffort: "small",
            order: 2,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      await this.store.saveRoadmap(roadmap);
    }

    const release: ReleaseAssessmentRecord = {
      id: crypto.randomUUID(),
      ownerId,
      repositoryId: repositories[0]?.id ?? null,
      releaseName: "Current workspace",
      status: repositories.length === 0 ? "blocked" : "needs_work",
      score: repositories.length === 0 ? 35 : 68,
      checks: [
        {
          name: "Repository baseline",
          status: repositories.length === 0 ? "fail" : "pass",
          summary:
            repositories.length === 0
              ? "No repositories are registered for release assessment."
              : "Repository metadata exists for advisory assessment.",
        },
        {
          name: "Human approval",
          status: "pass",
          summary: "Release advice remains advisory and cannot deploy automatically.",
        },
      ],
      recommendation:
        repositories.length === 0
          ? "Register and index a repository before considering release readiness."
          : "Run validation profiles and review open recommendations before release.",
      assessedAt: now,
    };
    await this.store.saveReleaseAssessment(release);
    await this.audit({
      eventType: "ENGINEERING_HEALTH_ASSESSED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason: "Advisor refreshed baseline engineering health.",
      requestId: "advisor-baseline",
      metadata: { advisoryOnly: true, repositoryCount: repositories.length },
    });
  }

  async calculateMetrics(
    ownerId: string,
    input?: {
      goals: EngineeringGoalRecord[];
      recommendations: RecommendationRecord[];
      risks: Awaited<ReturnType<AdvisorStore["listRisks"]>>;
      repositoryHealth: RepositoryHealthRecord[];
      technicalDebt: Awaited<ReturnType<AdvisorStore["listTechnicalDebt"]>>;
      releaseAssessments: ReleaseAssessmentRecord[];
    },
  ): Promise<EngineeringMetricsRecord> {
    const values =
      input ??
      ({
        goals: await this.store.listGoals(ownerId, 100),
        recommendations: await this.store.listRecommendations(ownerId, 100),
        risks: await this.store.listRisks(ownerId, 100),
        repositoryHealth: await this.store.listRepositoryHealth(ownerId, 100),
        technicalDebt: await this.store.listTechnicalDebt(ownerId, 100),
        releaseAssessments: await this.store.listReleaseAssessments(ownerId, 20),
      } satisfies NonNullable<Parameters<typeof this.calculateMetrics>[1]>);
    const metrics: EngineeringMetricsRecord = {
      id: crypto.randomUUID(),
      ownerId,
      activeGoals: values.goals.filter((goal) =>
        ["planned", "active", "blocked"].includes(goal.status),
      ).length,
      openRecommendations: values.recommendations.filter(
        (recommendation) => recommendation.status === "open",
      ).length,
      openRisks: values.risks.filter((risk) => risk.status === "open").length,
      trackedDebtItems: values.technicalDebt.length,
      averageRepositoryHealth: scoreAverage(
        values.repositoryHealth.map((health) => health.overall),
      ),
      releaseReadiness: values.releaseAssessments[0]?.status ?? "blocked",
      recordedAt: this.now().toISOString(),
    };
    await this.store.saveMetrics(metrics);
    return metrics;
  }

  evidence(
    sourceType: AdvisorEvidence["sourceType"],
    reference: string,
    summary: string,
  ): AdvisorEvidence[] {
    return [
      {
        sourceType,
        reference,
        summary,
        observedAt: this.now().toISOString(),
      },
    ];
  }
}
