package com.alexa.commandcenter.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.alexa.commandcenter.model.DeviceRegistration
import com.alexa.commandcenter.model.DeviceTrustStatus

interface SecureValues {
  fun read(key: String): String?
  fun write(key: String, value: String)
  fun remove(key: String)
  fun clear()
}

class AndroidSecureValues(context: Context, fileName: String = "alexa.secure") : SecureValues {
  private val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()
  private val preferences = EncryptedSharedPreferences.create(
    context,
    fileName,
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
  )

  override fun read(key: String) = preferences.getString(key, null)
  override fun write(key: String, value: String) { preferences.edit().putString(key, value).apply() }
  override fun remove(key: String) { preferences.edit().remove(key).apply() }
  override fun clear() { preferences.edit().clear().apply() }
}

class SessionStore(private val secureValues: SecureValues) {
  fun saveCookie(cookie: String) = secureValues.write(SESSION_COOKIE, cookie)
  fun cookie() = secureValues.read(SESSION_COOKIE)
  fun clear() = secureValues.remove(SESSION_COOKIE)

  companion object { private const val SESSION_COOKIE = "session_cookie" }
}

class DeviceRegistrationStore(private val secureValues: SecureValues) {
  fun save(value: DeviceRegistration) {
    secureValues.write("device_id", value.deviceId)
    secureValues.write("device_fingerprint", value.fingerprint)
    secureValues.write("device_trust", value.trustStatus.name)
    value.pairingRequestToken?.let { secureValues.write("pairing_token", it) }
      ?: secureValues.remove("pairing_token")
  }

  fun load(): DeviceRegistration? {
    val id = secureValues.read("device_id") ?: return null
    val fingerprint = secureValues.read("device_fingerprint") ?: return null
    val trust = secureValues.read("device_trust")?.let(DeviceTrustStatus::valueOf) ?: return null
    return DeviceRegistration(id, fingerprint, trust, secureValues.read("pairing_token"))
  }

  fun clear() {
    listOf("device_id", "device_fingerprint", "device_trust", "pairing_token")
      .forEach(secureValues::remove)
  }
}

class SecureCache(private val secureValues: SecureValues) {
  fun save(key: String, json: String, updatedAt: Long) {
    secureValues.write("cache:$key", json)
    secureValues.write("cache:$key:updated", updatedAt.toString())
  }

  fun read(key: String): CachedValue? {
    val value = secureValues.read("cache:$key") ?: return null
    val updatedAt = secureValues.read("cache:$key:updated")?.toLongOrNull() ?: return null
    return CachedValue(value, updatedAt)
  }

  data class CachedValue(val json: String, val updatedAt: Long)
}
