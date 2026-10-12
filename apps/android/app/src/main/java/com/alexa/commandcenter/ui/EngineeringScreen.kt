@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.alexa.commandcenter.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.model.*
import java.math.BigDecimal

data class EngineeringCallbacks(
  val refresh: () -> Unit = {}, val open: (String) -> Unit = {}, val close: () -> Unit = {},
  val create: (String, String?, Boolean) -> Unit = { _, _, _ -> },
  val control: (String, String) -> Unit = { _, _ -> },
  val instruction: (String, String) -> Unit = { _, _ -> },
  val answer: (String, String, String) -> Unit = { _, _, _ -> },
  val preview: (String, String) -> Unit = { _, _ -> },
  val merge: (String) -> Unit = {}, val reject: (String, String?) -> Unit = { _, _ -> },
  val approvals: () -> Unit = {},
  val upload: (String, String, String, ByteArray) -> Unit = { _, _, _, _ -> },
  val githubLoad: () -> Unit = {},
  val github: (String, String, Long?, String?, String?) -> Unit = { _, _, _, _, _ -> },
)

@Composable fun EngineeringScreen(state: AlexaUiState, actions: EngineeringCallbacks) {
  LaunchedEffect(state.companies?.currentCompany?.id) { actions.refresh() }
  val online = state.connection == ConnectionState.ONLINE && !state.engineeringBusy
  val build = state.engineeringBuild
  if (build != null) { EngineeringBuildDetail(state, build, online, actions); return }
  var tab by rememberSaveable { mutableStateOf("Active Builds") }
  var query by rememberSaveable { mutableStateOf("") }
  var create by rememberSaveable { mutableStateOf(false) }
  var github by rememberSaveable { mutableStateOf(false) }
  val deliveries = state.engineering?.deliveries.orEmpty().filter {
    it.projectName.contains(query, true) || it.sourceRequest.contains(query, true)
  }
  LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item { Text("Engineering", style = MaterialTheme.typography.headlineLarge) }
    item { Text(if (state.connection == ConnectionState.ONLINE) "Canonical company builds" else "Offline · last-known state; changes disabled", color = AlexaMutedContent) }
    item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { create = true }, enabled = online) { Text("Build from phone") }
      OutlinedButton(onClick = actions.refresh, enabled = online) { Text("Refresh") }
    } }
    item { OutlinedTextField(query, { query = it }, label = { Text("Search builds and projects") }, modifier = Modifier.fillMaxWidth()) }
    item { FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      listOf("Active Builds", "Projects", "Repositories", "Previews", "Approvals", "Completed", "History").forEach {
        FilterChip(selected = tab == it, onClick = { if (it == "Approvals") actions.approvals() else tab = it }, label = { Text(it) })
      }
    } }
    if (tab in setOf("Projects", "Repositories")) {
      item { OutlinedButton(onClick = { actions.githubLoad(); github = true }, enabled = online) { Text("Company GitHub repositories") } }
      items(state.engineering?.projects.orEmpty().filter { it.projectName.contains(query, true) }, key = { it.repositoryId }) { project ->
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) {
          Text(project.projectName, style = MaterialTheme.typography.titleMedium)
          Text("${project.repositoryName} · ${project.defaultBranch}")
          Text("${project.repositoryStatus} · ${project.stack.joinToString()}", color = AlexaMutedContent)
          project.latestDeliveryId?.let { id -> TextButton(onClick = { actions.open(id) }, enabled = online) { Text("Open latest build") } }
        } }
      }
    } else {
      items(deliveries.filter { when (tab) {
        "Active Builds" -> EngineeringSafety.isActive(it.status)
        "Completed" -> !EngineeringSafety.isActive(it.status)
        "Previews" -> it.preview != null
        else -> true
      } }, key = { it.id }) { delivery ->
        Card(onClick = { actions.open(delivery.id) }, enabled = online, modifier = Modifier.fillMaxWidth()) {
          Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(delivery.projectName, style = MaterialTheme.typography.titleMedium)
            Text(delivery.sourceRequest, maxLines = 3)
            Text("${delivery.status} · ${delivery.features.count { it.status == "DONE" }}/${delivery.features.size} features")
            Text("${delivery.intent} · preview ${delivery.preview?.state ?: "not available"}", color = AlexaMutedContent)
            Text("Recorded model cost: ${engineeringCost(delivery.modelUsage)}")
          }
        }
      }
      if (deliveries.isEmpty()) item { Text("No recorded builds for this company.") }
    }
  }
  if (github) EngineeringGitHubDialog(state, online, actions) { github = false }
  if (create) EngineeringCreateDialog(state, online, { create = false }) { request, repo, self ->
    actions.create(request, repo, self); create = false
  }
}

