package com.alexa.commandcenter.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize
import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.*
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

private val CcBg = AlexaBackground
private val CcSurface = AlexaSurface
private val CcElevated = AlexaElevatedSurface
private val CcBorder = AlexaBorder
private val CcBlue = AlexaPrimary
private val CcGreen = AlexaGreen
private val CcAmber = AlexaAmber
private val CcRed = AlexaRed
private val CcMuted = AlexaMutedContent

@Composable
fun CommandCenterShell(
  state: AlexaUiState,
  environment: AlexaEnvironmentConfig,
  onRefresh: () -> Unit,
  onCompanySelected: (String) -> Unit,
  onLock: () -> Unit,
  onForgetDevice: () -> Unit,
  onCreateObjective: (CreateObjectiveRequest) -> Unit,
  onObjectiveAction: (String, String) -> Unit,
  onModifyObjective: (String, Int?, String?) -> Unit,
  onApprovalDecision: (String, Boolean) -> Unit,
  onAgentSelected: (String) -> Unit,
  onWorkflowSelected: (String) -> Unit,
  onExperimentsSelected: (String) -> Unit,
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
  onApprovalSelected: (String) -> Unit,
  onNotificationTargetConsumed: () -> Unit,
  onExternalDestinationConsumed: () -> Unit,
  onNotificationPreferences: (NotificationPreferences) -> Unit,
  onApprovalDecisionWithReason: (String, Boolean, String?) -> Unit,
  onCrossDeviceCommandApplied: (String, Boolean, String) -> Unit,
) {
  var destination by rememberSaveable { mutableStateOf("Home") }
  var secondaryDestination by rememberSaveable { mutableStateOf<String?>(null) }
  var selectedApprovalId by rememberSaveable { mutableStateOf<String?>(null) }
  LaunchedEffect(state.crossDeviceCommand) {
    val command = state.crossDeviceCommand ?: return@LaunchedEffect
    var supported = true
    when (command.capability) {
      "OPEN_APPROVAL" -> {
        destination = "Approvals"
        selectedApprovalId = command.arguments.objectId
        command.arguments.objectId?.let(onApprovalSelected)
      }
      "OPEN_OBJECTIVE" -> destination = "Objectives"
      "OPEN_AGENT" -> {
        destination = "Workforce"
        command.arguments.objectId?.let(onAgentSelected)
      }
      "OPEN_WORKFLOW" -> {
        destination = "Alexa"
        secondaryDestination = "Workflows"
        command.arguments.objectId?.let(onWorkflowSelected)
      }
      "OPEN_CONVERSATION" -> {
        destination = "Alexa"
        secondaryDestination = null
        command.arguments.objectId?.let(onSelectConversation)
      }
      "SHOW_SCREEN" -> when (command.arguments.route) {
        "/", null -> destination = "Home"
        "/objectives" -> destination = "Objectives"
        "/agents" -> destination = "Workforce"
        "/approvals" -> destination = "Approvals"
        "/conversation" -> { destination = "Alexa"; secondaryDestination = null }
        "/workflows" -> { destination = "Alexa"; secondaryDestination = "Workflows" }
        else -> supported = false
      }
      else -> supported = false
    }
    onCrossDeviceCommandApplied(
      command.id,
      supported,
      if (supported) "Monday OS opened the requested registered screen."
      else "This Monday OS build does not expose the requested registered screen.",
    )
  }
  LaunchedEffect(state.notificationTarget, state.connection) {
    val target = state.notificationTarget ?: return@LaunchedEffect
    when (target.kind) {
      "APPROVAL" -> { destination = "Approvals"; selectedApprovalId = target.objectId; onApprovalSelected(target.objectId) }
      "OBJECTIVE" -> destination = "Objectives"
      "WORKFLOW" -> { destination = "Alexa"; secondaryDestination = "Workflows" }
      "AGENT" -> { destination = "Workforce"; onAgentSelected(target.objectId) }
      "ECONOMY" -> { destination = "Alexa"; secondaryDestination = "Economy" }
      "EXPERIMENT" -> { destination = "Alexa"; secondaryDestination = "Experiments"; onExperimentsSelected("__all__") }
      "SYSTEM", "DEVICE" -> { destination = "Alexa"; secondaryDestination = "System" }
    }
    if (state.connection == ConnectionState.ONLINE) onNotificationTargetConsumed()
  }
  LaunchedEffect(state.externalDestination, state.screen) {
    when (state.externalDestination) {
      "VOICE" -> { destination = "Alexa"; secondaryDestination = null }
      "APPROVALS" -> { destination = "Approvals"; secondaryDestination = null }
      else -> return@LaunchedEffect
    }
    onExternalDestinationConsumed()
  }
  val leftDestinations = listOf(
    "Home" to Icons.Outlined.Home,
    "Objectives" to Icons.Outlined.Flag,
  )
  val rightDestinations = listOf(
    "Workforce" to Icons.Outlined.Groups,
    "Approvals" to Icons.Outlined.TaskAlt,
  )
  Scaffold(
      containerColor = CcBg,
      bottomBar = {
        Box {
          NavigationBar(containerColor = CcSurface) {
            leftDestinations.forEach { (label, icon) ->
              NavigationBarItem(
                selected = destination == label,
                onClick = { destination = label; secondaryDestination = null },
                icon = { Icon(icon, label) },
                label = { Text(label) },
              )
            }
            Spacer(Modifier.width(72.dp))
            rightDestinations.forEach { (label, icon) ->
              NavigationBarItem(
                selected = destination == label,
                onClick = { destination = label; secondaryDestination = null },
                icon = { Icon(icon, label) },
                label = { Text(label) },
              )
            }
          }
          FloatingActionButton(
            onClick = { destination = "Alexa"; secondaryDestination = null },
            modifier = Modifier
              .align(Alignment.TopCenter)
              .offset(y = (-14).dp)
              .size(62.dp)
              .shadow(18.dp, CircleShape, ambientColor = CcBlue, spotColor = CcBlue),
            shape = CircleShape,
            containerColor = CcBlue,
            contentColor = CcBg,
          ) {
            Icon(Icons.Outlined.GraphicEq, "Open Alexa Voice", Modifier.size(28.dp))
          }
        }
      },
  ) { padding ->
      Column(Modifier.padding(padding)) {
        val companies = state.companies
        if (companies != null) {
          var expanded by remember { mutableStateOf(false) }
          Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
              Icon(Icons.Outlined.Business, null)
              Spacer(Modifier.width(8.dp))
              Text(companies.currentCompany.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
              Spacer(Modifier.weight(1f))
              Icon(Icons.Outlined.ExpandMore, "Switch company")
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
              companies.companies.filter { it.status == "ACTIVE" }.forEach { company ->
                DropdownMenuItem(text = { Text(company.name) }, onClick = { expanded = false; onCompanySelected(company.id) })
              }
            }
          }
        }
        Box(Modifier.weight(1f)) { when (destination) {
          "Home" -> ExecutiveHome(state, onRefresh, onObjectiveAction, onApprovalDecision)
          "Objectives" -> ObjectivesScreen(state, onCreateObjective, onObjectiveAction, onModifyObjective)
          "Workforce" -> WorkforceScreen(state.commandCenter?.workforce, state.agentDetails, onAgentSelected)
          "Approvals" -> ApprovalsScreen(state, selectedApprovalId, { selectedApprovalId = it; if (it.isNotBlank()) onApprovalSelected(it) }, onApprovalDecisionWithReason)
          else -> when (secondaryDestination) {
            "Activity" -> ActivityScreen(state, onBack = { secondaryDestination = null })
            "Workflows" -> WorkflowsScreen(state, onWorkflowSelected, onBack = { secondaryDestination = null })
            "Economy" -> EconomyScreen(state, onBack = { secondaryDestination = null })
            "Experiments" -> ExperimentsScreen(state, onExperimentsSelected, onBack = { secondaryDestination = null })
            "System" -> SystemScreen(state, environment, onNotificationPreferences, onBack = { secondaryDestination = null })
            else -> AlexaConversationScreen(
              state = state,
              environment = environment,
              onRefresh = onRefresh,
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
              onOpenSecondary = { secondaryDestination = it },
              onOpenApprovals = { destination = "Approvals"; secondaryDestination = null },
              onLock = onLock,
              onForgetDevice = onForgetDevice,
            )
          }
        } }
      }
  }
}

