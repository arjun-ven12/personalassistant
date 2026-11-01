package com.alexa.commandcenter.documents

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TextSnippet
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.model.*

@Composable
internal fun SaveDestination(selected: Boolean, icon: ImageVector, title: String, description: String, enabled: Boolean, onSelect: () -> Unit) {
    OutlinedCard(onClick = onSelect, enabled = enabled, modifier = Modifier.fillMaxWidth().semantics { this.selected = selected }, shape = RoundedCornerShape(18.dp), border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            RadioButton(selected, onClick = null, enabled = enabled)
        }
    }
}

@Composable
internal fun ReadyDocument(title: String, count: Int) {
    Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.TaskAlt, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onTertiaryContainer)
            Text("Ready when you need it.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onTertiaryContainer)
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onTertiaryContainer)
            Text("${DocumentFlow.pageLabel(count)} · Searchable text · Saved on this phone", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onTertiaryContainer)
        }
    }
}

@Composable
internal fun LocalDocumentText(result: LocalScanResult) {
    var expanded by remember { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    TextButton(onClick = { expanded = !expanded }) { Icon(Icons.AutoMirrored.Outlined.TextSnippet, null); Spacer(Modifier.width(8.dp)); Text(if (expanded) "Hide extracted text" else "Check & search extracted text") }
    if (expanded) {
        DocumentSearch(query, { query = it.take(200) }, "Search this PDF’s text")
        val matches = result.pages.withIndex().filter { query.isBlank() || it.value.text.contains(query, true) }
        if (matches.isEmpty()) Text("No matching text. Try a shorter phrase.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        matches.forEach { (index, page) ->
            Text("Page ${index + 1}", Modifier.padding(top = 16.dp, bottom = 8.dp), style = MaterialTheme.typography.labelLarge)
            SelectionContainer { Text(highlightDocumentText(page.text, query), style = MaterialTheme.typography.bodyMedium) }
        }
        Text("Text recognition can make mistakes. Check important details against the original.", Modifier.padding(top = 16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun SavedDocumentDetail(
    document: AthenaDocument, actions: DocumentActions, company: String, busy: Boolean,
    onPdf: (String) -> Unit, onRefresh: () -> Unit, onRetry: () -> Unit, onProvider: () -> Unit, onResume: (() -> Unit)?,
    onEdit: (String, List<String>, String) -> Unit, onAction: (String, Boolean) -> Unit, onExplain: () -> Unit,
    memories: List<DocumentMemory>, onMemories: () -> Unit, onJson: () -> Unit,
) {
    var tab by rememberSaveable(document.id) { mutableStateOf("Pages") }
    var page by rememberSaveable(document.id) { mutableIntStateOf(0) }
    var query by rememberSaveable(document.id) { mutableStateOf("") }
    var original by rememberSaveable(document.id) { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var archive by remember { mutableStateOf(false) }
    val current = document.pages[page.coerceIn(0, document.pages.lastIndex)]
    val exportable = DocumentFlow.mayExport(document)
    val preview = rememberDocumentPreview(listOf(document.id, current.number, current.cleaned, original)) {
        val bytes = actions.image(document.id, current.number, if (original || current.cleaned == null) "original" else "cleaned").getOrNull()
        check(actions.company() == company); bytes
    }
    val thumbnails = mutableMapOf<Int, android.graphics.Bitmap>()
    document.pages.forEachIndexed { index, p ->
        val image = rememberDocumentPreview(listOf(document.id, p.number, p.thumbnail), true) {
            if (p.thumbnail != null) actions.image(document.id, p.number, "thumbnail").getOrNull().also { check(actions.company() == company) } else null
        }
        image.bitmap?.let { thumbnails[index] = it }
    }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text(DocumentFlow.status(document), color = if (exportable) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge); Text("${DocumentFlow.pageLabel(document.pages.size)} · ${document.collection} · ${document.createdAt.take(10)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            IconButton(enabled = !busy, onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh document") }
            IconButton(enabled = !busy, onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Edit name and tags") }
        }
        if (document.sensitive) Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(16.dp)) { Text("This scan contains sensitive content. PDF sharing, model explanations and automatic memory are restricted.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall) }
        if (document.stage == "FAILED" || document.pdfError != null) {
            OutlinedCard(shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (DocumentFlow.providerReviewNeeded(document)) "Enable scanning to continue" else "Your pages are safe", fontWeight = FontWeight.SemiBold)
                    Text(if (DocumentFlow.providerReviewNeeded(document)) "Review this company’s local scanning provider, then resume the upload." else "The PDF isn’t ready yet. Check the extracted text or original pages, then retry processing.", style = MaterialTheme.typography.bodySmall)
                    Row { if (DocumentFlow.providerReviewNeeded(document)) TextButton(enabled = !busy, onClick = onProvider) { Text("Review scanning") }; if (onResume != null && document.stage != "COMPLETE") TextButton(enabled = !busy, onClick = onResume) { Text("Resume upload") } else TextButton(enabled = !busy, onClick = onRetry) { Text("Retry processing") } }
                }
            }
        }
        if (exportable) {
            Button(onClick = { onPdf("open") }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Icon(Icons.Outlined.PictureAsPdf, null); Spacer(Modifier.width(8.dp)); Text("Open searchable PDF") }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { onPdf("share") }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Icon(Icons.Outlined.Share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Share") }
                OutlinedButton(onClick = { onPdf("save") }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Icon(Icons.Outlined.SaveAlt, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Save to files") }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("Pages", "Text", "Details").forEach { label -> FilterChip(tab == label, { tab = label }, label = { Text(label) }) } }
        when (tab) {
            "Pages" -> {
                ScanPaper(preview.bitmap, "${if (original) "Original" else "Scan"}, page ${page + 1}", loading = preview.loading)
                ScanPageStrip(document.pages.size, page, !busy, thumbnails) { page = it }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Page ${page + 1} of ${document.pages.size}", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                    TextButton(onClick = { original = !original }) { Text(if (original) "Show cleaned scan" else "Compare original") }
                }
                current.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            "Text" -> {
                ScanPageStrip(document.pages.size, page, !busy, thumbnails) { page = it }
                DocumentSearch(query, { query = it.take(200) }, "Find words in this document")
                val matches = if (query.isBlank()) listOf(current) else document.pages.filter { it.ocr?.text?.contains(query, true) == true }
                if (matches.isEmpty()) DocumentEmpty("No matching text", "Try another phrase, or compare the original if OCR missed a word.", Icons.Outlined.SearchOff)
                matches.forEach { p ->
                    TextButton(onClick = { page = p.number - 1; tab = "Pages" }) { Text("Page ${p.number}"); Spacer(Modifier.width(8.dp)); Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(16.dp)) }
                    SelectionContainer { Text(highlightDocumentText(p.ocr?.text?.ifBlank { "No text was found on this page." } ?: "Text isn’t available yet. Check processing status.", query), style = MaterialTheme.typography.bodyLarge) }
                }
                Text("You can select and copy this text. Always check important details against the original.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            "Details" -> {
                if (document.summary.isNotBlank()) { Text("Summary", style = MaterialTheme.typography.titleMedium); Text(document.summary) }
                if (document.tags.isNotEmpty()) Text(document.tags.joinToString("  ·  "), color = MaterialTheme.colorScheme.primary)
                document.understanding?.let { understanding ->
                    if (understanding.dates.isNotEmpty()) Text("Dates found: ${understanding.dates.joinToString()}")
                    if (understanding.entities.isNotEmpty()) Text("Names found: ${understanding.entities.joinToString()}")
                    if (understanding.actionItems.isNotEmpty()) { Text("For your review", style = MaterialTheme.typography.titleMedium); understanding.actionItems.forEach { Text(it) } }
                }
                DocumentAction(Icons.Outlined.AutoAwesome, "Ask Athena about this", "Uses this document only when eligible", !busy && DocumentSafety.mayUseContext(document), onExplain)
                var memoryOptions by remember { mutableStateOf(false) }
                TextButton(onClick = { memoryOptions = !memoryOptions }) { Text(if (memoryOptions) "Hide memory controls" else "Memory & retention") }
                if (memoryOptions) {
                    Text("Memory: ${document.memoryStatus.lowercase().replace('_', ' ')}", style = MaterialTheme.typography.bodySmall)
                    TextButton(enabled = !busy && !document.sensitive && !document.neverMemory, onClick = { onAction("memory", false) }) { Text("Add useful content to memory") }
                    TextButton(enabled = !busy, onClick = onMemories) { Text("View linked memories") }
                    memories.forEach { Text("Page ${it.page} · ${it.title}\n${it.summary}", style = MaterialTheme.typography.bodySmall) }
                    TextButton(enabled = !busy, onClick = { onAction("exclude-memory", false) }) { Text("Remove document from memory") }
                    TextButton(enabled = !busy, onClick = { onAction("exclude-memory", true) }) { Text("Never add this document to memory") }
                }
                TextButton(enabled = !busy && !document.sensitive, onClick = onJson) { Text("Share extracted text & metadata (JSON)") }
                TextButton(enabled = !busy, onClick = onRetry) { Text("Reprocess scan & text") }
                TextButton(enabled = !busy, onClick = { archive = true }) { Text("Archive document", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    if (editing) EditDocumentDialog(document, { editing = false }) { title, tags, collection -> editing = false; onEdit(title, tags, collection) }
    if (archive) AlertDialog(onDismissRequest = { archive = false }, title = { Text("Archive this document?") }, text = { Text("It will leave your active library and its derived memories will be excluded. The retained original is not permanently deleted.") }, confirmButton = { TextButton(onClick = { archive = false; onAction("archive", false) }) { Text("Archive") } }, dismissButton = { TextButton(onClick = { archive = false }) { Text("Keep document") } })
}

@Composable
private fun EditDocumentDialog(document: AthenaDocument, onClose: () -> Unit, onSave: (String, List<String>, String) -> Unit) {
    var title by remember { mutableStateOf(document.title) }
    var tags by remember { mutableStateOf(document.tags.joinToString(", ")) }
    var collection by remember { mutableStateOf(document.collection) }
    var choosing by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onClose, title = { Text("Edit document") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(title, { title = it.take(160) }, label = { Text("Document name") }, singleLine = true)
            OutlinedTextField(tags, { tags = it.take(730) }, label = { Text("Tags, separated by commas") })
            Box { OutlinedButton(onClick = { choosing = true }) { Icon(Icons.Outlined.FolderOpen, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(collection) }; DropdownMenu(choosing, { choosing = false }) { DocumentFlow.collections.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { collection = c; choosing = false }) } } }
        }
    }, confirmButton = { TextButton(enabled = title.isNotBlank(), onClick = { onSave(title.trim(), DocumentFlow.tags(tags), collection) }) { Text("Save changes") } }, dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } })
}

@Composable
internal fun DocumentSettingsContent(settings: DocumentSettings?, busy: Boolean, onProvider: () -> Unit, onReload: () -> Unit, onUpdate: (DocumentSettings) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Athena processing", style = MaterialTheme.typography.titleLarge)
        Text("These preferences apply when saving to this company’s Athena library. Phone-only PDFs always use on-device text recognition.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        DocumentAction(Icons.Outlined.VerifiedUser, "Scanning permission", "Review the private scanning provider for this company", !busy, onProvider)
        if (settings == null) {
            DocumentEmpty("Preferences aren’t loaded", "Connect to Athena to view or change your existing settings.")
            OutlinedButton(enabled = !busy, onClick = onReload) { Text("Load preferences") }
        } else {
            PreferenceToggle("Clean up pages", "Keep a clearer copy alongside the original.", settings.autoClean, !busy) { onUpdate(settings.copy(autoClean = it)) }
            PreferenceToggle("Read text automatically", "Needed for searchable PDFs saved to Athena.", settings.autoOcr, !busy) { onUpdate(settings.copy(autoOcr = it)) }
            HorizontalDivider()
            Text("Document memory", style = MaterialTheme.typography.titleLarge)
            Text("Choose whether useful notes can be added to memory. Sensitive or uncertain text remains excluded.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            val modes = listOf("OFF" to "Off", "SUGGEST" to "Suggest for review", "AUTO_FOR_APPROVED_CATEGORIES" to "Only approved categories")
            modes.forEach { (value, label) ->
                OutlinedCard(onClick = { onUpdate(settings.copy(autoMemory = value)) }, enabled = !busy, modifier = Modifier.fillMaxWidth().semantics { selected = settings.autoMemory == value }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { RadioButton(settings.autoMemory == value, null, enabled = !busy); Spacer(Modifier.width(8.dp)); Text(label) }
                }
            }
            if (settings.autoMemory == "AUTO_FOR_APPROVED_CATEGORIES") {
                Text("Approved categories", style = MaterialTheme.typography.titleMedium)
                listOf("Study", "Projects").forEach { category ->
                    PreferenceToggle(category, "Allow eligible content from this category.", settings.approvedCategories.contains(category), !busy) { enabled -> onUpdate(settings.copy(approvedCategories = if (enabled) (settings.approvedCategories + category).distinct() else settings.approvedCategories - category)) }
                }
            }
        }
    }
}

@Composable
private fun PreferenceToggle(title: String, subtitle: String, checked: Boolean, enabled: Boolean, onChecked: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) { Text(title, fontWeight = FontWeight.Medium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Switch(checked, onChecked, enabled = enabled)
    }
}

@Composable
private fun highlightDocumentText(text: String, query: String): androidx.compose.ui.text.AnnotatedString {
    val background = MaterialTheme.colorScheme.primaryContainer
    val foreground = MaterialTheme.colorScheme.onPrimaryContainer
    return buildAnnotatedString {
    if (query.isBlank()) { append(text); return@buildAnnotatedString }
    var start = 0
    while (start < text.length) {
        val at = text.indexOf(query, start, ignoreCase = true)
        if (at < 0) { append(text.substring(start)); break }
        append(text.substring(start, at))
        withStyle(SpanStyle(background = background, color = foreground)) { append(text.substring(at, at + query.length)) }
        start = at + query.length
    }
}

}
