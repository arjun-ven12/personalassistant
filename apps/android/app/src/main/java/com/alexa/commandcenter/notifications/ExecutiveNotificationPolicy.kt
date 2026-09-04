package com.alexa.commandcenter.notifications

import com.alexa.commandcenter.model.NotificationTarget

data class ValidatedExecutiveNotification(
  val type: String,
  val severity: String,
  val title: String,
  val target: NotificationTarget,
)

object ExecutiveNotificationPolicy {
  const val PUBLIC_TITLE = "Athena executive update"
  const val PUBLIC_TEXT = "Open Athena to review securely."

  fun parse(data: Map<String, String>): ValidatedExecutiveNotification? {
    val target = NotificationTarget(
      kind = data["objectKind"] ?: return null,
      objectId = data["objectId"] ?: return null,
      eventId = data["eventId"],
      companyId = data["companyId"],
    )
    val type = data["type"] ?: return null
    val severity = data["severity"] ?: return null
    if (!target.isValid() || type !in CATEGORIES || severity !in SEVERITIES) return null
    return ValidatedExecutiveNotification(
      type = type,
      severity = severity,
      title = data["title"]?.take(100)?.takeIf { it.isNotBlank() } ?: PUBLIC_TITLE,
      target = target,
    )
  }

  fun channel(severity: String) = if (severity == "CRITICAL" || severity == "HIGH") "executive_urgent" else "executive_updates"
  fun usesHighTransportPriority(severity: String) = severity == "CRITICAL"

  private val SEVERITIES = setOf("LOW", "NORMAL", "HIGH", "CRITICAL")
  private val CATEGORIES = setOf(
    "APPROVAL_REQUIRED", "OBJECTIVE_AT_RISK", "OBJECTIVE_BLOCKED", "WORKFLOW_FAILED",
    "WORKFLOW_BLOCKED", "AGENT_ESCALATION", "BUDGET_WARNING", "BUDGET_APPROVAL",
    "SECURITY_EVENT", "DEVICE_EVENT", "EXPERIMENT_COMPLETED", "IMPORTANT_OBJECTIVE_COMPLETED",
  )
}
