package com.alexa.commandcenter.widget

import com.alexa.commandcenter.model.Approval
import com.alexa.commandcenter.model.CommandCenterSnapshot
import com.alexa.commandcenter.model.WorkforceGraph
import com.alexa.commandcenter.model.WorkforceSummary
import org.junit.Assert.assertEquals
import org.junit.Test

class MondayOsWidgetSnapshotTest {
  @Test
  fun `widget snapshot uses canonical workforce totals and at most three pending approvals`() {
    val approvals = (1..4).map { index ->
      Approval(
        id = "00000000-0000-4000-8000-00000000000$index",
        toolName = "security.modify",
        riskLevel = "high",
        approvalRequirement = "recent_authentication",
        status = if (index == 2) "APPROVED" else "PENDING",
        humanSummary = "Review governed action $index",
        requestedAt = "2026-08-31T00:00:00.000Z",
        expiresAt = "2026-08-31T00:05:00.000Z",
      )
    }
    val snapshot = MondayOsWidgetSnapshot.from(
      CommandCenterSnapshot(
        workforce = WorkforceGraph(summary = WorkforceSummary(active = 7, dormant = 105)),
        approvals = approvals + approvals.first().copy(
          id = "00000000-0000-4000-8000-000000000099",
          humanSummary = "Fourth pending item",
        ),
      ),
      now = 123L,
    )

    assertEquals(7, snapshot.activeAgents)
    assertEquals(105, snapshot.dormantAgents)
    assertEquals(3, snapshot.approvals.size)
    assertEquals(123L, snapshot.updatedAt)
    assertEquals(listOf("Review governed action 1", "Review governed action 3", "Review governed action 4"), snapshot.approvals.map { it.summary })
  }
}
