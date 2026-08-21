import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresHumanUnderstandingStore } from "../human-understanding/postgres-store.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { PostgresKnowledgeGraphStore } from "../knowledge-graph/postgres-store.js";
import { PostgresLearningEngineStore } from "../learning-engine/postgres-store.js";
import { PostgresMemoryStore } from "../memory/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";
import { CognitiveQueryService } from "../memory-studio/service.js";
import { PostgresMemoryStudioStore } from "../memory-studio/postgres-store.js";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const command = process.argv[2] ?? "stats";
const ownerId =
  process.env.MEMORY_STUDIO_OWNER_ID ??
  process.env.LEARNING_OWNER_ID ??
  process.env.PERSONALITY_OWNER_ID ??
  process.argv[3] ??
  null;

if (!ownerId) {
  throw new Error(
    "MEMORY_STUDIO_OWNER_ID, LEARNING_OWNER_ID, PERSONALITY_OWNER_ID, or owner UUID argument is required.",
  );
}

const environment = parseApiEnvironment({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
});
if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const database = new PostgresDatabase(environment.DATABASE_URL);

try {
  const identityStore = new PostgresIdentityStore(database.pool);
  const service = new CognitiveQueryService(
    new PostgresMemoryStudioStore(database.pool),
    new PostgresMemoryStore(database.pool),
    new PostgresKnowledgeGraphStore(database.pool),
    new PostgresLearningEngineStore(database.pool),
    new PostgresHumanUnderstandingStore(database.pool),
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

  if (command === "stats") {
    process.stdout.write(
      `${JSON.stringify((await service.dashboard(ownerId)).overview, null, 2)}\n`,
    );
  } else if (command === "search") {
    const q = process.argv.slice(4).join(" ").trim() || process.argv[3] || "";
    process.stdout.write(
      `${JSON.stringify(await service.search(ownerId, { q, limit: 25, cursor: 0 }), null, 2)}\n`,
    );
  } else if (command === "inspect") {
    const id = process.argv[4];
    if (!id) throw new Error("Usage: memory:inspect <owner-id> <item-id>");
    process.stdout.write(
      `${JSON.stringify(await service.explain(ownerId, id), null, 2)}\n`,
    );
  } else if (command === "health" || command === "validate") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "valid",
          health: dashboard.health,
          overview: dashboard.overview,
          llmRequired: dashboard.llmRequired,
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === "conflicts") {
    process.stdout.write(
      `${JSON.stringify((await service.dashboard(ownerId)).conflicts, null, 2)}\n`,
    );
  } else if (command === "stale") {
    process.stdout.write(
      `${JSON.stringify((await service.dashboard(ownerId)).stale, null, 2)}\n`,
    );
  } else if (command === "duplicates") {
    const items = (await service.dashboard(ownerId)).items;
    const byTitle = new Map<string, number>();
    for (const item of items) {
      const key = item.title.trim().toLowerCase();
      byTitle.set(key, (byTitle.get(key) ?? 0) + 1);
    }
    process.stdout.write(
      `${JSON.stringify(
        [...byTitle.entries()]
          .filter(([, count]) => count > 1)
          .map(([title, count]) => ({ title, count })),
        null,
        2,
      )}\n`,
    );
  } else if (command === "reindex") {
    const id = process.argv[4];
    if (!id) throw new Error("Usage: memory:reindex <owner-id> <item-id>");
    process.stdout.write(
      `${JSON.stringify(await service.reindex(ownerId, id), null, 2)}\n`,
    );
  } else if (command === "export") {
    process.stdout.write(`${JSON.stringify(await service.export(ownerId), null, 2)}\n`);
  } else if (command === "cleanup") {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "advisory",
          reason:
            "Cleanup suggestions are inspectable only. Archive/merge/delete execution remains owner-reviewed and non-destructive by default.",
          stale: (await service.dashboard(ownerId)).overview.staleItems,
          conflicts: (await service.dashboard(ownerId)).overview.conflicts,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    throw new Error(`Unknown Memory Studio command: ${command}`);
  }
} finally {
  await database.close();
}
