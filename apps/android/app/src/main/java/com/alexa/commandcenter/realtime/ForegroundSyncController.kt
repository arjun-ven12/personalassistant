package com.alexa.commandcenter.realtime

import com.alexa.commandcenter.model.ConnectionState
import kotlinx.coroutines.delay

class ForegroundSyncController {
  private var attempts = 0

  val pollIntervalMs: Long = 10_000L

  fun shouldRefreshExecutive(cycle: Int): Boolean = cycle >= 0 && cycle % 6 == 0

  fun nextState(networkAvailable: Boolean): ConnectionState = when {
    !networkAvailable -> ConnectionState.OFFLINE
    attempts == 0 -> ConnectionState.ONLINE
    else -> ConnectionState.RECONNECTING
  }

  suspend fun boundedReconnect(refresh: suspend () -> Boolean): Boolean {
    repeat(3) {
      if (refresh()) {
        attempts = 0
        return true
      }
      attempts += 1
      delay((1 shl it) * 500L)
    }
    return false
  }
}
