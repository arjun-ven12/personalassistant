import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  LogController,
} from "fastify";
import { ZodError } from "zod";

import { ApiSecurityError } from "./identity/errors.js";
import { GovernanceError } from "./governance/errors.js";
import { BUILT_IN_TOOLS } from "./governance/defaults.js";
import { ApprovalService } from "./governance/approval-service.js";
import { GovernanceService } from "./governance/service.js";
import { RegistryService } from "./governance/registry-service.js";
import { RiskEngine } from "./governance/risk-engine.js";
import { PolicyEngine } from "./governance/policy-engine.js";
import { InMemoryGovernanceStore, type GovernanceStore } from "./governance/store.js";
import { PlaceholderNetworkVerifier } from "./identity/network.js";
import { SecurityMiddleware } from "./identity/security.js";
import { IdentityService } from "./identity/service.js";
import { InMemoryIdentityStore, type IdentityStore } from "./identity/store.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import type { ApiRouteContext } from "./routes/context.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerApplicationRoutes } from "./routes/applications.js";
import { registerApplicationDiscoveryRoutes } from "./routes/application-discovery.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerToolRoutes } from "./routes/tools.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import {
  SignedCommandEnvelopeSchema,
  type NetworkVerifier,
} from "@alexa-control/shared";
import {
  InMemorySecurityStateStore,
  type SecurityStateStore,
} from "./security-state/store.js";
import { SecurityStateService } from "./security-state/service.js";
import { registerSecurityRoutes } from "./routes/security.js";
import { isLoopbackAddress } from "./identity/network.js";
import { ExecutionError } from "./execution/errors.js";
import { ExecutionService, type ExecutionLimits } from "./execution/service.js";
import { InMemoryExecutionStore, type ExecutionStore } from "./execution/store.js";
import type { ServerExecutionSigner } from "./execution/server-key-store.js";
import { registerExecutionRoutes } from "./routes/executions.js";
import { InMemoryRepositoryStore, type RepositoryStore } from "./repositories/store.js";
import { RepositoryService } from "./repositories/service.js";
import { registerRepositoryRoutes } from "./routes/repositories.js";
import { InMemoryPatchStore, type PatchStore } from "./patches/store.js";
import { PatchService } from "./patches/service.js";
import { registerPatchRoutes } from "./routes/patches.js";
import { InMemoryValidationStore, type ValidationStore } from "./validation/store.js";
import { ValidationService } from "./validation/service.js";
import { registerValidationRoutes } from "./routes/validations.js";
import { InMemoryWorkflowStore, type WorkflowStore } from "./workflows/store.js";
import { WorkflowEngineService } from "./workflows/service.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import {
  InMemoryIntegrationStore,
  type IntegrationStore,
} from "./integrations/store.js";
import { IntegrationRegistryService } from "./integrations/service.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { InMemoryAgentStore, type AgentStore } from "./agents/store.js";
import { AgentRegistryService } from "./agents/service.js";
import { AgentFactoryService } from "./agents/factory.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { InMemoryAgentOsStore, type AgentOsStore } from "./agents/os-store.js";
import { AgentOsService } from "./agents/os-service.js";
import { registerAgentOsRoutes } from "./routes/agent-os.js";
import { ExternalHarvestService } from "./external-harvest/service.js";
import { registerExternalHarvestRoutes } from "./routes/external-harvest.js";
import {
  InMemoryAgentCognitionStore,
  type AgentCognitionStore,
} from "./agent-cognition/store.js";
import { AgentCognitionService } from "./agent-cognition/service.js";
import { registerAgentCognitionRoutes } from "./routes/agent-cognition.js";
import {
  InMemoryAgentEvolutionStore,
  type AgentEvolutionStore,
} from "./agent-evolution/store.js";
import { AgentEvolutionService } from "./agent-evolution/service.js";
import { registerAgentEvolutionRoutes } from "./routes/agent-evolution.js";
import {
  InMemoryAgentSocietyStore,
  type AgentSocietyStore,
} from "./agent-society/store.js";
import { AgentSocietyService } from "./agent-society/service.js";
import { registerAgentSocietyRoutes } from "./routes/agent-society.js";
import {
  InMemoryAgentEconomyStore,
  type AgentEconomyStore,
} from "./agent-economy/store.js";
import { PostgresAgentEconomyStore } from "./agent-economy/postgres-store.js";
import { AgentEconomyService } from "./agent-economy/service.js";
import { registerAgentEconomyRoutes } from "./routes/agent-economy.js";
import { AgentWorkforceService } from "./agent-workforce/service.js";
import {
  InMemoryAgentWorkforceStore,
  type AgentWorkforceStore,
} from "./agent-workforce/store.js";
import { PostgresAgentWorkforceStore } from "./agent-workforce/postgres-store.js";
import { registerAgentWorkforceRoutes } from "./routes/agent-workforce.js";
import { WorkforceRuntimeService } from "./workforce-runtime/service.js";
import {
  InMemoryWorkforceRuntimeStore,
  type WorkforceRuntimeStore,
} from "./workforce-runtime/store.js";
import { PostgresWorkforceRuntimeStore } from "./workforce-runtime/postgres-store.js";
import { registerWorkforceRuntimeRoutes } from "./routes/workforce-runtime.js";
import { InMemoryMemoryStore, type MemoryStore } from "./memory/store.js";
import { MemoryIndexerService } from "./memory/service.js";
import { ExplicitMemoryTeachingService } from "./memory/explicit-teaching-service.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { RedisService } from "./intelligence/redis-service.js";
import { CacheService } from "./intelligence/cache-service.js";
import { EmbeddingService } from "./intelligence/embedding-service.js";
import {
  RetrievalService,
  type RetrievalServiceOptions,
} from "./intelligence/retrieval-service.js";
import { WorkerService } from "./intelligence/worker-service.js";
import {
  InfrastructureMetricsService,
  type InfrastructureServiceOptions,
} from "./intelligence/infrastructure-service.js";
import { registerInfrastructureRoutes } from "./routes/infrastructure.js";
import { EngineeringAdvisorService } from "./advisor/service.js";
import { InMemoryAdvisorStore, type AdvisorStore } from "./advisor/store.js";
import { registerAdvisorRoutes } from "./routes/advisor.js";
import { InMemoryIntentStore, type IntentStore } from "./intent/store.js";
import { IntentExecutionService } from "./intent/service.js";
import { registerIntentRoutes } from "./routes/intent.js";
import { InMemoryTaskStore, type TaskStore } from "./tasks/store.js";
import { TaskEngineService } from "./tasks/service.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { InMemoryDesktopStore, type DesktopStore } from "./desktop/store.js";
import { DesktopCapabilityService } from "./desktop/service.js";
import { registerDesktopRoutes } from "./routes/desktop.js";
import {
  InMemoryApplicationAdapterStore,
  type ApplicationAdapterStore,
} from "./application-adapters/store.js";
import { ApplicationRegistryService } from "./application-adapters/service.js";
import { registerApplicationAdapterRoutes } from "./routes/application-adapters.js";
import {
  InMemoryApplicationDiscoveryStore,
  type ApplicationDiscoveryStore,
} from "./application-discovery/store.js";
import { PostgresApplicationDiscoveryStore } from "./application-discovery/postgres-store.js";
import { ApplicationDiscoveryService } from "./application-discovery/service.js";
import { InMemoryAdapterSdkStore, type AdapterSdkStore } from "./adapter-sdk/store.js";
import { AdapterRegistryService } from "./adapter-sdk/service.js";
import { registerAdapterSdkRoutes } from "./routes/adapter-sdk.js";
import {
  InMemoryCoreAdapterStore,
  type CoreAdapterStore,
} from "./core-adapters/store.js";
import { CoreAdapterService } from "./core-adapters/service.js";
import { registerCoreAdapterRoutes } from "./routes/core-adapters.js";
import { ApplicationInteractionService } from "./application-interactions/service.js";
import { ConversationContinuityService } from "./conversation-continuity/service.js";
import { registerApplicationInteractionRoutes } from "./routes/application-interactions.js";
import {
  InMemoryCrossApplicationWorkflowStore,
  type CrossApplicationWorkflowStore,
} from "./cross-application-workflows/store.js";
import { CrossApplicationWorkflowService } from "./cross-application-workflows/service.js";
import { registerCrossApplicationWorkflowRoutes } from "./routes/cross-application-workflows.js";
import {
  InMemoryApplicationIntelligenceStore,
  type ApplicationIntelligenceStore,
} from "./application-intelligence/store.js";
import { ApplicationIntelligenceService } from "./application-intelligence/service.js";
import { registerApplicationIntelligenceRoutes } from "./routes/application-intelligence.js";
import {
  InMemoryWorkspaceIntelligenceStore,
  type WorkspaceIntelligenceStore,
} from "./workspace-intelligence/store.js";
import { WorkspaceIntelligenceService } from "./workspace-intelligence/service.js";
import { registerWorkspaceIntelligenceRoutes } from "./routes/workspace-intelligence.js";
import {
  InMemoryDeepIndexerStore,
  type DeepIndexerStore,
} from "./deep-indexers/store.js";
import { SemanticIndexerService } from "./deep-indexers/service.js";
import { registerDeepIndexerRoutes } from "./routes/deep-indexers.js";
import { DesktopSkillExecutionService } from "./desktop-skills/service.js";
import {
  InMemoryDesktopSkillStore,
  type DesktopSkillStore,
} from "./desktop-skills/store.js";
import { registerDesktopSkillRoutes } from "./routes/desktop-skills.js";
import { NativeProviderRuntime } from "./native-providers/service.js";
import {
  InMemoryNativeProviderStore,
  type NativeProviderStore,
} from "./native-providers/store.js";
import { registerNativeProviderRoutes } from "./routes/native-providers.js";
import { InMemorySpatialStore, type SpatialStore } from "./spatial/store.js";
import { SpatialInteractionService } from "./spatial/service.js";
import { registerSpatialRoutes } from "./routes/spatial.js";
import { InMemoryVoiceStore, type VoiceStore } from "./voice/store.js";
import { VoiceRuntimeService } from "./voice/service.js";
import { VoiceCaptureLeaseService } from "./voice/capture-lease.js";
import { registerVoiceRoutes } from "./routes/voice.js";
import { ActiveContextService } from "./active-context/service.js";
import { registerActiveContextRoutes } from "./routes/active-context.js";
import { registerExecutiveRoutes } from "./routes/executive.js";
import { registerObjectiveRoutes } from "./routes/objectives.js";
import { ExecutiveBrainService } from "./executive/service.js";
import { ObjectiveEngineService } from "./objectives/service.js";
import { ExperimentService } from "./experiments/service.js";
import { registerExperimentRoutes } from "./routes/experiments.js";
import { BusinessOSService } from "./business-os/service.js";
import { registerBusinessOSRoutes } from "./routes/business-os.js";
import { InMemoryExecutiveStore, type ExecutiveStore } from "./executive/store.js";
import { ReflectionEngineService } from "./reflection/service.js";
import { ReflectionAutomationCoordinator } from "./reflection/automation.js";
import { InMemoryReflectionStore, type ReflectionStore } from "./reflection/store.js";
import { registerReflectionRoutes } from "./routes/reflection.js";
import { SkillEvolutionService } from "./skill-evolution/service.js";
import {
  InMemorySkillEvolutionStore,
  type SkillEvolutionStore,
} from "./skill-evolution/store.js";
import { PostgresSkillEvolutionStore } from "./skill-evolution/postgres-store.js";
import { registerSkillEvolutionRoutes } from "./routes/skill-evolution.js";
import {
  InMemoryIntentRecordingStore,
  type IntentRecordingStore,
} from "./intent-recording/store.js";
import { IntentRecordingService } from "./intent-recording/service.js";
import { registerIntentRecordingRoutes } from "./routes/intent-recording.js";
import { registerCapabilityStudioRoutes } from "./routes/capability-studio.js";
import { CapabilityStudioService } from "./capability-studio/service.js";
import {
  InMemoryCapabilityStudioStore,
  type CapabilityStudioStore,
} from "./capability-studio/store.js";
import {
  InMemorySemanticRetrievalStore,
  type SemanticRetrievalStore,
} from "./semantic/store.js";
import { SemanticRetrievalService } from "./semantic/service.js";
import { registerSemanticRoutes } from "./routes/semantic.js";
import {
  InMemoryHumanUnderstandingStore,
  type HumanUnderstandingStore,
} from "./human-understanding/store.js";
import { HumanUnderstandingService } from "./human-understanding/service.js";
import { registerHumanUnderstandingRoutes } from "./routes/human-understanding.js";
import {
  InMemoryKnowledgeGraphStore,
  type KnowledgeGraphStore,
} from "./knowledge-graph/store.js";
import { PersonalKnowledgeGraphService } from "./knowledge-graph/service.js";
import { registerKnowledgeGraphRoutes } from "./routes/knowledge-graph.js";
import {
  InMemoryLearningEngineStore,
  type LearningEngineStore,
} from "./learning-engine/store.js";
import { LearningEngineService } from "./learning-engine/service.js";
import { registerLearningEngineRoutes } from "./routes/learning-engine.js";
import {
  InMemoryMemoryStudioStore,
  type MemoryStudioStore,
} from "./memory-studio/store.js";
import { CognitiveQueryService } from "./memory-studio/service.js";
import { registerMemoryStudioRoutes } from "./routes/memory-studio.js";
import type { PostgresDatabase } from "./persistence/database.js";
import { LocalAIService } from "./local-ai/service.js";
import { LocalModelRegistry } from "./local-ai/registry.js";
import { registerLocalAIRoutes } from "./routes/local-ai.js";
import { registerAIRoutes } from "./routes/ai.js";
import { registerAIEconomicsRoutes } from "./routes/ai-economics.js";
import { registerAIContextRoutes } from "./routes/ai-context.js";
import { registerAIBenchmarkRoutes } from "./routes/ai-benchmark.js";
import { AIBenchmarkRunner } from "./ai/benchmark/service.js";
import {
  InMemoryAIBenchmarkStore,
  UnavailableAIBenchmarkStore,
} from "./ai/benchmark/store.js";
import { PostgresAIBenchmarkStore } from "./ai/benchmark/postgres-store.js";
import { createProductionBenchmarkExecutor } from "./ai/benchmark/production-executor.js";
import { AIRuntimeHealthService } from "./ai/health.js";
import { OllamaLocalRuntime } from "./local-ai/runtime.js";
import { LocalAIError } from "./local-ai/errors.js";
import { createAIRuntime } from "./ai/bootstrap.js";
import type { AIRuntimeService } from "./ai/runtime-service.js";
import { AIProviderError } from "./ai/errors.js";
import { AIRouterService } from "./ai/router/service.js";
import { AIEconomicsService } from "./ai/economics/service.js";
import { PostgresAIEconomicsStore } from "./ai/economics/postgres-store.js";
import { AIEconomicError } from "./ai/economics/errors.js";
import { CognitiveContextService } from "./ai/context/service.js";
import { registerProductionContextSources } from "./ai/context/sources.js";

