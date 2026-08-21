import {
  AliasDictionaryEntrySchema,
  BehaviourExampleRecordSchema,
  BehaviourRuleRecordSchema,
  BootstrapProfileRecordSchema,
  CommunicationRuleRecordSchema,
  ClarificationHistoryRecordSchema19A,
  CommunicationProfileRecordSchema,
  ConfidenceHistoryRecordSchema,
  ConversationStateRecordSchema,
  DecisionPreferenceRecordSchema,
  DecisionProfileRecordSchema,
  HumanUnderstandingDashboardResponseSchema,
  HumanUnderstandingRequestSchema,
  HumanUnderstandingResultSchema,
  HumanSynonymEntrySchema,
  InteractionPolicyRecordSchema,
  InteractionStatisticsRecordSchema,
  PersonalityLearningEventRecordSchema,
  PatternLibraryEntrySchema,
  PersonalityBehaviourRecordSchema,
  PersonalityIdentityRecordSchema,
  PersonalityExportResponseSchema,
  PersonalityProfileSchema,
  PersonalitySimulationRecordSchema,
  PersonalityStateHistoryRecordSchema,
  PersonalityVersionRecordSchema,
  PersonalityTraitRecordSchema,
  PreferenceConfidenceRecordSchema,
  PreferenceEvidenceRecordSchema,
  PreferenceLearningRecordSchema,
  ResponseExplanationRecordSchema,
  ResponseTemplateRecordSchema,
  RetrievalHistoryRecord19ASchema,
  SocialRuleRecordSchema,
  VocabularyEntrySchema,
  VersionCompareRequestSchema,
  VersionCompareResponseSchema,
  WorkingStyleRecordSchema,
  WorkingProfileRecordSchema,
  type AliasDictionaryEntry,
  type BehaviourRuleRecord,
  type ConfidenceHistoryRecord,
  type HumanConversationState,
  type HumanUnderstandingResult,
  type IntentCandidate,
  type PatternLibraryEntry,
  type PersonalityProfile,
  type ResolvedHumanEntity,
  type UnderstandingStageRecord,
} from "@alexa-control/shared";
import { z } from "zod";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { ApplicationIntelligenceStore } from "../application-intelligence/store.js";
import type { MemoryStore } from "../memory/store.js";
import type { RetrievalService } from "../intelligence/retrieval-service.js";
import type { PersonalKnowledgeGraphService } from "../knowledge-graph/service.js";
import type { WorkspaceIntelligenceStore } from "../workspace-intelligence/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import { CorpusRuntimeService, normalizeCorpusUtterance } from "./corpus.js";
import type { HumanUnderstandingStore } from "./store.js";

const normalize = (value: string) =>
  value
    .trim()
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();

const tokenize = (value: string) =>
  normalize(value)
    .split(/[^a-z0-9_.:/-]+/i)
    .filter(Boolean)
    .slice(0, 500);

const elapsed = (started: number) =>
  Math.round((performance.now() - started) * 100) / 100;
const score = (matched: number, total: number) =>
  total <= 0 ? 0 : Math.max(0, Math.min(1, matched / total));

type DeterministicNonExecutionCategory =
  | "NEGATED_ACTION"
  | "HYPOTHETICAL_ACTION"
  | "EDUCATIONAL_ACTION_REFERENCE"
  | "QUOTED_ACTION";

const actionReference =
  /\b(open(?:ing|ed)?|launch(?:ing|ed)?|start(?:ing|ed)?|run(?:ning)?|execut(?:e|ing|ed)|delet(?:e|ing|ed)|remov(?:e|ing|ed)|clos(?:e|ing|ed)|quit(?:ting)?|shut(?:ting)? down|shutdown)\b/;
