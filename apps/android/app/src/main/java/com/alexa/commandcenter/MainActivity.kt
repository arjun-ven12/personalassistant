package com.alexa.commandcenter

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.collectAsState
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.alexa.commandcenter.config.AlexaEnvironments
import com.alexa.commandcenter.network.AlexaApiClient
import com.alexa.commandcenter.network.ConnectivityMonitor
import com.alexa.commandcenter.model.NotificationTarget
import com.alexa.commandcenter.notifications.AlexaFirebaseMessagingService
import com.alexa.commandcenter.notifications.PushTokenStore
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.security.AndroidDeviceIdentity
import com.alexa.commandcenter.security.AndroidBiometricIdentity
import com.alexa.commandcenter.security.AndroidSecureValues
import com.alexa.commandcenter.security.DeviceRegistrationStore
import com.alexa.commandcenter.security.SecureCache
import com.alexa.commandcenter.security.SessionStore
import com.alexa.commandcenter.ui.AlexaApp
import com.alexa.commandcenter.ui.AlexaViewModel
import com.alexa.commandcenter.ui.AlexaScreenState
import com.alexa.commandcenter.ui.BiometricPurpose
import com.alexa.commandcenter.ui.BiometricRequest
import com.alexa.commandcenter.voice.AndroidVoiceController
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
  private lateinit var model: AlexaViewModel
  private lateinit var pushTokenStore: PushTokenStore
  private lateinit var biometricIdentity: AndroidBiometricIdentity
  private var registeredPushToken: String? = null
  private var biometricKeyRegistered = false
  private var tokenFetchInProgress = false
  private val microphonePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    model.onMicrophonePermissionResult(
      granted = granted,
      canAskAgain = granted || shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO),
    )
  }
  private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    getPreferences(MODE_PRIVATE).edit().putBoolean("notification_permission_requested", true).apply()
    model.onNotificationPermission(granted)
    if (granted) registerCurrentPushToken()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val environment = AlexaEnvironments.current()
    val secureValues = AndroidSecureValues(this)
    pushTokenStore = PushTokenStore(secureValues)
    biometricIdentity = AndroidBiometricIdentity()
    val sessionStore = SessionStore(secureValues)
    model = AlexaViewModel(
      repository = AlexaRepository(
        api = AlexaApiClient.create(environment, sessionStore),
        deviceIdentity = AndroidDeviceIdentity(secureValues),
        registrationStore = DeviceRegistrationStore(secureValues),
        sessionStore = sessionStore,
        cache = SecureCache(secureValues),
      ),
      connectivity = ConnectivityMonitor(this),
      voiceController = AndroidVoiceController(this),
    )
    model.onMicrophonePermissionResult(
      granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
      canAskAgain = true,
    )
    val notificationsGranted = android.os.Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    model.onNotificationPermission(notificationsGranted)
    lifecycleScope.launch { model.requestsBiometric.collectLatest { showBiometric(it) } }
    lifecycleScope.launch {
      model.state.collectLatest { state ->
        if (state.shouldSecureWindow) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (state.screen is AlexaScreenState.Shell && state.connection == com.alexa.commandcenter.model.ConnectionState.ONLINE && state.notificationPermissionGranted) registerCurrentPushToken()
        if (state.screen is AlexaScreenState.Shell && state.connection == com.alexa.commandcenter.model.ConnectionState.ONLINE && !biometricKeyRegistered) {
          runCatching { biometricIdentity.publicKey() }.onSuccess { key ->
            biometricKeyRegistered = true
            model.registerBiometricKey(key)
          }
        }
      }
    }
    setContent {
      AlexaApp(
        state = model.state.collectAsState().value,
        environment = environment,
        onLogin = model::login,
        onCreatePairing = model::createPairingIntent,
        onRegister = model::registerDevice,
        onRefreshApproval = model::refreshApproval,
        onRefresh = model::refresh,
        onLock = model::lockNow,
        onForgetDevice = model::signOutAndForgetDevice,
        onCreateObjective = model::createObjective,
        onObjectiveAction = model::transitionObjective,
        onModifyObjective = model::modifyObjective,
        onApprovalDecision = model::decideApproval,
        onApprovalDecisionWithReason = model::decideApprovalWithReason,
        onApprovalSelected = model::loadApprovalDetail,
        onNotificationTargetConsumed = model::consumeNotificationTarget,
        onNotificationPreferences = model::updateNotificationPreferences,
        onAgentSelected = model::loadAgentDetail,
        onWorkflowSelected = model::loadWorkflowDetail,
        onExperimentsSelected = model::loadExperiments,
        onRequestMicrophonePermission = { microphonePermission.launch(Manifest.permission.RECORD_AUDIO) },
        onStartRecording = model::startRecording,
        onReleaseRecording = model::releaseRecording,
        onCancelRecording = model::cancelRecording,
        onSubmitMessage = model::submitText,
        onRetryMessage = model::retryPendingTurn,
        onStopResponse = model::stopResponse,
        onStopSpeaking = model::stopSpeaking,
        onTtsEnabled = model::setTtsEnabled,
        onNewConversation = model::newConversation,
        onSelectConversation = model::selectConversation,
        onLoadEarlierMessages = model::loadEarlierMessages,
        onCrossDeviceCommandApplied = model::completeCrossDeviceCommand,
      )
    }
    processNotificationIntent(intent)
    if (!notificationsGranted && android.os.Build.VERSION.SDK_INT >= 33 && !getPreferences(MODE_PRIVATE).getBoolean("notification_permission_requested", false)) {
      notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }

  override fun onStart() { super.onStart(); if (::model.isInitialized) { model.onForeground(); registerCurrentPushToken() } }
  override fun onStop() { if (::model.isInitialized) model.onBackground(); super.onStop() }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    processNotificationIntent(intent)
  }

  private fun showBiometric(request: BiometricRequest) {
    val stepUp = request.purpose == BiometricPurpose.APPROVAL_STEP_UP
    val allowed = if (stepUp) BiometricManager.Authenticators.BIOMETRIC_STRONG else BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(this).canAuthenticate(allowed) != BiometricManager.BIOMETRIC_SUCCESS) {
      model.onBiometricCancelled()
      return
    }
    val signature = if (stepUp) runCatching { biometricIdentity.signatureForPrompt() }.getOrElse {
      runCatching { biometricIdentity.rotate() }.onSuccess { model.registerBiometricKey(it) }
      model.onBiometricCancelled()
      return
    } else null
    val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        if (!stepUp) return model.onBiometricSucceeded()
        val challenge = request.challenge ?: return model.onBiometricCancelled()
        val deviceId = model.state.value.device?.deviceId ?: return model.onBiometricCancelled()
        val authenticatedSignature = result.cryptoObject?.signature ?: return model.onBiometricCancelled()
        val value = "alexa-mobile-recent-auth:v1:${challenge.challengeId}:${challenge.challengeToken}:$deviceId"
        runCatching { biometricIdentity.signAuthenticated(authenticatedSignature, value) }
          .onSuccess(model::onBiometricSucceeded)
          .onFailure { model.onBiometricCancelled() }
      }
      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = model.onBiometricCancelled()
    })
    val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(if (request.purpose == BiometricPurpose.APPROVAL_STEP_UP) "Confirm approval" else "Unlock Alexa")
        .setSubtitle(if (request.purpose == BiometricPurpose.APPROVAL_STEP_UP) "Authenticate to submit this governed decision" else "Confirm your identity to access the Command Center")
        .setAllowedAuthenticators(allowed)
        .build()
    if (signature != null) prompt.authenticate(info, BiometricPrompt.CryptoObject(signature)) else prompt.authenticate(info)
  }

  private fun registerCurrentPushToken() {
    if (!::model.isInitialized) return
    if (model.state.value.screen !is AlexaScreenState.Shell || model.state.value.connection != com.alexa.commandcenter.model.ConnectionState.ONLINE) return
    pushTokenStore.load()?.takeIf { it != registeredPushToken }?.let { token -> registeredPushToken = token; model.registerPushToken(token, BuildConfig.VERSION_NAME) }
    if (FirebaseApp.getApps(this).isEmpty() || tokenFetchInProgress) return
    tokenFetchInProgress = true
    FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
      pushTokenStore.save(token)
      if (token != registeredPushToken) {
        registeredPushToken = token
        model.registerPushToken(token, BuildConfig.VERSION_NAME)
      }
    }.addOnCompleteListener { tokenFetchInProgress = false }
  }

  private fun processNotificationIntent(intent: Intent?) {
    val kind = intent?.getStringExtra(AlexaFirebaseMessagingService.EXTRA_OBJECT_KIND) ?: return
    val objectId = intent.getStringExtra(AlexaFirebaseMessagingService.EXTRA_OBJECT_ID) ?: return
    val target = NotificationTarget(kind, objectId, intent.getStringExtra(AlexaFirebaseMessagingService.EXTRA_EVENT_ID))
    if (target.isValid()) model.openNotification(target)
    intent.removeExtra(AlexaFirebaseMessagingService.EXTRA_OBJECT_KIND)
    intent.removeExtra(AlexaFirebaseMessagingService.EXTRA_OBJECT_ID)
    intent.removeExtra(AlexaFirebaseMessagingService.EXTRA_EVENT_ID)
  }
}
