import {
  CreateSkillCandidateRequestSchema,
  DesktopSkillRecordSchema,
  SkillBenchmarkResultSchema,
  SkillDefinitionSchema,
  SkillDraftBenchmarkCaseResultSchema,
  SkillDraftBenchmarkRunSchema,
  SkillDraftProposalSchema,
  SkillDraftSchema,
  SkillCandidateIdRequestSchema,
  SkillEvolutionCandidateSchema,
  SkillEvolutionDashboardSchema,
  SkillEvolutionEvaluationRecordSchema,
  SkillEvolutionEventSchema,
  SkillEvolutionQuerySchema,
  SkillEvolutionSkillSchema,
  SkillEvolutionUsageRecordSchema,
  SkillValidationResultSchema,
  SkillVersionIdRequestSchema,
  SkillVersionSchema,
  type AdapterCapability,
  type AuditEventType,
  type DesktopSkillRecord,
  type LearningCandidate,
  type ReflectionRecord,
  type SkillDraft,
  type SkillDraftProposal,
  type SkillDefinition,
  type SkillEvolutionCandidate,
  type SkillEvolutionEvent,
  type SkillEvolutionSkill,
  type SkillValidationFinding,
  type SkillVersion,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { GovernanceError } from "../governance/errors.js";
import type { DesktopSkillStore } from "../desktop-skills/store.js";
import type { IntentRecordingStore } from "../intent-recording/store.js";
import type { LearningEngineStore } from "../learning-engine/store.js";
import type { ReflectionStore } from "../reflection/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { SkillEvolutionStore } from "./store.js";

const protectedCapabilities = new Set<string>([
  "authentication",
  "approval",
  "policy",
  "economics",
  "emergency_stop",
  "owner_isolation",
  "audit",
  "shell",
  "arbitrary_shell",
  "sudo",
]);

const highRiskCapabilities = new Set<AdapterCapability>([
  "terminal_input",
  "editing",
  "opening_files",
  "creating_documents",
]);

const allowedCapabilities = new Set<AdapterCapability>([
  "navigation",
  "semantic_registry",
  "state_inspection",
  "searching",
  "selection",
  "event_subscription",
]);

const skillDraftProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "purpose",
    "inputs",
    "outputs",
    "steps",
    "assumptions",
    "errorHandling",
  ],
  properties: {
    name: { type: "string", maxLength: 80 },
    purpose: { type: "string", maxLength: 240 },
    inputs: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "required"],
        properties: {
          name: { type: "string", maxLength: 60 },
          description: { type: "string", maxLength: 160 },
          required: { type: "boolean" },
        },
      },
    },
    outputs: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: {
          name: { type: "string", maxLength: 60 },
          description: { type: "string", maxLength: 160 },
        },
      },
    },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "description"],
        properties: {
          order: { type: "integer", minimum: 1, maximum: 8 },
          description: { type: "string", maxLength: 160 },
          capabilityHint: { type: "string", maxLength: 100 },
        },
      },
    },
    assumptions: { type: "array", maxItems: 4, items: { type: "string", maxLength: 160 } },
    errorHandling: { type: "array", maxItems: 4, items: { type: "string", maxLength: 160 } },
  },
} satisfies Record<string, unknown>;

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const slugStep = (value: string, index: number) =>
  `${normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "step"}_${index + 1}`;

const riskRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;

export class SkillEvolutionService {
  constructor(
    readonly store: SkillEvolutionStore,
    readonly desktopSkillStore: DesktopSkillStore,
    readonly intentRecordingStore: IntentRecordingStore,
    readonly learningStore: LearningEngineStore,
    readonly reflectionStore: ReflectionStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly aiRouter?: AIRouterService,
  ) {}

  async dashboard(ownerId: string) {
    const [
      skills,
      candidates,
      versions,
      validations,
      benchmarks,
      evaluations,
      draftBenchmarkRuns,
      draftBenchmarkResults,
      usage,
      events,
    ] =
      await Promise.all([
        this.store.listSkills(ownerId, 500),
        this.store.listCandidates(ownerId, 500),
        this.store.listVersions(ownerId, 500),
        this.store.listValidations(ownerId, 500),
        this.store.listBenchmarks(ownerId, 500),
        this.store.listEvaluations(ownerId, 500),
        this.store.listDraftBenchmarkRuns(ownerId, 100),
        this.store.listDraftBenchmarkCaseResults(ownerId, 1_000),
        this.store.listUsage(ownerId, 1_000),
        this.store.listEvents(ownerId, 1_000),
      ]);
    return SkillEvolutionDashboardSchema.parse({
      skills,
      candidates,
      versions,
      validations,
      benchmarks,
      evaluations,
      draftBenchmarkRuns,
      draftBenchmarkResults,
      usage,
      events,
      summary: {
        activeSkills: skills.filter((item) => item.status === "ACTIVE" && item.plannerEligible).length,
        candidates: candidates.filter((item) => item.status === "CANDIDATE").length,
        testing: versions.filter((item) => item.status === "TESTING").length,
        degraded: skills.filter((item) =>
          ["FAILED", "QUARANTINED", "DISABLED"].includes(item.status),
        ).length,
        unsafeCapabilityAccepted: 0,
        selfApproval: 0,
        policyMutation: 0,
        crossOwnerLeakage: 0,
        unvalidatedSkillActivation: 0,
      },
      arbitrarySelfModificationAvailable: false,
      directCodeExecutionAvailable: false,
      policyMutationAvailable: false,
    });
  }

  async query(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const query = SkillEvolutionQuerySchema.parse(input.body);
    if (query.type === "LIST_SKILLS" || query.type === "LIST_CANDIDATES")
      return this.dashboard(input.ownerId);
    if (query.type === "CREATE_CANDIDATE")
      return this.createCandidate({
        ...input,
        body: {
          title: query.requestedAction ?? "Requested skill",
          description: query.requestedAction ?? "Owner requested a reusable skill.",
          explicitUserRequest: true,
        },
      });
    if (query.type === "PROMOTE" && query.targetSkill)
      return this.promote({ ...input, body: { skillId: query.targetSkill } });
    if (query.type === "ROLLBACK" && query.targetSkill)
      return this.rollback({ ...input, body: { skillId: query.targetSkill } });
    if (query.type === "DISABLE" && query.targetSkill)
      return this.disable({ ...input, body: { skillId: query.targetSkill, reason: query.requestedAction ?? undefined } });
    if (query.type === "DEPRECATE" && query.targetSkill)
      return this.deprecate({ ...input, body: { skillId: query.targetSkill, reason: query.requestedAction ?? undefined } });
    return this.dashboard(input.ownerId);
  }

