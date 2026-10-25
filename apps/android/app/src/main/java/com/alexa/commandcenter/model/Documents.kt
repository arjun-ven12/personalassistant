package com.alexa.commandcenter.model

data class DocumentOcr(val text: String = "", val confidence: Double? = null, val language: String? = null, val provider: String = "", val version: String = "", val timestamp: String = "")
data class DocumentPage(val number: Int, val original: String? = null, val cleaned: String? = null, val thumbnail: String? = null, val ocr: DocumentOcr? = null, val ocrStatus: String = "PENDING", val warnings: List<String> = emptyList(), val memoryIds: List<String> = emptyList())
data class DocumentUnderstanding(val version: String = "", val dates: List<String> = emptyList(), val entities: List<String> = emptyList(), val actionItems: List<String> = emptyList(), val memoryCandidate: Boolean = false, val ownerReviewRequired: Boolean = true)
data class AthenaDocument(val id: String, val ownerId: String, val companyId: String, val title: String, val documentType: String, val collection: String, val stage: String, val pages: List<DocumentPage>, val understanding: DocumentUnderstanding? = null, val summary: String = "", val tags: List<String> = emptyList(), val memoryStatus: String = "OFF", val sensitive: Boolean = false, val neverMemory: Boolean = false, val errorCode: String? = null, val createdAt: String = "")
data class DocumentMemory(val id: String, val title: String, val summary: String, val page: Int)
data class DocumentMemories(val documentId: String, val memories: List<DocumentMemory>)
data class DocumentList(val documents: List<AthenaDocument>)
data class DocumentSettings(val autoClean: Boolean = true, val autoOcr: Boolean = true, val autoMemory: String = "SUGGEST", val approvedCategories: List<String> = emptyList())
data class DocumentCreate(val idempotencyKey: String, val sourceType: String, val pageCount: Int)
data class DocumentGrant(val documentId: String, val page: Int, val token: String, val expiresAt: String)
data class DocumentUpload(val token: String, val mimeType: String, val base64: String)
object DocumentSafety {
 fun valid(doc: AthenaDocument, company: String) = EngineeringSafety.validId(doc.id) && doc.companyId == company && doc.pages.size in 1..5 && doc.pages.map { it.number } == (1..doc.pages.size).toList()
 fun mayUseContext(doc: AthenaDocument) = doc.stage == "COMPLETE" && !doc.sensitive && doc.pages.all { it.ocrStatus == "COMPLETE" }
}
