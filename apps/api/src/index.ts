import { parseApiEnvironment } from "@alexa-control/config";

import { buildApi, LOG_REDACTION_PATHS } from "./app.js";
import { createTelemetrySink } from "./telemetry/service.js";
import { BUILT_IN_TOOLS } from "./governance/defaults.js";
import { PostgresGovernanceStore } from "./governance/postgres-store.js";
import type { GovernanceStore } from "./governance/store.js";
import {
  DevelopmentLoopbackNetworkVerifier,
  StaticNetworkVerifier,
  TailscaleLocalApiClient,
  TailscaleNetworkVerifier,
  UnknownNetworkVerifier,
} from "./identity/network.js";
import { PostgresIdentityStore } from "./identity/postgres-store.js";
import type { IdentityStore } from "./identity/store.js";
import { PostgresDatabase } from "./persistence/database.js";
import {
  InMemorySecurityStateStore,
  PostgresSecurityStateStore,
  type SecurityStateStore,
} from "./security-state/store.js";
import { InMemoryGovernanceStore } from "./governance/store.js";
import { InMemoryIdentityStore } from "./identity/store.js";
import { InMemoryExecutionStore, type ExecutionStore } from "./execution/store.js";
import { PostgresExecutionStore } from "./execution/postgres-store.js";
import { ServerExecutionSigner } from "./execution/server-key-store.js";
import { InMemoryRepositoryStore, type RepositoryStore } from "./repositories/store.js";
import { PostgresRepositoryStore } from "./repositories/postgres-store.js";
import { InMemoryPatchStore, type PatchStore } from "./patches/store.js";
import { PostgresPatchStore } from "./patches/postgres-store.js";
import { InMemoryValidationStore, type ValidationStore } from "./validation/store.js";
import { PostgresValidationStore } from "./validation/postgres-store.js";
import { InMemoryWorkflowStore, type WorkflowStore } from "./workflows/store.js";
import { PostgresWorkflowStore } from "./workflows/postgres-store.js";
import {
  InMemoryIntegrationStore,
  type IntegrationStore,
} from "./integrations/store.js";
import { PostgresIntegrationStore } from "./integrations/postgres-store.js";
import { GmailBusinessProvider } from "./integrations/gmail-provider.js";
import { StripeTestPaymentsProvider } from "./integrations/stripe-provider.js";
import { GoogleAdsTestProvider,GoogleAnalytics4Provider,ShopifyDevelopmentStoreProvider,XeroSandboxAccountingProvider } from "./integrations/commercial-read-providers.js";
import { AllowlistedEnvironmentSecretResolver } from "./integrations/secret-resolver.js";
import { InMemoryAgentStore, type AgentStore } from "./agents/store.js";
import { PostgresAgentStore } from "./agents/postgres-store.js";
import { InMemoryAgentOsStore, type AgentOsStore } from "./agents/os-store.js";
import { PostgresAgentOsStore } from "./agents/os-postgres-store.js";
import {
  InMemoryAgentCognitionStore,
  type AgentCognitionStore,
} from "./agent-cognition/store.js";
import { PostgresAgentCognitionStore } from "./agent-cognition/postgres-store.js";
import {
  InMemoryAgentEvolutionStore,
  type AgentEvolutionStore,
} from "./agent-evolution/store.js";
import { PostgresAgentEvolutionStore } from "./agent-evolution/postgres-store.js";
import {
  InMemoryAgentSocietyStore,
  type AgentSocietyStore,
} from "./agent-society/store.js";
import { PostgresAgentSocietyStore } from "./agent-society/postgres-store.js";
import { InMemoryMemoryStore, type MemoryStore } from "./memory/store.js";
import { PostgresMemoryStore } from "./memory/postgres-store.js";
import { InMemoryAdvisorStore, type AdvisorStore } from "./advisor/store.js";
import { PostgresAdvisorStore } from "./advisor/postgres-store.js";
import { InMemoryIntentStore, type IntentStore } from "./intent/store.js";
import { PostgresIntentStore } from "./intent/postgres-store.js";
import { InMemoryTaskStore, type TaskStore } from "./tasks/store.js";
import { PostgresTaskStore } from "./tasks/postgres-store.js";
import { InMemoryExecutiveStore, type ExecutiveStore } from "./executive/store.js";
import { PostgresExecutiveStore } from "./executive/postgres-store.js";
import { InMemoryReflectionStore, type ReflectionStore } from "./reflection/store.js";
import { PostgresReflectionStore } from "./reflection/postgres-store.js";
import { InMemoryDesktopStore, type DesktopStore } from "./desktop/store.js";
import { PostgresDesktopStore } from "./desktop/postgres-store.js";
import {
  InMemoryApplicationAdapterStore,
  type ApplicationAdapterStore,
} from "./application-adapters/store.js";
import { PostgresApplicationAdapterStore } from "./application-adapters/postgres-store.js";
import { InMemoryAdapterSdkStore, type AdapterSdkStore } from "./adapter-sdk/store.js";
import { PostgresAdapterSdkStore } from "./adapter-sdk/postgres-store.js";
import {
  InMemoryCoreAdapterStore,
  type CoreAdapterStore,
} from "./core-adapters/store.js";
import { PostgresCoreAdapterStore } from "./core-adapters/postgres-store.js";
import {
  InMemoryCrossApplicationWorkflowStore,
  type CrossApplicationWorkflowStore,
} from "./cross-application-workflows/store.js";
import { PostgresCrossApplicationWorkflowStore } from "./cross-application-workflows/postgres-store.js";
import {
  InMemoryApplicationIntelligenceStore,
  type ApplicationIntelligenceStore,
} from "./application-intelligence/store.js";
import { PostgresApplicationIntelligenceStore } from "./application-intelligence/postgres-store.js";
import {
  InMemoryWorkspaceIntelligenceStore,
  type WorkspaceIntelligenceStore,
} from "./workspace-intelligence/store.js";
import { PostgresWorkspaceIntelligenceStore } from "./workspace-intelligence/postgres-store.js";
import {
  InMemoryDeepIndexerStore,
  type DeepIndexerStore,
} from "./deep-indexers/store.js";
import { PostgresDeepIndexerStore } from "./deep-indexers/postgres-store.js";
import {
  InMemoryDesktopSkillStore,
  type DesktopSkillStore,
} from "./desktop-skills/store.js";
import { PostgresDesktopSkillStore } from "./desktop-skills/postgres-store.js";
import {
  InMemoryNativeProviderStore,
  type NativeProviderStore,
} from "./native-providers/store.js";
import { PostgresNativeProviderStore } from "./native-providers/postgres-store.js";
import { InMemorySpatialStore, type SpatialStore } from "./spatial/store.js";
import { PostgresSpatialStore } from "./spatial/postgres-store.js";
import { InMemoryVoiceStore, type VoiceStore } from "./voice/store.js";
import { PostgresVoiceStore } from "./voice/postgres-store.js";
import {
  InMemoryIntentRecordingStore,
  type IntentRecordingStore,
} from "./intent-recording/store.js";
import { PostgresIntentRecordingStore } from "./intent-recording/postgres-store.js";
import {
  InMemoryCapabilityStudioStore,
  type CapabilityStudioStore,
} from "./capability-studio/store.js";
import { PostgresCapabilityStudioStore } from "./capability-studio/postgres-store.js";
import {
  InMemorySemanticRetrievalStore,
  type SemanticRetrievalStore,
} from "./semantic/store.js";
import { PostgresSemanticRetrievalStore } from "./semantic/postgres-store.js";
import {
  InMemoryHumanUnderstandingStore,
  type HumanUnderstandingStore,
} from "./human-understanding/store.js";
import { PostgresHumanUnderstandingStore } from "./human-understanding/postgres-store.js";
import {
  InMemoryKnowledgeGraphStore,
  type KnowledgeGraphStore,
} from "./knowledge-graph/store.js";
import { PostgresKnowledgeGraphStore } from "./knowledge-graph/postgres-store.js";
import {
  InMemoryLearningEngineStore,
  type LearningEngineStore,
} from "./learning-engine/store.js";
import { PostgresLearningEngineStore } from "./learning-engine/postgres-store.js";
import {
  InMemoryMemoryStudioStore,
  type MemoryStudioStore,
} from "./memory-studio/store.js";
import { PostgresMemoryStudioStore } from "./memory-studio/postgres-store.js";
import { RedisService } from "./intelligence/redis-service.js";
import { CacheService } from "./intelligence/cache-service.js";
import { EmbeddingService } from "./intelligence/embedding-service.js";
import { WorkerService } from "./intelligence/worker-service.js";
import path from "node:path";
import { OllamaLocalRuntime } from "./local-ai/runtime.js";
import { LocalModelRegistry } from "./local-ai/registry.js";
import { LocalAIService } from "./local-ai/service.js";
import { createAIRuntime, createCanonicalAIServices } from "./ai/bootstrap.js";
import { AIEconomicsService } from "./ai/economics/service.js";
import { PostgresAIEconomicsStore } from "./ai/economics/postgres-store.js";
import { FcmPushProvider } from "./notifications/provider.js";

