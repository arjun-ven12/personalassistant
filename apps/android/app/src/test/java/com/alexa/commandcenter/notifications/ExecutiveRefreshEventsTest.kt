package com.alexa.commandcenter.notifications

import com.alexa.commandcenter.model.NotificationTarget
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class ExecutiveRefreshEventsTest {
  @Test
  fun `validated executive event is delivered to the foreground refresh path`() = runBlocking {
    val expected = NotificationTarget("APPROVAL", "approval-123", "event-123")
    val received = async(start = CoroutineStart.UNDISPATCHED) { ExecutiveRefreshEvents.events.first() }

    ExecutiveRefreshEvents.publish(expected)

    assertEquals(expected, received.await())
  }
}
