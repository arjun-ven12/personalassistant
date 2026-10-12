package com.alexa.commandcenter.model

import org.junit.Assert.*
import org.junit.Test
import com.google.gson.Gson
import java.time.Instant

class EngineeringModelsTest {
  @Test fun `coding telemetry is a backward compatible display projection`() {
    val model = Gson().fromJson("""{"taskId":"task","provider":"athena_coder","model":"registered-version","localAttempt":"PASS","paidCostAvoidedUsd":null,"attempts":[]}""", EngineeringCodingModel::class.java)
    assertEquals("athena_coder", model.provider)
    assertEquals("PASS", model.localAttempt)
    assertNull(model.paidCostAvoidedUsd)
    val old = Gson().fromJson("""{"overallProgress":0,"elapsedMs":0,"recoveryAvailable":false,"completedTasks":0,"blockedTasks":0,"totalTasks":0}""", EngineeringBuild::class.java)
    assertTrue(old.codingModels.orEmpty().isEmpty())
  }
  private val company = "10000000-0000-4000-8000-000000000001"
  private val build = "20000000-0000-4000-8000-000000000002"
  @Test fun `canonical snapshot cannot cross company scope`() {
    val delivery = EngineeringDelivery(build, company, build, build, "Project", "Request", "FEATURE", "IMPLEMENTING", "2026-10-03T00:00:00Z", "2026-10-03T00:00:00Z")
    val snapshot = EngineeringSnapshot(company, listOf(delivery), emptyList(), 1)
    assertTrue(EngineeringSafety.snapshotMatches(snapshot, company))
    assertFalse(EngineeringSafety.snapshotMatches(snapshot, build))
    assertFalse(EngineeringSafety.snapshotMatches(snapshot.copy(deliveries = listOf(delivery.copy(companyId = build))), company))
  }
  @Test fun `preview needs HTTPS health and unexpired server evidence`() {
    val now = Instant.parse("2026-10-03T00:00:00Z")
    val preview = EngineeringPreview(build, "RUNNING", "PASS", "https://preview.example.test/workspace", "2026-10-03T01:00:00Z")
    assertNotNull(EngineeringSafety.previewUrl(preview, now))
    listOf("http://localhost:4173", "file:///etc/passwd", "https://user:secret@preview.example.test/", "javascript:alert(1)").forEach {
      assertNull(EngineeringSafety.previewUrl(preview.copy(url = it), now))
    }
    assertNull(EngineeringSafety.previewUrl(preview.copy(healthStatus = "PENDING"), now))
    assertNull(EngineeringSafety.previewUrl(preview.copy(state = "STARTING"), now))
    assertNull(EngineeringSafety.previewUrl(preview.copy(expiresAt = now.toString()), now))
  }
  @Test fun `stale candidate cannot request merge`() {
    val head = "a".repeat(40)
    val candidate = EngineeringCandidate(build, company, build, build, "READY", head, head, head, "A reviewed patch")
    assertTrue(EngineeringSafety.candidateIsReviewable(candidate, company))
    assertFalse(EngineeringSafety.candidateIsReviewable(candidate.copy(reviewedHeadCommit = "b".repeat(40)), company))
    assertFalse(EngineeringSafety.candidateIsReviewable(candidate.copy(status = "BLOCKED"), company))
    assertFalse(EngineeringSafety.candidateIsReviewable(candidate, build))
  }
}
