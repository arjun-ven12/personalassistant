package com.alexa.commandcenter.model

enum class MobileVoiceState {
  IDLE,
  RECORDING,
  PROCESSING_AUDIO,
  TRANSCRIBING,
  SUBMITTING,
  THINKING,
  SPEAKING,
  INTERRUPTED,
  ERROR,
}

enum class MicrophoneAccess { UNKNOWN, GRANTED, DENIED, PERMANENTLY_DENIED }

data class ConversationCenter(
  val sessions: List<ConversationSession> = emptyList(),
  val history: List<ConversationTurn> = emptyList(),
)

data class ConversationSession(
  val id: String,
  val voiceSessionId: String? = null,
  val title: String = "Conversation",
  val lifecycleState: String = "idle",
  val modality: String = "mixed",
  val updatedAt: String = "",
)

data class ConversationTurn(
  val id: String,
  val conversationId: String? = null,
  val sessionId: String? = null,
  val role: String = "user",
  val transcript: String,
  val confidence: Double = 1.0,
  val responseText: String? = null,
  val responseSource: String = "PRECODED",
  val executionStatus: String = "NONE",
  val clarificationReason: String? = null,
  val createdAt: String,
)

data class VoiceSession(
  val id: String,
  val status: String,
  val runtimeState: String,
  val updatedAt: String,
)

data class VoiceDashboard(
  val sessions: List<VoiceSession> = emptyList(),
  val conversationSessions: List<ConversationSession> = emptyList(),
  val conversationHistory: List<ConversationTurn> = emptyList(),
)

data class VoiceTranscriptResponse(
  val dashboard: VoiceDashboard,
  val conversation: ConversationTurn,
  val routed: Boolean,
  val responseText: String? = null,
  val approvalRequestId: String? = null,
  val classification: String = "ANSWER",
  val routeStages: List<String> = emptyList(),
)

data class VoiceCaptureLeaseResponse(
  val status: String,
  val owner: String? = null,
  val expiresAt: String? = null,
)

data class PendingConversationTurn(
  val turnId: String,
  val voiceSessionId: String,
  val transcript: String,
  val confidence: Double,
  val language: String?,
)

data class ConversationMessage(
  val id: String,
  val role: String,
  val text: String,
  val createdAt: String,
  val status: String,
  val confidence: Double? = null,
  val approvalRequestId: String? = null,
)

fun projectConversationMessages(turns: List<ConversationTurn>): List<ConversationMessage> =
  turns.sortedWith(compareBy<ConversationTurn> { it.createdAt }.thenBy { it.id }).flatMap { turn ->
    buildList {
      add(
        ConversationMessage(
          id = turn.id,
          role = turn.role,
          text = turn.transcript,
          createdAt = turn.createdAt,
          status = turn.executionStatus,
          confidence = turn.confidence,
        ),
      )
      turn.responseText?.takeIf(String::isNotBlank)?.let { response ->
        add(
          ConversationMessage(
            id = "${turn.id}:response",
            role = "assistant",
            text = response,
            createdAt = turn.createdAt,
            status = turn.executionStatus,
          ),
        )
      }
    }
  }

class VoiceStateMachine(initial: MobileVoiceState = MobileVoiceState.IDLE) {
  var state: MobileVoiceState = initial
    private set

  fun recordingStarted() = transition(setOf(MobileVoiceState.IDLE, MobileVoiceState.SPEAKING, MobileVoiceState.ERROR), MobileVoiceState.RECORDING)
  fun recordingReleased() = transition(setOf(MobileVoiceState.RECORDING), MobileVoiceState.PROCESSING_AUDIO)
  fun transcribing() = transition(setOf(MobileVoiceState.PROCESSING_AUDIO), MobileVoiceState.TRANSCRIBING)
  fun submitting() = transition(setOf(MobileVoiceState.TRANSCRIBING, MobileVoiceState.IDLE, MobileVoiceState.ERROR), MobileVoiceState.SUBMITTING)
  fun thinking() = transition(setOf(MobileVoiceState.SUBMITTING), MobileVoiceState.THINKING)
  fun speaking() = transition(setOf(MobileVoiceState.THINKING, MobileVoiceState.IDLE), MobileVoiceState.SPEAKING)
  fun completed() = transition(MobileVoiceState.entries.toSet(), MobileVoiceState.IDLE)
  fun interrupted() = transition(MobileVoiceState.entries.toSet(), MobileVoiceState.INTERRUPTED)
  fun failed() = transition(MobileVoiceState.entries.toSet(), MobileVoiceState.ERROR)

  private fun transition(allowed: Set<MobileVoiceState>, next: MobileVoiceState) {
    check(state in allowed) { "Invalid voice transition: $state -> $next" }
    state = next
  }
}
