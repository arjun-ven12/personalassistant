import {
  CreateLearningEventRequestSchema,
  HabitPatternSchema,
  LearnedPreferenceSchema,
  LearningCandidateSchema,
  LearningCategoryPolicySchema,
  LearningCategorySchema,
  LearningConflictSchema,
  LearningDashboardResponseSchema,
  LearningEventSchema,
  LearningExplainResponseSchema,
  LearningScopeSchema,
  LearningStatsSchema,
  LearningSuggestionSchema,
  LearningTimelineEventSchema,
  SequenceObservationRequestSchema,
  SequencePatternSchema,
  TeachPreferenceRequestSchema,
  type CreateLearningEventRequest,
  type HabitPattern,
  type LearnedPreference,
  type LearningCandidate,
  type LearningCategory,
  type LearningCategoryPolicy,
  type LearningEvent,
  type LearningScope,
  type LearningSuggestion,
  type SequencePattern,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { LearningEngineStore } from "./store.js";
import { contextKeyFor } from "./store.js";

type PartialLearningScope = {
  [Key in keyof LearningScope]?: LearningScope[Key] | undefined;
};

export const defaultLearningScope = (input: PartialLearningScope = {}): LearningScope =>
  LearningScopeSchema.parse({
    level: input.level ?? "GLOBAL",
    projectId: input.projectId ?? null,
    applicationId: input.applicationId ?? null,
    workflowId: input.workflowId ?? null,
    agentId: input.agentId ?? null,
    profileId: input.profileId ?? null,
    modality: input.modality ?? null,
    timeBucket: input.timeBucket ?? null,
    weekdayBucket: input.weekdayBucket ?? null,
  });

const highImpactCategories = new Set<LearningCategory>([
  "MODEL_PREFERENCE",
  "LOCAL_VS_CLOUD_PREFERENCE",
  "DECISION_PATTERN",
  "BUSINESS_PROCESS_PATTERN",
]);

const lowRiskAutoApplyCategories = new Set<LearningCategory>([
  "ALIAS",
  "VOCABULARY",
  "RESPONSE_LENGTH",
  "COMMUNICATION_STYLE",
  "CONFIRMATION_STYLE",
  "TERMINOLOGY",
  "WRITING_STYLE",
  "PREFERRED_APPLICATION",
  "NAVIGATION_PATTERN",
]);

export const learningCategoryPolicies: LearningCategoryPolicy[] =
  LearningCategorySchema.options.map((category) => {
    const highImpact = highImpactCategories.has(category);
    const lowRisk = lowRiskAutoApplyCategories.has(category);
    return LearningCategoryPolicySchema.parse({
      category,
      observationThreshold: 1,
      candidateThreshold: category === "SEQUENCE_PATTERN" ? 3 : 3,
      suggestionThreshold: category === "SEQUENCE_PATTERN" ? 5 : 5,
      suggestionConfidence: 0.8,
      autoApplyThreshold: 15,
      autoApplyConfidence: 0.95,
      decayRate: ["TIME_PATTERN", "TASK_ROUTINE", "NAVIGATION_PATTERN"].includes(
        category,
      )
        ? 0.08
        : ["ALIAS", "VOCABULARY", "TERMINOLOGY"].includes(category)
          ? 0.01
          : 0.03,
      autoApplyAllowed: lowRisk && !highImpact,
      ownerConfirmationRequired: highImpact || !lowRisk,
      securitySensitivity: highImpact ? "high" : lowRisk ? "low" : "medium",
      reversible: true,
    });
  });

const policyFor = (category: LearningCategory) =>
  learningCategoryPolicies.find((item) => item.category === category) ??
  LearningCategoryPolicySchema.parse({
    category,
    observationThreshold: 1,
    candidateThreshold: 3,
    suggestionThreshold: 5,
    suggestionConfidence: 0.8,
    autoApplyThreshold: 15,
    autoApplyConfidence: 0.95,
    decayRate: 0.03,
    autoApplyAllowed: false,
    ownerConfirmationRequired: true,
    securitySensitivity: "medium",
    reversible: true,
  });

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const stableUuid = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  const hex = Math.abs(hash).toString(16).padStart(12, "0").slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
};

