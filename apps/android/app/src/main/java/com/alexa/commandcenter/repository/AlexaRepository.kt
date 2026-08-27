package com.alexa.commandcenter.repository

import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.network.AlexaApiClient
import com.alexa.commandcenter.network.AlexaApiException
import com.alexa.commandcenter.security.AndroidDeviceIdentity
import com.alexa.commandcenter.security.DeviceRegistrationStore
import com.alexa.commandcenter.security.SecureCache
import com.alexa.commandcenter.security.SessionStore
import com.google.gson.Gson
import com.google.gson.JsonPrimitive

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

  suspend fun registerDevice(pairingCode: String, deviceName: String): Result<DeviceRegistration> = api.requestPairing(
    PairingRequest(
      pairingCode = pairingCode.trim().uppercase(),
      deviceName = deviceName.trim(),
      publicKey = deviceIdentity.publicKey(),
    ),
  ).map { response ->
    DeviceRegistration(response.deviceId, deviceIdentity.fingerprint(), DeviceTrustStatus.PENDING, response.pairingRequestToken)
      .also(registrationStore::save)
  }

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
    return api.deviceSummary(deviceIdentity.signEnvelope(device.deviceId, mapOf("operation" to JsonPrimitive("system_summary"))))
      .onSuccess { cache.save("summary", gson.toJson(it), System.currentTimeMillis()) }
      .onFailure(::clearOnRevocation)
  }

  suspend fun refreshHealth(): Result<ApiHealth> = api.health().onSuccess {
    cache.save("health", gson.toJson(it), System.currentTimeMillis())
  }

  fun cachedSummary(): Pair<AlexaSummary, Long>? = cache.read("summary")?.let {
    runCatching { gson.fromJson(it.json, AlexaSummary::class.java) to it.updatedAt }.getOrNull()
  }
  fun cachedHealth(): Pair<ApiHealth, Long>? = cache.read("health")?.let {
    runCatching { gson.fromJson(it.json, ApiHealth::class.java) to it.updatedAt }.getOrNull()
  }
  fun registration() = registrationStore.load()
  fun hasSession() = sessionStore.cookie() != null

  fun clearSession() = sessionStore.clear()

  fun clearAuthority() {
    sessionStore.clear()
    registrationStore.clear()
    deviceIdentity.delete()
  }

  private fun clearOnRevocation(error: Throwable) {
    if ((error as? AlexaApiException)?.failure == AlexaFailure.DeviceRevoked) clearAuthority()
  }
}
