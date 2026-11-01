package com.alexa.commandcenter.documents

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.RotateRight
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.alexa.commandcenter.model.*

@Composable
internal fun DocumentHeader(title: String, subtitle: String, onBack: () -> Unit, onSettings: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        onSettings?.let { IconButton(onClick = it) { Icon(Icons.Outlined.Tune, "Scan settings") } }
    }
}

@Composable
internal fun NoticeCard(notice: DocumentNotice, onDismiss: () -> Unit) {
    Surface(color = if (notice.error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(if (notice.error) Icons.Outlined.ErrorOutline else Icons.Outlined.CheckCircle, null, Modifier.padding(top = 3.dp))
            Column(Modifier.weight(1f).padding(horizontal = 10.dp).semantics { liveRegion = LiveRegionMode.Polite }) {
                Text(notice.title, fontWeight = FontWeight.SemiBold)
                Text(notice.detail, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) { Icon(Icons.Outlined.Close, "Dismiss message") }
        }
    }
}

@Composable
internal fun ScanSteps(current: Int) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("Review", "Name & save", "Ready").forEachIndexed { i, label ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant))
                Text("${i + 1}  $label", style = MaterialTheme.typography.labelMedium, color = if (i <= current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
internal fun ScanHero(enabled: Boolean, onNew: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Icon(Icons.Outlined.DocumentScanner, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Text("From paper to searchable PDF.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text("Capture a page, tidy it up, and find its words whenever you need them.", color = MaterialTheme.colorScheme.onPrimaryContainer)
            Button(onClick = onNew, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text("Scan a document")
            }
            Text("Up to 5 pages · Originals preserved", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
internal fun ResumeScanCard(scan: PendingScan, pdfReady: Boolean, enabled: Boolean, onResume: () -> Unit) {
    OutlinedCard(onClick = onResume, enabled = enabled, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (pdfReady) Icons.Outlined.PictureAsPdf else Icons.Outlined.History, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                Text(if (pdfReady) "Your PDF is ready" else "Continue your scan", fontWeight = FontWeight.SemiBold)
                Text("${DocumentFlow.pageLabel(scan.files.size)} · ${if (scan.submitted) "Upload can be resumed" else "Saved on this phone"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null)
        }
    }
}

@Composable
internal fun DocumentSearch(value: String, onValue: (String) -> Unit, label: String, onSearch: () -> Unit = {}) {
    OutlinedTextField(value, onValue, modifier = Modifier.fillMaxWidth(), placeholder = { Text(label) }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
        trailingIcon = { if (value.isNotBlank()) IconButton(onClick = { onValue("") }) { Icon(Icons.Outlined.Close, "Clear search") } },
        singleLine = true, shape = RoundedCornerShape(16.dp), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { onSearch() }))
}

@Composable
internal fun CollectionFilters(selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (listOf("All") + DocumentFlow.collections).forEach { label -> FilterChip(selected == label, { onSelect(label) }, label = { Text(label) }) }
    }
}

@Composable
internal fun DocumentRow(document: AthenaDocument, thumbnail: Bitmap?, enabled: Boolean, onOpen: () -> Unit) {
    OutlinedCard(onClick = onOpen, enabled = enabled, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(58.dp, 74.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp)) {
                if (thumbnail != null) Image(thumbnail.asImageBitmap(), null, contentScale = ContentScale.Crop) else Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Description, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Column(Modifier.weight(1f).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(document.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${DocumentFlow.pageLabel(document.pages.size)} · ${document.createdAt.take(10)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(DocumentFlow.status(document), style = MaterialTheme.typography.labelSmall, color = if (document.pdf != null) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun DocumentEmpty(title: String, detail: String, icon: ImageVector = Icons.Outlined.FolderOpen) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, null, Modifier.size(38.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
internal fun ScanPaper(bitmap: Bitmap?, label: String, modifier: Modifier = Modifier, loading: Boolean = true) {
    Surface(modifier.fillMaxWidth().heightIn(min = 180.dp), shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(Modifier.padding(18.dp), contentAlignment = Alignment.Center) {
            if (bitmap != null) Image(bitmap.asImageBitmap(), label, Modifier.fillMaxWidth().heightIn(max = 420.dp), contentScale = ContentScale.Fit)
            else Column(Modifier.padding(36.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (loading) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) else Icon(Icons.Outlined.ImageNotSupported, null)
                Text(if (loading) "Loading page…" else "Preview unavailable. Your original is kept.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
internal fun ScanPageStrip(count: Int, selected: Int, enabled: Boolean, thumbnails: Map<Int, Bitmap>, onSelect: (Int) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
        itemsIndexed((0 until count).toList()) { _, index ->
            OutlinedCard(onClick = { onSelect(index) }, enabled = enabled, modifier = Modifier.width(76.dp).semantics { this.selected = index == selected },
                shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(if (index == selected) 2.dp else 1.dp, if (index == selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                Box(Modifier.fillMaxWidth().height(80.dp).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    thumbnails[index]?.let { Image(it.asImageBitmap(), "Select page ${index + 1}", Modifier.fillMaxSize().padding(6.dp), contentScale = ContentScale.Fit) }
                        ?: Icon(Icons.Outlined.Description, "Select page ${index + 1}")
                }
                Text("${index + 1}", Modifier.align(Alignment.CenterHorizontally).padding(6.dp), style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
internal fun PageEditToolbar(page: Int, count: Int, enabled: Boolean, onMove: (Int) -> Unit, onRotate: () -> Unit, onCrop: () -> Unit, onReplace: () -> Unit, onRetake: () -> Unit, onRemove: () -> Unit) {
    var more by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
        IconButton(enabled = enabled && page > 0, onClick = { onMove(page - 1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Move page earlier") }
        TextButton(enabled = enabled, onClick = onRotate, modifier = Modifier.weight(1f)) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.AutoMirrored.Outlined.RotateRight, null); Text("Rotate", style = MaterialTheme.typography.labelSmall) } }
        TextButton(enabled = enabled, onClick = onCrop, modifier = Modifier.weight(1f)) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Outlined.Crop, null); Text("Crop", style = MaterialTheme.typography.labelSmall) } }
        IconButton(enabled = enabled && page < count - 1, onClick = { onMove(page + 1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowForward, "Move page later") }
        Box {
            IconButton(enabled = enabled, onClick = { more = true }) { Icon(Icons.Outlined.MoreVert, "More page actions") }
            DropdownMenu(more, { more = false }) {
                DropdownMenuItem(text = { Text("Retake photo") }, leadingIcon = { Icon(Icons.Outlined.PhotoCamera, null) }, onClick = { more = false; onRetake() })
                DropdownMenuItem(text = { Text("Replace image") }, leadingIcon = { Icon(Icons.Outlined.PhotoLibrary, null) }, onClick = { more = false; onReplace() })
                DropdownMenuItem(text = { Text("Remove page") }, leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null) }, onClick = { more = false; onRemove() })
            }
        }
    }
}

@Composable
internal fun DocumentAction(icon: ImageVector, title: String, subtitle: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(title, fontWeight = FontWeight.Medium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Icon(Icons.Outlined.ChevronRight, null)
        }
    }
}

@Composable
internal fun ScanTaskCard(task: ScanTask, onShow: () -> Unit, onPause: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp); Spacer(Modifier.width(12.dp)); Text(task.title, fontWeight = FontWeight.SemiBold) }
            Text(task.detail, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            if (task.completed != null && task.total != null && task.total > 0) LinearProgressIndicator(progress = { task.completed.toFloat() / task.total }, modifier = Modifier.fillMaxWidth())
            Row { TextButton(onClick = onShow) { Text("View scan") }; TextButton(onClick = onPause) { Text("Pause") } }
        }
    }
}

@Composable
internal fun ScanFooter(label: String, enabled: Boolean, supporting: String, onClick: () -> Unit) {
    Surface(shadowElevation = 8.dp, tonalElevation = 3.dp) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(label); Spacer(Modifier.width(8.dp)); Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp)) }
            Text(supporting, Modifier.align(Alignment.CenterHorizontally), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
