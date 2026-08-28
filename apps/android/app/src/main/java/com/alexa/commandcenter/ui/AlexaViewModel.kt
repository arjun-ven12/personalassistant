package com.alexa.commandcenter.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alexa.commandcenter.lifecycle.AppLockController
import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.network.AlexaApiException
import com.alexa.commandcenter.network.ConnectivityMonitor
import com.alexa.commandcenter.realtime.ForegroundSyncController
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.voice.AndroidVoiceController
import com.alexa.commandcenter.voice.VoiceCaptureEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.UUID

sealed interface AlexaScreenState {
  data object Checking : AlexaScreenState
  data object Login : AlexaScreenState
  data class Registration(val pairingCode: String?, val expiresAt: String?, val status: DeviceTrustStatus?) : AlexaScreenState
  data object BiometricLocked : AlexaScreenState
  data object Shell : AlexaScreenState
}

data class AlexaUiState(
  val screen: AlexaScreenState = AlexaScreenState.Checking,
  val connection: ConnectionState = ConnectionState.OFFLINE,
  val health: ApiHealth? = null,
  val summary: AlexaSummary? = null,
  val commandCenter: CommandCenterSnapshot? = null,
  val agentDetails: Map<String, WorkforceAgentDetail> = emptyMap(),
  val workflowDetails: Map<String, WorkflowDetail> = emptyMap(),
  val experimentDashboards: Map<String, ExperimentDashboard> = emptyMap(),
  val conversations: ConversationCenter? = null,
  val selectedConversationId: String? = null,
  val activeVoiceSessionId: String? = null,
  val visibleConversationMessages: Int = 40,
  val voiceState: MobileVoiceState = MobileVoiceState.IDLE,
  val microphoneAccess: MicrophoneAccess = MicrophoneAccess.UNKNOWN,
  val ttsEnabled: Boolean = true,
  val pendingTurn: PendingConversationTurn? = null,
  val voiceError: String? = null,
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
  private val biometricRequests = MutableSharedFlow<Unit>()
  val requestsBiometric = biometricRequests.asSharedFlow()

  init {
    connectivity.start()
    viewModelScope.launch {
      connectivity.state.collectLatest { connection ->
        mutableState.value = mutableState.value.copy(connection = connection)
        if (connection == ConnectionState.ONLINE && mutableState.value.screen is AlexaScreenState.Shell) refresh()
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

  fun onBiometricSucceeded() {
    mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Shell, error = null)
    refresh()
  }
  fun onBiometricCancelled() { mutableState.value = mutableState.value.copy(error = "Alexa remains locked.") }

  fun refresh() = viewModelScope.launch {
    if (mutableState.value.connection == ConnectionState.OFFLINE) return@launch cachedOfflineState()
    val healthy = foregroundSync.boundedReconnect {
      val health = repository.refreshHealth().getOrNull() ?: return@boundedReconnect false
      val summary = repository.refreshSummary().getOrNull() ?: return@boundedReconnect false
      val commandCenter = repository.commandCenter().getOrNull()
      val conversations = repository.conversations().getOrNull()
      mutableState.value = mutableState.value.withConversations(conversations).copy(
        health = health,
        summary = summary,
        commandCenter = commandCenter,
        connection = ConnectionState.ONLINE,
        lastUpdatedAt = System.currentTimeMillis(),
        error = null,
      )
      true
    }
    if (!healthy) cachedOfflineState()
  }

  fun onBackground() = lockController.onBackground(System.currentTimeMillis())
  fun onForeground() { if (lockController.requiresBiometricOnForeground(System.currentTimeMillis()) && repository.hasSession()) requireBiometric() }
  fun lockNow() = requireBiometric()
  fun signOutAndForgetDevice() {
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

  fun decideApproval(approvalId: String, approve: Boolean) = viewModelScope.launch {
    if (mutableState.value.connection != ConnectionState.ONLINE) return@launch showOfflineActionError()
    repository.decideApproval(approvalId, approve).fold(onSuccess = { refresh() }, onFailure = ::showFailure)
  }

  fun loadAgentDetail(agentId: String) = viewModelScope.launch {
    if (mutableState.value.agentDetails.containsKey(agentId)) return@launch
    repository.workforceAgent(agentId).onSuccess { detail ->
      mutableState.value = mutableState.value.copy(agentDetails = mutableState.value.agentDetails + (agentId to detail))
    }.onFailure(::showFailure)
  }

  fun loadWorkflowDetail(workflowId: String) = viewModelScope.launch {
    if (mutableState.value.workflowDetails.containsKey(workflowId)) return@launch
    repository.workflow(workflowId).onSuccess { detail ->
      mutableState.value = mutableState.value.copy(workflowDetails = mutableState.value.workflowDetails + (workflowId to detail))
    }.onFailure(::showFailure)
  }

  fun loadExperiments(objectiveId: String) = viewModelScope.launch {
    if (mutableState.value.experimentDashboards.containsKey(objectiveId)) return@launch
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
    mutableState.value = mutableState.value.copy(screen = AlexaScreenState.BiometricLocked, error = null)
    viewModelScope.launch { biometricRequests.emit(Unit) }
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
