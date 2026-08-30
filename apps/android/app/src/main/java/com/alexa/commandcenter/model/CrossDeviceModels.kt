package com.alexa.commandcenter.model

data class CrossDeviceClient(
  val id: String,
  val ownerId: String,
  val sessionId: String,
  val trustedDeviceId: String?,
  val clientType: String,
  val displayName: String,
  val platform: String,
  val capabilities: List<String>,
  val currentRoute: String?,
  val presence: String,
  val connectedAt: String,
  val lastSeenAt: String,
  val leaseExpiresAt: String,
)

data class CrossDeviceArguments(
  val route: String? = null,
  val objectId: String? = null,
  val applicationId: String? = null,
  val url: String? = null,
)

data class CrossDeviceCommand(
  val id: String,
  val targetType: String?,
  val targetId: String?,
  val targetDisplayName: String?,
  val capability: String?,
  val arguments: CrossDeviceArguments = CrossDeviceArguments(),
  val status: String,
  val failureCode: String?,
  val safeMessage: String,
  val executionRequestId: String?,
  val approvalRequestId: String?,
  val expiresAt: String,
)

data class CrossDeviceUtteranceResponse(
  val handled: Boolean,
  val command: CrossDeviceCommand?,
  val responseText: String?,
  val clarificationTargets: List<String> = emptyList(),
)

data class CrossDevicePollResponse(
  val client: CrossDeviceClient,
  val commands: List<CrossDeviceCommand> = emptyList(),
  val polledAt: String,
)