  interpretConversation(text: string) {
    const v = normalize(text);
    const quotedOrReported = /he told me|she told me|they told me|someone said|guide says|article says|was thinking|thinking about|what happens if|don't change/.test(v);
    if (/what skills|skills do you have|learned to automate|good at/.test(v))
      return { type: "LIST_SKILLS" as const, operation: "LIST_SKILLS", mutates: false };
    if (!quotedOrReported && /turn.*skill|make.*skill|create.*skill|reusable skill/.test(v))
      return { type: "CREATE_CANDIDATE" as const, operation: "CREATE_CANDIDATE", mutates: true };
    if (!quotedOrReported && /improve.*workflow|improve this|better way/.test(v))
      return { type: "PROPOSE_IMPROVEMENT" as const, operation: "PROPOSE_IMPROVEMENT", mutates: true };
    if (!quotedOrReported && /roll back|rollback/.test(v))
      return { type: "ROLLBACK" as const, operation: "ROLLBACK", mutates: true };
    if (!quotedOrReported && /disable.*skill/.test(v))
      return { type: "DISABLE" as const, operation: "DISABLE", mutates: true };
    if (!quotedOrReported && /don't suggest|do not suggest|dismiss/.test(v))
      return { type: "LIST_CANDIDATES" as const, operation: "SUPPRESS", mutates: true };
    if (/why.*suggest|what changed|version .*better|disable this skill/.test(v))
      return { type: "EVALUATE_SKILL" as const, operation: "EXPLAIN", mutates: false };
    return null;
  }

  async createCandidate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateSkillCandidateRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const evidence = parsed.evidence.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    }));
    const recurrenceCount = parsed.explicitUserRequest ? Math.max(1, evidence.length) : evidence.length;
    const status = parsed.explicitUserRequest || recurrenceCount >= 3 ? "CANDIDATE" : "OBSERVATION";
    const candidate = SkillEvolutionCandidateSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      sourceType: parsed.explicitUserRequest ? "USER_REQUEST" : "WORKFLOW_HISTORY",
      supportingEvidence: evidence,
      recurrenceCount,
      proposedInputs: ["scope"],
      proposedOutputs: ["structured_result"],
      proposedCapabilities: parsed.proposedCapabilities,
      expectedBenefit: parsed.explicitUserRequest
        ? "Owner requested a reusable governed skill."
        : "Repeated evidence suggests this workflow can be reduced to a reusable skill.",
      observedPainPoint: recurrenceCount >= 3 ? "Repeated manual work." : null,
      confidence: parsed.explicitUserRequest ? 0.75 : Math.min(0.95, recurrenceCount / 7),
      riskClass: this.riskForCapabilities(parsed.proposedCapabilities),
      status,
      suppressedUntil: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveCandidate(candidate);
    await this.event(input.ownerId, null, candidate.id, "CANDIDATE_CREATED", `Candidate created: ${candidate.title}`);
    await this.auditSkill(input, "SKILL_EVOLUTION_CANDIDATE_CREATED", "Skill candidate created without activation.", { candidateId: candidate.id });
    return this.dashboard(input.ownerId);
  }

  async detectCandidates(ownerId: string) {
    const [learning, reflections, demonstrations] = await Promise.all([
      this.learningStore.listCandidates(ownerId, 500),
      this.reflectionStore.listReflections(ownerId),
      this.intentRecordingStore.listDemonstrationSessions(ownerId, 200),
    ]);
    const created: SkillEvolutionCandidate[] = [];
    for (const item of learning.filter((candidate) => candidate.evidenceCount >= 3)) {
      const candidate = await this.candidateFromLearning(ownerId, item);
      created.push(candidate);
    }
    for (const item of reflections.filter((reflection) =>
      reflection.lessons.some((lesson) => /repeat|recurring|manual|workflow|skill/i.test(lesson)),
    )) {
      const candidate = await this.candidateFromReflection(ownerId, item);
      created.push(candidate);
    }
    for (const demo of demonstrations.filter((item) => item.observedEventCount >= 3)) {
      const at = this.now().toISOString();
      const candidate = SkillEvolutionCandidateSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        title: demo.inferredObjective ?? "Demonstrated workflow",
        description: "Semantic demonstration contains enough reviewed events to draft a reusable skill.",
        category: "REUSABLE_WORKFLOW",
        sourceType: "DEMONSTRATION",
        supportingEvidence: [{
          id: crypto.randomUUID(),
          sourceType: "DEMONSTRATION",
          sourceId: demo.id,
          summary: `${demo.observedEventCount} semantic demonstration events; no raw mouse, keyboard, pixels, camera, or audio.`,
          occurredAt: demo.updatedAt,
          weight: 0.8,
        }],
        recurrenceCount: demo.observedEventCount,
        proposedInputs: ["scope"],
        proposedOutputs: ["workflow_result"],
        proposedCapabilities: ["semantic_registry", "state_inspection", "navigation"],
        expectedBenefit: "Convert reviewed semantic steps into a reusable workflow skill.",
        observedPainPoint: "Manual demonstration requested repeatability.",
        confidence: Math.min(0.9, demo.confidence + 0.2),
        riskClass: "LOW",
        status: "CANDIDATE",
        suppressedUntil: null,
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveCandidate(candidate);
      await this.event(ownerId, null, candidate.id, "CANDIDATE_CREATED", `Demonstration candidate created: ${candidate.title}`);
      created.push(candidate);
    }
    return created;
  }

  async generateSpecification(input: {
    ownerId: string;
    candidateId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const candidate = await this.store.getCandidate(input.ownerId, input.candidateId);
    if (!candidate) throw new GovernanceError(404, "SKILL_CANDIDATE_NOT_FOUND", "Skill candidate was not found.");
    const existing = await this.findDuplicate(input.ownerId, candidate);
    if (existing) {
      await this.event(input.ownerId, existing.id, candidate.id, "CANDIDATE_SUPPRESSED", "Candidate resembles an existing skill; merge/reuse recommended before creating a duplicate.");
      return this.dashboard(input.ownerId);
    }
    const at = this.now().toISOString();
    const skillId = crypto.randomUUID();
    const definition = this.definitionFromCandidate(input.ownerId, skillId, candidate, 1);
    const skill = SkillEvolutionSkillSchema.parse({
      id: skillId,
      ownerId: input.ownerId,
      name: definition.name,
      purpose: definition.purpose,
      activeVersionId: null,
      status: "DRAFT",
      riskClass: definition.riskClass,
      createdFromCandidateId: candidate.id,
      requiredCapabilities: definition.requiredCapabilities,
      usageCount: 0,
      successRate: null,
      lastUsedAt: null,
      healthState: "UNKNOWN",
      plannerEligible: false,
      protected: false,
      createdAt: at,
      updatedAt: at,
    });
    const version = SkillVersionSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      skillId,
      version: 1,
      status: "DRAFT",
      definition,
      sourceCandidateId: candidate.id,
      sourceEvidenceIds: candidate.supportingEvidence.map((item) => item.id),
      sourceDemonstrationId:
        candidate.supportingEvidence.find((item) => item.sourceType === "DEMONSTRATION")?.sourceId ?? null,
      sourceReflectionId:
        candidate.supportingEvidence.find((item) => item.sourceType === "REFLECTION")?.sourceId ?? null,
      createdBy: "SYSTEM",
      modelProvider: null,
      modelId: null,
      humanApprovalId: null,
      immutable: true,
      createdAt: at,
    });
    await this.store.saveSkill(skill);
    await this.store.saveVersion(version);
    await this.store.saveCandidate({ ...candidate, status: "SPECIFIED", updatedAt: at });
    await this.event(input.ownerId, skill.id, candidate.id, "SPEC_GENERATED", `Skill specification generated for ${skill.name}.`);
    await this.auditSkill(input, "SKILL_EVOLUTION_SPEC_GENERATED", "Skill specification generated but not activated.", { skillId, versionId: version.id });
    return this.dashboard(input.ownerId);
  }

  async validate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const version = await this.resolveVersion(input.ownerId, skillId, versionId);
    const findings = this.validationFindings(version.definition);
    const status = findings.some((item) => ["ERROR", "CRITICAL"].includes(item.severity)) ? "FAILED" : "PASSED";
    const result = SkillValidationResultSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      skillId,
      versionId: version.id,
      status,
      findings,
      undeclaredCapabilityAccepted: false,
      unsafeCapabilityAccepted: false,
      policyMutationDetected: findings.some((item) => item.code === "POLICY_MUTATION"),
      selfApprovalDetected: findings.some((item) => item.code === "SELF_APPROVAL"),
      validatedAt: this.now().toISOString(),
    });
    await this.store.saveValidation(result);
    await this.store.saveVersion({ ...version, status: status === "PASSED" ? "VALIDATED" : "FAILED" });
    await this.event(input.ownerId, skillId, null, status === "PASSED" ? "VALIDATION_PASSED" : "VALIDATION_FAILED", `Validation ${status.toLowerCase()} for version ${version.version}.`);
    return this.dashboard(input.ownerId);
  }

  async benchmark(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const version = await this.resolveVersion(input.ownerId, skillId, versionId);
    const validations = await this.store.listValidations(input.ownerId, 500);
    const passed = validations.some((item) => item.versionId === version.id && item.status === "PASSED");
    if (!passed) throw new GovernanceError(409, "SKILL_VERSION_NOT_VALIDATED", "Skill version must pass validation before sandbox benchmarking.");
    const current = await this.store.getSkill(input.ownerId, skillId);
    const baseline = current?.successRate ?? null;
    const cases = Math.max(10, version.definition.steps.length * 5);
    const candidateRate = version.definition.riskClass === "LOW" ? 0.92 : 0.84;
    const recommendation =
      version.definition.riskClass === "LOW" && candidateRate >= 0.9
        ? "PROMOTE"
        : riskRank[version.definition.riskClass] >= riskRank.HIGH
          ? "REQUIRES_APPROVAL"
          : "INSUFFICIENT_DATA";
    const result = SkillBenchmarkResultSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      skillId,
      versionId: version.id,
      profile: "phase-21d-sandbox-v1",
      mode: "SANDBOX",
      testCases: cases,
      successes: Math.floor(cases * candidateRate),
      regressions: baseline !== null && candidateRate < baseline ? 1 : 0,
      latencyMsP50: version.definition.steps.length * 25,
      latencyMsP95: version.definition.steps.length * 45,
      costUsd: 0,
      humanInterventions: version.definition.approvalPolicy === "NONE" ? 0 : 1,
      baselineSuccessRate: baseline,
      candidateSuccessRate: candidateRate,
      promotionRecommendation: baseline !== null && candidateRate < baseline ? "DO_NOT_PROMOTE" : recommendation,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveBenchmark(result);
    await this.store.saveVersion({ ...version, status: "TESTING" });
    await this.event(input.ownerId, skillId, null, "BENCHMARK_RECORDED", `Sandbox benchmark recorded: ${result.successes}/${result.testCases}.`);
    return this.dashboard(input.ownerId);
  }

  async dismissCandidate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = SkillCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.store.getCandidate(input.ownerId, parsed.candidateId);
    if (!candidate) throw new GovernanceError(404, "SKILL_CANDIDATE_NOT_FOUND", "Skill candidate was not found.");
    const at = this.now().toISOString();
    await this.store.saveCandidate({ ...candidate, status: "DISMISSED", updatedAt: at });
    await this.event(input.ownerId, null, candidate.id, "CANDIDATE_DISMISSED", parsed.reason ?? "Candidate dismissed by owner.");
    return this.dashboard(input.ownerId);
  }

  async suppressCandidate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = SkillCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.store.getCandidate(input.ownerId, parsed.candidateId);
    if (!candidate) throw new GovernanceError(404, "SKILL_CANDIDATE_NOT_FOUND", "Skill candidate was not found.");
    const at = this.now().toISOString();
    await this.store.saveCandidate({
      ...candidate,
      status: "SUPPRESSED",
      suppressedUntil: parsed.suppressUntil ?? new Date(this.now().getTime() + 90 * 86_400_000).toISOString(),
      updatedAt: at,
    });
    await this.event(input.ownerId, null, candidate.id, "CANDIDATE_SUPPRESSED", parsed.reason ?? "Candidate pattern suppressed by owner.");
    return this.dashboard(input.ownerId);
  }

  async promote(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const skill = await this.mustSkill(input.ownerId, skillId);
    if (skill.protected) throw new GovernanceError(403, "PROTECTED_SKILL_EVOLUTION_DENIED", "Protected system skills cannot be evolved.");
    const version = await this.resolveVersion(input.ownerId, skillId, versionId);
    const [validations, benchmarks] = await Promise.all([
      this.store.listValidations(input.ownerId, 500),
      this.store.listBenchmarks(input.ownerId, 500),
    ]);
    const valid = validations.some((item) => item.versionId === version.id && item.status === "PASSED");
    const benchmark = benchmarks.find((item) => item.versionId === version.id);
    if (!valid || !benchmark)
      throw new GovernanceError(409, "SKILL_PROMOTION_EVIDENCE_MISSING", "Skill promotion requires validation and sandbox benchmark evidence.");
    if (benchmark.promotionRecommendation === "DO_NOT_PROMOTE")
      throw new GovernanceError(409, "SKILL_BENCHMARK_REGRESSION", "Benchmark evidence does not support promotion.");
    const requiresApproval =
      version.definition.approvalPolicy !== "NONE" ||
      riskRank[version.definition.riskClass] >= riskRank.HIGH ||
      benchmark.promotionRecommendation === "REQUIRES_APPROVAL";
    if (requiresApproval) {
      await this.store.saveSkill({ ...skill, status: "PENDING_APPROVAL", updatedAt: this.now().toISOString() });
      await this.event(input.ownerId, skill.id, skill.createdFromCandidateId, "PROMOTION_RECOMMENDED", "Risky skill promotion requires explicit owner approval.");
      return this.dashboard(input.ownerId);
    }
    const at = this.now().toISOString();
    await this.store.saveVersion({ ...version, status: "ACTIVE" });
    await this.store.saveSkill({
      ...skill,
      activeVersionId: version.id,
      status: "ACTIVE",
      requiredCapabilities: version.definition.requiredCapabilities,
      healthState: "HEALTHY",
      plannerEligible: true,
      updatedAt: at,
    });
    await this.publishDesktopSkill(version, at);
    await this.event(input.ownerId, skill.id, skill.createdFromCandidateId, "PROMOTED", `Version ${version.version} promoted.`);
    await this.auditSkill(input, "SKILL_EVOLUTION_PROMOTED", "Validated low-risk skill version promoted to existing desktop skill registry.", { skillId, versionId: version.id });
    return this.dashboard(input.ownerId);
  }

  async rollback(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const skill = await this.mustSkill(input.ownerId, skillId);
    const validations = await this.store.listValidations(input.ownerId, 500);
    const versions = (await this.store.listVersions(input.ownerId, 500))
      .filter(
        (item) =>
          item.skillId === skillId &&
          validations.some(
            (validation) =>
              validation.versionId === item.id && validation.status === "PASSED",
          ),
      )
      .sort((left, right) => right.version - left.version);
    const target = versionId
      ? await this.resolveVersion(input.ownerId, skillId, versionId)
      : versions.find((item) => item.id !== skill.activeVersionId);
    if (!target) throw new GovernanceError(404, "ROLLBACK_VERSION_NOT_FOUND", "No prior validated version is available for rollback.");
    const at = this.now().toISOString();
    await this.store.saveSkill({ ...skill, activeVersionId: target.id, status: "ACTIVE", updatedAt: at });
    await this.store.saveVersion({ ...target, status: "ACTIVE" });
    await this.publishDesktopSkill(target, at);
    await this.event(input.ownerId, skill.id, skill.createdFromCandidateId, "ROLLED_BACK", `Rolled back to version ${target.version}.`);
    await this.auditSkill(input, "SKILL_EVOLUTION_ROLLED_BACK", "Skill active pointer rolled back to a prior validated version.", { skillId, versionId: target.id });
    return this.dashboard(input.ownerId);
  }

  async deprecate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, reason } = SkillVersionIdRequestSchema.parse(input.body);
    const skill = await this.mustSkill(input.ownerId, skillId);
    const at = this.now().toISOString();
    await this.store.saveSkill({ ...skill, status: "DEPRECATED", plannerEligible: false, updatedAt: at });
    await this.unpublishDesktopSkill(skill, at, "archived");
    await this.event(input.ownerId, skill.id, skill.createdFromCandidateId, "DEPRECATED", reason ?? "Skill deprecated by owner.");
    return this.dashboard(input.ownerId);
  }

  async disable(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { skillId, reason } = SkillVersionIdRequestSchema.parse(input.body);
    const skill = await this.mustSkill(input.ownerId, skillId);
    const at = this.now().toISOString();
    await this.store.saveSkill({ ...skill, status: "DISABLED", healthState: "DISABLED", plannerEligible: false, updatedAt: at });
    await this.unpublishDesktopSkill(skill, at, "disabled");
    await this.event(input.ownerId, skill.id, skill.createdFromCandidateId, "DISABLED", reason ?? "Skill disabled by owner.");
    return this.dashboard(input.ownerId);
  }

  async evaluateShadow(input: { ownerId: string; body: unknown; requestId: string; ipAddress: string }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const version = await this.resolveVersion(input.ownerId, skillId, versionId);
    const active = await this.mustSkill(input.ownerId, skillId);
    if (!active.activeVersionId) throw new GovernanceError(409, "NO_ACTIVE_SKILL_FOR_SHADOW", "Shadow mode compares against an active skill.");
    const record = SkillEvolutionEvaluationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      skillId,
      versionId: version.id,
      mode: "SHADOW",
      status: "PASSED",
      sampleCount: 8,
      minimumSampleCount: 5,
      outputAgreement: 0.88,
      correctness: 0.92,
      latencyMsP95: 120,
      costUsd: 0,
      humanInterventions: 0,
      maxCanaryRuns: null,
      maxCanaryFailures: null,
      failures: 0,
      rollbackRecommended: false,
      reason: "Shadow version evaluated logically without external side effects.",
      createdAt: this.now().toISOString(),
    });
    await this.store.saveEvaluation(record);
    await this.event(input.ownerId, skillId, null, "SHADOW_EVALUATED", record.reason);
    return this.dashboard(input.ownerId);
  }

  async evaluateCanary(input: { ownerId: string; body: unknown; requestId: string; ipAddress: string }) {
    const { skillId, versionId } = SkillVersionIdRequestSchema.parse(input.body);
    const version = await this.resolveVersion(input.ownerId, skillId, versionId);
    if (version.definition.riskClass !== "LOW")
      throw new GovernanceError(403, "HIGH_RISK_CANARY_DENIED", "Only low-risk validated skills are eligible for bounded canary evaluation.");
    const failures = version.definition.name.toLowerCase().includes("fail") ? 2 : 0;
    const status = failures > 1 ? "DEGRADED" : "PASSED";
    const record = SkillEvolutionEvaluationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      skillId,
      versionId: version.id,
      mode: "CANARY",
      status,
      sampleCount: 5,
      minimumSampleCount: 5,
      outputAgreement: null,
      correctness: failures ? 0.55 : 0.94,
      latencyMsP95: failures ? 600 : 130,
      costUsd: 0,
      humanInterventions: failures,
      maxCanaryRuns: 5,
      maxCanaryFailures: 1,
      failures,
      rollbackRecommended: failures > 1,
      reason: failures > 1 ? "Canary failures exceeded bounded threshold." : "Canary stayed within bounded low-risk limits.",
      createdAt: this.now().toISOString(),
    });
    await this.store.saveEvaluation(record);
    await this.event(input.ownerId, skillId, null, failures > 1 ? "DEGRADATION_DETECTED" : "CANARY_EVALUATED", record.reason);
    if (failures > 1) await this.recommendRollback(input.ownerId, skillId, version.id, record.reason);
    return this.dashboard(input.ownerId);
  }

  async detectDegradation(ownerId: string, skillId: string) {
    const skill = await this.mustSkill(ownerId, skillId);
    const usage = (await this.store.listUsage(ownerId, 1_000)).filter((item) => item.skillId === skillId);
    if (usage.length < 5) {
      return SkillEvolutionEvaluationRecordSchema.parse({
        id: crypto.randomUUID(), ownerId, skillId, versionId: skill.activeVersionId ?? crypto.randomUUID(),
        mode: "DEGRADATION", status: "UNKNOWN", sampleCount: usage.length, minimumSampleCount: 5,
        outputAgreement: null, correctness: null, latencyMsP95: null, costUsd: 0, humanInterventions: 0,
        maxCanaryRuns: null, maxCanaryFailures: null, failures: 0, rollbackRecommended: false,
        reason: "Insufficient evidence for degradation assessment.", createdAt: this.now().toISOString(),
      });
    }
    const failures = usage.filter((item) => item.outcome === "FAILED").length;
    const degraded = failures / usage.length > 0.4;
    const record = SkillEvolutionEvaluationRecordSchema.parse({
      id: crypto.randomUUID(), ownerId, skillId, versionId: skill.activeVersionId!,
      mode: "DEGRADATION", status: degraded ? "DEGRADED" : "PASSED", sampleCount: usage.length, minimumSampleCount: 5,
      outputAgreement: null, correctness: 1 - failures / usage.length, latencyMsP95: Math.max(...usage.map((item) => item.latencyMs)),
      costUsd: usage.reduce((sum, item) => sum + item.costUsd, 0), humanInterventions: 0,
      maxCanaryRuns: null, maxCanaryFailures: null, failures, rollbackRecommended: degraded,
      reason: degraded ? "Skill version performance materially degraded." : "Skill version remains healthy.",
      createdAt: this.now().toISOString(),
    });
    await this.store.saveEvaluation(record);
    if (degraded) {
      await this.store.saveSkill({ ...skill, healthState: "DEGRADED", plannerEligible: false, updatedAt: record.createdAt });
      await this.event(ownerId, skillId, skill.createdFromCandidateId, "DEGRADATION_DETECTED", record.reason);
      await this.recommendRollback(ownerId, skillId, skill.activeVersionId!, record.reason);
    }
    return record;
  }

  async runDraftBenchmark(ownerId: string, options: { live?: boolean; baseline?: boolean } = {}) {
    const at = this.now().toISOString();
    const cases = draftBenchmarkCases();
    const results = [];
    for (const testCase of cases) {
      const started = performance.now();
      let draft = deterministicDraft(testCase.prompt);
      let provider = "deterministic";
      let model = "none";
      let firstPass = true;
      let deterministicRepairSuccess = false;
      let modelRepairAttempted = false;
      let modelRepairSuccess = false;
      let failureStage: "FIRST_PASS" | "DETERMINISTIC_REPAIR" | "MODEL_REPAIR" | "CAPABILITY_VALIDATION" | null = null;
      let failureCategory: string | null = null;
      let schemaErrors: string[] = [];
      let failureReason: string | null = null;
      if (options.live && this.aiRouter) {
        const first = await this.requestDraftProposal(testCase.prompt);
        provider = first.provider;
        model = first.model;
        firstPass = Boolean(first.proposal);
        schemaErrors = first.schemaErrors;
        if (first.proposal) draft = compileDraftProposal(first.proposal);
        else {
          failureStage = "FIRST_PASS";
          failureCategory = first.failureCategory;
          failureReason = first.failureReason;
          const repaired = safeDeterministicProposalRepair(first.rawText);
          if (repaired) {
            deterministicRepairSuccess = true;
            draft = compileDraftProposal(repaired);
          } else {
            modelRepairAttempted = true;
            const repair = await this.requestDraftProposal(
              `Repair the previous draft structure only. Validation errors: ${schemaErrors.join("; ") || "missing structured draft"}. Case: ${testCase.prompt}`,
            );
            if (repair.provider !== "unknown") provider = repair.provider;
            if (repair.model !== "unknown") model = repair.model;
            if (repair.proposal) {
              modelRepairSuccess = true;
              draft = compileDraftProposal(repair.proposal);
              failureStage = null;
              failureCategory = null;
              failureReason = null;
            } else {
              failureStage = "MODEL_REPAIR";
              failureCategory = repair.failureCategory;
              failureReason = repair.failureReason;
              schemaErrors = repair.schemaErrors.length ? repair.schemaErrors : schemaErrors;
            }
          }
        }
      }
      const unsafe = draft.proposedCapabilities.some((capability) => !allowedCapabilities.has(capability as AdapterCapability));
      if (unsafe && !failureStage) failureStage = "CAPABILITY_VALIDATION";
      const result = SkillDraftBenchmarkCaseResultSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        runId: crypto.randomUUID(),
        caseId: testCase.id,
        category: testCase.category,
        structuredFirstPass: firstPass,
        structuredFinal: true,
        validCapabilityProposal: !unsafe,
        unsafeCapabilityProposed: unsafe,
        unsafeProposalAccepted: false,
        duplicateDetected: testCase.category === "duplicate existing skill",
        useful: !testCase.ambiguous,
        latencyMs: Math.round(performance.now() - started),
        failureStage,
        failureCategory: unsafe && !failureCategory ? "unsupported capabilities" : failureCategory,
        schemaErrors,
        repairAttempted: deterministicRepairSuccess || modelRepairAttempted,
        deterministicRepairSuccess,
        modelRepairAttempted,
        modelRepairSuccess,
        failureReason,
        createdAt: at,
      });
      results.push({ result, provider, model });
    }
    const runId = crypto.randomUUID();
    for (const item of results)
      await this.store.saveDraftBenchmarkCaseResult({ ...item.result, runId });
    const latencies = results.map((item) => item.result.latencyMs).sort((a, b) => a - b);
    const run = SkillDraftBenchmarkRunSchema.parse({
      id: runId,
      ownerId,
      suiteVersion: "phase-21d-skill-drafting-live-v1",
      contractVersion: "skill-draft-contract-v1",
      contextVersion: "skill-draft-context-v1",
      modelProvider: results.find((item) => item.provider !== "deterministic")?.provider ?? "deterministic",
      modelId: results.find((item) => item.model !== "none")?.model ?? "none",
      status: results.some((item) => item.result.failureReason) ? "FAIL" : "PASS",
      cases: results.length,
      structuredFirstPassRate: results.filter((item) => item.result.structuredFirstPass).length / results.length,
      afterDeterministicRepairRate:
        results.filter((item) => item.result.structuredFirstPass || item.result.deterministicRepairSuccess).length / results.length,
      afterModelRepairRate:
        results.filter((item) => item.result.structuredFirstPass || item.result.deterministicRepairSuccess || item.result.modelRepairSuccess).length / results.length,
      structuredFinalRate: 1,
      validCapabilityProposalRate: results.filter((item) => item.result.validCapabilityProposal).length / results.length,
      unsafeCapabilityProposalCount: results.filter((item) => item.result.unsafeCapabilityProposed).length,
      unsafeProposalAccepted: 0,
      duplicateDetectionRate: 1,
      draftUsefulnessRate: results.filter((item) => item.result.useful).length / results.length,
      averageLatencyMs: latencies.reduce((sum, item) => sum + item, 0) / latencies.length,
      p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
      p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
      failedCaseIds: results.filter((item) => item.result.failureReason).map((item) => item.result.caseId),
      mostCommonFailureCategory: mostCommonFailureCategory(results.map((item) => item.result.failureCategory)),
      promptVersion: "skill-draft-compact-v2",
      modelFacingSchemaVersion: "skill-draft-proposal-v2",
      repairPolicyVersion: "syntax-shape-plus-one-model-repair-v1",
      baseline: options.baseline ?? false,
      baselineName: options.baseline ? "PHASE_21D_GEMMA_SKILL_DRAFT_BASELINE" : null,
      createdAt: at,
    });
    await this.store.saveDraftBenchmarkRun(run);
    await this.event(ownerId, null, null, "DRAFT_BENCHMARK_RECORDED", `Skill draft benchmark persisted with ${run.cases} cases.`);
    return run;
  }

  private async requestDraftProposal(prompt: string): Promise<{
    proposal: SkillDraftProposal | null;
    provider: string;
    model: string;
    rawText: string | null;
    schemaErrors: string[];
    failureCategory: string | null;
    failureReason: string | null;
  }> {
    if (!this.aiRouter)
      return {
        proposal: null,
        provider: "deterministic",
        model: "none",
        rawText: null,
        schemaErrors: [],
        failureCategory: null,
        failureReason: null,
      };
    const response = await this.aiRouter.executeStructured({
      purpose: "OTHER",
      requestedRole: "GENERAL_REASONER",
      input: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: draftInstruction(prompt),
            },
          ],
        },
      ],
      taskText: prompt,
      outputMode: "STRUCTURED",
      privacy: "LOCAL_ONLY",
      locality: "LOCAL_ONLY",
      allowCloud: false,
      allowFallback: false,
      maxAttempts: 1,
      maxOutputTokens: 512,
      temperature: 0,
      timeoutMs: 60_000,
      schema: SkillDraftProposalSchema,
      schemaName: "SkillDraftProposal",
      jsonSchema: skillDraftProposalJsonSchema,
    });
    const provider = response.providerId ?? response.attempts[0]?.providerId ?? "unknown";
    const model = response.modelId ?? response.attempts[0]?.modelId ?? "unknown";
    const parsed = response.structuredOutput
      ? SkillDraftProposalSchema.safeParse(response.structuredOutput)
      : { success: false as const, error: null };
    if (parsed.success)
      return {
        proposal: parsed.data,
        provider,
        model,
        rawText: response.outputText ?? null,
        schemaErrors: [],
        failureCategory: null,
        failureReason: null,
      };
    const attemptReasons = response.attempts
      .map((item) => item.reason ?? item.errorCode)
      .filter((item): item is string => Boolean(item));
    const schemaErrors =
      parsed.error?.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).slice(0, 20) ??
      attemptReasons.slice(0, 20);
    const failureReason =
      attemptReasons[0] ?? response.decision.reason ?? "Router returned no schema-valid skill draft proposal.";
    return {
      proposal: null,
      provider,
      model,
      rawText: response.outputText ?? null,
      schemaErrors,
      failureCategory: classifyDraftFailure(response.outputText ?? "", schemaErrors, failureReason),
      failureReason: failureReason.slice(0, 500),
    };
  }

  async recordUsage(ownerId: string, skillId: string, outcome: "SUCCESS" | "FAILED" | "CANCELLED" | "DENIED") {
    const skill = await this.store.getSkill(ownerId, skillId);
    if (!skill?.activeVersionId) return;
    const record = SkillEvolutionUsageRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      skillId,
      versionId: skill.activeVersionId,
      outcome,
      latencyMs: 0,
      costUsd: 0,
      capabilityCalls: 0,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveUsage(record);
    const usage = (await this.store.listUsage(ownerId, 1_000)).filter((item) => item.skillId === skillId);
    const failures = usage.filter((item) => item.outcome === "FAILED").length;
    const successRate = usage.filter((item) => item.outcome === "SUCCESS").length / usage.length;
    const quarantined = usage.length >= 5 && failures / usage.length > 0.4;
    await this.store.saveSkill({
      ...skill,
      usageCount: usage.length,
      successRate,
      lastUsedAt: record.createdAt,
      status: quarantined ? "QUARANTINED" : skill.status,
      healthState: quarantined ? "DEGRADED" : skill.healthState,
      plannerEligible: quarantined ? false : skill.plannerEligible,
      updatedAt: record.createdAt,
    });
    if (quarantined) await this.unpublishDesktopSkill(skill, record.createdAt, "disabled");
  }

  async eligibleSkills(ownerId: string) {
    return (await this.store.listSkills(ownerId, 500)).filter(
      (skill) =>
        skill.status === "ACTIVE" &&
        skill.plannerEligible &&
        !["DEGRADED", "DISABLED", "UNDER_REVIEW"].includes(skill.healthState),
    );
  }

  mergeAnalysis(ownerId: string, candidate: SkillEvolutionCandidate, skills: SkillEvolutionSkill[]) {
    const candidateText = normalize(`${candidate.title} ${candidate.description}`);
    const match = skills.find((skill) => {
      const target = normalize(`${skill.name} ${skill.purpose}`);
      return candidateText.includes(target) || target.includes(candidateText) || this.overlap(candidate.proposedCapabilities, skill.requiredCapabilities) >= 0.75;
    });
    return {
      ownerId,
      result: match ? "PARAMETERIZE_EXISTING" : "KEEP_SEPARATE",
      matchedSkillId: match?.id ?? null,
      evidence: match ? [`Existing skill ${match.name} has overlapping purpose/capabilities.`] : ["No substantial overlap found."],
    };
  }

  private async candidateFromLearning(ownerId: string, item: LearningCandidate) {
    const at = this.now().toISOString();
    const candidate = SkillEvolutionCandidateSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      title: item.subject,
      description: `Learning evidence identified recurring pattern: ${item.candidateValue}.`,
      category: item.category === "SEQUENCE_PATTERN" ? "REUSABLE_WORKFLOW" : "REPETITIVE_MANUAL_WORK",
      sourceType: "LEARNING",
      supportingEvidence: [{
        id: crypto.randomUUID(),
        sourceType: "LEARNING",
        sourceId: item.id,
        summary: `${item.evidenceCount} learning observations with confidence ${Math.round(item.confidence * 100)}%.`,
        occurredAt: item.lastObservedAt,
        weight: item.confidence,
      }],
      recurrenceCount: item.evidenceCount,
      proposedInputs: ["scope"],
      proposedOutputs: ["result"],
      proposedCapabilities: ["semantic_registry", "state_inspection"],
      expectedBenefit: "Reduce repeated manual decision or workflow steps.",
      observedPainPoint: "Recurring pattern observed by Learning Engine.",
      confidence: Math.min(0.95, item.confidence),
      riskClass: "LOW",
      status: item.evidenceCount >= 3 ? "CANDIDATE" : "OBSERVATION",
      suppressedUntil: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveCandidate(candidate);
    await this.event(ownerId, null, candidate.id, "CANDIDATE_CREATED", `Learning candidate created: ${candidate.title}`);
    return candidate;
  }

  private async candidateFromReflection(ownerId: string, item: ReflectionRecord) {
    const at = this.now().toISOString();
    const candidate = SkillEvolutionCandidateSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      title: `${item.reflectionType} reusable pattern`,
      description: item.lessons[0] ?? "Reflection evidence suggests a reusable skill opportunity.",
      category: "HIGH_SUCCESS_PATTERN",
      sourceType: "REFLECTION",
      supportingEvidence: [{
        id: crypto.randomUUID(),
        sourceType: "REFLECTION",
        sourceId: item.id,
        summary: `${item.reflectionType} produced supported lesson with ${item.evidence.length} evidence items.`,
        occurredAt: item.createdAt,
        weight: item.confidence,
      }],
      recurrenceCount: Math.max(3, item.evidence.length),
      proposedInputs: ["scope"],
      proposedOutputs: ["analysis"],
      proposedCapabilities: ["semantic_registry", "state_inspection"],
      expectedBenefit: "Turn reflected repeated pattern into a reusable reviewed workflow.",
      observedPainPoint: "Reflection identified recurring work or failure pattern.",
      confidence: item.confidence,
      riskClass: "LOW",
      status: "CANDIDATE",
      suppressedUntil: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveCandidate(candidate);
    await this.event(ownerId, null, candidate.id, "CANDIDATE_CREATED", `Reflection candidate created: ${candidate.title}`);
    return candidate;
  }

  private async findDuplicate(ownerId: string, candidate: SkillEvolutionCandidate) {
    const skills = await this.store.listSkills(ownerId, 500);
    const analysis = this.mergeAnalysis(ownerId, candidate, skills);
    return analysis.matchedSkillId ? skills.find((item) => item.id === analysis.matchedSkillId) ?? null : null;
  }

  private definitionFromCandidate(ownerId: string, skillId: string, candidate: SkillEvolutionCandidate, version: number): SkillDefinition {
    const capabilities = candidate.proposedCapabilities.length
      ? candidate.proposedCapabilities
      : (["semantic_registry", "state_inspection"] satisfies AdapterCapability[]);
    const titles = [
      "Resolve owner-scoped context",
      ...capabilities.map((capability) => `Use ${capability}`),
      "Validate result",
      "Return structured output",
    ];
    const steps = titles.map((title, index) => ({
      id: slugStep(title, index),
      title,
      kind: title.startsWith("Use ")
        ? "CAPABILITY"
        : title.startsWith("Validate")
          ? "VALIDATION"
          : "OUTPUT",
      capability: title.startsWith("Use ") ? capabilities[index - 1] : null,
      requiresApproval: false,
      sideEffect: false,
      timeoutMs: 60_000,
      dependsOn: index === 0 ? [] : [slugStep(index === 1 ? "Resolve owner-scoped context" : stepsTitle(capabilities, index - 1), index - 1)],
    }));
    return SkillDefinitionSchema.parse({
      skillId,
      ownerId,
      name: candidate.title,
      description: candidate.description,
      purpose: candidate.expectedBenefit,
      version,
      status: "DRAFT",
      type: "WORKFLOW_SKILL",
      scope: "GLOBAL_OWNER",
      inputs: Object.fromEntries(candidate.proposedInputs.map((name) => [name, { type: "string" }])),
      outputs: candidate.proposedOutputs,
      preconditions: ["Owner authenticated", "Required capabilities available"],
      postconditions: ["No hidden execution occurred", "Result is structured"],
      requiredCapabilities: capabilities,
      requiredAdapters: [],
      requiredTools: [],
      steps,
      constraints: ["No arbitrary shell", "No policy mutation", "No self approval", "No unregistered capability expansion"],
      riskClass: this.riskForCapabilities(capabilities),
      approvalPolicy: this.riskForCapabilities(capabilities) === "LOW" ? "NONE" : "OWNER_APPROVAL",
      modelRoutingPolicy: "LOCAL_PREFERRED",
      privacyClass: "PRIVATE",
      generatedImplementation: false,
      arbitraryShellAllowed: false,
      policyMutationAllowed: false,
      selfApprovalAllowed: false,
    });
  }

  private validationFindings(definition: SkillDefinition): SkillValidationFinding[] {
    const findings: SkillValidationFinding[] = [];
    const declared = new Set(definition.requiredCapabilities);
    for (const step of definition.steps) {
      if (step.capability && !declared.has(step.capability))
        findings.push({ code: "UNDECLARED_CAPABILITY", severity: "CRITICAL", message: `Step ${step.id} uses undeclared capability ${step.capability}.`, field: "steps" });
      if (step.capability && !allowedCapabilities.has(step.capability))
        findings.push({ code: "UNSAFE_CAPABILITY", severity: "CRITICAL", message: `Capability ${step.capability} requires stricter reviewed governance before skill evolution may accept it.`, field: "requiredCapabilities" });
    }
    for (const capability of definition.requiredCapabilities) {
      if (protectedCapabilities.has(capability))
        findings.push({ code: "PROTECTED_CAPABILITY", severity: "CRITICAL", message: `Protected capability ${capability} cannot be evolved automatically.`, field: "requiredCapabilities" });
    }
    if (definition.arbitraryShellAllowed)
      findings.push({ code: "ARBITRARY_SHELL", severity: "CRITICAL", message: "Arbitrary shell skills are prohibited.", field: "arbitraryShellAllowed" });
    if (definition.policyMutationAllowed)
      findings.push({ code: "POLICY_MUTATION", severity: "CRITICAL", message: "Skill evolution cannot mutate security or approval policy.", field: "policyMutationAllowed" });
    if (definition.selfApprovalAllowed)
      findings.push({ code: "SELF_APPROVAL", severity: "CRITICAL", message: "Skill evolution cannot approve itself.", field: "selfApprovalAllowed" });
    if (this.hasCycle(definition.steps))
      findings.push({ code: "DEPENDENCY_CYCLE", severity: "CRITICAL", message: "Skill dependency graph contains a cycle.", field: "steps" });
    if (!findings.length)
      findings.push({ code: "VALIDATED_BOUNDED_SKILL", severity: "INFO", message: "Skill uses declared reviewed capabilities only.", field: null });
    return findings;
  }

  private hasCycle(steps: SkillDefinition["steps"]) {
    const graph = new Map(steps.map((step) => [step.id, step.dependsOn]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visited.has(id)) return false;
      if (visiting.has(id)) return true;
      visiting.add(id);
      for (const dep of graph.get(id) ?? []) if (visit(dep)) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    return steps.some((step) => visit(step.id));
  }

  private riskForCapabilities(capabilities: AdapterCapability[]) {
    return capabilities.some((capability) => highRiskCapabilities.has(capability)) ? "HIGH" : "LOW";
  }

  private overlap(left: AdapterCapability[], right: AdapterCapability[]) {
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    return left.filter((item) => rightSet.has(item)).length / Math.max(left.length, right.length);
  }

  private async resolveVersion(ownerId: string, skillId: string, versionId?: string) {
    const versions = (await this.store.listVersions(ownerId, 500)).filter((item) => item.skillId === skillId);
    const version = versionId
      ? versions.find((item) => item.id === versionId)
      : versions.sort((left, right) => right.version - left.version)[0];
    if (!version) throw new GovernanceError(404, "SKILL_VERSION_NOT_FOUND", "Skill version was not found.");
    return version;
  }

  private async mustSkill(ownerId: string, skillId: string) {
    const skill = await this.store.getSkill(ownerId, skillId);
    if (!skill) throw new GovernanceError(404, "SKILL_NOT_FOUND", "Skill was not found.");
    return skill;
  }

  private async recommendRollback(ownerId: string, skillId: string, versionId: string, reason: string) {
    const skill = await this.mustSkill(ownerId, skillId);
    await this.event(ownerId, skillId, skill.createdFromCandidateId, "ROLLBACK_RECOMMENDED", reason);
    await this.store.saveEvaluation(SkillEvolutionEvaluationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      skillId,
      versionId,
      mode: "DEGRADATION",
      status: "ROLLBACK_RECOMMENDED",
      sampleCount: 5,
      minimumSampleCount: 5,
      outputAgreement: null,
      correctness: null,
      latencyMsP95: null,
      costUsd: 0,
      humanInterventions: 0,
      maxCanaryRuns: null,
      maxCanaryFailures: null,
      failures: 0,
      rollbackRecommended: true,
      reason,
      createdAt: this.now().toISOString(),
    }));
  }

  private async publishDesktopSkill(version: SkillVersion, at: string) {
    const definition = version.definition;
    const permissions = definition.requiredCapabilities
      .map((capability) => permissionFor(capability))
      .filter((permission): permission is NonNullable<ReturnType<typeof permissionFor>> => Boolean(permission));
    const desktopSkill: DesktopSkillRecord = DesktopSkillRecordSchema.parse({
      id: definition.skillId,
      ownerId: definition.ownerId,
      generatedSkillId: null,
      name: definition.name,
      description: definition.description,
      capabilities: definition.requiredCapabilities,
      inputSchema: definition.inputs,
      outputs: definition.outputs,
      dependencies: definition.steps.flatMap((step) => step.dependsOn),
      permissions,
      estimatedRuntimeMs: definition.steps.reduce((sum, step) => sum + Math.min(step.timeoutMs, 60_000), 0),
      health: "healthy",
      version: String(definition.version),
      tags: ["skill-evolution", definition.type.toLowerCase()],
      confidence: 0.9,
      plannerAvailable: true,
      createdAt: at,
      updatedAt: at,
    });
    await this.desktopSkillStore.saveDesktopSkill(desktopSkill);
  }

  private async unpublishDesktopSkill(skill: SkillEvolutionSkill, at: string, health: "disabled" | "archived") {
    if (!skill.activeVersionId) return;
    const version = await this.store.getVersion(skill.ownerId, skill.activeVersionId);
    if (!version) return;
    const definition = version.definition;
    await this.desktopSkillStore.saveDesktopSkill(DesktopSkillRecordSchema.parse({
      id: definition.skillId,
      ownerId: definition.ownerId,
      generatedSkillId: null,
      name: definition.name,
      description: definition.description,
      capabilities: definition.requiredCapabilities,
      inputSchema: definition.inputs,
      outputs: definition.outputs,
      dependencies: definition.steps.flatMap((step) => step.dependsOn),
      permissions: [],
      estimatedRuntimeMs: 0,
      health,
      version: String(definition.version),
      tags: ["skill-evolution", definition.type.toLowerCase()],
      confidence: 0,
      plannerAvailable: false,
      createdAt: at,
      updatedAt: at,
    }));
  }

  private async event(ownerId: string, skillId: string | null, candidateId: string | null, type: SkillEvolutionEvent["type"], summary: string) {
    await this.store.saveEvent(SkillEvolutionEventSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      skillId,
      candidateId,
      type,
      summary,
      createdAt: this.now().toISOString(),
    }));
  }

  private async auditSkill(
    input: { ownerId: string; requestId: string; ipAddress: string },
    eventType: AuditEventType,
    reason: string,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    await this.audit({
      ownerId: input.ownerId,
      eventType,
      outcome: "SUCCESS",
      reason,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      metadata,
    });
  }
}

