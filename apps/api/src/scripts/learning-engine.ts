import { parseApiEnvironment } from "@alexa-control/config";

import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { LearningEngineService } from "../learning-engine/service.js";
import { PostgresLearningEngineStore } from "../learning-engine/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const command = process.argv[2] ?? "stats";
const ownerId =
  process.env.LEARNING_OWNER_ID ??
  process.env.PERSONALITY_OWNER_ID ??
  process.argv[3] ??
  null;

if (!ownerId) {
  throw new Error(
    "LEARNING_OWNER_ID, PERSONALITY_OWNER_ID, or owner UUID argument is required.",
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
  const service = new LearningEngineService(
    new PostgresLearningEngineStore(database.pool),
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
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(`${JSON.stringify(dashboard.stats, null, 2)}\n`);
  } else if (command === "candidates") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(`${JSON.stringify(dashboard.candidates, null, 2)}\n`);
  } else if (command === "simulate") {
    const category = process.argv[4] ?? "ALIAS";
    const subject = process.argv[5] ?? "code";
    const value = process.argv[6] ?? "vscode";
    const count = Number.parseInt(process.argv[7] ?? "5", 10);
    for (let index = 0; index < count; index += 1) {
      await service.ingest({
        ownerId,
        requestId: `learning-cli-${index}`,
        ipAddress: "127.0.0.1",
        body: {
          eventType: "CLI_SIMULATION",
          category,
          subject,
          observedValue: value,
          sourceType: "api",
          sourceId: "learning-cli",
        },
      });
    }
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(
      `${JSON.stringify(
        {
          simulatedEvents: count,
          candidates: dashboard.candidates.slice(0, 10),
          suggestions: dashboard.suggestions.slice(0, 10),
          preferences: dashboard.preferences.slice(0, 10),
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === "decay" || command === "recompute") {
    const decayed = await service.decay(ownerId);
    process.stdout.write(`${JSON.stringify({ decayed }, null, 2)}\n`);
  } else if (command === "conflicts") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(`${JSON.stringify(dashboard.conflicts, null, 2)}\n`);
  } else if (command === "export") {
    const dashboard = await service.dashboard(ownerId);
    process.stdout.write(
      `${JSON.stringify(
        {
          preferences: dashboard.preferences,
          habits: dashboard.habits,
          sequences: dashboard.sequences,
          suggestions: dashboard.suggestions.filter(
            (suggestion) => suggestion.status !== "pending",
          ),
          rawEvidenceExported: false,
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === "explain") {
    const id = process.argv[4];
    if (!id) throw new Error("Usage: learning:explain <owner-id> <id>");
    process.stdout.write(
      `${JSON.stringify(await service.explain(ownerId, id), null, 2)}\n`,
    );
  } else if (command === "reset") {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "denied",
          reason:
            "Permanent deletion is prohibited. Use owner-facing revoke or supersede flows instead.",
        },
        null,
        2,
      )}\n`,
    );
  } else {
    throw new Error(`Unknown learning command: ${command}`);
  }
} finally {
  await database.close();
}
