import {
  ExplicitMemoryInputSchema,
  ExplicitMemoryTeachingResponseSchema,
  type ExplicitMemoryInput,
  type ExplicitMemoryType,
} from "@alexa-control/shared";

import type { PersonalKnowledgeGraphService } from "../knowledge-graph/service.js";
import type { MemoryStore } from "./store.js";
import type { MemoryIndexerService } from "./service.js";

const explicitPrefix =
  /^(?:please\s+)?(?:remember(?:\s+that)?|note\s+that|save\s+this\s+to\s+memory|remember\s+this\s+for\s+later)\s*[:,-]?\s*/i;
const secretPattern =
  /\b(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|secret|session[ _-]?cookie|recovery[ _-]?code|one[ _-]?time(?:[ _-]?password|[ _-]?code)|\botp\b)\b|(?:sk-|ghp_|akia)[a-z0-9_-]{8,}/i;

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const inferredType = (content: string): ExplicitMemoryType => {
  if (/^when i say .+?,? i mean /i.test(content)) return "ALIAS";
  if (/\b(?:i prefer|my preferred|i like|i want)\b/i.test(content)) return "PREFERENCE";
  if (/\b(?:decision|decided|unless i say otherwise)\b/i.test(content)) return "DECISION";
  if (/\b(?:instruction|always|never|for client proposals)\b/i.test(content))
    return "INSTRUCTION";
  if (/\bproject\b/i.test(content)) return "PROJECT";
  if (/\b(?:is the|works on|designer for|leads)\b/i.test(content)) return "PERSON";
  return "FACT";
};

const memoryTypeFor = (type: ExplicitMemoryType) => {
  if (type === "PREFERENCE") return "preference" as const;
  if (type === "INSTRUCTION") return "procedural" as const;
  return "semantic" as const;
};

const titleFor = (type: ExplicitMemoryType, content: string) =>
  `${type[0]}${type.slice(1).toLowerCase()}: ${content}`.slice(0, 255);

export type ExplicitMemoryReference = {
  source: "conversation" | "manual";
  id: string;
  label: string;
};

export type ParsedExplicitTeaching = {
  type: ExplicitMemoryType;
  content: string;
  requiresReference: boolean;
};

export const parseExplicitMemoryTeaching = (text: string): ParsedExplicitTeaching | null => {
  if (!explicitPrefix.test(text.trim())) return null;
  const content = text.trim().replace(explicitPrefix, "").trim();
  return {
    type: content ? inferredType(content) : "FACT",
    content,
    requiresReference: content.length === 0,
  };
};

export class ExplicitMemoryTeachingService {
  constructor(
    readonly memory: MemoryIndexerService,
    readonly memoryStore: MemoryStore,
    readonly knowledgeGraph: PersonalKnowledgeGraphService,
    readonly now: () => Date = () => new Date(),
  ) {}

