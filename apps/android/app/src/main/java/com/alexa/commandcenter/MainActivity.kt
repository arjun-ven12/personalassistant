package com.alexa.commandcenter

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.collectAsState
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.alexa.commandcenter.config.AlexaEnvironments
import com.alexa.commandcenter.network.AlexaApiClient
import com.alexa.commandcenter.network.ConnectivityMonitor
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.security.AndroidDeviceIdentity
import com.alexa.commandcenter.security.AndroidSecureValues
import com.alexa.commandcenter.security.DeviceRegistrationStore
import com.alexa.commandcenter.security.SecureCache
import com.alexa.commandcenter.security.SessionStore
import com.alexa.commandcenter.ui.AlexaApp
import com.alexa.commandcenter.ui.AlexaViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
  private lateinit var model: AlexaViewModel

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val environment = AlexaEnvironments.current()
    val secureValues = AndroidSecureValues(this)
    val sessionStore = SessionStore(secureValues)
    model = AlexaViewModel(
      repository = AlexaRepository(
        api = AlexaApiClient.create(environment, sessionStore),
        deviceIdentity = AndroidDeviceIdentity(),
        registrationStore = DeviceRegistrationStore(secureValues),
        sessionStore = sessionStore,
        cache = SecureCache(secureValues),
      ),
      connectivity = ConnectivityMonitor(this),
    )
    lifecycleScope.launch { model.requestsBiometric.collectLatest { showBiometric() } }
    lifecycleScope.launch {
      model.state.collectLatest { state ->
        if (state.shouldSecureWindow) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
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
      )
    }
  }

  override fun onStart() { super.onStart(); if (::model.isInitialized) model.onForeground() }
  override fun onStop() { if (::model.isInitialized) model.onBackground(); super.onStop() }

  private fun showBiometric() {
    val allowed = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(this).canAuthenticate(allowed) != BiometricManager.BIOMETRIC_SUCCESS) {
      model.onBiometricCancelled()
      return
    }
    BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = model.onBiometricSucceeded()
      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = model.onBiometricCancelled()
    }).authenticate(
      BiometricPrompt.PromptInfo.Builder()
        .setTitle("Unlock Alexa")
        .setSubtitle("Confirm your identity to access the Command Center")
        .setAllowedAuthenticators(allowed)
        .build(),
    )
  }
}
