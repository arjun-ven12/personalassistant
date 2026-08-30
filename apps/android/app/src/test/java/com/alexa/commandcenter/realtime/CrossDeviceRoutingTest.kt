package com.alexa.commandcenter.realtime

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrossDeviceRoutingTest {
  @Test fun recognizesExplicitCrossDeviceRequests() {
    assertTrue(CrossDeviceRouting.isTargetedUtterance("Open Chrome on my Mac"))
    assertTrue(CrossDeviceRouting.isTargetedUtterance("Show this on my phone"))
    assertTrue(CrossDeviceRouting.isTargetedUtterance("Open approvals on the web"))
    assertTrue(CrossDeviceRouting.isTargetedUtterance("Open approvals here"))
  }

  @Test fun leavesOrdinaryAndUnsafeCommandsToCanonicalConversationRouting() {
    assertFalse(CrossDeviceRouting.isTargetedUtterance("What should I work on?"))
    assertFalse(CrossDeviceRouting.isTargetedUtterance("Run rm -rf"))
  }
}
