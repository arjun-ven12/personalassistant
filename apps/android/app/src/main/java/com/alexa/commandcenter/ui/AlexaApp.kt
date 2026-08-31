package com.alexa.commandcenter.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.*
import java.text.DateFormat
import java.util.Date

@Composable
fun AlexaApp(
  state: AlexaUiState,
  environment: AlexaEnvironmentConfig,
  onLogin: (String, String) -> Unit,
  onCreatePairing: () -> Unit,
  onRegister: (String, String) -> Unit,
  onRefreshApproval: () -> Unit,
  onRefresh: () -> Unit,
  onCompanySelected: (String) -> Unit,
  onCompanyCreated: (String, String?, String?) -> Unit,
  onCompanyAction: (String, String) -> Unit,
  onLock: () -> Unit,
  onForgetDevice: () -> Unit,
  onCreateObjective: (CreateObjectiveRequest) -> Unit,
  onObjectiveAction: (String, String) -> Unit,
  onModifyObjective: (String, Int?, String?) -> Unit,
  onApprovalDecision: (String, Boolean) -> Unit,
  onAgentSelected: (String) -> Unit,
  onWorkflowSelected: (String) -> Unit,
  onExperimentsSelected: (String) -> Unit,
  onRequestMicrophonePermission: () -> Unit = {},
  onStartRecording: () -> Unit = {},
  onReleaseRecording: () -> Unit = {},
  onCancelRecording: () -> Unit = {},
  onSubmitMessage: (String) -> Unit = {},
  onRetryMessage: () -> Unit = {},
  onStopResponse: () -> Unit = {},
  onStopSpeaking: () -> Unit = {},
  onTtsEnabled: (Boolean) -> Unit = {},
  onNewConversation: () -> Unit = {},
  onSelectConversation: (String) -> Unit = {},
  onLoadEarlierMessages: () -> Unit = {},
  onApprovalSelected: (String) -> Unit = {},
  onNotificationTargetConsumed: () -> Unit = {},
  onExternalDestinationConsumed: () -> Unit = {},
  onNotificationPreferences: (NotificationPreferences) -> Unit = {},
  onApprovalDecisionWithReason: (String, Boolean, String?) -> Unit = { _, _, _ -> },
  onCrossDeviceCommandApplied: (String, Boolean, String) -> Unit = { _, _, _ -> },
) {
  MaterialTheme(colorScheme = AlexaDarkColorScheme) {
    Surface(color = AlexaBackground, modifier = Modifier.fillMaxSize()) {
      when (val screen = state.screen) {
        AlexaScreenState.Checking -> CenterMessage("Checking secure session")
        AlexaScreenState.Login -> LoginScreen(state.error, onLogin)
        is AlexaScreenState.Registration -> RegistrationScreen(screen, state.error, onCreatePairing, onRegister, onRefreshApproval)
        AlexaScreenState.BiometricLocked -> CenterMessage("Unlock Alexa with biometrics")
        AlexaScreenState.Shell -> CommandCenterShell(
          state = state,
          environment = environment,
          onRefresh = onRefresh,
          onCompanySelected = onCompanySelected,
          onCompanyCreated = onCompanyCreated,
          onCompanyAction = onCompanyAction,
          onLock = onLock,
          onForgetDevice = onForgetDevice,
          onCreateObjective = onCreateObjective,
          onObjectiveAction = onObjectiveAction,
          onModifyObjective = onModifyObjective,
          onApprovalDecision = onApprovalDecision,
          onAgentSelected = onAgentSelected,
          onWorkflowSelected = onWorkflowSelected,
          onExperimentsSelected = onExperimentsSelected,
          onApprovalSelected = onApprovalSelected,
          onNotificationTargetConsumed = onNotificationTargetConsumed,
          onExternalDestinationConsumed = onExternalDestinationConsumed,
          onNotificationPreferences = onNotificationPreferences,
          onApprovalDecisionWithReason = onApprovalDecisionWithReason,
          onCrossDeviceCommandApplied = onCrossDeviceCommandApplied,
          onRequestMicrophonePermission = onRequestMicrophonePermission,
          onStartRecording = onStartRecording,
          onReleaseRecording = onReleaseRecording,
          onCancelRecording = onCancelRecording,
          onSubmitMessage = onSubmitMessage,
          onRetryMessage = onRetryMessage,
          onStopResponse = onStopResponse,
          onStopSpeaking = onStopSpeaking,
          onTtsEnabled = onTtsEnabled,
          onNewConversation = onNewConversation,
          onSelectConversation = onSelectConversation,
          onLoadEarlierMessages = onLoadEarlierMessages,
        )
      }
    }
  }
}

