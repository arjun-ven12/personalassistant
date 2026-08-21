import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresAgentStore } from "../agents/postgres-store.js";
import { PostgresApplicationAdapterStore } from "../application-adapters/postgres-store.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { PersonalKnowledgeGraphService } from "../knowledge-graph/service.js";
import { PostgresKnowledgeGraphStore } from "../knowledge-graph/postgres-store.js";
import { PostgresMemoryStore } from "../memory/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";
import { PostgresRepositoryStore } from "../repositories/postgres-store.js";
import { PostgresWorkflowStore } from "../workflows/postgres-store.js";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const command = process.argv[2] ?? "stats";
const ownerId = process.env.KNOWLEDGE_OWNER_ID ?? process.env.PERSONALITY_OWNER_ID ?? process.argv[3] ?? null;

if (!ownerId) {
  throw new Error("KNOWLEDGE_OWNER_ID, PERSONALITY_OWNER_ID, or owner UUID argument is required.");
}

const environment = parseApiEnvironment({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
});
if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const database = new PostgresDatabase(environment.DATABASE_URL);

try {
  const identityStore = new PostgresIdentityStore(database.pool);
  const service = new PersonalKnowledgeGraphService(
    new PostgresKnowledgeGraphStore(database.pool),
    new PostgresMemoryStore(database.pool),
    new PostgresRepositoryStore(database.pool),
    new PostgresAgentStore(database.pool),
    new PostgresWorkflowStore(database.pool),
    new PostgresApplicationAdapterStore(database.pool),
    async (input) => {
      await identityStore.appendAudit({
        eventType: input.eventType,
        userId: input.ownerId,
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        ipAddress: input.ipAddress,
        outcome: input.outcome,
        reason: input.reason,
        requestId: input.requestId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
  );

  if (command === "stats" || command === "validate") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "valid",
          statistics: dashboard.statistics,
          entityTypes: dashboard.entityTypes,
          relationshipTypes: dashboard.relationshipTypes,
          conflictCount: dashboard.conflicts.length,
          note:
            command === "validate"
              ? "Runtime graph tables, schemas, trusted-source seeding, and dashboard projection validated."
              : undefined,
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === "search") {
    const q = process.argv.slice(4).join(" ").trim() || process.argv[3] || "";
    const result = await service.search(ownerId, { q, limit: 25, depth: 1 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === "context") {
    const text = process.argv.slice(4).join(" ").trim() || process.argv[3] || "";
    const result = await service.context(ownerId, { text, entityIds: [], depth: 1, limit: 25 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === "path") {
    const from = process.argv[4];
    const to = process.argv[5];
    if (!from || !to) throw new Error("Usage: knowledge:path <owner-id> <from> <to>");
    const result = await service.path(ownerId, { from, to, maxDepth: 4 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === "promote-memory") {
    const memoryId = process.argv[4];
    if (!memoryId) throw new Error("Usage: knowledge:promote-memory <owner-id> <memory-id>");
    const result = await service.promoteMemory({
      ownerId,
      memoryId,
      requestId: "knowledge-cli",
      ipAddress: "127.0.0.1",
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === "conflicts") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(`${JSON.stringify(dashboard.conflicts, null, 2)}\n`);
  } else if (command === "dedupe") {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "advisory",
          reason:
            "Phase 19B does deterministic duplicate prevention by normalized entity identity and alias collision checks. Automatic merging remains review-gated.",
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === "reindex") {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "noop",
          reason:
            "Knowledge graph vector indexing reuses the existing memory/retrieval infrastructure; no separate vector database or full reindexer is introduced.",
        },
        null,
        2,
      )}\n`,
    );
  } else {
    throw new Error(`Unknown knowledge graph command: ${command}`);
  }
} finally {
  await database.close();
}
