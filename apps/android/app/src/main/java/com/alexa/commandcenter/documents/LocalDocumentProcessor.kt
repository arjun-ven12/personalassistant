package com.alexa.commandcenter.documents

import android.content.Context
import android.graphics.*
import androidx.exifinterface.media.ExifInterface
import com.alexa.commandcenter.model.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.*
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType0Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import com.tom_roush.pdfbox.util.Matrix as PdfMatrix
import kotlinx.coroutines.tasks.await
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Calendar

data class LocalScanResult(val pages: List<DocumentOcr>, val title: String, val tags: List<String>)

/** Bundled Latin OCR; called only by explicit owner action. No network or model calls. */
class LocalDocumentProcessor(private val context: Context) {
 suspend fun process(store: PendingScanStore, scan: PendingScan): LocalScanResult {
  val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  try {
   val pages = scan.files.indices.map { i ->
    val bytes = clean(store.bytes(scan, i), scan.edits.getOrElse(i) { DocumentPageEdit() })
    val bitmap = checkNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
    try {
     val text = recognizer.process(InputImage.fromBitmap(bitmap, 0)).await()
     val boxes = text.textBlocks.flatMap { it.lines }.flatMap { it.elements }.mapNotNull { word ->
      word.boundingBox?.let { b ->
       if(word.text.isBlank() || word.text.length > 1000 || b.width() <= 0 || b.height() <= 0) null else
       DocumentTextBox(word.text, (b.left.toDouble()/bitmap.width).coerceIn(0.0,1.0), (b.top.toDouble()/bitmap.height).coerceIn(0.0,1.0), (b.right.toDouble()/bitmap.width).coerceIn(0.0,1.0), (b.bottom.toDouble()/bitmap.height).coerceIn(0.0,1.0))
      }
     }.filter { it.right > it.left && it.bottom > it.top }.take(10000)
     store.saveCleaned(scan, i, bytes)
     DocumentOcr(text = text.text.take(50000), language = "en", provider = "mlkit.bundled.latin", version = "16.0.1", timestamp = java.time.Instant.now().toString(), layout = DocumentLayout(bitmap.width, bitmap.height, boxes))
    } finally { bitmap.recycle() }
   }
   val result = LocalScanResult(pages, scan.title, scan.tags)
   val pdf = SearchableScanPdf.create(context, scan.key, scan.title, scan.tags, scan.createdAt, pages, scan.files.indices.map { store.cleaned(scan, it) })
   store.saveLocal(scan, result, pdf)
   return result
  } finally { recognizer.close() }
 }
 companion object {
  fun clean(bytes: ByteArray, edit: DocumentPageEdit): ByteArray {
   require(edit.rotation in listOf(0,90,180,270))
   val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
   BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
   require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong()*bounds.outHeight <= 16000000)
   var sample=1
   while(bounds.outWidth.toLong()*bounds.outHeight/(sample*sample) > 8000000) sample*=2
   var bitmap = checkNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size,BitmapFactory.Options().apply { inSampleSize=sample }))
   try {
    require(bitmap.width.toLong()*bitmap.height <= 16000000)
    val orientation = ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    val matrix = Matrix()
    when(orientation) {
     ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f,1f)
     ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
     ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f,-1f)
     ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f,1f) }
     ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
     ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(270f); matrix.postScale(-1f,1f) }
     ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
    }
    matrix.postRotate(edit.rotation.toFloat())
    val rotated = Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true)
    if(rotated !== bitmap) { bitmap.recycle(); bitmap = rotated }
    edit.crop?.let { c ->
     require(listOf(c.left,c.top,c.right,c.bottom).all { it.isFinite() && it in 0.0..1.0 } && c.right-c.left >= 0.05 && c.bottom-c.top >= 0.05)
     val left = (c.left*bitmap.width).toInt(); val top = (c.top*bitmap.height).toInt()
     val crop = Bitmap.createBitmap(bitmap,left,top, maxOf(1,(c.right*bitmap.width).toInt()-left),maxOf(1,(c.bottom*bitmap.height).toInt()-top))
     if(crop !== bitmap) { bitmap.recycle(); bitmap = crop }
    }
    val scale = minOf(1.0,2400.0/bitmap.width,3200.0/bitmap.height)
    val output = Bitmap.createBitmap(maxOf(1,(bitmap.width*scale).toInt()),maxOf(1,(bitmap.height*scale).toInt()),Bitmap.Config.ARGB_8888)
    try {
     val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { colorFilter = ColorMatrixColorFilter(floatArrayOf(1.08f,0f,0f,0f,-10f,0f,1.08f,0f,0f,-10f,0f,0f,1.08f,0f,-10f,0f,0f,0f,1f,0f)) }
     Canvas(output).drawBitmap(bitmap,null,Rect(0,0,output.width,output.height),paint)
     return ByteArrayOutputStream().use { out -> check(output.compress(Bitmap.CompressFormat.JPEG,92,out)); out.toByteArray().also { require(it.size <= 6291456) } }
    } finally { output.recycle() }
   } finally { bitmap.recycle() }
  }
 }
}

/** Same geometry contract as backend: normalized top-left boxes, invisible Unicode text. */
object SearchableScanPdf {
 fun create(context: Context, id: String, title: String, tags: List<String>, createdAt: String, pages: List<DocumentOcr>, images: List<ByteArray>): ByteArray {
  require(pages.size in 1..5 && pages.size == images.size)
  require(pages.all { it.text.isNotBlank() && it.layout?.words?.isNotEmpty() == true }) { "OCR layout required for searchable PDF" }
  PDFBoxResourceLoader.init(context.applicationContext)
  return PDDocument().use { pdf ->
   val font = context.assets.open("documents/NotoSans-Regular.ttf").use { PDType0Font.load(pdf,it) }
   pdf.documentInformation = PDDocumentInformation().apply {
    this.title = title.take(160); creator = "Athena document scanner"; keywords = tags.take(12).joinToString(", ")
    creationDate = Calendar.getInstance().apply { timeInMillis = java.time.Instant.parse(createdAt).toEpochMilli() }
    subject = "Athena document $id; pages=${pages.size}; OCR=${pages.map { it.language ?: "und" }.distinct().joinToString(",")}"
   }
   pages.forEachIndexed { i, ocr ->
    val layout = checkNotNull(ocr.layout)
    val image = JPEGFactory.createFromByteArray(pdf,images[i])
    require(layout.width == image.width && layout.height == image.height)
    val height = image.height*612f/image.width
    val page = PDPage(PDRectangle(612f,height)); pdf.addPage(page)
    PDPageContentStream(pdf,page).use { stream ->
     stream.drawImage(image,0f,0f,612f,height)
     layout.words.forEach { w ->
      require(listOf(w.left,w.top,w.right,w.bottom).all { it.isFinite() && it in 0.0..1.0 } && w.right > w.left && w.bottom > w.top)
      val size = ((w.bottom-w.top)*height).toFloat()
      val width = font.getStringWidth(w.text)/1000*size
      require(width > 0)
      stream.beginText(); stream.setRenderingMode(RenderingMode.NEITHER); stream.setFont(font,size)
      stream.setTextMatrix(PdfMatrix(((w.right-w.left)*612/width).toFloat(),0f,0f,1f,(w.left*612).toFloat(),((1-w.bottom)*height+size*0.18).toFloat()))
      stream.showText(w.text); stream.endText()
     }
    }
   }
   ByteArrayOutputStream().use { out -> pdf.save(out); out.toByteArray().also { require(it.size <= 33554432) } }
  }
 }
}