@Composable private fun ExecutiveHome(
  state: AlexaUiState,
  onRefresh: () -> Unit,
  onObjectiveAction: (String, String) -> Unit,
  onApprovalDecision: (String, Boolean) -> Unit,
) {
  val snapshot = state.commandCenter
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item {
      Row(Modifier.fillMaxWidth().padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text("Alexa", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold)
          Text("CEO Command Center", color = CcBlue, style = MaterialTheme.typography.labelLarge)
        }
        IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh command center") }
      }
    }
    item { ConnectionStateBanner(state.connection, state.lastUpdatedAt) }
    state.error?.let { item { ErrorBanner(it) } }
    item { AlexaCoreMap(snapshot?.workforce, state.connection) }
    item { OrganizationMetrics(snapshot, state.health?.status) }
    item {
      SectionTitle("Needs your attention", snapshot?.attention?.total?.let { "$it pending" })
      AttentionList(snapshot, state, onObjectiveAction, onApprovalDecision)
    }
    item {
      SectionTitle("Active objectives", snapshot?.objectives?.summary?.active?.toString())
      ObjectiveRows(snapshot?.objectives, onObjectiveAction)
    }
    item {
      SectionTitle("Workforce snapshot")
      WorkforceSnapshot(snapshot?.workforce)
    }
    item {
      SectionTitle("Recent meaningful activity")
      ActivityRows(snapshot?.objectives?.events.orEmpty())
    }
    item { Spacer(Modifier.height(8.dp)) }
  }
}

@Composable
private fun AlexaCoreMap(workforce: WorkforceGraph?, connection: ConnectionState) {
  val departments = workforce?.departments.orEmpty().take(6)
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      Text("ALEXA BRAIN", color = CcMuted, style = MaterialTheme.typography.labelSmall)
      Text(
        "${workforce?.summary?.registered ?: 0} AGENTS · ${workforce?.summary?.departments ?: 0} DEPARTMENTS",
        color = CcMuted,
        style = MaterialTheme.typography.labelSmall,
      )
    }
    Box(
      Modifier
        .fillMaxWidth()
        .height(270.dp)
        .background(Color(0xFF0D1118), RoundedCornerShape(8.dp)),
      contentAlignment = Alignment.Center,
    ) {
      Canvas(Modifier.fillMaxSize()) {
        val center = Offset(size.width / 2f, size.height * .52f)
        val radius = min(size.width, size.height) * .29f
        drawCircle(CcBlue.copy(alpha = .06f), radius * 1.28f, center)
        drawCircle(Color(0xFF172B3C), radius, center)
        drawCircle(Color(0xFF8FC6DF).copy(alpha = .5f), radius, center, style = Stroke(1.2.dp.toPx()))
        for (index in 1..4) {
          val fraction = index / 5f
          drawOval(
            Color(0xFF8FC6DF).copy(alpha = .19f),
            topLeft = Offset(center.x - radius * fraction, center.y - radius),
            size = androidx.compose.ui.geometry.Size(radius * fraction * 2f, radius * 2f),
            style = Stroke(.7.dp.toPx()),
          )
          drawOval(
            Color(0xFF8FC6DF).copy(alpha = .15f),
            topLeft = Offset(center.x - radius, center.y - radius * fraction),
            size = androidx.compose.ui.geometry.Size(radius * 2f, radius * fraction * 2f),
            style = Stroke(.7.dp.toPx()),
          )
        }
        drawOval(
          CcBlue.copy(alpha = .28f),
          topLeft = Offset(center.x - radius * 1.58f, center.y - radius * .62f),
          size = androidx.compose.ui.geometry.Size(radius * 3.16f, radius * 1.24f),
          style = Stroke(1.dp.toPx()),
        )
        departments.forEachIndexed { index, department ->
          val angle = (index.toFloat() / departments.size.coerceAtLeast(1)) * (Math.PI * 2) - Math.PI / 2
          val point = Offset(
            center.x + cos(angle).toFloat() * radius * 1.43f,
            center.y + sin(angle).toFloat() * radius * 1.28f,
          )
          drawCircle(CcBlue.copy(alpha = .16f), 12.dp.toPx(), point)
          drawCircle(CcBlue, 4.dp.toPx(), point)
          drawContext.canvas.nativeCanvas.apply {
            val paint = android.graphics.Paint().apply {
              color = android.graphics.Color.rgb(225, 231, 242)
              textAlign = android.graphics.Paint.Align.CENTER
              textSize = 10.dp.toPx()
              isAntiAlias = true
              typeface = android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
            }
            drawText(department.name.take(18), point.x, point.y + 22.dp.toPx(), paint)
          }
        }
      }
      Surface(
        shape = RoundedCornerShape(24.dp),
        color = Color(0xEE102131),
        border = BorderStroke(1.dp, CcBlue.copy(alpha = .35f)),
        shadowElevation = 8.dp,
      ) {
        Row(
          Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          Icon(Icons.Outlined.AutoAwesome, null, tint = Color(0xFF9CE8FF), modifier = Modifier.size(18.dp))
          Text(
            if (connection == ConnectionState.ONLINE) "ALEXA CORE ONLINE" else "ALEXA CORE ${connection.name}",
            color = Color(0xFFC5EDFF),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
          )
        }
      }
      if (departments.isEmpty()) {
        Text(
          "Workforce topology will appear after sync",
          Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
          color = CcMuted,
          style = MaterialTheme.typography.labelSmall,
        )
      }
    }
  }
}

