package com.alexa.commandcenter.documents
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.model.*
class DocumentActions(private val repository: AlexaRepository) {
 suspend fun reviewProvider() = repository.reviewDocumentProvider()
 fun company() = repository.documentCompany()
 suspend fun list(q: String) = repository.documents(q)
 suspend fun get(id: String) = repository.document(id)
 suspend fun create(key: String, source: String, count: Int) = repository.createDocument(DocumentCreate(key, source, count))
 suspend fun grants(id: String) = repository.documentGrants(id)
 suspend fun upload(id: String, page: Int, grant: DocumentGrant, mime: String, bytes: ByteArray) = repository.uploadDocument(id, page, DocumentUpload(grant.token, mime, android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)))
 suspend fun action(id: String, action: String, never: Boolean = false) = repository.documentAction(id, action, never)
 suspend fun edit(id: String, title: String, tags: List<String>, collection: String) = repository.editDocument(id, title, tags, collection)
 suspend fun image(id: String, page: Int, kind: String) = repository.documentImage(id, page, kind)
 suspend fun export(id: String) = repository.documentExport(id)
 suspend fun memories(id: String) = repository.documentMemories(id)
 suspend fun settings() = repository.documentSettings()
 suspend fun saveSettings(value: DocumentSettings) = repository.saveDocumentSettings(value)
}
