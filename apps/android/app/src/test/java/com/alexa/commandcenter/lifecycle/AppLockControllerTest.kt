package com.alexa.commandcenter.lifecycle

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockControllerTest {
  @Test fun `resume within grace period remains unlocked`() {
    val controller = AppLockController(graceMillis = 60_000)
    controller.onBackground(1_000)

    assertFalse(controller.requiresBiometricOnForeground(60_000))
  }

  @Test fun `resume after grace period requires a biometric gate once`() {
    val controller = AppLockController(graceMillis = 60_000)
    controller.onBackground(1_000)

    assertTrue(controller.requiresBiometricOnForeground(61_001))
    assertFalse(controller.requiresBiometricOnForeground(61_002))
  }
}
