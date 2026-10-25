package com.alexa.commandcenter.documents
import android.content.Context
import android.net.Uri
import com.google.gson.Gson
import java.io.File
import java.util.UUID
import java.security.MessageDigest

data class PendingScan(val key: String, val companyId: String, val source: String, val files: List<String>, val mimeTypes: List<String>, val submitted: Boolean = false)
/** App-private original files survive process death. No camera stream, public media, or network credentials. */
class PendingScanStore(private val context: Context) {
 private val gson = Gson()
 private fun dir(company: String): File {
  val hash = MessageDigest.getInstance("SHA-256").digest(company.toByteArray()).joinToString("") { "%02x".format(it) }
  return File(context.filesDir, "documents/pending/$hash").apply { mkdirs() }
 }
 fun read(company: String): PendingScan? = runCatching {
  val d = gson.fromJson(android.util.AtomicFile(File(dir(company), "pending.json")).openRead().bufferedReader().use { it.readText() }, PendingScan::class.java)
  check(d.companyId == company && d.files.size in 1..5 && d.mimeTypes.size == d.files.size && d.mimeTypes.all { it in listOf("image/jpeg", "image/png") } && d.source in listOf("CAMERA", "IMPORT") && d.files.all { it.matches(Regex("[a-f0-9-]{36}\\.image")) })
  d
 }.getOrNull()
 fun add(company: String, source: String, uris: List<Uri>): PendingScan {
  val previous = read(company)
  check(previous?.submitted != true) { "An upload has started; retry or discard this draft before adding pages" }
  check((previous?.files?.size ?: 0) + uris.size <= 5) { "Maximum five pages" }
  val files = mutableListOf<String>(); val types = mutableListOf<String>()
  var committed = false
  try {
  for (uri in uris) {
   val mime = context.contentResolver.getType(uri) ?: if (uri.toString().endsWith(".jpg")) "image/jpeg" else "image/png"
   check(mime in listOf("image/jpeg", "image/png")) { "JPEG or PNG required" }
   val bytes = context.contentResolver.openInputStream(uri)!!.use { input ->
    val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
    while (true) { val n = input.read(buffer); if (n < 0) break; check(out.size() + n <= 6 * 1024 * 1024) { "Image exceeds 6 MiB" }; out.write(buffer, 0, n) }
    out.toByteArray()
   }
   check(bytes.size in 16..6 * 1024 * 1024) { "Image exceeds 6 MiB" }
   val options = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
   android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
   check(options.outWidth > 0 && options.outHeight > 0 && options.outWidth.toLong() * options.outHeight <= 16000000) { "Image exceeds pixel limit" }
   check(dir(company).listFiles().orEmpty().sumOf { it.length() } + bytes.size <= 36L * 1024 * 1024) { "Local draft storage quota reached" }
   val name = "${UUID.randomUUID()}.image"; File(dir(company), name).writeBytes(bytes); files.add(name); types.add(mime)
  }
  val result = PendingScan(previous?.key ?: UUID.randomUUID().toString(), company, previous?.source ?: source, (previous?.files ?: emptyList()) + files, (previous?.mimeTypes ?: emptyList()) + types)
  save(result)
  committed = true
  if (source == "CAMERA") for (uri in uris) {
   val name = uri.lastPathSegment.orEmpty()
   if (uri.authority == context.packageName + ".documents" && uri.pathSegments.firstOrNull() == "document_capture" && name.matches(Regex("[a-f0-9-]{36}\\.jpg"))) File(context.filesDir, "documents/capture/$name").delete()
  }
  return result
  } finally { if (!committed) files.forEach { File(dir(company), it).delete() } }
 }
 private fun save(scan: PendingScan) {
  val atomic = android.util.AtomicFile(File(dir(scan.companyId), "pending.json")); val output = atomic.startWrite()
  try { output.write(gson.toJson(scan).toByteArray()); atomic.finishWrite(output) } catch (error: Exception) { atomic.failWrite(output); throw error }
 }
 fun seal(company: String): PendingScan { val scan = checkNotNull(read(company)).copy(submitted = true); save(scan); return scan }
 fun bytes(scan: PendingScan, page: Int): ByteArray = File(dir(scan.companyId), scan.files[page]).readBytes()
 fun clear(company: String) { dir(company).deleteRecursively() }
}
