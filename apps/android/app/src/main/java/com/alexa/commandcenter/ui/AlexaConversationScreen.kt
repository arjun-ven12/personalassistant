package com.alexa.commandcenter.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.*

private val ConversationSurface = Color(0xFF12141D)
private val ConversationElevated = Color(0xFF171A25)
private val ConversationBorder = Color(0xFF2B2F3B)
private val ConversationBlue = Color(0xFF8EABFF)
private val ConversationGreen = Color(0xFF53D99B)
private val ConversationRed = Color(0xFFFF6C7B)

@Composable
fun AlexaConversationScreen(
  state: AlexaUiState,
  environment: AlexaEnvironmentConfig,
  onRefresh: () -> Unit,
  onRequestMicrophonePermission: () -> Unit,
  onStartRecording: () -> Unit,
  onReleaseRecording: () -> Unit,
  onCancelRecording: () -> Unit,
  onSubmitMessage: (String) -> Unit,
  onRetryMessage: () -> Unit,
  onStopResponse: () -> Unit,
  onStopSpeaking: () -> Unit,
  onTtsEnabled: (Boolean) -> Unit,
  onNewConversation: () -> Unit,
  onSelectConversation: (String) -> Unit,
  onLoadEarlierMessages: () -> Unit,
  onOpenSecondary: (String) -> Unit,
  onOpenApprovals: () -> Unit,
  onLock: () -> Unit,
  onForgetDevice: () -> Unit,
) {
  var draft by rememberSaveable(state.selectedConversationId) { mutableStateOf("") }
  var conversationMenu by remember { mutableStateOf(false) }
  var operationsMenu by remember { mutableStateOf(false) }
  val sessions = state.conversations?.sessions.orEmpty().sortedByDescending { it.updatedAt }
  val selectedSession = sessions.firstOrNull { it.id == state.selectedConversationId }
  val selectedTurns = state.conversations?.history.orEmpty()
    .filter { it.conversationId == state.selectedConversationId }
    .sortedWith(compareBy<ConversationTurn> { it.createdAt }.thenBy { it.id })
  val visibleTurns = selectedTurns.takeLast(state.visibleConversationMessages)
  val messages = projectConversationMessages(visibleTurns)
  val listState = rememberLazyListState()
  LaunchedEffect(messages.size, state.pendingTurn?.turnId) {
    val extra = if (state.pendingTurn != null) 1 else 0
    if (messages.isNotEmpty() || extra > 0) listState.scrollToItem((messages.size + extra - 1).coerceAtLeast(0))
  }

  Column(Modifier.fillMaxSize()) {
    Row(
      Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Box(Modifier.weight(1f)) {
        TextButton(onClick = { conversationMenu = true }) {
          Column(horizontalAlignment = Alignment.Start) {
            Text(
              selectedSession?.title ?: "New conversation",
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
              fontWeight = FontWeight.SemiBold,
              color = Color.White,
            )
            Text(
              if (state.connection == ConnectionState.ONLINE) "Shared Alexa conversation" else "Offline · cached history",
              style = MaterialTheme.typography.labelSmall,
              color = if (state.connection == ConnectionState.ONLINE) ConversationGreen else ConversationBlue,
            )
          }
          Icon(Icons.Outlined.ExpandMore, "Choose conversation", tint = Color.LightGray)
        }
        DropdownMenu(expanded = conversationMenu, onDismissRequest = { conversationMenu = false }) {
          DropdownMenuItem(
            text = { Text("New conversation") },
            leadingIcon = { Icon(Icons.Outlined.Add, null) },
            onClick = { conversationMenu = false; onNewConversation() },
          )
          sessions.take(20).forEach { session ->
            DropdownMenuItem(
              text = {
                Column {
                  Text(session.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                  Text(session.updatedAt, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                }
              },
              onClick = { conversationMenu = false; onSelectConversation(session.id) },
            )
          }
        }
      }
      IconButton(onClick = { onTtsEnabled(!state.ttsEnabled) }) {
        Icon(
          if (state.ttsEnabled) Icons.AutoMirrored.Outlined.VolumeUp else Icons.AutoMirrored.Outlined.VolumeOff,
          if (state.ttsEnabled) "Disable spoken responses" else "Enable spoken responses",
        )
      }
      IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh shared conversation") }
      Box {
        IconButton(onClick = { operationsMenu = true }) { Icon(Icons.Outlined.MoreVert, "Open Alexa operations") }
        DropdownMenu(expanded = operationsMenu, onDismissRequest = { operationsMenu = false }) {
          listOf("Activity", "Workflows", "Economy", "Experiments", "System").forEach { destination ->
            DropdownMenuItem(text = { Text(destination) }, onClick = { operationsMenu = false; onOpenSecondary(destination) })
          }
          HorizontalDivider()
          DropdownMenuItem(text = { Text("Lock Alexa") }, onClick = { operationsMenu = false; onLock() })
          DropdownMenuItem(
            text = { Text("Sign out and forget device", color = ConversationRed) },
            onClick = { operationsMenu = false; onForgetDevice() },
          )
          DropdownMenuItem(
            text = { Text(environment.environment.name) },
            enabled = false,
            onClick = {},
          )
        }
      }
    }
    HorizontalDivider(color = ConversationBorder)

    if (state.connection != ConnectionState.ONLINE) {
      Surface(color = ConversationBlue.copy(alpha = .1f), modifier = Modifier.fillMaxWidth()) {
        Text(
          "Offline. History may be stale; messages and voice commands are not sent.",
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          style = MaterialTheme.typography.bodySmall,
          color = ConversationBlue,
        )
      }
    }

    LazyColumn(
      state = listState,
      modifier = Modifier.weight(1f).fillMaxWidth(),
      contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      if (selectedTurns.size > visibleTurns.size) {
        item("load-earlier") {
          TextButton(onClick = onLoadEarlierMessages, modifier = Modifier.fillMaxWidth()) { Text("Load earlier messages") }
        }
      }
      if (messages.isEmpty() && state.pendingTurn == null) {
        item("empty") {
          Column(Modifier.fillParentMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Outlined.AutoAwesome, null, tint = ConversationBlue, modifier = Modifier.size(30.dp))
            Spacer(Modifier.height(10.dp))
            Text("Talk to the same Alexa", fontWeight = FontWeight.SemiBold)
            Text("Text or hold the microphone. Context stays in the canonical conversation.", color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
          }
        }
      }
      items(messages.size, key = { messages[it].id }) { index ->
        ConversationBubble(messages[index], onOpenApprovals)
      }
      state.pendingTurn?.let { pending ->
        item("pending-${pending.turnId}") {
          ConversationBubble(
            ConversationMessage(pending.turnId, "user", pending.transcript, "", state.voiceState.name, pending.confidence),
            onOpenApprovals,
          )
        }
      }
      if (state.voiceState in setOf(MobileVoiceState.SUBMITTING, MobileVoiceState.THINKING)) {
        item("thinking") { RuntimeStateRow("Alexa is thinking", showStop = true, onStop = onStopResponse) }
      }
      if (state.voiceState == MobileVoiceState.SPEAKING) {
        item("speaking") { RuntimeStateRow("Alexa is speaking", showStop = true, onStop = onStopSpeaking) }
      }
    }

    state.voiceError?.let { error ->
      Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.error.copy(alpha = .1f)).padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(error, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        if (state.pendingTurn != null) TextButton(onClick = onRetryMessage) { Text("Retry") }
      }
    }

    Row(
      Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
      verticalAlignment = Alignment.Bottom,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OutlinedTextField(
        value = draft,
        onValueChange = { draft = it.take(4_000) },
        modifier = Modifier.weight(1f),
        placeholder = { Text(if (state.connection == ConnectionState.ONLINE) "Ask Alexa" else "Draft while offline") },
        maxLines = 4,
        shape = RoundedCornerShape(10.dp),
        trailingIcon = {
          IconButton(
            onClick = { onSubmitMessage(draft); draft = "" },
            enabled = draft.isNotBlank() && state.connection == ConnectionState.ONLINE && state.pendingTurn == null,
          ) { Icon(Icons.AutoMirrored.Outlined.Send, "Send message") }
        },
      )
      if (state.voiceState == MobileVoiceState.RECORDING) {
        IconButton(onClick = onCancelRecording) {
          Icon(Icons.Outlined.Close, "Discard recording", tint = ConversationRed)
        }
      }
      PushToTalkButton(
        state = state,
        onRequestPermission = onRequestMicrophonePermission,
        onStart = onStartRecording,
        onRelease = onReleaseRecording,
      )
    }
  }
}

@Composable
private fun ConversationBubble(message: ConversationMessage, onOpenApprovals: () -> Unit) {
  val owner = message.role == "user"
  Row(Modifier.fillMaxWidth(), horizontalArrangement = if (owner) Arrangement.End else Arrangement.Start) {
    Surface(
      modifier = Modifier.widthIn(max = 330.dp),
      shape = RoundedCornerShape(8.dp),
      color = if (owner) ConversationBlue.copy(alpha = .15f) else ConversationElevated,
      border = BorderStroke(1.dp, if (owner) ConversationBlue.copy(alpha = .45f) else ConversationBorder),
    ) {
      Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(message.text)
        if (message.status !in setOf("NONE", "COMPLETED")) {
          Text(message.status.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = ConversationBlue)
        }
        if (message.status == "WAITING_APPROVAL") {
          TextButton(onClick = onOpenApprovals, contentPadding = PaddingValues(0.dp)) { Text("Review approval") }
        }
        message.confidence?.takeIf { owner && it < .75 }?.let {
          Text("Transcript confidence ${(it * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = Color.LightGray)
        }
      }
    }
  }
}

@Composable
private fun RuntimeStateRow(label: String, showStop: Boolean, onStop: () -> Unit) {
  Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = ConversationBlue)
    Spacer(Modifier.width(9.dp))
    Text(label, Modifier.weight(1f), color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
    if (showStop) TextButton(onClick = onStop) { Text("Stop") }
  }
}

@Composable
private fun PushToTalkButton(
  state: AlexaUiState,
  onRequestPermission: () -> Unit,
  onStart: () -> Unit,
  onRelease: () -> Unit,
) {
  val recording = state.voiceState == MobileVoiceState.RECORDING
  val enabled = state.connection == ConnectionState.ONLINE && state.pendingTurn == null
  val haptics = LocalHapticFeedback.current
  Surface(
    modifier = Modifier
      .size(56.dp)
      .semantics { contentDescription = if (recording) "Recording. Tap to stop and send." else "Start voice recording." }
      .clickable(enabled = enabled) {
        if (state.microphoneAccess != MicrophoneAccess.GRANTED) {
          onRequestPermission()
        } else if (recording) {
          haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
          onRelease()
        } else {
          haptics.performHapticFeedback(HapticFeedbackType.LongPress)
          onStart()
        }
      },
    shape = CircleShape,
    color = when {
      !enabled -> ConversationBorder
      recording -> ConversationRed
      else -> ConversationBlue
    },
  ) {
    Box(contentAlignment = Alignment.Center) {
      Icon(if (recording) Icons.Outlined.GraphicEq else Icons.Outlined.Mic, null, tint = Color(0xFF0A0B0F))
    }
  }
}