@Composable private fun OrganizationMetrics(snapshot: CommandCenterSnapshot?, health: String?) {
  val objectives = snapshot?.objectives?.summary
  val workforce = snapshot?.workforce?.summary
  val economy = snapshot?.economy?.overview
  Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text("Organization health", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      Text(health ?: "Synchronizing", color = statusColor(health ?: "UNKNOWN"), style = MaterialTheme.typography.labelLarge)
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Metric("Objectives", objectives?.active ?: 0)
        Metric("Working", workforce?.active ?: 0)
        Metric("Available", workforce?.dormant ?: 0)
      }
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Metric("Attention", snapshot?.attention?.total ?: 0)
        Metric("Pending", snapshot?.approvals?.size ?: 0)
        Metric("Spent", economy?.spentCredits ?: 0, "cr")
      }
    }
  }
}

@Composable private fun Metric(label: String, value: Int, suffix: String = "") = Column {
  Text("$value$suffix", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
  Text(label, color = Color.LightGray, style = MaterialTheme.typography.labelSmall)
}

@Composable private fun AttentionList(snapshot: CommandCenterSnapshot?, state: AlexaUiState, onObjectiveAction: (String, String) -> Unit, onApprovalDecision: (String, Boolean) -> Unit) {
  val blocked = snapshot?.objectives?.objectives.orEmpty().filter { it.status == "BLOCKED" || it.deadlineStatus != "ON_TRACK" || it.budgetStatus != "ON_TRACK" }
  val approvals = snapshot?.approvals.orEmpty()
  if (blocked.isEmpty() && approvals.isEmpty() && state.connection == ConnectionState.ONLINE) EmptyLine("No owner action is waiting.")
  blocked.take(3).forEach { objective ->
    val goal = snapshot?.objectives?.goals?.firstOrNull { it.id == objective.executiveGoalId }
    AttentionRow(goal?.title ?: "Objective", objective.riskReasons.firstOrNull() ?: objective.blockers.firstOrNull() ?: objective.deadlineStatus, statusColor(objective.status)) {
      if (objective.status == "BLOCKED") onObjectiveAction(objective.id, "resume")
    }
  }
  approvals.take(3).forEach { approval ->
    AttentionRow(approval.humanSummary, "Approval · ${approval.riskLevel}", CcAmber) { onApprovalDecision(approval.id, true) }
  }
}

@Composable private fun AttentionRow(title: String, detail: String, tint: Color, action: () -> Unit) = Row(
  Modifier.fillMaxWidth().padding(vertical = 8.dp).clickable(onClick = action),
  verticalAlignment = Alignment.CenterVertically,
) {
  Box(Modifier.size(8.dp).background(tint, RoundedCornerShape(50)))
  Spacer(Modifier.width(10.dp))
  Column(Modifier.weight(1f)) { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(detail, style = MaterialTheme.typography.bodySmall, color = Color.LightGray, maxLines = 1, overflow = TextOverflow.Ellipsis) }
  Icon(Icons.Outlined.ChevronRight, "Open", tint = Color.LightGray)
}

@Composable private fun ObjectiveRows(dashboard: ObjectiveDashboard?, onAction: (String, String) -> Unit) {
  val active = dashboard?.objectives.orEmpty().filter { it.status in setOf("ACTIVE", "AT_RISK", "BLOCKED", "PAUSED") }.take(4)
  if (active.isEmpty()) EmptyLine("No active objectives yet.")
  active.forEach { objective ->
    val goal = dashboard?.goals?.firstOrNull { it.id == objective.executiveGoalId }
    ObjectiveRow(goal?.title ?: "Objective", objective, onAction)
  }
}

@Composable private fun ObjectiveRow(title: String, objective: Objective, onAction: (String, String) -> Unit) = Surface(
  modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder),
) {
  Column(Modifier.padding(12.dp)) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text(title, Modifier.weight(1f), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
      StatusPill(objective.status)
    }
    Spacer(Modifier.height(8.dp))
    ProgressPair("Outcome", objective.outcomeProgress, "Execution", objective.executionProgress)
    Text("${objective.spentCredits} / ${objective.budgetCredits} credits · ${objective.deadlineStatus.replace('_', ' ')}", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
    if (objective.status == "ACTIVE") TextButton(onClick = { onAction(objective.id, "pause") }) { Text("Pause") }
  }
}

@Composable private fun ProgressPair(first: String, firstValue: Double, second: String, secondValue: Double) {
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    ProgressLine(first, firstValue)
    ProgressLine(second, secondValue)
  }
}

