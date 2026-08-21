import { z } from "zod";
import { AIBenchmarkRunner } from "../ai/benchmark/service.js";
import { PostgresAIBenchmarkStore } from "../ai/benchmark/postgres-store.js";
import { createAIRuntime, createCanonicalAIServices } from "../ai/bootstrap.js";
import { CognitiveContextService } from "../ai/context/service.js";
import { AIEconomicsService } from "../ai/economics/service.js";
import { OllamaLocalRuntime } from "../local-ai/runtime.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";

const ownerId = "20202020-2020-4020-8020-202020202020";
const connectionString = safeTestDatabaseUrl();
const designateBaseline = process.env.AI_BENCHMARK_BASELINE === "true";
const benchmarkDatabase = connectionString
  ? new PostgresDatabase(connectionString)
  : undefined;
if (benchmarkDatabase) {
  await benchmarkDatabase.migrate();
  await benchmarkDatabase.pool.query(
    `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
     VALUES($1,$2,'test-only',$3,NOW(),NOW())
     ON CONFLICT(id) DO NOTHING`,
    [ownerId, "phase20r-d-benchmark@example.test", { id: ownerId }],
  );
}
const modelId = process.env.LOCAL_AI_DEFAULT_MODEL ?? "gemma3:4b";
const ollama = new OllamaLocalRuntime(
  process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
);
if (!(await ollama.healthCheck())) throw new Error("OLLAMA_UNAVAILABLE");
if (!(await ollama.isModelAvailable(modelId)))
  throw new Error(`OLLAMA_MODEL_UNAVAILABLE:${modelId}`);

const runtime = createAIRuntime({
  ollamaRuntime: ollama,
  ollamaEnabled: true,
  ollamaModel: modelId,
  ollamaMaxConcurrentRequests: 1,
  openAIEnabled: false,
  openAIModel: "disabled",
  openAIBaseUrl: "https://api.openai.com/v1",
  roleMappings: [["FAST_INTERPRETER", "ollama", modelId]],
});
const context = new CognitiveContextService();
context.register({
  sourceType: "RECENT_ACTIVITY",
  retrieve: () =>
    Promise.resolve([
      {
        id: "benchmark:recent-alexa",
        canonicalKey: "recent-alexa",
        sourceType: "RECENT_ACTIVITY",
        trustLevel: "TRUSTED",
        title: "Bounded benchmark state",
        content: {
          recentProject: "Alexa",
          recentApplication: "VS Code",
          recentTask: "Phase 20 production validation",
        },
        relevanceScore: 0.8,
        importanceScore: 0.8,
        confidence: 1,
        estimatedTokens: 32,
        cacheability: "DYNAMIC",
        sensitivity: "NORMAL",
        mandatory: false,
      },
    ]),
});
const economics = new AIEconomicsService();
await economics.initialise();
const { aiRouter } = createCanonicalAIServices(runtime, economics, context);
const interpretation = z
  .object({
    intent: z.string().max(160).nullable(),
    confidence: z.number().min(0).max(1),
    requiresClarification: z.boolean(),
    nonExecution: z.boolean(),
  })
  .strict();

const runner = new AIBenchmarkRunner(async (item) => {
  const started = performance.now();
  const response = await aiRouter.executeStructured({
    requestId: crypto.randomUUID(),
    purpose: "INTERPRETATION",
    requestedRole: "FAST_INTERPRETER",
    input: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Classify this Alexa request. Negated, quoted, hypothetical, educational, or descriptive actions must set nonExecution=true. Ambiguous references must set requiresClarification=true. Request: ${item.input}`,
          },
        ],
      },
    ],
    outputMode: "STRUCTURED",
    schemaName: "Phase20RDInterpretation",
    schema: interpretation,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        requiresClarification: { type: "boolean" },
        nonExecution: { type: "boolean" },
      },
      required: ["intent", "confidence", "requiresClarification", "nonExecution"],
    },
    privacy: "LOCAL_ONLY",
    locality: "LOCAL_ONLY",
    allowCloud: false,
    allowFallback: false,
    maxAttempts: 1,
    economicContext: {
      ownerId,
      purpose: "INTERPRETATION",
      autonomyMode: "INTERACTIVE",
      priority: "IMPORTANT",
      costCenter: "phase20r-d-local-benchmark",
    },
  });
  const output = response.structuredOutput as
    z.infer<typeof interpretation> | undefined;
  const trace = response.decision.contextId
    ? context.getTrace(ownerId, response.decision.contextId)
    : undefined;
  const contextIncludedIds = trace?.blocks.flatMap((block) => [
    block.id,
    block.id.replace(/^benchmark:/, ""),
    ...(block.sourceReferences ?? []).map((reference) => reference.sourceId),
  ]);
  return {
    ...(output ? { output } : {}),
    ...(response.providerId ? { providerId: response.providerId } : {}),
    ...(response.modelId ? { modelId: response.modelId } : {}),
    locality: "LOCAL" as const,
    latencyMs: Math.round(performance.now() - started),
    nonExecution: output?.nonExecution ?? false,
    clarificationRequired: output?.requiresClarification ?? false,
    executionAttempted: false,
    ...(contextIncludedIds ? { contextIncludedIds } : {}),
    ...(response.outcome === "SUCCESS" ? {} : { errorCode: response.outcome }),
  };
}, benchmarkDatabase ? new PostgresAIBenchmarkStore(benchmarkDatabase.pool) : undefined);

const plan = [
  ["alexa-voice-understanding", 8],
  ["alexa-non-execution-safety", 12],
  ["alexa-clarification", 8],
  ["alexa-structured-output", 2],
  ["alexa-context-retrieval", 1],
] as const;
const runs = [];
for (const [suiteId, maxCases] of plan)
  runs.push(
    await runner.runSuite(ownerId, suiteId, "LOCAL", {
      maxCases,
      baseline: designateBaseline,
    }),
  );
const results = runs.flatMap((run) => run.results);
const latencies = results
  .flatMap((result) => (result.latencyMs === undefined ? [] : [result.latencyMs]))
  .sort((a, b) => a - b);
const passed = results.filter((result) => result.status === "PASS").length;
const nonExecution = results.filter((result) =>
  result.caseId.startsWith("non-execution"),
);
const clarification = results.filter((result) =>
  result.caseId.startsWith("clarification"),
);
const structured = results.filter((result) => result.caseId.startsWith("structured"));
console.log(
  JSON.stringify(
    {
      executedAt: new Date().toISOString(),
      provider: "ollama",
      model: modelId,
      persistence: benchmarkDatabase ? "POSTGRESQL" : "IN_MEMORY_DEVELOPMENT",
      cases: results.length,
      successful: passed,
      failed: results.length - passed,
      passRate: results.length ? passed / results.length : 0,
      structuredFirstPassRate:
        structured.filter((result) => result.status === "PASS").length /
        Math.max(1, structured.length),
      structuredFinalRate:
        structured.filter((result) => result.status === "PASS").length /
        Math.max(1, structured.length),
      clarificationRate:
        clarification.filter((result) => result.status === "PASS").length /
        Math.max(1, clarification.length),
      nonExecutionRate:
        nonExecution.filter((result) => result.status === "PASS").length /
        Math.max(1, nonExecution.length),
      averageLatencyMs: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null,
      p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? null,
      p95LatencyMs:
        latencies[
          Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
        ] ?? null,
      runs,
    },
    null,
    2,
  ),
);
await benchmarkDatabase?.close();
