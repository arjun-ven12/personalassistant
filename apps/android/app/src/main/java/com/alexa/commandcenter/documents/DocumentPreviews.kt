package com.alexa.commandcenter.documents

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

internal data class DocumentPreview(val bitmap: Bitmap? = null, val loading: Boolean = true)
private val previewSlots = Semaphore(1)

/** Decode/cleanup stay off the UI thread; bound concurrent raster work and display memory. */
@Composable
internal fun rememberDocumentPreview(key: Any?, thumbnail: Boolean = false, load: suspend () -> ByteArray?): DocumentPreview {
    var preview by remember(key) { mutableStateOf(DocumentPreview()) }
    LaunchedEffect(key) {
        try {
            val image = previewSlots.withPermit {
                withContext(Dispatchers.Default) { load()?.let { decodeDocumentPreview(it, if (thumbnail) 80_000 else 1_000_000) } }
            }
            preview = DocumentPreview(image, false)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { preview = DocumentPreview(null, false) }
    }
    return preview
}

internal fun decodeDocumentPreview(bytes: ByteArray, maxPixels: Int = 1_000_000): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 16_000_000) return null
    var sample = 1
    while (bounds.outWidth.toLong() * bounds.outHeight / (sample * sample) > maxPixels) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
}