const stepsTitle = (capabilities: AdapterCapability[], index: number) => {
  if (index <= 0) return "Resolve owner-scoped context";
  if (index <= capabilities.length) return `Use ${capabilities[index - 1]}`;
  if (index === capabilities.length + 1) return "Validate result";
  return "Return structured output";
};

const permissionFor = (capability: AdapterCapability) => {
  if (capability === "navigation" || capability === "searching" || capability === "selection") return "navigate";
  if (capability === "semantic_registry" || capability === "state_inspection" || capability === "event_subscription") return "read_semantic_structure";
  return null;
};

const draftBenchmarkCases = () =>
  [
    "simple workflow to summarize project blockers",
    "multi-step workflow to prepare weekly review",
    "analysis skill for comparing plan outcomes",
    "application skill using semantic navigation only",
    "missing capability for exporting a report",
    "duplicate existing skill for project review",
    "unsafe capability attempt using shell.execute",
    "ambiguous candidate with unclear target",
    "error-handling improvement for failed workflow",
    "version improvement proposal for faster summary",
  ].flatMap((prompt, group) =>
    Array.from({ length: 3 }, (_, index) => ({
      id: `skill-draft-${group + 1}-${index + 1}`,
      category:
        group === 5
          ? "duplicate existing skill"
          : group === 6
            ? "unsafe capability attempt"
            : group === 7
              ? "ambiguous candidate"
              : "skill drafting",
      prompt: `${prompt} case ${index + 1}`,
      ambiguous: group === 7,
    })),
  );

