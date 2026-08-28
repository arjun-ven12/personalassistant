package com.alexa.commandcenter.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ConversationModelsTest {
  @Test
  fun `voice state follows bounded push to talk lifecycle`() {
    val state = VoiceStateMachine()

    state.recordingStarted()
    assertEquals(MobileVoiceState.RECORDING, state.state)
    state.recordingReleased()
    state.transcribing()
    state.submitting()
    state.thinking()
    state.speaking()
    state.completed()

    assertEquals(MobileVoiceState.IDLE, state.state)
  }

  @Test
  fun `invalid voice transitions fail closed`() {
    val state = VoiceStateMachine()

    assertThrows(IllegalStateException::class.java) { state.thinking() }
    assertEquals(MobileVoiceState.IDLE, state.state)
  }

  @Test
  fun `conversation projection preserves canonical order and assistant response`() {
    val messages = projectConversationMessages(
      listOf(
        ConversationTurn("later", "conversation", "voice", transcript = "Second", responseText = "Two", createdAt = "2026-01-02T00:00:00Z"),
        ConversationTurn("first", "conversation", "voice", transcript = "First", responseText = "One", createdAt = "2026-01-01T00:00:00Z"),
      ),
    )

    assertEquals(listOf("First", "One", "Second", "Two"), messages.map { it.text })
    assertEquals(listOf("user", "assistant", "user", "assistant"), messages.map { it.role })
  }

  @Test
  fun `pending turn retains one stable id for retry`() {
    val turn = PendingConversationTurn("turn-id", "session-id", "Send the proposal", 1.0, null)
    val retry = turn.copy()

    assertEquals(turn.turnId, retry.turnId)
    assertEquals(turn.voiceSessionId, retry.voiceSessionId)
  }
}
