package com.alexa.commandcenter.documents

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import org.robolectric.RuntimeEnvironment
import com.alexa.commandcenter.model.*
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.junit.Assert.*
import org.junit.Test
import org.junit.Before
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[31])
class SearchablePdfTest {
 @Before fun clearFileProviderTestCache() {
  // Robolectric creates a fresh filesDir per method; AndroidX caches its old root.
  val field=androidx.core.content.FileProvider::class.java.getDeclaredField("sCache"); field.isAccessible=true
  (field.get(null) as MutableMap<*,*>).clear()
  org.robolectric.Shadows.shadowOf(android.webkit.MimeTypeMap.getSingleton()).addExtensionMimeTypeMapping("jpg","image/jpeg")
 }
 private val context: Context get() = RuntimeEnvironment.getApplication()
 private fun image(): ByteArray {
  val bitmap=Bitmap.createBitmap(600,800,Bitmap.Config.ARGB_8888); bitmap.eraseColor(Color.WHITE)
  return ByteArrayOutputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG,92,it); bitmap.recycle(); it.toByteArray() }
 }
 private fun page(text: String) = DocumentOcr(text=text,language="en",layout=DocumentLayout(600,800,listOf(DocumentTextBox(text,0.1,0.1,0.8,0.15))))
 @Test fun unicodeMultiPagePdfContainsExtractableOrderedTextAndMetadata() {
  val texts=listOf("Café naïve — study (page 1).","Second page: résumé + 42!")
  val bytes=SearchableScanPdf.create(context,"scan-id","Study scan",listOf("learning"),"2026-10-30T00:00:00Z",texts.map { page(it) },texts.map { image() })
  assertEquals("%PDF-",bytes.copyOfRange(0,5).toString(Charsets.US_ASCII))
  PDDocument.load(bytes).use { doc ->
   assertEquals(2,doc.numberOfPages); assertEquals("Study scan",doc.documentInformation.title)
   val text=PDFTextStripper().getText(doc)
   assertTrue(text.contains(texts[0])); assertTrue(text.contains(texts[1])); assertTrue(text.indexOf("study") < text.indexOf("Second"))
   assertEquals(612f,doc.getPage(0).mediaBox.width)
   val stream=doc.getPage(0).contents.bufferedReader().readText(); assertTrue(stream.contains("3 Tr")); assertTrue(stream.contains(" Do"))
  }
 }
 @Test fun pageEditsAndOrderSurviveRestartWithoutOverwritingOriginals() {
  val store=PendingScanStore(context); val company=java.util.UUID.randomUUID().toString()
  fun capture(): android.net.Uri {
   val f=java.io.File(context.filesDir,"documents/capture/${java.util.UUID.randomUUID()}.jpg"); f.parentFile?.mkdirs(); f.writeBytes(image())
   return androidx.core.content.FileProvider.getUriForFile(context,context.packageName+".documents",f)
  }
  val initial=store.add(company,"CAMERA",listOf(capture(),capture()))
  val original=store.bytes(initial,0)
  val moved=store.move(initial,0,1)
  assertEquals(initial.files.reversed(),PendingScanStore(context).read(company)!!.files)
  val rotated=store.update(moved.copy(edits=listOf(DocumentPageEdit(90),DocumentPageEdit())))
  assertEquals(90,PendingScanStore(context).read(company)!!.edits.first().rotation)
  assertArrayEquals(original,store.bytes(rotated,1))
  val replaced=store.add(company,"CAMERA",listOf(capture()),0)
  assertEquals(2,replaced.files.size); assertNotEquals(rotated.files.first(),replaced.files.first())
  assertEquals(1,store.remove(replaced,0)!!.files.size)
  store.seal(company)
  assertThrows(IllegalStateException::class.java) { store.add(company,"CAMERA",listOf(capture())) }
  store.clear(company)
 }
 @Test fun missingLayoutFailsInsteadOfCreatingImageOnlyPdf() {
  assertThrows(IllegalArgumentException::class.java) { SearchableScanPdf.create(context,"id","scan",emptyList(),"2026-10-30T00:00:00Z",listOf(DocumentOcr(text="text")),listOf(image())) }
 }
 @Test fun exportSharesOnlyReadGrantedPdfContentUrisAndExpiresCache() {
  val file=DocumentPdfExport.file(context,"%PDF-fixture".toByteArray())
  val uri=DocumentPdfExport.uri(context,file)
  assertEquals("content",uri.scheme)
  val intent=DocumentPdfExport.intent(context,uri,true)
  assertEquals("application/pdf",intent.type); assertEquals(Intent.ACTION_SEND,intent.action)
  assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
  assertEquals(0,intent.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
  file.setLastModified(System.currentTimeMillis()-25*60*60*1000L); DocumentPdfExport.clean(context); assertFalse(file.exists())
 }
 @Test fun rotateCropDoesNotMutateOriginalAndRejectsInvalidBounds() {
  val bytes=image(); val original=bytes.copyOf()
  val processed=LocalDocumentProcessor.clean(bytes,DocumentPageEdit(90,DocumentCrop(0.0,0.0,0.5,1.0)))
  val bitmap=android.graphics.BitmapFactory.decodeByteArray(processed,0,processed.size)
  assertEquals(400,bitmap.width); assertEquals(600,bitmap.height); bitmap.recycle(); assertArrayEquals(original,bytes)
  assertThrows(IllegalArgumentException::class.java) { LocalDocumentProcessor.clean(bytes,DocumentPageEdit(45)) }
 }
}