@Composable private fun EngineeringCreateDialog(state: AlexaUiState, online: Boolean, dismiss: () -> Unit, submit: (String, String?, Boolean) -> Unit) {
  var request by rememberSaveable { mutableStateOf("") }
  var repo by rememberSaveable { mutableStateOf<String?>(null) }
  var self by rememberSaveable { mutableStateOf(false) }
  AlertDialog(onDismissRequest = dismiss, title = { Text("Engineering request") }, text = {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      OutlinedTextField(request, { if (it.length <= 8000) request = it }, label = { Text("Describe the change") }, minLines = 3)
      Row { Checkbox(self, { self = it }); Text("Improve Athena itself", Modifier.padding(top = 12.dp)) }
      if (self) Text("Athena resolves its explicitly registered repository. Risk and authority are decided by the server.")
      else state.engineering?.projects.orEmpty().filter { it.repositoryStatus == "ACTIVE" }.forEach { project ->
        FilterChip(selected = repo == project.repositoryId, onClick = { repo = project.repositoryId }, label = { Text(project.projectName) })
      }
      if (!self && state.engineering?.projects.isNullOrEmpty()) Text("Connect/register a repository before building.")
    }
  }, confirmButton = { Button(enabled = online && request.trim().length >= 5 && (self || repo != null), onClick = { submit(request, repo, self) }) { Text("Start build") } },
    dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable private fun EngineeringBuildDetail(state: AlexaUiState, build: EngineeringBuild, online: Boolean, actions: EngineeringCallbacks) {
  val delivery = build.delivery
  var instruction by rememberSaveable(delivery.id) { mutableStateOf("") }
  var answer by rememberSaveable(delivery.id) { mutableStateOf("") }
  var rejection by rememberSaveable(delivery.id) { mutableStateOf("") }
  var cancel by remember { mutableStateOf(false) }
  val candidate = state.engineeringIntegration?.candidate
  val context = LocalContext.current
  val previewUrl = EngineeringSafety.previewUrl(delivery.preview)
  LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item { TextButton(onClick = actions.close) { Text("Back to Engineering") }; Text(delivery.projectName, style = MaterialTheme.typography.headlineMedium); Text(delivery.sourceRequest) }
    item { Text("${delivery.status} · ${build.overallProgress.toInt()}% · elapsed ${build.elapsedMs / 1000}s"); LinearProgressIndicator(progress = { (build.overallProgress / 100).toFloat() }, modifier = Modifier.fillMaxWidth()) }
    item { Text("Recorded model cost: ${engineeringCost(delivery.modelUsage)}"); Text("Workspace / external API cost: not reported", color = AlexaMutedContent) }
    build.codingModels.orEmpty().filter { it.model != null }.forEach { model -> item {
      Text("Model: ${if (model.provider == "athena_coder") "AthenaCoder" else model.model}")
      if (model.localAttempt in setOf("PASS", "ESCALATED")) Text("Local attempt: ${model.localAttempt}", color = AlexaMutedContent)
    } }
    build.blocker?.let { blocker -> item { Text(blocker.message, color = AlexaAmber); Text(blocker.action) } }
    item { FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      OutlinedButton(onClick = { actions.control(delivery.id, "pause") }, enabled = online && delivery.status in setOf("PLANNING", "IMPLEMENTING", "INTEGRATING", "REVIEWING")) { Text("Pause") }
      OutlinedButton(onClick = { actions.control(delivery.id, "resume") }, enabled = online && delivery.status in setOf("PAUSED", "BLOCKED", "FAILED")) { Text("Resume") }
      OutlinedButton(onClick = { actions.control(delivery.id, "recover") }, enabled = online && build.recoveryAvailable) { Text("Retry / recover") }
      OutlinedButton(onClick = { cancel = true }, enabled = online && EngineeringSafety.isActive(delivery.status)) { Text("Cancel") }
    } }
    item { EngineeringProjectInputPicker(delivery.objectiveId, state.engineeringInputs, online && EngineeringSafety.isActive(delivery.status), actions.upload) }
    item { Text("Features", style = MaterialTheme.typography.titleMedium) }
    items(delivery.features, key = { it.id }) { Text("${it.name} · ${it.status}") }
    item { Text("Active agents", style = MaterialTheme.typography.titleMedium) }
    items(build.activeAgents, key = { it.taskId }) { Text("${it.role} · ${it.modelTier}\n${it.taskTitle} · ${it.status} · ${it.elapsedMs / 1000}s · attempt ${it.attempt}") }
    item { val v = delivery.validation; Text("Lint ${v.lint}\nTypecheck ${v.typecheck}\nTests ${v.tests}\nBuild ${v.build}\nReview ${v.review}") }
    item { Text("Preview · ${delivery.preview?.state ?: "not available"}"); FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      Button(enabled = online && previewUrl != null, onClick = { previewUrl?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } }) { Text("Open preview") }
      OutlinedButton(enabled = online && delivery.preview != null, onClick = { actions.preview(delivery.id, "restart") }) { Text("Restart") }
      OutlinedButton(enabled = online && delivery.preview != null, onClick = { actions.preview(delivery.id, "stop") }) { Text("Stop") }
    }; if (delivery.preview?.url != null && previewUrl == null) Text("Preview is unavailable, expired or local to another device.", color = AlexaMutedContent) }
    state.engineeringObjective?.objective?.clarification?.takeIf { it.status == "PENDING" }?.let { clarification -> item {
      Text(clarification.question, color = AlexaAmber)
      OutlinedTextField(answer, { if (it.length <= 2000) answer = it }, label = { Text("Answer clarification") })
      Button(enabled = online && answer.isNotBlank(), onClick = { actions.answer(delivery.objectiveId, clarification.id, answer) }) { Text("Answer and resume") }
    } }
    item { OutlinedTextField(instruction, { if (it.length <= 2000) instruction = it }, label = { Text("Add instruction / follow-up") }, modifier = Modifier.fillMaxWidth())
      Button(enabled = online && instruction.trim().length >= 3, onClick = { actions.instruction(delivery.id, instruction) }) { Text("Send instruction") } }
    candidate?.let { c -> item {
      Text("Candidate · ${c.status}", style = MaterialTheme.typography.titleMedium); Text(c.diffSummary)
      Text("Head ${c.headCommit.take(12)} · security review ${if (c.securityReviewId == null) "not required / not recorded" else "recorded"}")
      c.risks.forEach { Text(it, color = AlexaAmber) }; c.warnings.forEach { Text(it, color = AlexaMutedContent) }
      delivery.integrationRunId?.let { runId ->
        Button(enabled = online && EngineeringSafety.candidateIsReviewable(c, delivery.companyId), onClick = { actions.merge(runId) }) { Text("Request governed merge") }
        Text("Decide the exact candidate approval in Approvals, then retry merge. Biometric authentication remains required by policy.")
        TextButton(onClick = actions.approvals) { Text("Open approval inbox") }
        OutlinedTextField(rejection, { if (it.length <= 500) rejection = it }, label = { Text("Rejection reason (optional)") })
        OutlinedButton(enabled = online && c.status == "READY", onClick = { actions.reject(runId, rejection.trim().takeIf { it.isNotEmpty() }) }) { Text("Reject candidate") }
      }
    } }
    items(state.engineeringIntegration?.reviews.orEmpty(), key = { it.id }) { review -> Text("Review ${review.verdict}\n${review.findings.joinToString("\n")}") }
    item { Text("Changed files (${delivery.filesChanged.size})", style = MaterialTheme.typography.titleMedium) }
    items(delivery.filesChanged.take(200)) { Text(it) }
    item { Text("History", style = MaterialTheme.typography.titleMedium) }
    items(build.timeline.takeLast(30), key = { it.id }) { Text("${it.type} · ${it.summary}", color = AlexaMutedContent) }
  }
  if (cancel) AlertDialog(onDismissRequest = { cancel = false }, title = { Text("Cancel this build?") }, text = { Text("Completed work, costs and evidence are preserved.") }, confirmButton = { TextButton(onClick = { actions.control(delivery.id, "cancel"); cancel = false }) { Text("Cancel build") } }, dismissButton = { TextButton(onClick = { cancel = false }) { Text("Keep running") } })
}