@Composable private fun ProgressLine(label: String, value: Double) = Row(verticalAlignment = Alignment.CenterVertically) {
  Text(label, Modifier.width(74.dp), style = MaterialTheme.typography.labelSmall, color = Color.LightGray)
  LinearProgressIndicator(progress = { (value / 100.0).toFloat() }, Modifier.weight(1f), color = CcBlue, trackColor = CcBorder)
  Text("${value.roundToInt()}%", Modifier.width(38.dp).padding(start = 6.dp), style = MaterialTheme.typography.labelSmall)
}

@Composable private fun WorkforceSnapshot(workforce: WorkforceGraph?) = Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) {
  Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
    Metric("Registered", workforce?.summary?.registered ?: 0)
    Metric("Active", workforce?.summary?.active ?: 0)
    Metric("Dormant", workforce?.summary?.dormant ?: 0)
    Metric("Blocked", workforce?.nodes?.count { it.status == "BLOCKED" } ?: 0)
  }
}

@Composable private fun ActivityRows(events: List<ObjectiveEvent>) {
  if (events.isEmpty()) EmptyLine("No executive-level activity yet.")
  events.sortedByDescending { it.createdAt }.take(5).forEach { event ->
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
      Box(Modifier.size(6.dp).background(CcBlue, RoundedCornerShape(50)).align(Alignment.CenterVertically))
      Spacer(Modifier.width(10.dp))
      Column { Text(event.summary); Text(event.type.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = Color.LightGray) }
    }
  }
}

@Composable private fun ObjectivesScreen(state: AlexaUiState, onCreate: (CreateObjectiveRequest) -> Unit, onAction: (String, String) -> Unit, onModify: (String, Int?, String?) -> Unit) {
  var filter by rememberSaveable { mutableStateOf("ACTIVE") }
  var createOpen by rememberSaveable { mutableStateOf(false) }
  var editing by remember { mutableStateOf<Objective?>(null) }
  val dashboard = state.commandCenter?.objectives
  val objectiveList = dashboard?.objectives.orEmpty().filter { objective ->
    when (filter) { "AT RISK" -> objective.status == "AT_RISK" || objective.deadlineStatus == "AT_RISK" || objective.budgetStatus == "BUDGET_AT_RISK"; "BLOCKED" -> objective.status == "BLOCKED"; "COMPLETED" -> objective.status == "COMPLETED"; else -> objective.status !in setOf("COMPLETED", "CANCELLED") }
  }
  if (createOpen) ObjectiveCreateDialog(onDismiss = { createOpen = false }, onCreate = { onCreate(it); createOpen = false })
  editing?.let { objective -> ObjectiveEditDialog(objective, onDismiss = { editing = null }, onSave = { budget, priority -> onModify(objective.id, budget, priority); editing = null }) }
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item { Header("Objectives", "Outcome progress and execution progress are shown separately.", action = { createOpen = true }) }
    item { FilterRow(listOf("ACTIVE", "AT RISK", "BLOCKED", "COMPLETED"), filter) { filter = it } }
    items(objectiveList, key = { it.id }) { objective ->
      val goal = dashboard?.goals?.firstOrNull { it.id == objective.executiveGoalId }
      Column {
        ObjectiveRow(goal?.title ?: "Objective", objective, onAction)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          if (objective.status == "PAUSED" || objective.status == "BLOCKED") TextButton(onClick = { onAction(objective.id, "resume") }) { Text("Resume") }
          if (objective.status !in setOf("COMPLETED", "CANCELLED")) TextButton(onClick = { editing = objective }) { Text("Adjust") }
          if (objective.status !in setOf("COMPLETED", "CANCELLED")) TextButton(onClick = { onAction(objective.id, "cancel") }, colors = ButtonDefaults.textButtonColors(contentColor = CcRed)) { Text("Cancel") }
        }
      }
    }
    if (objectiveList.isEmpty()) item { EmptyLine("No objectives in this state.") }
  }
}

