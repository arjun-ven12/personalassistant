package com.alexa.commandcenter.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

enum class ConnectionState { ONLINE, RECONNECTING, OFFLINE, DEGRADED }
enum class DeviceTrustStatus { PENDING, TRUSTED, REVOKED, EXPIRED, UNREGISTERED }

data class ApiHealth(
  val status: String,
  val deploymentMode: String,
  val components: Map<String, HealthComponent>,
)

data class HealthComponent(
  val state: String,
  val reasonCode: String,
)

data class AlexaSummary(
  val deploymentMode: String,
  val devices: List<DeviceSummary>,
  val capabilities: CapabilitySummary,
)

data class DeviceSummary(
  val id: String,
  val name: String,
  val type: String,
  val trustState: String,
  val presence: String,
  val lastSeenAt: String?,
)

data class CapabilitySummary(
  val deviceExecutable: DeviceCapabilities,
)

data class DeviceCapabilities(
  val macAgent: String,
)

data class LoginRequest(val email: String, val password: String)
data class AuthResponse(val success: Boolean, val user: Owner)
data class SessionResponse(val authenticated: Boolean, val user: Owner?)
data class Owner(val id: String, val email: String, val displayName: String)
data class CompanySummary(val id: String, val slug: String, val name: String, val status: String)
data class CompanyListResponse(val currentCompany: CompanySummary, val companies: List<CompanySummary>)
data class SelectCompanyRequest(val companyId: String)
data class CsrfResponse(val token: String, val expiresAt: String)
data class PairingIntent(val pairingCode: String, val expiresAt: String)
data class PairingRequest(
  val pairingCode: String,
  val deviceName: String,
  val deviceType: String = "ANDROID",
  val publicKey: PublicKeyJwk,
)
data class PairingResponse(
  val deviceId: String,
  val pairingRequestToken: String,
  val trustStatus: String,
)
data class PairingStatusRequest(val deviceId: String, val pairingRequestToken: String)
data class PairingStatusResponse(val deviceId: String, val trustStatus: String, val fingerprint: String)
data class PublicKeyJwk(
  val kty: String = "OKP",
  val crv: String = "Ed25519",
  val x: String,
  val ext: Boolean = true,
  @SerializedName("key_ops") val keyOps: List<String> = listOf("verify"),
)

data class SignedEnvelope(
  val commandId: String,
  val deviceId: String,
  val issuedAt: String,
  val expiresAt: String,
  val nonce: String,
  val payload: Map<String, JsonElement>,
  val signature: String,
  val signatureAlgorithm: String = "Ed25519",
  val protocolVersion: String = "1",
)

data class DeviceRegistration(
  val deviceId: String,
  val fingerprint: String,
  val trustStatus: DeviceTrustStatus,
  val pairingRequestToken: String?,
)

sealed interface AlexaFailure {
  data object Unauthorized : AlexaFailure
  data object DeviceRevoked : AlexaFailure
  data object DeviceNotEligible : AlexaFailure
  data object SignedRequestRejected : AlexaFailure
  data object NetworkUnavailable : AlexaFailure
  data object ServerUnavailable : AlexaFailure
  data object Timeout : AlexaFailure
  data object RateLimited : AlexaFailure
  data object RecentAuthRequired : AlexaFailure
  data object ApprovalConflict : AlexaFailure
  data object InvalidResponse : AlexaFailure
  data class Unknown(val safeMessage: String) : AlexaFailure
}

data class PushRegistrationResponse(
  val registered: Boolean,
  val deviceId: String,
  val enabled: Boolean,
  val updatedAt: String,
)

data class NotificationPreferences(
  val approvals: Boolean = true,
  val objectiveRisk: Boolean = true,
  val workflowFailures: Boolean = true,
  val budgetAlerts: Boolean = true,
  val securityAlerts: Boolean = true,
  val experimentResults: Boolean = true,
  val deviceEvents: Boolean = true,
)

data class NotificationPreferencesResponse(
  val preferences: NotificationPreferences = NotificationPreferences(),
  val securityAlertsMandatory: Boolean = true,
  val updatedAt: String,
)

data class RecentAuthChallenge(
  val challengeId: String,
  val challengeToken: String,
  val purpose: String,
  val expiresAt: String,
)

data class RecentAuthStatus(
  val active: Boolean,
  val purpose: String? = null,
  val expiresAt: String? = null,
)

data class BiometricKeyRegistrationResponse(val registered: Boolean, val deviceId: String)

data class ExecutiveAttention(
  val total: Int = 0,
  val pendingApprovals: Int = 0,
  val blockedObjectives: Int = 0,
  val atRiskObjectives: Int = 0,
  val criticalSecurityEvents: Int = 0,
)

data class NotificationTarget(val kind: String, val objectId: String, val eventId: String?, val companyId: String? = null) {
  fun isValid(): Boolean = kind in VALID_KINDS && objectId.length in 1..160 &&
    objectId.all { it.isLetterOrDigit() || it == '-' || it == '_' || it == ':' } &&
    (companyId == null || runCatching { java.util.UUID.fromString(companyId) }.isSuccess)

  companion object {
    private val VALID_KINDS = setOf("APPROVAL", "OBJECTIVE", "WORKFLOW", "AGENT", "ECONOMY", "EXPERIMENT", "SYSTEM", "DEVICE")
  }
}
