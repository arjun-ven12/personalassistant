package com.alexa.commandcenter.documents

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

/** Short-lived exports only. Public storage is written solely through the system picker. */
object DocumentPdfExport {
 fun clean(context: Context) {
  File(context.cacheDir,"document-pdf-exports").listFiles().orEmpty().filter { System.currentTimeMillis()-it.lastModified() > 24*60*60*1000L }.forEach { it.delete() }
 }
 fun file(context: Context, bytes: ByteArray): File {
  require(bytes.size in 5..33554432 && bytes.copyOfRange(0,5).toString(Charsets.US_ASCII) == "%PDF-")
  clean(context)
  val dir = File(context.cacheDir,"document-pdf-exports").apply { mkdirs() }
  require(dir.listFiles().orEmpty().sumOf { it.length() } + bytes.size <= 96L*1024*1024) { "Export cache quota reached; older exports expire after 24 hours" }
  return File(dir,"${UUID.randomUUID()}.pdf").apply { writeBytes(bytes) }
 }
 fun uri(context: Context, file: File): Uri {
  require(file.canonicalFile.parentFile == File(context.cacheDir,"document-pdf-exports").canonicalFile)
  return FileProvider.getUriForFile(context,context.packageName+".documents",file)
 }
 fun intent(context: Context, uri: Uri, share: Boolean): Intent = Intent(if(share) Intent.ACTION_SEND else Intent.ACTION_VIEW).apply {
  if(share) { type = "application/pdf"; putExtra(Intent.EXTRA_STREAM,uri) } else setDataAndType(uri,"application/pdf")
  clipData = ClipData.newUri(context.contentResolver,"Scanned document",uri)
  addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
 }
}