@Composable private fun ObjectiveEditDialog(objective: Objective, onDismiss: () -> Unit, onSave: (Int?, String?) -> Unit) {
  var budget by remember(objective.id) { mutableStateOf(objective.budgetCredits.toString()) }
  var priority by remember(objective.id) { mutableStateOf("NORMAL") }
  AlertDialog(onDismissRequest = onDismiss, title = { Text("Adjust objective") }, text = {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      OutlinedTextField(budget, { budget = it.filter(Char::isDigit) }, label = { Text("Budget credits") })
      FilterRow(listOf("LOW", "NORMAL", "HIGH", "URGENT"), priority) { priority = it }
      Text("Alexa will validate current commitments and return a governed result.", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
    }
  }, confirmButton = { Button(onClick = { onSave(budget.toIntOrNull(), priority) }) { Text("Apply") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable private fun ObjectiveCreateDialog(onDismiss: () -> Unit, onCreate: (CreateObjectiveRequest) -> Unit) {
  var title by remember { mutableStateOf("") }; var outcome by remember { mutableStateOf("") }; var budget by remember { mutableStateOf("100") }; var priority by remember { mutableStateOf("NORMAL") }
  AlertDialog(onDismissRequest = onDismiss, title = { Text("Create objective") }, text = {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      OutlinedTextField(title, { title = it }, label = { Text("What should Alexa achieve?") })
      OutlinedTextField(outcome, { outcome = it }, label = { Text("Success criteria") })
      OutlinedTextField(budget, { budget = it.filter(Char::isDigit) }, label = { Text("Budget credits") })
      FilterRow(listOf("LOW", "NORMAL", "HIGH", "URGENT"), priority) { priority = it }
    }
  }, confirmButton = { Button(enabled = title.isNotBlank() && outcome.isNotBlank(), onClick = { onCreate(CreateObjectiveRequest(title, outcome, budgetCredits = budget.toIntOrNull() ?: 100, priority = priority)) }) { Text("Create") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable private fun WorkforceScreen(workforce: WorkforceGraph?, details: Map<String, WorkforceAgentDetail>, onAgentSelected: (String) -> Unit) {
  var mode by rememberSaveable { mutableStateOf("Organization") }
  var selected by remember { mutableStateOf<WorkforceNode?>(null) }
  Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
    Header("Workforce", "Registered agents remain dormant until assigned work.")
    FilterRow(listOf("Organization", "Live"), mode) { mode = it }
    WorkforceGraphCanvas(workforce, mode, onSelected = { node -> onAgentSelected(node.id); selected = node })
  }
  selected?.let { AgentInspector(it, workforce, details[it.id], onDismiss = { selected = null }) }
}

@Composable private fun WorkforceGraphCanvas(workforce: WorkforceGraph?, mode: String, onSelected: (WorkforceNode) -> Unit) {
  var scale by remember { mutableFloatStateOf(1f) }; var offsetX by remember { mutableFloatStateOf(0f) }; var offsetY by remember { mutableFloatStateOf(0f) }
  var canvasSize by remember { mutableStateOf(IntSize.Zero) }
  val allNodes = workforce?.nodes.orEmpty().let { nodes -> if (mode == "Live") nodes.filter { it.status == "ACTIVE" || it.status == "BLOCKED" } else nodes }
  val lodNodes = when { scale < .8f -> allNodes.filter { it.kind != "AGENT" }; scale < 1.25f -> allNodes.filter { it.kind != "AGENT" || it.childCount > 0 }; else -> allNodes.take(160) }
  Surface(Modifier.fillMaxWidth().height(460.dp).padding(top = 12.dp), shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) {
    if (lodNodes.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { EmptyLine("No workforce records available.") }
    else Canvas(
      Modifier.fillMaxSize()
        .onSizeChanged { canvasSize = it }
        .pointerInput(lodNodes, scale, offsetX, offsetY) {
          detectTapGestures { tap ->
            val nodeWidth = 132f
            val nodeHeight = 54f
            val selected = lodNodes.mapIndexed { index, node ->
              node to androidx.compose.ui.geometry.Offset(28f + (index % 4) * 164f, 42f + (index / 4) * 82f)
            }.firstOrNull { (_, point) ->
              val left = point.x * scale + offsetX
              val top = point.y * scale + offsetY
              tap.x in left..(left + nodeWidth * scale) && tap.y in top..(top + nodeHeight * scale)
            }
            selected?.let { (node, point) ->
              offsetX = canvasSize.width / 2f - (point.x + nodeWidth / 2f) * scale
              offsetY = canvasSize.height / 2f - (point.y + nodeHeight / 2f) * scale
              onSelected(node)
            }
          }
        }
        .pointerInput(Unit) { detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(.55f, 2.2f); offsetX += pan.x; offsetY += pan.y } }
        .graphicsLayer { scaleX = scale; scaleY = scale; translationX = offsetX; translationY = offsetY },
    ) {
      val nodeWidth = 132f; val nodeHeight = 54f
      val positions = lodNodes.mapIndexed { index, node -> node.id to androidx.compose.ui.geometry.Offset(28f + (index % 4) * 164f, 42f + (index / 4) * 82f) }.toMap()
      workforce?.edges?.filter { it.source in positions && it.target in positions }?.forEach { edge -> drawLine(CcBorder, positions.getValue(edge.source) + androidx.compose.ui.geometry.Offset(nodeWidth, nodeHeight / 2), positions.getValue(edge.target) + androidx.compose.ui.geometry.Offset(0f, nodeHeight / 2), strokeWidth = 1.5f) }
      lodNodes.forEach { node ->
        val point = positions.getValue(node.id); val tint = statusColor(node.status)
        drawRoundRect(CcElevated, point, androidx.compose.ui.geometry.Size(nodeWidth, nodeHeight), CornerRadius(8f, 8f))
        drawRoundRect(tint.copy(alpha = .7f), point, androidx.compose.ui.geometry.Size(nodeWidth, nodeHeight), CornerRadius(8f, 8f), style = Stroke(1.5f))
        drawCircle(tint, radius = 4f, center = point + androidx.compose.ui.geometry.Offset(12f, 14f))
        drawContext.canvas.nativeCanvas.drawText(node.label.take(20), point.x + 22f, point.y + 20f, android.graphics.Paint().apply { color = android.graphics.Color.WHITE; textSize = 11f; isFakeBoldText = true })
        drawContext.canvas.nativeCanvas.drawText(node.subtitle.take(25), point.x + 12f, point.y + 39f, android.graphics.Paint().apply { color = android.graphics.Color.LTGRAY; textSize = 9f })
      }
    }
  }
  Text("Pinch to zoom · drag to pan · ${lodNodes.size} visible", Modifier.padding(top = 6.dp), style = MaterialTheme.typography.labelSmall, color = Color.LightGray)
  LazyColumn(Modifier.heightIn(max = 130.dp)) { items(lodNodes.take(8), key = { it.id }) { node -> Row(Modifier.fillMaxWidth().clickable { onSelected(node) }.padding(vertical = 6.dp)) { Text(node.label, Modifier.weight(1f)); StatusPill(node.status) } } }
}

@Composable private fun AgentInspector(node: WorkforceNode, workforce: WorkforceGraph?, detail: WorkforceAgentDetail?, onDismiss: () -> Unit) = AlertDialog(onDismissRequest = onDismiss, title = { Text(node.label) }, text = {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Detail("Role", detail?.agent?.workforce?.specialization ?: node.subtitle); Detail("Status", detail?.agent?.status ?: node.status); Detail("Department", detail?.department?.name ?: workforce?.departments?.firstOrNull { it.id == node.departmentId }?.name ?: "Organization"); Detail("Reputation", detail?.economy?.reputation?.roundToInt()?.toString() ?: node.reputation?.roundToInt()?.toString() ?: "Not measured"); Detail("Credits", detail?.economy?.availableCredits?.toString() ?: node.credits?.toString() ?: "Not enrolled"); Detail("Lifetime spent", detail?.economy?.lifetimeSpent?.toString() ?: "Not enrolled"); Detail("Success rate", detail?.performance?.let { if (it.tasksAttempted == 0) "Not measured" else "${(it.tasksCompleted * 100 / it.tasksAttempted)}%" } ?: "Not measured"); Detail("Reports", node.childCount.toString())
    detail?.agent?.workforce?.skills?.take(4)?.takeIf { it.isNotEmpty() }?.let { Text("Skills: ${it.joinToString()}", style = MaterialTheme.typography.bodySmall, color = Color.LightGray) }
    detail?.agent?.capabilities?.take(4)?.takeIf { it.isNotEmpty() }?.let { Text("Capabilities: ${it.joinToString()}", style = MaterialTheme.typography.bodySmall, color = Color.LightGray) }
    Detail("Memory scope", detail?.agent?.workforce?.memoryScopeId ?: "Scoped")
    Detail("Model policy", detail?.agent?.workforce?.modelPolicyId ?: "Inherited")
    detail?.tasks?.firstOrNull()?.let { Detail("Current task", it.title) }
    if (detail == null) Text("Loading canonical Agent OS details…", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
  }
}, confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } })

@Composable private fun ApprovalsScreen(state: AlexaUiState, selectedApprovalId: String?, onSelected: (String) -> Unit, onDecision: (String, Boolean, String?) -> Unit) {
  val selected = selectedApprovalId?.let { state.approvalDetails[it] ?: state.commandCenter?.approvals?.firstOrNull { approval -> approval.id == it } }
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
  item { Header("Approvals", "Owner decisions remain governed by backend policy.") }
  items(state.commandCenter?.approvals.orEmpty(), key = { it.id }) { approval ->
    Surface(Modifier.fillMaxWidth().clickable { onSelected(approval.id) }, shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(12.dp)) {
      Row(Modifier.fillMaxWidth()) { Text(approval.humanSummary, Modifier.weight(1f), fontWeight = FontWeight.SemiBold); StatusPill(approval.riskLevel) }
      Text("${approval.toolName} · expires ${approval.expiresAt}", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button(enabled = state.connection == ConnectionState.ONLINE, onClick = { onDecision(approval.id, true, null) }) { Text("Approve") }; OutlinedButton(enabled = state.connection == ConnectionState.ONLINE, onClick = { onSelected(approval.id) }) { Text("Review") } }
    } }
  }
  if (state.commandCenter?.approvals.isNullOrEmpty()) item { EmptyLine("No approvals are waiting.") }
  }
  selected?.let { ApprovalDetailDialog(it, state.connection == ConnectionState.ONLINE, onDismiss = { onSelected("") }, onDecision = onDecision) }
}

@Composable private fun ApprovalDetailDialog(approval: Approval, online: Boolean, onDismiss: () -> Unit, onDecision: (String, Boolean, String?) -> Unit) {
  var rejectionMode by remember(approval.id) { mutableStateOf(false) }
  var rejectionReason by remember(approval.id) { mutableStateOf("") }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Approval detail") },
    text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text(approval.humanSummary, fontWeight = FontWeight.SemiBold)
      Detail("Requested action", approval.toolName)
      Detail("Risk", approval.riskLevel)
      Detail("Authentication", if (approval.approvalRequirement == "recent_authentication") "Biometric step-up" else "Owner decision")
      Detail("Status", approval.status)
      Detail("Requested", approval.requestedAt)
      Detail("Expires", approval.expiresAt)
      Text("The backend revalidates expiry, policy, capabilities, device trust, and the canonical action digest before accepting this decision.", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
      if (rejectionMode) OutlinedTextField(rejectionReason, { rejectionReason = it.take(300) }, label = { Text("Optional rejection reason") }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4)
    } },
    confirmButton = { Button(enabled = online && approval.status == "PENDING", onClick = { onDecision(approval.id, !rejectionMode, rejectionReason.trim().takeIf { it.isNotBlank() }) }) { Text(if (rejectionMode) "Confirm reject" else "Approve") } },
    dismissButton = { Row { TextButton(onClick = { rejectionMode = !rejectionMode }, enabled = approval.status == "PENDING") { Text(if (rejectionMode) "Back" else "Reject") }; TextButton(onClick = onDismiss) { Text("Close") } } },
  )
}

