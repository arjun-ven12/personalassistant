package com.alexa.commandcenter.security

import com.alexa.commandcenter.model.DeviceRegistration
import com.alexa.commandcenter.model.DeviceTrustStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SecureStorageTest {
  @Test fun `device registration persists only bounded metadata`() {
    val values = InMemorySecureValues()
    val store = DeviceRegistrationStore(values)
    val registration = DeviceRegistration("device-1", "fingerprint", DeviceTrustStatus.PENDING, "pairing-token")

    store.save(registration)

    assertEquals(registration, store.load())
    store.clear()
    assertNull(store.load())
    assertNull(values.read("pairing_token"))
  }

  @Test fun `session clearing does not remove a trusted device registration`() {
    val values = InMemorySecureValues()
    val sessions = SessionStore(values)
    val devices = DeviceRegistrationStore(values)
    devices.save(DeviceRegistration("device-1", "fingerprint", DeviceTrustStatus.TRUSTED, null))
    sessions.saveCookie("session-cookie")

    sessions.clear()

    assertNull(sessions.cookie())
    assertEquals(DeviceTrustStatus.TRUSTED, devices.load()?.trustStatus)
  }

  private class InMemorySecureValues : SecureValues {
    private val values = mutableMapOf<String, String>()
    override fun read(key: String): String? = values[key]
    override fun write(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
    override fun clear() { values.clear() }
  }
}
