package com.alexa.commandcenter.notifications

import com.alexa.commandcenter.model.NotificationTarget
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object ExecutiveRefreshEvents {
  private val mutableEvents = MutableSharedFlow<NotificationTarget>(
    extraBufferCapacity = 16,
    onBufferOverflow = BufferOverflow.DROP_OLDEST,
  )

  val events = mutableEvents.asSharedFlow()

  fun publish(target: NotificationTarget) {
    if (target.isValid()) mutableEvents.tryEmit(target)
  }
}