if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile?.(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const environment = parseApiEnvironment(process.env);
const integrationSecretResolver = new AllowlistedEnvironmentSecretResolver({
  "gmail:gmail-primary": environment.GMAIL_OAUTH_CREDENTIAL_JSON,
  "payments:stripe-test": environment.STRIPE_TEST_CREDENTIAL_JSON,
  "accounting:xero-sandbox": environment.XERO_SANDBOX_CREDENTIAL_JSON,
  "ads:google-ads-test": environment.GOOGLE_ADS_TEST_CREDENTIAL_JSON,
  "analytics:ga4": environment.GOOGLE_ANALYTICS_CREDENTIAL_JSON,
  "commerce:shopify-development": environment.SHOPIFY_DEVELOPMENT_CREDENTIAL_JSON,
});
let database: PostgresDatabase | undefined;
let identityStore: IdentityStore;
let governanceStore: GovernanceStore;
let securityStateStore: SecurityStateStore;
let executionStore: ExecutionStore;
let repositoryStore: RepositoryStore;
let patchStore: PatchStore;
let validationStore: ValidationStore;
let workflowStore: WorkflowStore;
let integrationStore: IntegrationStore;
let agentStore: AgentStore;
let agentOsStore: AgentOsStore;
let agentCognitionStore: AgentCognitionStore;
let agentEvolutionStore: AgentEvolutionStore;
let agentSocietyStore: AgentSocietyStore;
let memoryStore: MemoryStore;
let advisorStore: AdvisorStore;
let intentStore: IntentStore;
let taskStore: TaskStore;
let executiveStore: ExecutiveStore;
let reflectionStore: ReflectionStore;
let desktopStore: DesktopStore;
let applicationAdapterStore: ApplicationAdapterStore;
let adapterSdkStore: AdapterSdkStore;
let coreAdapterStore: CoreAdapterStore;
let crossApplicationWorkflowStore: CrossApplicationWorkflowStore;
let applicationIntelligenceStore: ApplicationIntelligenceStore;
let workspaceIntelligenceStore: WorkspaceIntelligenceStore;
let deepIndexerStore: DeepIndexerStore;
let desktopSkillStore: DesktopSkillStore;
let nativeProviderStore: NativeProviderStore;
let spatialStore: SpatialStore;
let voiceStore: VoiceStore;
let intentRecordingStore: IntentRecordingStore;
let capabilityStudioStore: CapabilityStudioStore;
let semanticStore: SemanticRetrievalStore;
let humanUnderstandingStore: HumanUnderstandingStore;
let knowledgeGraphStore: KnowledgeGraphStore;
let learningEngineStore: LearningEngineStore;
let memoryStudioStore: MemoryStudioStore;

if (environment.STORE_MODE === "postgres") {
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  database = new PostgresDatabase(environment.DATABASE_URL, {
    poolSize: environment.DATABASE_POOL_SIZE,
    sslMode: environment.DATABASE_SSL_MODE,
  });
  await database.ping();
  const migrationStatus = await database.status();
  if (migrationStatus.state !== "current") {
    throw new Error("Database migrations are not current. Run db:migrate:deploy.");
  }
  identityStore = new PostgresIdentityStore(database.pool);
  const postgresGovernance = new PostgresGovernanceStore(database.pool, BUILT_IN_TOOLS);
  await postgresGovernance.initialise();
  await postgresGovernance.getSecurityState();
  governanceStore = postgresGovernance;
  securityStateStore = new PostgresSecurityStateStore(database.pool);
  executionStore = new PostgresExecutionStore(database.pool);
  repositoryStore = new PostgresRepositoryStore(database.pool);
  patchStore = new PostgresPatchStore(database.pool);
  validationStore = new PostgresValidationStore(database.pool);
  workflowStore = new PostgresWorkflowStore(database.pool);
  integrationStore = new PostgresIntegrationStore(database.pool);
  agentStore = new PostgresAgentStore(database.pool);
  agentOsStore = new PostgresAgentOsStore(database.pool);
  agentCognitionStore = new PostgresAgentCognitionStore(database.pool);
  agentEvolutionStore = new PostgresAgentEvolutionStore(database.pool);
  agentSocietyStore = new PostgresAgentSocietyStore(database.pool);
  memoryStore = new PostgresMemoryStore(database.pool);
  advisorStore = new PostgresAdvisorStore(database.pool);
  intentStore = new PostgresIntentStore(database.pool);
  taskStore = new PostgresTaskStore(database.pool);
  executiveStore = new PostgresExecutiveStore(database.pool);
  reflectionStore = new PostgresReflectionStore(database.pool);
  desktopStore = new PostgresDesktopStore(database.pool);
  applicationAdapterStore = new PostgresApplicationAdapterStore(database.pool);
  adapterSdkStore = new PostgresAdapterSdkStore(database.pool);
  coreAdapterStore = new PostgresCoreAdapterStore(database.pool);
  crossApplicationWorkflowStore = new PostgresCrossApplicationWorkflowStore(
    database.pool,
  );
  applicationIntelligenceStore = new PostgresApplicationIntelligenceStore(
    database.pool,
  );
  workspaceIntelligenceStore = new PostgresWorkspaceIntelligenceStore(database.pool);
  deepIndexerStore = new PostgresDeepIndexerStore(database.pool);
  desktopSkillStore = new PostgresDesktopSkillStore(database.pool);
  nativeProviderStore = new PostgresNativeProviderStore(database.pool);
  spatialStore = new PostgresSpatialStore(database.pool);
  voiceStore = new PostgresVoiceStore(database.pool);
  intentRecordingStore = new PostgresIntentRecordingStore(database.pool);
  capabilityStudioStore = new PostgresCapabilityStudioStore(database.pool);
  semanticStore = new PostgresSemanticRetrievalStore(database.pool);
  humanUnderstandingStore = new PostgresHumanUnderstandingStore(database.pool);
  knowledgeGraphStore = new PostgresKnowledgeGraphStore(database.pool);
  learningEngineStore = new PostgresLearningEngineStore(database.pool);
  memoryStudioStore = new PostgresMemoryStudioStore(database.pool);
} else {
  if (environment.NODE_ENV === "production") {
    throw new Error("Production cannot use in-memory stores.");
  }
  identityStore = new InMemoryIdentityStore();
  governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS);
  securityStateStore = new InMemorySecurityStateStore();
  executionStore = new InMemoryExecutionStore();
  repositoryStore = new InMemoryRepositoryStore();
  patchStore = new InMemoryPatchStore();
  validationStore = new InMemoryValidationStore();
  workflowStore = new InMemoryWorkflowStore();
  integrationStore = new InMemoryIntegrationStore();
  agentStore = new InMemoryAgentStore();
  agentOsStore = new InMemoryAgentOsStore();
  agentCognitionStore = new InMemoryAgentCognitionStore();
  agentEvolutionStore = new InMemoryAgentEvolutionStore();
  agentSocietyStore = new InMemoryAgentSocietyStore();
  memoryStore = new InMemoryMemoryStore();
  advisorStore = new InMemoryAdvisorStore();
  intentStore = new InMemoryIntentStore();
  taskStore = new InMemoryTaskStore();
  executiveStore = new InMemoryExecutiveStore();
  reflectionStore = new InMemoryReflectionStore();
  desktopStore = new InMemoryDesktopStore();
  applicationAdapterStore = new InMemoryApplicationAdapterStore();
  adapterSdkStore = new InMemoryAdapterSdkStore();
  coreAdapterStore = new InMemoryCoreAdapterStore();
  crossApplicationWorkflowStore = new InMemoryCrossApplicationWorkflowStore();
  applicationIntelligenceStore = new InMemoryApplicationIntelligenceStore();
  workspaceIntelligenceStore = new InMemoryWorkspaceIntelligenceStore();
  deepIndexerStore = new InMemoryDeepIndexerStore();
  desktopSkillStore = new InMemoryDesktopSkillStore();
  nativeProviderStore = new InMemoryNativeProviderStore();
  spatialStore = new InMemorySpatialStore();
  voiceStore = new InMemoryVoiceStore();
  intentRecordingStore = new InMemoryIntentRecordingStore();
  capabilityStudioStore = new InMemoryCapabilityStudioStore();
  semanticStore = new InMemorySemanticRetrievalStore();
  humanUnderstandingStore = new InMemoryHumanUnderstandingStore();
  knowledgeGraphStore = new InMemoryKnowledgeGraphStore();
  learningEngineStore = new InMemoryLearningEngineStore();
  memoryStudioStore = new InMemoryMemoryStudioStore();
}