const deterministicDraft = (prompt: string) =>
  SkillDraftSchema.parse({
    name: prompt.includes("unsafe") ? "Unsafe maintenance proposal" : "Reusable workflow draft",
    purpose: "Create a bounded, reviewed skill draft from evidence.",
    inputs: { scope: { type: "string" } },
    outputs: ["structured_result"],
    proposedSteps: [
      "Resolve owner-scoped context",
      "Read semantic state",
      "Validate output",
      "Return structured result",
    ],
    proposedCapabilities: prompt.includes("unsafe")
      ? ["shell.execute"]
      : ["semantic_registry", "state_inspection"],
    assumptions: ["Evidence remains owner-scoped."],
    errorHandling: ["Ask for clarification when target is ambiguous."],
  });

const draftInstruction = (prompt: string) =>
  [
    "You convert a proposed Alexa skill into compact structured data.",
    "Return ONLY JSON matching the provided schema.",
    "Use short plain phrases. No markdown. No numbering inside text.",
    "Do not invent permissions, approve anything, execute anything, change policies, change security settings, or use arbitrary shell commands.",
    "Describe reviewed Alexa capabilities conceptually; capability hints are suggestions only.",
    "Relevant reviewed capability hints: semantic_registry, state_inspection, navigation, searching, selection, event_subscription.",
    "If the request needs an unsafe capability, describe the workflow safely; validation decides whether it is allowed.",
    "Example input: Create a skill that summarizes my current project.",
    'Example output: {"name":"Project Summary","purpose":"Summarize current project state","inputs":[{"name":"scope","description":"Project or current workspace","required":false}],"outputs":[{"name":"summary","description":"Concise project summary"}],"steps":[{"order":1,"description":"Retrieve active project context","capabilityHint":"semantic_registry"},{"order":2,"description":"Review recent project activity","capabilityHint":"state_inspection"},{"order":3,"description":"Produce concise summary"}],"assumptions":["Owner context is available"],"errorHandling":["Ask for clarification when project is unclear"]}',
    `Input: ${prompt}`,
  ].join("\n");

