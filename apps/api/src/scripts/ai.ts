import { parseApiEnvironment } from "@alexa-control/config";
import { createAIRuntime } from "../ai/bootstrap.js";
import { OllamaLocalRuntime } from "../local-ai/runtime.js";
import { AIEconomicsService } from "../ai/economics/service.js";
import { CognitiveContextService } from "../ai/context/service.js";
import { AIBenchmarkRunner } from "../ai/benchmark/service.js";
import { PostgresDatabase } from "../persistence/database.js";
import { PostgresAIEconomicsStore } from "../ai/economics/postgres-store.js";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* diagnostic defaults */
}
const env = parseApiEnvironment(process.env);
const runtime = createAIRuntime({
  ollamaRuntime: new OllamaLocalRuntime(env.OLLAMA_BASE_URL),
  ollamaEnabled: env.LOCAL_AI_ENABLED,
  ollamaModel: env.LOCAL_AI_DEFAULT_MODEL,
  ollamaMaxConcurrentRequests: env.LOCAL_AI_MAX_CONCURRENT_REQUESTS,
  openAIEnabled: env.OPENAI_ENABLED,
  ...(env.OPENAI_API_KEY ? { openAIKey: env.OPENAI_API_KEY } : {}),
  openAIModel: env.OPENAI_DEFAULT_MODEL,
  openAIBaseUrl: env.OPENAI_BASE_URL,
});
const [command, ...args] = process.argv.slice(2);
const economicsDatabase =
  env.STORE_MODE === "postgres" && env.DATABASE_URL
    ? new PostgresDatabase(env.DATABASE_URL, {
        poolSize: env.DATABASE_POOL_SIZE,
        sslMode: env.DATABASE_SSL_MODE,
      })
    : undefined;
const economics = economicsDatabase
  ? new AIEconomicsService(new PostgresAIEconomicsStore(economicsDatabase.pool))
  : new AIEconomicsService();
await economics.initialise();
const context = new CognitiveContextService();
const benchmarks = new AIBenchmarkRunner(() => ({
  errorCode: "BENCHMARK_EXECUTOR_NOT_CONFIGURED",
}));
const ownerId = process.env.AI_OWNER_ID;
if (command === "providers")
  console.log(JSON.stringify(runtime.listProviders(), null, 2));
else if (command === "health")
  console.log(JSON.stringify(await runtime.providerHealth(), null, 2));
else if (command === "models")
  console.log(JSON.stringify(runtime.listModels(), null, 2));
else if (command === "roles") console.log(JSON.stringify(runtime.listRoles(), null, 2));
else if (command === "economics-health")
  console.log(JSON.stringify(await economics.health(), null, 2));
else if (command === "context-health")
  console.log(JSON.stringify(context.health(), null, 2));
else if (command === "context-sources")
  console.log(JSON.stringify(context.listSources(), null, 2));
else if (command === "benchmark-list")
  console.log(JSON.stringify(benchmarks.suites(), null, 2));
else if (command === "benchmark-run")
  console.log(
    JSON.stringify(
      await benchmarks.runSuite(
        ownerId ??
          (() => {
            throw new Error("AI_OWNER_ID is required for benchmark runs.");
          })(),
        args[0] ?? "alexa-core-deterministic",
        (args[1] as "DRY_RUN" | "FAST" | "LOCAL" | "LIVE_PAID" | "LOAD" | undefined) ??
          "DRY_RUN",
      ),
      null,
      2,
    ),
  );
else if (command === "benchmark-regressions")
  console.log(JSON.stringify(ownerId ? await benchmarks.regressions(ownerId) : [], null, 2));
else if (command === "context") {
  if (!ownerId) throw new Error("AI_OWNER_ID is required for context inspection.");
  console.log(
    JSON.stringify(
      await context.compose({
        ownerId,
        purpose: "OTHER",
        requestedProfile: (args[0] ?? "GENERAL_CONVERSATION") as never,
        taskText: args.slice(1).join(" "),
      }),
      null,
      2,
    ),
  );
} else if (["budget", "usage", "forecast", "reservations"].includes(command ?? "")) {
  if (!ownerId) throw new Error("AI_OWNER_ID is required for economics inspection.");
  const output =
    command === "budget"
      ? economics.listPolicies(ownerId)
      : command === "usage"
        ? economics.listLedger(ownerId)
        : command === "reservations"
          ? economics.listReservations(ownerId)
          : economics.overview(ownerId);
  console.log(JSON.stringify(await output, null, 2));
} else
  throw new Error(
    "Usage: ai.ts <providers|health|models|roles|economics-health|budget|usage|forecast|reservations|context-health|context-sources|context|benchmark-list|benchmark-run|benchmark-regressions>",
  );
await economicsDatabase?.close();