@Composable private fun AlexaPlaceholder(state: AlexaUiState, environment: AlexaEnvironmentConfig, onLock: () -> Unit, onForgetDevice: () -> Unit, onOpen: (String) -> Unit) = LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
  item { Header("Alexa", "Executive operations and device controls.") }
  item { ConnectionStateBanner(state.connection, state.lastUpdatedAt) }
  items(listOf("Activity" to "Meaningful organization events", "Workflows" to "Operational execution", "Economy" to "Credits, spending, and efficiency", "Experiments" to "Evidence-backed learning", "System" to "Cloud, data, AI, and device health")) { (title, subtitle) ->
    Surface(Modifier.fillMaxWidth().clickable { onOpen(title) }, shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color.LightGray) }; Icon(Icons.Outlined.ChevronRight, "Open $title") } }
  }
  item { Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(14.dp)) { Detail("Connection", state.connection.name); Detail("Backend", environment.apiBaseUrl); Detail("Device trust", state.device?.trustStatus?.name ?: "Unregistered") } } }
  item { OutlinedButton(onClick = onLock, Modifier.fillMaxWidth()) { Text("Lock now") } }
  item { OutlinedButton(onClick = onForgetDevice, Modifier.fillMaxWidth(), colors = ButtonDefaults.outlinedButtonColors(contentColor = CcRed)) { Text("Sign out and forget device") } }
}

private data class ExecutiveActivity(val category: String, val summary: String, val timestamp: String, val severity: String = "INFO")

@Composable private fun ActivityScreen(state: AlexaUiState, onBack: () -> Unit) {
  var filter by rememberSaveable { mutableStateOf("All") }
  val snapshot = state.commandCenter
  val events = buildList {
    snapshot?.objectives?.events?.forEach { add(ExecutiveActivity("Objectives", it.summary, it.createdAt, if (it.type in setOf("BLOCKED", "REPLANNED")) "ATTENTION" else "INFO")) }
    snapshot?.approvals?.forEach { add(ExecutiveActivity("Approvals", it.humanSummary, it.requestedAt, "ATTENTION")) }
    snapshot?.economy?.ledger?.forEach { add(ExecutiveActivity("Economy", "${it.type.replace('_', ' ')} · ${it.amount} credits", it.createdAt)) }
    snapshot?.workflows?.forEach { add(ExecutiveActivity("Workflows", "${it.goal.take(100)} · ${it.status.replace('_', ' ')}", it.updatedAt, if (it.status in setOf("BLOCKED", "FAILED")) "ATTENTION" else "INFO")) }
    state.health?.components?.forEach { (name, component) -> if (component.state != "HEALTHY") add(ExecutiveActivity("System", "$name is ${component.state.lowercase()}", state.lastUpdatedAt?.toString() ?: "Current", "ATTENTION")) }
  }.filter { filter == "All" || it.category == filter }.sortedByDescending { it.timestamp }.take(100)
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item { BackHeader("Activity", "Executive events, not raw logs.", onBack) }
    item { FilterRow(listOf("All", "Objectives", "Workflows", "Approvals", "Economy", "System"), filter) { filter = it } }
    items(events, key = { "${it.category}-${it.timestamp}-${it.summary}" }) { event ->
      Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Row(Modifier.padding(12.dp)) { Box(Modifier.size(7.dp).background(statusColor(event.severity), RoundedCornerShape(50)).align(Alignment.CenterVertically)); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(event.summary); Text("${event.category} · ${event.timestamp}", style = MaterialTheme.typography.labelSmall, color = Color.LightGray) } } }
    }
    if (events.isEmpty()) item { EmptyLine(if (state.connection == ConnectionState.OFFLINE) "Offline. No cached activity is available." else "No meaningful activity has been recorded.") }
  }
}

