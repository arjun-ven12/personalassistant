import path from "node:path";

import { parseApiEnvironment } from "@alexa-control/config";
import {
  CorpusManifestSchema,
  CorpusTestUtteranceResponseSchema,
} from "@alexa-control/shared";

import { CorpusCompiler, CorpusRuntimeService, CorpusValidator } from "../human-understanding/corpus.js";
import { PostgresHumanUnderstandingStore } from "../human-understanding/postgres-store.js";
import { PostgresMemoryStore } from "../memory/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";

try {
  process.loadEnvFile?.(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const command = process.argv[2] ?? "validate";
const defaultSourcePath =
  "/Users/arjunaravapalli/Downloads/Alexa_Personality_Seed_Corpus_v4_coverage_safety.md";
const defaultOutputPath = path.resolve(process.cwd(), "..", "..", "personality");
const sourcePath = process.argv[3] ?? defaultSourcePath;
const outputPath = process.argv[4] ?? defaultOutputPath;
const ownerId = process.env.PERSONALITY_OWNER_ID ?? process.argv[5] ?? null;

const compiler = new CorpusCompiler();

if (command === "compile") {
  const result = await compiler.writePackage(sourcePath, outputPath);
  process.stdout.write(
    `${JSON.stringify({ manifest: result.manifest, outputPath }, null, 2)}\n`,
  );
} else if (command === "validate") {
  const result = await compiler.compileFromMarkdown(sourcePath);
  const validation = new CorpusValidator().validate(
    ownerId ?? "00000000-0000-4000-8000-000000000001",
    result.manifest,
    result.entries,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        manifest: result.manifest,
        validation: {
          id: validation.id,
          status: validation.status,
          criticalCount: validation.criticalCount,
          warningCount: validation.warningCount,
          infoCount: validation.infoCount,
          sampleIssues: [...validation.issues]
            .sort(
              (left, right) =>
                severityRank(left.severity) - severityRank(right.severity),
            )
            .slice(0, 25),
        },
      },
      null,
      2,
    )}\n`,
  );
  if (validation.criticalCount > 0) process.exitCode = 1;
} else if (command === "stats") {
  const result = await compiler.compileFromMarkdown(sourcePath);
  const manifest = CorpusManifestSchema.parse(result.manifest);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} else if (command === "diff") {
  const left = await compiler.compileFromMarkdown(sourcePath);
  const rightPath = process.argv[4];
  if (!rightPath) throw new Error("Second corpus path is required for diff.");
  const right = await compiler.compileFromMarkdown(rightPath);
  process.stdout.write(
    `${JSON.stringify(
      {
        left: left.manifest,
        right: right.manifest,
        entryDelta: right.entries.length - left.entries.length,
        negativeDelta:
          right.manifest.negativeExampleCount - left.manifest.negativeExampleCount,
      },
      null,
      2,
    )}\n`,
  );
} else if (command === "import" || command === "seed") {
  if (!ownerId) {
    throw new Error("PERSONALITY_OWNER_ID or owner UUID argument is required for import/seed.");
  }
  const environment = parseApiEnvironment({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "development",
  });
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const database = new PostgresDatabase(environment.DATABASE_URL);
  try {
    const runtime = new CorpusRuntimeService(
      new PostgresHumanUnderstandingStore(database.pool),
      new PostgresMemoryStore(database.pool),
    );
    const result = await runtime.importFromMarkdown(ownerId, sourcePath);
    process.stdout.write(
      `${JSON.stringify(
        {
          manifest: result.manifest,
          validation: {
            status: result.validation.status,
            criticalCount: result.validation.criticalCount,
            warningCount: result.validation.warningCount,
            infoCount: result.validation.infoCount,
            sampleIssues: [...result.validation.issues]
              .sort(
                (left, right) =>
                  severityRank(left.severity) - severityRank(right.severity),
              )
              .slice(0, 25),
          },
          importRecord: result.importRecord,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await database.close();
  }
} else if (command === "test-utterance") {
  const utterance = process.argv.slice(3).join(" ").trim();
  if (!ownerId) {
    process.stdout.write(
      `${JSON.stringify(
        {
          utterance,
          note: "Set PERSONALITY_OWNER_ID to test against imported runtime corpus.",
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const environment = parseApiEnvironment({
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "development",
    });
    if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    const database = new PostgresDatabase(environment.DATABASE_URL);
    try {
      const runtime = new CorpusRuntimeService(
        new PostgresHumanUnderstandingStore(database.pool),
        new PostgresMemoryStore(database.pool),
      );
      process.stdout.write(
        `${JSON.stringify(
          CorpusTestUtteranceResponseSchema.parse(
            await runtime.testUtterance(ownerId, utterance),
          ),
          null,
          2,
        )}\n`,
      );
    } finally {
      await database.close();
    }
  }
} else if (command === "reindex") {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "noop",
        reason:
          "Corpus vector seeds are imported through existing memory records; full embedding reindexing remains owned by the existing retrieval infrastructure.",
      },
      null,
      2,
    )}\n`,
  );
} else {
  throw new Error(`Unknown personality corpus command: ${command}`);
}

function severityRank(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}
