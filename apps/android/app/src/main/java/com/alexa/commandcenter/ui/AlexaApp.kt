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

private val AlexaBackground = Color(0xFF090A0E)
private val AlexaSurface = Color(0xFF12141D)
private val AlexaBorder = Color(0xFF2B2F3B)
private val AlexaBlue = Color(0xFF8EABFF)
private val AlexaGreen = Color(0xFF53D99B)

@Composable
fun AlexaApp(
  state: AlexaUiState,
  environment: AlexaEnvironmentConfig,
  onLogin: (String, String) -> Unit,
  onCreatePairing: () -> Unit,
  onRegister: (String, String) -> Unit,
  onRefreshApproval: () -> Unit,
  onRefresh: () -> Unit,
  onLock: () -> Unit,
  onForgetDevice: () -> Unit,
) {
  MaterialTheme(colorScheme = darkColorScheme(primary = AlexaBlue, surface = AlexaSurface)) {
    Surface(color = AlexaBackground, modifier = Modifier.fillMaxSize()) {
      when (val screen = state.screen) {
        AlexaScreenState.Checking -> CenterMessage("Checking secure session")
        AlexaScreenState.Login -> LoginScreen(state.error, onLogin)
        is AlexaScreenState.Registration -> RegistrationScreen(screen, state.error, onCreatePairing, onRegister, onRefreshApproval)
        AlexaScreenState.BiometricLocked -> CenterMessage("Unlock Alexa with biometrics")
        AlexaScreenState.Shell -> ShellScreen(state, environment, onRefresh, onLock, onForgetDevice)
      }
    }
  }
}