const redis = new RedisService({
  namespace: environment.REDIS_NAMESPACE,
  ...(environment.REDIS_URL ? { url: environment.REDIS_URL } : {}),
  ...(environment.REDIS_TOKEN ? { token: environment.REDIS_TOKEN } : {}),
  ...(environment.REDIS_HOST ? { host: environment.REDIS_HOST } : {}),
  port: environment.REDIS_PORT,
  ...(environment.REDIS_USERNAME ? { username: environment.REDIS_USERNAME } : {}),
  ...(environment.REDIS_PASSWORD ? { password: environment.REDIS_PASSWORD } : {}),
  tls: environment.REDIS_TLS,
});
const cache = new CacheService(redis, {
  enabled: environment.CACHE_ENABLED,
  namespace: environment.REDIS_NAMESPACE,
  defaultTtlSeconds: environment.CACHE_DEFAULT_TTL,
});
const embeddings = new EmbeddingService({
  provider: environment.EMBEDDING_PROVIDER,
  model: environment.EMBEDDING_MODEL,
  ...(environment.OPENAI_API_KEY ? { apiKey: environment.OPENAI_API_KEY } : {}),
  batchSize: environment.EMBEDDING_BATCH_SIZE,
  maxRetries: environment.EMBEDDING_MAX_RETRIES,
  dimensions: 1536,
});
const workers = new WorkerService({
  enabled: environment.BACKGROUND_WORKERS > 0,
  workerCount: environment.BACKGROUND_WORKERS,
  concurrency: environment.WORKER_CONCURRENCY,
});
const ollamaRuntime = new OllamaLocalRuntime(environment.OLLAMA_BASE_URL);
const localAI = new LocalAIService(ollamaRuntime, new LocalModelRegistry(), {
  enabled: environment.LOCAL_AI_ENABLED,
  modelName: environment.LOCAL_AI_DEFAULT_MODEL,
  maxConcurrentRequests: environment.LOCAL_AI_MAX_CONCURRENT_REQUESTS,
  interpretationTimeoutMs: environment.LOCAL_AI_INTERPRETATION_TIMEOUT_MS,
  conversationTimeoutMs: environment.LOCAL_AI_CONVERSATION_TIMEOUT_MS,
  structuredRetries: environment.LOCAL_AI_STRUCTURED_RETRIES,
  contextMaxCharacters: environment.LOCAL_AI_CONTEXT_MAX_CHARACTERS,
});
const aiRuntime = createAIRuntime({
  ollamaRuntime,
  ollamaEnabled: environment.LOCAL_AI_ENABLED,
  ollamaModel: environment.LOCAL_AI_DEFAULT_MODEL,
  ollamaMaxConcurrentRequests: environment.LOCAL_AI_MAX_CONCURRENT_REQUESTS,
  openAIEnabled: environment.OPENAI_ENABLED,
  ...(environment.OPENAI_API_KEY ? { openAIKey: environment.OPENAI_API_KEY } : {}),
  openAIModel: environment.OPENAI_DEFAULT_MODEL,
  openAIBaseUrl: environment.OPENAI_BASE_URL,
  roleMappings: [
    [
      "FAST_INTERPRETER",
      environment.AI_ROLE_FAST_INTERPRETER_PROVIDER,
      environment.AI_ROLE_FAST_INTERPRETER_MODEL,
    ],
    [
      "GENERAL_REASONER",
      environment.AI_ROLE_GENERAL_REASONER_PROVIDER,
      environment.AI_ROLE_GENERAL_REASONER_MODEL,
    ],
    ["WRITER", environment.AI_ROLE_WRITER_PROVIDER, environment.AI_ROLE_WRITER_MODEL],
    ["CODER", environment.AI_ROLE_CODER_PROVIDER, environment.AI_ROLE_CODER_MODEL],
    [
      "DEEP_REASONER",
      environment.AI_ROLE_DEEP_REASONER_PROVIDER,
      environment.AI_ROLE_DEEP_REASONER_MODEL,
    ],
  ],
});
const aiEconomics = database
  ? new AIEconomicsService(new PostgresAIEconomicsStore(database.pool))
  : new AIEconomicsService();