@Composable private fun LoginScreen(error: String?, onLogin: (String, String) -> Unit) {
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("Monday OS", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.SemiBold)
    Text("Command Center", color = AlexaPrimary, style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(28.dp))
    Text("Sign in", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(email, { email = it }, label = { Text("Owner email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(10.dp))
    OutlinedTextField(password, { password = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
    error?.let { ErrorText(it) }
    Spacer(Modifier.height(16.dp))
    Button(onClick = { onLogin(email, password) }, modifier = Modifier.fillMaxWidth(), enabled = email.isNotBlank() && password.isNotBlank()) { Text("Sign in securely") }
  }
}

@Composable private fun RegistrationScreen(screen: AlexaScreenState.Registration, error: String?, onCreatePairing: () -> Unit, onRegister: (String, String) -> Unit, onRefreshApproval: () -> Unit) {
  var deviceName by remember { mutableStateOf("Monday OS") }
  var pairingCode by remember(screen.pairingCode) { mutableStateOf(screen.pairingCode.orEmpty()) }
  Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("Trust this phone", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(10.dp))
    Text("This device creates a non-exportable key in Android Keystore. Alexa Control must approve it before it can access command-center state.", color = AlexaMutedContent)
    Spacer(Modifier.height(18.dp))
    if (screen.status == DeviceTrustStatus.PENDING) {
      StatusPill("Awaiting owner approval", AlexaPrimary)
      Spacer(Modifier.height(12.dp))
      Button(onClick = onRefreshApproval, modifier = Modifier.fillMaxWidth()) { Text("Check approval") }
    } else {
      OutlinedTextField(deviceName, { deviceName = it }, label = { Text("Device name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      Spacer(Modifier.height(10.dp))
      OutlinedTextField(pairingCode, { pairingCode = it.uppercase() }, label = { Text("Pairing code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      screen.expiresAt?.let { Text("Code expires at $it", style = MaterialTheme.typography.bodySmall, color = AlexaMutedContent) }
      Spacer(Modifier.height(12.dp))
      Button(onClick = { onRegister(pairingCode, deviceName) }, modifier = Modifier.fillMaxWidth(), enabled = pairingCode.length == 8 && deviceName.isNotBlank()) { Text("Register this Android device") }
      TextButton(onClick = onCreatePairing, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Create a new pairing code") }
    }
    error?.let { ErrorText(it) }
  }
}

@Composable private fun CenterMessage(message: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(message, color = AlexaMutedContent) }
@Composable private fun ErrorText(message: String) = Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp))
@Composable private fun StatusPill(text: String, color: Color) = Text(text, color = color, modifier = Modifier.background(color.copy(alpha = .12f), RoundedCornerShape(20.dp)).padding(horizontal = 10.dp, vertical = 6.dp))
@Composable private fun StatusCard(title: String, content: @Composable ColumnScope.() -> Unit) = Card(colors = CardDefaults.cardColors(containerColor = AlexaSurface), border = androidx.compose.foundation.BorderStroke(1.dp, AlexaBorder)) { Column(Modifier.padding(16.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Spacer(Modifier.height(10.dp)); content() } }
@Composable private fun StatusRow(label: String, value: String) = Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = AlexaMutedContent); Text(value, fontWeight = FontWeight.Medium, color = if (value in listOf("HEALTHY", "ONLINE", "AVAILABLE", "TRUSTED")) AlexaGreen else AlexaContent) }
@Composable private fun ConnectionBanner(state: ConnectionState, updatedAt: Long?) = StatusPill("${state.name}${updatedAt?.let { " · ${formatTime(it)}" } ?: ""}", if (state == ConnectionState.ONLINE) AlexaGreen else AlexaPrimary)
private fun formatTime(time: Long) = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(time))
