package com.alexa.commandcenter.documents

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.alexa.commandcenter.model.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentsScreen(actions: DocumentActions, onBack: () -> Unit, onExplain: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val company = actions.company()
    if (company == null) {
        Column(Modifier.fillMaxSize().padding(20.dp)) {
            DocumentHeader("Documents", "Your private document library", onBack)
            DocumentEmpty("Choose a company first", "Return to Athena and select where your documents belong.")
        }
        return
    }
    // A company switch recreates every controller state, image and draft reference.
    key(company) {
        val store = remember { PendingScanStore(context) }
        var pending by remember { mutableStateOf(store.read(company)) }
        var local by remember { mutableStateOf(pending?.let { store.local(it) }) }
        var view by rememberSaveable { mutableStateOf(DocumentView.LIBRARY) }
        var page by rememberSaveable { mutableIntStateOf(0) }
        var selected by remember { mutableStateOf<AthenaDocument?>(null) }
        var pendingDocumentId by rememberSaveable(pending?.key) { mutableStateOf<String?>(null) }
        var documents by remember { mutableStateOf<List<AthenaDocument>>(emptyList()) }
        var query by rememberSaveable { mutableStateOf("") }
        var collection by rememberSaveable { mutableStateOf("All") }
        var refreshKey by remember { mutableIntStateOf(0) }
        var libraryLoading by remember { mutableStateOf(true) }
        var libraryUnavailable by remember { mutableStateOf(false) }
        var task by remember { mutableStateOf<ScanTask?>(null) }
        var job by remember { mutableStateOf<Job?>(null) }
        var notice by remember { mutableStateOf<DocumentNotice?>(null) }
        var addPages by remember { mutableStateOf(false) }
        var replacePage by rememberSaveable { mutableStateOf<Int?>(null) }
        var captureCompany by rememberSaveable { mutableStateOf<String?>(null) }
        var captureUri by rememberSaveable { mutableStateOf<String?>(null) }
        var cropPage by remember { mutableStateOf<Int?>(null) }
        var removePage by remember { mutableStateOf<Int?>(null) }
        var discard by remember { mutableStateOf(false) }
        var providerReview by remember { mutableStateOf(false) }
        var settings by remember { mutableStateOf<DocumentSettings?>(null) }
        var memories by remember { mutableStateOf<List<DocumentMemory>>(emptyList()) }
        var draftTitle by rememberSaveable(pending?.key) { mutableStateOf(pending?.title?.takeUnless { it == "Untitled scan" } ?: "Scan · ${java.time.LocalDate.now()}") }
        var draftTags by rememberSaveable(pending?.key) { mutableStateOf(pending?.tags?.joinToString(", ") ?: "") }
        var useAthena by rememberSaveable { mutableStateOf(false) }
        var pdfPath by rememberSaveable { mutableStateOf<String?>(null) }
        val busy = task != null

        fun assertCompany() { check(actions.company() == company) }
        fun runTask(initial: ScanTask, failure: DocumentNotice, block: suspend () -> Unit) {
            if (task != null) return
            task = initial
            notice = null
            job = scope.launch {
                try { assertCompany(); block(); assertCompany() }
                catch (cancelled: CancellationException) {
                    notice = DocumentNotice("Paused on this phone", "Your pages are kept. You can resume the scan. Athena may continue a document it already received.")
                    throw cancelled
                } catch (_: Exception) { notice = failure }
                finally { task = null; job = null }
            }
        }
        fun back() {
            view = when (view) {
                DocumentView.REVIEW, DocumentView.DETAIL, DocumentView.SETTINGS -> DocumentView.LIBRARY
                DocumentView.SAVE -> DocumentView.REVIEW
                DocumentView.READY -> DocumentView.LIBRARY
                DocumentView.LIBRARY -> { onBack(); DocumentView.LIBRARY }
            }
        }
        BackHandler { back() }
        LaunchedEffect(view, query, refreshKey) {
            if (view != DocumentView.LIBRARY) return@LaunchedEffect
            if (query.isNotEmpty()) delay(350)
            libraryLoading = true
            val result = actions.list(query.take(200))
            currentCoroutineContext().ensureActive()
            if (actions.company() == company) {
                result.onSuccess { documents = it; libraryUnavailable = false }.onFailure { libraryUnavailable = true }
                libraryLoading = false
            }
        }
        LaunchedEffect(Unit) { withContext(Dispatchers.IO) { DocumentPdfExport.clean(context) } }
        LaunchedEffect(view) {
            if (view == DocumentView.SETTINGS) {
                val result = actions.settings()
                currentCoroutineContext().ensureActive()
                result.onSuccess { if (actions.company() == company) settings = it }
            }
        }
        LaunchedEffect(selected?.id) { memories = emptyList() }

        val exportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri ->
            val source = pdfPath?.let { File(it) }; pdfPath = null
            if (uri != null && source != null && actions.company() == company) {
                runTask(ScanTask("Saving PDF", "Copying to the location you chose."), DocumentNotice("Couldn’t save the copy", "Your scan is still safe. Choose another location and try again.", true)) {
                    withContext(Dispatchers.IO) {
                        try { DocumentPdfExport.uri(context, source); context.contentResolver.openOutputStream(uri, "w")!!.use { out -> source.inputStream().use { it.copyTo(out) } } }
                        finally { source.delete() }
                    }
                    notice = DocumentNotice("PDF saved", "Your searchable PDF was copied to the selected location.")
                }
            }
        }
        suspend fun exportPdf(bytes: ByteArray, mode: String, title: String) {
            assertCompany()
            val file = withContext(Dispatchers.IO) { DocumentPdfExport.file(context, bytes) }
            assertCompany()
            if (mode == "save") {
                pdfPath = file.absolutePath
                exportPicker.launch(title.take(100).replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").ifBlank { "Athena scan" } + ".pdf")
            } else context.startActivity(Intent.createChooser(DocumentPdfExport.intent(context, DocumentPdfExport.uri(context, file), mode == "share"), if (mode == "share") "Share PDF" else "Open PDF"))
        }
        fun showPdf(mode: String) {
            val requestedDocument = selected.takeIf { view == DocumentView.DETAIL || pending == null }
            val requestedScan = pending
            val requestedTitle = requestedDocument?.title ?: local?.title ?: draftTitle
            runTask(ScanTask("Preparing PDF", "Opening your saved searchable document."), DocumentNotice("Couldn’t open the PDF", "Your scan is saved. For a synced document, reconnect and try again. Opening a PDF requires a PDF viewer.", true)) {
                val bytes = if (requestedDocument != null) actions.pdf(requestedDocument.id).getOrThrow() else withContext(Dispatchers.IO) { store.localPdf(checkNotNull(requestedScan)) }
                exportPdf(bytes, mode, requestedTitle)
            }
        }
        fun add(source: String, uris: List<Uri>) {
            val replacing = replacePage; replacePage = null
            if (captureCompany != company || actions.company() != company) return
            runTask(ScanTask("Adding your pages", "Keeping a private copy of each original."), DocumentNotice("Couldn’t add these images", "Choose JPEG or PNG images, up to 6 MB and 16 megapixels each. A scan can have up to five pages.", true)) {
                val result = withContext(Dispatchers.IO) { store.add(company, source, uris, replacing) }
                assertCompany(); pending = result; local = null
                page = replacing ?: result.files.lastIndex
                view = DocumentView.REVIEW
            }
        }
        val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
            if (ok) captureUri?.let { add("CAMERA", listOf(Uri.parse(it))) } else {
                replacePage = null
                captureUri?.let { value ->
                    val uri = Uri.parse(value); val name = uri.lastPathSegment.orEmpty()
                    if (uri.authority == context.packageName + ".documents" && uri.pathSegments.firstOrNull() == "document_capture" && name.matches(Regex("[a-f0-9-]{36}\\.jpg"))) File(context.filesDir, "documents/capture/$name").delete()
                }
            }
            captureUri = null
        }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) add("IMPORT", uris) else replacePage = null }
        fun capture(replace: Int? = null) {
            if (busy) return
            try {
                replacePage = replace; captureCompany = company
                val file = File(context.filesDir, "documents/capture/${UUID.randomUUID()}.jpg").apply { parentFile?.mkdirs() }
                val uri = FileProvider.getUriForFile(context, context.packageName + ".documents", file)
                captureUri = uri.toString(); addPages = false; camera.launch(uri)
            } catch (_: Exception) { notice = DocumentNotice("Camera unavailable", "Try importing a photo instead, or check that a camera app is installed.", true) }
        }
        fun importImages(replace: Int? = null) { if (!busy) { replacePage = replace; captureCompany = company; addPages = false; picker.launch(arrayOf("image/jpeg", "image/png")) } }
        fun editDraft(after: () -> Unit = {}, transform: (PendingScan) -> PendingScan) {
            val scan = pending ?: return
            runTask(ScanTask("Updating your scan", "Keeping the original pages untouched."), DocumentNotice("Couldn’t update the page", "Your original is kept. Try the edit again.", true)) {
                val updated = withContext(Dispatchers.IO) { transform(scan) }
                assertCompany(); pending = updated; local = null; after()
            }
        }
        suspend fun preparedDraft(): PendingScan {
            val scan = checkNotNull(pending)
            if (scan.submitted) return scan
            val changed = scan.copy(title = draftTitle.trim().ifBlank { "Untitled scan" }, tags = DocumentFlow.tags(draftTags))
            if (changed == scan) return scan
            return withContext(Dispatchers.IO) { store.update(changed) }.also { assertCompany(); pending = it; local = null }
        }
        suspend fun waitForDocument(id: String): AthenaDocument {
            repeat(100) {
                assertCompany()
                val result = actions.get(id).getOrThrow()
                assertCompany(); selected = result
                if (result.stage in listOf("COMPLETE", "FAILED", "ARCHIVED")) return result
                task = DocumentFlow.task(result.stage, result.pages.size)
                delay(3000)
            }
            throw IllegalStateException("DOCUMENT_STILL_PROCESSING")
        }
        fun upload() {
            runTask(DocumentFlow.task("UPLOADING", pending?.files?.size ?: 1), DocumentNotice("Your upload can be resumed", "The original pages are kept on this phone. Reconnect, then tap Resume upload. Scanning may need to be enabled in settings.", true)) {
                val scan = preparedDraft()
                pending = withContext(Dispatchers.IO) { store.seal(company) }
                val document = actions.create(scan.key, scan.source, scan.files.size, scan.edits).getOrThrow()
                assertCompany(); selected = document; pendingDocumentId = document.id
                if (document.stage == "UPLOADING") {
                    val grants = actions.grants(document.id).getOrThrow()
                    for (index in scan.files.indices) {
                        assertCompany()
                        task = ScanTask("Uploading page ${index + 1} of ${scan.files.size}", "Your originals stay on this phone until saving is confirmed.", index, scan.files.size)
                        val bytes = withContext(Dispatchers.IO) { store.bytes(scan, index) }
                        actions.upload(document.id, index + 1, grants.first { it.page == index + 1 }, scan.mimeTypes[index], bytes).getOrThrow()
                    }
                }
                // Existing server processing, permissions and approvals remain the only cloud path.
                if (document.stage !in listOf("COMPLETE", "ARCHIVED")) actions.action(document.id, "process").getOrThrow()
                var saved = waitForDocument(document.id)
                if (saved.stage == "COMPLETE") {
                    saved = actions.edit(saved.id, scan.title, scan.tags, saved.collection).getOrThrow()
                    assertCompany(); selected = saved
                    if (saved.pdf != null) {
                        withContext(Dispatchers.IO) { store.clear(company) }
                        pending = null; local = null; view = DocumentView.DETAIL
                        notice = DocumentNotice("Saved to Athena", "Your document is ready to open, share and find by its text.")
                    } else { view = DocumentView.DETAIL; notice = DocumentNotice("Scan saved · PDF needs attention", "Athena kept the pages, but couldn’t build a searchable PDF. Your phone copy is kept too. Review the text and try processing again.", true) }
                } else {
                    view = DocumentView.DETAIL
                    notice = DocumentNotice(if (DocumentFlow.providerReviewNeeded(saved)) "Enable scanning for this company" else "Your scan needs attention", if (DocumentFlow.providerReviewNeeded(saved)) "Review the local scanning provider in settings, then resume the upload." else "Your pages are kept. Check the source images and resume when you’re ready.", true)
                }
                refreshKey++
            }
        }
        fun createLocalPdf() {
            runTask(ScanTask("Reading your pages", "On this phone. Nothing is being uploaded.", 0, pending?.files?.size), DocumentNotice("Some text couldn’t be read", "A searchable PDF needs readable text on every page. Try rotating, cropping or retaking a blurry or blank page, then create the PDF again.", true)) {
                val scan = preparedDraft()
                val result = withContext(Dispatchers.Default) {
                    LocalDocumentProcessor(context).process(store, scan) { completed, total ->
                        withContext(Dispatchers.Main.immediate) { task = if (completed == total) ScanTask("Building your searchable PDF", "Adding selectable text and keeping your page order.") else ScanTask("Reading page ${completed + 1} of $total", "On this phone. Nothing is being uploaded.", completed, total) }
                    }
                }
                assertCompany(); local = result; selected = null; view = DocumentView.READY
                notice = null
            }
        }
        fun refreshDocument() {
            val document = selected ?: return
            runTask(ScanTask("Checking your document", "Getting the latest saved state from Athena."), DocumentNotice("Couldn’t refresh", "Reconnect and try again. Your saved document is unchanged.", true)) {
                selected = if (DocumentFlow.isProcessing(document.stage)) waitForDocument(document.id) else actions.get(document.id).getOrThrow()
            }
        }
        fun documentAction(action: String, never: Boolean = false) {
            val document = selected ?: return
            runTask(ScanTask("Updating your document", "Waiting for Athena to confirm the change."), DocumentNotice("Couldn’t complete the change", "Your document is kept. Reconnect and try again. Reprocessing requires removing linked memories first.", true)) {
                val result = actions.action(document.id, action, never).getOrThrow()
                assertCompany(); selected = result
                if (action == "reprocess") selected = waitForDocument(document.id)
                if (action == "archive") { selected = null; view = DocumentView.LIBRARY }
                refreshKey++
            }
        }

        val scan = pending
        page = page.coerceIn(0, maxOf(0, (scan?.files?.size ?: selected?.pages?.size ?: 1) - 1))
        val preview = if (view == DocumentView.REVIEW && scan != null) rememberDocumentPreview(listOf(scan.key, scan.files[page], scan.edits[page])) { LocalDocumentProcessor.clean(store.bytes(scan, page), scan.edits[page]) } else DocumentPreview(null, false)
        val thumbnails = mutableMapOf<Int, android.graphics.Bitmap>()
        if (view == DocumentView.REVIEW && scan != null) scan.files.indices.forEach { index ->
            val thumb = rememberDocumentPreview(listOf("thumb", scan.key, scan.files[index], scan.edits[index]), true) { LocalDocumentProcessor.clean(store.bytes(scan, index), scan.edits[index]) }
            thumb.bitmap?.let { thumbnails[index] = it }
        }
        cropPage?.let { index -> scan?.let {
            val original = rememberDocumentPreview(listOf("crop", scan.files[index], scan.edits[index].rotation)) { LocalDocumentProcessor.clean(store.bytes(scan, index), scan.edits[index].copy(crop = null)) }
            DocumentCropEditor(original.bitmap, scan.edits[index].crop, { cropPage = null }) { crop -> cropPage = null; editDraft { current -> store.update(current.copy(edits = current.edits.toMutableList().apply { set(index, current.edits[index].copy(crop = crop)) })) } }
        } }
        if (addPages) ModalBottomSheet(onDismissRequest = { addPages = false }) {
            Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (scan == null) "Start a new scan" else "Add another page", style = MaterialTheme.typography.headlineSmall)
                Text("Use a clear, well-lit image. Up to 5 pages per document.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                DocumentAction(Icons.Outlined.PhotoCamera, "Take a photo", "Open your camera", onClick = { capture() })
                DocumentAction(Icons.Outlined.PhotoLibrary, "Import images", "Choose JPEG or PNG photos", onClick = { importImages() })
            }
        }
        if (discard) AlertDialog(onDismissRequest = { discard = false }, title = { Text("Discard this phone draft?") }, text = { Text("This clears the draft and its local PDF on this phone. Documents already saved to Athena stay in your library.") }, confirmButton = { TextButton(onClick = {
            discard = false
            runTask(ScanTask("Clearing the draft", "Saved Athena documents stay in your library."), DocumentNotice("Couldn’t clear the draft", "Please try again.", true)) { withContext(Dispatchers.IO) { store.clear(company) }; pending = null; local = null; view = DocumentView.LIBRARY }
        }) { Text("Discard draft") } }, dismissButton = { TextButton(onClick = { discard = false }) { Text("Keep draft") } })
        removePage?.let { index -> AlertDialog(onDismissRequest = { removePage = null }, title = { Text("Remove page ${index + 1}?") }, text = { Text("This page will be left out of the document. ${if (scan?.files?.size == 1) "Removing the last page clears this phone draft." else "The other pages will stay in order."}") }, confirmButton = { TextButton(onClick = {
            removePage = null
            runTask(ScanTask("Removing the page", "Updating your draft."), DocumentNotice("Couldn’t remove the page", "Try again. The original is kept.", true)) {
                pending = withContext(Dispatchers.IO) { store.remove(checkNotNull(scan), index) }; local = null
                page = maxOf(0, index - 1); if (pending == null) view = DocumentView.LIBRARY
            }
        }) { Text("Remove page") } }, dismissButton = { TextButton(onClick = { removePage = null }) { Text("Keep page") } }) }
        if (providerReview) AlertDialog(onDismissRequest = { providerReview = false }, title = { Text("Enable Athena scanning?") }, text = { Text("Allow private page cleanup, English OCR and document organization for this company through Athena’s existing Tool Gateway. No external vision provider is enabled. This does not upload any pages or change memory preferences.") }, confirmButton = { TextButton(onClick = {
            providerReview = false
            runTask(ScanTask("Enabling scanning", "Applying your company’s reviewed provider permissions."), DocumentNotice("Couldn’t enable scanning", "Reconnect and try again. Disabled or revoked providers need review in Athena’s Tools settings.", true)) {
                actions.reviewProvider().getOrThrow(); notice = DocumentNotice("Athena scanning is enabled", "Return to your scan and tap Save to Athena or Resume upload.")
            }
        }) { Text("Review and enable") } }, dismissButton = { TextButton(onClick = { providerReview = false }) { Text("Not now") } })

        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = {
            when {
                view == DocumentView.REVIEW && scan != null -> ScanFooter(if (scan.submitted) "Resume upload" else "Continue", !busy, "${DocumentFlow.pageLabel(scan.files.size)} · Originals preserved") { if (scan.submitted) upload() else view = DocumentView.SAVE }
                view == DocumentView.SAVE && scan != null -> ScanFooter(if (useAthena) "Save to Athena" else "Create searchable PDF", !busy && draftTitle.isNotBlank(), if (useAthena) "Uploads your pages privately to the selected company" else "Works offline · Nothing leaves this phone") { if (useAthena) upload() else createLocalPdf() }
                view == DocumentView.READY && local != null -> ScanFooter(if (scan?.submitted == true) "Resume upload" else "Save to Athena", !busy, "Optional · Sync privately and search later in Athena") { upload() }
            }
        }) { padding ->
            LazyColumn(Modifier.fillMaxSize().padding(padding).then(if (view in listOf(DocumentView.REVIEW, DocumentView.SAVE, DocumentView.READY)) Modifier else Modifier.imePadding()), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item {
                    val title = when (view) { DocumentView.LIBRARY -> "Documents"; DocumentView.REVIEW -> "Review your pages"; DocumentView.SAVE -> "Name & save"; DocumentView.READY -> "Your PDF is ready"; DocumentView.DETAIL -> selected?.title ?: "Document"; DocumentView.SETTINGS -> "Scan settings" }
                    DocumentHeader(title, if (view == DocumentView.LIBRARY) "Scan, save, find it again." else if (view == DocumentView.SETTINGS) "For the selected company" else "Documents", { back() }, if (view == DocumentView.LIBRARY) ({ view = DocumentView.SETTINGS }) else null)
                    if (view in listOf(DocumentView.REVIEW, DocumentView.SAVE, DocumentView.READY)) ScanSteps(if (view == DocumentView.REVIEW) 0 else if (view == DocumentView.SAVE) 1 else 2)
                }
                notice?.let { item { NoticeCard(it) { notice = null } } }
                task?.let { item { ScanTaskCard(it, { view = if (pending != null) DocumentView.REVIEW else DocumentView.DETAIL }, { job?.cancel() }) } }
                when (view) {
                    DocumentView.LIBRARY -> {
                        if (scan == null) item { ScanHero(!busy) { addPages = true } }
                        if (scan != null) item { ResumeScanCard(scan, local != null, !busy) { view = if (local != null) DocumentView.READY else DocumentView.REVIEW } }
                        item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Your library", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge); TextButton(enabled = !libraryLoading, onClick = { refreshKey++ }) { Icon(Icons.Outlined.Refresh, null, Modifier.size(18.dp)); Text("Refresh") } } }
                        item { DocumentSearch(query, { query = it.take(200) }, "Search text, titles or tags") { refreshKey++ } }
                        item { CollectionFilters(collection) { collection = it } }
                        if (libraryLoading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                        if (libraryUnavailable) item { NoticeCard(DocumentNotice("Library unavailable", "Reconnect to load saved Athena documents. You can still work on a phone scan.", true)) { libraryUnavailable = false } }
                        val matches = documents.filter { collection == "All" || it.collection == collection }
                        if (matches.isEmpty() && !libraryLoading) item { DocumentEmpty(if (query.isNotBlank()) "No matching documents" else "Make room for less paper.", if (query.isNotBlank()) "Try a shorter phrase, title or tag." else "Scans saved to Athena appear here. Your phone draft stays separate until you choose to upload it.") }
                        items(matches, key = { it.id }) { document ->
                            val image = rememberDocumentPreview(listOf(document.id, document.pages.firstOrNull()?.thumbnail), true) { if (document.pages.firstOrNull()?.thumbnail != null) actions.image(document.id, 1, "thumbnail").getOrNull().also { assertCompany() } else null }
                            DocumentRow(document, image.bitmap, !busy) { selected = document; page = 0; view = DocumentView.DETAIL }
                        }
                    }
                    DocumentView.REVIEW -> if (scan != null) {
                        item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Page ${page + 1} of ${scan.files.size}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); TextButton(enabled = !busy && !scan.submitted && scan.files.size < 5, onClick = { addPages = true }) { Icon(Icons.Outlined.Add, null); Text("Add page") } } }
                        item { ScanPaper(preview.bitmap, "Page ${page + 1}", loading = preview.loading) }
                        item { PageEditToolbar(page, scan.files.size, !busy && !scan.submitted, { target -> val previous = page; editDraft(after = { page = target }) { store.move(it, previous, target) } }, { editDraft { current -> store.update(current.copy(edits = current.edits.toMutableList().apply { set(page, current.edits[page].copy(rotation = (current.edits[page].rotation + 90) % 360, crop = null)) })) } }, { cropPage = page }, { importImages(page) }, { capture(page) }, { removePage = page }) }
                        item { ScanPageStrip(scan.files.size, page, !busy, thumbnails) { page = it } }
                        item { Text(if (scan.submitted) "These pages are locked to keep upload retries consistent. Resume the upload, or discard this phone draft to start again." else "Check the text is upright and the whole page is visible. Use the arrows to change page order.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        if (scan.submitted) {
                            item { OutlinedButton(enabled = !busy, onClick = { createLocalPdf() }, modifier = Modifier.fillMaxWidth()) { Text("Make a phone PDF instead") } }
                            item { TextButton(enabled = !busy, onClick = { view = DocumentView.SETTINGS }) { Text("Scanning permissions & settings") } }
                        }
                        item { TextButton(enabled = !busy, onClick = { discard = true }) { Text("Discard phone draft", color = MaterialTheme.colorScheme.error) } }
                    } else item { DocumentEmpty("No draft to review", "Return to Documents to start a scan.") }
                    DocumentView.SAVE -> if (scan != null) {
                        item { Text("A name you’ll remember.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold); Text("${DocumentFlow.pageLabel(scan.files.size)} in the order you chose.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        item { OutlinedTextField(draftTitle, { draftTitle = it.take(160) }, Modifier.fillMaxWidth(), enabled = !busy && !scan.submitted, label = { Text("Document name") }, singleLine = true, shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)) }
                        item { OutlinedTextField(draftTags, { draftTags = it.take(730) }, Modifier.fillMaxWidth(), enabled = !busy && !scan.submitted, label = { Text("Tags (optional)") }, placeholder = { Text("Study, project, receipt…") }, supportingText = { Text("Separate tags with commas.") }, shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)) }
                        item { Text("Where would you like to save?", style = MaterialTheme.typography.titleMedium) }
                        item { SaveDestination(!useAthena, Icons.Outlined.PhoneAndroid, "On this phone", "Create a searchable PDF offline. Share or sync it later.", !busy) { useAthena = false } }
                        item { SaveDestination(useAthena, Icons.Outlined.CloudUpload, "In Athena", "Upload privately to this company’s library and search it later.", !busy) { useAthena = true } }
                        if (useAthena) item { TextButton(enabled = !busy, onClick = { providerReview = true }) { Icon(Icons.Outlined.VerifiedUser, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Review scanning permission") } }
                    }
                    DocumentView.READY -> local?.let { result ->
                        item { ReadyDocument(result.title, result.pages.size) }
                        item { DocumentAction(Icons.AutoMirrored.Outlined.OpenInNew, "Open PDF", "View and select its text", !busy) { showPdf("open") } }
                        item { DocumentAction(Icons.Outlined.Share, "Share PDF", "Send a read-only copy", !busy) { showPdf("share") } }
                        item { DocumentAction(Icons.Outlined.SaveAlt, "Save to files", "Choose a folder on your phone", !busy) { showPdf("save") } }
                        item { LocalDocumentText(result) }
                        item { Row { TextButton(enabled = !busy, onClick = { view = DocumentView.REVIEW }) { Text("Review pages") }; TextButton(enabled = !busy, onClick = { discard = true }) { Text("Discard phone draft") } } }
                    } ?: item { DocumentEmpty("No phone PDF yet", "Return to your draft to create one.") }
                    DocumentView.DETAIL -> selected?.let { document ->
                        item { SavedDocumentDetail(document, actions, company, busy, { mode -> showPdf(mode) }, { refreshDocument() }, { documentAction("reprocess") }, { providerReview = true }, { upload() }.takeIf { pending != null && pendingDocumentId == document.id },
                            onEdit = { title, tags, targetCollection -> runTask(ScanTask("Saving changes", "Updating the name, tags and PDF metadata."), DocumentNotice("Couldn’t save your changes", "Your document is kept. Reconnect and try again.", true)) { selected = actions.edit(document.id, title, tags, targetCollection).getOrThrow(); refreshKey++ } },
                            onAction = { action, never -> documentAction(action, never) }, onExplain = { onExplain("Explain document ${document.id}") }, memories = memories,
                            onMemories = { runTask(ScanTask("Loading linked memories", "Only memories from this document are included."), DocumentNotice("Couldn’t load memories", "Reconnect and try again.", true)) { memories = actions.memories(document.id).getOrThrow().memories } },
                            onJson = { runTask(ScanTask("Preparing extracted text", "Creating a private text and metadata copy."), DocumentNotice("Couldn’t share text", "Reconnect and try again.", true)) {
                                val bytes = actions.export(document.id).getOrThrow(); assertCompany()
                                val file = withContext(Dispatchers.IO) { File(context.filesDir, "documents/exports/${document.id}.json").apply { parentFile?.mkdirs(); writeBytes(bytes) } }
                                val uri = FileProvider.getUriForFile(context, context.packageName + ".documents", file)
                                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "application/json"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }, "Share extracted text"))
                            } }) }
                    } ?: item { DocumentEmpty("Choose a document", "Open a saved scan from your library.") }
                    DocumentView.SETTINGS -> item { DocumentSettingsContent(settings, busy, { providerReview = true }, { runTask(ScanTask("Loading preferences", "Fetching this company’s existing settings."), DocumentNotice("Couldn’t load preferences", "Reconnect and try again.", true)) { settings = actions.settings().getOrThrow() } }) { updated -> runTask(ScanTask("Saving preferences", "Applying this company’s scanning settings."), DocumentNotice("Couldn’t save preferences", "Your existing settings remain in place.", true)) { settings = actions.saveSettings(updated).getOrThrow() } } }
                }
                item { Spacer(Modifier.height(12.dp)) }
            }
        }
    }
}