await aiEconomics.initialise();
if (!(await aiEconomics.pricingFor("openai", environment.OPENAI_DEFAULT_MODEL))) {
  await aiEconomics.upsertPricing({
    id: crypto.randomUUID(),
    providerId: "openai",
    modelId: environment.OPENAI_DEFAULT_MODEL,
    currency: "USD",
    inputPerMillionTokens: environment.OPENAI_ACCOUNTING_INPUT_PER_MILLION_TOKENS,
    outputPerMillionTokens: environment.OPENAI_ACCOUNTING_OUTPUT_PER_MILLION_TOKENS,
    effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
    version: "env-bootstrap-v1",
    source: "api_environment",
    status: "ACTIVE",
  });
}
const canonicalAI = createCanonicalAIServices(aiRuntime, aiEconomics);

const serverExecutionSigner = environment.READ_ONLY_EXECUTION_ENABLED
  ? await ServerExecutionSigner.load(
      path.resolve(
        environment.SERVER_EXECUTION_SIGNING_KEY_PATH ??
          ".local/server-execution-key.json",
      ),
      environment.NODE_ENV !== "production",
    )
  : undefined;

const networkVerifier =
  environment.NETWORK_VERIFIER_MODE === "tailscale"
    ? new TailscaleNetworkVerifier({
        lookup: new TailscaleLocalApiClient(environment.TAILSCALE_LOCALAPI_SOCKET),
        trustServeProxy: environment.TAILSCALE_TRUST_SERVE_PROXY,
        expectedTags: environment.TAILSCALE_EXPECTED_TAGS,
      })
    : environment.NETWORK_VERIFIER_MODE === "test" && environment.NODE_ENV === "test"
      ? new StaticNetworkVerifier("PRIVATE_NETWORK")
      : environment.NODE_ENV !== "production" &&
          (environment.API_HOST === "127.0.0.1" ||
            environment.API_HOST === "localhost" ||
            environment.API_HOST === "::1")
        ? new DevelopmentLoopbackNetworkVerifier()
        : new UnknownNetworkVerifier();

