package com.alexa.commandcenter.documents

import android.content.Intent
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.alexa.commandcenter.model.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import java.io.File
import java.util.UUID

@Composable
fun DocumentsScreen(actions: DocumentActions, onBack: () -> Unit, onExplain: (String) -> Unit) {
 val context = LocalContext.current; val scope = rememberCoroutineScope()
 val company = actions.company()
 if (company == null) {
  Column(Modifier.fillMaxSize().padding(16.dp)) {
   TextButton(onClick = onBack) { Text("Back to Athena") }
   Text("Select a company before scanning documents.")
  }
  return
 }
 val store = remember(company) { PendingScanStore(context) }
 var pending by remember(company) { mutableStateOf(store.read(company)) }
 var docs by remember(company) { mutableStateOf<List<AthenaDocument>>(emptyList()) }
 var selected by remember(company) { mutableStateOf<AthenaDocument?>(null) }
 var query by remember { mutableStateOf("") }; var filter by remember { mutableStateOf("All") }
 var message by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
 var settings by remember(company) { mutableStateOf(DocumentSettings()) }
 var captureUri by rememberSaveable { mutableStateOf<String?>(null) }
 var memories by remember { mutableStateOf<List<DocumentMemory>>(emptyList()) }
 var imageBytes by remember { mutableStateOf<ByteArray?>(null) }
 var editTitle by remember { mutableStateOf("") }; var editTags by remember { mutableStateOf("") }
 suspend fun refresh() { docs = actions.list(query).getOrThrow(); settings = actions.settings().getOrThrow() }
 fun work(block: suspend () -> Unit) { scope.launch { busy = true; message = null; try { block() } catch (_: Exception) { message = "Could not complete this action. Your saved originals remain available; retry when connected." } finally { busy = false } } }
 fun add(source: String, uris: List<android.net.Uri>) = work { pending = withContext(Dispatchers.IO) { store.add(company, source, uris) } }
 val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) captureUri?.let { add("CAMERA", listOf(android.net.Uri.parse(it))) } }
 val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) add("IMPORT", uris) }
 LaunchedEffect(company) { runCatching { refresh() }.onFailure { message = "Connect to Athena to load Documents." } }
 LaunchedEffect(selected?.id) { imageBytes = null; memories = emptyList(); selected?.let { d -> editTitle = d.title; editTags = d.tags.joinToString(", "); actions.image(d.id, 1, if(d.pages.first().cleaned != null) "cleaned" else "original").onSuccess { imageBytes = it } } }
 LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
  item { TextButton(onClick = onBack) { Text("Back to Athena") }; Text("Documents / Scans", style = MaterialTheme.typography.headlineMedium) }
  message?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
  if (busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
  item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
   Button(enabled = !busy && pending?.submitted != true, onClick = { val file = File(context.filesDir, "documents/capture/${UUID.randomUUID()}.jpg"); file.parentFile?.mkdirs(); val uri = FileProvider.getUriForFile(context, context.packageName + ".documents", file); captureUri = uri.toString(); camera.launch(uri) }) { Text("Scan") }
   OutlinedButton(enabled = !busy && pending?.submitted != true, onClick = { picker.launch(arrayOf("image/jpeg", "image/png")) }) { Text("Import image") }
  }; Text("JPEG/PNG · up to 5 pages · 6 MiB and 16 MP per page. Originals stay private.", style = MaterialTheme.typography.bodySmall) }
  pending?.let { scan ->
   item {
    Text("Pending scan · ${scan.files.size} page(s), in capture order")
    val preview = remember(scan.files) { runCatching { val bytes = store.bytes(scan, 0); BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = 4 }) }.getOrNull() }
    preview?.let { Image(it.asImageBitmap(), "Original page preview", Modifier.fillMaxWidth().height(220.dp)) }
    Text("Review before upload. Add pages with Scan or Import. Athena preserves the original and creates a separate cleaned copy.")
    Button(enabled = !busy, onClick = { work {
     pending = withContext(Dispatchers.IO) { store.seal(company) }
     message = "UPLOADING"
     val d = actions.create(scan.key, scan.source, scan.files.size).getOrThrow(); selected = d
     if (d.stage == "UPLOADING") {
      val grants = actions.grants(d.id).getOrThrow()
      scan.files.indices.forEach { index ->
       check(actions.company() == company)
       val bytes = withContext(Dispatchers.IO) { store.bytes(scan, index) }
       actions.upload(d.id, index + 1, grants.first { it.page == index + 1 }, scan.mimeTypes[index], bytes).getOrThrow()
      }
     }
     selected = actions.action(d.id, "process").getOrThrow()
     repeat(100) {
      check(actions.company() == company)
      val result = actions.get(d.id).getOrThrow(); selected = result; message = result.stage
      if (result.stage in listOf("COMPLETE", "FAILED", "ARCHIVED")) {
       if (result.stage == "COMPLETE") { withContext(Dispatchers.IO) { store.clear(company) }; pending = null }
       refresh(); return@work
      }
      delay(3000)
     }
     message = "Still processing. Reopen the document to check its durable state."
    } }) { Text("Use scan / Retry upload") }
    TextButton(enabled = !busy, onClick = { store.clear(company); pending = null }) { Text("Discard local draft") }
   }
  }
  item { OutlinedTextField(query, { query = it.take(200) }, label = { Text("Search title, OCR text, summary or tags") }, modifier = Modifier.fillMaxWidth()); TextButton(onClick = { work { refresh() } }) { Text("Search / Refresh") } }
  item { Row { Text("Collection: "); var open by remember { mutableStateOf(false) }; TextButton(onClick = { open = true }) { Text(filter) }; DropdownMenu(open, { open = false }) { listOf("All", "Scans", "Study", "Projects", "Receipts", "Notes", "Other").forEach { category -> DropdownMenuItem(text = { Text(category) }, onClick = { filter = category; open = false }) } } } }
  selected?.let { d ->
   item {
    HorizontalDivider(); Text(d.title, style = MaterialTheme.typography.titleLarge)
    Text("${d.stage} · ${d.documentType} · memory ${d.memoryStatus}")
    imageBytes?.let { bytes -> val bitmap = remember(bytes) { documentPreviewBitmap(bytes) }; bitmap?.let { Image(it.asImageBitmap(), "Cleaned scan", Modifier.fillMaxWidth().height(300.dp)) } }
    d.pages.forEach { p ->
     Text("Page ${p.number}: ${p.ocrStatus} · ${p.ocr?.provider ?: "No extraction"}")
     Row { TextButton(onClick = { work { imageBytes = actions.image(d.id, p.number, "original").getOrThrow() } }) { Text("Original") }; if(p.cleaned != null) TextButton(onClick = { work { imageBytes = actions.image(d.id, p.number, "cleaned").getOrThrow() } }) { Text("Cleaned scan") } }
     p.warnings.forEach { Text(it, color = MaterialTheme.colorScheme.tertiary) }
     Text(p.ocr?.text ?: "No text extracted. Retry OCR if unavailable.")
     if(p.memoryIds.isNotEmpty()) Text("Derived memory IDs: ${p.memoryIds.joinToString()}", style = MaterialTheme.typography.bodySmall)
    }
    Text("Interpreted summary (separate from raw OCR)", style = MaterialTheme.typography.titleSmall); Text(d.summary)
    d.understanding?.let { interpretation ->
     if(interpretation.dates.isNotEmpty()) Text("Dates (from OCR): ${interpretation.dates.joinToString()}")
     if(interpretation.entities.isNotEmpty()) Text("Labelled entities: ${interpretation.entities.joinToString()}")
     interpretation.actionItems.forEach { Text("Suggested action (review required): $it") }
     Text(if(interpretation.memoryCandidate) "Useful content may be added to memory after review." else "No automatic memory candidate.")
    }
    OutlinedTextField(editTitle, { editTitle = it }, label = { Text("Title") })
    OutlinedTextField(editTags, { editTags = it }, label = { Text("Tags, comma separated") })
    var collection by remember(d.id) { mutableStateOf(d.collection) }; var showCollections by remember { mutableStateOf(false) }
    TextButton(onClick = { showCollections = true }) { Text("Move to: $collection") }; DropdownMenu(showCollections, { showCollections = false }) { listOf("Scans","Study","Projects","Receipts","Notes","Other").forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { collection = c; showCollections = false }) } }
    TextButton(onClick = { work { selected = actions.edit(d.id, editTitle, editTags.split(',').map { it.trim() }.filter { it.isNotEmpty() }, collection).getOrThrow(); refresh() } }) { Text("Save title / tags / collection") }
    TextButton(enabled = !busy, onClick = { work { selected = actions.action(d.id, "reprocess").getOrThrow(); refresh() } }) { Text("Retry OCR / Reprocess image") }
    TextButton(enabled = !busy, onClick = { work { selected = actions.get(d.id).getOrThrow() } }) { Text("Refresh processing state") }
    TextButton(enabled = !busy && !d.sensitive && !d.neverMemory, onClick = { work { selected = actions.action(d.id, "memory").getOrThrow() } }) { Text("Add useful content to memory") }
    TextButton(onClick = { work { memories = actions.memories(d.id).getOrThrow().memories } }) { Text("View document-derived memories") }
    memories.forEach { Text("Page ${it.page} · ${it.title}: ${it.summary}") }
    TextButton(onClick = { work { selected = actions.action(d.id, "exclude-memory").getOrThrow(); memories = emptyList() } }) { Text("Remove document-derived memories") }
    TextButton(onClick = { work { selected = actions.action(d.id, "exclude-memory", true).getOrThrow(); memories = emptyList() } }) { Text("Never add this document to memory") }
    TextButton(enabled = DocumentSafety.mayUseContext(d), onClick = { onExplain("Explain document ${d.id}") }) { Text("Ask Athena to explain this") }
    TextButton(enabled = !d.sensitive && !busy, onClick = { work {
     val bytes = actions.export(d.id).getOrThrow(); val file = File(context.filesDir, "documents/exports/${d.id}.json"); file.parentFile?.mkdirs(); file.writeBytes(bytes)
     val uri = FileProvider.getUriForFile(context, context.packageName + ".documents", file)
     context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "application/json"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }, "Share document metadata and text"))
    } }) { Text("Export / Share text and metadata") }
    var confirmArchive by remember { mutableStateOf(false) }
    TextButton(onClick = { confirmArchive = true }) { Text("Delete from Documents") }
    if(confirmArchive) AlertDialog(onDismissRequest = { confirmArchive = false }, title = { Text("Archive document?") }, text = { Text("It will disappear from Documents and derived memories will be excluded. Permanent erasure is unavailable under Athena retention policy.") }, confirmButton = { TextButton(onClick = { confirmArchive = false; work { actions.action(d.id, "archive").getOrThrow(); selected = null; refresh() } }) { Text("Archive") } }, dismissButton = { TextButton(onClick = { confirmArchive = false }) { Text("Cancel") } })
    TextButton(onClick = { selected = null }) { Text("Close document") }
   }
  }
  items(docs.filter { filter == "All" || it.collection == filter }, key = { it.id }) { d ->
   Card(Modifier.fillMaxWidth().clickable { selected = d }) { Column(Modifier.padding(12.dp)) {
    var thumbnail by remember(d.id) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(d.id, d.pages.firstOrNull()?.thumbnail) { if(d.pages.firstOrNull()?.thumbnail != null) actions.image(d.id, 1, "thumbnail").onSuccess { thumbnail = BitmapFactory.decodeByteArray(it, 0, it.size) } }
    thumbnail?.let { Image(it.asImageBitmap(), "Document thumbnail", Modifier.height(90.dp)) }
    Text(d.title); Text("${d.createdAt.take(10)} · ${d.documentType} · ${d.pages.size} pages"); Text("${d.stage} · OCR ${d.pages.firstOrNull()?.ocrStatus} · memory ${d.memoryStatus}") } }
  }
  item {
   HorizontalDivider()
   var providerReview by remember { mutableStateOf(false) }
   TextButton(onClick = { providerReview = true }) { Text("Review local scanning provider") }
   if(providerReview) AlertDialog(onDismissRequest = { providerReview = false }, title = { Text("Enable finite local scan capabilities?") }, text = { Text("Enable page processing, local English OCR and deterministic classification for this company through Athena's Tool Gateway. No external vision provider or storage credential is granted. Images remain private; OCR and memory need review.") }, confirmButton = { TextButton(onClick = { providerReview = false; work { actions.reviewProvider().getOrThrow(); message = "Local document capabilities reviewed and enabled." } }) { Text("Review and enable") } }, dismissButton = { TextButton(onClick = { providerReview = false }) { Text("Cancel") } })
   Text("Scanning settings", style = MaterialTheme.typography.titleMedium)
   Row { Text("Auto-clean scan"); Switch(settings.autoClean, { value -> work { settings = actions.saveSettings(settings.copy(autoClean = value)).getOrThrow() } }) }
   Row { Text("Auto-OCR"); Switch(settings.autoOcr, { value -> work { settings = actions.saveSettings(settings.copy(autoOcr = value)).getOrThrow() } }) }
   Text("Memory: ${settings.autoMemory}")
   listOf("OFF", "SUGGEST", "AUTO_FOR_APPROVED_CATEGORIES").forEach { mode -> TextButton(onClick = { work { settings = actions.saveSettings(settings.copy(autoMemory = mode)).getOrThrow() } }) { Text(mode) } }
   Text("Auto memory is limited to explicitly approved Study/Projects categories; uncertain or sensitive pages are blocked.")
   listOf("Study", "Projects").forEach { category -> Row { Text("Approve $category"); Checkbox(settings.approvedCategories.contains(category), { enabled -> work { settings = actions.saveSettings(settings.copy(approvedCategories = if(enabled) (settings.approvedCategories + category).distinct() else settings.approvedCategories - category)).getOrThrow() } }) } }
  }
 }
}

/** Bounded display decode; the full-resolution original remains unchanged. */
private fun documentPreviewBitmap(bytes: ByteArray): android.graphics.Bitmap? {
 val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
 BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
 if(bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 16000000) return null
 var sample = 1
 while(bounds.outWidth.toLong() * bounds.outHeight / (sample * sample) > 2000000) sample *= 2
 return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
}