const confidenceFor = (input: {
  positiveEvidence: number;
  negativeEvidence: number;
  sourceDiversity: number;
  evidenceCount: number;
  explicitTeaching: boolean;
}) => {
  if (input.explicitTeaching) return 0.99;
  const net = Math.max(0, input.positiveEvidence - input.negativeEvidence * 1.5);
  const frequencyScore = Math.min(0.75, net / 8);
  const qualityScore = input.evidenceCount
    ? Math.max(
        0,
        (input.positiveEvidence - input.negativeEvidence) / input.evidenceCount,
      ) * 0.15
    : 0;
  const diversityScore = Math.min(0.1, input.sourceDiversity * 0.03);
  return Math.max(0, Math.min(0.99, frequencyScore + qualityScore + diversityScore));
};

const statusFor = (candidate: LearningCandidate, policy: LearningCategoryPolicy) => {
  if (candidate.status === "REJECTED") return "REJECTED";
  if (candidate.evidenceCount < policy.candidateThreshold) return "OBSERVING";
  if (
    candidate.evidenceCount >= policy.suggestionThreshold &&
    candidate.confidence >= policy.suggestionConfidence
  ) {
    return "SUGGESTED";
  }
  return "CANDIDATE";
};

export class LearningEngineService {
  constructor(
    readonly store: LearningEngineStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    const [
      events,
      candidates,
      preferences,
      sequences,
      habits,
      suggestions,
      conflicts,
      timeline,
    ] = await Promise.all([
      this.store.listEvents(ownerId, 500),
      this.store.listCandidates(ownerId, 500),
      this.store.listPreferences(ownerId, 500),
      this.store.listSequences(ownerId, 200),
      this.store.listHabits(ownerId, 200),
      this.store.listSuggestions(ownerId, 200),
      this.store.listConflicts(ownerId, 200),
      this.store.listTimeline(ownerId, 500),
    ]);
    return LearningDashboardResponseSchema.parse({
      categories: learningCategoryPolicies,
      events,
      candidates,
      preferences,
      sequences,
      habits,
      suggestions,
      conflicts,
      timeline,
      stats: this.statsFrom({
        events,
        candidates,
        preferences,
        suggestions,
        sequences,
        habits,
      }),
      automaticSecurityMutationEnabled: false,
      llmRequired: false,
    });
  }