const app = await buildApi({
  telemetry: createTelemetrySink(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
  deploymentMode: environment.DEPLOYMENT_MODE,
  corsOrigin: environment.WEB_ORIGIN,
  privateNetworkRequired: environment.PRIVATE_NETWORK_REQUIRED,
  nodeEnvironment: environment.NODE_ENV,
  allowOwnerBootstrap:
    environment.NODE_ENV !== "production" && environment.AUTH_ALLOW_OWNER_BOOTSTRAP,
  sessionCookieName: environment.SESSION_COOKIE_NAME,
  sessionTtlSeconds: environment.SESSION_TTL_SECONDS,
  sessionIdleTtlSeconds: environment.SESSION_IDLE_TTL_SECONDS,
  sessionAbsoluteTtlSeconds: environment.SESSION_ABSOLUTE_TTL_SECONDS,
  pairingTtlSeconds: environment.PAIRING_TTL_SECONDS,
  signedRequestToleranceSeconds: environment.SIGNED_REQUEST_TOLERANCE_SECONDS,
  logger: {
    level: environment.LOG_LEVEL,
    redact: {
      paths: [...LOG_REDACTION_PATHS],
      censor: "[REDACTED]",
    },
  },
  identityStore,
  governanceStore,
  securityStateStore,
  networkVerifier,
  csrfTtlSeconds: environment.CSRF_TOKEN_TTL_SECONDS,
  recentAuthTtlSeconds: environment.RECENT_AUTH_TTL_SECONDS,
  recoveryCodeCount: environment.RECOVERY_CODE_COUNT,
  allowedHosts: environment.ALLOWED_HOSTS,
  trustedProxyMode: environment.TRUSTED_PROXY_MODE,
  persistenceMode:
    environment.STORE_MODE === "postgres" ? "postgresql" : "in_memory_development",
  durableSchedulerEnabled:
    environment.NODE_ENV === "production" || process.env.ALEXA_DURABLE_WORKER === "1",
  databaseReady: async () => {
    if (!database) return environment.NODE_ENV !== "production";
    try {
      await database.ping();
      return true;
    } catch {
      return false;
    }
  },
  migrationState: async () => (database ? (await database.status()).state : "current"),
  productionNetworkVerifierConfigured:
    environment.NODE_ENV !== "production" ||
    environment.NETWORK_VERIFIER_MODE === "tailscale" ||
    environment.DEPLOYMENT_MODE === "cloud",
  executionStore,
  repositoryStore,
  patchStore,
  validationStore,
  workflowStore,
  integrationStore,
  integrationSecretResolver,
  businessProviders: [
    ...(environment.GMAIL_OAUTH_CREDENTIAL_JSON?[new GmailBusinessProvider()]:[]),
    ...(environment.STRIPE_TEST_CREDENTIAL_JSON?[new StripeTestPaymentsProvider()]:[]),
    ...(environment.XERO_SANDBOX_CREDENTIAL_JSON?[new XeroSandboxAccountingProvider()]:[]),
    ...(environment.GOOGLE_ADS_TEST_CREDENTIAL_JSON?[new GoogleAdsTestProvider()]:[]),
    ...(environment.GOOGLE_ANALYTICS_CREDENTIAL_JSON?[new GoogleAnalytics4Provider()]:[]),
    ...(environment.SHOPIFY_DEVELOPMENT_CREDENTIAL_JSON?[new ShopifyDevelopmentStoreProvider()]:[]),
  ],
  agentStore,
  agentOsStore,
  agentCognitionStore,
  agentEvolutionStore,
  agentSocietyStore,
  memoryStore,
  advisorStore,
  intentStore,
  taskStore,
  executiveStore,
  reflectionStore,
  desktopStore,
  applicationAdapterStore,
  adapterSdkStore,
  coreAdapterStore,
  crossApplicationWorkflowStore,
  applicationIntelligenceStore,
  workspaceIntelligenceStore,
  deepIndexerStore,
  desktopSkillStore,
  nativeProviderStore,
  spatialStore,
  voiceStore,
  intentRecordingStore,
  capabilityStudioStore,
  semanticStore,
  humanUnderstandingStore,
  knowledgeGraphStore,
  learningEngineStore,
  memoryStudioStore,
  redis,
  cache,
  embeddings,
  workers,
  retrievalOptions: {
    semanticSearchEnabled: environment.SEMANTIC_SEARCH_ENABLED,
    hybridSearchEnabled: environment.HYBRID_SEARCH_ENABLED,
    keywordWeight: environment.KEYWORD_WEIGHT,
    vectorWeight: environment.VECTOR_WEIGHT,
    similarityThreshold: environment.MEMORY_SIMILARITY_THRESHOLD,
    retrievalLimit: environment.MEMORY_RETRIEVAL_LIMIT,
  },
  infrastructureOptions: {
    memoryEnabled: environment.MEMORY_ENABLED,
    retrievalLimit: environment.MEMORY_RETRIEVAL_LIMIT,
    similarityThreshold: environment.MEMORY_SIMILARITY_THRESHOLD,
    maxContext: environment.MEMORY_MAX_CONTEXT,
    vectorDimensions: 1536,
  },
  ...(database ? { database } : {}),
  ...(serverExecutionSigner ? { serverExecutionSigner } : {}),
  localAI,
  aiRuntime,
  aiEconomics: canonicalAI.aiEconomics,
  cognitiveContext: canonicalAI.cognitiveContext,
  aiRouter: canonicalAI.aiRouter,
  readOnlyExecutionEnabled: environment.READ_ONLY_EXECUTION_ENABLED,
  ...(environment.FCM_PROJECT_ID
    ? { pushProvider: new FcmPushProvider(environment.FCM_PROJECT_ID) }
    : {}),
  executionLimits: {
    requestTtlSeconds: environment.EXECUTION_REQUEST_TTL_SECONDS,
    resultRetentionSeconds: environment.EXECUTION_RESULT_RETENTION_SECONDS,
    maxFileReadBytes: environment.MAX_FILE_READ_BYTES,
    maxExecutionResultBytes: environment.MAX_EXECUTION_RESULT_BYTES,
    maxRepositoryScanResultBytes: environment.MAX_REPOSITORY_SCAN_RESULT_BYTES,
  },
});

if (database) {
  app.addHook("onClose", async () => {
    await database?.close();
  });
}

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "graceful shutdown requested");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({
    host: environment.API_HOST,
    port: environment.PORT ?? environment.API_PORT,
  });
} catch (error) {
  app.log.fatal({ err: error }, "API failed to start");
  process.exit(1);
}