@Composable private fun WorkflowsScreen(state: AlexaUiState, onLoad: (String) -> Unit, onBack: () -> Unit) {
  var filter by rememberSaveable { mutableStateOf("Active") }
  var selected by remember { mutableStateOf<Workflow?>(null) }
  val workflows = state.commandCenter?.workflows.orEmpty().filter { workflow -> when (filter) { "Active" -> workflow.status !in setOf("COMPLETED", "CANCELLED", "FAILED"); "Blocked" -> workflow.status == "BLOCKED"; "Waiting" -> workflow.status == "WAITING_APPROVAL"; else -> workflow.status in setOf("COMPLETED", "FAILED", "CANCELLED") } }
  selected?.let { WorkflowDetailDialog(it, state.workflowDetails[it.id], onDismiss = { selected = null }) }
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item { BackHeader("Workflows", "Monitor processes and their current stage.", onBack) }
    item { FilterRow(listOf("Active", "Blocked", "Waiting", "Recent"), filter) { filter = it } }
    items(workflows, key = { it.id }) { workflow ->
      Surface(Modifier.fillMaxWidth().clickable { onLoad(workflow.id); selected = workflow }, shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(12.dp)) { Row(Modifier.fillMaxWidth()) { Text(workflow.goal, Modifier.weight(1f), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); StatusPill(workflow.status) }; Text(workflow.planSummary.ifBlank { "Operational workflow" }, style = MaterialTheme.typography.bodySmall, color = Color.LightGray, maxLines = 2, overflow = TextOverflow.Ellipsis); Text("Updated ${workflow.updatedAt}", style = MaterialTheme.typography.labelSmall, color = Color.LightGray) } }
    }
    if (workflows.isEmpty()) item { EmptyLine("No workflows in this state.") }
  }
}

@Composable private fun WorkflowDetailDialog(workflow: Workflow, detail: WorkflowDetail?, onDismiss: () -> Unit) = AlertDialog(onDismissRequest = onDismiss, title = { Text(workflow.goal) }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { StatusPill(workflow.status); detail?.let { value -> ProgressLine("Progress", value.progress.percentComplete); Detail("Current stage", value.tasks.firstOrNull { it.id == workflow.currentTaskId }?.title ?: "Awaiting assignment"); value.tasks.take(5).forEach { task -> Detail(task.title, task.status.replace('_', ' ')) }; value.events.takeLast(3).forEach { Text(it.message, style = MaterialTheme.typography.bodySmall, color = Color.LightGray) } } ?: Text("Loading workflow detail…", color = Color.LightGray) } }, confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } })

@Composable private fun EconomyScreen(state: AlexaUiState, onBack: () -> Unit) {
  val dashboard = state.commandCenter?.economy
  val overview = dashboard?.overview
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item { BackHeader("Economy", "Credits are resources. Reputation is performance.", onBack) }
    item { Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) { Metric("Available", overview?.availableCredits ?: 0, " cr"); Metric("Reserved", overview?.reservedCredits ?: 0, " cr"); Metric("Spent", overview?.spentCredits ?: 0, " cr") } } }
    item { SectionTitle("Top resource consumers") }
    items(dashboard?.accounts.orEmpty().sortedByDescending { it.lifetimeSpent }.take(12), key = { it.agentId }) { account -> Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(12.dp)) { Detail("Agent", account.agentId); Detail("Spent", "${account.lifetimeSpent} credits"); Detail("Available", "${account.availableCredits} credits"); Detail("Reputation", account.reputation.roundToInt().toString()) } } }
    item { SectionTitle("Recent economic activity") }
    items(dashboard?.ledger?.take(20).orEmpty(), key = { it.id }) { entry -> Detail(entry.type.replace('_', ' '), "${entry.amount} cr · ${entry.reasonCode}") }
    if (dashboard == null) item { EmptyLine("No economy data is available.") }
  }
}

@Composable private fun ExperimentsScreen(state: AlexaUiState, onLoad: (String) -> Unit, onBack: () -> Unit) {
  val objectives = state.commandCenter?.objectives?.objectives.orEmpty()
  var objectiveId by rememberSaveable { mutableStateOf<String?>(null) }
  LaunchedEffect(objectives.firstOrNull()?.id) { if (objectiveId == null) objectiveId = objectives.firstOrNull()?.id }
  objectiveId?.let { LaunchedEffect(it) { onLoad(it) } }
  val dashboard = state.experimentDashboards["__all__"] ?: objectiveId?.let { state.experimentDashboards[it] }
  LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item { BackHeader("Experiments", "Evidence-backed learning under objective budgets.", onBack) }
    item { FilterRow(objectives.take(5).map { it.id.take(8) }, objectiveId?.take(8).orEmpty()) { short -> objectiveId = objectives.firstOrNull { it.id.startsWith(short) }?.id } }
    item { Detail("Running", dashboard?.summary?.running?.toString() ?: "0"); Detail("Completed", dashboard?.summary?.completed?.toString() ?: "0"); Detail("Budget spent", "${dashboard?.summary?.budgetSpent ?: 0} credits") }
    items(dashboard?.experiments.orEmpty(), key = { it.id }) { experiment -> Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(12.dp)) { Row(Modifier.fillMaxWidth()) { Text(experiment.title, Modifier.weight(1f), fontWeight = FontWeight.SemiBold); StatusPill(experiment.status) }; Text(experiment.hypothesis, style = MaterialTheme.typography.bodySmall, color = Color.LightGray, maxLines = 2, overflow = TextOverflow.Ellipsis); Detail("Metric", experiment.primaryMetric.name); Detail("Cost", "${experiment.spentCredits} / ${experiment.explorationBudget} credits"); dashboard?.results?.firstOrNull { it.experimentId == experiment.id }?.let { Detail("Result", "${it.verdict} · ${(it.confidence * 100).roundToInt()}% confidence") } ?: Detail("Result", "Insufficient evidence") } } }
    if (objectives.isEmpty()) item { EmptyLine("No objective is available for experiment monitoring.") }
    else if (dashboard != null && dashboard.experiments.isEmpty()) item { EmptyLine("No experiments exist for this objective.") }
  }
}

