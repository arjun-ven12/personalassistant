package com.alexa.commandcenter.repository

import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.network.AlexaApiClient
import com.alexa.commandcenter.network.AlexaApiException
import com.alexa.commandcenter.security.AndroidDeviceIdentity
import com.alexa.commandcenter.security.DeviceRegistrationStore
import com.alexa.commandcenter.security.SecureCache
import com.alexa.commandcenter.security.SessionStore
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonPrimitive
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.util.UUID

class AlexaRepository(
  private val api: AlexaApiClient,
  private val deviceIdentity: AndroidDeviceIdentity,
  private val registrationStore: DeviceRegistrationStore,
  private val sessionStore: SessionStore,
  private val cache: SecureCache,
  private val gson: Gson = Gson(),
) {
  suspend fun login(email: String, password: String): Result<Owner> = api.login(email, password).map { it.user }

  suspend fun session(): Result<Owner> = api.session().mapCatching { session ->
    session.user ?: error("The server did not return an owner session.")
  }

  suspend fun beginPairing(): Result<PairingIntent> = api.csrf().fold(
    onSuccess = { api.createPairingIntent(it.token) },
    onFailure = Result<PairingIntent>::failure,
  )

  suspend fun registerDevice(pairingCode: String, deviceName: String): Result<DeviceRegistration> = runCatching {
    PairingRequest(
      pairingCode = pairingCode.trim().uppercase(),
      deviceName = deviceName.trim(),
      publicKey = deviceIdentity.publicKey(),
    )
  }.fold(
    onSuccess = { request -> api.requestPairing(request).map { response ->
      DeviceRegistration(response.deviceId, deviceIdentity.fingerprint(), DeviceTrustStatus.PENDING, response.pairingRequestToken)
        .also(registrationStore::save)
    } },
    onFailure = { Result.failure(AlexaApiException(AlexaFailure.InvalidResponse)) },
  )

  suspend fun refreshTrust(): Result<DeviceRegistration> {
    val stored = registrationStore.load() ?: return Result.failure(AlexaApiException(AlexaFailure.Unauthorized))
    val token = stored.pairingRequestToken ?: return Result.success(stored)
    return api.pairingStatus(stored.deviceId, token).map { status ->
      stored.copy(
        fingerprint = status.fingerprint,
        trustStatus = DeviceTrustStatus.valueOf(status.trustStatus),
        pairingRequestToken = if (status.trustStatus == "TRUSTED") null else token,
      ).also(registrationStore::save)
    }
  }

  suspend fun refreshSummary(): Result<AlexaSummary> {
    val device = registrationStore.load()?.takeIf { it.trustStatus == DeviceTrustStatus.TRUSTED }
      ?: return Result.failure(AlexaApiException(AlexaFailure.Unauthorized))
    val localFingerprint = runCatching { deviceIdentity.fingerprint() }.getOrElse {
      clearAuthority()
      return Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
    }
    if (device.fingerprint != localFingerprint) {
      clearAuthority()
      return Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
    }
    val envelope = runCatching {
      deviceIdentity.signEnvelope(device.deviceId, mapOf("operation" to JsonPrimitive("system_summary")))
    }.getOrElse {
      // A stale or incompatible hardware-backed key must never be reused as authority.
      clearAuthority()
      return Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
    }
    return api.deviceSummary(envelope)
      .onSuccess { cache.save("summary", gson.toJson(it), System.currentTimeMillis()) }
      .onFailure(::clearOnRevocation)
  }

  suspend fun refreshHealth(): Result<ApiHealth> = api.health().onSuccess {
    cache.save("health", gson.toJson(it), System.currentTimeMillis())
  }

  suspend fun commandCenter(): Result<CommandCenterSnapshot> = coroutineScope {
    val objectives = async { api.objectives() }
    val workforce = async { api.workforceGraph() }
    val approvals = async { api.pendingApprovals() }
    val economy = async { api.economy() }
    val workflows = async { api.workflows() }
    val results = listOf(objectives.await(), workforce.await(), approvals.await(), economy.await(), workflows.await())
    val failure = results.firstOrNull { it.isFailure }?.exceptionOrNull()
    if (failure != null) Result.failure(failure) else Result.success(
      CommandCenterSnapshot(
        objectives = objectives.await().getOrNull(),
        workforce = workforce.await().getOrNull(),
        approvals = approvals.await().getOrDefault(emptyList()),
        economy = economy.await().getOrNull(),
        workflows = workflows.await().getOrDefault(emptyList()),
      ),
    )
  }

  suspend fun workforceAgent(id: String): Result<WorkforceAgentDetail> = api.workforceAgent(id)
  suspend fun workflow(id: String): Result<WorkflowDetail> = api.workflow(id)
  suspend fun experiments(objectiveId: String): Result<ExperimentDashboard> = api.experiments(objectiveId)

  suspend fun conversations(): Result<ConversationCenter> = api.conversations()
    .onSuccess { cache.save(CONVERSATION_CACHE_KEY, gson.toJson(it), System.currentTimeMillis()) }
    .onFailure(::clearOnRevocation)

  suspend fun startConversation(): Result<VoiceDashboard> = signedVoiceRequest(
    payload = mapOf(
      "operation" to JsonPrimitive("start_session"),
      "session" to gson.toJsonTree(
        mapOf(
          "microphoneDeviceId" to null,
          "wakeWordEnabled" to false,
          "reuseActiveSession" to false,
        ),
      ),
    ),
    request = api::startVoiceSession,
  )

  suspend fun acquireVoiceCapture(voiceSessionId: String): Result<VoiceCaptureLeaseResponse> =
    signedVoiceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("capture_lease"),
        "action" to JsonPrimitive("acquire"),
        "voiceSessionId" to JsonPrimitive(voiceSessionId),
      ),
      request = api::voiceCaptureLease,
    )

  suspend fun releaseVoiceCapture(voiceSessionId: String): Result<VoiceCaptureLeaseResponse> =
    signedVoiceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("capture_lease"),
        "action" to JsonPrimitive("release"),
        "voiceSessionId" to JsonPrimitive(voiceSessionId),
      ),
      request = api::voiceCaptureLease,
    )

  suspend fun submitConversationTurn(turn: PendingConversationTurn): Result<VoiceTranscriptResponse> =
    acquireVoiceCapture(turn.voiceSessionId).fold(
      onSuccess = { lease ->
        if (lease.status != "ACQUIRED") {
          Result.failure(AlexaApiException(AlexaFailure.Unknown("Voice capture is active on another trusted client.")))
        } else {
          signedVoiceRequest(
            payload = mapOf(
              "operation" to JsonPrimitive("submit_transcript"),
              "transcript" to gson.toJsonTree(
                mapOf(
                  "sessionId" to turn.voiceSessionId,
                  "turnId" to turn.turnId,
                  "transcript" to turn.transcript,
                  "isFinal" to true,
                  "confidence" to turn.confidence,
                  "language" to turn.language,
                  "wakeWordDetected" to false,
                  "source" to "android",
                ),
              ),
            ),
            request = api::submitConversationTurn,
          ).onSuccess { response ->
            val center = ConversationCenter(
              sessions = response.dashboard.conversationSessions,
              history = response.dashboard.conversationHistory,
            )
            cache.save(CONVERSATION_CACHE_KEY, gson.toJson(center), System.currentTimeMillis())
          }.also {
            // The lease protects one submitted turn, not the entire conversation.
            // Ignore release errors so an already-completed turn is never retried.
            releaseVoiceCapture(turn.voiceSessionId)
          }
        }
      },
      onFailure = Result<VoiceTranscriptResponse>::failure,
    )

  suspend fun cancelConversationTurn(turnId: String, voiceSessionId: String?): Result<Unit> =
    signedVoiceRequest(
      payload = buildMap {
        put("operation", JsonPrimitive("cancel_turn"))
        put("turnId", JsonPrimitive(turnId))
        voiceSessionId?.let { put("sessionId", JsonPrimitive(it)) }
        put("reason", JsonPrimitive("owner_stop"))
      },
      request = api::cancelConversationTurn,
    ).map { Unit }

  suspend fun createObjective(request: CreateObjectiveRequest): Result<Unit> = withCsrf { csrf ->
    api.createObjective(csrf, request).map { Unit }
  }

  suspend fun transitionObjective(objectiveId: String, action: String): Result<ObjectiveDashboard> = withCsrf { csrf ->
    val mutation = ObjectiveMutationRequest(UUID.randomUUID().toString())
    when (action) {
      "pause" -> api.pauseObjective(objectiveId, csrf, mutation)
      "resume" -> api.resumeObjective(objectiveId, csrf, mutation)
      "cancel" -> api.cancelObjective(objectiveId, csrf, mutation)
      else -> Result.failure(IllegalArgumentException("Unsupported objective action."))
    }
  }

  suspend fun modifyObjective(objectiveId: String, budgetCredits: Int?, priority: String?): Result<Unit> = withCsrf { csrf ->
    api.modifyObjective(objectiveId, csrf, ModifyObjectiveRequest(UUID.randomUUID().toString(), budgetCredits, priority)).map { Unit }
  }

  suspend fun decideApproval(approvalId: String, approve: Boolean, reason: String? = null): Result<Approval> = withCsrf { csrf ->
    val request = ApprovalDecisionRequest(reason)
    if (approve) api.approve(approvalId, csrf, request) else api.reject(approvalId, csrf, request)
  }

  fun cachedSummary(): Pair<AlexaSummary, Long>? = cache.read("summary")?.let {
    runCatching { gson.fromJson(it.json, AlexaSummary::class.java) to it.updatedAt }.getOrNull()
  }
  fun cachedHealth(): Pair<ApiHealth, Long>? = cache.read("health")?.let {
    runCatching { gson.fromJson(it.json, ApiHealth::class.java) to it.updatedAt }.getOrNull()
  }
  fun cachedConversations(): Pair<ConversationCenter, Long>? = cache.read(CONVERSATION_CACHE_KEY)?.let {
    runCatching { gson.fromJson(it.json, ConversationCenter::class.java) to it.updatedAt }.getOrNull()
  }
  fun registration() = registrationStore.load()
  fun hasSession() = sessionStore.cookie() != null

  fun clearSession() = sessionStore.clear()

  fun clearAuthority() {
    sessionStore.clear()
    registrationStore.clear()
    deviceIdentity.delete()
  }

  private suspend fun <T> withCsrf(action: suspend (String) -> Result<T>): Result<T> = api.csrf().fold(
    onSuccess = { action(it.token) },
    onFailure = Result<T>::failure,
  )

  private fun clearOnRevocation(error: Throwable) {
    if ((error as? AlexaApiException)?.failure == AlexaFailure.DeviceRevoked) clearAuthority()
  }

  private suspend fun <T> signedVoiceRequest(
    payload: Map<String, JsonElement>,
    request: suspend (SignedEnvelope) -> Result<T>,
  ): Result<T> {
    val device = registrationStore.load()?.takeIf { it.trustStatus == DeviceTrustStatus.TRUSTED }
      ?: return Result.failure(AlexaApiException(AlexaFailure.Unauthorized))
    if (runCatching { deviceIdentity.fingerprint() }.getOrNull() != device.fingerprint) {
      clearAuthority()
      return Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
    }
    return runCatching { deviceIdentity.signEnvelope(device.deviceId, payload) }
      .fold(
        onSuccess = { envelope -> request(envelope).onFailure(::clearOnRevocation) },
        onFailure = {
          clearAuthority()
          Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
        },
      )
  }

  private companion object {
    const val CONVERSATION_CACHE_KEY = "conversations"
  }
}