export const LOG_REDACTION_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-csrf-token",
  "res.headers.set-cookie",
  "password",
  "*.password",
  "*.sessionToken",
  "*.csrfToken",
  "*.pairingCode",
  "*.pairingRequestToken",
  "*.recoveryCodes",
  "*.privateKey",
  "*.DATABASE_URL",
  "*.REDIS_TOKEN",
  "*.REDIS_PASSWORD",
  "*.OPENAI_API_KEY",
  "*.GOOGLE_CLIENT_SECRET",
  "*.authorization",
] as const;

export interface BuildApiOptions {
  corsOrigin: string;
  privateNetworkRequired: boolean;
  logger?: FastifyServerOptions["logger"];
  nodeEnvironment?: "development" | "test" | "production";
  allowOwnerBootstrap?: boolean;
  sessionCookieName?: string;
  sessionTtlSeconds?: number;
  sessionIdleTtlSeconds?: number;
  sessionAbsoluteTtlSeconds?: number;
  pairingTtlSeconds?: number;
  signedRequestToleranceSeconds?: number;
  identityStore?: IdentityStore;
  networkVerifier?: NetworkVerifier;
  governanceStore?: GovernanceStore;
  approvalTtlSeconds?: number;
  securityStateStore?: SecurityStateStore;
  csrfTtlSeconds?: number;
  recentAuthTtlSeconds?: number;
  recoveryCodeCount?: number;
  allowedHosts?: string[];
  trustedProxyMode?: "none" | "loopback" | "one-hop";
  deploymentMode?: "private" | "cloud";
  persistenceMode?: "in_memory_development" | "postgresql";
  databaseReady?: () => Promise<boolean>;
  migrationState?: () => Promise<"current" | "outdated" | "unknown">;
  productionNetworkVerifierConfigured?: boolean;
  now?: () => Date;
  executionStore?: ExecutionStore;
  repositoryStore?: RepositoryStore;
  patchStore?: PatchStore;
  validationStore?: ValidationStore;
  workflowStore?: WorkflowStore;
  integrationStore?: IntegrationStore;
  agentStore?: AgentStore;
  agentOsStore?: AgentOsStore;
  agentCognitionStore?: AgentCognitionStore;
  agentEvolutionStore?: AgentEvolutionStore;
  agentSocietyStore?: AgentSocietyStore;
  agentEconomyStore?: AgentEconomyStore;
  agentWorkforceStore?: AgentWorkforceStore;
  workforceRuntimeStore?: WorkforceRuntimeStore;
  memoryStore?: MemoryStore;
  advisorStore?: AdvisorStore;
  intentStore?: IntentStore;
  taskStore?: TaskStore;
  desktopStore?: DesktopStore;
  applicationAdapterStore?: ApplicationAdapterStore;
  applicationDiscoveryStore?: ApplicationDiscoveryStore;
  adapterSdkStore?: AdapterSdkStore;
  coreAdapterStore?: CoreAdapterStore;
  crossApplicationWorkflowStore?: CrossApplicationWorkflowStore;
  applicationIntelligenceStore?: ApplicationIntelligenceStore;
  workspaceIntelligenceStore?: WorkspaceIntelligenceStore;
  deepIndexerStore?: DeepIndexerStore;
  desktopSkillStore?: DesktopSkillStore;
  nativeProviderStore?: NativeProviderStore;
  spatialStore?: SpatialStore;
  voiceStore?: VoiceStore;
  executiveStore?: ExecutiveStore;
  reflectionStore?: ReflectionStore;
  skillEvolutionStore?: SkillEvolutionStore;
  intentRecordingStore?: IntentRecordingStore;
  capabilityStudioStore?: CapabilityStudioStore;
  semanticStore?: SemanticRetrievalStore;
  humanUnderstandingStore?: HumanUnderstandingStore;
  knowledgeGraphStore?: KnowledgeGraphStore;
  learningEngineStore?: LearningEngineStore;
  memoryStudioStore?: MemoryStudioStore;
  redis?: RedisService;
  cache?: CacheService;
  embeddings?: EmbeddingService;
  retrievalOptions?: RetrievalServiceOptions;
  workers?: WorkerService;
  infrastructureOptions?: InfrastructureServiceOptions;
  database?: PostgresDatabase;
  serverExecutionSigner?: ServerExecutionSigner;
  readOnlyExecutionEnabled?: boolean;
  localAI?: LocalAIService;
  aiRuntime?: AIRuntimeService;
  aiRouter?: AIRouterService;
  aiEconomics?: AIEconomicsService;
  defaultPaidModelPricing?: {
    providerId: string;
    modelId: string;
    inputPerMillionTokens: string;
    outputPerMillionTokens: string;
  };
  cognitiveContext?: CognitiveContextService;
  benchmarkRunner?: AIBenchmarkRunner;
  executionLimits?: ExecutionLimits;
}