@Composable private fun SystemScreen(state: AlexaUiState, environment: AlexaEnvironmentConfig, onPreferences: (NotificationPreferences) -> Unit, onBack: () -> Unit) = LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
  item { BackHeader("System", "Executive runtime health without secrets or debug data.", onBack) }
  item { ConnectionStateBanner(state.connection, state.lastUpdatedAt) }
  item { Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(14.dp)) { Text("Cloud runtime", fontWeight = FontWeight.SemiBold); state.health?.components.orEmpty().forEach { (name, component) -> Detail(name, component.state) }; Detail("Backend", state.summary?.deploymentMode ?: "Unknown") } } }
  item { Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(14.dp)) { Text("Devices and execution", fontWeight = FontWeight.SemiBold); Detail("Android device", state.device?.trustStatus?.name ?: "Unregistered"); Detail("Mac Agent", state.summary?.capabilities?.deviceExecutable?.macAgent ?: "Unknown"); Detail("Active workflows", state.commandCenter?.workflows?.count { it.status !in setOf("COMPLETED", "CANCELLED") }?.toString() ?: "0"); Detail("Approval backlog", state.commandCenter?.approvals?.size?.toString() ?: "0") } } }
  item { state.notificationPreferences?.let { response -> Surface(shape = RoundedCornerShape(8.dp), color = CcSurface, border = BorderStroke(1.dp, CcBorder)) { Column(Modifier.padding(14.dp)) { Text("Notifications", fontWeight = FontWeight.SemiBold); Detail("Android permission", if (state.notificationPermissionGranted) "Allowed" else "Denied"); PreferenceSwitch("Approvals", response.preferences.approvals) { onPreferences(response.preferences.copy(approvals = it)) }; PreferenceSwitch("Objective risk", response.preferences.objectiveRisk) { onPreferences(response.preferences.copy(objectiveRisk = it)) }; PreferenceSwitch("Workflow failures", response.preferences.workflowFailures) { onPreferences(response.preferences.copy(workflowFailures = it)) }; PreferenceSwitch("Budget alerts", response.preferences.budgetAlerts) { onPreferences(response.preferences.copy(budgetAlerts = it)) }; PreferenceSwitch("Experiment results", response.preferences.experimentResults) { onPreferences(response.preferences.copy(experimentResults = it)) }; PreferenceSwitch("Device events", response.preferences.deviceEvents) { onPreferences(response.preferences.copy(deviceEvents = it)) }; Detail("Security alerts", "Always on") } } } ?: EmptyLine("Notification preferences are unavailable offline.") }
  item { Detail("API endpoint", environment.apiBaseUrl) }
}

@Composable private fun PreferenceSwitch(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); Switch(checked, onCheckedChange = onChecked) }

@Composable private fun Header(title: String, subtitle: String, action: (() -> Unit)? = null) = Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color.LightGray) }; action?.let { IconButton(onClick = it) { Icon(Icons.Outlined.Add, "Create objective") } } }
@Composable private fun BackHeader(title: String, subtitle: String, onBack: () -> Unit) = Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }; Column { Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color.LightGray) } }
@Composable private fun SectionTitle(title: String, value: String? = null) = Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) { Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); value?.let { Text(it, color = CcBlue, style = MaterialTheme.typography.labelMedium) } }
@Composable private fun FilterRow(options: List<String>, selected: String, onSelected: (String) -> Unit) = Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { options.forEach { option -> FilterChip(selected = option == selected, onClick = { onSelected(option) }, label = { Text(option) }) } }
@Composable private fun Detail(label: String, value: String) = Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = Color.LightGray, style = MaterialTheme.typography.bodySmall); Text(value, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis) }
@Composable private fun EmptyLine(message: String) = Text(message, Modifier.padding(vertical = 12.dp), color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
@Composable private fun ErrorBanner(message: String) = Surface(shape = RoundedCornerShape(8.dp), color = CcRed.copy(alpha = .12f), border = BorderStroke(1.dp, CcRed.copy(alpha = .45f))) { Text(message, Modifier.padding(12.dp), color = CcRed) }
@Composable private fun ConnectionStateBanner(state: ConnectionState, updatedAt: Long?) = Surface(shape = RoundedCornerShape(20.dp), color = statusColor(state.name).copy(alpha = .12f)) { Text("${state.name}${updatedAt?.let { " · cached ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(it))}" } ?: ""}", Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = statusColor(state.name), style = MaterialTheme.typography.labelMedium) }
@Composable private fun StatusPill(value: String) = Surface(shape = RoundedCornerShape(16.dp), color = statusColor(value).copy(alpha = .14f)) { Text(value.replace('_', ' '), Modifier.padding(horizontal = 8.dp, vertical = 4.dp), color = statusColor(value), style = MaterialTheme.typography.labelSmall) }
private fun statusColor(value: String) = when (value.uppercase()) { "HEALTHY", "ONLINE", "ACTIVE", "COMPLETED", "TRUSTED", "ON_TRACK" -> CcGreen; "AT_RISK", "BLOCKED", "DEGRADED", "URGENT", "HIGH" -> CcAmber; "FAILED", "OFFLINE", "REVOKED", "EXHAUSTED" -> CcRed; else -> CcBlue }