  async teach(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
    reference?: ExplicitMemoryReference | null;
  }) {
    const parsed = ExplicitMemoryInputSchema.parse(input.body);
    if (secretPattern.test(parsed.content)) {
      const error = new Error("Sensitive credentials and security codes cannot be saved to memory.");
      Object.assign(error, { statusCode: 400, code: "SENSITIVE_MEMORY_CONTENT_DENIED" });
      throw error;
    }
    const referencedEntityIds: string[] = [];
    for (const entityId of parsed.entityRefs) {
      await this.knowledgeGraph.entity(input.ownerId, entityId);
      referencedEntityIds.push(entityId);
    }
    const content = parsed.content;
    const existing = (await this.memoryStore.listMemories(input.ownerId, 2_000)).find(
      (memory) =>
        memory.source === "owner" &&
        memory.tags.includes("owner_explicit") &&
        normalize(memory.content || memory.summary) === normalize(content),
    );
    if (existing) {
      return ExplicitMemoryTeachingResponseSchema.parse({
        memory: existing,
        duplicate: true,
        conflictCreated: false,
        linkedEntityIds: [],
        linkedRelationshipIds: [],
      });
    }
    const at = this.now().toISOString();
    const memory = await this.memory.recordMemory({
      ownerId: input.ownerId,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      body: {
        memoryType: memoryTypeFor(parsed.type),
        source: "owner",
        title: titleFor(parsed.type, content),
        summary: content.slice(0, 2_000),
        content,
        tags: ["owner_explicit", `explicit_type:${parsed.type.toLowerCase()}`],
        importance: parsed.type === "PREFERENCE" || parsed.type === "INSTRUCTION" ? 85 : 75,
        confidence: 1,
        evidence: [
          {
            sourceType: "manual",
            reference: `OWNER_EXPLICIT:${input.requestId}`,
            excerpt: content.slice(0, 1_000),
            observedAt: at,
          },
          ...(input.reference
            ? [
                {
                  sourceType: input.reference.source,
                  reference: input.reference.id.slice(0, 500),
                  excerpt: input.reference.label.slice(0, 1_000),
                  observedAt: at,
                },
              ]
            : []),
        ],
      },
    });
    const graphBefore = await this.knowledgeGraph.dashboard(input.ownerId);
    const graph = await this.linkKnowledge(input.ownerId, parsed, memory.memory.id);
    for (const entityId of referencedEntityIds) {
      if (!graph.entityIds.includes(entityId)) graph.entityIds.push(entityId);
    }
    const graphAfter = await this.knowledgeGraph.dashboard(input.ownerId);
    return ExplicitMemoryTeachingResponseSchema.parse({
      memory: memory.memory,
      duplicate: false,
      conflictCreated: graphAfter.conflicts.length > graphBefore.conflicts.length,
      linkedEntityIds: graph.entityIds,
      linkedRelationshipIds: graph.relationshipIds,
    });
  }

  private async linkKnowledge(
    ownerId: string,
    input: ExplicitMemoryInput,
    memoryId: string,
  ) {
    const entityIds: string[] = [];
    const relationshipIds: string[] = [];
    const source = { sourceType: "manual" as const, sourceId: memoryId, confidence: 1, ownerConfirmed: true };
    const alias = input.content.match(/^when i say\s+(.+?),?\s+i mean\s+(.+?)[.!]?$/i);
    const aliasName = alias?.[1]?.trim();
    const canonicalName = alias?.[2]?.trim();
    if (aliasName && canonicalName) {
      const entity = await this.knowledgeGraph.upsertEntity(ownerId, {
        entityType: /\bproject\b/i.test(canonicalName) ? "PROJECT" : "CONCEPT",
        canonicalName,
        aliases: [aliasName],
        description: input.content,
        tags: ["owner_explicit", "alias"],
        ...source,
      });
      entityIds.push(entity.id);
      return { entityIds, relationshipIds };
    }
    const role = input.content.match(/^(.+?)\s+is\s+(?:the\s+)?(?:designer|design lead|leading design)\s+for\s+(.+?)[.!]?$/i);
    const personName = role?.[1]?.trim();
    const projectName = role?.[2]?.trim();
    if (personName && projectName) {
      const person = await this.knowledgeGraph.upsertEntity(ownerId, {
        entityType: "PERSON",
        canonicalName: personName,
        description: input.content,
        tags: ["owner_explicit"],
        ...source,
      });
      const project = await this.knowledgeGraph.upsertEntity(ownerId, {
        entityType: "PROJECT",
        canonicalName: projectName,
        description: input.content,
        tags: ["owner_explicit"],
        ...source,
      });
      const relationship = await this.knowledgeGraph.upsertRelationship(ownerId, {
        sourceEntityId: person.id,
        targetEntityId: project.id,
        relationshipType: "RESPONSIBLE_FOR",
        strength: 0.9,
        evidenceSnippet: input.content,
        sourceType: "manual",
        sourceId: memoryId,
      });
      entityIds.push(person.id, project.id);
      relationshipIds.push(relationship.id);
      return { entityIds, relationshipIds };
    }
    const launch = input.content.match(/^(.+?)\s+launches?\s+in\s+(.+?)[.!]?$/i);
    const projectLaunchName = launch?.[1]?.trim();
    const launchDate = launch?.[2]?.trim();
    if (projectLaunchName && launchDate) {
      const project = await this.knowledgeGraph.upsertEntity(ownerId, {
        entityType: "PROJECT",
        canonicalName: projectLaunchName,
        description: input.content,
        tags: ["owner_explicit"],
        ...source,
      });
      await this.knowledgeGraph.addFact({
        ownerId,
        subjectEntityId: project.id,
        predicate: "launches_in",
        valueType: "string",
        value: launchDate,
        sourceType: "manual",
        sourceId: memoryId,
        confidence: 1,
      });
      entityIds.push(project.id);
      return { entityIds, relationshipIds };
    }
    const preference = input.content.match(/^(?:my\s+)?preferred\s+(.+?)\s+is\s+(.+?)[.!]?$/i);
    const prefers = input.content.match(/^i\s+prefer\s+(.+?)[.!]?$/i);
    const preferenceSubject = preference?.[1]?.trim();
    const preferenceValue = preference?.[2]?.trim() ?? prefers?.[1]?.trim();
    if (preferenceValue) {
      const owner = await this.knowledgeGraph.upsertEntity(ownerId, {
        entityType: "PERSON",
        canonicalName: "Owner",
        description: "Owner-scoped preference subject.",
        aliases: ["me", "I"],
        tags: ["owner_explicit", "preference"],
        ...source,
      });
      await this.knowledgeGraph.addFact({
        ownerId,
        subjectEntityId: owner.id,
        predicate: preference
          ? `preferred_${normalize(preferenceSubject ?? "preference").replaceAll(" ", "_")}`.slice(0, 120)
          : "preference",
        valueType: "string",
        value: preferenceValue,
        sourceType: "manual",
        sourceId: memoryId,
        confidence: 1,
      });
      entityIds.push(owner.id);
    }
    return { entityIds, relationshipIds };
  }
}
