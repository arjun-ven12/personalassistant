package com.alexa.commandcenter.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alexa.commandcenter.lifecycle.AppLockController
import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.network.AlexaApiException
import com.alexa.commandcenter.network.ConnectivityMonitor
import com.alexa.commandcenter.notifications.ExecutiveRefreshEvents
import com.alexa.commandcenter.realtime.ForegroundSyncController
import com.alexa.commandcenter.realtime.CrossDeviceRouting
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.voice.AndroidVoiceController
import com.alexa.commandcenter.voice.VoiceCaptureEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import java.util.UUID

sealed interface AlexaScreenState {
  data object Checking : AlexaScreenState
  data object Login : AlexaScreenState
  data class Registration(val pairingCode: String?, val expiresAt: String?, val status: DeviceTrustStatus?) : AlexaScreenState
  data object BiometricLocked : AlexaScreenState
  data object Shell : AlexaScreenState
}

enum class BiometricPurpose { UNLOCK, APPROVAL_STEP_UP }
data class BiometricRequest(val purpose: BiometricPurpose, val challenge: RecentAuthChallenge? = null)
private data class PendingApprovalStepUp(val approvalId: String, val challenge: RecentAuthChallenge)

data class AlexaUiState(
  val screen: AlexaScreenState = AlexaScreenState.Checking,
  val connection: ConnectionState = ConnectionState.OFFLINE,
  val health: ApiHealth? = null,
  val summary: AlexaSummary? = null,
  val commandCenter: CommandCenterSnapshot? = null,
  val companies: CompanyListResponse? = null,
  val agentDetails: Map<String, WorkforceAgentDetail> = emptyMap(),
  val workflowDetails: Map<String, WorkflowDetail> = emptyMap(),
  val experimentDashboards: Map<String, ExperimentDashboard> = emptyMap(),
  val approvalDetails: Map<String, Approval> = emptyMap(),
  val notificationPreferences: NotificationPreferencesResponse? = null,
  val notificationTarget: NotificationTarget? = null,
  val externalDestination: String? = null,
  val notificationPermissionGranted: Boolean = false,
  val conversations: ConversationCenter? = null,
  val selectedConversationId: String? = null,
  val activeVoiceSessionId: String? = null,
  val visibleConversationMessages: Int = 40,
  val voiceState: MobileVoiceState = MobileVoiceState.IDLE,
  val microphoneAccess: MicrophoneAccess = MicrophoneAccess.UNKNOWN,
  val ttsEnabled: Boolean = true,
  val pendingTurn: PendingConversationTurn? = null,
  val voiceError: String? = null,
  val crossDeviceCommand: CrossDeviceCommand? = null,
  val crossDeviceResponse: String? = null,
  val lastUpdatedAt: Long? = null,
  val device: DeviceRegistration? = null,
  val error: String? = null,
) { val shouldSecureWindow: Boolean get() = screen !is AlexaScreenState.Shell }

