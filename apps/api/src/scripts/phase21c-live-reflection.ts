import { PostgresAIBenchmarkStore } from "../ai/benchmark/postgres-store.js";
import { createAIRuntime, createCanonicalAIServices } from "../ai/bootstrap.js";
import { CognitiveContextService } from "../ai/context/service.js";
import { PostgresAIEconomicsStore } from "../ai/economics/postgres-store.js";
import { AIEconomicsService } from "../ai/economics/service.js";
import { InMemoryExecutiveStore } from "../executive/store.js";
import { OllamaLocalRuntime } from "../local-ai/runtime.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { LiveReflectionBenchmarkRunner } from "../reflection/live-benchmark.js";
import { ReflectionEngineService } from "../reflection/service.js";
import { InMemoryReflectionStore } from "../reflection/store.js";
import { InMemoryTaskStore } from "../tasks/store.js";

const ownerId = "21212121-2121-4121-8121-212121212121";
const connectionString = safeTestDatabaseUrl();
if (!connectionString) throw new Error("TEST_DATABASE_URL_REQUIRED");
const database = new PostgresDatabase(connectionString);
await database.migrate();
await database.pool.query(
  `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
   VALUES($1,$2,'test-only',$3,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
  [ownerId, "phase21c-reflection@example.test", { id: ownerId }],
);
const modelId = process.env.LOCAL_AI_DEFAULT_MODEL ?? "gemma3:4b";
const ollama = new OllamaLocalRuntime(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
if (!(await ollama.healthCheck())) throw new Error("OLLAMA_UNAVAILABLE");
if (!(await ollama.isModelAvailable(modelId))) throw new Error(`OLLAMA_MODEL_UNAVAILABLE:${modelId}`);
const runtime = createAIRuntime({
  ollamaRuntime: ollama, ollamaEnabled: true, ollamaModel: modelId, ollamaMaxConcurrentRequests: 1,
  openAIEnabled: false, openAIModel: "disabled", openAIBaseUrl: "https://api.openai.com/v1",
  roleMappings: [["GENERAL_REASONER", "ollama", modelId]],
});
const context = new CognitiveContextService();
context.register({
  sourceType: "RECENT_ACTIVITY",
  retrieve: () => Promise.resolve([{ id: "phase21c:benchmark-contract", canonicalKey: "phase21c-benchmark-contract", sourceType: "RECENT_ACTIVITY", trustLevel: "TRUSTED", title: "Reflection benchmark contract", content: { contract: "Use durable evidence only; unsupported causal claims fail." }, relevanceScore: 1, importanceScore: 1, confidence: 1, estimatedTokens: 24, cacheability: "STATIC", sensitivity: "NORMAL", mandatory: true }]),
});
const economics = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
await economics.initialise();
const { aiRouter } = createCanonicalAIServices(runtime, economics, context);
const reflection = new ReflectionEngineService(new InMemoryReflectionStore(), new InMemoryExecutiveStore(), new InMemoryTaskStore(), () => new Date(), aiRouter);
const store = new PostgresAIBenchmarkStore(database.pool);
const runner = new LiveReflectionBenchmarkRunner(reflection, store);
const run = await runner.run(ownerId, { baseline: true });
const restartedStore = new PostgresAIBenchmarkStore(database.pool);
const restarted = new LiveReflectionBenchmarkRunner(reflection, restartedStore);
void restarted;
const recovered = await restartedStore.getRun(ownerId, run.id);
const profiles = await restartedStore.listProfiles(ownerId);
const failed = run.results.filter((result) => result.status !== "PASS");
const metric = (name: string) => run.metrics.find((item) => item.name === name)?.value ?? null;
console.log(JSON.stringify({
  runId: run.id,
  baseline: run.baseline,
  baselineName: run.environment?.baselineName,
  suiteVersion: run.suiteVersion,
  model: modelId,
  cases: run.caseCount,
  successful: run.results.filter((result) => result.status === "PASS").length,
  failed: failed.length,
  structuredFirstPassRate: metric("structured_first_pass_rate"),
  structuredFinalRate: metric("structured_final_rate"),
  groundedEvidenceRate: metric("grounded_evidence_rate"),
  unsupportedCausalClaimCount: metric("unsupported_causal_claim_count"),
  outcomeClassificationRate: metric("outcome_classification_rate"),
  inconclusiveHandlingRate: metric("inconclusive_handling_rate"),
  averageLatencyMs: metric("average_latency_ms"),
  p50LatencyMs: metric("p50_latency_ms"),
  p95LatencyMs: metric("p95_latency_ms"),
  failedCaseIds: failed.map((result) => result.caseId),
  failureReasons: Object.fromEntries(failed.map((result) => [result.caseId, result.reason ?? result.errorCode ?? "unknown"])),
  persistence: "POSTGRESQL",
  restartProof: {
    runSurvives: recovered?.id === run.id,
    allResultsSurvive: recovered?.results.length === run.results.length,
    failedIdsSurvive: JSON.stringify(recovered?.results.filter((result) => result.status !== "PASS").map((result) => result.caseId)) === JSON.stringify(failed.map((result) => result.caseId)),
    metricsSurvive: recovered?.metrics.length === run.metrics.length,
    profileSurvives: profiles.some((profile) => profile.providerId === "ollama" && profile.modelId === modelId),
    baselineSurvives: recovered?.baseline === true,
  },
}, null, 2));
await database.close();