  async ingest(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = CreateLearningEventRequestSchema.parse(input.body);
    if (body.privateMode || body.doNotLearn) {
      await this.audit({
        ownerId: input.ownerId,
        eventType: "LEARNING_EVENT_RECORDED",
        outcome: "SUCCESS",
        reason:
          "Learning event was not persisted because private mode or do-not-learn was set.",
        ipAddress: input.ipAddress,
        requestId: input.requestId,
        metadata: { category: body.category, sourceType: body.sourceType },
      });
      return null;
    }

    const at = this.now().toISOString();
    const event = LearningEventSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      eventType: body.eventType,
      category: body.category,
      subject: normalized(body.subject),
      context: defaultLearningScope(body.context),
      observedValue: normalized(body.observedValue),
      expectedValue: body.expectedValue ? normalized(body.expectedValue) : null,
      sourceType: body.sourceType,
      sourceId: body.sourceId ?? null,
      positiveEvidence: body.positiveEvidence ?? (body.negativeEvidence ? 0 : 1),
      negativeEvidence: body.negativeEvidence ?? 0,
      confidenceContribution:
        body.confidenceContribution ?? (body.negativeEvidence ? -0.2 : 0.2),
      timestamp: at,
      metadata: this.sanitizeMetadata(body.metadata ?? {}),
      correlationId: body.correlationId ?? null,
      sessionId: body.sessionId ?? null,
      projectId: body.projectId ?? null,
      workflowId: body.workflowId ?? null,
      agentId: body.agentId ?? null,
      applicationId: body.applicationId ?? null,
      persisted: true,
    });
    await this.store.saveEvent(event);
    const candidate = await this.updateCandidate(
      event,
      body.sourceType === "manual_teaching",
    );
    await this.recordTimeline(
      input.ownerId,
      "LEARNING_EVENT_RECORDED",
      event.subject,
      `Recorded ${event.category} evidence for ${event.subject}.`,
      candidate.id,
      null,
    );
    await this.detectConflict(candidate);
    await this.maybeSuggest(candidate);
    await this.maybeAutoApply(candidate);
    return { event, candidate };
  }

  async teach(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = TeachPreferenceRequestSchema.parse(input.body);
    const preference = await this.activatePreference({
      ownerId: input.ownerId,
      category: body.category,
      subject: normalized(body.subject),
      value: normalized(body.value),
      context: defaultLearningScope(body.context),
      confidence: 0.99,
      sourceCandidateId: null,
      locked: body.locked ?? true,
      manualOverride: true,
      explanation: body.explanation ?? "Owner explicitly taught this preference.",
    });
    await this.ingest({
      ownerId: input.ownerId,
      body: {
        eventType: "MANUAL_TEACHING",
        category: body.category,
        subject: body.subject,
        observedValue: body.value,
        sourceType: "manual_teaching",
        positiveEvidence: 10,
        confidenceContribution: 0.9,
        context: body.context,
      } satisfies CreateLearningEventRequest,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    return preference;
  }

  async observeSequence(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = SequenceObservationRequestSchema.parse(input.body);
    if (body.privateMode || body.doNotLearn) return null;
    const at = this.now().toISOString();
    const context = defaultLearningScope(body.context);
    const actions = body.actions.slice(0, 8).map(normalized);
    const sequenceKey = `${actions.join(">")}:${contextKeyFor(context)}`;
    const current = await this.store.findSequence(input.ownerId, sequenceKey);
    const frequency = (current?.frequency ?? 0) + 1;
    const successCount =
      Math.round((current?.successRate ?? 0) * (current?.frequency ?? 0)) +
      (body.success === false ? 0 : 1);
    const sequence = SequencePatternSchema.parse({
      id: current?.id ?? stableUuid(`${input.ownerId}:sequence:${sequenceKey}`),
      ownerId: input.ownerId,
      orderedActions: actions,
      context,
      frequency,
      successRate: Math.min(1, successCount / frequency),
      averageIntervalSeconds: averageInterval(body.timestamps),
      confidence: Math.min(0.99, frequency / 7 + (body.success === false ? 0 : 0.12)),
      firstSeenAt: current?.firstSeenAt ?? at,
      lastSeenAt: at,
      relatedProject: body.relatedProject ?? current?.relatedProject ?? null,
      relatedWorkflow: body.relatedWorkflow ?? current?.relatedWorkflow ?? null,
      candidateId: current?.candidateId ?? null,
    });
    await this.store.saveSequence(sequence);
    const habit = await this.upsertHabitFromSequence(sequence);
    await this.recordTimeline(
      input.ownerId,
      "SEQUENCE_PATTERN_OBSERVED",
      actions.join(" -> "),
      `Observed sequence ${actions.join(" -> ")} ${frequency} time(s).`,
      sequence.candidateId,
      null,
    );
    if (sequence.frequency >= 5 && sequence.confidence >= 0.8) {
      await this.ingest({
        ownerId: input.ownerId,
        body: {
          eventType: "SEQUENCE_PATTERN_DETECTED",
          category: "SEQUENCE_PATTERN",
          subject: actions.join(" -> "),
          observedValue: "reusable_workflow_candidate",
          sourceType: "workflow",
          sourceId: sequence.id,
          positiveEvidence: sequence.frequency,
          context,
        },
        requestId: input.requestId,
        ipAddress: input.ipAddress,
      });
    }
    return { sequence, habit };
  }

  async approveCandidate(ownerId: string, candidateId: string) {
    const candidate = await this.requireCandidate(ownerId, candidateId);
    return this.activatePreference({
      ownerId,
      category: candidate.category,
      subject: candidate.subject,
      value: candidate.candidateValue,
      context: candidate.context,
      confidence: candidate.confidence,
      sourceCandidateId: candidate.id,
      locked: false,
      manualOverride: false,
      explanation: candidate.explanation,
    });
  }

  async rejectCandidate(ownerId: string, candidateId: string) {
    const candidate = await this.requireCandidate(ownerId, candidateId);
    const rejected = LearningCandidateSchema.parse({
      ...candidate,
      status: "REJECTED",
      confidence: Math.max(0, candidate.confidence - 0.25),
      rejectionCount: candidate.rejectionCount + 1,
      nextEligibleAt: addDays(
        this.now(),
        Math.min(90, 14 * (candidate.rejectionCount + 1)),
      ).toISOString(),
      version: candidate.version + 1,
    });
    await this.store.saveCandidate(rejected);
    await this.recordTimeline(
      ownerId,
      "CANDIDATE_REJECTED",
      rejected.subject,
      "Owner rejected a learning candidate.",
      rejected.id,
      null,
    );
    return rejected;
  }

  async acceptSuggestion(ownerId: string, suggestionId: string) {
    const suggestion = await this.requireSuggestion(ownerId, suggestionId);
    const at = this.now().toISOString();
    const updated = LearningSuggestionSchema.parse({
      ...suggestion,
      status: "accepted",
      updatedAt: at,
    });
    await this.store.saveSuggestion(updated);
    return this.approveCandidate(ownerId, suggestion.candidateId);
  }

  async rejectSuggestion(ownerId: string, suggestionId: string) {
    const suggestion = await this.requireSuggestion(ownerId, suggestionId);
    const at = this.now().toISOString();
    const updated = LearningSuggestionSchema.parse({
      ...suggestion,
      status: "rejected",
      rejectionCount: suggestion.rejectionCount + 1,
      nextEligibleAt: addDays(
        this.now(),
        Math.min(90, 14 * (suggestion.rejectionCount + 1)),
      ).toISOString(),
      updatedAt: at,
    });
    await this.store.saveSuggestion(updated);
    await this.rejectCandidate(ownerId, suggestion.candidateId);
    return updated;
  }

  async decay(ownerId: string) {
    const at = this.now();
    const candidates = await this.store.listCandidates(ownerId, 1_000);
    const decayed = [];
    for (const candidate of candidates) {
      const ageDays = Math.max(
        0,
        (at.getTime() - new Date(candidate.lastObservedAt).getTime()) / 86_400_000,
      );
      const decay = Math.min(0.6, ageDays * candidate.decayRate * 0.01);
      if (decay <= 0) continue;
      const next = LearningCandidateSchema.parse({
        ...candidate,
        confidence: Math.max(0, candidate.confidence - decay),
        status: candidate.confidence - decay < 0.2 ? "EXPIRED" : candidate.status,
        version: candidate.version + 1,
      });
      await this.store.saveCandidate(next);
      decayed.push(next);
    }
    return decayed;
  }

  async explain(ownerId: string, id: string) {
    const candidate = await this.store.getCandidate(ownerId, id);
    const preference = candidate ? null : await this.store.getPreference(ownerId, id);
    const suggestions = await this.store.listSuggestions(ownerId, 200);
    const suggestion =
      suggestions.find(
        (item) => item.id === id || item.candidateId === candidate?.id,
      ) ?? null;
    const evidenceIds = new Set(candidate?.supportingEvidence ?? []);
    const evidence = (await this.store.listEvents(ownerId, 500)).filter((item) =>
      evidenceIds.has(item.id),
    );
    return LearningExplainResponseSchema.parse({
      learnedItem: preference,
      candidate,
      suggestion,
      evidence,
      explanation:
        candidate?.explanation ??
        preference?.explanation ??
        suggestion?.message ??
        "No learning item with this identifier was found for the owner.",
      reversible: true,
    });
  }

  async updateCandidate(event: LearningEvent, explicitTeaching: boolean) {
    const policy = policyFor(event.category);
    const candidateValue = event.expectedValue ?? event.observedValue;
    const contextKey = contextKeyFor(event.context);
    const current = await this.store.findCandidate(
      event.ownerId,
      event.category,
      event.subject,
      candidateValue,
      contextKey,
    );
    const sourceKeys = new Set<string>(current?.supportingEvidence ?? []);
    sourceKeys.add(event.id);
    const positiveEvidence = (current?.positiveEvidence ?? 0) + event.positiveEvidence;
    const negativeEvidence = (current?.negativeEvidence ?? 0) + event.negativeEvidence;
    const evidenceCount = positiveEvidence + negativeEvidence;
    const sourceDiversity = await this.sourceDiversity(event.ownerId, [...sourceKeys]);
    const confidence = confidenceFor({
      positiveEvidence,
      negativeEvidence,
      sourceDiversity,
      evidenceCount,
      explicitTeaching,
    });
    const base = LearningCandidateSchema.parse({
      id: current?.id ?? crypto.randomUUID(),
      ownerId: event.ownerId,
      category: event.category,
      subject: event.subject,
      candidateValue,
      context: event.context,
      confidence,
      evidenceCount,
      positiveEvidence,
      negativeEvidence,
      sourceDiversity,
      firstObservedAt: current?.firstObservedAt ?? event.timestamp,
      lastObservedAt: event.timestamp,
      decayRate: policy.decayRate,
      status: current?.status ?? "OBSERVING",
      autoApplicable: policy.autoApplyAllowed,
      requiresApproval: policy.ownerConfirmationRequired,
      manualOverride: explicitTeaching || (current?.manualOverride ?? false),
      explanation: `${event.category} candidate ${event.subject} -> ${candidateValue} has ${positiveEvidence} positive and ${negativeEvidence} negative evidence point(s) across ${sourceDiversity} source type(s).`,
      supportingEvidence: [...sourceKeys].slice(-200),
      lastSuggestedAt: current?.lastSuggestedAt ?? null,
      rejectionCount: current?.rejectionCount ?? 0,
      nextEligibleAt: current?.nextEligibleAt ?? null,
      version: (current?.version ?? 0) + 1,
    });
    const candidate = LearningCandidateSchema.parse({
      ...base,
      status: explicitTeaching ? "APPROVED" : statusFor(base, policy),
    });
    await this.store.saveCandidate(candidate);
    return candidate;
  }

  async maybeSuggest(candidate: LearningCandidate) {
    if (candidate.status !== "SUGGESTED") return null;
    if (candidate.nextEligibleAt && new Date(candidate.nextEligibleAt) > this.now())
      return null;
    const current = await this.store.findSuggestion(candidate.ownerId, candidate.id);
    if (current && current.status === "pending") return current;
    const at = this.now().toISOString();
    const suggestion = LearningSuggestionSchema.parse({
      id: crypto.randomUUID(),
      ownerId: candidate.ownerId,
      candidateId: candidate.id,
      suggestionType: suggestionTypeFor(candidate.category),
      title: suggestionTitle(candidate),
      message: `I have seen ${candidate.subject} map to ${candidate.candidateValue} ${candidate.evidenceCount} time(s) with ${Math.round(candidate.confidence * 100)}% confidence.`,
      status: "pending",
      confidence: candidate.confidence,
      createdAt: at,
      updatedAt: at,
      lastShownAt: null,
      rejectionCount: 0,
      nextEligibleAt: null,
    });
    await this.store.saveSuggestion(suggestion);
    const updated = LearningCandidateSchema.parse({
      ...candidate,
      status: "SUGGESTED",
      lastSuggestedAt: at,
      version: candidate.version + 1,
    });
    await this.store.saveCandidate(updated);
    await this.recordTimeline(
      candidate.ownerId,
      "LEARNING_SUGGESTION_CREATED",
      candidate.subject,
      suggestion.message,
      candidate.id,
      null,
    );
    return suggestion;
  }

  async maybeAutoApply(candidate: LearningCandidate) {
    const policy = policyFor(candidate.category);
    if (!policy.autoApplyAllowed || policy.securitySensitivity !== "low") return null;
    if (candidate.requiresApproval || candidate.rejectionCount > 0) return null;
    if (
      candidate.evidenceCount < policy.autoApplyThreshold ||
      candidate.confidence < policy.autoApplyConfidence
    )
      return null;
    const existing = await this.store.findActivePreference(
      candidate.ownerId,
      candidate.category,
      candidate.subject,
      contextKeyFor(candidate.context),
    );
    if (existing?.locked || existing?.manualOverride) return existing;
    return this.activatePreference({
      ownerId: candidate.ownerId,
      category: candidate.category,
      subject: candidate.subject,
      value: candidate.candidateValue,
      context: candidate.context,
      confidence: candidate.confidence,
      sourceCandidateId: candidate.id,
      locked: false,
      manualOverride: false,
      explanation: `Low-risk learned preference auto-applied after ${candidate.evidenceCount} supporting events.`,
    });
  }

  async activatePreference(input: {
    ownerId: string;
    category: LearningCategory;
    subject: string;
    value: string;
    context: LearningScope;
    confidence: number;
    sourceCandidateId: string | null;
    locked: boolean;
    manualOverride: boolean;
    explanation: string;
  }) {
    const at = this.now().toISOString();
    const existing = await this.store.findActivePreference(
      input.ownerId,
      input.category,
      input.subject,
      contextKeyFor(input.context),
    );
    if (existing?.locked && !input.manualOverride) return existing;
    if (existing && existing.value !== input.value) {
      await this.store.savePreference(
        LearnedPreferenceSchema.parse({
          ...existing,
          status: "SUPERSEDED",
          effectiveUntil: at,
          updatedAt: at,
          version: existing.version + 1,
        }),
      );
    }
    const preference = LearnedPreferenceSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      category: input.category,
      subject: input.subject,
      value: input.value,
      context: input.context,
      confidence: input.confidence,
      sourceCandidateId: input.sourceCandidateId,
      effectiveFrom: at,
      effectiveUntil: null,
      locked: input.locked,
      manualOverride: input.manualOverride,
      status: input.locked ? "LOCKED" : "ACTIVE",
      createdAt: at,
      updatedAt: at,
      version: existing ? existing.version + 1 : 1,
      explanation: input.explanation,
    });
    await this.store.savePreference(preference);
    await this.recordTimeline(
      input.ownerId,
      "PREFERENCE_ACTIVATED",
      input.subject,
      input.explanation,
      input.sourceCandidateId,
      preference.id,
    );
    return preference;
  }

  async detectConflict(candidate: LearningCandidate) {
    const candidates = (
      await this.store.listCandidates(candidate.ownerId, 1_000)
    ).filter(
      (item) =>
        item.id !== candidate.id &&
        item.category === candidate.category &&
        item.subject === candidate.subject &&
        contextKeyFor(item.context) === contextKeyFor(candidate.context) &&
        Math.abs(item.confidence - candidate.confidence) <= 0.15 &&
        item.confidence >= 0.65 &&
        candidate.confidence >= 0.65 &&
        !["REJECTED", "EXPIRED", "SUPERSEDED"].includes(item.status),
    );
    if (!candidates.length) return null;
    const at = this.now().toISOString();
    const conflict = LearningConflictSchema.parse({
      id: crypto.randomUUID(),
      ownerId: candidate.ownerId,
      category: candidate.category,
      subject: candidate.subject,
      candidateIds: [candidate.id, ...candidates.map((item) => item.id)].slice(0, 10),
      reason:
        "Multiple similarly confident candidates exist for the same scoped subject, so the engine keeps observing instead of flipping preferences.",
      status: "observing",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveConflict(conflict);
    return conflict;
  }

  async sourceDiversity(ownerId: string, evidenceIds: string[]) {
    const evidence = await this.store.listEvents(ownerId, 1_000);
    return (
      new Set(
        evidence
          .filter((item) => evidenceIds.includes(item.id))
          .map((item) => item.sourceType),
      ).size || 1
    );
  }

  async upsertHabitFromSequence(sequence: HabitPattern | SequencePattern) {
    const at = this.now().toISOString();
    const subject = "recurring_sequence";
    const value =
      "orderedActions" in sequence
        ? sequence.orderedActions.join(" -> ")
        : sequence.value;
    const habitKey = `TASK_ROUTINE:${subject}:${value}:${contextKeyFor(sequence.context)}`;
    const current = await this.store.findHabit(sequence.ownerId, habitKey);
    const frequency = (current?.frequency ?? 0) + 1;
    const habit = HabitPatternSchema.parse({
      id: current?.id ?? stableUuid(`${sequence.ownerId}:habit:${habitKey}`),
      ownerId: sequence.ownerId,
      category: "TASK_ROUTINE",
      name: "Recurring routine",
      subject,
      value,
      context: sequence.context,
      frequency,
      confidence: Math.min(0.99, frequency / 12),
      firstSeenAt: current?.firstSeenAt ?? at,
      lastSeenAt: at,
      suggestedAction:
        frequency >= 5 ? "Suggest creating a governed reusable workflow." : null,
      candidateId: current?.candidateId ?? null,
    });
    await this.store.saveHabit(habit);
    return habit;
  }

  statsFrom(input: {
    events: LearningEvent[];
    candidates: LearningCandidate[];
    preferences: LearnedPreference[];
    suggestions: LearningSuggestion[];
    sequences: unknown[];
    habits: unknown[];
  }) {
    const accepted = input.suggestions.filter(
      (item) => item.status === "accepted",
    ).length;
    const rejected = input.suggestions.filter(
      (item) => item.status === "rejected",
    ).length;
    const suggestionTotal = accepted + rejected;
    const correctionEvents = input.events.filter(
      (item) => item.sourceType === "correction",
    ).length;
    const averageConfidence = input.candidates.length
      ? input.candidates.reduce((sum, item) => sum + item.confidence, 0) /
        input.candidates.length
      : 0;
    return LearningStatsSchema.parse({
      eventsProcessed: input.events.length,
      candidatesActive: input.candidates.filter(
        (item) => !["REJECTED", "EXPIRED", "SUPERSEDED"].includes(item.status),
      ).length,
      preferencesActive: input.preferences.filter((item) =>
        ["ACTIVE", "LOCKED"].includes(item.status),
      ).length,
      suggestionsPending: input.suggestions.filter((item) => item.status === "pending")
        .length,
      suggestionAcceptanceRate: suggestionTotal ? accepted / suggestionTotal : 0,
      suggestionRejectionRate: suggestionTotal ? rejected / suggestionTotal : 0,
      correctionRate: input.events.length ? correctionEvents / input.events.length : 0,
      averageConfidence,
      expiredCandidates: input.candidates.filter((item) => item.status === "EXPIRED")
        .length,
      habitsDetected: input.habits.length,
      sequencePatternsDetected: input.sequences.length,
    });
  }

  sanitizeMetadata(metadata: Record<string, unknown>) {
    const blocked = [
      "password",
      "token",
      "secret",
      "cookie",
      "privateKey",
      "recoveryCode",
      "authenticationCode",
    ];
    return Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) =>
          !blocked.some((blockedKey) =>
            key.toLowerCase().includes(blockedKey.toLowerCase()),
          ),
      ),
    );
  }

  async recordTimeline(
    ownerId: string,
    eventType: string,
    subject: string,
    summary: string,
    candidateId: string | null,
    preferenceId: string | null,
  ) {
    await this.store.saveTimeline(
      LearningTimelineEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        eventType,
        subject,
        summary,
        candidateId,
        preferenceId,
        occurredAt: this.now().toISOString(),
      }),
    );
  }

  async requireCandidate(ownerId: string, candidateId: string) {
    const candidate = await this.store.getCandidate(ownerId, candidateId);
    if (!candidate) throw new Error("Learning candidate was not found for this owner.");
    return candidate;
  }

  async requireSuggestion(ownerId: string, suggestionId: string) {
    const suggestion = await this.store.getSuggestion(ownerId, suggestionId);
    if (!suggestion)
      throw new Error("Learning suggestion was not found for this owner.");
    return suggestion;
  }
}

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);

