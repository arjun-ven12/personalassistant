package com.alexa.commandcenter.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExecutiveNotificationPolicyTest {
  @Test fun `validates an approval deep link without treating payload as authority`() {
    val notification = ExecutiveNotificationPolicy.parse(
      mapOf(
        "type" to "APPROVAL_REQUIRED",
        "objectKind" to "APPROVAL",
        "objectId" to "00000000-0000-4000-8000-000000000003",
        "eventId" to "approval:event",
        "severity" to "HIGH",
        "title" to "Alexa approval required",
        "approved" to "true",
      ),
    )

    assertEquals("APPROVAL", notification?.target?.kind)
    assertEquals("executive_urgent", ExecutiveNotificationPolicy.channel(notification!!.severity))
    assertFalse(ExecutiveNotificationPolicy.usesHighTransportPriority(notification.severity))
  }

  @Test fun `rejects arbitrary object kinds and unsafe identifiers`() {
    assertNull(ExecutiveNotificationPolicy.parse(mapOf("type" to "SECURITY_EVENT", "objectKind" to "SHELL", "objectId" to "/bin/zsh", "severity" to "CRITICAL")))
  }

  @Test fun `keeps lock screen copy generic and reserves high transport priority for critical`() {
    assertEquals("Athena executive update", ExecutiveNotificationPolicy.PUBLIC_TITLE)
    assertEquals("Open Athena to review securely.", ExecutiveNotificationPolicy.PUBLIC_TEXT)
    assertTrue(ExecutiveNotificationPolicy.usesHighTransportPriority("CRITICAL"))
    assertFalse(ExecutiveNotificationPolicy.usesHighTransportPriority("HIGH"))
  }
}
