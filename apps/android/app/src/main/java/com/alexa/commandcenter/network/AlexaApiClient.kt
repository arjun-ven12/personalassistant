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
import retrofit2.http.HTTP
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

interface AlexaApiService {
  @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
  @GET("api/auth/session") suspend fun session(): Response<SessionResponse>
  @GET("api/security/csrf") suspend fun csrf(): Response<CsrfResponse>
  @GET("api/companies") suspend fun companies(): Response<CompanyListResponse>
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
  suspend fun login(email: String, password: String) = call { service.login(LoginRequest(email, password)) }
  suspend fun session() = call { service.session() }
  suspend fun csrf() = call { service.csrf() }
  suspend fun companies() = call { service.companies() }.onSuccess { activeCompanyId.set(it.currentCompany.id) }
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
    else -> if (code() == 401) AlexaFailure.Unauthorized else AlexaFailure.InvalidResponse
  }
}

private fun ResponseBody?.safeCode(gson: Gson): String? = try {
  this?.string()?.let { gson.fromJson(it, JsonObject::class.java) }
    ?.getAsJsonObject("error")?.get("code")?.asString
} catch (_: Exception) { null }
