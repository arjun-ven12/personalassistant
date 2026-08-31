package com.alexa.commandcenter.realtime

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundSyncControllerTest {
  @Test
  fun `executive state refresh stays on a bounded foreground cadence`() {
    val controller = ForegroundSyncController()

    assertTrue(controller.pollIntervalMs >= 10_000L)
    assertTrue(controller.shouldRefreshExecutive(0))
    assertFalse(controller.shouldRefreshExecutive(1))
    assertFalse(controller.shouldRefreshExecutive(2))
    assertTrue(controller.shouldRefreshExecutive(6))
    assertFalse(controller.shouldRefreshExecutive(-1))
  }
}
