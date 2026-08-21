import { createAIRuntime, createCanonicalAIServices } from "../ai/bootstrap.js";
import { CognitiveContextService } from "../ai/context/service.js";
import { PostgresAIEconomicsStore } from "../ai/economics/postgres-store.js";
import { AIEconomicsService } from "../ai/economics/service.js";
import { InMemoryDesktopSkillStore } from "../desktop-skills/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { OllamaLocalRuntime } from "../local-ai/runtime.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { InMemoryReflectionStore } from "../reflection/store.js";
import { PostgresSkillEvolutionStore } from "../skill-evolution/postgres-store.js";
import { SkillEvolutionService } from "../skill-evolution/service.js";

const ownerId = "21212121-2121-4121-8121-2121212121dd";
const connectionString = safeTestDatabaseUrl();
if (!connectionString) throw new Error("TEST_DATABASE_URL_REQUIRED");
const database = new PostgresDatabase(connectionString);
await database.migrate();
await database.pool.query(`
  CREATE TABLE IF NOT EXISTS skill_evolution_artifacts(
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN (
      'CANDIDATE','SKILL','VERSION','VALIDATION','BENCHMARK','PROMOTION',
      'USAGE','EVENT','SUPPRESSION','EVALUATION','DRAFT_RUN','DRAFT_RESULT'
    )),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    record JSONB NOT NULL
  )
`);
await database.pool.query(`
  CREATE INDEX IF NOT EXISTS skill_evolution_artifacts_owner_kind_updated_idx
    ON skill_evolution_artifacts(owner_id,kind,updated_at DESC)
`);
await database.pool.query(
  `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
   VALUES($1,$2,'test-only',$3,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`,
  [ownerId, "phase21d-skill-drafting@example.test", { id: ownerId }],
);
const modelId = process.env.LOCAL_AI_DEFAULT_MODEL ?? "gemma3:4b";
const ollama = new OllamaLocalRuntime(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
if (!(await ollama.healthCheck())) throw new Error("OLLAMA_UNAVAILABLE");
if (!(await ollama.isModelAvailable(modelId))) throw new Error(`OLLAMA_MODEL_UNAVAILABLE:${modelId}`);
const runtime = createAIRuntime({
  ollamaRuntime: ollama,
  ollamaEnabled: true,
  ollamaModel: modelId,
  ollamaMaxConcurrentRequests: 1,
  openAIEnabled: false,
  openAIModel: "disabled",
  openAIBaseUrl: "https://api.openai.com/v1",
  roleMappings: [["GENERAL_REASONER", "ollama", modelId]],
});
const context = new CognitiveContextService();
context.register({
  sourceType: "RECENT_ACTIVITY",
  retrieve: () =>
    Promise.resolve([
      {
        id: "phase21d:skill-draft-contract",
        canonicalKey: "phase21d-skill-draft-contract",
        sourceType: "RECENT_ACTIVITY",
        trustLevel: "TRUSTED",
        title: "Skill drafting contract",
        content: {
          contract:
            "Draft bounded skills only. Capabilities are suggestions and remain untrusted until deterministic validation.",
        },
        relevanceScore: 1,
        importanceScore: 1,
        confidence: 1,
        estimatedTokens: 32,
        cacheability: "STATIC",
        sensitivity: "NORMAL",
        mandatory: true,
      },
    ]),
});
const economics = new AIEconomicsService(new PostgresAIEconomicsStore(database.pool));
await economics.initialise();
const { aiRouter } = createCanonicalAIServices(runtime, economics, context);
const audit: GovernanceAuditWriter = () => {};
const service = new SkillEvolutionService(
  new PostgresSkillEvolutionStore(database.pool),
  new InMemoryDesktopSkillStore(),
  new InMemoryIntentRecordingStore(),
  new InMemoryLearningEngineStore(),
  new InMemoryReflectionStore(),
  audit,
  () => new Date(),
  aiRouter,
);
const run = await service.runDraftBenchmark(ownerId, { live: true, baseline: true });
const restarted = new SkillEvolutionService(
  new PostgresSkillEvolutionStore(database.pool),
  new InMemoryDesktopSkillStore(),
  new InMemoryIntentRecordingStore(),
  new InMemoryLearningEngineStore(),
  new InMemoryReflectionStore(),
  audit,
  () => new Date(),
  aiRouter,
);
const dashboard = await restarted.dashboard(ownerId);
const recovered = dashboard.draftBenchmarkRuns.find((item) => item.id === run.id);
const results = dashboard.draftBenchmarkResults.filter((item) => item.runId === run.id);
console.log(
  JSON.stringify(
    {
      runId: run.id,
      baseline: run.baseline,
      baselineName: run.baselineName,
      model: `${run.modelProvider}/${run.modelId}`,
      cases: run.cases,
      structuredFirstPassRate: run.structuredFirstPassRate,
      afterDeterministicRepairRate: run.afterDeterministicRepairRate,
      afterModelRepairRate: run.afterModelRepairRate,
      structuredFinalRate: run.structuredFinalRate,
      validCapabilityProposalRate: run.validCapabilityProposalRate,
      unsafeCapabilityProposalCount: run.unsafeCapabilityProposalCount,
      unsafeProposalAccepted: run.unsafeProposalAccepted,
      duplicateDetectionRate: run.duplicateDetectionRate,
      draftUsefulnessRate: run.draftUsefulnessRate,
      averageLatencyMs: run.averageLatencyMs,
      p50LatencyMs: run.p50LatencyMs,
      p95LatencyMs: run.p95LatencyMs,
      failedCaseIds: run.failedCaseIds,
      mostCommonFailureCategory: run.mostCommonFailureCategory,
      promptVersion: run.promptVersion,
      modelFacingSchemaVersion: run.modelFacingSchemaVersion,
      repairPolicyVersion: run.repairPolicyVersion,
      restartProof: {
        runSurvives: recovered?.id === run.id,
        caseResultsSurvive: results.length === run.cases,
        modelProfileSurvives: recovered?.modelId === modelId,
        baselineSurvives: recovered?.baseline === true,
      },
    },
    null,
    2,
  ),
);
await database.close();
