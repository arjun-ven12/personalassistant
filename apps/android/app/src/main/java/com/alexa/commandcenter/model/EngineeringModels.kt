package com.alexa.commandcenter.model

import java.net.URI
import java.time.Instant
import java.util.UUID

// Read projections of canonical shared Engineering contracts; no client authority fields.
data class EngineeringDeliveryList(val deliveries: List<EngineeringDelivery> = emptyList())
data class EngineeringProjectList(val projects: List<EngineeringProject> = emptyList())
data class EngineeringProject(
  val repositoryId: String, val companyId: String, val projectName: String,
  val repositoryName: String, val defaultBranch: String, val repositoryStatus: String,
  val stack: List<String> = emptyList(), val latestDeliveryId: String? = null,
)
data class EngineeringCreateRequest(
  val request: String, val repositoryId: String? = null,
  val developmentRootWorkspaceId: String? = null, val projectName: String? = null,
  val acceptanceCriteria: List<String> = emptyList(), val idempotencyKey: String,
)
data class SelfEngineeringCreateRequest(
  val request: String, val acceptanceCriteria: List<String> = emptyList(), val idempotencyKey: String,
)
data class EngineeringInstruction(val instruction: String, val idempotencyKey: String)
data class EngineeringAnswer(val answer: String, val idempotencyKey: String)
data class EngineeringMergeRequest(val idempotencyKey: String)
data class EngineeringRejectRequest(val reason: String? = null)
data class EngineeringFeature(val id: String, val name: String, val status: String, val taskIds: List<String> = emptyList())
data class EngineeringValidation(
  val lint: String = "WAITING", val typecheck: String = "WAITING", val tests: String = "WAITING",
  val build: String = "WAITING", val review: String = "WAITING",
)
data class EngineeringModelUsage(val tier: String, val calls: Int, val inputTokens: Int, val outputTokens: Int, val costUsd: String)
data class EngineeringPreview(
  val previewId: String, val state: String, val healthStatus: String,
  val url: String? = null, val expiresAt: String? = null, val failureSummary: String? = null,
)
data class EngineeringDelivery(
  val id: String, val companyId: String, val objectiveId: String, val repositoryId: String,
  val projectName: String, val sourceRequest: String, val intent: String, val status: String,
  val createdAt: String, val updatedAt: String, val integrationRunId: String? = null,
  val candidateId: String? = null, val features: List<EngineeringFeature> = emptyList(),
  val validation: EngineeringValidation = EngineeringValidation(),
  val modelUsage: List<EngineeringModelUsage> = emptyList(), val filesChanged: List<String> = emptyList(),
  val warnings: List<String> = emptyList(), val preview: EngineeringPreview? = null,
)
data class EngineeringActiveAgent(
  val agentId: String, val role: String, val taskId: String, val taskTitle: String,
  val status: String, val modelTier: String, val elapsedMs: Long, val attempt: Int,
)
data class EngineeringBlocker(val category: String, val message: String, val action: String)
data class EngineeringTimeline(val id: String, val at: String, val type: String, val summary: String)
data class EngineeringCodingModel(
  val taskId: String, val provider: String? = null, val model: String? = null,
  val localAttempt: String = "UNKNOWN", val paidCostAvoidedUsd: Double? = null,
)
data class EngineeringBuild(
  val delivery: EngineeringDelivery, val overallProgress: Double, val elapsedMs: Long,
  val recoveryAvailable: Boolean, val completedTasks: Int, val blockedTasks: Int, val totalTasks: Int,
  val activeAgents: List<EngineeringActiveAgent> = emptyList(),
  val codingModels: List<EngineeringCodingModel>? = null,
  val timeline: List<EngineeringTimeline> = emptyList(), val blocker: EngineeringBlocker? = null,
)
data class EngineeringClarification(val id: String, val question: String, val status: String)
data class EngineeringObjectiveDetail(val id: String, val companyId: String, val status: String, val clarification: EngineeringClarification? = null)
data class EngineeringObjectiveView(val objective: EngineeringObjectiveDetail)
data class SelfEngineeringView(val controlCenter: EngineeringBuild, val riskLevel: String, val engineeringMode: String, val requiresOwnerApproval: Boolean)
data class EngineeringCandidate(
  val id: String, val companyId: String, val repositoryId: String, val objectiveId: String,
  val status: String, val headCommit: String, val validatedHeadCommit: String, val reviewedHeadCommit: String,
  val diffSummary: String, val filesChanged: List<String> = emptyList(),
  val warnings: List<String> = emptyList(), val risks: List<String> = emptyList(),
  val securityReviewId: String? = null, val rejectionReason: String? = null,
)
data class EngineeringReview(val id: String, val verdict: String, val headCommit: String, val findings: List<String> = emptyList(), val evidence: List<String> = emptyList())
data class EngineeringIntegration(val candidate: EngineeringCandidate? = null, val reviews: List<EngineeringReview> = emptyList())
data class EngineeringSnapshot(
  val companyId: String, val deliveries: List<EngineeringDelivery>, val projects: List<EngineeringProject>,
  val updatedAt: Long,
)
object EngineeringSafety {
  private val terminal = setOf("DONE", "DONE_WITH_WARNINGS", "FAILED", "CANCELLED")
  fun isActive(status: String) = status !in terminal
  fun validId(value: String) = runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)
  fun snapshotMatches(snapshot: EngineeringSnapshot, companyId: String): Boolean = runCatching {
    snapshot.companyId == companyId && validId(companyId) && snapshot.deliveries.size <= 100 &&
      snapshot.projects.size <= 100 && snapshot.deliveries.all { validId(it.id) && it.companyId == companyId } &&
      snapshot.projects.all { validId(it.repositoryId) && it.companyId == companyId }
  }.getOrDefault(false)
  fun buildMatches(build: EngineeringBuild, companyId: String, deliveryId: String): Boolean = runCatching {
    build.delivery.companyId == companyId && build.delivery.id == deliveryId && validId(deliveryId) &&
      build.overallProgress.isFinite() && build.overallProgress in 0.0..100.0 && build.elapsedMs >= 0 &&
      build.delivery.features.size <= 30 && build.activeAgents.size <= 6 && build.timeline.size <= 200
  }.getOrDefault(false)
  fun candidateIsReviewable(candidate: EngineeringCandidate?, companyId: String): Boolean =
    candidate != null && candidate.companyId == companyId && candidate.status == "READY" &&
      candidate.headCommit.matches(Regex("[a-f0-9]{40,64}")) &&
      candidate.headCommit == candidate.validatedHeadCommit && candidate.headCommit == candidate.reviewedHeadCommit
  // Localhost belongs to the phone, not the Mac. Never pass session cookies to previews.
  fun previewUrl(preview: EngineeringPreview?, now: Instant = Instant.now()): String? = runCatching {
    if (preview?.state != "RUNNING" || preview.healthStatus != "PASS" || preview.expiresAt == null ||
      !Instant.parse(preview.expiresAt).isAfter(now)) return null
    val uri = URI(preview.url ?: return null)
    if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null ||
      uri.host.lowercase() in setOf("localhost", "127.0.0.1", "::1") || uri.fragment != null) return null
    uri.toASCIIString()
  }.getOrNull()
}

data class EngineeringGitHubBinding(val companyId: String, val provider: String, val credentialRef: String?, val status: String, val integrationId: String)
data class EngineeringCompanyConnections(val integrations: List<EngineeringGitHubBinding> = emptyList())
data class EngineeringGitHubRepository(val providerRepositoryId: Long, val fullName: String, val defaultBranch: String, val private: Boolean, val registrationId: String)
data class EngineeringGitHubRepositories(val repositories: List<EngineeringGitHubRepository> = emptyList())
data class EngineeringToolRequest(val invocationId: String, val toolId: String, val arguments: Map<String, Any>, val approvalId: String?, val idempotencyKey: String, val requestedAt: String)
data class EngineeringToolResult(val invocationId: String, val toolId: String, val providerId: String, val status: String, val structuredOutput: com.google.gson.JsonElement?, val failureCode: String?)

data class EngineeringProjectInput(val id: String, val objectiveId: String, val fileName: String, val mimeType: String, val byteLength: Int, val sha256: String, val provenance: String, val createdAt: String)
data class EngineeringProjectInputs(val inputs: List<EngineeringProjectInput> = emptyList())
data class EngineeringProjectInputUpload(val fileName: String, val mimeType: String, val contentBase64: String, val idempotencyKey: String)