export const buildApi = async ({
  corsOrigin,
  privateNetworkRequired,
  logger = true,
  nodeEnvironment = "development",
  allowOwnerBootstrap = true,
  sessionCookieName = "alexa_session",
  sessionTtlSeconds = 28_800,
  sessionIdleTtlSeconds = 1_800,
  sessionAbsoluteTtlSeconds = sessionTtlSeconds,
  pairingTtlSeconds = 300,
  signedRequestToleranceSeconds = 120,
  identityStore = new InMemoryIdentityStore(),
  networkVerifier = new PlaceholderNetworkVerifier(),
  governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS),
  approvalTtlSeconds = 900,
  securityStateStore = new InMemorySecurityStateStore(),
  csrfTtlSeconds = 900,
  recentAuthTtlSeconds = 300,
  recoveryCodeCount = 10,
  allowedHosts = ["localhost", "127.0.0.1"],
  trustedProxyMode = "none",
  deploymentMode = "private",
  persistenceMode = "in_memory_development",
  databaseReady = () => Promise.resolve(true),
  migrationState = () => Promise.resolve("current"),
  productionNetworkVerifierConfigured = nodeEnvironment !== "production",
  now,
  executionStore = new InMemoryExecutionStore(),
  repositoryStore = new InMemoryRepositoryStore(),
  patchStore = new InMemoryPatchStore(),
  validationStore = new InMemoryValidationStore(),
  workflowStore = new InMemoryWorkflowStore(),
  integrationStore = new InMemoryIntegrationStore(),
  agentStore = new InMemoryAgentStore(),
  agentOsStore = new InMemoryAgentOsStore(),
  agentCognitionStore = new InMemoryAgentCognitionStore(),
  agentEvolutionStore = new InMemoryAgentEvolutionStore(),
  agentSocietyStore = new InMemoryAgentSocietyStore(),
  agentEconomyStore,
  agentWorkforceStore,
  workforceRuntimeStore,
  memoryStore = new InMemoryMemoryStore(),
  advisorStore = new InMemoryAdvisorStore(),
  intentStore = new InMemoryIntentStore(),
  taskStore = new InMemoryTaskStore(),
  desktopStore = new InMemoryDesktopStore(),
  applicationAdapterStore = new InMemoryApplicationAdapterStore(),
  applicationDiscoveryStore,
  adapterSdkStore = new InMemoryAdapterSdkStore(),
  coreAdapterStore = new InMemoryCoreAdapterStore(),
  crossApplicationWorkflowStore = new InMemoryCrossApplicationWorkflowStore(),
  applicationIntelligenceStore = new InMemoryApplicationIntelligenceStore(),
  workspaceIntelligenceStore = new InMemoryWorkspaceIntelligenceStore(),
  deepIndexerStore = new InMemoryDeepIndexerStore(),
  desktopSkillStore = new InMemoryDesktopSkillStore(),
  nativeProviderStore = new InMemoryNativeProviderStore(),
  spatialStore = new InMemorySpatialStore(),
  voiceStore = new InMemoryVoiceStore(),
  executiveStore = new InMemoryExecutiveStore(),
  reflectionStore = new InMemoryReflectionStore(),
  skillEvolutionStore,
  intentRecordingStore = new InMemoryIntentRecordingStore(),
  capabilityStudioStore = new InMemoryCapabilityStudioStore(),
  semanticStore = new InMemorySemanticRetrievalStore(),
  humanUnderstandingStore = new InMemoryHumanUnderstandingStore(),
  knowledgeGraphStore = new InMemoryKnowledgeGraphStore(),
  learningEngineStore = new InMemoryLearningEngineStore(),
  memoryStudioStore = new InMemoryMemoryStudioStore(),
  redis = new RedisService({ namespace: "personalassistant" }),
  cache = new CacheService(redis, {
    enabled: false,
    namespace: "personalassistant",
    defaultTtlSeconds: 900,
  }),
  embeddings = new EmbeddingService({
    provider: "disabled",
    model: "text-embedding-3-small",
    batchSize: 32,
    maxRetries: 3,
    dimensions: 1536,
  }),
  retrievalOptions = {
    semanticSearchEnabled: false,
    hybridSearchEnabled: true,
    keywordWeight: 0.35,
    vectorWeight: 0.65,
    similarityThreshold: 0.75,
    retrievalLimit: 12,
  },
  workers = new WorkerService({ enabled: false, workerCount: 0, concurrency: 1 }),
  infrastructureOptions = {
    memoryEnabled: true,
    retrievalLimit: 12,
    similarityThreshold: 0.75,
    maxContext: 40,
    vectorDimensions: 1536,
  },
  database,
  serverExecutionSigner,
  readOnlyExecutionEnabled = false,
  localAI = new LocalAIService(
    new OllamaLocalRuntime("http://127.0.0.1:11434"),
    new LocalModelRegistry(),
    {
      enabled: false,
      modelName: "gemma3:4b",
      maxConcurrentRequests: 1,
      interpretationTimeoutMs: 15_000,
      conversationTimeoutMs: 45_000,
      structuredRetries: 1,
      contextMaxCharacters: 16_000,
    },
  ),
  aiRuntime = createAIRuntime({
    ollamaRuntime: new OllamaLocalRuntime("http://127.0.0.1:11434"),
    ollamaEnabled: false,
    ollamaModel: "gemma3:4b",
    openAIEnabled: false,
    openAIModel: "gpt-5.6-luna",
    openAIBaseUrl: "https://api.openai.com/v1",
  }),
  aiEconomics,
  cognitiveContext = new CognitiveContextService(),
  aiRouter,
  benchmarkRunner,
  defaultPaidModelPricing,
  executionLimits = {
    requestTtlSeconds: 120,
    resultRetentionSeconds: 86_400,
    maxFileReadBytes: 131_072,
    maxExecutionResultBytes: 524_288,
    maxRepositoryScanResultBytes: 4_194_304,
  },
}: BuildApiOptions): Promise<FastifyInstance> => {
  const resolvedAgentEconomyStore =
    agentEconomyStore ??
    (database
      ? new PostgresAgentEconomyStore(database.pool)
      : new InMemoryAgentEconomyStore());
  const resolvedAgentWorkforceStore =
    agentWorkforceStore ??
    (database
      ? new PostgresAgentWorkforceStore(database.pool)
      : new InMemoryAgentWorkforceStore());
  const resolvedWorkforceRuntimeStore =
    workforceRuntimeStore ??
    (database
      ? new PostgresWorkforceRuntimeStore(database.pool)
      : new InMemoryWorkforceRuntimeStore());
  const economicAuthority =
    aiEconomics ??
    (database
      ? new AIEconomicsService(new PostgresAIEconomicsStore(database.pool))
      : new AIEconomicsService());
  await economicAuthority.initialise();
  if (
    defaultPaidModelPricing &&
    !(await economicAuthority.pricingFor(
      defaultPaidModelPricing.providerId,
      defaultPaidModelPricing.modelId,
    ))
  ) {
    await economicAuthority.upsertPricing({
      id: crypto.randomUUID(),
      providerId: defaultPaidModelPricing.providerId,
      modelId: defaultPaidModelPricing.modelId,
      currency: "USD",
      inputPerMillionTokens: defaultPaidModelPricing.inputPerMillionTokens,
      outputPerMillionTokens: defaultPaidModelPricing.outputPerMillionTokens,
      effectiveFrom: new Date(Date.now() - 1_000).toISOString(),
      version: "env-bootstrap-v1",
      source: "api_environment",
      status: "ACTIVE",
    });
  }
  aiRuntime.requirePaidInferenceAuthorization(async ({ ownerId, reservationId }) =>
    Boolean(await economicAuthority.verifyActiveReservation(ownerId, reservationId)),
  );
  const canonicalRouter =
    aiRouter ?? new AIRouterService(aiRuntime, economicAuthority, cognitiveContext);
  const benchmarkAuthority =
    benchmarkRunner ??
    new AIBenchmarkRunner(
      () => ({ errorCode: "BENCHMARK_EXECUTOR_NOT_INITIALISED" }),
      database
        ? new PostgresAIBenchmarkStore(database.pool)
        : nodeEnvironment === "production"
          ? new UnavailableAIBenchmarkStore()
          : new InMemoryAIBenchmarkStore(),
    );
  canonicalRouter.setEmergencyStopCheck(
    async () => (await governanceStore.getSecurityState()).emergencyStopActive,
  );
  localAI.useCanonicalRouter(canonicalRouter);
  const app = Fastify({
    logger,
    trustProxy:
      trustedProxyMode === "loopback"
        ? (address, hop) => hop === 0 && isLoopbackAddress(address)
        : trustedProxyMode === "one-hop"
          ? 1
          : false,
    genReqId: () => crypto.randomUUID(),
    logController: new LogController({
      disableRequestLogging: false,
    }),
  });
  app.addHook("onClose", () => {
    canonicalRouter.shutdown();
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    hsts:
      nodeEnvironment === "production"
        ? { maxAge: 31_536_000, includeSubDomains: false, preload: false }
        : false,
    referrerPolicy: { policy: "no-referrer" },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (request) => ({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
      requestId: request.id,
    }),
  });

  app.addHook("onRequest", (request, _reply, done) => {
    const rawHost = request.headers.host;
    const host = rawHost?.startsWith("[")
      ? rawHost.slice(1, rawHost.indexOf("]"))
      : rawHost?.split(":")[0];
    if (!host || !allowedHosts.includes(host)) {
      throw new ApiSecurityError(
        400,
        "HOST_NOT_ALLOWED",
        "The request host is not allowed.",
      );
    }
    done();
  });

  const identity = await IdentityService.create(identityStore, {
    allowOwnerBootstrap,
    sessionIdleTtlSeconds,
    sessionAbsoluteTtlSeconds,
    pairingTtlSeconds,
    ...(now ? { now } : {}),
  });
  const securityState = new SecurityStateService(securityStateStore, identity, {
    csrfTtlSeconds,
    recentAuthTtlSeconds,
    recoveryCodeCount,
    ...(now ? { now } : {}),
  });
  const security = new SecurityMiddleware(identity, {
    cookieName: sessionCookieName,
    webOrigin: corsOrigin,
    signedRequestToleranceSeconds,
    networkVerifier,
    executionEnabled: () => false,
    privateNetworkRequired,
    securityState,
  });
  const governanceAudit = async (
    input: Parameters<ApiRouteContext["governanceAudit"]>[0],
  ) => {
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
  };
  const registry = new RegistryService(governanceStore);
  const approvals = new ApprovalService(
    governanceStore,
    governanceAudit,
    approvalTtlSeconds,
  );
  economicAuthority.setApprovalRuntime(approvals, governanceAudit);
  const policyEngine = new PolicyEngine(
    governanceStore,
    new RiskEngine(),
    approvals,
    governanceAudit,
  );
  const governance = new GovernanceService(
    governanceStore,
    registry,
    approvals,
    policyEngine,
  );
  const conversationContinuity = new ConversationContinuityService(voiceStore, now);
  const executions = new ExecutionService(
    executionStore,
    identityStore,
    governance,
    governanceAudit,
    serverExecutionSigner,
    readOnlyExecutionEnabled,
    executionLimits,
    now,
    async (input) => {
      await conversationContinuity.recordGovernedInteractionSettlement(input);
    },
    privateNetworkRequired,
  );
  const repositories = new RepositoryService(
    repositoryStore,
    registry,
    executions,
    governanceAudit,
    now,
  );
  const patches = new PatchService(
    patchStore,
    repositoryStore,
    executions,
    approvals,
    governanceAudit,
    now,
  );
  const validations = new ValidationService(
    validationStore,
    repositoryStore,
    patchStore,
    executions,
    approvals,
    governanceAudit,
    now,
  );
  const workflows = new WorkflowEngineService(
    workflowStore,
    repositoryStore,
    patchStore,
    validationStore,
    governanceAudit,
    now,
  );
  const integrations = new IntegrationRegistryService(
    integrationStore,
    governanceAudit,
    now,
  );
  integrations.enableBusinessOperations(approvals);
  integrations.setAgentBusinessAuthorityVerifier(
    async ({ ownerId, agentId, organizationId, capability }) => {
      const agent = await agentStore.findAgent(ownerId, agentId);
      return Boolean(
        agent &&
        agent.status !== "disabled" &&
        agent.status !== "paused" &&
        agent.capabilities.includes(capability) &&
        (!organizationId || agent.workforce?.organizationId === organizationId),
      );
    },
  );
  const agentFactory = new AgentFactoryService(
    agentStore,
    repositoryStore,
    governanceAudit,
    now,
  );
  const agents = new AgentRegistryService(
    agentStore,
    governanceAudit,
    now,
    agentFactory,
  );
  const agentOs = new AgentOsService(
    agentOsStore,
    agentStore,
    repositoryStore,
    memoryStore,
    governanceAudit,
    now,
    (ownerId, requestId) => agents.ensureBuiltIns(ownerId, requestId),
  );
  const externalHarvest = new ExternalHarvestService(
    agentOs,
    memoryStore,
    governanceAudit,
    now,
    canonicalRouter,
    workflowStore,
    desktopSkillStore,
  );
  const memory = new MemoryIndexerService(
    memoryStore,
    repositoryStore,
    agentStore,
    workflowStore,
    governanceAudit,
    now,
  );
  const agentCognition = new AgentCognitionService(
    agentCognitionStore,
    agentStore,
    agentOs,
    memoryStore,
    governanceAudit,
    now,
  );
  const agentEvolution = new AgentEvolutionService(
    agentEvolutionStore,
    agentStore,
    agentCognition,
    governanceAudit,
    now,
  );
  const agentSociety = new AgentSocietyService(
    agentSocietyStore,
    agentStore,
    agentEvolution,
    governanceAudit,
    now,
  );
  const agentEconomy = new AgentEconomyService(
    resolvedAgentEconomyStore,
    agentStore,
    governanceAudit,
    now,
  );
  const agentWorkforce = new AgentWorkforceService(
    resolvedAgentWorkforceStore,
    agents,
    agentStore,
    agentSociety,
    agentEconomy,
    governanceAudit,
    now,
  );
  canonicalRouter.setAgentEconomyAccounting(agentEconomy);
  const retrieval = new RetrievalService(
    memoryStore,
    embeddings,
    retrievalOptions,
    now,
  );
  const infrastructure = new InfrastructureMetricsService(
    redis,
    cache,
    embeddings,
    workers,
    retrievalOptions,
    infrastructureOptions,
    database,
  );
  const advisor = new EngineeringAdvisorService(
    advisorStore,
    repositoryStore,
    workflowStore,
    memoryStore,
    agentStore,
    governanceAudit,
    now,
  );
  const intentExecution = new IntentExecutionService(
    intentStore,
    agentSociety,
    governanceAudit,
    now,
  );
  const tasks = new TaskEngineService(
    taskStore,
    intentExecution,
    agentSociety,
    governanceAudit,
    now,
  );
  const executive = new ExecutiveBrainService(
    executiveStore,
    taskStore,
    now,
    canonicalRouter,
  );
  const reflection = new ReflectionEngineService(
    reflectionStore,
    executiveStore,
    taskStore,
    now,
    canonicalRouter,
  );
  const reflectionAutomation = new ReflectionAutomationCoordinator(
    taskStore,
    reflection,
    now,
  );
  tasks.setLifecycleSink(reflectionAutomation);
  executive.setReflectionEvidenceProvider(reflection);
  const desktop = new DesktopCapabilityService(desktopStore, governanceAudit, now);
  const applicationAdapters = new ApplicationRegistryService(
    applicationAdapterStore,
    governanceAudit,
    now,
  );
  const resolvedApplicationDiscoveryStore =
    applicationDiscoveryStore ??
    (database
      ? new PostgresApplicationDiscoveryStore(database.pool)
      : new InMemoryApplicationDiscoveryStore());
  const applicationDiscovery = new ApplicationDiscoveryService(
    resolvedApplicationDiscoveryStore,
    governanceStore,
    applicationAdapterStore,
    nativeProviderStore,
    governanceAudit,
    now,
  );
  const applicationIntelligence = new ApplicationIntelligenceService(
    applicationIntelligenceStore,
    applicationAdapterStore,
    nativeProviderStore,
    governanceAudit,
    now,
  );
  const workspaceIntelligence = new WorkspaceIntelligenceService(
    workspaceIntelligenceStore,
    applicationAdapterStore,
    nativeProviderStore,
    governanceAudit,
    now,
  );
  const semanticIndexers = new SemanticIndexerService(
    deepIndexerStore,
    workspaceIntelligenceStore,
    applicationAdapterStore,
    nativeProviderStore,
    governanceAudit,
    now,
  );
  const adapterSdk = new AdapterRegistryService(
    adapterSdkStore,
    applicationAdapterStore,
    nativeProviderStore,
    deepIndexerStore,
    governanceAudit,
    now,
  );
  const desktopSkills = new DesktopSkillExecutionService(
    desktopSkillStore,
    intentRecordingStore,
    applicationAdapterStore,
    governanceAudit,
    now,
  );
  const intentRecording = new IntentRecordingService(
    intentRecordingStore,
    intentStore,
    governanceAudit,
    now,
  );
  const nativeProviders = new NativeProviderRuntime(
    nativeProviderStore,
    applicationAdapterStore,
    governanceAudit,
    now,
    async (input) => {
      const execution = await executions.createNativeProviderExecution({
        ownerId: input.ownerId,
        sessionId: input.sessionId,
        request: input.request,
        networkState: input.networkState,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
        policyApplication: input.policyApplication,
      });
      return { executionRequestId: execution.id };
    },
    async (input) => {
      await intentRecording.recordReviewedCapability(input);
    },
  );
  const applicationInteractions = new ApplicationInteractionService(
    applicationAdapterStore,
    nativeProviderStore,
    nativeProviders,
    governanceAudit,
    now,
    async (ownerId, request) => {
      if (!request.conversationId || !request.proposalId) return false;
      const matchesFrozenRequest = (proposal: {
        id: string;
        canonicalIntent: string;
        parameters: Record<string, unknown>;
      }) => {
        const targetFingerprint = (target: unknown) => {
          if (!target || typeof target !== "object") return null;
          const record = target as Record<string, unknown>;
          return {
            type: typeof record.type === "string" ? record.type : null,
            role: typeof record.role === "string" ? record.role : null,
            label: typeof record.label === "string" ? record.label : null,
            identifier:
              typeof record.identifier === "string" ? record.identifier : null,
            semanticId:
              typeof record.semanticId === "string" ? record.semanticId : null,
            registryObjectId:
              typeof record.registryObjectId === "string"
                ? record.registryObjectId
                : null,
            registryVersion:
              typeof record.registryVersion === "number"
                ? record.registryVersion
                : null,
            secure: record.secure === true,
          };
        };
        if (
          proposal.id !== request.proposalId ||
          proposal.canonicalIntent !== `application_interaction.${request.capability}`
        )
          return false;
        const frozen = proposal.parameters.request as
          Record<string, unknown> | undefined;
        if (!frozen) return false;
        return (
          frozen.applicationId === request.applicationId &&
          frozen.capability === request.capability &&
          (frozen.capabilityCandidateId ?? null) === request.capabilityCandidateId &&
          frozen.text === request.text &&
          JSON.stringify(targetFingerprint(frozen.target ?? null)) ===
            JSON.stringify(targetFingerprint(request.target ?? null))
        );
      };
      return conversationContinuity
        .claimConfirmedProposal({
          ownerId,
          conversationId: request.conversationId,
          matches: matchesFrozenRequest,
        })
        .then(async (claimed) => {
          if (claimed) return true;
          const state = await voiceStore.getConversationContinuity(
            ownerId,
            request.conversationId!,
          );
          const proposal = state?.actionProposal;
          if (
            proposal &&
            ["PLANNED", "EXECUTED"].includes(proposal.status) &&
            matchesFrozenRequest(proposal)
          )
            return "ALREADY_CLAIMED" as const;
          return false;
        });
    },
    async (ownerId, request) => {
      if (!request.conversationId || !request.proposalId) return;
      await conversationContinuity.releaseProposalClaimForApproval({
        ownerId,
        conversationId: request.conversationId,
        proposalId: request.proposalId,
      });
    },
    desktop.interactions.targetResolution,
    (ownerId, objectId) => desktopStore.getSemanticObject(ownerId, objectId),
    capabilityStudioStore,
  );
  const coreAdapters = new CoreAdapterService(
    coreAdapterStore,
    applicationAdapterStore,
    nativeProviderStore,
    adapterSdk,
    nativeProviders,
    governanceAudit,
    now,
  );
  const activeContext = new ActiveContextService(
    applicationAdapterStore,
    coreAdapterStore,
    applicationIntelligenceStore,
    governanceAudit,
    now,
  );
  const crossApplicationWorkflows = new CrossApplicationWorkflowService(
    crossApplicationWorkflowStore,
    coreAdapters,
    governanceAudit,
    now,
  );
  const spatial = new SpatialInteractionService(
    spatialStore,
    intentExecution,
    governanceAudit,
    now,
  );
  const semantic = new SemanticRetrievalService(
    semanticStore,
    cache,
    embeddings,
    governanceAudit,
    now,
  );
  const knowledgeGraph = new PersonalKnowledgeGraphService(
    knowledgeGraphStore,
    memoryStore,
    repositoryStore,
    agentStore,
    workflowStore,
    applicationAdapterStore,
    governanceAudit,
    now,
  );
  const explicitMemoryTeaching = new ExplicitMemoryTeachingService(
    memory,
    memoryStore,
    knowledgeGraph,
    now,
  );
  const learningEngine = new LearningEngineService(
    learningEngineStore,
    governanceAudit,
    now,
  );
  const resolvedSkillEvolutionStore =
    skillEvolutionStore ??
    (database
      ? new PostgresSkillEvolutionStore(database.pool)
      : new InMemorySkillEvolutionStore());
  const skillEvolution = new SkillEvolutionService(
    resolvedSkillEvolutionStore,
    desktopSkillStore,
    intentRecordingStore,
    learningEngineStore,
    reflectionStore,
    governanceAudit,
    now,
    canonicalRouter,
  );
  reflection.setLearningSink(learningEngine);
  reflection.setRoutingEvidenceSource({
    listConversation: (ownerId, limit) => voiceStore.listConversation(ownerId, limit),
    listTurnFeedback: (ownerId, limit) => voiceStore.listTurnFeedback(ownerId, limit),
    listLedger: (ownerId, limit) => economicAuthority.listLedger(ownerId, limit),
  });
  const memoryStudio = new CognitiveQueryService(
    memoryStudioStore,
    memoryStore,
    knowledgeGraphStore,
    learningEngineStore,
    humanUnderstandingStore,
    governanceAudit,
    now,
  );
  const humanUnderstanding = new HumanUnderstandingService(
    humanUnderstandingStore,
    memoryStore,
    retrieval,
    applicationAdapterStore,
    applicationIntelligenceStore,
    workspaceIntelligenceStore,
    governanceAudit,
    now,
    knowledgeGraph,
    canonicalRouter,
  );
  if (!benchmarkRunner)
    benchmarkAuthority.setExecutor(
      createProductionBenchmarkExecutor({
        humanUnderstanding,
        router: canonicalRouter,
        context: cognitiveContext,
      }),
    );
  if (cognitiveContext.sourceCount() === 0) {
    registerProductionContextSources(cognitiveContext, {
      memoryStore,
      knowledgeGraphStore,
      learningEngineStore,
      humanUnderstandingStore,
      repositoryStore,
      workflowStore,
      agentStore,
      workspaceIntelligenceStore,
      applicationIntelligenceStore,
    });
  }
  const voice = new VoiceRuntimeService(
    voiceStore,
    intentExecution,
    governanceAudit,
    now,
    humanUnderstanding,
    canonicalRouter,
    nodeEnvironment !== "production",
    learningEngine,
    executive,
    reflection,
    skillEvolution,
    activeContext,
    applicationInteractions,
    conversationContinuity,
    explicitMemoryTeaching,
  );
  const voiceCaptureLease = new VoiceCaptureLeaseService(redis, now);
  const capabilityStudio = new CapabilityStudioService(
    capabilityStudioStore,
    nativeProviders,
    nativeProviderStore,
    applicationAdapterStore,
    intentRecordingStore,
    approvals,
    governanceAudit,
    now,
  );
  const workforceRuntime = new WorkforceRuntimeService(
    resolvedWorkforceRuntimeStore,
    agentStore,
    agentWorkforce,
    agentEconomy,
    agentOs,
    externalHarvest,
    canonicalRouter,
    capabilityStudio,
    governanceAudit,
    now,
  );
  const objectives = new ObjectiveEngineService(
    executiveStore,
    workforceRuntime,
    governanceAudit,
    now,
    crossApplicationWorkflows,
    capabilityStudio,
  );
  const experiments = new ExperimentService(
    executiveStore,
    governanceAudit,
    learningEngine,
    now,
  );
  const businessOS = new BusinessOSService(
    objectives,
    workforceRuntime,
    agentEconomy,
    experiments,
    integrations,
    approvals,
    crossApplicationWorkflows,
    now,
  );
  experiments.setReplanSink(objectives);
  integrations.setBusinessOutcomeSinks({
    objectiveMetric: async ({ ownerId, objectiveId, kpiId, value }) => {
      await objectives.observeMetric({
        ownerId,
        objectiveId,
        body: { kpiId, value, source: "CALCULATED" },
        requestId: `external-metric:${kpiId}`,
        ipAddress: "system",
      });
    },
    experimentMetric: async ({
      ownerId,
      experimentId,
      variantId,
      subjectId,
      metricId,
      value,
      evidenceRef,
    }) => {
      await experiments.observe({
        ownerId,
        experimentId,
        body: {
          variantId,
          subjectId,
          metricId,
          value,
          costCredits: 0,
          durationMs: 0,
          success: true,
          source: "EXTERNAL_VERIFIED",
          evidenceRefs: [evidenceRef],
          idempotencyKey: `external:${evidenceRef}`,
        },
        requestId: `external-experiment:${evidenceRef}`,
        ipAddress: "system",
      });
    },
    verifiedReward: async ({ ownerId, agentId, taskId, evidenceRef }) => {
      try {
        await agentEconomy.rewardVerified({
          ownerId,
          agentId,
          amount: 1,
          authority: "WORKFLOW_EVALUATOR",
          idempotencyKey: `external:${evidenceRef}`,
          reasonCode: "VERIFIED_EXTERNAL_OUTCOME",
          outcome: {
            taskId,
            predictedSuccessProbability: 0.5,
            estimatedCost: 0,
            estimatedDurationMs: 0,
            actualSuccess: true,
            actualCost: 0,
            actualDurationMs: 0,
            qualityScore: 1,
            verificationResult: "VERIFIED",
            evidenceRefs: [evidenceRef],
          },
        });
      } catch {
        /* Optional economy enrollment must not block external outcome processing. */
      }
    },
  });
  workforceRuntime.setLifecycleSink(objectives);
  crossApplicationWorkflows.setLifecycleSink(objectives);
  const context: ApiRouteContext = {
    deploymentMode,
    identity,
    security,
    securityState,
    networkVerifier,
    cookieName: sessionCookieName,
    secureCookies: nodeEnvironment === "production",
    sessionTtlSeconds,
    signedRequestToleranceSeconds,
    privateNetworkRequired,
    governance,
    governanceStore,
    registry,
    approvals,
    governanceAudit,
    executionEnabled: () => false,
    emergencyStopActive: async () =>
      (await governanceStore.getSecurityState()).emergencyStopActive,
    activateEmergencyStop: async () => {
      await governanceStore.activateEmergencyStop(new Date().toISOString());
    },
    releaseEmergencyStop: async () => {
      await governanceStore.releaseEmergencyStop(new Date().toISOString());
    },
    persistenceMode,
    databaseReady,
    migrationState,
    productionNetworkVerifierConfigured,
    trustedProxyConfigured: trustedProxyMode !== "none",
    csrfProtection: true,
    executions,
    executionStore,
    repositories,
    repositoryStore,
    patches,
    patchStore,
    validations,
    validationStore,
    workflows,
    workflowStore,
    integrations,
    integrationStore,
    agents,
    agentFactory,
    agentStore,
    agentOs,
    agentOsStore,
    externalHarvest,
    agentCognition,
    agentCognitionStore,
    agentEvolution,
    agentEvolutionStore,
    agentSociety,
    agentSocietyStore,
    agentEconomy,
    agentEconomyStore: resolvedAgentEconomyStore,
    agentWorkforce,
    agentWorkforceStore: resolvedAgentWorkforceStore,
    workforceRuntime,
    workforceRuntimeStore: resolvedWorkforceRuntimeStore,
    memory,
    explicitMemoryTeaching,
    memoryStore,
    redis,
    cache,
    embeddings,
    retrieval,
    workers,
    infrastructure,
    advisor,
    advisorStore,
    intentExecution,
    intentStore,
    tasks,
    taskStore,
    desktop,
    desktopStore,
    applicationAdapters,
    applicationAdapterStore,
    applicationDiscovery,
    applicationDiscoveryStore: resolvedApplicationDiscoveryStore,
    adapterSdk,
    adapterSdkStore,
    coreAdapters,
    coreAdapterStore,
    crossApplicationWorkflows,
    crossApplicationWorkflowStore,
    applicationIntelligence,
    applicationIntelligenceStore,
    workspaceIntelligence,
    workspaceIntelligenceStore,
    semanticIndexers,
    deepIndexerStore,
    desktopSkills,
    desktopSkillStore,
    nativeProviders,
    nativeProviderStore,
    applicationInteractions,
    spatial,
    spatialStore,
    voice,
    voiceStore,
    voiceCaptureLease,
    activeContext,
    executive,
    executiveStore,
    objectives,
    experiments,
    businessOS,
    reflection,
    reflectionStore,
    skillEvolution,
    skillEvolutionStore: resolvedSkillEvolutionStore,
    intentRecording,
    intentRecordingStore,
    capabilityStudio,
    capabilityStudioStore,
    semantic,
    semanticStore,
    humanUnderstanding,
    humanUnderstandingStore,
    knowledgeGraph,
    knowledgeGraphStore,
    learningEngine,
    learningEngineStore,
    memoryStudio,
    memoryStudioStore,
    localAI,
    aiRuntime,
    aiRouter: canonicalRouter,
    aiEconomics: economicAuthority,
    cognitiveContext,
    benchmarkRunner: benchmarkAuthority,
    ...(serverExecutionSigner ? { serverExecutionSigner } : {}),
    readOnlyExecutionEnabled,
  };

  app.setErrorHandler(async (error, request, reply) => {
    const rawError = error as {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
      validation?: unknown;
    };
    const requestError =
      error instanceof Error
        ? error
        : Object.assign(
            new Error(
              typeof rawError?.message === "string"
                ? rawError.message
                : "Unknown request error",
            ),
            {
              code:
                typeof rawError?.code === "string" ? rawError.code : "REQUEST_ERROR",
              statusCode:
                typeof rawError?.statusCode === "number" ? rawError.statusCode : 500,
              validation: rawError?.validation,
            },
          );
    const structuredError = requestError as Error & {
      code?: string;
      statusCode?: number;
      validation?: unknown;
    };
    const isValidationError = requestError instanceof ZodError;
    const isSecurityError = requestError instanceof ApiSecurityError;
    const isGovernanceError = requestError instanceof GovernanceError;
    const isExecutionError = requestError instanceof ExecutionError;
    const isLocalAIError = requestError instanceof LocalAIError;
    const isAIProviderError = requestError instanceof AIProviderError;
    const isEconomicError = requestError instanceof AIEconomicError;
    const statusCode = isValidationError
      ? 400
      : isEconomicError
        ? 409
        : isLocalAIError || isAIProviderError
          ? 503
          : isSecurityError || isGovernanceError || isExecutionError
            ? requestError.statusCode
            : typeof structuredError.statusCode === "number"
              ? structuredError.statusCode
              : 500;
    const code = isValidationError
      ? "INVALID_REQUEST"
      : isEconomicError
        ? requestError.code
        : isLocalAIError || isAIProviderError
          ? requestError.code
          : isSecurityError || isGovernanceError || isExecutionError
            ? requestError.code
            : typeof structuredError.code === "string"
              ? structuredError.code
              : "INTERNAL_ERROR";
    const message =
      statusCode === 500 ? "The request could not be completed." : requestError.message;

    const logPayload = {
      err: requestError,
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode,
    };
    if (statusCode >= 500) {
      request.log.error(logPayload, "request failed");
    } else {
      request.log.warn(logPayload, "request denied");
    }

    if (isExecutionError && request.url.startsWith("/api/agent/execution")) {
      const envelope = SignedCommandEnvelopeSchema.safeParse(request.body);
      const device = envelope.success
        ? await identityStore.findDeviceById(envelope.data.deviceId)
        : undefined;
      if (device) {
        await identityStore.appendAudit({
          eventType: requestError.code.includes("RESULT")
            ? "EXECUTION_RESULT_REJECTED"
            : "AGENT_EXECUTION_POLL_FAILED",
          userId: device.ownerId,
          deviceId: device.id,
          ipAddress: request.ip,
          outcome: "DENIED",
          reason: requestError.code,
          requestId: request.id,
        });
      }
    }

    return reply.status(statusCode).send({
      success: false,
      error: { code, message },
      requestId: request.id,
    });
  });

  registerAuthRoutes(app, context);
  registerDeviceRoutes(app, context);
  registerAuditRoutes(app, context);
  registerSystemRoutes(app, context);
  registerApplicationRoutes(app, context);
  registerApplicationDiscoveryRoutes(app, context);
  registerWorkspaceRoutes(app, context);
  registerToolRoutes(app, context);
  registerPolicyRoutes(app, context);
  registerApprovalRoutes(app, context);
  registerSecurityRoutes(app, context);
  registerExecutionRoutes(app, context);
  registerRepositoryRoutes(app, context);
  registerPatchRoutes(app, context);
  registerValidationRoutes(app, context);
  registerWorkflowRoutes(app, context);
  registerIntegrationRoutes(app, context);
  registerAgentRoutes(app, context);
  registerAgentOsRoutes(app, context);
  registerExternalHarvestRoutes(app, context);
  registerAgentCognitionRoutes(app, context);
  registerAgentEvolutionRoutes(app, context);
  registerAgentSocietyRoutes(app, context);
  registerAgentEconomyRoutes(app, context);
  registerAgentWorkforceRoutes(app, context);
  registerWorkforceRuntimeRoutes(app, context);
  registerMemoryRoutes(app, context);
  registerInfrastructureRoutes(app, context);
  registerAdvisorRoutes(app, context);
  registerIntentRoutes(app, context);
  registerTaskRoutes(app, context);
  registerDesktopRoutes(app, context);
  registerApplicationAdapterRoutes(app, context);
  registerAdapterSdkRoutes(app, context);
  registerCoreAdapterRoutes(app, context);
  registerApplicationInteractionRoutes(app, context);
  registerCrossApplicationWorkflowRoutes(app, context);
  registerApplicationIntelligenceRoutes(app, context);
  registerWorkspaceIntelligenceRoutes(app, context);
  registerDeepIndexerRoutes(app, context);
  registerDesktopSkillRoutes(app, context);
  registerNativeProviderRoutes(app, context);
  registerSpatialRoutes(app, context);
  registerVoiceRoutes(app, context);
  registerActiveContextRoutes(app, context);
  registerExecutiveRoutes(app, context);
  registerObjectiveRoutes(app, context);
  registerExperimentRoutes(app, context);
  registerBusinessOSRoutes(app, context);
  registerReflectionRoutes(app, context);
  registerSkillEvolutionRoutes(app, context);
  registerIntentRecordingRoutes(app, context);
  registerCapabilityStudioRoutes(app, context);
  registerSemanticRoutes(app, context);
  registerHumanUnderstandingRoutes(app, context);
  registerKnowledgeGraphRoutes(app, context);
  registerLearningEngineRoutes(app, context);
  registerMemoryStudioRoutes(app, context);
  registerLocalAIRoutes(app, context);
  registerAIRoutes(app, context);
  registerAIEconomicsRoutes(app, context);
  registerAIContextRoutes(app, context);
  registerAIBenchmarkRoutes(app, context);
  app.get(
    "/api/ai/runtime-health",
    { preHandler: [context.security.requireAuthentication] },
    async () =>
      new AIRuntimeHealthService(aiRuntime, cognitiveContext, economicAuthority).get(),
  );

  return app;
};
