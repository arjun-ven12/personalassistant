package com.alexa.commandcenter.lifecycle

class AppLockController(private val graceMillis: Long = 5 * 60 * 1000L) {
  private var backgroundAt: Long? = null

  fun onBackground(now: Long) { backgroundAt = now }

  fun requiresBiometricOnForeground(now: Long): Boolean {
    val at = backgroundAt ?: return false
    backgroundAt = null
    return now - at > graceMillis
  }
}
