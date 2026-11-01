package com.alexa.commandcenter.documents

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.alexa.commandcenter.model.DocumentCrop
import kotlin.math.hypot

/** Normalized bounds on the rotated source; no pixels leave the device. */
@Composable
internal fun DocumentCropEditor(bitmap: Bitmap?, initial: DocumentCrop?, onClose: () -> Unit, onApply: (DocumentCrop?) -> Unit) {
    var left by remember { mutableFloatStateOf(initial?.left?.toFloat() ?: 0f) }
    var top by remember { mutableFloatStateOf(initial?.top?.toFloat() ?: 0f) }
    var right by remember { mutableFloatStateOf(initial?.right?.toFloat() ?: 1f) }
    var bottom by remember { mutableFloatStateOf(initial?.bottom?.toFloat() ?: 1f) }
    var precise by remember { mutableStateOf(false) }
    val accent = MaterialTheme.colorScheme.primary
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("Crop page", style = MaterialTheme.typography.headlineSmall); Text("Drag the corners to keep only the page.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Cancel crop") }
                }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.height(320.dp).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (bitmap == null) CircularProgressIndicator() else {
                        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            val ratio = bitmap.width.toFloat() / bitmap.height
                            val width = minOf(maxWidth, maxHeight * ratio)
                            Box(Modifier.width(width).aspectRatio(ratio)) {
                                Image(bitmap.asImageBitmap(), "Full page before cropping", Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                                Canvas(Modifier.fillMaxSize().pointerInput(bitmap) {
                                    var corner = 0
                                    detectDragGestures(onDragStart = { position ->
                                        val corners = listOf(Offset(left * size.width, top * size.height), Offset(right * size.width, top * size.height), Offset(right * size.width, bottom * size.height), Offset(left * size.width, bottom * size.height))
                                        corner = corners.indices.minByOrNull { hypot((corners[it].x - position.x).toDouble(), (corners[it].y - position.y).toDouble()) } ?: 0
                                    }) { change, amount ->
                                        change.consume()
                                        val dx = amount.x / size.width; val dy = amount.y / size.height
                                        when (corner) {
                                            0 -> { left = (left + dx).coerceIn(0f, right - 0.06f); top = (top + dy).coerceIn(0f, bottom - 0.06f) }
                                            1 -> { right = (right + dx).coerceIn(left + 0.06f, 1f); top = (top + dy).coerceIn(0f, bottom - 0.06f) }
                                            2 -> { right = (right + dx).coerceIn(left + 0.06f, 1f); bottom = (bottom + dy).coerceIn(top + 0.06f, 1f) }
                                            3 -> { left = (left + dx).coerceIn(0f, right - 0.06f); bottom = (bottom + dy).coerceIn(top + 0.06f, 1f) }
                                        }
                                    }
                                }) {
                                    val x = left * size.width; val y = top * size.height
                                    val x2 = right * size.width; val y2 = bottom * size.height
                                    val shade = Color.Black.copy(alpha = 0.6f)
                                    drawRect(shade, Offset.Zero, androidx.compose.ui.geometry.Size(size.width, y))
                                    drawRect(shade, Offset(0f, y2), androidx.compose.ui.geometry.Size(size.width, size.height - y2))
                                    drawRect(shade, Offset(0f, y), androidx.compose.ui.geometry.Size(x, y2 - y))
                                    drawRect(shade, Offset(x2, y), androidx.compose.ui.geometry.Size(size.width - x2, y2 - y))
                                    drawRect(accent, Offset(x, y), androidx.compose.ui.geometry.Size(x2 - x, y2 - y), style = Stroke(2.dp.toPx()))
                                    for (fraction in listOf(1f / 3f, 2f / 3f)) {
                                        drawLine(Color.White.copy(alpha = 0.4f), Offset(x + (x2 - x) * fraction, y), Offset(x + (x2 - x) * fraction, y2))
                                        drawLine(Color.White.copy(alpha = 0.4f), Offset(x, y + (y2 - y) * fraction), Offset(x2, y + (y2 - y) * fraction))
                                    }
                                    listOf(Offset(x, y), Offset(x2, y), Offset(x2, y2), Offset(x, y2)).forEach { drawCircle(accent, 8.dp.toPx(), it) }
                                }
                            }
                        }
                    }
                }
                TextButton(onClick = { precise = !precise }) { Text(if (precise) "Hide precise controls" else "Precise adjustment & accessibility controls") }
                if (precise) {
                    Column {
                        CropSlider("Left edge", left, 0f..(right - 0.06f)) { left = it }
                        CropSlider("Top edge", top, 0f..(bottom - 0.06f)) { top = it }
                        CropSlider("Right edge", right, (left + 0.06f)..1f) { right = it }
                        CropSlider("Bottom edge", bottom, (top + 0.06f)..1f) { bottom = it }
                    }
                }
                Text("The original stays untouched. You can restore the full page anytime.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { left = 0f; top = 0f; right = 1f; bottom = 1f }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Full page") }
                    Button(enabled = bitmap != null, onClick = { onApply(if (left == 0f && top == 0f && right == 1f && bottom == 1f) null else DocumentCrop(left.toDouble(), top.toDouble(), right.toDouble(), bottom.toDouble())) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Apply crop") }
                }
            }
        }
    }
}

@Composable
private fun CropSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, onValue: (Float) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(84.dp), style = MaterialTheme.typography.labelSmall)
        Slider(value, onValue, modifier = Modifier.weight(1f).semanticsLabel(label), valueRange = range)
    }
}

private fun Modifier.semanticsLabel(label: String): Modifier = this.then(Modifier.semantics { contentDescription = label })
