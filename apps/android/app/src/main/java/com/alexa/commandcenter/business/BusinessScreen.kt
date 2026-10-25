package com.alexa.commandcenter.business

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.model.*
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun BusinessScreen(actions: BusinessActions, onBack: () -> Unit, onApprovals: () -> Unit) {
  val scope = rememberCoroutineScope()
  var projects by remember { mutableStateOf<List<EngineeringProject>>(emptyList()) }
  var campaigns by remember { mutableStateOf<List<BusinessCampaign>>(emptyList()) }
  var selected by rememberSaveable { mutableStateOf<String?>(null) }
  var detail by remember { mutableStateOf<BusinessView?>(null) }
  var usage by remember { mutableStateOf<BusinessTelemetry?>(null) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var current by remember { mutableStateOf(false) }
  var title by rememberSaveable { mutableStateOf("") }
  var product by rememberSaveable { mutableStateOf("") }
  var audience by rememberSaveable { mutableStateOf("") }
  var repository by rememberSaveable { mutableStateOf("") }
  var sourceCampaign by rememberSaveable { mutableStateOf<String?>(null) }
  var type by rememberSaveable { mutableStateOf("BRAND_PACKAGE") }
  val createKey = rememberSaveable(title, product, audience, repository, type, sourceCampaign) { UUID.randomUUID().toString() }
  var metric by rememberSaveable { mutableStateOf("activeUsers") }
  var windowStart by rememberSaveable { mutableStateOf(java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(7).toString()) }
  var windowEnd by rememberSaveable { mutableStateOf(java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1).toString()) }
  var expanded by remember { mutableStateOf<String?>(null) }

  suspend fun refresh() {
    val company = actions.company() ?: throw IllegalStateException("Select a company")
    val values = actions.list().getOrThrow()
    check(actions.company() == company)
    projects = actions.projects().getOrDefault(emptyList())
    check(actions.company() == company)
    campaigns = values
    val id = selected
    if (id != null) {
      val result = actions.get(id).getOrThrow()
      val costs = actions.telemetry(id).getOrNull()
      check(actions.company() == company && selected == id)
      detail = result
      usage = costs
    }
    current = true
  }
  fun run(work: suspend () -> Unit) {
    if (busy) return
    busy = true
    error = null
    scope.launch {
      try { work(); refresh() }
      catch (cancel: CancellationException) { throw cancel }
      catch (_: Exception) { current = false; error = "Unable to update business work. Refresh and retry; no completion is assumed." }
      finally { busy = false }
    }
  }
  LaunchedEffect(actions, selected) {
    detail = null
    usage = null
    current = false
    while (true) {
      if (!busy) {
        try { refresh(); error = null }
        catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) { current = false; error = "Business data unavailable. Check your connection and company selection." }
      }
      delay(15000)
    }
  }
  LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item {
      TextButton(onClick = onBack) { Text("Back to Athena") }
      Text("Business / Campaigns", style = MaterialTheme.typography.headlineSmall)
      Text("Prepare and review business work. Public actions need their own approval.")
      error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
      if (busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
      TextButton(onClick = { run { } }, enabled = !busy) { Text("Refresh") }
    }
    if (selected == null) {
      item {
        OutlinedTextField(title, { title = it.take(160) }, label = { Text("Objective title") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(product, { product = it.take(160) }, label = { Text("Product or business") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(audience, { audience = it.take(1000) }, label = { Text("Audience (optional)") }, modifier = Modifier.fillMaxWidth())
        BusinessSafety.types.forEach { choice ->
          TextButton(onClick = { type = choice }) { Text((if (type == choice) "✓ " else "") + choice.replace('_', ' ')) }
        }
        if (type == "CAMPAIGN_ITERATION") {
          Text("Campaign to improve")
          campaigns.filter { it.status == "PACKAGE_READY" }.forEach { prior -> TextButton(onClick = { sourceCampaign = prior.id; product = prior.productOrCompany }) { Text((if (sourceCampaign == prior.id) "✓ " else "") + prior.title) } }
          if (campaigns.none { it.status == "PACKAGE_READY" }) Text("Complete and review a campaign before starting an iteration.")
        }
        if (type in listOf("LANDING_PAGE", "PRODUCT_LAUNCH")) {
          Text("Engineering project")
          if (projects.isEmpty()) Text("No approved project is available. Set up a project in Engineering first.")
          projects.forEach { project -> TextButton(onClick = { repository = project.repositoryId }) { Text((if (repository == project.repositoryId) "✓ " else "") + project.projectName) } }
        }
        Button(onClick = { run {
          val created = actions.create(BusinessCreate(createKey, title.trim(), product.trim(), type, audience.trim().ifBlank { null }, if (type in listOf("LANDING_PAGE", "PRODUCT_LAUNCH")) repository.ifBlank { null } else null, if (type == "CAMPAIGN_ITERATION") sourceCampaign else null)).getOrThrow()
          selected = created.id
        } }, enabled = !busy && current && (type != "CAMPAIGN_ITERATION" || sourceCampaign != null) && title.isNotBlank() && product.isNotBlank() && (type !in listOf("LANDING_PAGE", "PRODUCT_LAUNCH") || projects.any { it.repositoryId == repository })) { Text("Create draft objective") }
      }
      campaigns.forEach { campaign -> item(key = campaign.id) {
        OutlinedButton(onClick = { selected = campaign.id }, modifier = Modifier.fillMaxWidth()) { Text("${campaign.title} · ${campaign.status.replace('_', ' ')}") }
      } }
    } else {
      item { TextButton(onClick = { selected = null; detail = null }) { Text("All business objectives") } }
      detail?.let { view ->
        val c = view.campaign
        item {
          Text(c.title, style = MaterialTheme.typography.titleLarge)
          Text("${c.status.replace('_', ' ')} · ${view.progressPercent}% · ${view.approvalsPending} approvals pending")
          Text("Objective ${c.objectiveId}")
          Row {
            Button(onClick = { run { actions.control(c.id, "start").getOrThrow() } }, enabled = !busy && current && c.status !in setOf("CANCELLED", "PACKAGE_READY")) { Text(if (c.status == "PAUSED") "Resume" else "Continue") }
            TextButton(onClick = { run { actions.control(c.id, "pause").getOrThrow() } }, enabled = !busy && current && c.status !in setOf("PAUSED", "CANCELLED", "PACKAGE_READY")) { Text("Pause") }
            TextButton(onClick = { run { actions.control(c.id, "cancel").getOrThrow() } }, enabled = !busy && current && c.status != "CANCELLED") { Text("Cancel") }
          }
          Text("Pause stops the next stage; work already issued may finish and remain reviewable.")
          TextButton(onClick = onApprovals) { Text("Open approvals") }
          usage?.let { costs ->
            Text("Known cost USD ${costs.knownUsd} · ${costs.modelCalls} model calls · ${costs.inputTokens + costs.outputTokens} tokens")
            if (!costs.completeCostAttribution) Text("Cost incomplete: unavailable costs remain unknown.")
          } ?: Text("Usage/cost evidence unavailable")
        }
        c.deliverables.forEach { d -> item(key = d.id) {
          Text("${d.type.replace('_', ' ')} · ${d.status.replace('_', ' ')}", style = MaterialTheme.typography.titleSmall)
          Text("${d.role.replace('_', ' ')} · review ${d.approvalState.replace('_', ' ')}")
          d.toolId?.let { Text("Tool: $it") }
          if (d.type == "ANALYTICS_REPORT" && d.status == "READY") {
            Text("Choose a read-only performance measure and date window.")
            listOf("activeUsers" to "Active users", "sessions" to "Sessions", "screenPageViews" to "Page views", "engagedSessions" to "Engaged sessions").forEach { (id, label) -> TextButton(onClick = { metric = id }) { Text((if (metric == id) "✓ " else "") + label) } }
            OutlinedTextField(windowStart, { windowStart = it.take(10) }, label = { Text("From UTC date: YYYY-MM-DD") })
            OutlinedTextField(windowEnd, { windowEnd = it.take(10) }, label = { Text("Through UTC date: YYYY-MM-DD") })
            val window = runCatching {
              val start = java.time.LocalDate.parse(windowStart).atStartOfDay().toInstant(java.time.ZoneOffset.UTC)
              val end = java.time.LocalDate.parse(windowEnd).atTime(23, 59, 59).toInstant(java.time.ZoneOffset.UTC)
              check(start < end)
              start.toString() to end.toString()
            }.getOrNull()
            TextButton(onClick = { window?.let { dates -> run { actions.analytics(c.id, metric, dates.first, dates.second).getOrThrow() } } }, enabled = !busy && current && window != null) { Text("Read company analytics") }
          }
          d.blockerCode?.let { Text("Needs attention: ${it.replace('_', ' ')}") }
          if (d.status == "BLOCKED" && d.approvalState != "REJECTED" && d.type !in setOf("LANDING_PAGE", "IMAGE_ASSET", "VIDEO_ASSET", "LAUNCH_PACKAGE")) TextButton(onClick = { run { actions.recover(c.id, d.id).getOrThrow() } }, enabled = !busy && current) { Text("Prepare explicit retry") }
        } }
        view.artifacts.forEach { a -> item(key = a.id) {
          Text("${a.type.replace('_', ' ')} · v${a.version} · ${a.status}")
          TextButton(onClick = { expanded = if (expanded == a.id) null else a.id }) { Text(if (expanded == a.id) "Hide artifact" else "Inspect artifact") }
          if (expanded == a.id) {
            Text(a.content.toString().take(32768))
            a.provenance?.let { Text("Provenance: ${it.toString().take(12000)}") }
          }
          if (a.type == "GROWTH_STRATEGY" && a.status == "APPROVED" && a.content.isJsonObject) {
            val initiatives = a.content.asJsonObject.get("initiatives")?.takeIf { it.isJsonArray }?.asJsonArray
            initiatives?.take(6)?.forEachIndexed { index, proposal ->
              val label = if (proposal.isJsonObject) proposal.asJsonObject.get("title")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString?.take(160) ?: "Initiative ${index + 1}" else "Initiative ${index + 1}"
              TextButton(onClick = { run { actions.initiative(c.id, a.id, index).getOrThrow() } }, enabled = !busy && current) { Text("Draft objective: $label") }
            }
            Text("Drafting is idempotent. Open Objectives to review and explicitly activate an initiative.")
          }
          if (a.status == "DRAFT") TextButton(onClick = { run { actions.review(c.id, a.id, "request").getOrThrow() } }, enabled = !busy && current) { Text("Request review") }
          if (a.status == "IN_REVIEW") TextButton(onClick = { run { actions.review(c.id, a.id, "finalize").getOrThrow() } }, enabled = !busy && current) { Text("Refresh review decision") }
        } }
      }
    }
  }
}
