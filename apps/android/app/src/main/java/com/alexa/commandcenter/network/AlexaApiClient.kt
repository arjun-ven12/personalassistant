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
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.TimeUnit

interface AlexaApiService {
  @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
  @GET("api/auth/session") suspend fun session(): Response<SessionResponse>
  @GET("api/security/csrf") suspend fun csrf(): Response<CsrfResponse>
  @POST("api/devices/pairing-intents") suspend fun createPairingIntent(@Header("X-CSRF-Token") csrf: String): Response<PairingIntent>
  @POST("api/devices/pairing-requests") suspend fun requestPairing(@Body request: PairingRequest): Response<PairingResponse>
  @POST("api/devices/pairing-status") suspend fun pairingStatus(@Body request: PairingStatusRequest): Response<PairingStatusResponse>
  @POST("api/v1/device/system-summary") suspend fun deviceSummary(@Body envelope: SignedEnvelope): Response<AlexaSummary>
  @GET("api/v1/health") suspend fun health(): Response<ApiHealth>
  @GET("api/objectives") suspend fun objectives(): Response<ObjectiveDashboard>
  @GET("api/agent-workforce/graph") suspend fun workforceGraph(): Response<WorkforceGraph>
  @GET("api/agent-workforce/agents/{agentId}") suspend fun workforceAgent(@Path("agentId") id: String): Response<WorkforceAgentDetail>
  @GET("api/approvals?status=PENDING") suspend fun pendingApprovals(): Response<List<Approval>>
  @GET("api/agent-economy/dashboard") suspend fun economy(): Response<EconomyDashboard>
  @GET("api/workflows") suspend fun workflows(): Response<List<Workflow>>
  @GET("api/workflows/{workflowId}") suspend fun workflow(@Path("workflowId") id: String): Response<WorkflowDetail>
  @GET("api/objectives/{objectiveId}/experiments") suspend fun experiments(@Path("objectiveId") id: String): Response<ExperimentDashboard>
  @GET("api/conversations") suspend fun conversations(): Response<ConversationCenter>
  @POST("api/voice/device-runtime") suspend fun startVoiceSession(@Body envelope: SignedEnvelope): Response<VoiceDashboard>
  @POST("api/voice/device-runtime") suspend fun voiceCaptureLease(@Body envelope: SignedEnvelope): Response<VoiceCaptureLeaseResponse>
  @POST("api/voice/device-runtime") suspend fun submitConversationTurn(@Body envelope: SignedEnvelope): Response<VoiceTranscriptResponse>
  @POST("api/voice/device-runtime") suspend fun cancelConversationTurn(@Body envelope: SignedEnvelope): Response<JsonObject>
  @POST("api/objectives") suspend fun createObjective(@Header("X-CSRF-Token") csrf: String, @Body request: CreateObjectiveRequest): Response<Any>
  @POST("api/objectives/{objectiveId}/pause") suspend fun pauseObjective(@Path("objectiveId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ObjectiveMutationRequest): Response<ObjectiveDashboard>
  @POST("api/objectives/{objectiveId}/activate") suspend fun resumeObjective(@Path("objectiveId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ObjectiveMutationRequest): Response<ObjectiveDashboard>
  @POST("api/objectives/{objectiveId}/cancel") suspend fun cancelObjective(@Path("objectiveId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ObjectiveMutationRequest): Response<ObjectiveDashboard>
  @PATCH("api/objectives/{objectiveId}") suspend fun modifyObjective(@Path("objectiveId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ModifyObjectiveRequest): Response<Any>
  @POST("api/approvals/{approvalId}/approve") suspend fun approve(@Path("approvalId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ApprovalDecisionRequest): Response<Approval>
  @POST("api/approvals/{approvalId}/reject") suspend fun reject(@Path("approvalId") id: String, @Header("X-CSRF-Token") csrf: String, @Body request: ApprovalDecisionRequest): Response<Approval>
}

class AlexaApiClient private constructor(
  private val service: AlexaApiService,
  private val gson: Gson,
) {
  suspend fun login(email: String, password: String) = call { service.login(LoginRequest(email, password)) }
  suspend fun session() = call { service.session() }
  suspend fun csrf() = call { service.csrf() }
  suspend fun createPairingIntent(csrf: String) = call { service.createPairingIntent(csrf) }
  suspend fun requestPairing(request: PairingRequest) = call { service.requestPairing(request) }
  suspend fun pairingStatus(deviceId: String, token: String) = call { service.pairingStatus(PairingStatusRequest(deviceId, token)) }
  suspend fun deviceSummary(envelope: SignedEnvelope) = call { service.deviceSummary(envelope) }
  suspend fun health() = call { service.health() }
  suspend fun objectives() = call { service.objectives() }
  suspend fun workforceGraph() = call { service.workforceGraph() }
  suspend fun workforceAgent(id: String) = call { service.workforceAgent(id) }
  suspend fun pendingApprovals() = call { service.pendingApprovals() }
  suspend fun economy() = call { service.economy() }
  suspend fun workflows() = call { service.workflows() }
  suspend fun workflow(id: String) = call { service.workflow(id) }
  suspend fun experiments(objectiveId: String) = call { service.experiments(objectiveId) }
  suspend fun conversations() = call { service.conversations() }
  suspend fun startVoiceSession(envelope: SignedEnvelope) = call { service.startVoiceSession(envelope) }
  suspend fun voiceCaptureLease(envelope: SignedEnvelope) = call { service.voiceCaptureLease(envelope) }
  suspend fun submitConversationTurn(envelope: SignedEnvelope) = call { service.submitConversationTurn(envelope) }
  suspend fun cancelConversationTurn(envelope: SignedEnvelope) = call { service.cancelConversationTurn(envelope) }
  suspend fun createObjective(csrf: String, request: CreateObjectiveRequest) = call { service.createObjective(csrf, request) }
  suspend fun pauseObjective(id: String, csrf: String, request: ObjectiveMutationRequest) = call { service.pauseObjective(id, csrf, request) }
  suspend fun resumeObjective(id: String, csrf: String, request: ObjectiveMutationRequest) = call { service.resumeObjective(id, csrf, request) }
  suspend fun cancelObjective(id: String, csrf: String, request: ObjectiveMutationRequest) = call { service.cancelObjective(id, csrf, request) }
  suspend fun modifyObjective(id: String, csrf: String, request: ModifyObjectiveRequest) = call { service.modifyObjective(id, csrf, request) }
  suspend fun approve(id: String, csrf: String, request: ApprovalDecisionRequest) = call { service.approve(id, csrf, request) }
  suspend fun reject(id: String, csrf: String, request: ApprovalDecisionRequest) = call { service.reject(id, csrf, request) }

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
      val client = OkHttpClient.Builder()
        .cookieJar(SecureCookieJar(sessionStore))
        .addInterceptor(RequestIdentityInterceptor(config.trustedWebOrigin))
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
      )
    }
  }
}

class AlexaApiException(val failure: AlexaFailure) : RuntimeException()

private class RequestIdentityInterceptor(private val origin: String) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
    val request = chain.request().newBuilder()
      .header("Accept", "application/json")
      .header("X-Request-Id", UUID.randomUUID().toString())
      .header("Origin", origin)
      .build()
    return chain.proceed(request)
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
    "INVALID_SIGNATURE", "SIGNED_REQUEST_EXPIRED", "DUPLICATE_NONCE" -> AlexaFailure.Unauthorized
    else -> if (code() == 401) AlexaFailure.Unauthorized else AlexaFailure.InvalidResponse
  }
}

private fun ResponseBody?.safeCode(gson: Gson): String? = try {
  this?.string()?.let { gson.fromJson(it, JsonObject::class.java) }
    ?.getAsJsonObject("error")?.get("code")?.asString
} catch (_: Exception) { null }
