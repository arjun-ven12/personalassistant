package com.alexa.commandcenter.network

import android.util.Log
import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.security.SessionStore
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.HTTP
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

interface AlexaApiService {
  @POST("api/marketing-campaigns/{id}/initiatives/draft") suspend fun businessInitiative(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,@JvmSuppressWildcards Any>): Response<JsonObject>
  @POST("api/marketing-campaigns/{id}/analytics/read-metric") suspend fun businessAnalytics(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String>): Response<BusinessArtifact>
  @GET("api/marketing-campaigns") suspend fun businessCampaigns(): Response<BusinessCampaigns>
  @GET("api/marketing-campaigns/{id}") suspend fun businessCampaign(@Path("id") id: String): Response<BusinessView>
  @GET("api/marketing-campaigns/{id}/telemetry") suspend fun businessTelemetry(@Path("id") id: String): Response<BusinessTelemetry>
  @POST("api/marketing-campaigns") suspend fun createBusiness(@Header("X-CSRF-Token") csrf: String, @Body body: BusinessCreate): Response<BusinessCampaign>
  @POST("api/marketing-campaigns/{id}/{action}") suspend fun businessControl(@Path("id") id: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String> = emptyMap()): Response<JsonObject>
  @POST("api/marketing-campaigns/{id}/artifacts/{artifact}/review/{action}") suspend fun businessReview(@Path("id") id: String, @Path("artifact") artifact: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String> = emptyMap()): Response<JsonObject>
  @POST("api/marketing-campaigns/{id}/deliverables/{deliverable}/recover") suspend fun businessRecover(@Path("id") id: String, @Path("deliverable") deliverable: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String> = emptyMap()): Response<JsonObject>
  @POST("api/documents/provider-review") suspend fun reviewDocumentProvider(@Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String>): Response<Map<String,String>>
  @GET("api/documents") suspend fun documents(@Query("q") q: String): Response<DocumentList>
  @GET("api/documents/{id}") suspend fun document(@Path("id") id: String): Response<AthenaDocument>
  @GET("api/documents/{id}/memories") suspend fun documentMemories(@Path("id") id: String): Response<DocumentMemories>
  @GET("api/documents/settings") suspend fun documentSettings(): Response<DocumentSettings>
  @PATCH("api/documents/settings") suspend fun saveDocumentSettings(@Header("X-CSRF-Token") csrf: String, @Body body: DocumentSettings): Response<DocumentSettings>
  @POST("api/documents") suspend fun createDocument(@Header("X-CSRF-Token") csrf: String, @Body body: DocumentCreate): Response<AthenaDocument>
  @POST("api/documents/{id}/upload-grants") suspend fun documentGrants(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String> = emptyMap()): Response<List<DocumentGrant>>
  @retrofit2.http.PUT("api/documents/{id}/pages/{page}") suspend fun uploadDocument(@Path("id") id: String, @Path("page") page: Int, @Header("X-CSRF-Token") csrf: String, @Body body: DocumentUpload): Response<AthenaDocument>
  @POST("api/documents/{id}/{action}") suspend fun documentAction(@Path("id") id: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,Boolean> = emptyMap()): Response<AthenaDocument>
  @PATCH("api/documents/{id}") suspend fun editDocument(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,@JvmSuppressWildcards Any>): Response<AthenaDocument>
  @HTTP(method="DELETE", path="api/documents/{id}", hasBody=true) suspend fun archiveDocument(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String,String> = emptyMap()): Response<AthenaDocument>
  @GET("api/documents/{id}/pages/{page}/{kind}") suspend fun documentImage(@Path("id") id: String, @Path("page") page: Int, @Path("kind") kind: String): Response<ResponseBody>
  @GET("api/documents/{id}/pdf") suspend fun documentPdf(@Path("id") id: String): Response<ResponseBody>
  @GET("api/documents/{id}/export") suspend fun documentExport(@Path("id") id: String): Response<ResponseBody>