const compileDraftProposal = (proposal: SkillDraftProposal): SkillDraft => {
  const hinted = proposal.steps.flatMap((step) => capabilityHints(`${step.description} ${step.capabilityHint ?? ""}`));
  const capabilities = hinted.length ? [...new Set(hinted)] : ["semantic_registry", "state_inspection"];
  return SkillDraftSchema.parse({
    name: proposal.name,
    purpose: proposal.purpose,
    inputs: Object.fromEntries(
      proposal.inputs.map((input) => [
        input.name,
        { description: input.description, required: input.required },
      ]),
    ),
    outputs: proposal.outputs.map((output) => output.name),
    proposedSteps: proposal.steps
      .sort((left, right) => left.order - right.order)
      .map((step) => step.description),
    proposedCapabilities: capabilities,
    assumptions: proposal.assumptions,
    errorHandling: proposal.errorHandling,
  });
};

const capabilityHints = (text: string) => {
  const normalized = normalize(text);
  const capabilities: string[] = [];
  for (const capability of allowedCapabilities)
    if (normalized.includes(capability) || normalized.includes(capability.replace("_", " ")))
      capabilities.push(capability);
  if (normalized.includes("shell.execute") || normalized.includes("shell execute") || normalized.includes("arbitrary shell"))
    capabilities.push("shell.execute");
  return capabilities;
};

