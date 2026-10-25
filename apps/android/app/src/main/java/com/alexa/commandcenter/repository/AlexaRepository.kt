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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
  private var activeCompanyId: String? = null
  private val companyGate = Mutex()

  val businessActions = com.alexa.commandcenter.business.BusinessActions(
    company = { activeCompanyId },
    projects = {
      val company = activeCompanyId
      api.engineeringProjects().mapCatching { result -> check(company != null && activeCompanyId == company && result.projects.size <= 100 && result.projects.all { it.companyId == company && EngineeringSafety.validId(it.repositoryId) }); result.projects.filter { it.repositoryStatus == "ACTIVE" } }
    },
    list = {
      val company = activeCompanyId
      api.businessCampaigns().mapCatching { response -> check(company != null && activeCompanyId == company && response.campaigns.size <= 100 && response.campaigns.all { BusinessSafety.valid(it, company) }); response.campaigns }
    },
    get = { id ->
      val company = activeCompanyId
      check(EngineeringSafety.validId(id))
      api.businessCampaign(id).mapCatching { check(company != null && activeCompanyId == company && it.campaign.id == id && BusinessSafety.valid(it, company)); it }
    },
    create = { body ->
      val company = activeCompanyId
      engineeringMutation { csrf -> api.createBusiness(csrf, body) }.mapCatching { check(company != null && activeCompanyId == company && BusinessSafety.valid(it, company)); it }
    },
    control = { id, action ->
      check(EngineeringSafety.validId(id) && action in setOf("start", "pause", "cancel"))
      engineeringMutation { csrf -> api.businessControl(id, action, csrf) }.map { Unit }
    },
    telemetry = { id ->
      check(EngineeringSafety.validId(id))
      val company = activeCompanyId
      api.businessTelemetry(id).mapCatching { check(company != null && activeCompanyId == company && it.campaignId == id && it.modelCalls >= 0); it }
    },
    review = { id, artifact, action ->
      check(EngineeringSafety.validId(id) && EngineeringSafety.validId(artifact) && action in setOf("request", "finalize"))
      engineeringMutation { csrf -> api.businessReview(id, artifact, action, csrf) }.map { Unit }
    },
    analytics = { id, metric, start, end ->
      check(EngineeringSafety.validId(id) && metric in setOf("activeUsers", "sessions", "screenPageViews", "engagedSessions"))
      val company = activeCompanyId
      engineeringMutation { csrf -> api.businessAnalytics(id, csrf, metric, start, end) }.mapCatching { check(company != null && activeCompanyId == company && it.companyId == company && it.campaignId == id); Unit }
    },
    initiative = { id, artifact, index ->
      check(EngineeringSafety.validId(id) && EngineeringSafety.validId(artifact) && index in 0..5)
      engineeringMutation { csrf -> api.businessInitiative(id, csrf, artifact, index) }.map { Unit }
    },
    recover = { id, deliverable ->
      check(EngineeringSafety.validId(id) && EngineeringSafety.validId(deliverable))
      engineeringMutation { csrf -> api.businessRecover(id, deliverable, csrf) }.map { Unit }
    },
  )

  suspend fun reviewDocumentProvider() = engineeringMutation { csrf -> api.reviewDocumentProvider(csrf) }
  fun documentCompany(): String? = activeCompanyId
  suspend fun documents(q: String): Result<List<AthenaDocument>> {
    val company = activeCompanyId ?: return Result.failure(IllegalStateException("Select a company"))
    return api.documents(q.take(200)).mapCatching { response -> check(activeCompanyId == company && response.documents.size <= 100 && response.documents.all { DocumentSafety.valid(it, company) }); response.documents }
  }
  suspend fun document(id: String): Result<AthenaDocument> = api.document(id).mapCatching { check(DocumentSafety.valid(it, activeCompanyId ?: "")); it }
  suspend fun createDocument(body: DocumentCreate) = engineeringMutation { csrf -> api.createDocument(csrf, body) }
  suspend fun documentGrants(id: String) = engineeringMutation { csrf -> api.documentGrants(id, csrf) }
  suspend fun uploadDocument(id: String, page: Int, body: DocumentUpload) = engineeringMutation { csrf -> api.uploadDocument(id, page, csrf, body) }
  suspend fun documentAction(id: String, action: String, never: Boolean = false): Result<AthenaDocument> {
    if (action !in setOf("process", "reprocess", "memory", "exclude-memory", "archive")) return Result.failure(IllegalArgumentException("Unknown document action"))
    return engineeringMutation { csrf -> if (action == "archive") api.archiveDocument(id, csrf) else api.documentAction(id, action, csrf, if (action == "exclude-memory") mapOf("never" to never) else emptyMap()) }
  }
  suspend fun editDocument(id: String, title: String, tags: List<String>, collection: String) = engineeringMutation { csrf -> api.editDocument(id, csrf, mapOf("title" to title.take(160), "tags" to tags.take(12), "collection" to collection)) }
  suspend fun documentMemories(id: String) = api.documentMemories(id).mapCatching { check(it.documentId == id && it.memories.size <= 15 && it.memories.all { memory -> EngineeringSafety.validId(memory.id) && memory.page in 1..5 }); it }
  suspend fun documentSettings() = api.documentSettings()
  suspend fun saveDocumentSettings(settings: DocumentSettings) = engineeringMutation { csrf -> api.saveDocumentSettings(csrf, settings) }
  suspend fun documentImage(id: String, page: Int, kind: String) = api.documentImage(id, page, kind)
  suspend fun documentExport(id: String) = api.documentExport(id)
  suspend fun engineeringInputs(id: String): Result<List<EngineeringProjectInput>> = api.engineeringInputs(id).mapCatching { response ->
    check(response.inputs.size <= 12 && response.inputs.all { it.objectiveId == id && EngineeringSafety.validId(it.id) && it.provenance == "OWNER_UPLOADED_UNTRUSTED" && it.byteLength in 1..262144 && it.sha256.matches(Regex("[a-f0-9]{64}")) })
    response.inputs
  }
  suspend fun engineeringUpload(id: String, fileName: String, mimeType: String, bytes: ByteArray): Result<EngineeringProjectInput> = engineeringMutation { csrf ->
    runCatching {
      check(EngineeringSafety.validId(id) && bytes.size in 1..262144 && mimeType in setOf("image/png", "image/jpeg", "text/plain"))
      val digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
      val key = engineeringIdempotencyKey("input:$id", "$fileName:$mimeType:$digest")
      val result = api.engineeringUpload(id, csrf, EngineeringProjectInputUpload(fileName, mimeType, android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP), key)).getOrThrow()
      check(result.objectiveId == id && result.sha256 == digest && result.byteLength == bytes.size && result.provenance == "OWNER_UPLOADED_UNTRUSTED")
      result
    }
  }
  fun engineeringIdempotencyKey(kind: String, body: String): String {
    val hash = java.security.MessageDigest.getInstance("SHA-256").digest("$kind:$body".toByteArray()).joinToString("") { "%02x".format(it) }
    val key = scopedCacheKey("engineering-request:$hash") ?: error("Trusted company session is required.")
    return cache.read(key)?.json?.takeIf(EngineeringSafety::validId) ?: UUID.randomUUID().toString().also { cache.save(key, it, System.currentTimeMillis()) }
  }
  suspend fun engineeringGitHubBindings(): Result<List<EngineeringGitHubBinding>> = runCatching {
    val company = activeCompanyId ?: error("Select a company.")
    api.engineeringConnections().getOrThrow().integrations.take(500).filter {
      it.companyId == company && it.provider == "github" && it.status == "READY" && it.credentialRef?.let(EngineeringSafety::validId) == true
    }.distinctBy { it.credentialRef }.also { check(activeCompanyId == company) }
  }
  suspend fun engineeringGitHubTool(name: String, args: Map<String, Any>, key: String, approvalId: String?): Result<EngineeringToolResult> = engineeringMutation { csrf -> runCatching {
    check(name in setOf("list_repositories", "register_repository", "create_repository"))
    val credential = args["credentialReferenceId"] as? String ?: error("Select a company credential.")
    val binding = engineeringGitHubBindings().getOrThrow().firstOrNull { it.credentialRef == credential } ?: error("Company connection changed.")
    val provider = binding.integrationId.takeIf { it.matches(Regex("engineering\\.github(?:\\.[a-z0-9_-]{3,80})?")) } ?: "engineering.github"
    val result = api.engineeringTool(csrf, EngineeringToolRequest(key, "$provider:$name", args, approvalId, key, java.time.Instant.now().toString())).getOrThrow()
    check(result.invocationId == key && result.toolId == "$provider:$name" && result.providerId == provider)
    result
  } }
  suspend fun engineeringSnapshot(): Result<EngineeringSnapshot> {
    val scope = activeCompanyId ?: return Result.failure(IllegalStateException("Select a company."))
    return coroutineScope {
      val deliveries = async { api.engineeringDeliveries() }
      val projects = async { api.engineeringProjects() }
      runCatching {
        val snapshot = EngineeringSnapshot(scope, deliveries.await().getOrThrow().deliveries,
          projects.await().getOrThrow().projects, System.currentTimeMillis())
        check(activeCompanyId == scope && EngineeringSafety.snapshotMatches(snapshot, scope))
        scopedCacheKey("engineering")?.let { cache.save(it, gson.toJson(snapshot), snapshot.updatedAt) }
        snapshot
      }
    }
  }
  fun cachedEngineering(): EngineeringSnapshot? = runCatching {
    val scope = activeCompanyId ?: return null
    val cached = scopedCacheKey("engineering")?.let(cache::read) ?: return null
    gson.fromJson(cached.json, EngineeringSnapshot::class.java).takeIf { EngineeringSafety.snapshotMatches(it, scope) }
  }.getOrNull()
  suspend fun engineeringBuild(id: String): Result<EngineeringBuild> {
    val scope = activeCompanyId ?: return Result.failure(IllegalStateException("Select a company."))
    return api.engineeringBuild(id).mapCatching { check(activeCompanyId == scope && EngineeringSafety.buildMatches(it, scope, id)); it }
  }
  suspend fun engineeringObjective(id: String) = api.engineeringObjective(id).mapCatching {
    check(it.objective.id == id && it.objective.companyId == activeCompanyId); it
  }
  suspend fun engineeringIntegration(id: String) = api.engineeringIntegration(id).mapCatching {
    check(it.candidate == null || it.candidate.companyId == activeCompanyId); it
  }
  private suspend fun <T> engineeringMutation(work: suspend (String) -> Result<T>): Result<T> = companyGate.withLock {
    val company = activeCompanyId ?: return@withLock Result.failure(IllegalStateException("Select a company."))
    if (!hasSession() || registration()?.trustStatus != DeviceTrustStatus.TRUSTED)
      return@withLock Result.failure(AlexaApiException(AlexaFailure.Unauthorized))
    api.csrf().fold(onSuccess = {
      if (activeCompanyId != company) Result.failure(IllegalStateException("Company changed; review before retrying."))
      else work(it.token).onFailure(::clearOnRevocation)
    }, onFailure = Result<T>::failure)
  }
  suspend fun createEngineering(request: EngineeringCreateRequest, self: Boolean) = engineeringMutation { csrf ->
    if (self) api.createSelfEngineering(csrf, SelfEngineeringCreateRequest(request.request, request.acceptanceCriteria, request.idempotencyKey)).map { it.controlCenter }
    else api.createEngineering(csrf, request)
  }
  suspend fun engineeringControl(id: String, action: String): Result<EngineeringBuild> {
    if (action !in setOf("pause", "resume", "recover", "cancel")) return Result.failure(IllegalArgumentException("Unknown control"))
    return engineeringMutation { api.engineeringControl(it, id, action) }
  }
  suspend fun engineeringInstruction(id: String, request: EngineeringInstruction) = engineeringMutation { api.engineeringInstruction(it, id, request) }
  suspend fun engineeringAnswer(id: String, clarificationId: String, request: EngineeringAnswer) = engineeringMutation { api.engineeringAnswer(it, id, clarificationId, request) }
  suspend fun engineeringPreview(id: String, action: String): Result<EngineeringBuild> {
    if (action !in setOf("status", "restart", "stop")) return Result.failure(IllegalArgumentException("Unknown preview control"))
    return engineeringMutation { api.engineeringPreview(it, id, action) }
  }
  suspend fun engineeringMerge(id: String, key: String) = engineeringMutation { api.engineeringMerge(it, id, EngineeringMergeRequest(key)) }
  suspend fun engineeringReject(id: String, reason: String?) = engineeringMutation { api.engineeringReject(it, id, EngineeringRejectRequest(reason)) }
  suspend fun login(email: String, password: String): Result<Owner> = api.login(email, password).map { it.user }

  suspend fun session(): Result<Owner> = api.session().mapCatching { session ->
    session.user ?: error("The server did not return an owner session.")
  }

  suspend fun companies(): Result<CompanyListResponse> = companyGate.withLock { api.companies().onSuccess { activeCompanyId = it.currentCompany.id } }
  suspend fun portfolio(): Result<PortfolioDashboard> = api.portfolio()
  suspend fun portfolioEconomy(): Result<PortfolioEconomy> = api.portfolioEconomy()
  suspend fun portfolioApprovals(): Result<List<PortfolioApproval>> = api.portfolioApprovals()
  suspend fun portfolioSearch(query: String, type: String = "ALL"): Result<PortfolioSearchResponse> = api.portfolioSearch(query, type)
  suspend fun selectCompany(companyId: String): Result<CompanyListResponse> = companyGate.withLock { api.csrf().fold(
    onSuccess = { api.selectCompany(it.token, companyId).onSuccess { selected -> activeCompanyId = selected.currentCompany.id } },
    onFailure = Result<CompanyListResponse>::failure,
  ) }
  suspend fun createCompany(name: String, description: String?, industry: String?): Result<CompanyListResponse> = companyGate.withLock { api.csrf().fold(
    onSuccess = { api.createCompany(it.token, CreateCompanyRequest(name, description, industry, UUID.randomUUID().toString())).onSuccess { created -> activeCompanyId = created.currentCompany.id } },
    onFailure = Result<CompanyListResponse>::failure,
  ) }
  suspend fun transitionCompany(companyId: String, action: String): Result<CompanyDetailResponse> = api.csrf().fold(
    onSuccess = { api.transitionCompany(it.token, companyId, action) },
    onFailure = Result<CompanyDetailResponse>::failure,
  )

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
      .onSuccess { summary -> scopedCacheKey("summary")?.let { cache.save(it, gson.toJson(summary), System.currentTimeMillis()) } }
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
    .onSuccess { center -> scopedCacheKey(CONVERSATION_CACHE_KEY)?.let { cache.save(it, gson.toJson(center), System.currentTimeMillis()) } }
    .onFailure(::clearOnRevocation)

  suspend fun syncCrossDeviceClient(): Result<CrossDevicePollResponse> {
    val clientInstanceId = registrationStore.clientInstanceId()
    if (!crossDeviceRegistered) {
      val register = signedCrossDeviceRequest(
        payload = mapOf(
          "operation" to JsonPrimitive("register"),
          "request" to gson.toJsonTree(
            mapOf(
              "clientInstanceId" to clientInstanceId,
              "clientType" to "ANDROID",
              "displayName" to "Monday OS",
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
    return signedCrossDeviceRequest(
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
    return signedCrossDeviceRequest(
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
    signedCrossDeviceRequest(
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
    signedCrossDeviceRequest(
      payload = mapOf(
        "operation" to JsonPrimitive("receipt"),
        "request" to gson.toJsonTree(
          mapOf(
            "clientInstanceId" to registrationStore.clientInstanceId(),
            "commandId" to commandId,
            "status" to "ACKNOWLEDGED",
            "failureCode" to null,
            "safeMessage" to "Monday OS acknowledged the command.",
          ),
        ),
      ),
      request = api::crossDeviceReceipt,
    )

  suspend fun crossDeviceCommandStatus(commandId: String): Result<CrossDeviceCommand> =
    signedCrossDeviceRequest(
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
            scopedCacheKey(CONVERSATION_CACHE_KEY)?.let { cache.save(it, gson.toJson(center), System.currentTimeMillis()) }
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

  fun cachedSummary(): Pair<AlexaSummary, Long>? = scopedCacheKey("summary")?.let(cache::read)?.let {
    runCatching { gson.fromJson(it.json, AlexaSummary::class.java) to it.updatedAt }.getOrNull()
  }
  fun cachedHealth(): Pair<ApiHealth, Long>? = cache.read("health")?.let {
    runCatching { gson.fromJson(it.json, ApiHealth::class.java) to it.updatedAt }.getOrNull()
  }
  fun cachedConversations(): Pair<ConversationCenter, Long>? = scopedCacheKey(CONVERSATION_CACHE_KEY)?.let(cache::read)?.let {
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

  private fun scopedCacheKey(key: String): String? = activeCompanyId?.let { company ->
    val device = registrationStore.load()?.takeIf { it.trustStatus == DeviceTrustStatus.TRUSTED }?.deviceId ?: return null
    if (sessionStore.cookie() == null) return null
    "$device:$company:$key"
  }

  private suspend fun <T> signedVoiceRequest(
    payload: Map<String, JsonElement>,
    request: suspend (SignedEnvelope) -> Result<T>,
  ): Result<T> {
    val companyId = activeCompanyId
      ?: return Result.failure(AlexaApiException(AlexaFailure.Unknown("Select a company before starting voice.")))
    return signedDeviceRequest(payload + ("companyId" to JsonPrimitive(companyId))) { _, envelope -> request(envelope) }
  }

  private suspend fun <T> signedCrossDeviceRequest(
    payload: Map<String, JsonElement>,
    request: suspend (String, SignedEnvelope) -> Result<T>,
  ): Result<T> {
    val companyId = activeCompanyId
      ?: return Result.failure(AlexaApiException(AlexaFailure.Unknown("Select a company before using another device.")))
    return signedDeviceRequest(payload + ("companyId" to JsonPrimitive(companyId)), request)
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
