package com.alexa.commandcenter.documents
import android.content.Context
import android.net.Uri
import com.google.gson.Gson
import java.io.File
import java.util.UUID
import java.security.MessageDigest
import com.alexa.commandcenter.model.*

data class PendingScan(val key: String, val companyId: String, val source: String, val files: List<String>, val mimeTypes: List<String>, val submitted: Boolean = false, val edits: List<DocumentPageEdit> = emptyList(), val title: String = "Untitled scan", val tags: List<String> = emptyList(), val createdAt: String = java.time.Instant.now().toString())
/** App-private original files survive process death. No camera stream, public media, or network credentials. */
class PendingScanStore(private val context: Context) {
 private val gson = Gson()
 private fun dir(company: String): File {
  val hash = MessageDigest.getInstance("SHA-256").digest(company.toByteArray()).joinToString("") { "%02x".format(it) }
  return File(context.filesDir, "documents/pending/$hash").apply { mkdirs() }
 }
 fun read(company: String): PendingScan? = runCatching {
  val json = com.google.gson.JsonParser.parseString(android.util.AtomicFile(File(dir(company), "pending.json")).openRead().bufferedReader().use { it.readText() }).asJsonObject
  val raw = gson.fromJson(json, PendingScan::class.java)
  val d = raw.copy(edits = if(json.has("edits")) raw.edits else List(raw.files.size) { DocumentPageEdit() }, title = if(json.has("title")) raw.title else "Untitled scan", tags = if(json.has("tags")) raw.tags else emptyList(), createdAt = if(json.has("createdAt")) raw.createdAt else java.time.Instant.now().toString())
  check(d.companyId == company && d.files.size in 1..5 && d.mimeTypes.size == d.files.size && d.mimeTypes.all { it in listOf("image/jpeg", "image/png") } && d.source in listOf("CAMERA", "IMPORT") && d.files.all { it.matches(Regex("[a-f0-9-]{36}\\.image")) })
  check(d.edits.size == d.files.size && d.title.length in 1..160 && d.tags.size <= 12)
  d
 }.getOrNull()
 fun add(company: String, source: String, uris: List<Uri>, replace: Int? = null): PendingScan {
  val previous = read(company)
  check(previous?.submitted != true) { "An upload has started; retry or discard this draft before adding pages" }
  check(replace == null || (previous != null && replace in previous.files.indices && uris.size == 1))
  check((previous?.files?.size ?: 0) + uris.size - (if(replace == null) 0 else 1) <= 5) { "Maximum five pages" }
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
  val updated = if (previous == null) result.copy(edits = List(result.files.size) { DocumentPageEdit() }) else if(replace == null) result.copy(edits = previous.edits + List(files.size) { DocumentPageEdit() }, title = previous.title, tags = previous.tags, createdAt = previous.createdAt) else previous.copy(files = previous.files.toMutableList().apply { set(replace, files.single()) }, mimeTypes = previous.mimeTypes.toMutableList().apply { set(replace, types.single()) }, edits = previous.edits.toMutableList().apply { set(replace, DocumentPageEdit()) })
  save(updated)
  invalidate(updated)
  committed = true
  if (source == "CAMERA") for (uri in uris) {
   val name = uri.lastPathSegment.orEmpty()
   if (uri.authority == context.packageName + ".documents" && uri.pathSegments.firstOrNull() == "document_capture" && name.matches(Regex("[a-f0-9-]{36}\\.jpg"))) File(context.filesDir, "documents/capture/$name").delete()
  }
  return updated
  } finally { if (!committed) files.forEach { File(dir(company), it).delete() } }
 }
 fun update(scan: PendingScan): PendingScan {
  check(!scan.submitted && scan.files.size in 1..5 && scan.edits.size == scan.files.size)
  save(scan); invalidate(scan); return scan
 }
 fun move(scan: PendingScan, from: Int, to: Int): PendingScan {
  check(to in scan.files.indices && from in scan.files.indices)
  fun <T> moved(items: List<T>) = items.toMutableList().apply { add(to, removeAt(from)) }
  return update(scan.copy(files = moved(scan.files), mimeTypes = moved(scan.mimeTypes), edits = moved(scan.edits)))
 }
 fun remove(scan: PendingScan, page: Int): PendingScan? {
  check(!scan.submitted && page in scan.files.indices)
  if(scan.files.size == 1) { clear(scan.companyId); return null }
  return update(scan.copy(files = scan.files.filterIndexed { i,_ -> i != page }, mimeTypes = scan.mimeTypes.filterIndexed { i,_ -> i != page }, edits = scan.edits.filterIndexed { i,_ -> i != page }))
 }
 private fun invalidate(scan: PendingScan) {
  File(dir(scan.companyId), "local.json").delete(); File(dir(scan.companyId), "local.pdf").delete()
  dir(scan.companyId).listFiles().orEmpty().filter { it.name.matches(Regex("local-[0-4]\\.jpg")) }.forEach { it.delete() }
 }
 fun saveCleaned(scan: PendingScan, page: Int, bytes: ByteArray) { check(page in scan.files.indices); File(dir(scan.companyId), "local-$page.jpg").writeBytes(bytes) }
 fun cleaned(scan: PendingScan, page: Int) = File(dir(scan.companyId), "local-$page.jpg").readBytes()
 fun saveLocal(scan: PendingScan, result: LocalScanResult, pdf: ByteArray) {
  File(dir(scan.companyId), "local.pdf").writeBytes(pdf)
  File(dir(scan.companyId), "local.json").writeText(gson.toJson(result))
 }
 fun local(scan: PendingScan): LocalScanResult? = runCatching { gson.fromJson(File(dir(scan.companyId), "local.json").readText(), LocalScanResult::class.java) }.getOrNull()
 fun localPdf(scan: PendingScan) = File(dir(scan.companyId), "local.pdf").readBytes()
 private fun save(scan: PendingScan) {
  val atomic = android.util.AtomicFile(File(dir(scan.companyId), "pending.json")); val output = atomic.startWrite()
  try { output.write(gson.toJson(scan).toByteArray()); atomic.finishWrite(output) } catch (error: Exception) { atomic.failWrite(output); throw error }
 }
 fun seal(company: String): PendingScan { val scan = checkNotNull(read(company)).copy(submitted = true); save(scan); return scan }
 fun bytes(scan: PendingScan, page: Int): ByteArray = File(dir(scan.companyId), scan.files[page]).readBytes()
 fun clear(company: String) { dir(company).deleteRecursively() }
}