const averageInterval = (timestamps?: string[]) => {
  if (!timestamps || timestamps.length < 2) return 0;
  const sorted = timestamps
    .map((item) => new Date(item).getTime())
    .sort((left, right) => left - right);
  const intervals = sorted
    .slice(1)
    .map((item, index) => item - (sorted[index] ?? item));
  return intervals.reduce((sum, item) => sum + item, 0) / intervals.length / 1_000;
};

const suggestionTypeFor = (
  category: LearningCategory,
): LearningSuggestion["suggestionType"] => {
  if (category === "ALIAS" || category === "VOCABULARY") return "create_alias";
  if (category === "SEQUENCE_PATTERN" || category === "TASK_ROUTINE")
    return "create_workflow";
  if (category === "PREFERRED_APPLICATION") return "prefer_application";
  if (category === "PREFERRED_AGENT") return "prefer_agent";
  if (
    category === "COMMUNICATION_STYLE" ||
    category === "RESPONSE_LENGTH" ||
    category === "WRITING_STYLE"
  )
    return "adjust_style";
  return "approve_preference";
};

const suggestionTitle = (candidate: LearningCandidate) => {
  if (candidate.category === "ALIAS") return `Add alias for ${candidate.subject}`;
  if (candidate.category === "PREFERRED_APPLICATION")
    return `Prefer ${candidate.candidateValue}`;
  if (candidate.category === "SEQUENCE_PATTERN") return "Create reusable workflow";
  return `Approve learned ${candidate.category.toLowerCase()}`;
};