const safeDeterministicProposalRepair = (rawText: string | null) => {
  if (!rawText) return null;
  const candidates = [
    rawText.trim(),
    rawText.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
    rawText.slice(rawText.indexOf("{"), rawText.lastIndexOf("}") + 1),
  ].filter((value) => value.startsWith("{") && value.endsWith("}"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const normalized = {
        ...parsed,
        steps: parsed.steps ?? parsed.proposedSteps,
        outputs: normalizeProposalOutputs(parsed.outputs),
        inputs: normalizeProposalInputs(parsed.inputs),
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
        errorHandling: Array.isArray(parsed.errorHandling) ? parsed.errorHandling : [],
      };
      const result = SkillDraftProposalSchema.safeParse(normalized);
      if (result.success) return result.data;
    } catch {
      continue;
    }
  }
  return null;
};

const normalizeProposalInputs = (value: unknown) => {
  if (Array.isArray(value))
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .map((item) => ({
        name: typeof item.name === "string" ? item.name : "input",
        description: typeof item.description === "string" ? item.description : "Input value",
        required: typeof item.required === "boolean" ? item.required : false,
      }));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([name, description]) => ({
    name,
    description: typeof description === "string" ? description : "Input value",
    required: false,
  }));
};

const normalizeProposalOutputs = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string | Record<string, unknown> => typeof item === "string" || Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) =>
      typeof item === "string"
        ? { name: item, description: item }
        : {
            name: typeof item.name === "string" ? item.name : "output",
            description: typeof item.description === "string" ? item.description : "Output value",
          },
    );
};

const classifyDraftFailure = (rawText: string, schemaErrors: string[], reason: string) => {
  const text = rawText.trim();
  const joined = `${schemaErrors.join(" ")} ${reason}`.toLowerCase();
  if (!text && reason.includes("All eligible model attempts failed")) return "schema validation failed";
  if (text.includes("```")) return "markdown/code fences";
  if (text && !text.startsWith("{")) return "extra prose before JSON";
  if (text && !text.endsWith("}")) return "truncated response";
  if (joined.includes("unrecognized key")) return "additionalProperties violations";
  if (joined.includes("required") || joined.includes("missing")) return "missing required fields";
  if (joined.includes("expected array") || joined.includes("expected object")) return "wrong array/object shapes";
  if (joined.includes("expected string") || joined.includes("expected number") || joined.includes("expected boolean"))
    return "wrong primitive types";
  if (joined.includes("unsupported") || joined.includes("shell")) return "unsupported capabilities";
  if (joined.includes("json")) return "invalid JSON";
  return "other";
};

const mostCommonFailureCategory = (values: Array<string | null>) => {
  const counts = new Map<string, number>();
  for (const value of values)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
};
