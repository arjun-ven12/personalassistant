import {
  AuditListResponseSchema,
  ApplicationListResponseSchema,
  ApplicationAdapterDashboardResponseSchema,
  AdapterSdkDashboardResponseSchema,
  AdapterLifecycleTransitionRequestSchema,
  CoreAdapterDashboardResponseSchema,
  CoreAdapterSemanticActionRequestSchema,
  CoreAdapterSemanticActionResponseSchema,
  ComposeCrossApplicationWorkflowRequestSchema,
  CrossApplicationWorkflowDashboardResponseSchema,
  ApplicationIntelligenceDashboardResponseSchema,
  CapabilityStudioResponseSchema,
  CapabilityCandidateIdRequestSchema,
  ChangeCapabilityStateRequestSchema,
  CreateCapabilityFromDescriptionRequestSchema,
  CreateCapabilityFromRecordingRequestSchema,
  CreateCapabilityRequestSchema,
  ApplicationResponseSchema,
  ApprovalListResponseSchema,
  ApprovalResponseSchema,
  AuthStateResponseSchema,
  AuthSuccessResponseSchema,
  CreatePairingIntentResponseSchema,
  CsrfTokenResponseSchema,
  DeviceListResponseSchema,
  DeviceMutationResponseSchema,
  EmergencyStopResponseSchema,
  HealthResponseSchema,
  LogoutResponseSchema,
  PolicyEvaluationListResponseSchema,
  PolicyEvaluationResponseSchema,
  SecurityStatusResponseSchema,
  SecurityReadinessResponseSchema,
  SessionListResponseSchema,
  SessionRevocationResponseSchema,
  SystemStatusResponseSchema,
  ToolListResponseSchema,
  ToolResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  NetworkStatusResponseSchema,
  RecentAuthChallengeResponseSchema,
  RecentAuthStatusSchema,
  RecoveryCodeGenerationResponseSchema,
  RecoveryCodeStatusSchema,
  type AllowedApplication,
  type AllowedWorkspace,
  type ApprovalRequest,
  type ApprovalStatus,
  type AuthStateResponse,
  type AuthSession,
  type AuditRecord,
  type DeviceView,
  type EmergencyStopResponse,
  type HealthResponse,
  type PolicyEvaluation,
  type PolicyEvaluationRequest,
  type SecurityStatusResponse,
  type SystemStatusResponse,
  type ToolDefinition,
  type CreateApplicationRequest,
  type TrustApplicationRequest,
  type UpdateApplicationRequest,
  type UpdateApplicationPermissionsRequest,
  type AdapterLifecycleTransitionRequest,
  type CoreAdapterSemanticActionRequest,
  type ComposeCrossApplicationWorkflowRequest,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type RecentAuthPurpose,
  type SecurityReadinessResponse,
  type NetworkVerificationResult,
  ExecutionListResponseSchema,
  ExecutionDetailResponseSchema,
  ExecutionCancelResponseSchema,
  ExecutionExportResponseSchema,
  ExecutionCleanupResponseSchema,
  ExecutionRequestViewSchema,
  ApiDiscoveryResponseSchema,
  ArchitectureGraphResponseSchema,
  DatabaseDiscoveryResponseSchema,
  DependencyGraphResponseSchema,
  type CreateExecutionRequest,
  type ExecutionRequestView,
  RepositoryDetailResponseSchema,
  RepositoryFilesResponseSchema,
  RepositoryInsightsResponseSchema,
  RepositoryCodeReviewResponseSchema,
  RepositoryDocumentationResponseSchema,
  RepositoryImpactAnalysisResponseSchema,
  RepositoryImplementationPlanResponseSchema,
  RepositoryListResponseSchema,
  RepositoryReindexResponseSchema,
  RepositoryReasoningMemorySchema,
  RepositoryReasoningResponseSchema,
  RepositorySearchResponseSchema,
  RepositoryTreeResponseSchema,
  RepositoryStatisticsSchema,
  SemanticDefinitionResponseSchema,
  SemanticReferencesResponseSchema,
  SemanticSearchResponseSchema,
  PatchDecisionResponseSchema,
  PatchListResponseSchema,
  PatchResponseSchema,
  ValidationListResponseSchema,
  ValidationProfileListResponseSchema,
  ValidationResponseSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
  IntegrationDashboardResponseSchema,
  IntegrationOperationResponseSchema,
  IntegrationPermissionListResponseSchema,
  BusinessOperationsDashboardSchema,
  BusinessOSExecutiveSummarySchema,
  BusinessExecutionRecordSchema,
  AgentDashboardResponseSchema,
  AgentEconomyDashboardSchema,
  AgentEconomyAccountResponseSchema,
  WorkforceGraphResponseSchema,
  WorkforceAgentDetailSchema,
  WorkforceImportReportSchema,
  WorkforceRuntimeDashboardSchema,
  WorkforceRuntimeTaskResponseSchema,
  WorkforceRuntimeMessageResponseSchema,
  WorkforceRuntimeReviewResponseSchema,
  AgentTaskResponseSchema,
  AgentMessageResponseSchema,
  AgentConsensusResponseSchema,
  AgentOsDashboardResponseSchema,
  AgentSessionResponseSchema,
  BrainRuntimeSummarySchema,
  CognitiveDashboardResponseSchema,
  ReflectionResponseSchema,
  ReasoningResponseSchema,
  DynamicWorkforceDashboardResponseSchema,
  TeamCompositionResponseSchema,
  DynamicAgentListResponseSchema,
  type ComposeTeamRequest,
  type AgentEconomyStatus,
  type EnrollAgentEconomyRequest,
  type AllocateAgentCreditsRequest,
  type CreateWorkforceTaskRequest,
  type CreateWorkforceMessageRequest,
  type CompleteWorkforceTaskRequest,
  type SubmitWorkforceReviewRequest,
  MemoryCenterResponseSchema,
  MemorySearchResponseSchema,
  KnowledgeGraphResponseSchema,
  EngineeringDecisionListResponseSchema,
  EngineeringDecisionResponseSchema,
  RepositoryMemoryResponseSchema,
  AgentMemoryResponseSchema,
  MemoryTimelineResponseSchema,
  MemorySuggestionListResponseSchema,
  MemoryStatisticsSchema,
  MemoryRecordResponseSchema,
  ExplicitMemoryTeachingResponseSchema,
  InfrastructureStatusResponseSchema,
  LocalAIHealthSchema,
  LocalAIStatsSchema,
  AIProviderDescriptorSchema,
  AIProviderHealthSchema,
  AIModelDescriptorSchema,
  AIModelRoleMappingSchema,
  AIRouterMetricsSchema,
  AIRouterResponseSchema,
  AIEconomicOverviewSchema,
  AIEconomicHealthSchema,
  AIBudgetPolicySchema,
  AIUsageLedgerEntrySchema,
  CognitiveContextPackageSchema,
  AIBenchmarkSuiteSchema,
  AIBenchmarkRunSchema,
  AIBenchmarkProfileSchema,
  AIRuntimeHealthSchema,
  EmbeddingJobListResponseSchema,
  HybridSearchResponseSchema,
  AdvisorDashboardResponseSchema,
  EngineeringGoalListResponseSchema,
  EngineeringGoalResponseSchema,
  StrategicPlanResponseSchema,
  RecommendationListResponseSchema,
  EngineeringRiskListResponseSchema,
  RepositoryHealthListResponseSchema,
  ArchitectureHealthListResponseSchema,
  TechnicalDebtListResponseSchema,
  RoadmapListResponseSchema,
  ReleaseAssessmentListResponseSchema,
  ScenarioSimulationResponseSchema,
  EngineeringMetricsResponseSchema,
  EvolutionDashboardResponseSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionProposalResponseSchema,
  AgentSocietyDashboardResponseSchema,
  SocietyTeamFormationResponseSchema,
  SocietyDebateResponseSchema,
  SocietyMeetingResponseSchema,
  CommandCenterResponseSchema,
  CommandStudioResponseSchema,
  RegisterSemanticObjectRequestSchema,
  RecordIntentEventRequestSchema,
  SaveGeneratedCommandRequestSchema,
  SkillSaveRequestSchema,
  SemanticIntelligenceDashboardResponseSchema,
  SemanticRetrievalSearchRequestSchema,
  SemanticRetrievalSearchResponseSchema,
  StartIntentRecordingRequestSchema,
  StopIntentRecordingRequestSchema,
  WorkflowEditRequestSchema,
  WorkflowSimulationRequestSchema,
  SubmitCommandResponseSchema,
  UpsertSemanticAliasRequestSchema,
  UpsertSynonymRequestSchema,
  SavedCommandRecordSchema,
  MacroRecordSchema,
  TaskCenterResponseSchema,
  ExecutiveDashboardSchema,
  ObjectiveDashboardSchema,
  ObjectiveDraftResponseSchema,
  CreateObjectiveRequestSchema,
  ModifyObjectiveRequestSchema,
  ObjectiveModificationResultSchema,
  ObserveObjectiveMetricRequestSchema,
  ExperimentDashboardSchema,
  CreateExperimentRequestSchema,
  RecordExperimentObservationRequestSchema,
  ModifyExperimentRequestSchema,
  ReflectionDashboardSchema,
  SkillEvolutionDashboardSchema,
  SkillCandidateIdRequestSchema,
  SkillVersionIdRequestSchema,
  DesktopNavigationRequestSchema,
  DesktopNavigationResponseSchema,
  DesktopSpatialInteractionRequestSchema,
  FormFillRequestSchema,
  SemanticInteractionRequestSchema,
  SemanticInteractionResponseSchema,
  SemanticDesktopSearchRequestSchema,
  SemanticDesktopSearchResponseSchema,
  DesktopControlCenterResponseSchema,
  DesktopSkillExecutionRequestSchema,
  DesktopSkillsCenterResponseSchema,
  DesktopWorkflowIdRequestSchema,
  NativeSpatialRuntimeResponseSchema,
  NativeCapabilityDispatchRequestSchema,
  NativeProviderDashboardResponseSchema,
  ProviderSelectionRequestSchema,
  ProviderSelectionResponseSchema,
  RecordSpatialEngineMetricRequestSchema,
  RecordSpatialInteractionMetricRequestSchema,
  SpatialCommandSpaceResponseSchema,
  SpatialDashboardResponseSchema,
  SpatialUiDashboardResponseSchema,
  UpdateSpatialModeRequestSchema,
  CreateVoiceSessionRequestSchema,
  ConversationCenterResponseSchema,
  CreateConversationBookmarkRequestSchema,
  SubmitConversationTurnFeedbackRequestSchema,
  ReplayConversationTurnRequestSchema,
  ReplayConversationTurnResponseSchema,
  RecordVoiceMetricRequestSchema,
  RecordVoiceTranscriptRequestSchema,
  UpsertConversationPersonaRequestSchema,
  UpsertVoiceProfileRequestSchema,
  UpsertVoiceShortcutRequestSchema,
  VoiceDashboardResponseSchema,
  VoiceCaptureLeaseRequestSchema,
  VoiceCaptureLeaseResponseSchema,
  VoiceTranscriptResponseSchema,
  HumanUnderstandingDashboardResponseSchema,
  HumanUnderstandingRequestSchema,
  HumanUnderstandingResultSchema,
  KnowledgeContextResponseSchema,
  KnowledgeGraphDashboardResponseSchema,
  KnowledgePathResponseSchema,
  KnowledgeSearchResponseSchema,
  CognitiveActionImpactSchema,
  CognitiveContextPreviewRequestSchema,
  CognitiveContextPreviewSchema,
  CognitiveExportResponseSchema,
  CognitiveExplanationSchema,
  CognitiveItemSchema,
  MemoryStudioSearchQuerySchema,
  MemoryStudioSearchResponseSchema,
  MemoryStudioDashboardSchema,
  UpdateCognitiveItemRequestSchema,
  CorpusDashboardResponseSchema,
  CorpusTestUtteranceResponseSchema,
  PersonalitySimulationRecordSchema,
  PreferenceLearningRecordSchema,
  ResponseExplanationRecordSchema,
  VersionCompareRequestSchema,
  VersionCompareResponseSchema,
  WorkspaceSemanticSearchRequestSchema,
  WorkspaceSemanticSearchResponseSchema,
  WorkspaceIntelligenceDashboardResponseSchema,
  DeepIndexerDashboardResponseSchema,
  IncrementalSyncRequestSchema,
  IncrementalSyncResponseSchema,
  type CreateValidationRequest,
  type CapabilityCandidateIdRequest,
  type ChangeCapabilityStateRequest,
  type CreateCapabilityFromDescriptionRequest,
  type CreateCapabilityFromRecordingRequest,
  type CreateCapabilityRequest,
  type CreateWorkflowRequest,
  type IntegrationOperationRequest,
  type BusinessActionRequest,
  type CreateAgentTaskRequest,
  type CreateAgentMessageRequest,
  type CreateAgentConsensusRequest,
  type CreateAgentSessionRequest,
  type CreateReflectionRequest,
  type CreateReasoningRequest,
  type CreateDecisionRequest,
  type CreateMemoryRequest,
  type ExplicitMemoryInput,
  type HybridSearchRequest,
  type CreateEngineeringGoalRequest,
  type CreateScenarioSimulationRequest,
  type CreateEvolutionProposalRequest,
  type RunEvolutionAnalysisRequest,
  type FormSocietyTeamRequest,
  type StartDebateRequest,
  type RecordMeetingRequest,
  type RecordIntentEventRequest,
  type SaveGeneratedCommandRequest,
  type SkillSaveRequest,
  type SemanticRetrievalSearchRequest,
  type StartIntentRecordingRequest,
  type StopIntentRecordingRequest,
  type WorkflowEditRequest,
  type WorkflowSimulationRequest,
  type SubmitCommandRequest,
  type SaveCommandRequest,
  type MacroRequest,
  type CreateTaskRequest,
  type TaskTriggerRequest,
  type CreateGoalRequest,
  type CreateRoutineRequest,
  type CreateChecklistRequest,
  type DesktopCapabilityRequest,
  type DesktopSkillExecutionRequest,
  type NativeCapabilityDispatchRequest,
  type ProviderSelectionRequest,
  type FormFillRequest,
  type DesktopNavigationRequest,
  type DesktopSpatialInteractionRequest,
  type SemanticInteractionRequest,
  type SemanticDesktopSearchRequest,
  type CreateGestureProfileRequest,
  type RecordGestureRequest,
  type RecordSpatialEngineMetricRequest,
  type RecordSpatialInteractionMetricRequest,
  type UpdateSpatialModeRequest,
  type UpsertGestureMappingRequest,
  type CreateVoiceSessionRequest,
  type VoiceCaptureLeaseRequest,
  type CreateConversationBookmarkRequest,
  type ConversationTurnFeedbackRecord,
  type RecordVoiceMetricRequest,
  type RecordVoiceTranscriptRequest,
  type UpsertConversationPersonaRequest,
  type UpsertVoiceProfileRequest,
  type UpsertVoiceShortcutRequest,
  type HumanUnderstandingRequest,
  type KnowledgeContextRequest,
  type KnowledgePathQuery,
  type KnowledgeSearchQuery,
  type MemoryStudioSearchQuery,
  type VersionCompareRequest,
  type WorkspaceSemanticSearchRequest,
  type IncrementalSyncRequest,
  type Repository,
  type GeneratePatchRequest,
  type RegisterSemanticObjectRequest,
  type UpsertSemanticAliasRequest,
  type UpsertSynonymRequest,
  type AIBudgetPolicy,
} from "@alexa-control/shared";
import { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const rawRequestAndValidate = async <TSchema extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError(
      0,
      "API_UNREACHABLE",
      `Could not reach the API at ${baseUrl}. Start the API server and try again.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(
      response.status,
      "INVALID_API_RESPONSE",
      `The API returned a non-JSON response with status ${response.status}.`,
    );
  }
  if (!response.ok) {
    const parsed = z
      .object({
        error: z.object({ code: z.string(), message: z.string() }),
      })
      .safeParse(body);
    throw new ApiClientError(
      response.status,
      parsed.success ? parsed.data.error.code : "API_REQUEST_FAILED",
      parsed.success
        ? parsed.data.error.message
        : `API request failed with status ${response.status}`,
    );
  }

  return schema.parse(body);
};

const jsonBody = (value: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(value),
});

export const createApiClient = (baseUrl: string) => {
  let csrfToken: string | undefined;
  const requestAndValidate = async <TSchema extends z.ZodType>(
    requestBaseUrl: string,
    path: string,
    schema: TSchema,
    init?: RequestInit,
    retriedAfterCsrfRefresh = false,
  ): Promise<z.infer<TSchema>> => {
    const method = init?.method?.toUpperCase() ?? "GET";
    const mutation = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
    if (
      mutation &&
      !["/api/auth/login", "/api/auth/register"].includes(path) &&
      !csrfToken
    ) {
      const csrf = await rawRequestAndValidate(
        requestBaseUrl,
        "/api/security/csrf",
        CsrfTokenResponseSchema,
      );
      csrfToken = csrf.token;
    }
    try {
      return await rawRequestAndValidate(requestBaseUrl, path, schema, {
        ...init,
        headers: {
          ...(csrfToken && mutation ? { "x-csrf-token": csrfToken } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        csrfToken = undefined;
      }
      if (
        error instanceof ApiClientError &&
        error.code === "CSRF_TOKEN_INVALID" &&
        mutation &&
        !retriedAfterCsrfRefresh
      ) {
        csrfToken = undefined;
        return requestAndValidate(requestBaseUrl, path, schema, init, true);
      }
      throw error;
    }
  };

  return {
    getHealth: (): Promise<HealthResponse> =>
      requestAndValidate(baseUrl, "/health", HealthResponseSchema),
    getAuthState: (): Promise<AuthStateResponse> =>
      requestAndValidate(baseUrl, "/api/auth/session", AuthStateResponseSchema),
    register: (input: { email: string; displayName: string; password: string }) =>
      requestAndValidate(
        baseUrl,
        "/api/auth/register",
        AuthSuccessResponseSchema,
        jsonBody(input),
      ),
    login: async (input: { email: string; password: string }) => {
      csrfToken = undefined;
      return requestAndValidate(
        baseUrl,
        "/api/auth/login",
        AuthSuccessResponseSchema,
        jsonBody(input),
      );
    },
    logout: async () => {
      const response = await requestAndValidate(
        baseUrl,
        "/api/auth/logout",
        LogoutResponseSchema,
        {
          method: "POST",
        },
      );
      csrfToken = undefined;
      return response;
    },
    getSessions: (): Promise<AuthSession[]> =>
      requestAndValidate(baseUrl, "/api/auth/sessions", SessionListResponseSchema),
    revokeSession: (sessionId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
        SessionRevocationResponseSchema,
        { method: "POST" },
      ),
    getSystemStatus: (): Promise<SystemStatusResponse> =>
      requestAndValidate(baseUrl, "/api/system/status", SystemStatusResponseSchema),
    getSecurityStatus: (): Promise<SecurityStatusResponse> =>
      requestAndValidate(baseUrl, "/api/security/status", SecurityStatusResponseSchema),
    getSecurityReadiness: (): Promise<SecurityReadinessResponse> =>
      requestAndValidate(
        baseUrl,
        "/api/security/readiness",
        SecurityReadinessResponseSchema,
      ),
    getNetworkStatus: (): Promise<NetworkVerificationResult> =>
      requestAndValidate(baseUrl, "/api/security/network", NetworkStatusResponseSchema),
    createRecentAuthChallenge: (purpose: RecentAuthPurpose) =>
      requestAndValidate(
        baseUrl,
        "/api/security/recent-auth/challenge",
        RecentAuthChallengeResponseSchema,
        jsonBody({ purpose }),
      ),
    verifyRecentPassword: (input: {
      challengeId: string;
      challengeToken: string;
      password: string;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/security/recent-auth/verify-password",
        RecentAuthStatusSchema,
        jsonBody(input),
      ),
    getRecentAuthStatus: (purpose: RecentAuthPurpose) =>
      requestAndValidate(
        baseUrl,
        `/api/security/recent-auth/status?purpose=${encodeURIComponent(purpose)}`,
        RecentAuthStatusSchema,
      ),
    getRecoveryCodeStatus: () =>
      requestAndValidate(
        baseUrl,
        "/api/security/recovery-codes/status",
        RecoveryCodeStatusSchema,
      ),
    generateRecoveryCodes: () =>
      requestAndValidate(
        baseUrl,
        "/api/security/recovery-codes/generate",
        RecoveryCodeGenerationResponseSchema,
        jsonBody({}),
      ),
    emergencyStop: (): Promise<EmergencyStopResponse> =>
      requestAndValidate(
        baseUrl,
        "/api/security/emergency-stop",
        EmergencyStopResponseSchema,
        { method: "POST" },
      ),
    releaseEmergencyStop: (): Promise<EmergencyStopResponse> =>
      requestAndValidate(
        baseUrl,
        "/api/security/emergency-stop/release",
        EmergencyStopResponseSchema,
        jsonBody({}),
      ),
    getDevices: (): Promise<DeviceView[]> =>
      requestAndValidate(baseUrl, "/api/devices", DeviceListResponseSchema),
    createPairingIntent: () =>
      requestAndValidate(
        baseUrl,
        "/api/devices/pairing-intents",
        CreatePairingIntentResponseSchema,
        { method: "POST" },
      ),
    approveDevice: (deviceId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/devices/${encodeURIComponent(deviceId)}/approve`,
        DeviceMutationResponseSchema,
        { method: "POST" },
      ),
    revokeDevice: (deviceId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/devices/${encodeURIComponent(deviceId)}/revoke`,
        DeviceMutationResponseSchema,
        { method: "POST" },
      ),
    getAudit: (): Promise<AuditRecord[]> =>
      requestAndValidate(baseUrl, "/api/audit", AuditListResponseSchema),
    getApplications: (): Promise<AllowedApplication[]> =>
      requestAndValidate(baseUrl, "/api/applications", ApplicationListResponseSchema),
    createApplication: (input: CreateApplicationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/applications",
        ApplicationResponseSchema,
        jsonBody(input),
      ),
    updateApplication: (id: string, input: UpdateApplicationRequest) =>
      requestAndValidate(
        baseUrl,
        `/api/applications/${encodeURIComponent(id)}`,
        ApplicationResponseSchema,
        jsonBody(input, "PATCH"),
      ),
    disableApplication: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/applications/${encodeURIComponent(id)}/disable`,
        ApplicationResponseSchema,
        { method: "POST" },
      ),
    getApplicationAdapters: () =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters",
        ApplicationAdapterDashboardResponseSchema,
      ),
    getAdapterSdk: () =>
      requestAndValidate(
        baseUrl,
        "/api/adapter-sdk",
        AdapterSdkDashboardResponseSchema,
      ),
    getCoreAdapters: () =>
      requestAndValidate(
        baseUrl,
        "/api/core-adapters",
        CoreAdapterDashboardResponseSchema,
      ),
    executeCoreAdapterAction: (input: CoreAdapterSemanticActionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/core-adapters/semantic-actions",
        CoreAdapterSemanticActionResponseSchema,
        jsonBody(CoreAdapterSemanticActionRequestSchema.parse(input)),
      ),
    transitionAdapterLifecycle: (input: AdapterLifecycleTransitionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/adapter-sdk/lifecycle",
        AdapterSdkDashboardResponseSchema,
        jsonBody(AdapterLifecycleTransitionRequestSchema.parse(input)),
      ),
    trustApplicationAdapter: (input: TrustApplicationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters/trusted-applications",
        ApplicationAdapterDashboardResponseSchema,
        jsonBody(input),
      ),
    updateApplicationAdapterPermissions: (input: UpdateApplicationPermissionsRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters/permissions",
        ApplicationAdapterDashboardResponseSchema,
        jsonBody(input),
      ),
    refreshApplicationCapabilities: (applicationId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters/capabilities/refresh",
        ApplicationAdapterDashboardResponseSchema,
        jsonBody({ applicationId }),
      ),
    synchronizeApplicationAdapter: (applicationId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters/synchronize",
        ApplicationAdapterDashboardResponseSchema,
        jsonBody({ applicationId }),
      ),
    revokeApplicationAdapter: (applicationId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/application-adapters/revoke",
        ApplicationAdapterDashboardResponseSchema,
        jsonBody({ applicationId }),
      ),
    getWorkspaces: (): Promise<AllowedWorkspace[]> =>
      requestAndValidate(baseUrl, "/api/workspaces", WorkspaceListResponseSchema),
    createWorkspace: (input: CreateWorkspaceRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/workspaces",
        WorkspaceResponseSchema,
        jsonBody(input),
      ),
    updateWorkspace: (id: string, input: UpdateWorkspaceRequest) =>
      requestAndValidate(
        baseUrl,
        `/api/workspaces/${encodeURIComponent(id)}`,
        WorkspaceResponseSchema,
        jsonBody(input, "PATCH"),
      ),
    disableWorkspace: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workspaces/${encodeURIComponent(id)}/disable`,
        WorkspaceResponseSchema,
        { method: "POST" },
      ),
    getTools: (): Promise<ToolDefinition[]> =>
      requestAndValidate(baseUrl, "/api/tools", ToolListResponseSchema),
    getTool: (name: string): Promise<ToolDefinition> =>
      requestAndValidate(
        baseUrl,
        `/api/tools/${encodeURIComponent(name)}`,
        ToolResponseSchema,
      ),
    evaluatePolicy: (input: PolicyEvaluationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/policies/evaluate",
        PolicyEvaluationResponseSchema,
        jsonBody(input),
      ),
    getPolicyEvaluations: (): Promise<PolicyEvaluation[]> =>
      requestAndValidate(
        baseUrl,
        "/api/policies/evaluations",
        PolicyEvaluationListResponseSchema,
      ),
    getApprovals: (status?: ApprovalStatus): Promise<ApprovalRequest[]> =>
      requestAndValidate(
        baseUrl,
        `/api/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
        ApprovalListResponseSchema,
      ),
    approveApproval: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/approvals/${encodeURIComponent(id)}/approve`,
        ApprovalResponseSchema,
        jsonBody({}),
      ),
    rejectApproval: (id: string, reason?: string) =>
      requestAndValidate(
        baseUrl,
        `/api/approvals/${encodeURIComponent(id)}/reject`,
        ApprovalResponseSchema,
        jsonBody(reason ? { reason } : {}),
      ),
    cancelApproval: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/approvals/${encodeURIComponent(id)}/cancel`,
        ApprovalResponseSchema,
        jsonBody({}),
      ),
    createExecution: (input: CreateExecutionRequest): Promise<ExecutionRequestView> =>
      requestAndValidate(
        baseUrl,
        "/api/executions",
        ExecutionRequestViewSchema,
        jsonBody(input),
      ),
    getExecutions: (): Promise<ExecutionRequestView[]> =>
      requestAndValidate(baseUrl, "/api/executions", ExecutionListResponseSchema),
    getExecution: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/executions/${encodeURIComponent(id)}`,
        ExecutionDetailResponseSchema,
      ),
    cancelExecution: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/executions/${encodeURIComponent(id)}/cancel`,
        ExecutionCancelResponseSchema,
        jsonBody({}),
      ),
    exportExecution: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/executions/${encodeURIComponent(id)}/export`,
        ExecutionExportResponseSchema,
      ),
    cleanupExecutions: () =>
      requestAndValidate(
        baseUrl,
        "/api/executions/cleanup",
        ExecutionCleanupResponseSchema,
        jsonBody({}),
      ),
    getRepositories: (): Promise<Repository[]> =>
      requestAndValidate(baseUrl, "/api/repositories", RepositoryListResponseSchema),
    getRepository: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}`,
        RepositoryDetailResponseSchema,
      ),
    reindexRepository: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/reindex`,
        RepositoryReindexResponseSchema,
        jsonBody({ reason: "manual" }),
      ),
    getRepositoryTree: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/tree`,
        RepositoryTreeResponseSchema,
      ),
    getRepositoryFiles: (id: string, query = "") =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/files${query}`,
        RepositoryFilesResponseSchema,
      ),
    searchRepository: (id: string, q: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/search?q=${encodeURIComponent(q)}`,
        RepositorySearchResponseSchema,
      ),
    getRepositoryStatistics: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/statistics`,
        RepositoryStatisticsSchema.nullable(),
      ),
    semanticSearchRepository: (id: string, q: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/semantic-search?q=${encodeURIComponent(q)}`,
        SemanticSearchResponseSchema,
      ),
    getRepositoryDefinition: (id: string, name: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/definition?name=${encodeURIComponent(name)}`,
        SemanticDefinitionResponseSchema,
      ),
    getRepositoryReferences: (id: string, name: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/references?name=${encodeURIComponent(name)}`,
        SemanticReferencesResponseSchema,
      ),
    getRepositoryDependencies: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/dependencies`,
        DependencyGraphResponseSchema,
      ),
    getRepositoryArchitecture: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/architecture`,
        ArchitectureGraphResponseSchema,
      ),
    getRepositoryApiRoutes: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/api-routes`,
        ApiDiscoveryResponseSchema,
      ),
    getRepositoryDatabaseModels: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/database-models`,
        DatabaseDiscoveryResponseSchema,
      ),
    getRepositoryInsights: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/insights`,
        RepositoryInsightsResponseSchema,
      ),
    askRepositoryEngineer: (id: string, question: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/question`,
        RepositoryReasoningResponseSchema,
        jsonBody({ question }),
      ),
    analyzeRepositoryImpact: (id: string, change: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/impact`,
        RepositoryImpactAnalysisResponseSchema,
        jsonBody({ change }),
      ),
    planRepositoryImplementation: (id: string, goal: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/plan`,
        RepositoryImplementationPlanResponseSchema,
        jsonBody({ goal }),
      ),
    reviewRepositoryCode: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/review`,
        RepositoryCodeReviewResponseSchema,
        jsonBody({ focus: "all" }),
      ),
    generateRepositoryDocumentation: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/documentation`,
        RepositoryDocumentationResponseSchema,
        jsonBody({ docType: "architecture_overview" }),
      ),
    getRepositoryEngineeringMemory: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/repositories/${encodeURIComponent(id)}/engineering/memory`,
        RepositoryReasoningMemorySchema,
      ),
    getPatches: () =>
      requestAndValidate(baseUrl, "/api/patches", PatchListResponseSchema),
    generatePatch: (input: GeneratePatchRequest) =>
      requestAndValidate(baseUrl, "/api/patches", PatchResponseSchema, jsonBody(input)),
    decidePatch: (patchId: string, decision: "approve" | "reject" | "cancel") =>
      requestAndValidate(
        baseUrl,
        `/api/patches/${encodeURIComponent(patchId)}/decision`,
        PatchDecisionResponseSchema,
        jsonBody({ decision }),
      ),
    executePatch: (patchId: string, approvalToken: string) =>
      requestAndValidate(
        baseUrl,
        `/api/patches/${encodeURIComponent(patchId)}/execute`,
        PatchResponseSchema,
        jsonBody({ approvalToken }),
      ),
    createRollbackPatch: (patchId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/patches/${encodeURIComponent(patchId)}/rollback`,
        PatchResponseSchema,
        jsonBody({}),
      ),
    getValidationProfiles: () =>
      requestAndValidate(
        baseUrl,
        "/api/validation/profiles",
        ValidationProfileListResponseSchema,
      ),
    getValidations: () =>
      requestAndValidate(baseUrl, "/api/validations", ValidationListResponseSchema),
    createValidation: (input: CreateValidationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/validations",
        ValidationResponseSchema,
        jsonBody(input),
      ),
    startValidation: (validationRunId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/validations/${encodeURIComponent(validationRunId)}/start`,
        ValidationResponseSchema,
        jsonBody({}),
      ),
    cancelValidation: (validationRunId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/validations/${encodeURIComponent(validationRunId)}/cancel`,
        ValidationResponseSchema,
        jsonBody({}),
      ),
    getWorkflows: () =>
      requestAndValidate(baseUrl, "/api/workflows", WorkflowListResponseSchema),
    getCrossApplicationWorkflows: () =>
      requestAndValidate(
        baseUrl,
        "/api/cross-application-workflows",
        CrossApplicationWorkflowDashboardResponseSchema,
      ),
    composeCrossApplicationWorkflow: (input: ComposeCrossApplicationWorkflowRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/cross-application-workflows/compose",
        CrossApplicationWorkflowDashboardResponseSchema,
        jsonBody(ComposeCrossApplicationWorkflowRequestSchema.parse(input)),
      ),
    startCrossApplicationWorkflow: (graphId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/cross-application-workflows/${encodeURIComponent(graphId)}/start`,
        CrossApplicationWorkflowDashboardResponseSchema,
        jsonBody({}),
      ),
    pauseCrossApplicationWorkflow: (graphId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/cross-application-workflows/${encodeURIComponent(graphId)}/pause`,
        CrossApplicationWorkflowDashboardResponseSchema,
        jsonBody({ reason: "Paused from Workflow Operations Center." }),
      ),
    cancelCrossApplicationWorkflow: (graphId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/cross-application-workflows/${encodeURIComponent(graphId)}/cancel`,
        CrossApplicationWorkflowDashboardResponseSchema,
        jsonBody({ reason: "Cancelled from Workflow Operations Center." }),
      ),
    recoverCrossApplicationWorkflow: (graphId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/cross-application-workflows/${encodeURIComponent(graphId)}/recover`,
        CrossApplicationWorkflowDashboardResponseSchema,
        jsonBody({}),
      ),
    createWorkflow: (input: CreateWorkflowRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/workflows",
        WorkflowResponseSchema,
        jsonBody(input),
      ),
    getWorkflow: (workflowId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}`,
        WorkflowResponseSchema,
      ),
    approveWorkflow: (workflowId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}/approve`,
        WorkflowResponseSchema,
        jsonBody({}),
      ),
    advanceWorkflow: (workflowId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}/advance`,
        WorkflowResponseSchema,
        jsonBody({}),
      ),
    pauseWorkflow: (workflowId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}/pause`,
        WorkflowResponseSchema,
        jsonBody({ reason: "Paused from dashboard." }),
      ),
    cancelWorkflow: (workflowId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}/cancel`,
        WorkflowResponseSchema,
        jsonBody({ reason: "Cancelled from dashboard." }),
      ),
    completeWorkflowTask: (workflowId: string, taskId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/workflows/${encodeURIComponent(workflowId)}/tasks/${encodeURIComponent(taskId)}/complete`,
        WorkflowResponseSchema,
        jsonBody({}),
      ),
    getIntegrationsDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/integrations/dashboard",
        IntegrationDashboardResponseSchema,
      ),
    setIntegrationPermission: (input: {
      integrationId: string;
      capabilityId: string;
      grant: boolean;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/integrations/permissions",
        IntegrationPermissionListResponseSchema,
        jsonBody(input),
      ),
    requestIntegrationOperation: (input: IntegrationOperationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/integrations/operations",
        IntegrationOperationResponseSchema,
        jsonBody(input),
      ),
    getBusinessOperations: () =>
      requestAndValidate(baseUrl, "/api/integrations/business/dashboard", BusinessOperationsDashboardSchema),
    getBusinessOSSummary: () =>
      requestAndValidate(baseUrl, "/api/business-os/summary", BusinessOSExecutiveSummarySchema),
    requestBusinessAction: (input: BusinessActionRequest) =>
      requestAndValidate(baseUrl, "/api/integrations/business/actions", BusinessExecutionRecordSchema, jsonBody(input)),
    reconcileBusinessAction: (executionId: string) =>
      requestAndValidate(baseUrl, `/api/integrations/business/executions/${encodeURIComponent(executionId)}/reconcile`, BusinessExecutionRecordSchema, jsonBody({})),
    getAgentsDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agents/dashboard",
        AgentDashboardResponseSchema,
      ),
    getAgentEconomyDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-economy/dashboard",
        AgentEconomyDashboardSchema,
      ),
    enrollAgentEconomy: (agentId: string, input: EnrollAgentEconomyRequest = {}) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-economy/agents/${encodeURIComponent(agentId)}/enroll`,
        AgentEconomyAccountResponseSchema,
        jsonBody(input),
      ),
    allocateAgentCredits: (agentId: string, input: AllocateAgentCreditsRequest) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-economy/agents/${encodeURIComponent(agentId)}/allocate`,
        AgentEconomyAccountResponseSchema,
        jsonBody(input),
      ),
    updateAgentEconomyStatus: (agentId: string, status: AgentEconomyStatus) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-economy/agents/${encodeURIComponent(agentId)}/status`,
        AgentEconomyAccountResponseSchema,
        jsonBody({ status }),
      ),
    getAgentWorkforceGraph: (query = "") =>
      requestAndValidate(
        baseUrl,
        `/api/agent-workforce/graph${query ? `?${query}` : ""}`,
        WorkforceGraphResponseSchema,
      ),
    getWorkforceRuntime: () =>
      requestAndValidate(baseUrl, "/api/workforce-runtime", WorkforceRuntimeDashboardSchema),
    createWorkforceRuntimeTask: (input: CreateWorkforceTaskRequest) =>
      requestAndValidate(baseUrl, "/api/workforce-runtime/tasks", WorkforceRuntimeTaskResponseSchema, jsonBody(input)),
    scheduleWorkforceRuntimeTask: (taskId: string) =>
      requestAndValidate(baseUrl, `/api/workforce-runtime/tasks/${encodeURIComponent(taskId)}/schedule`, WorkforceRuntimeTaskResponseSchema, jsonBody({})),
    executeWorkforceRuntimeTask: (taskId: string) =>
      requestAndValidate(baseUrl, `/api/workforce-runtime/tasks/${encodeURIComponent(taskId)}/execute`, WorkforceRuntimeTaskResponseSchema, jsonBody({})),
    completeWorkforceRuntimeTask: (taskId: string, input: CompleteWorkforceTaskRequest) =>
      requestAndValidate(baseUrl, `/api/workforce-runtime/tasks/${encodeURIComponent(taskId)}/complete`, WorkforceRuntimeTaskResponseSchema, jsonBody(input)),
    reviewWorkforceRuntimeTask: (taskId: string, input: SubmitWorkforceReviewRequest) =>
      requestAndValidate(baseUrl, `/api/workforce-runtime/tasks/${encodeURIComponent(taskId)}/reviews`, WorkforceRuntimeReviewResponseSchema, jsonBody(input)),
    cancelWorkforceRuntimeTask: (taskId: string) =>
      requestAndValidate(baseUrl, `/api/workforce-runtime/tasks/${encodeURIComponent(taskId)}/cancel`, WorkforceRuntimeDashboardSchema, jsonBody({})),
    recoverWorkforceRuntime: () =>
      requestAndValidate(baseUrl, "/api/workforce-runtime/recover", WorkforceRuntimeDashboardSchema, jsonBody({})),
    sendWorkforceRuntimeMessage: (input: CreateWorkforceMessageRequest) =>
      requestAndValidate(baseUrl, "/api/workforce-runtime/messages", WorkforceRuntimeMessageResponseSchema, jsonBody(input)),
    getAgentWorkforceDetail: (agentId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-workforce/agents/${encodeURIComponent(agentId)}`,
        WorkforceAgentDetailSchema,
      ),
    bootstrapAgentWorkforce: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-workforce/bootstrap",
        WorkforceImportReportSchema,
        jsonBody({}),
      ),
    updateAgentWorkforceActivation: (agentId: string, state: "ACTIVE" | "DORMANT") =>
      requestAndValidate(
        baseUrl,
        `/api/agent-workforce/agents/${encodeURIComponent(agentId)}/activation`,
        WorkforceAgentDetailSchema,
        jsonBody({ state }),
      ),
    getDynamicWorkforce: () =>
      requestAndValidate(
        baseUrl,
        "/api/agents/dynamic/workforce",
        DynamicWorkforceDashboardResponseSchema,
      ),
    getAgentOsDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-os/dashboard",
        AgentOsDashboardResponseSchema,
      ),
    getBrainRuntimeSummary: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-os/external-harvest/brain-summary",
        BrainRuntimeSummarySchema,
      ),
    startAgentOsSession: (input: CreateAgentSessionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-os/sessions",
        AgentSessionResponseSchema,
        jsonBody(input),
      ),
    getAgentCognitionDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-cognition/dashboard",
        CognitiveDashboardResponseSchema,
      ),
    searchAgentCognition: (q: string, agentId?: string) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-cognition/search?q=${encodeURIComponent(q)}${
          agentId ? `&agentId=${encodeURIComponent(agentId)}` : ""
        }`,
        MemoryStudioSearchResponseSchema,
      ),
    recordAgentReflection: (input: CreateReflectionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-cognition/reflections",
        ReflectionResponseSchema,
        jsonBody(input),
      ),
    recordAgentReasoning: (input: CreateReasoningRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-cognition/reason",
        ReasoningResponseSchema,
        jsonBody(input),
      ),
    consolidateAgentMemory: (agentId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/agent-cognition/agents/${encodeURIComponent(agentId)}/consolidate`,
        z.unknown(),
        jsonBody({}),
      ),
    composeAgentTeam: (input: ComposeTeamRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agents/team-compositions",
        TeamCompositionResponseSchema,
        jsonBody(input),
      ),
    retireDynamicAgent: (agentId: string, reason = "Workflow completed.") =>
      requestAndValidate(
        baseUrl,
        `/api/agents/dynamic/${encodeURIComponent(agentId)}/retire`,
        DynamicAgentListResponseSchema.element,
        jsonBody({ reason }),
      ),
    createAgentTask: (input: CreateAgentTaskRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agents/tasks",
        AgentTaskResponseSchema,
        jsonBody(input),
      ),
    completeAgentTask: (taskId: string, resultSummary: string) =>
      requestAndValidate(
        baseUrl,
        `/api/agents/tasks/${encodeURIComponent(taskId)}/complete`,
        AgentTaskResponseSchema,
        jsonBody({ resultSummary }),
      ),
    sendAgentMessage: (input: CreateAgentMessageRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agents/messages",
        AgentMessageResponseSchema,
        jsonBody(input),
      ),
    createAgentConsensus: (input: CreateAgentConsensusRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agents/consensus",
        AgentConsensusResponseSchema,
        jsonBody(input),
      ),
    getMemoryCenter: () =>
      requestAndValidate(baseUrl, "/api/memory/center", MemoryCenterResponseSchema),
    searchMemory: (q: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory/search?q=${encodeURIComponent(q)}`,
        MemorySearchResponseSchema,
      ),
    recordMemory: (input: CreateMemoryRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/memory",
        MemoryRecordResponseSchema,
        jsonBody(input),
      ),
    teachExplicitMemory: (input: ExplicitMemoryInput) =>
      requestAndValidate(
        baseUrl,
        "/api/memory/explicit",
        ExplicitMemoryTeachingResponseSchema,
        jsonBody(input),
      ),
    getMemoryStudio: () =>
      requestAndValidate(baseUrl, "/api/memory-studio", MemoryStudioDashboardSchema),
    searchMemoryStudio: (input: MemoryStudioSearchQuery) => {
      const parsed = MemoryStudioSearchQuerySchema.parse(input);
      const params = new URLSearchParams();
      if (parsed.q) params.set("q", parsed.q);
      if (parsed.itemType) params.set("itemType", parsed.itemType);
      if (parsed.status) params.set("status", parsed.status);
      if (parsed.source) params.set("source", parsed.source);
      if (parsed.lowConfidence !== undefined) {
        params.set("lowConfidence", String(parsed.lowConfidence));
      }
      if (parsed.stale !== undefined) params.set("stale", String(parsed.stale));
      if (parsed.conflict !== undefined)
        params.set("conflict", String(parsed.conflict));
      params.set("limit", String(parsed.limit));
      params.set("cursor", String(parsed.cursor));
      return requestAndValidate(
        baseUrl,
        `/api/memory-studio/search?${params.toString()}`,
        MemoryStudioSearchResponseSchema,
      );
    },
    getMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}`,
        CognitiveItemSchema,
      ),
    explainMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}/explain`,
        CognitiveExplanationSchema,
      ),
    updateMemoryStudioItem: (id: string, input: unknown) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}`,
        CognitiveItemSchema,
        jsonBody(UpdateCognitiveItemRequestSchema.parse(input), "PATCH"),
      ),
    archiveMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}/archive`,
        CognitiveActionImpactSchema,
        { method: "POST" },
      ),
    restoreMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}/restore`,
        CognitiveActionImpactSchema,
        { method: "POST" },
      ),
    pinMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}/pin`,
        CognitiveItemSchema,
        { method: "POST" },
      ),
    unpinMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}/unpin`,
        CognitiveItemSchema,
        { method: "POST" },
      ),
    deleteMemoryStudioItem: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory-studio/items/${encodeURIComponent(id)}`,
        CognitiveActionImpactSchema,
        { method: "DELETE" },
      ),
    previewMemoryStudioContext: (input: unknown) =>
      requestAndValidate(
        baseUrl,
        "/api/memory-studio/context-preview",
        CognitiveContextPreviewSchema,
        jsonBody(CognitiveContextPreviewRequestSchema.parse(input)),
      ),
    exportMemoryStudio: () =>
      requestAndValidate(
        baseUrl,
        "/api/memory-studio/export",
        CognitiveExportResponseSchema,
      ),
    getKnowledgeGraph: () =>
      requestAndValidate(baseUrl, "/api/memory/graph", KnowledgeGraphResponseSchema),
    getPersonalKnowledgeGraph: () =>
      requestAndValidate(
        baseUrl,
        "/api/knowledge-graph",
        KnowledgeGraphDashboardResponseSchema,
      ),
    searchPersonalKnowledgeGraph: (input: KnowledgeSearchQuery) => {
      const params = new URLSearchParams();
      if (input.q) params.set("q", input.q);
      if (input.entityType) params.set("entityType", input.entityType);
      if (input.tag) params.set("tag", input.tag);
      params.set("limit", String(input.limit ?? 50));
      params.set("depth", String(input.depth ?? 1));
      return requestAndValidate(
        baseUrl,
        `/api/knowledge-graph/search?${params.toString()}`,
        KnowledgeSearchResponseSchema,
      );
    },
    getPersonalKnowledgeContext: (input: KnowledgeContextRequest) => {
      const params = new URLSearchParams();
      if (input.text) params.set("text", input.text);
      for (const entityId of input.entityIds ?? [])
        params.append("entityIds", entityId);
      params.set("depth", String(input.depth ?? 1));
      params.set("limit", String(input.limit ?? 25));
      return requestAndValidate(
        baseUrl,
        `/api/knowledge-graph/context?${params.toString()}`,
        KnowledgeContextResponseSchema,
      );
    },
    getPersonalKnowledgePath: (input: KnowledgePathQuery) => {
      const params = new URLSearchParams({
        from: input.from,
        to: input.to,
        maxDepth: String(input.maxDepth ?? 4),
      });
      return requestAndValidate(
        baseUrl,
        `/api/knowledge-graph/path?${params.toString()}`,
        KnowledgePathResponseSchema,
      );
    },
    getEngineeringDecisions: () =>
      requestAndValidate(
        baseUrl,
        "/api/memory/decisions",
        EngineeringDecisionListResponseSchema,
      ),
    createEngineeringDecision: (input: CreateDecisionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/memory/decisions",
        EngineeringDecisionResponseSchema,
        jsonBody(input),
      ),
    getRepositoryMemory: (repositoryId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory/repositories/${encodeURIComponent(repositoryId)}`,
        RepositoryMemoryResponseSchema,
      ),
    getAgentMemory: (agentId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/memory/agents/${encodeURIComponent(agentId)}`,
        AgentMemoryResponseSchema,
      ),
    getMemoryTimeline: () =>
      requestAndValidate(baseUrl, "/api/memory/timeline", MemoryTimelineResponseSchema),
    getMemorySuggestions: () =>
      requestAndValidate(
        baseUrl,
        "/api/memory/suggestions",
        MemorySuggestionListResponseSchema,
      ),
    getMemoryStatistics: () =>
      requestAndValidate(baseUrl, "/api/memory/statistics", MemoryStatisticsSchema),
    getInfrastructureStatus: () =>
      requestAndValidate(
        baseUrl,
        "/api/infrastructure/status",
        InfrastructureStatusResponseSchema,
      ),
    getEmbeddingJobs: () =>
      requestAndValidate(
        baseUrl,
        "/api/infrastructure/embedding-jobs",
        EmbeddingJobListResponseSchema,
      ),
    getLocalAIHealth: () =>
      requestAndValidate(baseUrl, "/api/ai/local/health", LocalAIHealthSchema),
    getLocalAIStats: () =>
      requestAndValidate(baseUrl, "/api/ai/local/stats", LocalAIStatsSchema),
    testLocalAI: (input: { mode: "conversation" | "interpretation"; prompt: string }) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/local/test",
        z
          .object({
            mode: z.string(),
            model: z.string().nullable(),
            validated: z.unknown().optional(),
            response: z.string().optional(),
          })
          .passthrough(),
        jsonBody(input),
      ),
    getAIProviders: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/providers",
        z.array(AIProviderDescriptorSchema),
      ),
    getAIProviderHealth: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/providers/health",
        z.array(AIProviderHealthSchema),
      ),
    getAIModels: () =>
      requestAndValidate(baseUrl, "/api/ai/models", z.array(AIModelDescriptorSchema)),
    getAIRoles: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/model-roles",
        z.array(AIModelRoleMappingSchema),
      ),
    getAIActivity: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/activity",
        z.array(
          z
            .object({
              requestId: z.string(),
              providerId: z.string(),
              modelId: z.string(),
              purpose: z.string(),
              status: z.string(),
              latencyMs: z.number(),
              createdAt: z.string(),
            })
            .strict(),
        ),
      ),
    getAIRouterMetrics: () =>
      requestAndValidate(baseUrl, "/api/ai/router/metrics", AIRouterMetricsSchema),
    simulateAIRoute: (input: {
      input: string;
      purpose: string;
      risk?: string;
      privacy?: string;
      allowCloud?: boolean;
      requestedRole?: string;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/router/simulate",
        z.object({ level: z.string(), reason: z.string() }).strict(),
        jsonBody(input),
      ),
    testAIRouter: (input: {
      input: string;
      purpose: string;
      allowCloud?: boolean;
      privacy?: string;
      requestedRole?: string;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/router/execute",
        AIRouterResponseSchema,
        jsonBody(input),
      ),
    getAIEconomicOverview: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/economics/overview",
        AIEconomicOverviewSchema,
      ),
    getAIEconomicHealth: () =>
      requestAndValidate(baseUrl, "/api/ai/economics/health", AIEconomicHealthSchema),
    getAIBudgets: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/economics/budgets",
        z.array(AIBudgetPolicySchema),
      ),
    createAIBudget: (input: Omit<AIBudgetPolicy, "id" | "ownerId">) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/economics/budgets",
        AIBudgetPolicySchema,
        jsonBody(AIBudgetPolicySchema.omit({ id: true, ownerId: true }).parse(input)),
      ),
    updateAIBudget: (id: string, input: Omit<AIBudgetPolicy, "id" | "ownerId">) =>
      requestAndValidate(
        baseUrl,
        `/api/ai/economics/budgets/${id}`,
        AIBudgetPolicySchema,
        {
          method: "PUT",
          body: JSON.stringify(
            AIBudgetPolicySchema.omit({ id: true, ownerId: true }).parse(input),
          ),
        },
      ),
    deleteAIBudget: (id: string) =>
      requestAndValidate(
        baseUrl,
        `/api/ai/economics/budgets/${id}`,
        z.object({ removed: z.literal(true), id: z.string().uuid() }).strict(),
        { method: "DELETE" },
      ),
    getAIUsageLedger: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/economics/usage",
        z.array(AIUsageLedgerEntrySchema),
      ),
    getAIContextProfiles: () =>
      requestAndValidate(baseUrl, "/api/ai/context/profiles", z.array(z.string())),
    getAIContextHealth: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/context/health",
        z
          .object({
            status: z.enum(["READY", "DEGRADED", "NOT_READY"]),
            registeredSources: z.array(z.string()),
            healthySources: z.array(z.string()),
            degradedSources: z.array(z.string()),
            requiredSourceFailures: z.array(z.string()),
            ownerScopeReady: z.boolean(),
            privacyFilterReady: z.boolean(),
          })
          .strict(),
      ),
    simulateAIContext: (input: {
      purpose: string;
      taskText?: string;
      requestedProfile?: string;
      privacy?: string;
      maxContextTokens?: number;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/context/simulate",
        CognitiveContextPackageSchema,
        jsonBody(input),
      ),
    getAIRuntimeHealth: () =>
      requestAndValidate(baseUrl, "/api/ai/runtime-health", AIRuntimeHealthSchema),
    getAIBenchmarkSuites: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/benchmarks/suites",
        z.array(AIBenchmarkSuiteSchema),
      ),
    getAIBenchmarkRuns: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/benchmarks/runs",
        z.array(AIBenchmarkRunSchema),
      ),
    runAIBenchmark: (input: {
      suiteId: string;
      mode?: "DRY_RUN" | "FAST" | "LOCAL" | "LIVE_PAID" | "LOAD";
      maxCases?: number;
      paidOptIn?: boolean;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/ai/benchmarks/runs",
        AIBenchmarkRunSchema,
        jsonBody(input),
      ),
    getAIBenchmarkProfiles: () =>
      requestAndValidate(
        baseUrl,
        "/api/ai/benchmarks/profiles",
        z.array(AIBenchmarkProfileSchema),
      ),
    hybridSearch: (input: HybridSearchRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/infrastructure/hybrid-search",
        HybridSearchResponseSchema,
        jsonBody(input),
      ),
    getAdvisorDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/dashboard",
        AdvisorDashboardResponseSchema,
      ),
    getEngineeringGoals: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/goals",
        EngineeringGoalListResponseSchema,
      ),
    createEngineeringGoal: (input: CreateEngineeringGoalRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/goals",
        EngineeringGoalResponseSchema,
        jsonBody(input),
      ),
    planEngineeringGoal: (goalId: string) =>
      requestAndValidate(
        baseUrl,
        `/api/advisor/goals/${encodeURIComponent(goalId)}/plan`,
        StrategicPlanResponseSchema,
        jsonBody({}),
      ),
    getAdvisorRecommendations: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/recommendations",
        RecommendationListResponseSchema,
      ),
    getAdvisorRisks: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/risks",
        EngineeringRiskListResponseSchema,
      ),
    getRepositoryHealth: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/repository-health",
        RepositoryHealthListResponseSchema,
      ),
    getArchitectureHealth: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/architecture-health",
        ArchitectureHealthListResponseSchema,
      ),
    getTechnicalDebt: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/technical-debt",
        TechnicalDebtListResponseSchema,
      ),
    getRoadmaps: () =>
      requestAndValidate(baseUrl, "/api/advisor/roadmaps", RoadmapListResponseSchema),
    runAdvisorSimulation: (input: CreateScenarioSimulationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/simulations",
        ScenarioSimulationResponseSchema,
        jsonBody(input),
      ),
    getReleaseReadiness: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/release-readiness",
        ReleaseAssessmentListResponseSchema,
      ),
    getEngineeringMetrics: () =>
      requestAndValidate(
        baseUrl,
        "/api/advisor/metrics",
        EngineeringMetricsResponseSchema,
      ),
    getAgentEvolutionDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-evolution/dashboard",
        EvolutionDashboardResponseSchema,
      ),
    runAgentEvolutionAnalysis: (input: RunEvolutionAnalysisRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-evolution/analyse",
        EvolutionAnalysisResponseSchema,
        jsonBody(input),
      ),
    createAgentEvolutionProposal: (input: CreateEvolutionProposalRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-evolution/proposals",
        EvolutionProposalResponseSchema,
        jsonBody(input),
      ),
    getAgentSocietyDashboard: () =>
      requestAndValidate(
        baseUrl,
        "/api/agent-society/dashboard",
        AgentSocietyDashboardResponseSchema,
      ),
    formSocietyTeam: (input: FormSocietyTeamRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-society/teams",
        SocietyTeamFormationResponseSchema,
        jsonBody(input),
      ),
    startSocietyDebate: (input: StartDebateRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-society/debates",
        SocietyDebateResponseSchema,
        jsonBody(input),
      ),
    recordSocietyMeeting: (input: RecordMeetingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/agent-society/meetings",
        SocietyMeetingResponseSchema,
        jsonBody(input),
      ),
    getCommandCenter: () =>
      requestAndValidate(baseUrl, "/api/commands", CommandCenterResponseSchema),
    submitCommand: (input: SubmitCommandRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/commands",
        SubmitCommandResponseSchema,
        jsonBody(input),
      ),
    saveCommandTemplate: (input: SaveCommandRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/commands/saved",
        SavedCommandRecordSchema,
        jsonBody(input),
      ),
    createCommandMacro: (input: MacroRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/commands/macros",
        MacroRecordSchema,
        jsonBody(input),
      ),
    getCommandStudio: () =>
      requestAndValidate(baseUrl, "/api/command-studio", CommandStudioResponseSchema),
    getCapabilityStudio: () =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio",
        CapabilityStudioResponseSchema,
      ),
    createCapabilityFromDescription: (
      input: CreateCapabilityFromDescriptionRequest,
    ) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/describe",
        CapabilityStudioResponseSchema,
        jsonBody(CreateCapabilityFromDescriptionRequestSchema.parse(input)),
      ),
    createCapabilityFromRecording: (input: CreateCapabilityFromRecordingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/recording",
        CapabilityStudioResponseSchema,
        jsonBody(CreateCapabilityFromRecordingRequestSchema.parse(input)),
      ),
    validateCapabilityCandidate: (input: CapabilityCandidateIdRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/validate",
        CapabilityStudioResponseSchema,
        jsonBody(CapabilityCandidateIdRequestSchema.parse(input)),
      ),
    testCapabilityCandidate: (input: CapabilityCandidateIdRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/test",
        CapabilityStudioResponseSchema,
        jsonBody(CapabilityCandidateIdRequestSchema.parse(input)),
      ),
    requestCapabilityApproval: (input: CapabilityCandidateIdRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/request-approval",
        CapabilityStudioResponseSchema,
        jsonBody(CapabilityCandidateIdRequestSchema.parse(input)),
      ),
    activateCapabilityCandidate: (input: CapabilityCandidateIdRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/activate",
        CapabilityStudioResponseSchema,
        jsonBody(CapabilityCandidateIdRequestSchema.parse(input)),
      ),
    changeCapabilityCandidateState: (input: ChangeCapabilityStateRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/candidates/state",
        CapabilityStudioResponseSchema,
        jsonBody(ChangeCapabilityStateRequestSchema.parse(input)),
      ),
    createCapabilityRequest: (input: CreateCapabilityRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/capability-studio/requests",
        CapabilityStudioResponseSchema,
        jsonBody(CreateCapabilityRequestSchema.parse(input)),
      ),
    startIntentRecording: (input: StartIntentRecordingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/recordings",
        CommandStudioResponseSchema,
        jsonBody(StartIntentRecordingRequestSchema.parse(input)),
      ),
    recordIntentEvent: (input: RecordIntentEventRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/events",
        CommandStudioResponseSchema,
        jsonBody(RecordIntentEventRequestSchema.parse(input)),
      ),
    stopIntentRecording: (input: StopIntentRecordingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/recordings/stop",
        CommandStudioResponseSchema,
        jsonBody(StopIntentRecordingRequestSchema.parse(input)),
      ),
    saveGeneratedCommand: (input: SaveGeneratedCommandRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/generated/save",
        CommandStudioResponseSchema,
        jsonBody(SaveGeneratedCommandRequestSchema.parse(input)),
      ),
    saveGeneratedSkill: (input: SkillSaveRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/skills/save",
        CommandStudioResponseSchema,
        jsonBody(SkillSaveRequestSchema.parse(input)),
      ),
    validateDemonstratedWorkflow: (input: { skillId?: string; recordingId?: string }) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/workflows/validate",
        CommandStudioResponseSchema,
        jsonBody(input),
      ),
    editDemonstratedWorkflow: (input: WorkflowEditRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/workflows/edit",
        CommandStudioResponseSchema,
        jsonBody(WorkflowEditRequestSchema.parse(input)),
      ),
    simulateDemonstratedWorkflow: (input: WorkflowSimulationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/command-studio/workflows/simulate",
        CommandStudioResponseSchema,
        jsonBody(WorkflowSimulationRequestSchema.parse(input)),
      ),
    getSemanticIntelligence: () =>
      requestAndValidate(
        baseUrl,
        "/api/semantic",
        SemanticIntelligenceDashboardResponseSchema,
      ),
    semanticSearch: (input: SemanticRetrievalSearchRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/semantic/search",
        SemanticRetrievalSearchResponseSchema,
        jsonBody(SemanticRetrievalSearchRequestSchema.parse(input)),
      ),
    registerSemanticObject: (input: RegisterSemanticObjectRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/semantic/objects",
        SemanticIntelligenceDashboardResponseSchema,
        jsonBody(RegisterSemanticObjectRequestSchema.parse(input)),
      ),
    upsertSemanticAlias: (input: UpsertSemanticAliasRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/semantic/aliases",
        SemanticIntelligenceDashboardResponseSchema,
        jsonBody(UpsertSemanticAliasRequestSchema.parse(input)),
      ),
    upsertSynonym: (input: UpsertSynonymRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/semantic/synonyms",
        SemanticIntelligenceDashboardResponseSchema,
        jsonBody(UpsertSynonymRequestSchema.parse(input)),
      ),
    getTaskCenter: () =>
      requestAndValidate(baseUrl, "/api/tasks", TaskCenterResponseSchema),
    getExecutiveDashboard: () =>
      requestAndValidate(baseUrl, "/api/executive", ExecutiveDashboardSchema),
    getObjectives: () =>
      requestAndValidate(baseUrl, "/api/objectives", ObjectiveDashboardSchema),
    createObjective: (input: unknown) =>
      requestAndValidate(baseUrl, "/api/objectives", ObjectiveDraftResponseSchema, jsonBody(CreateObjectiveRequestSchema.parse(input))),
    activateObjective: (objectiveId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/activate`, ObjectiveDashboardSchema, jsonBody({ idempotencyKey })),
    pauseObjective: (objectiveId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/pause`, ObjectiveDashboardSchema, jsonBody({ idempotencyKey })),
    replanObjective: (objectiveId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/replan`, ObjectiveDashboardSchema, jsonBody({ idempotencyKey })),
    cancelObjective: (objectiveId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/cancel`, ObjectiveDashboardSchema, jsonBody({ idempotencyKey })),
    modifyObjective: (objectiveId: string, input: unknown) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}`, ObjectiveModificationResultSchema, jsonBody(ModifyObjectiveRequestSchema.parse(input), "PATCH")),
    observeObjectiveMetric: (objectiveId: string, input: unknown) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/observations`, ObjectiveDashboardSchema, jsonBody(ObserveObjectiveMetricRequestSchema.parse(input))),
    getObjectiveExperiments: (objectiveId: string) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/experiments`, ExperimentDashboardSchema),
    createExperiment: (objectiveId: string, input: unknown) =>
      requestAndValidate(baseUrl, `/api/objectives/${objectiveId}/experiments`, ExperimentDashboardSchema, jsonBody(CreateExperimentRequestSchema.parse(input))),
    activateExperiment: (experimentId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/experiments/${experimentId}/activate`, ExperimentDashboardSchema, jsonBody({idempotencyKey})),
    pauseExperiment: (experimentId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/experiments/${experimentId}/pause`, ExperimentDashboardSchema, jsonBody({idempotencyKey})),
    stopExperiment: (experimentId: string, idempotencyKey: string) =>
      requestAndValidate(baseUrl, `/api/experiments/${experimentId}/stop`, ExperimentDashboardSchema, jsonBody({idempotencyKey})),
    modifyExperiment: (experimentId: string, input: unknown) =>
      requestAndValidate(baseUrl, `/api/experiments/${experimentId}`, ExperimentDashboardSchema, jsonBody(ModifyExperimentRequestSchema.parse(input),"PATCH")),
    recordExperimentObservation: (experimentId: string, input: unknown) =>
      requestAndValidate(baseUrl, `/api/experiments/${experimentId}/observations`, ExperimentDashboardSchema, jsonBody(RecordExperimentObservationRequestSchema.parse(input))),
    getReflectionDashboard: () =>
      requestAndValidate(baseUrl, "/api/reflections", ReflectionDashboardSchema),
    getSkillEvolutionDashboard: () =>
      requestAndValidate(baseUrl, "/api/skill-evolution", SkillEvolutionDashboardSchema),
    buildSkillCandidate: (candidateId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/candidates/build",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillCandidateIdRequestSchema.parse({ candidateId })),
      ),
    dismissSkillCandidate: (candidateId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/candidates/dismiss",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillCandidateIdRequestSchema.parse({ candidateId })),
      ),
    suppressSkillCandidate: (candidateId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/candidates/suppress",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillCandidateIdRequestSchema.parse({ candidateId })),
      ),
    validateSkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/validate",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    benchmarkSkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/benchmark",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    promoteSkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/promote",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    rollbackSkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/rollback",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    deprecateSkill: (skillId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/deprecate",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, reason: "Deprecated from dashboard" })),
      ),
    disableSkill: (skillId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/disable",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, reason: "Disabled from dashboard" })),
      ),
    shadowSkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/shadow",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    canarySkillVersion: (skillId: string, versionId?: string) =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/canary",
        SkillEvolutionDashboardSchema,
        jsonBody(SkillVersionIdRequestSchema.parse({ skillId, versionId })),
      ),
    runSkillDraftBenchmark: () =>
      requestAndValidate(
        baseUrl,
        "/api/skill-evolution/draft-benchmark",
        SkillEvolutionDashboardSchema,
        jsonBody({}),
      ),
    createTask: (input: CreateTaskRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/tasks",
        TaskCenterResponseSchema,
        jsonBody(input),
      ),
    triggerTask: (input: TaskTriggerRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/tasks/trigger",
        TaskCenterResponseSchema,
        jsonBody(input),
      ),
    createTaskGoal: (input: CreateGoalRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/tasks/goals",
        TaskCenterResponseSchema,
        jsonBody(input),
      ),
    createTaskRoutine: (input: CreateRoutineRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/tasks/routines",
        TaskCenterResponseSchema,
        jsonBody(input),
      ),
    createTaskChecklist: (input: CreateChecklistRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/tasks/checklists",
        TaskCenterResponseSchema,
        jsonBody(input),
      ),
    getDesktopControlCenter: () =>
      requestAndValidate(baseUrl, "/api/desktop", DesktopControlCenterResponseSchema),
    getDesktopSkillsCenter: () =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills",
        DesktopSkillsCenterResponseSchema,
      ),
    executeDesktopSkill: (input: DesktopSkillExecutionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills/execute",
        DesktopSkillsCenterResponseSchema,
        jsonBody(DesktopSkillExecutionRequestSchema.parse(input)),
      ),
    pauseDesktopWorkflow: (executionId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills/pause",
        DesktopSkillsCenterResponseSchema,
        jsonBody(DesktopWorkflowIdRequestSchema.parse({ executionId })),
      ),
    resumeDesktopWorkflow: (executionId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills/resume",
        DesktopSkillsCenterResponseSchema,
        jsonBody(DesktopWorkflowIdRequestSchema.parse({ executionId })),
      ),
    cancelDesktopWorkflow: (executionId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills/cancel",
        DesktopSkillsCenterResponseSchema,
        jsonBody(DesktopWorkflowIdRequestSchema.parse({ executionId })),
      ),
    recoverDesktopWorkflow: (executionId: string) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop-skills/recovery",
        DesktopSkillsCenterResponseSchema,
        jsonBody(DesktopWorkflowIdRequestSchema.parse({ executionId })),
      ),
    getNativeProviderRuntime: () =>
      requestAndValidate(
        baseUrl,
        "/api/native-providers",
        NativeProviderDashboardResponseSchema,
      ),
    getApplicationIntelligence: () =>
      requestAndValidate(
        baseUrl,
        "/api/application-intelligence",
        ApplicationIntelligenceDashboardResponseSchema,
      ),
    getWorkspaceIntelligence: () =>
      requestAndValidate(
        baseUrl,
        "/api/workspace-intelligence",
        WorkspaceIntelligenceDashboardResponseSchema,
      ),
    getDeepIndexers: () =>
      requestAndValidate(
        baseUrl,
        "/api/deep-indexers",
        DeepIndexerDashboardResponseSchema,
      ),
    runDeepIndexerSync: (input: IncrementalSyncRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/deep-indexers/incremental-sync",
        IncrementalSyncResponseSchema,
        jsonBody(IncrementalSyncRequestSchema.parse(input)),
      ),
    searchWorkspaceIntelligence: (input: WorkspaceSemanticSearchRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/workspace-intelligence/search",
        WorkspaceSemanticSearchResponseSchema,
        jsonBody(WorkspaceSemanticSearchRequestSchema.parse(input)),
      ),
    selectApplicationProvider: (input: ProviderSelectionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/application-intelligence/provider-selection",
        ProviderSelectionResponseSchema,
        jsonBody(ProviderSelectionRequestSchema.parse(input)),
      ),
    validateNativeProviders: () =>
      requestAndValidate(
        baseUrl,
        "/api/native-providers/validate",
        NativeProviderDashboardResponseSchema,
        jsonBody({}),
      ),
    dispatchNativeCapability: (input: NativeCapabilityDispatchRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/native-providers/dispatch",
        NativeProviderDashboardResponseSchema,
        jsonBody(NativeCapabilityDispatchRequestSchema.parse(input)),
      ),
    refreshDesktopContext: () =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/context/refresh",
        DesktopControlCenterResponseSchema,
        jsonBody({}),
      ),
    requestDesktopCapability: (input: DesktopCapabilityRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/actions",
        DesktopControlCenterResponseSchema,
        jsonBody(input),
      ),
    requestSpatialDesktopInteraction: (input: DesktopSpatialInteractionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/spatial/interactions",
        DesktopControlCenterResponseSchema,
        jsonBody(DesktopSpatialInteractionRequestSchema.parse(input)),
      ),
    searchSemanticDesktop: (input: SemanticDesktopSearchRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/semantic/search",
        SemanticDesktopSearchResponseSchema,
        jsonBody(SemanticDesktopSearchRequestSchema.parse(input)),
      ),
    navigateSemanticDesktop: (input: DesktopNavigationRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/navigation",
        DesktopNavigationResponseSchema,
        jsonBody(DesktopNavigationRequestSchema.parse(input)),
      ),
    requestSemanticInteraction: (input: SemanticInteractionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/interactions",
        SemanticInteractionResponseSchema,
        jsonBody(SemanticInteractionRequestSchema.parse(input)),
      ),
    fillSemanticForm: (input: FormFillRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/desktop/forms/fill",
        SemanticInteractionResponseSchema,
        jsonBody(FormFillRequestSchema.parse(input)),
      ),
    getSpatialDashboard: () =>
      requestAndValidate(baseUrl, "/api/spatial", SpatialDashboardResponseSchema),
    getNativeSpatialRuntime: () =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/native",
        NativeSpatialRuntimeResponseSchema,
      ),
    getSpatialUiDashboard: () =>
      requestAndValidate(baseUrl, "/api/spatial/ui", SpatialUiDashboardResponseSchema),
    getSpatialCommandSpace: () =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/command-space",
        SpatialCommandSpaceResponseSchema,
      ),
    setSpatialMode: (input: UpdateSpatialModeRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/command-space/mode",
        SpatialCommandSpaceResponseSchema,
        jsonBody(UpdateSpatialModeRequestSchema.parse(input)),
      ),
    recordSpatialInteractionMetric: (input: RecordSpatialInteractionMetricRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/ui/metrics",
        SpatialUiDashboardResponseSchema,
        jsonBody(RecordSpatialInteractionMetricRequestSchema.parse(input)),
      ),
    recordSpatialEngineMetric: (input: RecordSpatialEngineMetricRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/ui/engine-metrics",
        SpatialUiDashboardResponseSchema,
        jsonBody(RecordSpatialEngineMetricRequestSchema.parse(input)),
      ),
    refreshSpatialCameras: () =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/cameras/refresh",
        SpatialDashboardResponseSchema,
        jsonBody({}),
      ),
    createGestureProfile: (input: CreateGestureProfileRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/profiles",
        SpatialDashboardResponseSchema,
        jsonBody(input),
      ),
    upsertGestureMapping: (input: UpsertGestureMappingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/mappings",
        SpatialDashboardResponseSchema,
        jsonBody(input),
      ),
    recordGesture: (input: RecordGestureRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/spatial/gestures",
        SpatialDashboardResponseSchema,
        jsonBody(input),
      ),
    getVoiceDashboard: () =>
      requestAndValidate(baseUrl, "/api/voice", VoiceDashboardResponseSchema),
    createVoiceSession: (input: CreateVoiceSessionRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/sessions",
        VoiceDashboardResponseSchema,
        jsonBody(CreateVoiceSessionRequestSchema.parse(input)),
      ),
    manageVoiceCaptureLease: (input: VoiceCaptureLeaseRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/capture-lease",
        VoiceCaptureLeaseResponseSchema,
        jsonBody(VoiceCaptureLeaseRequestSchema.parse(input)),
      ),
    recordVoiceTranscript: (input: RecordVoiceTranscriptRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/transcripts",
        VoiceTranscriptResponseSchema,
        jsonBody(RecordVoiceTranscriptRequestSchema.parse(input)),
      ),
    recordVoiceMetric: (input: RecordVoiceMetricRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/metrics",
        VoiceDashboardResponseSchema,
        jsonBody(RecordVoiceMetricRequestSchema.parse(input)),
      ),
    upsertVoiceProfile: (input: UpsertVoiceProfileRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/profiles",
        VoiceDashboardResponseSchema,
        jsonBody(UpsertVoiceProfileRequestSchema.parse(input)),
      ),
    upsertVoiceShortcut: (input: UpsertVoiceShortcutRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/voice/shortcuts",
        VoiceDashboardResponseSchema,
        jsonBody(UpsertVoiceShortcutRequestSchema.parse(input)),
      ),
    getConversationCenter: () =>
      requestAndValidate(
        baseUrl,
        "/api/conversations",
        ConversationCenterResponseSchema,
      ),
    upsertConversationPersona: (input: UpsertConversationPersonaRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/conversations/personas",
        ConversationCenterResponseSchema,
        jsonBody(UpsertConversationPersonaRequestSchema.parse(input)),
      ),
    createConversationBookmark: (input: CreateConversationBookmarkRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/conversations/bookmarks",
        ConversationCenterResponseSchema,
        jsonBody(CreateConversationBookmarkRequestSchema.parse(input)),
      ),
    recordConversationTurnFeedback: (
      turnId: string,
      input: Pick<ConversationTurnFeedbackRecord, "kind" | "note">,
    ) =>
      requestAndValidate(
        baseUrl,
        `/api/conversations/turns/${encodeURIComponent(turnId)}/feedback`,
        ConversationCenterResponseSchema,
        jsonBody(SubmitConversationTurnFeedbackRequestSchema.parse(input)),
      ),
    replayConversationTurn: (
      turnId: string,
      route: "DETERMINISTIC" | "GEMMA" | "GPT",
    ) =>
      requestAndValidate(
        baseUrl,
        `/api/conversations/turns/${encodeURIComponent(turnId)}/replay`,
        ReplayConversationTurnResponseSchema,
        jsonBody(ReplayConversationTurnRequestSchema.parse({ route })),
      ),
    getHumanUnderstanding: () =>
      requestAndValidate(
        baseUrl,
        "/api/human-understanding",
        HumanUnderstandingDashboardResponseSchema,
      ),
    simulateHumanUnderstanding: (input: HumanUnderstandingRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/simulation",
        HumanUnderstandingResultSchema,
        jsonBody(HumanUnderstandingRequestSchema.parse(input)),
      ),
    bootstrapPersonality: () =>
      requestAndValidate(
        baseUrl,
        "/api/personality/bootstrap",
        HumanUnderstandingDashboardResponseSchema,
        jsonBody({}),
      ),
    resetPersonality: () =>
      requestAndValidate(
        baseUrl,
        "/api/personality/reset",
        HumanUnderstandingDashboardResponseSchema,
        jsonBody({}),
      ),
    exportPersonality: () =>
      requestAndValidate(
        baseUrl,
        "/api/personality/export",
        z.object({
          exportedAt: z.iso.datetime(),
          dashboard: HumanUnderstandingDashboardResponseSchema,
        }),
      ),
    comparePersonalityVersions: (input: VersionCompareRequest) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/version/compare",
        VersionCompareResponseSchema,
        jsonBody(VersionCompareRequestSchema.parse(input)),
      ),
    switchPersonalityProfile: (profileName: string) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/profile/switch",
        HumanUnderstandingDashboardResponseSchema,
        jsonBody({ profileName }),
      ),
    recordPersonalityLearningEvidence: (input: {
      key: string;
      value: string;
      source?: "conversation" | "manual" | "workflow" | "correction";
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/learning/evidence",
        PreferenceLearningRecordSchema,
        jsonBody(input),
      ),
    simulatePersonalityProfiles: (text: string) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/simulation/personality",
        z.array(PersonalitySimulationRecordSchema),
        jsonBody({ text }),
      ),
    explainPersonalityResponse: (input: {
      response: string;
      plannerConfidence?: number | null;
      aiUsed?: boolean;
    }) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/why",
        ResponseExplanationRecordSchema,
        jsonBody(input),
      ),
    getPersonalityCorpus: () =>
      requestAndValidate(
        baseUrl,
        "/api/personality/corpus",
        CorpusDashboardResponseSchema,
      ),
    importPersonalityCorpus: (markdownPath: string) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/corpus/import",
        CorpusDashboardResponseSchema,
        jsonBody({ markdownPath }),
      ),
    testCorpusUtterance: (utterance: string) =>
      requestAndValidate(
        baseUrl,
        "/api/personality/corpus/test-utterance",
        CorpusTestUtteranceResponseSchema,
        jsonBody({ utterance }),
      ),
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
