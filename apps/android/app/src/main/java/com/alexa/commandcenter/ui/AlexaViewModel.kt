package com.alexa.commandcenter.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alexa.commandcenter.lifecycle.AppLockController
import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.network.AlexaApiException
import com.alexa.commandcenter.network.ConnectivityMonitor
import com.alexa.commandcenter.realtime.ForegroundSyncController
import com.alexa.commandcenter.repository.AlexaRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

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
  val lastUpdatedAt: Long? = null,
  val device: DeviceRegistration? = null,
  val error: String? = null,
) { val shouldSecureWindow: Boolean get() = screen !is AlexaScreenState.Shell }

class AlexaViewModel(
  private val repository: AlexaRepository,
  private val connectivity: ConnectivityMonitor,
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
      mutableState.value = mutableState.value.copy(health = health, summary = summary, connection = ConnectionState.ONLINE, lastUpdatedAt = System.currentTimeMillis(), error = null)
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
    mutableState.value = mutableState.value.copy(
      health = health?.first ?: mutableState.value.health,
      summary = summary?.first ?: mutableState.value.summary,
      lastUpdatedAt = maxOf(health?.second ?: 0, summary?.second ?: 0).takeIf { it > 0 },
      connection = ConnectionState.OFFLINE,
      error = "Offline. Showing the last safely cached state.",
    )
  }

  private fun showFailure(error: Throwable) {
    val failure = (error as? AlexaApiException)?.failure
    if (failure == AlexaFailure.DeviceRevoked) {
      repository.clearAuthority()
      mutableState.value = mutableState.value.copy(screen = AlexaScreenState.Login, error = "This device is no longer trusted.")
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
      else -> "The request could not be completed."
    })
  }

  override fun onCleared() { connectivity.stop(); super.onCleared() }
}