const deterministicNonExecution = (
  normalizedText: string,
): DeterministicNonExecutionCategory | null => {
  if (!actionReference.test(normalizedText)) return null;
  if (/\b(?:do not|don't|dont|never)\s+(?:please\s+)?(?:open|launch|start|run|execute|delete|remove|close|quit|shut down|shutdown)\b/.test(normalizedText) || /\bplease\s+(?:do not|don't|dont|never)\s+/.test(normalizedText))
    return "NEGATED_ACTION";
  if (/\b(?:if i wanted to|if we wanted to|what (?:would happen|happens) if|what if)\b/.test(normalizedText))
    return "HYPOTHETICAL_ACTION";
  if (/\b(?:how (?:do|would|could|can) i|tell me how to|i want to know how to|i'm reading about|im reading about|reading about)\b/.test(normalizedText))
    return "EDUCATIONAL_ACTION_REFERENCE";
  if (/\b(?:said|wrote|asked|quoted)\b[^\n]{0,120}["'](?:open|launch|start|run|execute|delete|remove|close|quit|shut down|shutdown)\b/.test(normalizedText))
    return "QUOTED_ACTION";
  return null;
};
const hasAmbiguousActionTarget = (normalizedText: string) =>
  /\b(?:open|launch|delete|remove|close|email|continue)\s+(?:the\s+)?(?:report|file|draft|document|project|it|him|her|that)\b/.test(
    normalizedText,
  );

const bandFor = (overall: number): ConfidenceHistoryRecord["band"] => {
  if (overall >= 0.95) return "execute_immediately";
  if (overall >= 0.9) return "execute";
  if (overall >= 0.8) return "minor_clarification";
  if (overall >= 0.6) return "ask_clarification";
  return "ai_router";
};

const UUID_NAMESPACE = "00000000-0000-4000-8000-";
const stableUuid = (input: string) => {
  const hash = Array.from(new TextEncoder().encode(input)).reduce(
    (sum, value) => (sum * 31 + value) >>> 0,
    7,
  );
  return `${UUID_NAMESPACE}${hash.toString(16).padStart(12, "0").slice(0, 12)}`;
};

type PipelineContext = {
  ownerId: string;
  requestId: string;
  source: "voice" | "text" | "gesture" | "dashboard" | "planner" | "agent" | "api";
  ipAddress: string;
  at: string;
  stages: UnderstandingStageRecord[];
};

export class VocabularyService {
  async resolve(store: HumanUnderstandingStore, ownerId: string, tokens: string[]) {
    const vocabulary = await store.listVocabulary(ownerId, 2_000);
    const tokenSet = new Set(tokens);
    return vocabulary.filter((entry) => tokenSet.has(entry.normalizedTerm));
  }
}

export class AliasResolutionService {
  async resolve(
    store: HumanUnderstandingStore,
    ownerId: string,
    normalizedText: string,
  ) {
    const aliases = await store.listAliases(ownerId, 1_000);
    return aliases.filter(
      (entry) => entry.active && normalizedText.includes(entry.normalizedPhrase),
    );
  }
}

export class SynonymService {
  async resolve(store: HumanUnderstandingStore, ownerId: string, tokens: string[]) {
    const synonyms = await store.listSynonyms(ownerId, 1_000);
    const tokenSet = new Set(tokens);
    return synonyms.filter(
      (entry) =>
        entry.active &&
        (tokenSet.has(entry.normalizedTerm) ||
          entry.synonyms.some((synonym) => tokenSet.has(normalize(synonym)))),
    );
  }
}

export class PatternRecognitionService {
  async recognize(
    store: HumanUnderstandingStore,
    ownerId: string,
    normalizedText: string,
  ) {
    const patterns = await store.listPatterns(ownerId, 500);
    return patterns
      .filter((pattern) => pattern.active && patternMatches(pattern, normalizedText))
      .sort(
        (left, right) =>
          right.priority - left.priority || right.confidence - left.confidence,
      );
  }
}

export class BehaviourRuleEngine {
  async evaluate(
    store: HumanUnderstandingStore,
    ownerId: string,
    normalizedText: string,
  ) {
    const rules = await store.listBehaviourRules(ownerId, 500);
    return (
      rules
        .filter((rule) => rule.active)
        .find(
          (rule) =>
            normalizedText === rule.normalizedTrigger ||
            normalizedText.startsWith(`${rule.normalizedTrigger} `),
        ) ?? null
    );
  }
}

export class IntentClassificationService {
  classify(input: {
    aliases: AliasDictionaryEntry[];
    patterns: PatternLibraryEntry[];
    rule: BehaviourRuleRecord | null;
    normalizedText: string;
  }): IntentCandidate[] {
    if (input.rule) {
      return [
        {
          intentId: `Behaviour.${input.rule.responseAction}`,
          confidence: input.rule.confidence,
          requiredEntities: [],
          requiredContext: [],
          requiredPermissions: [],
          candidateApplications: [],
          candidateWorkflows: [],
          fallbackStrategy: "execute",
          explanation: `Matched deterministic behaviour rule "${input.rule.trigger}".`,
        },
      ];
    }
    const fromPatterns = input.patterns.map((pattern) => ({
      intentId: pattern.intentId,
      confidence: pattern.confidence,
      requiredEntities: pattern.entitySlots,
      requiredContext: [],
      requiredPermissions: permissionsForIntent(pattern.intentId),
      candidateApplications: applicationsForText(input.normalizedText),
      candidateWorkflows: workflowsForText(input.normalizedText),
      fallbackStrategy: "execute" as const,
      explanation: `Matched configured pattern "${pattern.name}".`,
    }));
    const fromAliases = input.aliases
      .filter(
        (alias) => alias.targetType === "intent" || alias.targetType === "capability",
      )
      .map((alias) => ({
        intentId: alias.canonical,
        confidence: alias.confidence,
        requiredEntities: entitySlotsForIntent(alias.canonical),
        requiredContext: [],
        requiredPermissions: permissionsForIntent(alias.canonical),
        candidateApplications: applicationsForText(input.normalizedText),
        candidateWorkflows: workflowsForText(input.normalizedText),
        fallbackStrategy: "execute" as const,
        explanation: `Matched alias "${alias.phrase}" to ${alias.canonical}.`,
      }));
    const candidates = [...fromPatterns, ...fromAliases];
    if (candidates.length) {
      return candidates
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 25);
    }
    return [
      {
        intentId: "Unknown.Intent",
        confidence: 0.35,
        requiredEntities: [],
        requiredContext: [],
        requiredPermissions: [],
        candidateApplications: applicationsForText(input.normalizedText),
        candidateWorkflows: workflowsForText(input.normalizedText),
        fallbackStrategy: "ai_router",
        explanation: "No deterministic pattern or alias confidently matched.",
      },
    ];
  }
}

export class ContextResolutionService {
  async resolve(input: {
    body: ReturnType<typeof HumanUnderstandingRequestSchema.parse>;
    applicationAdapters: ApplicationAdapterStore;
    applicationIntelligence: ApplicationIntelligenceStore;
    workspaceIntelligence: WorkspaceIntelligenceStore;
    ownerId: string;
  }) {
    const [trustedApps, appSessions, workspaceContext] = await Promise.all([
      input.applicationAdapters.listTrustedApplications(input.ownerId, 100),
      input.applicationIntelligence.listSessions(input.ownerId, 20),
      input.workspaceIntelligence.listContexts(input.ownerId, 20),
    ]);
    return {
      currentApplication:
        input.body.currentApplication ?? appSessions[0]?.applicationId ?? null,
      currentWorkspace:
        input.body.currentWorkspace ?? workspaceContext[0]?.currentObjectId ?? null,
      currentWorkflow: input.body.currentWorkflow ?? null,
      trustedApplications: trustedApps.map((app) => ({
        id: app.id,
        name: app.applicationName,
        bundleIdentifier: app.bundleIdentifier,
        status: app.status,
      })),
      appSessionCount: appSessions.length,
      workspaceContextCount: workspaceContext.length,
    };
  }
}

export class SemanticRetrievalService19A {
  constructor(
    readonly memoryStore: MemoryStore,
    readonly retrieval: RetrievalService,
  ) {}

  async retrieve(
    ownerId: string,
    requestId: string,
    query: string,
    namespaces: string[],
  ) {
    const results = await this.retrieval.hybridSearch(ownerId, {
      query,
      mode: "hybrid",
      limit: 8,
    });
    const memories = await Promise.all(
      results.results.map((result) =>
        Promise.resolve(this.memoryStore.findMemory(ownerId, result.memoryId)),
      ),
    );
    return memories
      .filter((memory): memory is NonNullable<typeof memory> => Boolean(memory))
      .map((memory, index) => ({
        memory,
        retrieval: RetrievalHistoryRecord19ASchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          requestId,
          namespace: namespaces[index % namespaces.length] ?? "conversation_memory",
          query,
          memoryId: memory.id,
          similarity: results.results[index]?.score ?? 0,
          confidence: memory.confidence,
          reason:
            "Retrieved from the existing memory/vector retrieval service; retrieval does not decide.",
          createdAt: new Date().toISOString(),
        }),
      }));
  }
}

export class ConfidenceEngine {
  calculate(input: {
    ownerId: string;
    requestId: string;
    vocabulary: number;
    alias: number;
    synonym: number;
    pattern: number;
    behaviour: number;
    intent: number;
    entity: number;
    context: number;
    memory: number;
    at: string;
  }) {
    const weights = {
      vocabulary: 0.08,
      alias: 0.12,
      synonym: 0.08,
      pattern: 0.18,
      behaviour: 0.12,
      intent: 0.2,
      entity: 0.1,
      context: 0.07,
      memory: 0.05,
    };
    const signals = [
      ["vocabulary", input.vocabulary, weights.vocabulary],
      ["alias", input.alias, weights.alias],
      ["synonym", input.synonym, weights.synonym],
      ["pattern", input.pattern, weights.pattern],
      ["behaviour", input.behaviour, weights.behaviour],
      ["intent", input.intent, weights.intent],
      ["entity", input.entity, weights.entity],
      ["context", input.context, weights.context],
      ["memory", input.memory, weights.memory],
    ] as const;
    const activeSignals = signals.filter(
      ([key, value]) => key === "context" || value > 0,
    );
    const activeWeight = activeSignals.reduce((sum, [, , weight]) => sum + weight, 0);
    const overall = activeWeight
      ? activeSignals.reduce((sum, [, value, weight]) => sum + value * weight, 0) /
        activeWeight
      : 0;
    return ConfidenceHistoryRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      requestId: input.requestId,
      vocabulary: input.vocabulary,
      alias: input.alias,
      synonym: input.synonym,
      pattern: input.pattern,
      behaviour: input.behaviour,
      intent: input.intent,
      entity: input.entity,
      context: input.context,
      memory: input.memory,
      overall,
      band: bandFor(overall),
      explanation:
        "Weighted deterministic confidence. Embeddings and retrieval are context only; Planner owns decisions.",
      createdAt: input.at,
    });
  }
}

export class ClarificationService {
  create(input: {
    ownerId: string;
    requestId: string;
    text: string;
    candidates: IntentCandidate[];
    entities: ResolvedHumanEntity[];
    at: string;
  }) {
    const options =
      input.entities.length > 1
        ? input.entities.map((entity) => entity.value).slice(0, 5)
        : input.candidates.map((candidate) => candidate.intentId).slice(0, 5);
    return ClarificationHistoryRecordSchema19A.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      requestId: input.requestId,
      question: options.length
        ? `Which did you mean: ${options.join(" or ")}?`
        : "Can you clarify what you want me to do?",
      reason:
        "Confidence was below the deterministic execution threshold or the request was ambiguous.",
      options,
      status: "open",
      createdAt: input.at,
      updatedAt: input.at,
    });
  }
}

export class ConversationStateService {
  async transition(input: {
    store: HumanUnderstandingStore;
    ownerId: string;
    previous: HumanConversationState | null;
    state: HumanConversationState;
    reason: string;
    at: string;
  }) {
    const record = ConversationStateRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      previousState: input.previous,
      state: input.state,
      reason: input.reason,
      deterministic: true,
      createdAt: input.at,
    });
    await input.store.saveConversationState(record);
    return record;
  }
}

export class PersonalityCoreService {
  constructor(
    readonly store: HumanUnderstandingStore,
    readonly now: () => Date = () => new Date(),
  ) {}

  async profile(ownerId: string) {
    const profile = await this.ensureProfile(ownerId);
    await new PersonalityBootstrapService(this.store, this.now).seedPersonalityCore(
      ownerId,
      profile.id,
      this.now().toISOString(),
    );
    return profile;
  }

  async ensureProfile(ownerId: string): Promise<PersonalityProfile> {
    const existing = await this.store.getActiveProfile(ownerId);
    if (existing) return existing;
    return new PersonalityBootstrapService(this.store, this.now).bootstrap(ownerId);
  }
}

export class PersonalityBootstrapService {
  constructor(
    readonly store: HumanUnderstandingStore,
    readonly now: () => Date = () => new Date(),
  ) {}