  @GET("api/engineering-objectives/{id}/inputs") suspend fun engineeringInputs(@Path("id") id: String): Response<EngineeringProjectInputs>
  @POST("api/engineering-objectives/{id}/inputs") suspend fun engineeringUpload(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: EngineeringProjectInputUpload): Response<EngineeringProjectInput>
  @GET("api/company-data") suspend fun engineeringConnections(): Response<EngineeringCompanyConnections>
  @POST("api/universal-tools/invocations") suspend fun engineeringTool(@Header("X-CSRF-Token") csrf: String, @Body request: EngineeringToolRequest): Response<EngineeringToolResult>
  @GET("api/engineering-deliveries") suspend fun engineeringDeliveries(): Response<EngineeringDeliveryList>
  @GET("api/engineering-deliveries/projects") suspend fun engineeringProjects(): Response<EngineeringProjectList>
  @GET("api/engineering-deliveries/{id}") suspend fun engineeringBuild(@Path("id") id: String): Response<EngineeringBuild>
  @GET("api/engineering-objectives/{id}") suspend fun engineeringObjective(@Path("id") id: String): Response<EngineeringObjectiveView>
  @GET("api/engineering-integrations/{id}") suspend fun engineeringIntegration(@Path("id") id: String): Response<EngineeringIntegration>
  @POST("api/engineering-deliveries") suspend fun createEngineering(@Header("X-CSRF-Token") csrf: String, @Body request: EngineeringCreateRequest): Response<EngineeringBuild>
  @POST("api/self-improvement") suspend fun createSelfEngineering(@Header("X-CSRF-Token") csrf: String, @Body request: SelfEngineeringCreateRequest): Response<SelfEngineeringView>
  @POST("api/engineering-deliveries/{id}/{action}") suspend fun engineeringControl(@Path("id") id: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String, String> = emptyMap()): Response<EngineeringBuild>
  @POST("api/engineering-deliveries/{id}/instructions") suspend fun engineeringInstruction(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: EngineeringInstruction): Response<EngineeringBuild>
  @POST("api/engineering-objectives/{id}/clarifications/{clarificationId}/answer") suspend fun engineeringAnswer(@Path("id") id: String, @Path("clarificationId") clarificationId: String, @Header("X-CSRF-Token") csrf: String, @Body request: EngineeringAnswer): Response<EngineeringObjectiveView>
  @POST("api/engineering-deliveries/{id}/preview/{action}") suspend fun engineeringPreview(@Path("id") id: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String, String> = emptyMap()): Response<EngineeringBuild>
  @POST("api/engineering-integrations/{id}/merge") suspend fun engineeringMerge(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: EngineeringMergeRequest): Response<EngineeringIntegration>
  @POST("api/engineering-integrations/{id}/reject") suspend fun engineeringReject(@Path("id") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: EngineeringRejectRequest): Response<EngineeringIntegration>
  @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
  @GET("api/auth/session") suspend fun session(): Response<SessionResponse>
  @GET("api/security/csrf") suspend fun csrf(): Response<CsrfResponse>
  @GET("api/companies") suspend fun companies(): Response<CompanyListResponse>
  @GET("api/portfolio") suspend fun portfolio(): Response<PortfolioDashboard>
  @GET("api/portfolio/economy") suspend fun portfolioEconomy(): Response<PortfolioEconomy>
  @GET("api/portfolio/approvals?status=ALL&limit=100") suspend fun portfolioApprovals(): Response<List<PortfolioApproval>>
  @GET("api/portfolio/search") suspend fun portfolioSearch(@Query("query") query: String, @Query("type") type: String = "ALL", @Query("limit") limit: Int = 30): Response<PortfolioSearchResponse>
  @POST("api/companies/select") suspend fun selectCompany(@Header("X-CSRF-Token") csrf: String, @Body request: SelectCompanyRequest): Response<CompanyListResponse>
  @POST("api/companies") suspend fun createCompany(@Header("X-CSRF-Token") csrf: String, @Body request: CreateCompanyRequest): Response<CompanyListResponse>
  @POST("api/companies/{companyId}/{action}") suspend fun transitionCompany(@Path("companyId") companyId: String, @Path("action") action: String, @Header("X-CSRF-Token") csrf: String, @Body body: Map<String, String> = emptyMap()): Response<CompanyDetailResponse>
  @POST("api/devices/pairing-intents") suspend fun createPairingIntent(@Header("X-CSRF-Token") csrf: String): Response<PairingIntent>
  @POST("api/devices/pairing-requests") suspend fun requestPairing(@Body request: PairingRequest): Response<PairingResponse>
  @POST("api/devices/pairing-status") suspend fun pairingStatus(@Body request: PairingStatusRequest): Response<PairingStatusResponse>
  @POST("api/v1/device/system-summary") suspend fun deviceSummary(@Body envelope: SignedEnvelope): Response<AlexaSummary>
  @GET("api/v1/health") suspend fun health(): Response<ApiHealth>
  @GET("api/objectives") suspend fun objectives(): Response<ObjectiveDashboard>
  @GET("api/agent-workforce/graph") suspend fun workforceGraph(): Response<WorkforceGraph>
  @GET("api/agent-workforce/agents/{agentId}") suspend fun workforceAgent(@Path("agentId") id: String): Response<WorkforceAgentDetail>
  @GET("api/approvals?status=PENDING") suspend fun pendingApprovals(): Response<List<Approval>>
  @GET("api/approvals/{approvalId}") suspend fun approval(@Path("approvalId") id: String): Response<Approval>
  @GET("api/agent-economy/dashboard") suspend fun economy(): Response<EconomyDashboard>
  @GET("api/workflows") suspend fun workflows(): Response<List<Workflow>>
  @GET("api/workflows/{workflowId}") suspend fun workflow(@Path("workflowId") id: String): Response<WorkflowDetail>
  @GET("api/objectives/{objectiveId}/experiments") suspend fun experiments(@Path("objectiveId") id: String): Response<ExperimentDashboard>
  @GET("api/experiments") suspend fun allExperiments(): Response<ExperimentDashboard>
  @GET("api/conversations") suspend fun conversations(): Response<ConversationCenter>
  @POST("api/voice/device-runtime") suspend fun startVoiceSession(@Body envelope: SignedEnvelope): Response<VoiceDashboard>
  @POST("api/voice/device-runtime") suspend fun voiceCaptureLease(@Body envelope: SignedEnvelope): Response<VoiceCaptureLeaseResponse>
  @POST("api/voice/device-runtime") suspend fun submitConversationTurn(@Body envelope: SignedEnvelope): Response<VoiceTranscriptResponse>
  @POST("api/voice/device-runtime") suspend fun cancelConversationTurn(@Body envelope: SignedEnvelope): Response<JsonObject>
  @POST("api/v1/devices/push-token") suspend fun registerPushToken(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<PushRegistrationResponse>
  @HTTP(method = "DELETE", path = "api/v1/devices/push-token", hasBody = true) suspend fun unregisterPushToken(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<PushRegistrationResponse>
  @GET("api/v1/notifications/preferences") suspend fun notificationPreferences(): Response<NotificationPreferencesResponse>
  @PATCH("api/v1/notifications/preferences") suspend fun updateNotificationPreferences(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<NotificationPreferencesResponse>
  @GET("api/v1/attention") suspend fun attention(): Response<ExecutiveAttention>
  @POST("api/v1/device/recent-auth/challenge") suspend fun mobileRecentAuthChallenge(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<RecentAuthChallenge>
  @POST("api/v1/device/recent-auth/verify") suspend fun mobileRecentAuthVerify(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<RecentAuthStatus>
  @POST("api/v1/device/biometric-key") suspend fun registerBiometricKey(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<BiometricKeyRegistrationResponse>
  @POST("api/v1/device/approvals/{approvalId}/decision") suspend fun mobileApprovalDecision(@Path("approvalId") approvalId: String, @Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<Approval>
  @POST("api/v1/device/objectives/{objectiveId}/action") suspend fun mobileObjectiveAction(@Path("objectiveId") objectiveId: String, @Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<ObjectiveDashboard>
  @POST("api/v1/device/objectives") suspend fun mobileObjectiveCreate(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<Any>
  @POST("api/v1/device/objectives/{objectiveId}/modify") suspend fun mobileObjectiveModify(@Path("objectiveId") objectiveId: String, @Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<Any>
  @POST("api/v1/device/cross-device") suspend fun crossDeviceClient(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<CrossDeviceClient>
  @POST("api/v1/device/cross-device") suspend fun crossDeviceUtterance(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<CrossDeviceUtteranceResponse>
  @POST("api/v1/device/cross-device") suspend fun crossDevicePoll(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<CrossDevicePollResponse>
  @POST("api/v1/device/cross-device") suspend fun crossDeviceReceipt(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<CrossDeviceCommand>
  @POST("api/v1/device/cross-device") suspend fun crossDeviceStatus(@Header("X-Device-Id") deviceId: String, @Body envelope: SignedEnvelope): Response<CrossDeviceCommand>
}

class AlexaApiClient private constructor(
  private val service: AlexaApiService,
  private val gson: Gson,
  private val activeCompanyId: AtomicReference<String?>,
) {
  suspend fun engineeringInputs(id: String) = call { service.engineeringInputs(id) }
  suspend fun engineeringUpload(id: String, csrf: String, request: EngineeringProjectInputUpload) = call { service.engineeringUpload(id, csrf, request) }
  suspend fun engineeringConnections() = call { service.engineeringConnections() }
  suspend fun engineeringTool(csrf: String, request: EngineeringToolRequest) = call { service.engineeringTool(csrf, request) }
  suspend fun engineeringDeliveries() = call { service.engineeringDeliveries() }
  suspend fun engineeringProjects() = call { service.engineeringProjects() }
  suspend fun engineeringBuild(id: String) = call { service.engineeringBuild(id) }
  suspend fun engineeringObjective(id: String) = call { service.engineeringObjective(id) }
  suspend fun engineeringIntegration(id: String) = call { service.engineeringIntegration(id) }
  suspend fun createEngineering(csrf: String, request: EngineeringCreateRequest) = call { service.createEngineering(csrf, request) }
  suspend fun createSelfEngineering(csrf: String, request: SelfEngineeringCreateRequest) = call { service.createSelfEngineering(csrf, request) }
  suspend fun engineeringControl(csrf: String, id: String, action: String) = call { service.engineeringControl(id, action, csrf) }
  suspend fun engineeringInstruction(csrf: String, id: String, request: EngineeringInstruction) = call { service.engineeringInstruction(id, csrf, request) }
  suspend fun engineeringAnswer(csrf: String, id: String, clarificationId: String, request: EngineeringAnswer) = call { service.engineeringAnswer(id, clarificationId, csrf, request) }
  suspend fun engineeringPreview(csrf: String, id: String, action: String) = call { service.engineeringPreview(id, action, csrf) }
  suspend fun engineeringMerge(csrf: String, id: String, request: EngineeringMergeRequest) = call { service.engineeringMerge(id, csrf, request) }
  suspend fun engineeringReject(csrf: String, id: String, request: EngineeringRejectRequest) = call { service.engineeringReject(id, csrf, request) }
  suspend fun login(email: String, password: String) = call { service.login(LoginRequest(email, password)) }
  suspend fun session() = call { service.session() }

  suspend fun businessInitiative(id: String, csrf: String, artifact: String, index: Int) = call { service.businessInitiative(id, csrf, mapOf("artifactId" to artifact, "index" to index)) }
  suspend fun businessAnalytics(id: String, csrf: String, metric: String, start: String, end: String) = call { service.businessAnalytics(id, csrf, mapOf("metricId" to metric, "windowStart" to start, "windowEnd" to end)) }
  suspend fun businessCampaigns() = call { service.businessCampaigns() }
  suspend fun businessCampaign(id: String) = call { service.businessCampaign(id) }
  suspend fun businessTelemetry(id: String) = call { service.businessTelemetry(id) }
  suspend fun createBusiness(csrf: String, body: BusinessCreate) = call { service.createBusiness(csrf, body) }
  suspend fun businessControl(id: String, action: String, csrf: String) = call { service.businessControl(id, action, csrf) }
  suspend fun businessReview(id: String, artifact: String, action: String, csrf: String) = call { service.businessReview(id, artifact, action, csrf) }
  suspend fun businessRecover(id: String, deliverable: String, csrf: String) = call { service.businessRecover(id, deliverable, csrf) }
  suspend fun reviewDocumentProvider(csrf: String) = call { service.reviewDocumentProvider(csrf, mapOf("confirm" to "REVIEW_LOCAL_DOCUMENT_CAPABILITIES")) }
  suspend fun documents(q: String) = call { service.documents(q) }
  suspend fun document(id: String) = call { service.document(id) }
  suspend fun documentMemories(id: String) = call { service.documentMemories(id) }
  suspend fun documentSettings() = call { service.documentSettings() }
  suspend fun saveDocumentSettings(csrf: String, body: DocumentSettings) = call { service.saveDocumentSettings(csrf, body) }
  suspend fun createDocument(csrf: String, body: DocumentCreate) = call { service.createDocument(csrf, body) }
  suspend fun documentGrants(id: String, csrf: String) = call { service.documentGrants(id, csrf) }
  suspend fun uploadDocument(id: String, page: Int, csrf: String, body: DocumentUpload) = call { service.uploadDocument(id, page, csrf, body) }
  suspend fun documentAction(id: String, action: String, csrf: String, body: Map<String,Boolean>) = call { service.documentAction(id, action, csrf, body) }
  suspend fun editDocument(id: String, csrf: String, body: Map<String,Any>) = call { service.editDocument(id, csrf, body) }
  suspend fun archiveDocument(id: String, csrf: String) = call { service.archiveDocument(id, csrf) }
  suspend fun documentImage(id: String, page: Int, kind: String) = call { service.documentImage(id, page, kind) }.mapCatching { it.use { response -> check((response.contentLength()) in 0..6291456); response.bytes() } }
  suspend fun documentPdf(id: String) = call { service.documentPdf(id) }.mapCatching { it.use { response -> check(response.contentLength() in 1..33554432); response.bytes().also { b -> check(b.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-") } } }
  suspend fun documentExport(id: String) = call { service.documentExport(id) }.mapCatching { it.use { response -> check(response.contentLength() in 0..1048576); response.bytes() } }
  suspend fun csrf() = call { service.csrf() }
  suspend fun companies() = call { service.companies() }.onSuccess { activeCompanyId.set(it.currentCompany.id) }
  suspend fun portfolio() = call { service.portfolio() }
  suspend fun portfolioEconomy() = call { service.portfolioEconomy() }
  suspend fun portfolioApprovals() = call { service.portfolioApprovals() }
  suspend fun portfolioSearch(query: String, type: String = "ALL") = call { service.portfolioSearch(query, type) }
  suspend fun selectCompany(csrf: String, companyId: String) = call { service.selectCompany(csrf, SelectCompanyRequest(companyId)) }.onSuccess { activeCompanyId.set(it.currentCompany.id) }
  suspend fun createCompany(csrf: String, request: CreateCompanyRequest) = call { service.createCompany(csrf, request) }.onSuccess { activeCompanyId.set(it.currentCompany.id) }
  suspend fun transitionCompany(csrf: String, companyId: String, action: String) = call { service.transitionCompany(companyId, action, csrf) }
  suspend fun createPairingIntent(csrf: String) = call { service.createPairingIntent(csrf) }
  suspend fun requestPairing(request: PairingRequest) = call { service.requestPairing(request) }
  suspend fun pairingStatus(deviceId: String, token: String) = call { service.pairingStatus(PairingStatusRequest(deviceId, token)) }
  suspend fun deviceSummary(envelope: SignedEnvelope) = call { service.deviceSummary(envelope) }
  suspend fun health() = call { service.health() }
  suspend fun objectives() = call { service.objectives() }
  suspend fun workforceGraph() = call { service.workforceGraph() }
  suspend fun workforceAgent(id: String) = call { service.workforceAgent(id) }
  suspend fun pendingApprovals() = call { service.pendingApprovals() }
  suspend fun approval(id: String) = call { service.approval(id) }
  suspend fun economy() = call { service.economy() }
  suspend fun workflows() = call { service.workflows() }
  suspend fun workflow(id: String) = call { service.workflow(id) }
  suspend fun experiments(objectiveId: String) = call { service.experiments(objectiveId) }
  suspend fun allExperiments() = call { service.allExperiments() }
  suspend fun conversations() = call { service.conversations() }
  suspend fun startVoiceSession(envelope: SignedEnvelope) = call { service.startVoiceSession(envelope) }
  suspend fun voiceCaptureLease(envelope: SignedEnvelope) = call { service.voiceCaptureLease(envelope) }
  suspend fun submitConversationTurn(envelope: SignedEnvelope) = call { service.submitConversationTurn(envelope) }
  suspend fun cancelConversationTurn(envelope: SignedEnvelope) = call { service.cancelConversationTurn(envelope) }
  suspend fun registerPushToken(deviceId: String, envelope: SignedEnvelope) = call { service.registerPushToken(deviceId, envelope) }
  suspend fun unregisterPushToken(deviceId: String, envelope: SignedEnvelope) = call { service.unregisterPushToken(deviceId, envelope) }
  suspend fun notificationPreferences() = call { service.notificationPreferences() }
  suspend fun updateNotificationPreferences(deviceId: String, envelope: SignedEnvelope) = call { service.updateNotificationPreferences(deviceId, envelope) }
  suspend fun attention() = call { service.attention() }
  suspend fun mobileRecentAuthChallenge(deviceId: String, envelope: SignedEnvelope) = call { service.mobileRecentAuthChallenge(deviceId, envelope) }
  suspend fun mobileRecentAuthVerify(deviceId: String, envelope: SignedEnvelope) = call { service.mobileRecentAuthVerify(deviceId, envelope) }
  suspend fun registerBiometricKey(deviceId: String, envelope: SignedEnvelope) = call { service.registerBiometricKey(deviceId, envelope) }
  suspend fun mobileApprovalDecision(approvalId: String, deviceId: String, envelope: SignedEnvelope) = call { service.mobileApprovalDecision(approvalId, deviceId, envelope) }
  suspend fun mobileObjectiveAction(objectiveId: String, deviceId: String, envelope: SignedEnvelope) = call { service.mobileObjectiveAction(objectiveId, deviceId, envelope) }
  suspend fun mobileObjectiveCreate(deviceId: String, envelope: SignedEnvelope) = call { service.mobileObjectiveCreate(deviceId, envelope) }
  suspend fun mobileObjectiveModify(objectiveId: String, deviceId: String, envelope: SignedEnvelope) = call { service.mobileObjectiveModify(objectiveId, deviceId, envelope) }
  suspend fun crossDeviceClient(deviceId: String, envelope: SignedEnvelope) = call { service.crossDeviceClient(deviceId, envelope) }
  suspend fun crossDeviceUtterance(deviceId: String, envelope: SignedEnvelope) = call { service.crossDeviceUtterance(deviceId, envelope) }
  suspend fun crossDevicePoll(deviceId: String, envelope: SignedEnvelope) = call { service.crossDevicePoll(deviceId, envelope) }
  suspend fun crossDeviceReceipt(deviceId: String, envelope: SignedEnvelope) = call { service.crossDeviceReceipt(deviceId, envelope) }
  suspend fun crossDeviceStatus(deviceId: String, envelope: SignedEnvelope) = call { service.crossDeviceStatus(deviceId, envelope) }

  private suspend fun <T> call(block: suspend () -> Response<T>): Result<T> = withContext(Dispatchers.IO) {
    try {
      val response = block()
      if (response.isSuccessful) response.body()?.let(Result<T>::success)
        ?: Result.failure(AlexaApiException(AlexaFailure.InvalidResponse))
      else Result.failure(AlexaApiException(response.toFailure(gson)))
    } catch (_: SocketTimeoutException) {
      Result.failure(AlexaApiException(AlexaFailure.Timeout))
    } catch (_: IOException) {
      Result.failure(AlexaApiException(AlexaFailure.NetworkUnavailable))
    } catch (error: AlexaApiException) {
      Result.failure(error)
    } catch (_: Exception) {
      Result.failure(AlexaApiException(AlexaFailure.Unknown("The service returned an unexpected response.")))
    }
  }

  companion object {
    fun create(config: AlexaEnvironmentConfig, sessionStore: SessionStore): AlexaApiClient {
      val gson = Gson()
      val activeCompanyId = AtomicReference<String?>(null)
      val client = OkHttpClient.Builder()
        .cookieJar(SecureCookieJar(sessionStore))
        .addInterceptor(RequestIdentityInterceptor(config.trustedWebOrigin) { activeCompanyId.get() })
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
      return AlexaApiClient(
        Retrofit.Builder()
          .baseUrl(config.apiBaseUrl)
          .client(client)
          .addConverterFactory(GsonConverterFactory.create(gson))
          .build()
          .create(AlexaApiService::class.java),
        gson,
        activeCompanyId,
      )
    }
  }
}

class AlexaApiException(val failure: AlexaFailure) : RuntimeException()

private class RequestIdentityInterceptor(private val origin: String, private val companyId: () -> String?) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
    val builder = chain.request().newBuilder()
      .header("Accept", "application/json")
      .header("X-Request-Id", UUID.randomUUID().toString())
      .header("Origin", origin)
    companyId()?.let { builder.header("X-Company-Id", it) }
    return chain.proceed(builder.build())
  }
}

private class SecureCookieJar(private val sessionStore: SessionStore) : CookieJar {
  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
    cookies.firstOrNull { it.name.startsWith("__Host-") || it.name == "alexa_session" }
      ?.let { sessionStore.saveCookie(it.toString()) }
  }

  override fun loadForRequest(url: HttpUrl): List<Cookie> = sessionStore.cookie()
    ?.let { Cookie.parse(url, it) }
    ?.takeIf { it.matches(url) }
    ?.let(::listOf)
    ?: emptyList()
}

private fun Response<*>.toFailure(gson: Gson): AlexaFailure {
  val serverCode = errorBody().safeCode(gson)
  Log.w(
    "AlexaApiClient",
    "Request rejected: ${raw().request.url.encodedPath} HTTP ${code()} (${serverCode ?: "NO_ERROR_CODE"})",
  )
  if (code() == 401 && serverCode == null) return AlexaFailure.Unauthorized
  if (code() == 429) return AlexaFailure.RateLimited
  if (code() >= 500) return AlexaFailure.ServerUnavailable
  return when (serverCode) {
    // A route can require a different device type without the registered device
    // being revoked. Only an explicit revocation removes local authority.
    "DEVICE_REVOKED" -> AlexaFailure.DeviceRevoked
    "TRUSTED_DEVICE_REQUIRED" -> AlexaFailure.DeviceNotEligible
    // A signed-command error is scoped to that command. It must never discard a
    // valid owner session or make a trusted device appear revoked.
    "INVALID_SIGNATURE", "SIGNED_REQUEST_EXPIRED", "DUPLICATE_NONCE" -> AlexaFailure.SignedRequestRejected
    "RECENT_AUTHENTICATION_REQUIRED" -> AlexaFailure.RecentAuthRequired
    "APPROVAL_EXPIRED", "APPROVAL_ALREADY_DECIDED", "APPROVAL_NOT_FOUND" -> AlexaFailure.ApprovalConflict
    "MERGE_APPROVAL_REQUIRED" -> AlexaFailure.EngineeringApprovalRequired
    else -> if (code() == 401) AlexaFailure.Unauthorized else AlexaFailure.InvalidResponse
  }
}

private fun ResponseBody?.safeCode(gson: Gson): String? = try {
  this?.string()?.let { gson.fromJson(it, JsonObject::class.java) }
    ?.getAsJsonObject("error")?.get("code")?.asString
} catch (_: Exception) { null }