private fun engineeringCost(usage: List<EngineeringModelUsage>): String = if (usage.isEmpty()) "unknown / not reported" else runCatching {
  "$" + usage.fold(BigDecimal.ZERO) { total, row -> total + BigDecimal(row.costUsd) }.stripTrailingZeros().toPlainString()
}.getOrDefault("unknown / not reported")


@Composable private fun EngineeringGitHubDialog(state: AlexaUiState, online: Boolean, actions: EngineeringCallbacks, close: () -> Unit) {
  var credential by rememberSaveable { mutableStateOf<String?>(null) }
  var projectName by rememberSaveable { mutableStateOf("") }
  var approvalId by rememberSaveable { mutableStateOf<String?>(null) }
  AlertDialog(onDismissRequest = close, title = { Text("Company GitHub") },
    text = { LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      item { Text("Select a configured company connection. Repository writes require exact review and recent biometric authentication.") }
      if (state.engineeringGitHubBindings.isEmpty()) item { Text("No ready GitHub connection. Configure its company credential and reviewed provider on the server.") }
      items(state.engineeringGitHubBindings, key = { it.credentialRef ?: it.integrationId }) { binding ->
        FilterChip(selected = credential == binding.credentialRef, onClick = { credential = binding.credentialRef }, label = { Text(binding.integrationId) })
      }
      item { Button(onClick = { credential?.let { actions.github("list_repositories", it, null, null, null) } }, enabled = online && credential != null) { Text("Load authorized repositories") } }
      state.engineeringGitHubMessage?.let { message -> item { Text(message) } }
      item { TextButton(onClick = actions.approvals) { Text("Open biometric approval inbox") } }
      items(state.approvalDetails.values.filter { it.status == "APPROVED" && it.toolName == "universal.external_publish" }.sortedByDescending { it.requestedAt }.take(10), key = { it.id }) { approval ->
        FilterChip(selected = approvalId == approval.id, onClick = { approvalId = approval.id }, label = { Text("Reviewed: ${approval.humanSummary}") })
      }
      items(state.engineeringGitHubRepos, key = { it.providerRepositoryId }) { repo ->
        Column { Text("${repo.fullName} · ${repo.defaultBranch}")
          if (repo.registrationId.isNotBlank()) Text("Registered · workspace preparation required")
          else TextButton(onClick = { credential?.let { actions.github("register_repository", it, repo.providerRepositoryId, null, approvalId) } }, enabled = online && credential != null) { Text("Register / retry approved request") }
        }
      }
      item { OutlinedTextField(projectName, { projectName = it.take(100) }, label = { Text("New private repository name") }) }
      item { Button(onClick = { credential?.let { actions.github("create_repository", it, null, projectName, approvalId) } }, enabled = online && credential != null && projectName.matches(Regex("[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"))) { Text("Create / retry approved repository") } }
    } }, confirmButton = { TextButton(onClick = close) { Text("Close") } })
}


