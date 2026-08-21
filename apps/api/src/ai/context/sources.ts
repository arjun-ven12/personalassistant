import type {
  CognitiveContextCandidate,
  CognitiveContextRequest,
  CognitiveContextSourceType,
} from "@alexa-control/shared";
import type { AgentStore } from "../../agents/store.js";
import type { ApplicationIntelligenceStore } from "../../application-intelligence/store.js";
import type { HumanUnderstandingStore } from "../../human-understanding/store.js";
import type { KnowledgeGraphStore } from "../../knowledge-graph/store.js";
import type { LearningEngineStore } from "../../learning-engine/store.js";
import type { MemoryStore } from "../../memory/store.js";
import type { RepositoryStore } from "../../repositories/store.js";
import type { WorkflowStore } from "../../workflows/store.js";
import type { WorkspaceIntelligenceStore } from "../../workspace-intelligence/store.js";
import type {
  CognitiveContextRuntime,
  CognitiveContextSource,
  CognitiveContextSourceDescriptor,
  CognitiveContextSourceResult,
} from "./service.js";

type SourceDependencies = {
  memoryStore: MemoryStore;
  knowledgeGraphStore: KnowledgeGraphStore;
  learningEngineStore: LearningEngineStore;
  humanUnderstandingStore: HumanUnderstandingStore;
  repositoryStore: RepositoryStore;
  workflowStore: WorkflowStore;
  agentStore: AgentStore;
  workspaceIntelligenceStore: WorkspaceIntelligenceStore;
  applicationIntelligenceStore: ApplicationIntelligenceStore;
};

const estimateTokens = (value: unknown) =>
  Math.max(1, Math.ceil(JSON.stringify(value).length / 4));
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const preferenceSubject = (value: string) =>
  normalize(value).replace(/^prefer(?:red|ence)?\s+/, "");
const elapsed = (started: number) =>
  Math.round((performance.now() - started) * 100) / 100;
const descriptor = (
  sourceType: CognitiveContextSourceType,
  criticality: CognitiveContextSourceDescriptor["criticality"],
  scope: Partial<
    Pick<
      CognitiveContextSourceDescriptor,
      "supportsProjectScope" | "supportsWorkflowScope" | "supportsAgentScope"
    >
  > = {},
): CognitiveContextSourceDescriptor => ({
  sourceType,
  criticality,
  supportsOwnerScope: true,
  defaultTrustLevel: "TRUSTED",
  defaultSensitivity: "PRIVATE",
  timeoutMs: 1_000,
  ...scope,
});

const result = (
  started: number,
  candidates: CognitiveContextCandidate[],
  warnings?: string[],
): CognitiveContextSourceResult => ({
  candidates,
  status: warnings?.length ? "DEGRADED" : "SUCCESS",
  ...(warnings?.length ? { warnings } : {}),
  latencyMs: elapsed(started),
});

const candidate = (
  input: Omit<
    CognitiveContextCandidate,
    "relevanceScore" | "estimatedTokens" | "mandatory"
  > & { mandatory?: boolean },
): CognitiveContextCandidate => ({
  ...input,
  relevanceScore: 0.5,
  estimatedTokens: estimateTokens(input.content),
  mandatory: input.mandatory ?? false,
});

const taskMatches = (task: string | undefined, values: string[]) => {
  const normalizedTask = normalize(task ?? "");
  return (
    !normalizedTask ||
    values.some((value) =>
      normalize(value)
        .split(" ")
        .some((word) => word.length > 2 && normalizedTask.includes(word)),
    )
  );
};

class FunctionalSource implements CognitiveContextSource {
  constructor(
    readonly sourceType: CognitiveContextSourceType,
    readonly descriptor: CognitiveContextSourceDescriptor,
    private readonly operation: (
      request: CognitiveContextRequest,
      runtime: CognitiveContextRuntime,
    ) => Promise<CognitiveContextSourceResult>,
  ) {}
  retrieve(request: CognitiveContextRequest, runtime: CognitiveContextRuntime) {
    return this.operation(request, runtime);
  }
}

