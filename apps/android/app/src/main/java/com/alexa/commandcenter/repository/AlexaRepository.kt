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
  private var crossDeviceRegistered = false
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
    val attention = async { api.attention() }
    val results = listOf(objectives.await(), workforce.await(), approvals.await(), economy.await(), workflows.await(), attention.await())
    val failure = results.firstOrNull { it.isFailure }?.exceptionOrNull()
    if (failure != null) Result.failure(failure) else Result.success(
      CommandCenterSnapshot(
        objectives = objectives.await().getOrNull(),
        workforce = workforce.await().getOrNull(),
        approvals = approvals.await().getOrDefault(emptyList()),
        economy = economy.await().getOrNull(),
        workflows = workflows.await().getOrDefault(emptyList()),
        attention = attention.await().getOrDefault(ExecutiveAttention()),
      ),
    )
  }

  suspend fun workforceAgent(id: String): Result<WorkforceAgentDetail> = api.workforceAgent(id)
  suspend fun approval(id: String): Result<Approval> = api.approval(id)
  suspend fun workflow(id: String): Result<WorkflowDetail> = api.workflow(id)
  suspend fun experiments(objectiveId: String): Result<ExperimentDashboard> = if (objectiveId == "__all__") api.allExperiments() else api.experiments(objectiveId)

  suspend fun conversations(): Result<ConversationCenter> = api.conversations()
    .onSuccess { cache.save(CONVERSATION_CACHE_KEY, gson.toJson(it), System.currentTimeMillis()) }
    .onFailure(::clearOnRevocation)

  suspend fun syncCrossDeviceClient(): Result<CrossDevicePollResponse> {
    val clientInstanceId = registrationStore.clientInstanceId()
    if (!crossDeviceRegistered) {
      val register = signedDeviceRequest(
        payload = mapOf(
          "operation" to JsonPrimitive("register"),
          "request" to gson.toJsonTree(
            mapOf(
              "clientInstanceId" to clientInstanceId,
              "clientType" to "ANDROID",
              "displayName" to "Alexa Android",
              "platform" to "Android",
              "capabilities" to listOf("SHOW_SCREEN", "OPEN_OBJECTIVE", "OPEN_AGENT", "OPEN_WORKFLOW", "OPEN_APPROVAL", "OPEN_CONVERSATION"),
              "currentRoute" to null,
            ),
          ),
        ),
        request = api::crossDeviceClient,
      )
      if (register.isFailure) return Result.failure(register.exceptionOrNull()!!)
      crossDeviceRegistered = true
    }
    return signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("poll"),
        "request" to gson.toJsonTree(mapOf("clientInstanceId" to clientInstanceId, "limit" to 5)),
      ),
      request = api::crossDevicePoll,
    )
  }

  suspend fun routeCrossDeviceUtterance(utterance: String, conversationId: String?): Result<CrossDeviceUtteranceResponse> {
    if (!crossDeviceRegistered) {
      val synced = syncCrossDeviceClient()
      if (synced.isFailure) return Result.failure(synced.exceptionOrNull()!!)
    }
    return signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("utterance"),
        "request" to gson.toJsonTree(
          mapOf(
            "utterance" to utterance,
            "clientInstanceId" to registrationStore.clientInstanceId(),
            "clientType" to "ANDROID",
            "conversationId" to conversationId,
            "currentRoute" to null,
            "idempotencyKey" to UUID.randomUUID().toString(),
          ),
        ),
      ),
      request = api::crossDeviceUtterance,
    )
  }

  suspend fun completeCrossDeviceCommand(commandId: String, succeeded: Boolean, message: String): Result<CrossDeviceCommand> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("receipt"),
        "request" to gson.toJsonTree(
          mapOf(
            "clientInstanceId" to registrationStore.clientInstanceId(),
            "commandId" to commandId,
            "status" to if (succeeded) "SUCCEEDED" else "FAILED",
            "failureCode" to if (succeeded) null else "CAPABILITY_UNAVAILABLE",
            "safeMessage" to message,
          ),
        ),
      ),
      request = api::crossDeviceReceipt,
    )

  suspend fun acknowledgeCrossDeviceCommand(commandId: String): Result<CrossDeviceCommand> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("receipt"),
        "request" to gson.toJsonTree(
          mapOf(
            "clientInstanceId" to registrationStore.clientInstanceId(),
            "commandId" to commandId,
            "status" to "ACKNOWLEDGED",
            "failureCode" to null,
            "safeMessage" to "Alexa Android acknowledged the command.",
          ),
        ),
      ),
      request = api::crossDeviceReceipt,
    )

  suspend fun crossDeviceCommandStatus(commandId: String): Result<CrossDeviceCommand> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("status"),
        "commandId" to JsonPrimitive(commandId),
      ),
      request = api::crossDeviceStatus,
    )

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

  suspend fun createObjective(request: CreateObjectiveRequest): Result<Unit> = signedDeviceRequest(
    payload = mapOf(
      "operation" to JsonPrimitive("objective_create"),
      "request" to gson.toJsonTree(request),
    ),
    request = api::mobileObjectiveCreate,
  ).map { Unit }

  suspend fun transitionObjective(objectiveId: String, action: String): Result<ObjectiveDashboard> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("objective_action"),
        "objectiveId" to JsonPrimitive(objectiveId),
        "action" to JsonPrimitive(action),
        "idempotencyKey" to JsonPrimitive(UUID.randomUUID().toString()),
      ),
      request = { deviceId, envelope -> api.mobileObjectiveAction(objectiveId, deviceId, envelope) },
    )

  suspend fun modifyObjective(objectiveId: String, budgetCredits: Int?, priority: String?): Result<Unit> =
    signedDeviceRequest(
      payload = buildMap {
        put("operation", JsonPrimitive("objective_modify"))
        put("objectiveId", JsonPrimitive(objectiveId))
        put("idempotencyKey", JsonPrimitive(UUID.randomUUID().toString()))
        budgetCredits?.let { put("budgetCredits", JsonPrimitive(it)) }
        priority?.let { put("priority", JsonPrimitive(it)) }
      },
      request = { deviceId, envelope -> api.mobileObjectiveModify(objectiveId, deviceId, envelope) },
    ).map { Unit }

  suspend fun decideApproval(approvalId: String, approve: Boolean, reason: String? = null): Result<Approval> =
    signedDeviceRequest(
      payload = buildMap {
        put("operation", JsonPrimitive("approval_decision"))
        put("approvalId", JsonPrimitive(approvalId))
        put("decision", JsonPrimitive(if (approve) "APPROVE" else "REJECT"))
        reason?.takeIf { it.isNotBlank() }?.let { put("reason", JsonPrimitive(it.trim())) }
      },
      request = { deviceId, envelope -> api.mobileApprovalDecision(approvalId, deviceId, envelope) },
    )

  suspend fun registerPushToken(token: String, appVersion: String): Result<PushRegistrationResponse> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("register_push_token"),
        "pushToken" to JsonPrimitive(token),
        "platform" to JsonPrimitive("ANDROID"),
        "appVersion" to JsonPrimitive(appVersion),
      ),
      request = api::registerPushToken,
    )

  suspend fun unregisterPushToken(): Result<PushRegistrationResponse> = signedDeviceRequest(
    payload = mapOf("operation" to JsonPrimitive("unregister_push_token")),
    request = api::unregisterPushToken,
  )

  suspend fun notificationPreferences(): Result<NotificationPreferencesResponse> = api.notificationPreferences()

  suspend fun updateNotificationPreferences(preferences: NotificationPreferences): Result<NotificationPreferencesResponse> =
    signedDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("update_notification_preferences"),
        "preferences" to gson.toJsonTree(preferences),
      ),
      request = api::updateNotificationPreferences,
    )

  suspend fun beginMobileRecentAuth(): Result<RecentAuthChallenge> = signedDeviceRequest(
    payload = mapOf(
      "operation" to JsonPrimitive("mobile_recent_auth_challenge"),
      "purpose" to JsonPrimitive("approve_high_risk_action"),
    ),
    request = api::mobileRecentAuthChallenge,
  )

  suspend fun verifyMobileRecentAuth(challenge: RecentAuthChallenge, biometricSignature: String): Result<RecentAuthStatus> = signedDeviceRequest(
    payload = mapOf(
      "operation" to JsonPrimitive("mobile_recent_auth_verify"),
      "challengeId" to JsonPrimitive(challenge.challengeId),
      "challengeToken" to JsonPrimitive(challenge.challengeToken),
      "biometricSignature" to JsonPrimitive(biometricSignature),
    ),
    request = api::mobileRecentAuthVerify,
  )

  suspend fun registerBiometricKey(publicKey: PublicKeyJwk): Result<BiometricKeyRegistrationResponse> = signedDeviceRequest(
    payload = mapOf(
      "operation" to JsonPrimitive("register_mobile_biometric_key"),
      "publicKey" to gson.toJsonTree(publicKey),
    ),
    request = api::registerBiometricKey,
  )

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
    crossDeviceRegistered = false
    sessionStore.clear()
    registrationStore.clear()
    deviceIdentity.delete()
  }

  private fun clearOnRevocation(error: Throwable) {
    if ((error as? AlexaApiException)?.failure == AlexaFailure.DeviceRevoked) clearAuthority()
  }

  private suspend fun <T> signedVoiceRequest(
    payload: Map<String, JsonElement>,
    request: suspend (SignedEnvelope) -> Result<T>,
  ): Result<T> {
    return signedDeviceRequest(payload) { _, envelope -> request(envelope) }
  }

  private suspend fun <T> signedDeviceRequest(
    payload: Map<String, JsonElement>,
    request: suspend (String, SignedEnvelope) -> Result<T>,
  ): Result<T> {
    val device = registrationStore.load()?.takeIf { it.trustStatus == DeviceTrustStatus.TRUSTED }
      ?: return Result.failure(AlexaApiException(AlexaFailure.Unauthorized))
    if (runCatching { deviceIdentity.fingerprint() }.getOrNull() != device.fingerprint) {
      clearAuthority()
      return Result.failure(AlexaApiException(AlexaFailure.DeviceRevoked))
    }
    return runCatching { deviceIdentity.signEnvelope(device.deviceId, payload) }
      .fold(
        onSuccess = { envelope -> request(device.deviceId, envelope).onFailure(::clearOnRevocation) },
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
