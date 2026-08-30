package com.alexa.commandcenter.realtime

object CrossDeviceRouting {
  private val explicitTarget = Regex(
    "(?i)\\b(on|to|there|that device|same device)\\s+((my|the)\\s+)?(mac|macbook|desktop|phone|android|mobile|web|browser|website|dashboard)\\b",
  )
  private val currentView = Regex(
    "(?i)\\b(show|open)\\s+(this|current (screen|page))\\s+(on|there)\\b",
  )

  fun isTargetedUtterance(value: String): Boolean =
    explicitTarget.containsMatchIn(value) || currentView.containsMatchIn(value) ||
      Regex("(?i)\\b(here|this device|current device)\\b").containsMatchIn(value)
}