export const createProductionContextSources = (
  dependencies: SourceDependencies,
): CognitiveContextSource[] => {
  const personality = new FunctionalSource(
    "PERSONALITY",
    descriptor("PERSONALITY", "IMPORTANT"),
    async (request) => {
      const started = performance.now();
      const [profile, rules, styles, traits] = await Promise.all([
        dependencies.humanUnderstandingStore.getActiveProfile(request.ownerId),
        dependencies.humanUnderstandingStore.listCommunicationRules(
          request.ownerId,
          12,
        ),
        dependencies.humanUnderstandingStore.listWorkingStyles(request.ownerId, 12),
        dependencies.humanUnderstandingStore.listTraits(request.ownerId, 12),
      ]);
      if (!profile && !rules.length && !styles.length && !traits.length)
        return result(started, []);
      const content = {
        profile: profile
          ? {
              identity: profile.identity,
              speechStyle: profile.speechStyle,
              communicationStyle: profile.communicationStyle,
              workingStyle: profile.workingStyle,
              decisionStyle: profile.decisionStyle,
              version: profile.version,
            }
          : null,
        communicationRules: rules
          .filter((item) => item.active)
          .slice(0, 8)
          .map((item) => ({
            category: item.category,
            preference: item.preference,
            version: item.version,
          })),
        workingStyles: styles
          .filter((item) => item.enabled)
          .slice(0, 8)
          .map((item) => ({
            style: item.label,
            confidence: item.confidence,
            source: item.source,
          })),
        traits: traits
          .filter((item) => item.active)
          .slice(0, 8)
          .map((item) => ({
            key: item.key,
            value: item.value,
            confidence: item.confidence,
          })),
      };
      return result(started, [
        candidate({
          id: `personality:${profile?.id ?? request.ownerId}`,
          sourceType: "PERSONALITY",
          trustLevel: "TRUSTED",
          title: "Compact behavioral profile",
          content,
          importanceScore: 0.7,
          confidence: 0.9,
          observedAt: profile?.updatedAt,
          cacheability: "SESSION",
          sensitivity: "PRIVATE",
          canonicalKey: "personality:active",
          sourceReferences: profile
            ? [
                {
                  sourceType: "PERSONALITY",
                  sourceId: profile.id,
                  version: String(profile.version),
                },
              ]
            : [],
        }),
      ]);
    },
  );

  const memory = new FunctionalSource(
    "MEMORY",
    descriptor("MEMORY", "IMPORTANT", {
      supportsProjectScope: true,
      supportsWorkflowScope: true,
      supportsAgentScope: true,
    }),
    async (request) => {
      const started = performance.now();
      const memories = await dependencies.memoryStore.listMemories(
        request.ownerId,
        120,
      );
      const active = memories
        .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > Date.now())
        .filter(
          (item) =>
            !request.projectId ||
            !item.repositoryId ||
            item.repositoryId === request.projectId,
        )
        .filter(
          (item) =>
            !request.workflowId ||
            !item.workflowId ||
            item.workflowId === request.workflowId,
        )
        .filter(
          (item) =>
            !request.agentId || !item.agentId || item.agentId === request.agentId,
        )
        .filter(
          (item) =>
            taskMatches(request.taskText, [item.title, item.summary, ...item.tags]) ||
            item.repositoryId === request.projectId ||
            item.workflowId === request.workflowId ||
            item.agentId === request.agentId,
        )
        .slice(0, 24);
      return result(
        started,
        active.map((item) =>
          candidate({
            id: `memory:${item.id}`,
            sourceType: "MEMORY",
            trustLevel: item.source === "owner" ? "USER_AUTHORED" : "TRUSTED",
            title: item.title,
            content: {
              summary: item.summary,
              content: item.content,
              type: item.memoryType,
              tags: item.tags,
            },
            importanceScore: item.importance / 100,
            confidence: item.confidence,
            observedAt: item.updatedAt,
            validUntil: item.expiresAt ?? undefined,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            scope: {
              ...(item.repositoryId ? { projectId: item.repositoryId } : {}),
              ...(item.workflowId ? { workflowId: item.workflowId } : {}),
              ...(item.agentId ? { agentId: item.agentId } : {}),
            },
            entityIds: item.evidence.map((evidence) => evidence.reference).slice(0, 50),
            canonicalKey:
              item.memoryType === "preference" || /\bprefer/i.test(item.title)
                ? `preference:${preferenceSubject(item.title)}`
                : `memory:${normalize(item.title)}`,
            metadata: {
              canonicalValue:
                item.memoryType === "preference" ? item.summary : item.content,
            },
            sourceReferences: [
              {
                sourceType: "MEMORY",
                sourceId: item.id,
                version: String(item.version),
              },
            ],
          }),
        ),
      );
    },
  );

  const knowledgeGraph = new FunctionalSource(
    "KNOWLEDGE_GRAPH",
    descriptor("KNOWLEDGE_GRAPH", "IMPORTANT", { supportsProjectScope: true }),
    async (request) => {
      const started = performance.now();
      const entities = request.entityIds?.length
        ? (
            await Promise.all(
              request.entityIds
                .slice(0, 12)
                .map((id) =>
                  Promise.resolve(
                    dependencies.knowledgeGraphStore.findEntity(request.ownerId, id),
                  ),
                ),
            )
          ).filter((item) => item !== undefined)
        : request.taskText
          ? await dependencies.knowledgeGraphStore.searchEntities(request.ownerId, {
              q: request.taskText,
              limit: 12,
            })
          : await dependencies.knowledgeGraphStore.listEntities(request.ownerId, 12);
      const scoped = entities.filter((item) => {
        const projectId =
          typeof item.metadata.projectId === "string"
            ? item.metadata.projectId
            : undefined;
        return !request.projectId || !projectId || projectId === request.projectId;
      });
      const rows = await Promise.all(
        scoped.slice(0, 12).map(async (entity) => ({
          entity,
          facts: (
            await dependencies.knowledgeGraphStore.listFacts(request.ownerId, entity.id)
          )
            .filter((fact) => !fact.isArchived)
            .slice(0, 12),
          relationships: (
            await dependencies.knowledgeGraphStore.listRelationshipsForEntity(
              request.ownerId,
              entity.id,
            )
          )
            .filter((relationship) => !relationship.isArchived)
            .slice(0, 8),
        })),
      );
      const candidates = rows.flatMap(({ entity, facts, relationships }) => {
        const projectId =
          typeof entity.metadata.projectId === "string"
            ? entity.metadata.projectId
            : undefined;
        return [
          candidate({
            id: `kg:entity:${entity.id}`,
            sourceType: "KNOWLEDGE_GRAPH",
            trustLevel: entity.sourceType === "manual" ? "USER_AUTHORED" : "TRUSTED",
            title: entity.displayName,
            content: {
              entityType: entity.entityType,
              description: entity.description,
              aliases: entity.aliases,
              tags: entity.tags,
            },
            importanceScore: entity.isPinned ? 1 : 0.72,
            confidence: entity.confidence,
            observedAt: entity.lastObservedAt,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            entityIds: [entity.id],
            scope: projectId ? { projectId } : undefined,
            canonicalKey: `entity:${entity.id}`,
            sourceReferences: [
              {
                sourceType: "KNOWLEDGE_GRAPH",
                sourceId: entity.id,
                version: String(entity.version),
              },
            ],
          }),
          ...facts.map((fact) =>
            candidate({
              id: `kg:fact:${fact.id}`,
              sourceType: "KNOWLEDGE_GRAPH",
              trustLevel: fact.ownerConfirmed ? "USER_AUTHORED" : "TRUSTED",
              title: `${entity.displayName}.${fact.predicate}`,
              content: {
                subject: entity.displayName,
                predicate: fact.predicate,
                value: fact.value,
              },
              importanceScore: fact.ownerConfirmed ? 0.95 : 0.78,
              confidence: fact.confidence,
              authorityScore: fact.ownerConfirmed ? 0.96 : 0.84,
              observedAt: fact.lastObservedAt,
              validFrom: fact.validFrom ?? undefined,
              validUntil: fact.validUntil ?? undefined,
              cacheability: "DYNAMIC",
              sensitivity: "PRIVATE",
              entityIds: [entity.id],
              scope: projectId ? { projectId } : undefined,
              canonicalKey: /\bprefer/i.test(fact.predicate)
                ? `preference:${preferenceSubject(fact.predicate)}`
                : `fact:${entity.id}:${normalize(fact.predicate)}`,
              metadata: { canonicalValue: fact.value },
              sourceReferences: [
                {
                  sourceType: "KNOWLEDGE_GRAPH",
                  sourceId: fact.id,
                  version: fact.updatedAt,
                },
              ],
            }),
          ),
          ...relationships.map((relationship) =>
            candidate({
              id: `kg:relationship:${relationship.id}`,
              sourceType: "KNOWLEDGE_GRAPH",
              trustLevel: "TRUSTED",
              title: relationship.relationshipType,
              content: {
                sourceEntityId: relationship.sourceEntityId,
                relationship: relationship.relationshipType,
                targetEntityId: relationship.targetEntityId,
                distance: 1,
              },
              importanceScore: relationship.strength * 0.85,
              confidence: relationship.confidence,
              observedAt: relationship.lastObservedAt,
              cacheability: "DYNAMIC",
              sensitivity: "PRIVATE",
              entityIds: [relationship.sourceEntityId, relationship.targetEntityId],
              scope: projectId ? { projectId } : undefined,
              canonicalKey: `relationship:${relationship.sourceEntityId}:${relationship.relationshipType}:${relationship.targetEntityId}`,
              sourceReferences: [
                {
                  sourceType: "KNOWLEDGE_GRAPH",
                  sourceId: relationship.id,
                  version: relationship.updatedAt,
                },
              ],
            }),
          ),
        ];
      });
      return result(started, candidates.slice(0, 60));
    },
  );

  const learning = new FunctionalSource(
    "LEARNED_PREFERENCE",
    descriptor("LEARNED_PREFERENCE", "IMPORTANT", {
      supportsProjectScope: true,
      supportsWorkflowScope: true,
      supportsAgentScope: true,
    }),
    async (request) => {
      const started = performance.now();
      const preferences = (
        await dependencies.learningEngineStore.listPreferences(request.ownerId, 100)
      )
        .filter((item) => ["ACTIVE", "LOCKED"].includes(item.status))
        .filter(
          (item) =>
            !item.effectiveUntil || Date.parse(item.effectiveUntil) > Date.now(),
        )
        .filter(
          (item) =>
            !request.projectId ||
            !item.context.projectId ||
            item.context.projectId === request.projectId,
        )
        .filter(
          (item) =>
            !request.workflowId ||
            !item.context.workflowId ||
            item.context.workflowId === request.workflowId,
        )
        .filter(
          (item) =>
            !request.agentId ||
            !item.context.agentId ||
            item.context.agentId === request.agentId,
        )
        .filter(
          (item) =>
            taskMatches(request.taskText, [item.category, item.subject, item.value]) ||
            item.context.projectId === request.projectId ||
            item.context.workflowId === request.workflowId ||
            item.context.agentId === request.agentId,
        )
        .slice(0, 24);
      return result(
        started,
        preferences.map((item) =>
          candidate({
            id: `preference:${item.id}`,
            sourceType: "LEARNED_PREFERENCE",
            trustLevel:
              item.manualOverride || item.locked ? "USER_AUTHORED" : "DERIVED",
            title: item.subject,
            content: {
              subject: item.subject,
              value: item.value,
              category: item.category,
              evidenceType: item.manualOverride ? "explicit_owner_override" : "learned",
              scopeLevel: item.context.level,
              explanation: item.explanation,
            },
            importanceScore: item.locked ? 0.95 : 0.65,
            confidence: item.confidence,
            authorityScore: item.manualOverride ? 0.98 : 0.58,
            observedAt: item.updatedAt,
            validFrom: item.effectiveFrom,
            validUntil: item.effectiveUntil ?? undefined,
            cacheability: "SESSION",
            sensitivity: "PRIVATE",
            scope: {
              ...(item.context.projectId ? { projectId: item.context.projectId } : {}),
              ...(item.context.workflowId
                ? { workflowId: item.context.workflowId }
                : {}),
              ...(item.context.agentId ? { agentId: item.context.agentId } : {}),
              ...(item.context.applicationId
                ? { applicationId: item.context.applicationId }
                : {}),
            },
            canonicalKey: `preference:${preferenceSubject(item.subject)}`,
            metadata: { canonicalValue: item.value },
            sourceReferences: [
              {
                sourceType: "LEARNED_PREFERENCE",
                sourceId: item.id,
                version: String(item.version),
              },
            ],
          }),
        ),
      );
    },
  );

  const conversation = new FunctionalSource(
    "CONVERSATION",
    descriptor("CONVERSATION", "IMPORTANT"),
    async (request) => {
      const started = performance.now();
      const rawLimit = request.requestedProfile === "VOICE_INTERPRETATION" ? 3 : 8;
      const [history, states, agentMessages] = await Promise.all([
        dependencies.humanUnderstandingStore.listUnderstandings(
          request.ownerId,
          rawLimit,
        ),
        dependencies.humanUnderstandingStore.listConversationStates(request.ownerId, 4),
        dependencies.agentStore.listMessages(request.ownerId, 50),
      ]);
      const scopedMessages = request.conversationId
        ? agentMessages
            .filter((item) => item.conversationId === request.conversationId)
            .slice(0, rawLimit)
        : [];
      if (request.conversationId && !scopedMessages.length)
        return result(started, [], ["CONVERSATION_ID_NOT_AVAILABLE_IN_HUMAN_HISTORY"]);
      if (!request.conversationId && !history.length && !states.length)
        return result(started, []);
      const content = request.conversationId
        ? {
            recentTurns: scopedMessages.map((item) => ({
              senderAgentId: item.senderAgentId,
              recipientAgentId: item.recipientAgentId,
              messageType: item.messageType,
              payload: item.payload,
              createdAt: item.createdAt,
            })),
            state: null,
          }
        : {
            recentTurns: history.map((item) => ({
              requestId: item.requestId,
              userText: item.originalText,
              resolvedIntent: item.selectedIntent?.intentId ?? null,
              entities: item.entities.map((entity) => ({
                type: entity.type,
                value: entity.value,
              })),
              createdAt: item.createdAt,
            })),
            state: states[0]
              ? {
                  state: states[0].state,
                  reason: states[0].reason,
                  createdAt: states[0].createdAt,
                }
              : null,
          };
      const observedAt = request.conversationId
        ? scopedMessages[0]?.createdAt
        : (history[0]?.createdAt ?? states[0]?.createdAt);
      const references = request.conversationId
        ? scopedMessages.map((item) => ({
            sourceType: "CONVERSATION" as const,
            sourceId: item.id,
          }))
        : history.slice(0, 8).map((item) => ({
            sourceType: "CONVERSATION" as const,
            sourceId: item.requestId,
          }));
      return result(started, [
        candidate({
          id: `conversation:${request.conversationId ?? history[0]?.requestId ?? states[0]?.id}`,
          sourceType: "CONVERSATION",
          trustLevel: "USER_AUTHORED",
          title: "Bounded recent conversation state",
          content,
          importanceScore: 0.82,
          confidence: 0.9,
          authorityScore: 0.86,
          observedAt,
          cacheability: "SESSION",
          sensitivity: "PRIVATE",
          scope: request.conversationId
            ? { conversationId: request.conversationId }
            : undefined,
          canonicalKey: `conversation:${request.conversationId ?? "recent"}`,
          sourceReferences: references,
        }),
      ]);
    },
  );

  const project = new FunctionalSource(
    "PROJECT",
    descriptor("PROJECT", "IMPORTANT", { supportsProjectScope: true }),
    async (request) => {
      const started = performance.now();
      const repositories = await dependencies.repositoryStore.listRepositories(
        request.ownerId,
      );
      const selected = request.projectId
        ? repositories.filter((item) => item.id === request.projectId)
        : repositories
            .filter((item) => taskMatches(request.taskText, [item.workspaceId]))
            .slice(0, 8);
      return result(
        started,
        selected.map((item) =>
          candidate({
            id: `project:${item.id}`,
            sourceType: "PROJECT",
            trustLevel: "TRUSTED",
            title: item.workspaceId,
            content: {
              projectId: item.id,
              workspaceId: item.workspaceId,
              indexStatus: item.indexStatus,
              activeGeneration: item.activeGeneration,
              lastIndexedAt: item.lastIndexedAt,
            },
            importanceScore: request.projectId === item.id ? 1 : 0.7,
            confidence: 1,
            authorityScore: 0.92,
            observedAt: item.updatedAt,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            scope: { projectId: item.id, workspaceId: item.workspaceId },
            canonicalKey: `project:${item.id}`,
            sourceReferences: [
              {
                sourceType: "PROJECT",
                sourceId: item.id,
                version: item.activeFingerprint ?? undefined,
              },
            ],
          }),
        ),
      );
    },
  );

  const workflow = new FunctionalSource(
    "WORKFLOW",
    descriptor("WORKFLOW", "IMPORTANT", {
      supportsProjectScope: true,
      supportsWorkflowScope: true,
    }),
    async (request) => {
      const started = performance.now();
      const workflows = request.workflowId
        ? [await dependencies.workflowStore.find(request.workflowId)].filter(
            (item) => item?.ownerId === request.ownerId,
          )
        : (await dependencies.workflowStore.list(request.ownerId, 12))
            .filter((item) =>
              taskMatches(request.taskText, [item.goal, item.planSummary]),
            )
            .slice(0, 6);
      const values = await Promise.all(
        workflows.map(async (item) => {
          if (!item) return null;
          const [tasks, events] = await Promise.all([
            dependencies.workflowStore.listTasks(item.id),
            dependencies.workflowStore.listEvents(item.id, 8),
          ]);
          const current = tasks.find((task) => task.id === item.currentTaskId) ?? null;
          const prerequisites = current
            ? tasks
                .filter((task) => current.dependencies.includes(task.id))
                .map((task) => ({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                  result: task.completedAt,
                }))
            : [];
          return candidate({
            id: `workflow:${item.id}`,
            sourceType: "WORKFLOW",
            trustLevel: "TRUSTED",
            title: item.goal,
            content: {
              workflowId: item.id,
              goal: item.goal,
              status: item.status,
              currentTask: current
                ? {
                    id: current.id,
                    title: current.title,
                    goal: current.goal,
                    status: current.status,
                    failureCode: current.failureCode,
                  }
                : null,
              prerequisites,
              recentEvents: events.map((event) => ({
                type: event.eventType,
                message: event.message,
                createdAt: event.createdAt,
              })),
            },
            importanceScore: request.workflowId === item.id ? 1 : 0.78,
            confidence: 1,
            authorityScore: 0.98,
            observedAt: item.updatedAt,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            scope: {
              workflowId: item.id,
              ...(item.repositoryIds[0] ? { projectId: item.repositoryIds[0] } : {}),
              ...(current ? { taskId: current.id } : {}),
            },
            canonicalKey: `workflow:${item.id}:state`,
            sourceReferences: [
              { sourceType: "WORKFLOW", sourceId: item.id, version: item.updatedAt },
            ],
          });
        }),
      );
      return result(
        started,
        values.filter((item) => item !== null),
      );
    },
  );

  const agent = new FunctionalSource(
    "AGENT",
    descriptor("AGENT", "IMPORTANT", {
      supportsProjectScope: true,
      supportsWorkflowScope: true,
      supportsAgentScope: true,
    }),
    async (request) => {
      const started = performance.now();
      const agents = request.agentId
        ? [
            await dependencies.agentStore.findAgent(request.ownerId, request.agentId),
          ].filter((item) => item !== undefined)
        : (await dependencies.agentStore.listAgents(request.ownerId))
            .filter((item) =>
              taskMatches(request.taskText, [
                item.displayName,
                item.role,
                ...item.supportedTasks,
              ]),
            )
            .slice(0, 6);
      const tasks = await dependencies.agentStore.listTasks(request.ownerId, 100);
      return result(
        started,
        agents.flatMap((item) => {
          const scopedTasks = tasks
            .filter((task) => task.agentId === item.id)
            .filter(
              (task) =>
                !request.workflowId ||
                !task.workflowId ||
                task.workflowId === request.workflowId,
            )
            .slice(0, 8);
          return [
            candidate({
              id: `agent:${item.id}`,
              sourceType: "AGENT",
              trustLevel: "TRUSTED",
              title: item.displayName,
              content: {
                agentId: item.id,
                role: item.role,
                status: item.status,
                capabilities: item.capabilities,
                supportedTasks: item.supportedTasks,
                health: item.healthSummary,
                privateTasks: scopedTasks.map((task) => ({
                  id: task.id,
                  title: task.title,
                  objective: task.objective,
                  status: task.status,
                  workflowId: task.workflowId,
                  resultSummary: task.resultSummary,
                })),
              },
              importanceScore: request.agentId === item.id ? 1 : 0.72,
              confidence: 1,
              authorityScore: 0.94,
              observedAt: item.updatedAt,
              cacheability: "DYNAMIC",
              sensitivity: "PRIVATE",
              scope: {
                agentId: item.id,
                ...(request.workflowId ? { workflowId: request.workflowId } : {}),
              },
              canonicalKey: `agent:${item.id}:state`,
              sourceReferences: [
                { sourceType: "AGENT", sourceId: item.id, version: item.version },
              ],
            }),
          ];
        }),
      );
    },
  );

  const recentActivity = new FunctionalSource(
    "RECENT_ACTIVITY",
    descriptor("RECENT_ACTIVITY", "IMPORTANT"),
    async (request) => {
      const started = performance.now();
      const [contexts, sessions, recentUnderstanding] = await Promise.all([
        dependencies.workspaceIntelligenceStore.listContexts(request.ownerId, 5),
        dependencies.applicationIntelligenceStore.listSessions(request.ownerId, 5),
        dependencies.humanUnderstandingStore.listUnderstandings(request.ownerId, 5),
      ]);
      if (!contexts.length && !sessions.length && !recentUnderstanding.length)
        return result(started, []);
      const latest = contexts[0];
      const content = {
        currentWorkspace: latest
          ? {
              applicationId: latest.currentApplicationId,
              workspaceId: latest.currentWorkspaceId,
              repository: latest.currentRepository,
              file: latest.currentFile,
              objectId: latest.currentObjectId,
              updatedAt: latest.updatedAt,
            }
          : null,
        recentApplications: sessions.map((item) => ({
          applicationId: item.applicationId,
          status: item.status,
          context: item.contextSummary,
          updatedAt: item.updatedAt,
        })),
        recentTasks: recentUnderstanding.map((item) => ({
          text: item.originalText,
          intent: item.selectedIntent?.intentId ?? null,
          createdAt: item.createdAt,
        })),
      };
      return result(started, [
        candidate({
          id: `recent:${latest?.id ?? recentUnderstanding[0]?.requestId ?? sessions[0]?.id}`,
          sourceType: "RECENT_ACTIVITY",
          trustLevel: "TRUSTED",
          title: "Recent owner activity",
          content,
          importanceScore: 0.86,
          confidence: 0.85,
          authorityScore: 0.9,
          observedAt:
            latest?.updatedAt ??
            sessions[0]?.updatedAt ??
            recentUnderstanding[0]?.createdAt,
          cacheability: "DYNAMIC",
          sensitivity: "PRIVATE",
          scope: latest?.currentWorkspaceId
            ? {
                workspaceId: latest.currentWorkspaceId,
                ...(latest.currentApplicationId
                  ? { applicationId: latest.currentApplicationId }
                  : {}),
              }
            : undefined,
          canonicalKey: "recent-activity:current",
          sourceReferences: [
            {
              sourceType: "RECENT_ACTIVITY",
              sourceId:
                latest?.id ??
                recentUnderstanding[0]?.requestId ??
                sessions[0]?.id ??
                request.ownerId,
            },
          ],
        }),
      ]);
    },
  );

  const semanticWorkspace = new FunctionalSource(
    "SEMANTIC_WORKSPACE",
    descriptor("SEMANTIC_WORKSPACE", "OPTIONAL", { supportsProjectScope: true }),
    async (request) => {
      const started = performance.now();
      const [workspaces, objects] = await Promise.all([
        dependencies.workspaceIntelligenceStore.listWorkspaces(request.ownerId, 12),
        dependencies.workspaceIntelligenceStore.listObjects(request.ownerId, 40),
      ]);
      const relevant = workspaces
        .filter((item) => taskMatches(request.taskText, [item.title, item.domain]))
        .slice(0, 6);
      return result(
        started,
        relevant.map((item) =>
          candidate({
            id: `semantic-workspace:${item.id}`,
            sourceType: "SEMANTIC_WORKSPACE",
            trustLevel: "TRUSTED",
            title: item.title,
            content: {
              domain: item.domain,
              status: item.status,
              objectCount: item.objectCount,
              objects: objects
                .filter((object) => object.workspaceId === item.id)
                .slice(0, 10)
                .map((object) => ({
                  id: object.id,
                  type: object.objectType,
                  title: object.title,
                  contentPreview: object.contentPreview,
                })),
            },
            importanceScore: 0.7,
            confidence: item.status === "indexed" ? 0.9 : 0.6,
            observedAt: item.updatedAt,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            scope: { workspaceId: item.id, applicationId: item.applicationId },
            canonicalKey: `semantic-workspace:${item.id}`,
            sourceReferences: [
              {
                sourceType: "SEMANTIC_WORKSPACE",
                sourceId: item.id,
                version: item.updatedAt,
              },
            ],
          }),
        ),
      );
    },
  );

  const applicationState = new FunctionalSource(
    "APPLICATION_STATE",
    descriptor("APPLICATION_STATE", "OPTIONAL"),
    async (request) => {
      const started = performance.now();
      const sessions = (
        await dependencies.applicationIntelligenceStore.listSessions(
          request.ownerId,
          12,
        )
      ).filter((item) => item.status === "active" || item.status === "background");
      return result(
        started,
        sessions.slice(0, 8).map((item) =>
          candidate({
            id: `application-state:${item.id}`,
            sourceType: "APPLICATION_STATE",
            trustLevel: "TRUSTED",
            title: item.applicationId,
            content: {
              applicationId: item.applicationId,
              domain: item.domain,
              status: item.status,
              currentObjectId: item.currentObjectId,
              contextSummary: item.contextSummary,
            },
            importanceScore: item.status === "active" ? 0.95 : 0.65,
            confidence: 0.9,
            authorityScore: 0.96,
            observedAt: item.updatedAt,
            cacheability: "DYNAMIC",
            sensitivity: "PRIVATE",
            scope: { applicationId: item.applicationId },
            canonicalKey: `application:${item.applicationId}:state`,
            sourceReferences: [
              {
                sourceType: "APPLICATION_STATE",
                sourceId: item.id,
                version: item.updatedAt,
              },
            ],
          }),
        ),
      );
    },
  );

  return [
    personality,
    knowledgeGraph,
    memory,
    learning,
    conversation,
    project,
    workflow,
    agent,
    recentActivity,
    semanticWorkspace,
    applicationState,
  ];
};

export const registerProductionContextSources = (
  service: { register(source: CognitiveContextSource): void },
  dependencies: SourceDependencies,
) => {
  const sources = createProductionContextSources(dependencies);
  for (const source of sources) service.register(source);
  return sources;
};
