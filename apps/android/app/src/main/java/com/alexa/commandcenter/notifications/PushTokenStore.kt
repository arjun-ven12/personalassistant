package com.alexa.commandcenter.notifications

import com.alexa.commandcenter.security.SecureValues

class PushTokenStore(private val values: SecureValues) {
  fun save(token: String) = values.write(KEY, token)
  fun load(): String? = values.read(KEY)
  fun clear() = values.remove(KEY)

  private companion object { const val KEY = "fcm_push_token" }
}