class AlexaViewModel(
  private val repository: AlexaRepository,
  private val connectivity: ConnectivityMonitor,
  private val voiceController: AndroidVoiceController,
  private val lockController: AppLockController = AppLockController(),
  private val foregroundSync: ForegroundSyncController = ForegroundSyncController(),
) : ViewModel() {
  private val mutableState = MutableStateFlow(AlexaUiState())
  val state = mutableState.asStateFlow()
  private val biometricRequests = MutableSharedFlow<BiometricRequest>()
  val requestsBiometric = biometricRequests.asSharedFlow()
  private var pendingApprovalStepUp: PendingApprovalStepUp? = null
  private var foregroundStateSync: Job? = null
  private var executiveRefresh: Job? = null

  init {
    connectivity.start()
    viewModelScope.launch {
      connectivity.state.collectLatest { connection ->
        mutableState.value = mutableState.value.copy(connection = connection)
        if (connection == ConnectionState.ONLINE && mutableState.value.screen is AlexaScreenState.Shell) refresh()
      }
    }
    viewModelScope.launch {
      ExecutiveRefreshEvents.events.collectLatest { target ->
        if (foregroundStateSync?.isActive != true || mutableState.value.connection != ConnectionState.ONLINE) return@collectLatest
        refreshExecutiveSnapshot()
        when (target.kind) {
          "APPROVAL" -> loadApprovalDetail(target.objectId, force = true)
          "WORKFLOW" -> loadWorkflowDetail(target.objectId, force = true)
          "AGENT" -> loadAgentDetail(target.objectId, force = true)
          "EXPERIMENT" -> loadExperiments("__all__", force = true)
        }
      }
    }
    restore()
  }

  fun login(email: String, password: String) = viewModelScope.launch {
    repository.login(email, password).fold(
      onSuccess = {
        when (repository.registration()?.trustStatus) {
          DeviceTrustStatus.TRUSTED -> requireBiometric()
          DeviceTrustStatus.PENDING -> mutableState.value = mutableState.value.copy(
            screen = AlexaScreenState.Registration(null, null, DeviceTrustStatus.PENDING),
            error = null,
          )
          else -> createPairingIntent()
        }
      },
      onFailure = ::showFailure,
    )
  }

  fun createPairingIntent() = viewModelScope.launch {
    repository.beginPairing().fold(
      onSuccess = {
        mutableState.value = mutableState.value.copy(
          screen = AlexaScreenState.Registration(it.pairingCode, it.expiresAt, repository.registration()?.trustStatus), error = null,
        )
      },
      onFailure = ::showFailure,
    )
  }

  fun registerDevice(pairingCode: String, deviceName: String) = viewModelScope.launch {
    repository.registerDevice(pairingCode, deviceName).fold(
      onSuccess = {
        mutableState.value = mutableState.value.copy(
          screen = AlexaScreenState.Registration(pairingCode, null, DeviceTrustStatus.PENDING), device = it, error = null,
        )
      },
      onFailure = ::showFailure,
    )
  }

  fun refreshApproval() = viewModelScope.launch {
    repository.refreshTrust().fold(
      onSuccess = { registration ->
        mutableState.value = mutableState.value.copy(device = registration, error = null)
        if (registration.trustStatus == DeviceTrustStatus.TRUSTED) requireBiometric()
        else mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Registration(null, null, registration.trustStatus))
      },
      onFailure = ::showFailure,
    )
  }

  fun onBiometricSucceeded(biometricSignature: String? = null) {
    val pending = pendingApprovalStepUp
    if (pending != null) {
      pendingApprovalStepUp = null
      viewModelScope.launch {
        if (biometricSignature == null) return@launch showFailure(IllegalStateException("Biometric signature unavailable."))
        repository.verifyMobileRecentAuth(pending.challenge, biometricSignature).fold(
          onSuccess = { decideApproval(pending.approvalId, true) },
          onFailure = ::showFailure,
        )
      }
      return
    }
    mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Shell, error = null)
    refresh()
    startForegroundSync()
  }
  fun onBiometricCancelled() {
    val wasStepUp = pendingApprovalStepUp != null
    pendingApprovalStepUp = null
    mutableState.value = mutableState.value.copy(error = if (wasStepUp) "Approval was not submitted." else "Alexa remains locked.")
  }

  fun refresh() = viewModelScope.launch {
    if (mutableState.value.connection == ConnectionState.OFFLINE) return@launch cachedOfflineState()
    val healthy = foregroundSync.boundedReconnect {
      val health = repository.refreshHealth().getOrNull() ?: return@boundedReconnect false
      val companies = repository.companies().getOrNull() ?: return@boundedReconnect false
      val summary = repository.refreshSummary().getOrNull() ?: return@boundedReconnect false
      val commandCenter = repository.commandCenter().getOrNull()
      val conversations = repository.conversations().getOrNull()
      val notificationPreferences = repository.notificationPreferences().getOrNull()
      val crossDevice = repository.syncCrossDeviceClient().getOrNull()
      mutableState.value = mutableState.value.withConversations(conversations).copy(
        health = health,
        summary = summary,
        commandCenter = commandCenter,
        companies = companies,
        notificationPreferences = notificationPreferences,
        crossDeviceCommand = crossDevice?.commands?.firstOrNull() ?: mutableState.value.crossDeviceCommand,
        connection = ConnectionState.ONLINE,
        lastUpdatedAt = System.currentTimeMillis(),
        error = null,
      )
      true
    }
    if (!healthy) cachedOfflineState()
  }

  fun selectCompany(companyId: String) = viewModelScope.launch {
    if (companyId == mutableState.value.companies?.currentCompany?.id) return@launch
    mutableState.value = mutableState.value.copy(
      commandCenter = null, agentDetails = emptyMap(), workflowDetails = emptyMap(),
      experimentDashboards = emptyMap(), approvalDetails = emptyMap(), conversations = null,
      selectedConversationId = null, activeVoiceSessionId = null, notificationTarget = null,
    )
    repository.selectCompany(companyId).fold(
      onSuccess = { mutableState.value = mutableState.value.copy(companies = it, error = null); refresh() },
      onFailure = ::showFailure,
    )
  }

  fun onBackground() {
    foregroundStateSync?.cancel()
    foregroundStateSync = null
    executiveRefresh?.cancel()
    executiveRefresh = null
    suspendVoiceActivity()
    lockController.onBackground(System.currentTimeMillis())
  }
  fun onForeground() {
    if (lockController.requiresBiometricOnForeground(System.currentTimeMillis()) && repository.hasSession()) requireBiometric()
    else if (mutableState.value.screen is AlexaScreenState.Shell) {
      refresh()
      startForegroundSync()
    }
  }
  fun lockNow() = requireBiometric()
  fun signOutAndForgetDevice() = viewModelScope.launch {
    if (mutableState.value.connection == ConnectionState.ONLINE) repository.unregisterPushToken()
    repository.clearAuthority()
    mutableState.value = AlexaUiState(screen = AlexaScreenState.Login, connection = mutableState.value.connection)
  }

  fun createObjective(request: CreateObjectiveRequest) = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showOfflineActionError()
    repository.createObjective(request).fold(onSuccess = { refresh() }, onFailure = ::showFailure)
  }

  fun transitionObjective(objectiveId: String, action: String) = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showOfflineActionError()
    repository.transitionObjective(objectiveId, action).fold(onSuccess = { refresh() }, onFailure = ::showFailure)
  }

  fun modifyObjective(objectiveId: String, budgetCredits: Int?, priority: String?) = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showOfflineActionError()
    repository.modifyObjective(objectiveId, budgetCredits, priority).fold(onSuccess = { refresh() }, onFailure = ::showFailure)
  }

  fun decideApproval(approvalId: String, approve: Boolean) = decideApprovalWithReason(approvalId, approve, null)

  fun decideApprovalWithReason(approvalId: String, approve: Boolean, reason: String?) = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showOfflineActionError()
    repository.decideApproval(approvalId, approve, reason).fold(
      onSuccess = { result ->
        mutableState.value = mutableState.value.copy(approvalDetails = mutableState.value.approvalDetails + (result.id to result))
        refresh()
      },
      onFailure = { error ->
        if (approve && (error as? AlexaApiException)?.failure == AlexaFailure.RecentAuthRequired) {
          repository.beginMobileRecentAuth().fold(
            onSuccess = { challenge ->
              pendingApprovalStepUp = PendingApprovalStepUp(approvalId, challenge)
              biometricRequests.emit(BiometricRequest(BiometricPurpose.APPROVAL_STEP_UP, challenge))
            },
            onFailure = ::showFailure,
          )
        } else if ((error as? AlexaApiException)?.failure == AlexaFailure.ApprovalConflict) {
          loadApprovalDetail(approvalId, force = true)
          mutableState.value = mutableState.value.copy(error = "This approval changed elsewhere. Showing the current state.")
        } else showFailure(error)
      },
    )
  }

  fun loadApprovalDetail(approvalId: String, force: Boolean = false) = viewModelScope.launch {
    if (!force && mutableState.value.approvalDetails.containsKey(approvalId)) return@launch
    repository.approval(approvalId).onSuccess { approval ->
      mutableState.value = mutableState.value.copy(approvalDetails = mutableState.value.approvalDetails + (approvalId to approval))
    }.onFailure(::showFailure)
  }

  fun registerPushToken(token: String, appVersion: String) = viewModelScope.launch {
    if (mutableState.value.screen !is AlexaScreenState.Shell || mutableState.value.connection != ConnectionState.ONLINE) return@launch
    repository.registerPushToken(token, appVersion).onFailure(::showFailure)
  }

  fun registerBiometricKey(publicKey: PublicKeyJwk) = viewModelScope.launch {
    if (mutableState.value.screen !is AlexaScreenState.Shell || mutableState.value.connection != ConnectionState.ONLINE) return@launch
    repository.registerBiometricKey(publicKey).onFailure(::showFailure)
  }

  fun updateNotificationPreferences(preferences: NotificationPreferences) = viewModelScope.launch {
    repository.updateNotificationPreferences(preferences).onSuccess { updated ->
      mutableState.value = mutableState.value.copy(notificationPreferences = updated)
    }.onFailure(::showFailure)
  }

  fun onNotificationPermission(granted: Boolean) {
    mutableState.value = mutableState.value.copy(notificationPermissionGranted = granted)
  }

  fun openNotification(target: NotificationTarget) {
    if (!target.isValid()) return
    val activeCompanyId = mutableState.value.companies?.currentCompany?.id
    if (target.companyId != null && target.companyId != activeCompanyId) {
      viewModelScope.launch {
        mutableState.value = mutableState.value.copy(
          commandCenter = null, agentDetails = emptyMap(), workflowDetails = emptyMap(),
          experimentDashboards = emptyMap(), approvalDetails = emptyMap(), conversations = null,
          selectedConversationId = null, activeVoiceSessionId = null, notificationTarget = null,
        )
        repository.selectCompany(target.companyId).fold(
          onSuccess = {
            mutableState.value = mutableState.value.copy(companies = it, error = null)
            openNotification(target.copy(companyId = null))
            refresh()
          },
          onFailure = ::showFailure,
        )
      }
      return
    }
    mutableState.value = mutableState.value.copy(notificationTarget = target)
    if (mutableState.value.connection == ConnectionState.ONLINE) refreshExecutiveSnapshot()
    when (target.kind) {
      "APPROVAL" -> loadApprovalDetail(target.objectId, force = true)
      "WORKFLOW" -> loadWorkflowDetail(target.objectId)
      "AGENT" -> loadAgentDetail(target.objectId)
    }
  }

  fun consumeNotificationTarget() {
    mutableState.value = mutableState.value.copy(notificationTarget = null)
  }

  fun openExternalDestination(destination: String) {
    if (destination !in setOf("VOICE", "APPROVALS")) return
    mutableState.value = mutableState.value.copy(externalDestination = destination)
  }

  fun consumeExternalDestination() {
    mutableState.value = mutableState.value.copy(externalDestination = null)
  }

  fun loadAgentDetail(agentId: String) = loadAgentDetail(agentId, force = false)

  private fun loadAgentDetail(agentId: String, force: Boolean) = viewModelScope.launch {
    if (!force && mutableState.value.agentDetails.containsKey(agentId)) return@launch
    repository.workforceAgent(agentId).onSuccess { detail ->
      mutableState.value = mutableState.value.copy(agentDetails = mutableState.value.agentDetails + (agentId to detail))
    }.onFailure(::showFailure)
  }

  fun loadWorkflowDetail(workflowId: String) = loadWorkflowDetail(workflowId, force = false)

  private fun loadWorkflowDetail(workflowId: String, force: Boolean) = viewModelScope.launch {
    if (!force && mutableState.value.workflowDetails.containsKey(workflowId)) return@launch
    repository.workflow(workflowId).onSuccess { detail ->
      mutableState.value = mutableState.value.copy(workflowDetails = mutableState.value.workflowDetails + (workflowId to detail))
    }.onFailure(::showFailure)
  }

  fun loadExperiments(objectiveId: String) = loadExperiments(objectiveId, force = false)

  private fun loadExperiments(objectiveId: String, force: Boolean) = viewModelScope.launch {
    if (!force && mutableState.value.experimentDashboards.containsKey(objectiveId)) return@launch
    repository.experiments(objectiveId).onSuccess { dashboard ->
      mutableState.value = mutableState.value.copy(experimentDashboards = mutableState.value.experimentDashboards + (objectiveId to dashboard))
    }.onFailure(::showFailure)
  }

  fun onMicrophonePermissionResult(granted: Boolean, canAskAgain: Boolean) {
    mutableState.value = mutableState.value.copy(
      microphoneAccess = when {
        granted -> MicrophoneAccess.GRANTED
        canAskAgain -> MicrophoneAccess.DENIED
        else -> MicrophoneAccess.PERMANENTLY_DENIED
      },
      voiceError = if (granted) null else "Microphone permission is required for push-to-talk.",
    )
  }

  fun startRecording() {
    if (mutableState.value.connection != ConnectionState.ONLINE) return showVoiceError("Reconnect to Alexa before using voice.")
    if (mutableState.value.microphoneAccess != MicrophoneAccess.GRANTED) return showVoiceError("Allow microphone access, then press and hold again.")
    stopSpeaking()
    mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.RECORDING, voiceError = null)
    voiceController.startCapture { event ->
      when (event) {
        VoiceCaptureEvent.Ready, VoiceCaptureEvent.Recording -> mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.RECORDING)
        VoiceCaptureEvent.Processing -> mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.PROCESSING_AUDIO)
        is VoiceCaptureEvent.Result -> {
          mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.TRANSCRIBING)
          submitTurn(event.speech.transcript, event.speech.confidence, event.speech.language)
        }
        is VoiceCaptureEvent.Failure -> showVoiceError(event.message)
        VoiceCaptureEvent.Cancelled -> mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.INTERRUPTED, voiceError = null)
      }
    }
  }

  fun releaseRecording() {
    if (mutableState.value.voiceState == MobileVoiceState.RECORDING) voiceController.stopCapture()
  }

  fun cancelRecording() {
    voiceController.cancelCapture()
    mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.INTERRUPTED, voiceError = null)
  }

  fun submitText(text: String) {
    val trimmed = text.trim()
    if (trimmed.isBlank()) return
    submitTurn(trimmed, 1.0, null)
  }

  fun retryPendingTurn() {
    val pending = mutableState.value.pendingTurn ?: return
    submitPendingTurn(pending)
  }

  fun stopResponse() {
    voiceController.stopSpeaking()
    val pending = mutableState.value.pendingTurn
    mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.INTERRUPTED)
    if (pending != null) viewModelScope.launch {
      repository.cancelConversationTurn(pending.turnId, pending.voiceSessionId)
      mutableState.value = mutableState.value.copy(pendingTurn = null, voiceState = MobileVoiceState.IDLE)
    }
  }

  fun stopSpeaking() {
    voiceController.stopSpeaking()
    if (mutableState.value.voiceState == MobileVoiceState.SPEAKING) {
      mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.IDLE)
    }
  }

  fun setTtsEnabled(enabled: Boolean) {
    if (!enabled) stopSpeaking()
    mutableState.value = mutableState.value.copy(ttsEnabled = enabled)
  }

  fun newConversation() = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showVoiceError("Reconnect to start a conversation.")
    repository.startConversation().fold(
      onSuccess = { dashboard ->
        val voiceSession = dashboard.sessions.maxByOrNull { it.updatedAt }
        mutableState.value = mutableState.value.copy(
          selectedConversationId = null,
          activeVoiceSessionId = voiceSession?.id,
          visibleConversationMessages = 40,
          voiceState = MobileVoiceState.IDLE,
          voiceError = null,
        )
      },
      onFailure = ::showFailure,
    )
  }

  fun selectConversation(conversationId: String) {
    val selected = mutableState.value.conversations?.sessions?.firstOrNull { it.id == conversationId } ?: return
    mutableState.value = mutableState.value.copy(
      selectedConversationId = selected.id,
      activeVoiceSessionId = selected.voiceSessionId,
      visibleConversationMessages = 40,
      voiceError = if (selected.voiceSessionId == null) "This legacy conversation is read-only on mobile." else null,
    )
  }

  fun loadEarlierMessages() {
    mutableState.value = mutableState.value.copy(visibleConversationMessages = mutableState.value.visibleConversationMessages + 40)
  }

  private fun restore() = viewModelScope.launch {
    mutableState.value = mutableState.value.copy(device = repository.registration())
    if (!repository.hasSession()) {
      mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Login)
      return@launch
    }
    repository.session().fold(
      onSuccess = {
        when (repository.registration()?.trustStatus) {
          DeviceTrustStatus.TRUSTED -> requireBiometric()
          DeviceTrustStatus.PENDING -> mutableState.value = mutableState.value.copy(
            screen = AlexaScreenState.Registration(null, null, DeviceTrustStatus.PENDING),
          )
          else -> createPairingIntent()
        }
      },
      onFailure = {
        repository.clearSession()
        mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Login)
      },
    )
  }

  private fun requireBiometric() {
    suspendVoiceActivity()
    mutableState.value = mutableState.value.copy(screen = AlexaScreenState.BiometricLocked, error = null)
    viewModelScope.launch { biometricRequests.emit(BiometricRequest(BiometricPurpose.UNLOCK)) }
  }

  private fun suspendVoiceActivity() {
    voiceController.cancelCapture()
    voiceController.stopSpeaking()
    if (mutableState.value.voiceState != MobileVoiceState.IDLE) {
      mutableState.value = mutableState.value.copy(
        voiceState = MobileVoiceState.INTERRUPTED,
        voiceError = null,
      )
    }
  }

  private fun cachedOfflineState() {
    val health = repository.cachedHealth()
    val summary = repository.cachedSummary()
    val conversations = repository.cachedConversations()
    mutableState.value = mutableState.value.withConversations(conversations?.first).copy(
      health = health?.first ?: mutableState.value.health,
      summary = summary?.first ?: mutableState.value.summary,
      lastUpdatedAt = maxOf(health?.second ?: 0, summary?.second ?: 0, conversations?.second ?: 0).takeIf { it > 0 },
      connection = ConnectionState.OFFLINE,
      error = "Offline. Showing the last safely cached state.",
    )
  }

  private fun showOfflineActionError() {
    mutableState.value = mutableState.value.copy(error = "Reconnect to Alexa before making this change.")
  }

  private fun showFailure(error: Throwable) {
    val failure = (error as? AlexaApiException)?.failure
    if (failure == AlexaFailure.DeviceRevoked) {
      repository.clearAuthority()
      mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Login, error = "This device is no longer trusted.")
      return
    }
    if (failure == AlexaFailure.DeviceNotEligible) {
      mutableState.value = mutableState.value.copy(
        error = "This trusted device is not enabled for that Alexa feature yet.",
      )
      return
    }
    if (failure == AlexaFailure.SignedRequestRejected) {
      mutableState.value = mutableState.value.copy(
        error = "Alexa could not verify this device request. Your session and device pairing remain intact.",
      )
      return
    }
    if (failure == AlexaFailure.ApprovalConflict) {
      mutableState.value = mutableState.value.copy(error = "This approval is no longer pending. Refreshing current state.")
      refresh()
      return
    }
    if (failure == AlexaFailure.Unauthorized) {
      repository.clearSession()
      mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Login, error = "Authentication is required.")
      return
    }
    mutableState.value = mutableState.value.copy(error = when (failure) {
      AlexaFailure.NetworkUnavailable -> "Network unavailable."
      AlexaFailure.Timeout -> "The server did not respond in time."
      AlexaFailure.RateLimited -> "Too many requests. Try again shortly."
      AlexaFailure.ServerUnavailable -> "Alexa is temporarily unavailable."
      AlexaFailure.DeviceNotEligible -> "This trusted device is not enabled for that Alexa feature yet."
      AlexaFailure.SignedRequestRejected -> "Alexa could not verify this device request. Your session and device pairing remain intact."
      AlexaFailure.RecentAuthRequired -> "Biometric confirmation is required for this approval."
      AlexaFailure.ApprovalConflict -> "This approval is no longer pending."
      else -> "The request could not be completed."
    })
  }

  private fun submitTurn(transcript: String, confidence: Double, language: String?) {
    if (mutableState.value.connection != ConnectionState.ONLINE) return showVoiceError("Offline. Your message remains a draft and was not sent.")
    if (transcript.matches(Regex("(?i)^\\s*(shut up|stop speaking)\\s*[.!?]*\\s*$"))) {
      stopSpeaking()
      return
    }
    viewModelScope.launch {
      if (CrossDeviceRouting.isTargetedUtterance(transcript)) {
        repository.routeCrossDeviceUtterance(transcript, mutableState.value.selectedConversationId).fold(
          onSuccess = { response ->
            val message = response.responseText ?: "The cross-device request was recorded."
            mutableState.value = mutableState.value.copy(
              crossDeviceResponse = message,
              voiceState = MobileVoiceState.IDLE,
              voiceError = null,
            )
            if (mutableState.value.ttsEnabled) speak(message)
            response.command?.takeUnless { it.status in setOf("SUCCEEDED", "FAILED", "REJECTED", "EXPIRED", "CANCELLED", "TARGET_OFFLINE") }?.let { command ->
              viewModelScope.launch {
                repeat(30) {
                  delay(2_000)
                  val current = repository.crossDeviceCommandStatus(command.id).getOrNull() ?: return@repeat
                  if (current.status in setOf("SUCCEEDED", "FAILED", "REJECTED", "EXPIRED", "CANCELLED", "TARGET_OFFLINE")) {
                    mutableState.value = mutableState.value.copy(crossDeviceResponse = current.safeMessage)
                    if (mutableState.value.ttsEnabled) speak(current.safeMessage)
                    return@launch
                  }
                }
              }
            }
          },
          onFailure = ::showFailure,
        )
        return@launch
      }
      var voiceSessionId = mutableState.value.activeVoiceSessionId
      if (voiceSessionId == null) {
        val dashboard = repository.startConversation().getOrElse {
          showFailure(it)
          return@launch
        }
        voiceSessionId = dashboard.sessions.maxByOrNull { it.updatedAt }?.id
      }
      val sessionId = voiceSessionId ?: return@launch showVoiceError("Alexa could not create a conversation session.")
      submitPendingTurn(PendingConversationTurn(UUID.randomUUID().toString(), sessionId, transcript, confidence, language))
    }
  }

  fun completeCrossDeviceCommand(commandId: String, succeeded: Boolean, message: String) = viewModelScope.launch {
    val current = mutableState.value.crossDeviceCommand
    if (current?.id != commandId) return@launch
    val acknowledge = if (current.status == "DISPATCHED")
      repository.acknowledgeCrossDeviceCommand(commandId)
    else Result.success(current)
    acknowledge.fold(
      onSuccess = {
        repository.completeCrossDeviceCommand(commandId, succeeded, message).fold(
          onSuccess = { completed ->
            mutableState.value = mutableState.value.copy(
              crossDeviceCommand = null,
              crossDeviceResponse = completed.safeMessage,
            )
          },
          onFailure = ::showFailure,
        )
      },
      onFailure = ::showFailure,
    )
  }

  private fun startForegroundSync() {
    if (foregroundStateSync?.isActive == true) return
    foregroundStateSync = viewModelScope.launch {
      var cycle = 0
      while (mutableState.value.screen is AlexaScreenState.Shell) {
        delay(foregroundSync.pollIntervalMs)
        if (mutableState.value.connection == ConnectionState.ONLINE) {
          repository.syncCrossDeviceClient().onSuccess { response ->
            response.commands.firstOrNull()?.let { command ->
              if (mutableState.value.crossDeviceCommand?.id != command.id)
                mutableState.value = mutableState.value.copy(crossDeviceCommand = command)
            }
          }
          if (foregroundSync.shouldRefreshExecutive(cycle)) refreshExecutiveSnapshot()
          cycle += 1
        }
      }
    }
  }

  private fun refreshExecutiveSnapshot() {
    if (executiveRefresh?.isActive == true) return
    executiveRefresh = viewModelScope.launch {
      repository.commandCenter().onSuccess { snapshot ->
        mutableState.value = mutableState.value.copy(
          commandCenter = snapshot,
          lastUpdatedAt = System.currentTimeMillis(),
          error = null,
        )
      }.onFailure { error ->
        val failure = (error as? AlexaApiException)?.failure
        if (failure == AlexaFailure.DeviceRevoked || failure == AlexaFailure.Unauthorized) showFailure(error)
      }
    }
  }

  private fun submitPendingTurn(turn: PendingConversationTurn) = viewModelScope.launch {
    mutableState.value = mutableState.value.copy(
      pendingTurn = turn,
      activeVoiceSessionId = turn.voiceSessionId,
      voiceState = MobileVoiceState.SUBMITTING,
      voiceError = null,
    )
    mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.THINKING)
    repository.submitConversationTurn(turn).fold(
      onSuccess = { response ->
        val center = ConversationCenter(response.dashboard.conversationSessions, response.dashboard.conversationHistory)
        mutableState.value = mutableState.value.withConversations(center).copy(
          selectedConversationId = response.conversation.conversationId,
          activeVoiceSessionId = turn.voiceSessionId,
          pendingTurn = null,
          voiceState = MobileVoiceState.IDLE,
          voiceError = null,
          lastUpdatedAt = System.currentTimeMillis(),
        )
        response.responseText?.takeIf { it.isNotBlank() && mutableState.value.ttsEnabled }?.let { speak(it) }
      },
      onFailure = { error ->
        val failure = (error as? AlexaApiException)?.failure
        if (failure == AlexaFailure.NetworkUnavailable || failure == AlexaFailure.Timeout) {
          mutableState.value = mutableState.value.copy(
            voiceState = MobileVoiceState.ERROR,
            voiceError = "The response was interrupted. Retry uses the same protected turn ID.",
          )
        } else {
          mutableState.value = mutableState.value.copy(pendingTurn = null)
          showFailure(error)
          if (mutableState.value.screen is AlexaScreenState.Shell) {
            mutableState.value = mutableState.value.copy(
              voiceState = MobileVoiceState.ERROR,
              voiceError = "Alexa could not complete this turn. It was not submitted again automatically.",
            )
          }
        }
      },
    )
  }

  private fun speak(text: String) {
    voiceController.speak(text) { speaking, error ->
      mutableState.value = mutableState.value.copy(
        voiceState = if (speaking) MobileVoiceState.SPEAKING else MobileVoiceState.IDLE,
        voiceError = error,
      )
    }
  }

  private fun showVoiceError(message: String) {
    mutableState.value = mutableState.value.copy(voiceState = MobileVoiceState.ERROR, voiceError = message)
  }

  override fun onCleared() {
    connectivity.stop()
    voiceController.release()
    super.onCleared()
  }
}

private fun AlexaUiState.withConversations(center: ConversationCenter?): AlexaUiState {
  if (center == null) return this
  val current = center.sessions.firstOrNull { it.id == selectedConversationId }
    ?: center.sessions.maxByOrNull { it.updatedAt }
  return copy(
    conversations = center,
    selectedConversationId = current?.id,
    activeVoiceSessionId = current?.voiceSessionId ?: activeVoiceSessionId,
  )
}