@Composable private fun EngineeringProjectInputPicker(objectiveId: String, inputs: List<EngineeringProjectInput>, enabled: Boolean, upload: (String, String, String, ByteArray) -> Unit) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var reading by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    if (uri != null && enabled) scope.launch {
      reading = true; error = null
      try {
        val input = withContext(Dispatchers.IO) {
          val mime = context.contentResolver.getType(uri) ?: kotlin.error("File type is unavailable.")
          check(mime in setOf("image/png", "image/jpeg", "text/plain")) { "Choose PNG, JPEG or plain text." }
          val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
          } ?: kotlin.error("File name is unavailable.")
          check(name.length <= 120 && name.matches(Regex("[A-Za-z0-9][A-Za-z0-9 ._-]*"))) { "Use a simple file name without path characters." }
          val bytes = context.contentResolver.openInputStream(uri)?.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (true) {
              val count = stream.read(buffer)
              if (count < 0) break
              check(output.size() + count <= 262144) { "Images are limited to 256 KiB; text to 16 KiB." }
              output.write(buffer, 0, count)
            }
            output.toByteArray()
          } ?: kotlin.error("File could not be read.")
          check(bytes.isNotEmpty() && (mime != "text/plain" || bytes.size <= 16384)) { "Input size is invalid." }
          Triple(name, mime, bytes)
        }
        upload(objectiveId, input.first, input.second, input.third)
      } catch (failure: Exception) { error = failure.message ?: "File selection failed." }
      finally { reading = false }
    }
  }
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text("Project references", style = MaterialTheme.typography.titleMedium)
    Text("PNG/JPEG ≤256 KiB; TXT/Markdown ≤16 KiB. Stored as untrusted objective data.", color = AlexaMutedContent)
    OutlinedButton(enabled = enabled && !reading && inputs.size < 12, onClick = { picker.launch(arrayOf("image/png", "image/jpeg", "text/plain")) }) { Text(if (reading) "Reading selected file…" else "Attach project input") }
    inputs.forEach { Text("${it.fileName} · ${it.byteLength} bytes · untrusted reference") }
    error?.let { Text(it, color = AlexaAmber) }
  }
}