@Composable private fun LoginScreen(error: String?, onLogin: (String, String) -> Unit) {
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("Alexa", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.SemiBold)
    Text("Command Center", color = AlexaBlue, style = MaterialTheme.typography.labelLarge)
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
  var deviceName by remember { mutableStateOf("Alexa Android") }
  var pairingCode by remember(screen.pairingCode) { mutableStateOf(screen.pairingCode.orEmpty()) }
  Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
    Text("Trust this phone", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(10.dp))
    Text("This device creates a non-exportable key in Android Keystore. Alexa Control must approve it before it can access command-center state.", color = Color.LightGray)
    Spacer(Modifier.height(18.dp))
    if (screen.status == DeviceTrustStatus.PENDING) {
      StatusPill("Awaiting owner approval", AlexaBlue)
      Spacer(Modifier.height(12.dp))
      Button(onClick = onRefreshApproval, modifier = Modifier.fillMaxWidth()) { Text("Check approval") }
    } else {
      OutlinedTextField(deviceName, { deviceName = it }, label = { Text("Device name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      Spacer(Modifier.height(10.dp))
      OutlinedTextField(pairingCode, { pairingCode = it.uppercase() }, label = { Text("Pairing code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      screen.expiresAt?.let { Text("Code expires at $it", style = MaterialTheme.typography.bodySmall, color = Color.Gray) }
      Spacer(Modifier.height(12.dp))
      Button(onClick = { onRegister(pairingCode, deviceName) }, modifier = Modifier.fillMaxWidth(), enabled = pairingCode.length == 8 && deviceName.isNotBlank()) { Text("Register this Android device") }
      TextButton(onClick = onCreatePairing, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Create a new pairing code") }
    }
    error?.let { ErrorText(it) }
  }
}

@Composable private fun ShellScreen(state: AlexaUiState, environment: AlexaEnvironmentConfig, onRefresh: () -> Unit, onLock: () -> Unit, onForgetDevice: () -> Unit) {
  var destination by remember { mutableStateOf("Home") }
  val destinations = listOf("Home" to Icons.Outlined.Home, "Objectives" to Icons.Outlined.Flag, "Workforce" to Icons.Outlined.Groups, "Approvals" to Icons.Outlined.TaskAlt, "Alexa" to Icons.Outlined.AutoAwesome)
  Scaffold(bottomBar = { NavigationBar(containerColor = AlexaSurface) { destinations.forEach { (label, icon) -> NavigationBarItem(selected = destination == label, onClick = { destination = label }, icon = { Icon(icon, label) }, label = { Text(label) }) } } }) { padding ->
    Box(Modifier.padding(padding)) {
      when (destination) {
        "Home" -> HomeScreen(state, environment, onRefresh)
        "Alexa" -> SettingsScreen(state, environment, onLock, onForgetDevice)
        else -> FoundationPlaceholder(destination)
      }
    }
  }
}

@Composable private fun HomeScreen(state: AlexaUiState, environment: AlexaEnvironmentConfig, onRefresh: () -> Unit) {
  Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
      Column(Modifier.weight(1f)) { Text("Alexa", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold); Text("CEO Command Center", color = AlexaBlue) }
      IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh status") }
    }
    Spacer(Modifier.height(18.dp))
    ConnectionBanner(state.connection, state.lastUpdatedAt)
    state.error?.let { ErrorText(it) }
    Spacer(Modifier.height(14.dp))
    StatusCard("System status") {
      val components = state.health?.components.orEmpty()
      StatusRow("API", components["api"]?.state ?: "Unknown")
      StatusRow("PostgreSQL", components["postgres"]?.state ?: "Unknown")
      StatusRow("Redis", components["redis"]?.state ?: "Unknown")
      StatusRow("AIRouter", components["aiRouter"]?.state ?: "Unknown")
      StatusRow("Scheduler", components["scheduler"]?.state ?: "Unknown")
      StatusRow("Mac Agent", state.summary?.capabilities?.deviceExecutable?.macAgent ?: "Unknown")
    }
    Spacer(Modifier.height(12.dp))
    StatusCard("This device") {
      StatusRow("Trust", state.device?.trustStatus?.name ?: "Unregistered")
      StatusRow("Environment", environment.environment.name)
      StatusRow("Backend", state.summary?.deploymentMode ?: "Unavailable")
      StatusRow("Last authenticated", state.lastUpdatedAt?.let(::formatTime) ?: "Not yet")
    }
  }
}

@Composable private fun SettingsScreen(state: AlexaUiState, environment: AlexaEnvironmentConfig, onLock: () -> Unit, onForgetDevice: () -> Unit) {
  Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Alexa settings", style = MaterialTheme.typography.headlineSmall)
    StatusCard("Connection") { Text(environment.apiBaseUrl, style = MaterialTheme.typography.bodySmall, color = Color.LightGray); StatusRow("State", state.connection.name); StatusRow("Device trust", state.device?.trustStatus?.name ?: "Unregistered") }
    OutlinedButton(onClick = onLock, modifier = Modifier.fillMaxWidth()) { Text("Lock now") }
    OutlinedButton(onClick = onForgetDevice, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Sign out and forget this device") }
  }
}

@Composable private fun FoundationPlaceholder(label: String) = CenterMessage("$label foundation is ready for its next mobile phase.")
@Composable private fun CenterMessage(message: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(message, color = Color.LightGray) }
@Composable private fun ErrorText(message: String) = Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp))
@Composable private fun StatusPill(text: String, color: Color) = Text(text, color = color, modifier = Modifier.background(color.copy(alpha = .12f), RoundedCornerShape(20.dp)).padding(horizontal = 10.dp, vertical = 6.dp))
@Composable private fun StatusCard(title: String, content: @Composable ColumnScope.() -> Unit) = Card(colors = CardDefaults.cardColors(containerColor = AlexaSurface), border = androidx.compose.foundation.BorderStroke(1.dp, AlexaBorder)) { Column(Modifier.padding(16.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Spacer(Modifier.height(10.dp)); content() } }
@Composable private fun StatusRow(label: String, value: String) = Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = Color.LightGray); Text(value, fontWeight = FontWeight.Medium, color = if (value in listOf("HEALTHY", "ONLINE", "AVAILABLE", "TRUSTED")) AlexaGreen else Color.White) }
@Composable private fun ConnectionBanner(state: ConnectionState, updatedAt: Long?) = StatusPill("${state.name}${updatedAt?.let { " · ${formatTime(it)}" } ?: ""}", if (state == ConnectionState.ONLINE) AlexaGreen else AlexaBlue)
private fun formatTime(time: Long) = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(time))