  async bootstrap(ownerId: string) {
    const at = this.now().toISOString();
    const profile = PersonalityProfileSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      name: "Alexa Default",
      identity:
        "Model-independent assistant personality for deterministic understanding and governed planning.",
      speechStyle: "Warm, concise, practical, and explainable.",
      communicationStyle:
        "Collaborative and direct with clarifying questions when ambiguity matters.",
      workingStyle: "Deterministic first, semantic second, statistical third, AI last.",
      decisionStyle:
        "Fail closed on uncertainty and never bypass Planner, policy, approval, or audit.",
      socialRules: [
        "Greetings and thanks are handled locally.",
        "Ask clarification instead of guessing ambiguous targets.",
        "Do not treat model output as authority.",
      ],
      interactionPolicies: [
        "No cross-owner learning.",
        "No high-risk approval from voice or gesture alone.",
        "AI fallback is a capability provider only.",
      ],
      active: true,
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveProfile(profile);
    await this.seedPersonalityCore(ownerId, profile.id, at);
    await this.seedVocabulary(ownerId, at);
    await this.seedAliases(ownerId, at);
    await this.seedSynonyms(ownerId, at);
    await this.seedPatterns(ownerId, at);
    await this.seedRules(ownerId, at);
    await this.seedProfiles(ownerId, profile.id, at);
    await this.store.saveBootstrap(
      BootstrapProfileRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        profileId: profile.id,
        bootstrapVersion: "19A.1",
        loadedVocabulary: 30,
        loadedAliases: 13,
        loadedRules: 7,
        loadedTemplates: 7,
        createdAt: at,
      }),
    );
    await this.store.savePersonalityVersion(
      PersonalityVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        profileId: profile.id,
        version: 1,
        changeSummary: "Default personality bootstrap loaded without AI.",
        reversible: true,
        createdAt: at,
      }),
    );
    return profile;
  }

  async seedPersonalityCore(ownerId: string, profileId: string, at: string) {
    await this.store.saveIdentity(
      PersonalityIdentityRecordSchema.parse({
        id: stableUuid(`${ownerId}:identity:alexa`),
        ownerId,
        assistantName: "Alexa",
        ownerName: "Arjun",
        relationship: "owner_assistant",
        role: "Personal Assistant OS",
        mission:
          "Understand Arjun, preserve safety boundaries, and turn goals into deterministic governed work.",
        version: 1,
        identityDescription:
          "Alexa is a model-independent assistant identity. LLMs may help reason, but they do not own personality, memory, policy, or planning.",
        longTermGoals: [
          "Stay useful without depending on cloud AI.",
          "Prefer semantic, reviewed, deterministic integrations.",
          "Remain inspectable, auditable, and owner controlled.",
        ],
        active: true,
        createdAt: at,
        updatedAt: at,
      }),
    );
    const traits: Array<[string, string, number, string]> = [
      [
        "directness",
        "Directness",
        88,
        "Prefer clear outcomes and concise explanations.",
      ],
      [
        "detail_level",
        "Detail Level",
        62,
        "Add depth when it materially helps implementation.",
      ],
      ["confidence", "Confidence", 78, "Be decisive when evidence is sufficient."],
      [
        "curiosity",
        "Curiosity",
        82,
        "Ask useful questions when the problem space is blurry.",
      ],
      ["initiative", "Initiative", 76, "Proactively continue safe in-scope work."],
      ["humour", "Humour", 36, "Use light warmth without distracting from work."],
      ["patience", "Patience", 86, "Stay steady during debugging loops."],
      ["formality", "Formality", 24, "Default to approachable, not corporate."],
      ["energy", "Energy", 72, "Keep momentum while preserving accuracy."],
      ["assertiveness", "Assertiveness", 68, "Name blockers and tradeoffs plainly."],
      [
        "helpfulness",
        "Helpfulness",
        94,
        "Optimize for user capability and forward progress.",
      ],
      ["encouragement", "Encouragement", 70, "Encourage without empty praise."],
      ["precision", "Precision", 92, "Prefer exact causes, IDs, and failure reasons."],
      ["planning_depth", "Planning Depth", 80, "Plan enough to avoid unsafe drift."],
      [
        "verification_level",
        "Verification Level",
        93,
        "Verify before claiming success.",
      ],
      [
        "risk_tolerance",
        "Risk Tolerance",
        12,
        "Fail closed for risky or unclear actions.",
      ],
      [
        "learning_speed",
        "Learning Speed",
        30,
        "Require evidence before changing behaviour.",
      ],
      [
        "question_frequency",
        "Question Frequency",
        32,
        "Ask only when a safe assumption would be risky.",
      ],
    ];
    for (const [key, label, value, description] of traits) {
      await this.store.saveTrait(
        PersonalityTraitRecordSchema.parse({
          id: stableUuid(`${ownerId}:trait:${key}`),
          ownerId,
          key,
          label,
          value,
          description,
          source: "system",
          confidence: 0.95,
          version: 1,
          active: true,
          updatedAt: at,
        }),
      );
    }
    for (const [behaviourKey, state, trigger, action] of [
      [
        "greeting",
        "idle",
        "User greets Alexa.",
        "Respond locally with a concise warm acknowledgement.",
      ],
      ["thanks", "idle", "User says thanks.", "Acknowledge without planning or AI."],
      [
        "stop_listening",
        "focused",
        "User says stop.",
        "Pause voice flow and stay silent until resumed.",
      ],
      [
        "failure",
        "debugging",
        "A governed action fails.",
        "Explain the explicit failure reason and next safe check.",
      ],
      [
        "clarification",
        "learning",
        "Confidence is low or ambiguous.",
        "Ask a deterministic clarification.",
      ],
    ] as const) {
      await this.store.savePersonalityBehaviour(
        PersonalityBehaviourRecordSchema.parse({
          id: stableUuid(`${ownerId}:behaviour:${behaviourKey}`),
          ownerId,
          behaviourKey,
          description: action,
          state,
          trigger,
          action,
          deterministic: true,
          active: true,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    for (const [ruleKey, category, preference] of [
      ["greeting_style", "greeting", "Warm and brief."],
      [
        "acknowledgement_style",
        "acknowledgement",
        "Use concise confirmations like “Understood.”",
      ],
      ["error_style", "error", "Lead with the failure reason and safest next step."],
      [
        "success_style",
        "success",
        "Confirm the completed outcome without overclaiming.",
      ],
      [
        "explanation_depth",
        "explanation",
        "Match depth to task complexity and user context.",
      ],
      ["response_pacing", "pacing", "Avoid unnecessary repetition; keep momentum."],
    ] as const) {
      await this.store.saveCommunicationRule(
        CommunicationRuleRecordSchema.parse({
          id: stableUuid(`${ownerId}:communication-rule:${ruleKey}`),
          ownerId,
          ruleKey,
          category,
          preference,
          active: true,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    for (const [policyKey, enforcement, priority, description] of [
      [
        "never_interrupt_owner",
        "warn",
        75,
        "Do not interrupt unless safety or workflow state requires it.",
      ],
      [
        "confirm_destructive_actions",
        "confirm",
        100,
        "Destructive actions require existing approval workflows.",
      ],
      [
        "silent_after_stop",
        "silence",
        95,
        "After stop listening, stay silent until wake or explicit resume.",
      ],
      [
        "explain_failures",
        "warn",
        90,
        "Every failure response includes an explicit reason.",
      ],
      [
        "never_pretend_knowledge",
        "deny",
        100,
        "Unknown or unverified state must be named, not guessed.",
      ],
      [
        "voice_not_approval",
        "deny",
        100,
        "Voice cannot independently approve high-risk actions.",
      ],
    ] as const) {
      await this.store.saveInteractionPolicy(
        InteractionPolicyRecordSchema.parse({
          id: stableUuid(`${ownerId}:policy:${policyKey}`),
          ownerId,
          policyKey,
          description,
          enforcement,
          priority,
          active: true,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    for (const [preferenceKey, label, value, explanation] of [
      [
        "local_execution",
        "Prefer local execution",
        "strongly_prefer",
        "Use local deterministic capability providers where available.",
      ],
      [
        "minimize_token_usage",
        "Minimize token usage",
        "prefer",
        "Avoid unnecessary AI calls and long responses.",
      ],
      [
        "semantic_integrations",
        "Prefer semantic integrations",
        "strongly_prefer",
        "Use reviewed adapters and semantic objects over UI automation.",
      ],
      [
        "avoid_ui_automation",
        "Avoid UI automation",
        "strongly_prefer",
        "No pixels, OCR, coordinates, or raw input replay.",
      ],
      [
        "deterministic_execution",
        "Prefer deterministic execution",
        "strongly_prefer",
        "Normal workflows should not require AI reasoning.",
      ],
      [
        "reviewed_providers",
        "Prefer reviewed providers",
        "strongly_prefer",
        "macOS actions must route through finite reviewed capabilities.",
      ],
      [
        "existing_workflows",
        "Prefer existing workflows",
        "prefer",
        "Reuse registered skills/templates before composing new ones.",
      ],
    ] as const) {
      await this.store.saveDecisionPreference(
        DecisionPreferenceRecordSchema.parse({
          id: stableUuid(`${ownerId}:decision-preference:${preferenceKey}`),
          ownerId,
          preferenceKey,
          label,
          value,
          explanation,
          confidence: 0.98,
          active: true,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    for (const [styleKey, label] of [
      ["architecture_first", "Architecture-first"],
      ["reusable_code", "Reusable code"],
      ["security_first", "Security-first"],
      ["performance_first", "Performance-first"],
      ["documentation_before_release", "Documentation before release"],
      ["incremental_development", "Incremental development"],
      ["review_before_merge", "Review before merge"],
      ["fail_closed", "Fail closed"],
      ["minimal_ai_dependency", "Minimal AI dependency"],
    ] as const) {
      await this.store.saveWorkingStyle(
        WorkingStyleRecordSchema.parse({
          id: stableUuid(`${ownerId}:working-style:${styleKey}`),
          ownerId,
          styleKey,
          label,
          enabled: true,
          confidence: 0.96,
          source: "system",
          explanation: `${label} is part of the default owner working style.`,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    for (const [situation, userText, assistantText] of [
      ["Greeting", "Hi", "Hey — I’m here."],
      ["Thanks", "Thanks", "Anytime."],
      [
        "Failure",
        "Why didn't that work?",
        "It failed because the provider was not healthy. No macOS action was performed.",
      ],
    ] as const) {
      await this.store.saveStructuredBehaviourExample(
        BehaviourExampleRecordSchema.parse({
          id: stableUuid(`${ownerId}:behaviour-example:${situation}`),
          ownerId,
          situation,
          userText,
          assistantText,
          confidence: 1,
          source: "system",
          createdAt: at,
        }),
      );
    }
    await this.store.savePersonalityStateHistory(
      PersonalityStateHistoryRecordSchema.parse({
        id: stableUuid(`${ownerId}:state-history:idle`),
        ownerId,
        previousState: null,
        state: "idle",
        reason: "Default runtime behaviour state.",
        confidence: 1,
        createdAt: at,
      }),
    );
  }

  async seedVocabulary(ownerId: string, at: string) {
    for (const [term, kind] of [
      ["vs code", "application_name"],
      ["visual studio code", "application_name"],
      ["chrome", "application_name"],
      ["safari", "application_name"],
      ["finder", "application_name"],
      ["terminal", "application_name"],
      ["repository", "technical_vocabulary"],
      ["repo", "technical_vocabulary"],
      ["workspace", "technical_vocabulary"],
      ["project", "technical_vocabulary"],
      ["calendar", "known_word"],
      ["note", "known_word"],
      ["reminder", "known_word"],
      ["workflow", "technical_vocabulary"],
      ["skill", "technical_vocabulary"],
    ] as const) {
      await this.store.saveVocabulary(
        VocabularyEntrySchema.parse({
          id: stableUuid(`${ownerId}:vocab:${term}`),
          ownerId,
          term,
          normalizedTerm: normalize(term),
          kind,
          confidence: 0.95,
          version: 1,
          source: "system",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async seedAliases(ownerId: string, at: string) {
    const aliases: Array<[string, string, AliasDictionaryEntry["targetType"]]> = [
      ["open", "LaunchApplication", "intent"],
      ["launch", "LaunchApplication", "intent"],
      ["start", "LaunchApplication", "intent"],
      ["run", "LaunchApplication", "intent"],
      ["execute", "LaunchApplication", "intent"],
      ["quit", "CloseApplication", "intent"],
      ["exit", "CloseApplication", "intent"],
      ["close", "CloseApplication", "intent"],
      ["terminate", "CloseApplication", "intent"],
      ["repository", "Workspace", "entity"],
      ["repo", "Workspace", "entity"],
      ["project", "Workspace", "entity"],
      ["workspace", "Workspace", "entity"],
    ];
    for (const [phrase, canonical, targetType] of aliases) {
      await this.store.saveAlias(
        AliasDictionaryEntrySchema.parse({
          id: stableUuid(`${ownerId}:alias:${phrase}:${canonical}`),
          ownerId,
          phrase,
          normalizedPhrase: normalize(phrase),
          canonical,
          targetType,
          confidence: 1,
          evidenceCount: 1,
          source: "system",
          active: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async seedSynonyms(ownerId: string, at: string) {
    for (const [term, canonical, synonyms] of [
      ["calendar", "Calendar", ["agenda", "schedule", "events"]],
      ["note", "Document", ["document", "memo", "journal"]],
      ["browser", "Browser", ["chrome", "safari", "web"]],
      ["repository", "Workspace", ["repo", "project", "workspace"]],
    ] as const) {
      await this.store.saveSynonym(
        HumanSynonymEntrySchema.parse({
          id: stableUuid(`${ownerId}:synonym:${term}`),
          ownerId,
          term,
          normalizedTerm: normalize(term),
          synonyms,
          canonical,
          confidence: 0.92,
          source: "system",
          active: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async seedPatterns(ownerId: string, at: string) {
    for (const [name, pattern, intentId, slots, priority] of [
      ["Open X", "open {target}", "OpenObject", ["target"], 90],
      ["Launch X", "launch {application}", "LaunchApplication", ["application"], 95],
      ["Create X", "create {object}", "CreateObject", ["object"], 85],
      ["Find X", "find {object}", "FindObject", ["object"], 85],
      ["Search X", "search {object}", "SearchObject", ["object"], 82],
      ["Delete X", "delete {object}", "DeleteObject", ["object"], 40],
      ["Move X", "move {object}", "MoveObject", ["object"], 70],
      ["Rename X", "rename {object}", "RenameObject", ["object"], 70],
      ["Play X", "play {media}", "PlayMedia", ["media"], 75],
      ["Stop X", "stop {object}", "StopObject", ["object"], 78],
    ] as const) {
      await this.store.savePattern(
        PatternLibraryEntrySchema.parse({
          id: stableUuid(`${ownerId}:pattern:${name}`),
          ownerId,
          name,
          pattern,
          intentId,
          entitySlots: [...slots],
          confidence: priority >= 90 ? 0.96 : 0.86,
          priority,
          active: true,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  async seedRules(ownerId: string, at: string) {
    for (const [trigger, responseAction, template] of [
      ["hello", "greeting_response", "Hey — I’m here."],
      ["hi", "greeting_response", "Hey — I’m here."],
      ["thanks", "acknowledgement", "Anytime."],
      ["thank you", "acknowledgement", "Anytime."],
      ["goodbye", "farewell_response", "See you later."],
      ["stop", "stop_listening", "Stopping the current voice flow."],
      ["cancel", "cancel_workflow", "Cancelling the current governed flow."],
      ["repeat", "repeat_previous_response", "I’ll repeat the previous response."],
      [
        "help",
        "help_response",
        "I can open apps, route commands, search semantic objects, and explain what I understood.",
      ],
    ] as const) {
      await this.store.saveBehaviourRule(
        BehaviourRuleRecordSchema.parse({
          id: stableUuid(`${ownerId}:rule:${trigger}`),
          ownerId,
          trigger,
          normalizedTrigger: normalize(trigger),
          responseAction,
          responseTemplate: template,
          confidence: 1,
          active: true,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
      await this.store.saveResponseTemplate(
        ResponseTemplateRecordSchema.parse({
          id: stableUuid(`${ownerId}:template:${responseAction}`),
          ownerId,
          templateKey: responseAction,
          body: template,
          tone: responseAction === "greeting_response" ? "encouraging" : "neutral",
          active: true,
          version: 1,
          updatedAt: at,
        }),
      );
    }
  }

  async seedProfiles(ownerId: string, profileId: string, at: string) {
    for (const [name, speechStyle, workingStyle, decisionStyle] of [
      [
        "Founder",
        "Concise, strategic, and outcome-led.",
        "Prioritize leverage, clarity, and momentum.",
        "Prefer reusable systems and crisp tradeoffs.",
      ],
      [
        "Developer",
        "Technical, precise, and implementation-aware.",
        "Inspect, implement, verify, document.",
        "Prefer deterministic code paths and strong tests.",
      ],
      [
        "Research",
        "Careful, curious, and evidence-oriented.",
        "Surface assumptions and uncertainty.",
        "Prefer source-backed analysis and slower claims.",
      ],
      [
        "Trading",
        "Focused, risk-aware, and concise.",
        "Prioritize state, timing, and verification.",
        "Fail closed when data or permissions are unclear.",
      ],
      [
        "Presentation",
        "Polished, accessible, and structured.",
        "Explain cleanly for an audience.",
        "Prefer narrative clarity and minimal jargon.",
      ],
      [
        "Focus",
        "Quiet, brief, and low-interruption.",
        "Minimize chatter and protect attention.",
        "Ask fewer questions unless safety requires it.",
      ],
      [
        "Travel",
        "Practical, lightweight, and context-aware.",
        "Prefer mobile-friendly confirmations.",
        "Prioritize timing, location, and reliability.",
      ],
    ] as const) {
      await this.store.saveProfile(
        PersonalityProfileSchema.parse({
          id: stableUuid(`${ownerId}:profile:${name}`),
          ownerId,
          name,
          identity: `Alexa ${name} profile.`,
          speechStyle,
          communicationStyle: speechStyle,
          workingStyle,
          decisionStyle,
          socialRules: [
            "Stay deterministic before AI fallback.",
            "Ask clarifying questions when intent or target is ambiguous.",
          ],
          interactionPolicies: [
            "Never bypass Planner, approvals, policy, or audit.",
            "Voice and gesture cannot approve high-risk work.",
          ],
          active: false,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveCommunicationProfile(
      CommunicationProfileRecordSchema.parse({
        id: stableUuid(`${ownerId}:communication:${profileId}`),
        ownerId,
        profileId,
        sentenceLength: "medium",
        formality: "balanced",
        humor: "light",
        questionStyle: "collaborative",
        updatedAt: at,
      }),
    );
    await this.store.saveWorkingProfile(
      WorkingProfileRecordSchema.parse({
        id: stableUuid(`${ownerId}:working:${profileId}`),
        ownerId,
        profileId,
        pace: "balanced",
        autonomy: "balanced",
        detailLevel: "balanced",
        updatedAt: at,
      }),
    );
    await this.store.saveDecisionProfile(
      DecisionProfileRecordSchema.parse({
        id: stableUuid(`${ownerId}:decision:${profileId}`),
        ownerId,
        profileId,
        riskTolerance: "low",
        clarificationThreshold: 0.6,
        aiFallbackThreshold: 0.6,
        updatedAt: at,
      }),
    );
    await this.store.saveSocialRule(
      SocialRuleRecordSchema.parse({
        id: stableUuid(`${ownerId}:social:clarify`),
        ownerId,
        ruleKey: "clarify_ambiguity",
        description:
          "Ask a concise clarification instead of guessing ambiguous intent or entities.",
        active: true,
        version: 1,
        updatedAt: at,
      }),
    );
  }
}

export class InteractionLearningService {
  async observe(input: {
    store: HumanUnderstandingStore;
    ownerId: string;
    key: string;
    value: string;
    source: "conversation" | "manual" | "workflow" | "correction";
    at: string;
  }) {
    const existing = (await input.store.listPreferences(input.ownerId, 1_000)).find(
      (preference) => preference.key === input.key && preference.value === input.value,
    );
    const evidenceCount = (existing?.evidenceCount ?? 0) + 1;
    const preference = PreferenceLearningRecordSchema.parse({
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      namespace: "preference_memory",
      key: input.key,
      value: input.value,
      evidenceCount,
      confidence: Math.min(0.99, evidenceCount / 30),
      source: input.source,
      firstSeenAt: existing?.firstSeenAt ?? input.at,
      lastSeenAt: input.at,
      decay: 0.01,
      manualOverride: existing?.manualOverride ?? false,
      explanation:
        evidenceCount >= 10
          ? "Preference is becoming statistically reliable, but remains explainable and reversible."
          : "Preference evidence recorded; no behavioural change until threshold is reached.",
      active: evidenceCount >= 10,
    });
    await input.store.savePreference(preference);
    await input.store.savePreferenceEvidence(
      PreferenceEvidenceRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        preferenceId: preference.id,
        evidence: `${input.key}=${input.value}`,
        source: input.source,
        confidence: preference.confidence,
        observedAt: input.at,
      }),
    );
    return preference;
  }
}

export class BehaviourStatisticsService {
  async increment(input: {
    store: HumanUnderstandingStore;
    ownerId: string;
    metricKey: string;
    at: string;
  }) {
    await input.store.saveStatistic(
      InteractionStatisticsRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricKey: input.metricKey,
        value: 1,
        window: "session",
        measuredAt: input.at,
      }),
    );
  }
}

export class HumanUnderstandingService {
  readonly personality: PersonalityCoreService;
  readonly vocabulary = new VocabularyService();
  readonly aliases = new AliasResolutionService();
  readonly synonyms = new SynonymService();
  readonly patterns = new PatternRecognitionService();
  readonly intents = new IntentClassificationService();
  readonly confidence = new ConfidenceEngine();
  readonly states = new ConversationStateService();
  readonly rules = new BehaviourRuleEngine();
  readonly learning = new InteractionLearningService();
  readonly statistics = new BehaviourStatisticsService();
  readonly semanticRetrieval: SemanticRetrievalService19A;
  readonly clarifications = new ClarificationService();
  readonly corpus: CorpusRuntimeService;

  constructor(
    readonly store: HumanUnderstandingStore,
    readonly memoryStore: MemoryStore,
    readonly retrieval: RetrievalService,
    readonly applicationAdapters: ApplicationAdapterStore,
    readonly applicationIntelligence: ApplicationIntelligenceStore,
    readonly workspaceIntelligence: WorkspaceIntelligenceStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly knowledgeGraph?: PersonalKnowledgeGraphService,
    readonly aiRouter?: AIRouterService,
  ) {
    this.personality = new PersonalityCoreService(store, now);
    this.semanticRetrieval = new SemanticRetrievalService19A(memoryStore, retrieval);
    this.corpus = new CorpusRuntimeService(store, memoryStore, now);
  }

  async dashboard(ownerId: string) {
    const profile = await this.personality.profile(ownerId);
    const identity = await this.store.getActiveIdentity(ownerId);
    if (!identity) {
      throw new Error("PERSONALITY_IDENTITY_UNAVAILABLE");
    }
    const [
      traits,
      behaviours,
      communicationRules,
      interactionPolicies,
      decisionPreferences,
      workingStyles,
      structuredBehaviourExamples,
      learningEvents,
      preferenceConfidence,
      simulations,
      stateHistory,
      responseExplanations,
      states,
      behaviourRules,
      conversationStates,
      conversationHistory,
      stats,
      preferences,
      evidence,
      aliases,
      synonyms,
      vocabulary,
      patterns,
      clarifications,
      confidenceHistory,
      retrievalHistory,
      templates,
      socialRules,
      communicationProfiles,
      workingProfiles,
      decisionProfiles,
      versions,
      bootstraps,
      intentExamples,
      behaviourExamples,
    ] = await Promise.all([
      this.store.listTraits(ownerId, 100),
      this.store.listPersonalityBehaviours(ownerId, 200),
      this.store.listCommunicationRules(ownerId, 200),
      this.store.listInteractionPolicies(ownerId, 200),
      this.store.listDecisionPreferences(ownerId, 200),
      this.store.listWorkingStyles(ownerId, 200),
      this.store.listStructuredBehaviourExamples(ownerId, 200),
      this.store.listLearningEvents(ownerId, 500),
      this.store.listPreferenceConfidence(ownerId, 500),
      this.store.listPersonalitySimulations(ownerId, 100),
      this.store.listPersonalityStateHistory(ownerId, 500),
      this.store.listResponseExplanations(ownerId, 100),
      this.store.listPersonalityStates(ownerId, 100),
      this.store.listBehaviourRules(ownerId, 500),
      this.store.listConversationStates(ownerId, 500),
      this.store.listUnderstandings(ownerId, 100),
      this.store.listStatistics(ownerId, 500),
      this.store.listPreferences(ownerId, 500),
      this.store.listPreferenceEvidence(ownerId, 500),
      this.store.listAliases(ownerId, 1_000),
      this.store.listSynonyms(ownerId, 1_000),
      this.store.listVocabulary(ownerId, 2_000),
      this.store.listPatterns(ownerId, 500),
      this.store.listClarifications(ownerId, 500),
      this.store.listConfidence(ownerId, 500),
      this.store.listRetrieval(ownerId, 500),
      this.store.listResponseTemplates(ownerId, 500),
      this.store.listSocialRules(ownerId, 500),
      this.store.listCommunicationProfiles(ownerId, 50),
      this.store.listWorkingProfiles(ownerId, 50),
      this.store.listDecisionProfiles(ownerId, 50),
      this.store.listPersonalityVersions(ownerId, 200),
      this.store.listBootstraps(ownerId, 50),
      this.memoryStore.searchMemories(ownerId, { q: "intent", limit: 100 }),
      this.memoryStore.searchMemories(ownerId, { q: "behaviour", limit: 100 }),
    ]);
    const corpus = await this.corpus.dashboard(ownerId);
    return HumanUnderstandingDashboardResponseSchema.parse({
      profile,
      identity,
      traits,
      behaviours,
      communicationRules,
      interactionPolicies,
      decisionPreferences,
      workingStyles,
      structuredBehaviourExamples,
      learningEvents,
      preferenceConfidence,
      personalitySimulations: simulations,
      personalityStateHistory: stateHistory,
      responseExplanations,
      corpus,
      states,
      behaviourRules,
      conversationStates,
      conversationHistory,
      interactionStatistics: stats,
      preferenceLearning: preferences,
      preferenceEvidence: evidence,
      aliases,
      synonyms,
      vocabulary,
      patterns,
      intentExamples,
      intentStatistics: stats.filter((item) => item.metricKey.includes("intent")),
      clarifications,
      confidenceHistory,
      retrievalHistory,
      behaviourExamples,
      responseTemplates: templates,
      socialRules,
      communicationProfiles,
      workingProfiles,
      decisionProfiles,
      personalityVersions: versions,
      bootstrapProfiles: bootstraps,
      lastUnderstanding: conversationHistory[0] ?? null,
      deterministicFirst: true,
      usesExistingVectorDatabase: true,
      llmIsCapabilityProviderOnly: true,
    });
  }

  async bootstrap(input: { ownerId: string; requestId: string; ipAddress: string }) {
    const profile = await new PersonalityBootstrapService(
      this.store,
      this.now,
    ).bootstrap(input.ownerId);
    await this.audit({
      eventType: "CONVERSATION_PERSONA_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason:
        "Default model-independent personality and deterministic language packs loaded.",
      requestId: input.requestId,
      metadata: { profileId: profile.id, version: profile.version },
    });
    return this.dashboard(input.ownerId);
  }

  async understand(input: {
    ownerId: string;
    body: unknown;
    requestId?: string;
    ipAddress: string;
  }): Promise<HumanUnderstandingResult> {
    await this.personality.profile(input.ownerId);
    const parsed = HumanUnderstandingRequestSchema.parse(input.body);
    const requestId = input.requestId ?? crypto.randomUUID();
    const started = performance.now();
    const at = this.now().toISOString();
    const context: PipelineContext = {
      ownerId: input.ownerId,
      requestId,
      source: parsed.source,
      ipAddress: input.ipAddress,
      at,
      stages: [],
    };
    await this.states.transition({
      store: this.store,
      ownerId: input.ownerId,
      previous: null,
      state: "UNDERSTANDING",
      reason: "Input entered Human Understanding Layer.",
      at,
    });

    const normalizedText = this.stage(
      context,
      "normalization",
      parsed.text,
      () => normalizeCorpusUtterance(parsed.text) || normalize(parsed.text),
    );
    const negativeExampleMatches = await this.timed(
      context,
      "negative_examples",
      normalizedText,
      () => this.corpus.negativeMatches(input.ownerId, normalizedText),
    );
    const nonExecutionCategory = this.stage(
      context,
      "deterministic_non_execution",
      normalizedText,
      () => deterministicNonExecution(normalizedText),
    );
    const mustNotExecute =
      negativeExampleMatches.length > 0 || nonExecutionCategory !== null;
    const tokens = this.stage(context, "tokenizer", normalizedText, () =>
      tokenize(normalizedText),
    );
    const vocabularyMatches = await this.timed(context, "vocabulary", tokens, () =>
      this.vocabulary.resolve(this.store, input.ownerId, tokens),
    );
    const aliasMatches = await this.timed(context, "aliases", normalizedText, () =>
      this.aliases.resolve(this.store, input.ownerId, normalizedText),
    );
    const synonymMatches = await this.timed(context, "synonyms", tokens, () =>
      this.synonyms.resolve(this.store, input.ownerId, tokens),
    );
    const patternMatches = await this.timed(
      context,
      "pattern_recognition",
      normalizedText,
      () => this.patterns.recognize(this.store, input.ownerId, normalizedText),
    );
    const behaviourRule = await this.timed(
      context,
      "behaviour_rules",
      normalizedText,
      () => this.rules.evaluate(this.store, input.ownerId, normalizedText),
    );
    const intentCandidates = this.stage(
      context,
      "intent_classification",
      {
        aliasMatches,
        patternMatches,
        behaviourRule,
        negativeExampleMatches,
      },
      () =>
        mustNotExecute
          ? [
              {
                intentId: nonExecutionCategory
                  ? `NonExecution.${nonExecutionCategory}`
                  : "NonExecution.NegativeExample",
                confidence: 0.99,
                requiredEntities: [],
                requiredContext: [],
                requiredPermissions: [],
                candidateApplications: [],
                candidateWorkflows: [],
                fallbackStrategy: "execute" as const,
                explanation:
                  nonExecutionCategory
                    ? `Deterministic ${nonExecutionCategory.toLowerCase()} safety rule matched before executable intent classification.`
                    : negativeExampleMatches[0]?.reason ??
                      "Matched a negative corpus example; execution must not happen.",
              },
            ]
          : this.intents.classify({
              aliases: aliasMatches,
              patterns: patternMatches,
              rule: behaviourRule,
              normalizedText,
            }),
    );
    const entities = this.stage(
      context,
      "entity_resolution",
      {
        vocabularyMatches,
        aliasMatches,
        synonymMatches,
        patternMatches,
      },
      () =>
        resolveEntities(
          normalizedText,
          tokens,
          vocabularyMatches,
          aliasMatches,
          synonymMatches,
        ),
    );
    const resolvedContext = await this.timed(
      context,
      "context_resolution",
      parsed,
      () =>
        new ContextResolutionService().resolve({
          body: parsed,
          applicationAdapters: this.applicationAdapters,
          applicationIntelligence: this.applicationIntelligence,
          workspaceIntelligence: this.workspaceIntelligence,
          ownerId: input.ownerId,
        }),
    );
    const knowledgeContext = this.knowledgeGraph
      ? await this.timed(context, "knowledge_graph_context", normalizedText, () =>
          this.knowledgeGraph!.context(input.ownerId, {
            text: normalizedText,
            depth: 1,
            limit: 20,
          }),
        )
      : null;
    const retrievalBundle = await this.timed(
      context,
      "vector_retrieval",
      normalizedText,
      () =>
        this.semanticRetrieval.retrieve(
          input.ownerId,
          requestId,
          normalizedText,
          memoryNamespaces,
        ),
    );
    for (const item of retrievalBundle) await this.store.saveRetrieval(item.retrieval);
    const selectedIntent = intentCandidates[0] ?? null;
    const confidence = this.confidence.calculate({
      ownerId: input.ownerId,
      requestId,
      vocabulary: score(vocabularyMatches.length, Math.max(1, tokens.length)),
      alias: aliasMatches[0]?.confidence ?? 0,
      synonym: synonymMatches[0]?.confidence ?? 0,
      pattern: patternMatches[0]?.confidence ?? 0,
      behaviour: behaviourRule?.confidence ?? 0,
      intent: selectedIntent?.confidence ?? 0,
      entity: entities[0]?.confidence ?? 0,
      context: 0.9,
      memory: retrievalBundle[0]?.retrieval.confidence ?? 0,
      at,
    });
    const needsClarification =
      !mustNotExecute &&
      (hasAmbiguousActionTarget(normalizedText) ||
        confidence.band === "ask_clarification" ||
        confidence.band === "minor_clarification" ||
        (intentCandidates.length > 1 &&
          Math.abs(intentCandidates[0]!.confidence - intentCandidates[1]!.confidence) <
            0.04));
    const clarification = needsClarification
      ? this.clarifications.create({
          ownerId: input.ownerId,
          requestId,
          text: parsed.text,
          candidates: intentCandidates,
          entities,
          at,
        })
      : null;
    if (clarification) await this.store.saveClarification(clarification);
    const localIntentInterpretationSchema = z
      .object({
        intent: z.string().trim().min(1).max(160).nullable(),
        entities: z.record(z.string(), z.json()),
        confidence: z.number().min(0).max(1),
        requiresClarification: z.boolean(),
        clarificationCandidates: z
          .array(
            z
              .object({
                type: z.string(),
                id: z.string().optional(),
                label: z.string(),
              })
              .strict(),
          )
          .max(20),
        reasoningRequired: z.boolean().optional(),
        nonExecution: z.boolean().optional(),
      })
      .strict();
    let localInterpretation: z.infer<typeof localIntentInterpretationSchema> | null =
      null;
    if (
      !parsed.simulateOnly &&
      !mustNotExecute &&
      confidence.band === "ai_router" &&
      this.aiRouter
    ) {
      try {
        const routed = await this.aiRouter.executeStructured({
          requestId,
          purpose: "INTERPRETATION",
          requestedRole: "FAST_INTERPRETER",
          input: [{ role: "user", content: [{ type: "text", text: parsed.text }] }],
          outputMode: "STRUCTURED",
          risk: "LOW",
          privacy: "STANDARD",
          locality: "PREFER_LOCAL",
          economicContext: {
            ownerId: input.ownerId,
            purpose: "INTERPRETATION",
            autonomyMode: "INTERACTIVE",
            priority: "IMPORTANT",
          },
          allowClarification: true,
          allowFallback: true,
          schemaName: "LocalIntentInterpretation",
          jsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: ["string", "null"] },
              entities: { type: "object", additionalProperties: true },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              requiresClarification: { type: "boolean" },
              clarificationCandidates: { type: "array" },
              reasoningRequired: { type: "boolean" },
              nonExecution: { type: "boolean" },
            },
            required: [
              "intent",
              "entities",
              "confidence",
              "requiresClarification",
              "clarificationCandidates",
            ],
          },
          schema: localIntentInterpretationSchema,
        });
        localInterpretation = routed.structuredOutput ?? null;
      } catch {
        localInterpretation = null;
      }
    }
    const conversationState: HumanConversationState = behaviourRule
      ? behaviourRule.responseAction === "stop_listening"
        ? "PAUSED"
        : behaviourRule.responseAction === "cancel_workflow"
          ? "CANCELLED"
          : "COMPLETED"
      : mustNotExecute
        ? "COMPLETED"
        : clarification
          ? "CLARIFYING"
          : confidence.band === "ai_router"
            ? "WAITING"
            : "PLANNING";
    await this.states.transition({
      store: this.store,
      ownerId: input.ownerId,
      previous: "UNDERSTANDING",
      state: conversationState,
      reason: clarification
        ? "Deterministic clarification required."
        : "Understanding completed deterministically.",
      at,
    });
    const [
      activePersonality,
      personalityIdentity,
      personalityTraits,
      interactionPolicies,
      decisionPreferences,
      workingStyles,
      communicationRules,
      runtimeStateHistory,
    ] = await Promise.all([
      this.store.getActiveProfile(input.ownerId),
      this.store.getActiveIdentity(input.ownerId),
      this.store.listTraits(input.ownerId, 100),
      this.store.listInteractionPolicies(input.ownerId, 200),
      this.store.listDecisionPreferences(input.ownerId, 200),
      this.store.listWorkingStyles(input.ownerId, 200),
      this.store.listCommunicationRules(input.ownerId, 200),
      this.store.listPersonalityStateHistory(input.ownerId, 1),
    ]);
    const plannerInput = {
      intent: selectedIntent,
      entities,
      confidence,
      behaviourRule,
      conversationState,
      context: resolvedContext,
      knowledgeContext: knowledgeContext
        ? {
            resolvedEntities: knowledgeContext.resolvedEntities.map((entity) => ({
              id: entity.id,
              type: entity.entityType,
              name: entity.displayName,
              confidence: entity.confidence,
            })),
            relationships: knowledgeContext.relationships.map((relationship) => ({
              id: relationship.id,
              type: relationship.relationshipType,
              sourceEntityId: relationship.sourceEntityId,
              targetEntityId: relationship.targetEntityId,
              confidence: relationship.confidence,
            })),
            relevantFacts: knowledgeContext.relevantFacts.map((fact) => ({
              id: fact.id,
              entityId: fact.subjectEntityId,
              predicate: fact.predicate,
              confidence: fact.confidence,
            })),
            sourceConfidence: knowledgeContext.sourceConfidence,
            explanation: knowledgeContext.explanation,
          }
        : null,
      retrievedMemories: retrievalBundle.map((item) => ({
        id: item.memory.id,
        title: item.memory.title,
        confidence: item.memory.confidence,
      })),
      personality: activePersonality,
      personalityCore: {
        identity: personalityIdentity,
        traits: personalityTraits.filter((item) => item.active),
        interactionPolicies: interactionPolicies.filter((item) => item.active),
        decisionPreferences: decisionPreferences.filter((item) => item.active),
        workingStyles: workingStyles.filter((item) => item.enabled),
        communicationRules: communicationRules.filter((item) => item.active),
        currentBehaviourState: runtimeStateHistory[0]?.state ?? "idle",
        modelIndependent: true,
        aiOwnsPersonality: false,
      },
      mustNotExecute,
      nonExecutionCategory,
      negativeExampleMatches: negativeExampleMatches.map((entry) => ({
        id: entry.id,
        utterance: entry.utterance,
        reason: entry.reason,
        blockedIntentCandidates: entry.blockedIntentCandidates,
      })),
      decomposition: decomposeMultiIntent(normalizedText),
      currentFocus: resolvedContext.currentApplication,
      currentWorkflow: resolvedContext.currentWorkflow,
      currentApplication: resolvedContext.currentApplication,
      workspaceContext: resolvedContext.currentWorkspace,
      localInterpretation,
    };
    const result = HumanUnderstandingResultSchema.parse({
      requestId,
      ownerId: input.ownerId,
      source: parsed.source,
      originalText: parsed.text,
      normalizedText,
      tokens,
      vocabularyMatches,
      aliasMatches,
      synonymMatches,
      patternMatches,
      behaviourRule,
      intentCandidates,
      selectedIntent,
      entities,
      conversationState,
      context: resolvedContext,
      retrievedMemories: retrievalBundle.map((item) => item.memory),
      confidence,
      clarification,
      plannerInput,
      aiFallbackReason: mustNotExecute
        ? null
        : confidence.band === "ai_router"
          ? "Deterministic understanding confidence fell below the configured AI fallback threshold."
          : null,
      negativeExampleMatches,
      stages: context.stages,
      latencyMs: elapsed(started),
      createdAt: at,
    });
    await this.store.saveConfidence(confidence);
    await this.store.saveUnderstanding(result);
    await this.statistics.increment({
      store: this.store,
      ownerId: input.ownerId,
      metricKey: `human_understanding.${result.conversationState.toLowerCase()}`,
      at,
    });
    await this.audit({
      eventType:
        confidence.band === "ai_router"
          ? "SEMANTIC_RETRIEVAL_ESCALATED"
          : "SEMANTIC_RETRIEVAL_RESOLVED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Human Understanding Layer completed deterministic pipeline.",
      requestId,
      metadata: {
        source: parsed.source,
        confidence: confidence.overall,
        band: confidence.band,
        conversationState,
        aiFallbackRequired: confidence.band === "ai_router",
      },
    });
    return result;
  }

  async export(ownerId: string) {
    return PersonalityExportResponseSchema.parse({
      exportedAt: this.now().toISOString(),
      dashboard: await this.dashboard(ownerId),
    });
  }

  async reset(input: { ownerId: string; requestId: string; ipAddress: string }) {
    const dashboard = await this.bootstrap(input);
    await this.audit({
      eventType: "CONVERSATION_PERSONA_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason:
        "Personality reset requested; bootstrap reapplied without deleting records.",
      requestId: input.requestId,
    });
    return dashboard;
  }

  async compareVersions(ownerId: string, body: unknown) {
    const parsed = VersionCompareRequestSchema.parse(body);
    const versions = await this.store.listPersonalityVersions(ownerId, 200);
    const left = versions.find((version) => version.version === parsed.leftVersion);
    const right = versions.find((version) => version.version === parsed.rightVersion);
    return VersionCompareResponseSchema.parse({
      leftVersion: parsed.leftVersion,
      rightVersion: parsed.rightVersion,
      differences: [
        left?.changeSummary ?? "Left version not found.",
        right?.changeSummary ?? "Right version not found.",
      ].filter((item, index, array) => array.indexOf(item) === index),
    });
  }

  async switchProfile(input: {
    ownerId: string;
    profileName: string;
    requestId: string;
    ipAddress: string;
  }) {
    await this.personality.profile(input.ownerId);
    const at = this.now().toISOString();
    const profiles = await this.store.listProfiles(input.ownerId, 50);
    const selected = profiles.find(
      (profile) => normalize(profile.name) === normalize(input.profileName),
    );
    if (!selected) throw new Error("PERSONALITY_PROFILE_NOT_FOUND");
    for (const profile of profiles) {
      await this.store.saveProfile(
        PersonalityProfileSchema.parse({
          ...profile,
          active: profile.id === selected.id,
          updatedAt: at,
        }),
      );
    }
    await this.audit({
      eventType: "CONVERSATION_PERSONA_UPDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Personality profile switched deterministically.",
      requestId: input.requestId,
      metadata: { profileName: selected.name },
    });
    return this.dashboard(input.ownerId);
  }

  async recordLearning(input: {
    ownerId: string;
    key: string;
    value: string;
    source: "conversation" | "manual" | "workflow" | "correction";
    requestId: string;
    ipAddress: string;
  }) {
    const at = this.now().toISOString();
    const preference = await this.learning.observe({
      store: this.store,
      ownerId: input.ownerId,
      key: input.key,
      value: input.value,
      source: input.source,
      at,
    });
    await this.store.saveLearningEvent(
      PersonalityLearningEventRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        observedBehaviour: `${input.key}=${input.value}`,
        evidenceCount: preference.evidenceCount,
        confidence: preference.confidence,
        firstSeenAt: preference.firstSeenAt,
        lastSeenAt: preference.lastSeenAt,
        decayRate: preference.decay,
        manualOverride: preference.manualOverride,
        reason: preference.explanation,
        proposedChange: preference.active
          ? `Activate preference ${preference.key}=${preference.value}`
          : null,
        applied: preference.active,
      }),
    );
    await this.store.savePreferenceConfidence(
      PreferenceConfidenceRecordSchema.parse({
        id: stableUuid(
          `${input.ownerId}:preference-confidence:${input.key}:${input.value}`,
        ),
        ownerId: input.ownerId,
        preferenceKey: input.key,
        currentValue: preference.active ? input.value : "unchanged",
        proposedValue: preference.active ? null : input.value,
        evidenceCount: preference.evidenceCount,
        confidence: preference.confidence,
        explanation: preference.explanation,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "LEARNING_EVENT_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason:
        "Deterministic preference evidence recorded; no single interaction can rewrite personality.",
      requestId: input.requestId,
      metadata: {
        key: input.key,
        active: preference.active,
        evidenceCount: preference.evidenceCount,
      },
    });
    return preference;
  }

  async simulatePersonality(input: { ownerId: string; text: string }) {
    await this.personality.profile(input.ownerId);
    const at = this.now().toISOString();
    const modes = [
      ["Founder", "Outcome first; concise strategic framing."],
      ["Developer", "Implementation-first with verification notes."],
      ["Research", "Careful framing, assumptions, and uncertainty."],
      ["Presentation", "Polished explanation with audience-friendly pacing."],
      ["Focus", "Shortest viable confirmation with minimal interruption."],
    ] as const;
    const simulations = [];
    for (const [profileName, style] of modes) {
      const record = PersonalitySimulationRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        input: input.text,
        profileName,
        responsePreview: `${profileName} mode: ${style} Input understood as “${input.text}.”`,
        traitsApplied: [
          "directness",
          "precision",
          "verification_level",
          "question_frequency",
        ],
        aiUsed: false,
        createdAt: at,
      });
      await this.store.savePersonalitySimulation(record);
      simulations.push(record);
    }
    return simulations;
  }

  async explainResponse(input: {
    ownerId: string;
    response: string;
    plannerConfidence?: number | null;
    aiUsed?: boolean;
  }) {
    const at = this.now().toISOString();
    const profile = await this.personality.profile(input.ownerId);
    const [traits, policies, communicationRules, decisionPreferences] =
      await Promise.all([
        this.store.listTraits(input.ownerId, 10),
        this.store.listInteractionPolicies(input.ownerId, 10),
        this.store.listCommunicationRules(input.ownerId, 10),
        this.store.listDecisionPreferences(input.ownerId, 10),
      ]);
    const record = ResponseExplanationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      response: input.response,
      influencedBy: [
        `Profile: ${profile.name}`,
        ...traits
          .filter((item) => item.active)
          .slice(0, 4)
          .map((item) => `Trait ${item.label}: ${item.value}%`),
        ...communicationRules
          .filter((item) => item.active)
          .slice(0, 3)
          .map((item) => `Communication: ${item.preference}`),
        ...policies
          .filter((item) => item.active)
          .slice(0, 3)
          .map((item) => `Policy: ${item.policyKey}`),
        ...decisionPreferences
          .filter((item) => item.active)
          .slice(0, 3)
          .map((item) => `Decision preference: ${item.label}`),
      ],
      aiUsed: input.aiUsed ?? false,
      plannerConfidence: input.plannerConfidence ?? null,
      profileName: profile.name,
      createdAt: at,
    });
    await this.store.saveResponseExplanation(record);
    return record;
  }

  private stage<T>(
    context: PipelineContext,
    stage: string,
    input: unknown,
    fn: () => T,
  ): T {
    const started = performance.now();
    const output = fn();
    context.stages.push(
      UnderstandingStageRecord({
        context,
        stage,
        input,
        output,
        confidence: confidenceForOutput(output),
        timingMs: elapsed(started),
      }),
    );
    return output;
  }

  private async timed<T>(
    context: PipelineContext,
    stage: string,
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    const output = await fn();
    context.stages.push(
      UnderstandingStageRecord({
        context,
        stage,
        input,
        output,
        confidence: confidenceForOutput(output),
        timingMs: elapsed(started),
      }),
    );
    return output;
  }
}

const UnderstandingStageRecord = (input: {
  context: PipelineContext;
  stage: string;
  input: unknown;
  output: unknown;
  confidence: number;
  timingMs: number;
}) =>
  ({
    id: crypto.randomUUID(),
    ownerId: input.context.ownerId,
    requestId: input.context.requestId,
    stage: input.stage,
    input: sanitizeJson(input.input),
    output: sanitizeJson(input.output),
    confidence: input.confidence,
    explanation: `${input.stage} completed deterministically without AI authority.`,
    timingMs: input.timingMs,
    auditEventType: `HUMAN_UNDERSTANDING_${input.stage.toUpperCase()}`,
    createdAt: input.context.at,
  }) satisfies UnderstandingStageRecord;

type JsonValue = z.infer<ReturnType<typeof z.json>>;

const sanitizeJson = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value ?? null)) as JsonValue;

const confidenceForOutput = (output: unknown) => {
  if (Array.isArray(output)) return output.length ? 0.9 : 0.2;
  if (output && typeof output === "object") return 0.9;
  if (typeof output === "string") return output ? 0.9 : 0.1;
  return output ? 0.8 : 0.2;
};

const patternMatches = (pattern: PatternLibraryEntry, normalizedText: string) => {
  const prefix = normalize(pattern.pattern.split("{")[0] ?? "");
  return prefix ? normalizedText.startsWith(prefix) : false;
};

const permissionsForIntent = (intentId: string) => {
  if (/delete/i.test(intentId)) return ["approval.required", "destructive.protected"];
  if (/create|patch|update|move|rename/i.test(intentId)) return ["planner.required"];
  if (/launch|open|find|search/i.test(intentId)) return ["planner.required"];
  return [];
};

const entitySlotsForIntent = (intentId: string) => {
  if (/application/i.test(intentId)) return ["application"];
  if (/object|find|search|open|create/i.test(intentId)) return ["target"];
  return [];
};

const applicationsForText = (text: string): string[] =>
  (
    [
      ["vs code", "VS Code"],
      ["visual studio code", "VS Code"],
      ["chrome", "Chrome"],
      ["safari", "Safari"],
      ["finder", "Finder"],
      ["terminal", "Terminal"],
    ] satisfies Array<[string, string]>
  )
    .filter(([needle]) => text.includes(needle))
    .map((item) => item[1]);

const workflowsForText = (text: string): string[] =>
  (
    [
      ["development", "Development Session"],
      ["meeting", "Meeting Preparation"],
      ["startup", "Morning Startup"],
    ] satisfies Array<[string, string]>
  )
    .filter(([needle]) => text.includes(needle))
    .map((item) => item[1]);

const resolveEntities = (
  normalizedText: string,
  tokens: string[],
  vocabulary: Awaited<ReturnType<VocabularyService["resolve"]>>,
  aliases: Awaited<ReturnType<AliasResolutionService["resolve"]>>,
  synonyms: Awaited<ReturnType<SynonymService["resolve"]>>,
): ResolvedHumanEntity[] => {
  const entities: ResolvedHumanEntity[] = [];
  for (const entry of vocabulary) {
    const type =
      entry.kind === "application_name"
        ? "application"
        : entry.kind === "project_name"
          ? "project"
          : "semantic_object";
    entities.push({
      type,
      value: entry.term,
      normalizedValue: entry.normalizedTerm,
      source: "vocabulary",
      confidence: entry.confidence,
      explanation: `Matched vocabulary ${entry.kind}.`,
    });
  }
  for (const alias of aliases.filter(
    (entry) => entry.targetType === "entity" || entry.targetType === "application",
  )) {
    entities.push({
      type: alias.targetType === "application" ? "application" : "semantic_object",
      value: alias.canonical,
      normalizedValue: normalize(alias.canonical),
      source: "alias",
      confidence: alias.confidence,
      explanation: `Resolved alias "${alias.phrase}".`,
    });
  }
  for (const synonym of synonyms) {
    entities.push({
      type:
        synonym.canonical === "Calendar"
          ? "calendar_event"
          : synonym.canonical === "Document"
            ? "note"
            : "semantic_object",
      value: synonym.canonical,
      normalizedValue: normalize(synonym.canonical),
      source: "synonym",
      confidence: synonym.confidence,
      explanation: `Resolved synonym for "${synonym.term}".`,
    });
  }
  const remainder = normalizedText
    .split(" ")
    .filter((token) => !tokens.slice(0, 1).includes(token))
    .join(" ");
  if (remainder && entities.length === 0) {
    entities.push({
      type: "unknown",
      value: remainder,
      normalizedValue: remainder,
      source: "pattern",
      confidence: 0.55,
      explanation: "Captured unmatched target text from the command phrase.",
    });
  }
  return uniqueEntities(entities).slice(0, 50);
};

const uniqueEntities = (entities: ResolvedHumanEntity[]) => {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.normalizedValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const decomposeMultiIntent = (normalizedText: string) => {
  const parts = normalizedText
    .split(/\b(?:and then|then|and)\b/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 10);
  if (parts.length <= 1) return [];
  return parts.map((part, index) => ({
    order: index + 1,
    text: part,
    candidateIntent:
      part.includes("open") || part.includes("launch")
        ? "LAUNCH_OR_OPEN"
        : part.includes("test")
          ? "RUN_TESTS"
          : part.includes("save")
            ? "SAVE"
            : part.includes("find") || part.includes("search")
              ? "SEARCH"
              : "UNKNOWN_STEP",
    deterministic: true,
  }));
};

const memoryNamespaces = [
  "conversation_memory",
  "behaviour_memory",
  "vocabulary_memory",
  "command_memory",
  "workflow_memory",
  "project_memory",
  "people_memory",
  "company_memory",
  "preference_memory",
  "correction_memory",
  "application_memory",
  "workspace_memory",
];
