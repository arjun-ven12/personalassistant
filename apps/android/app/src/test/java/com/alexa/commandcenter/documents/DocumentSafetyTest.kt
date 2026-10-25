package com.alexa.commandcenter.documents
import com.alexa.commandcenter.model.*
import org.junit.Assert.*
import org.junit.Test
class DocumentSafetyTest {
 private val company = "11111111-1111-4111-8111-111111111111"
 private fun document() = AthenaDocument("22222222-2222-4222-8222-222222222222", "owner", company, "Scan", "STUDY", "Study", "COMPLETE", listOf(DocumentPage(1, ocrStatus = "COMPLETE")))
 @Test fun companyAndPageOrderAreRequired() {
  val doc = document(); assertTrue(DocumentSafety.valid(doc, company)); assertFalse(DocumentSafety.valid(doc, "other")); assertFalse(DocumentSafety.valid(doc.copy(pages = listOf(DocumentPage(2))), company)); assertFalse(DocumentSafety.valid(doc.copy(pages = emptyList()), company))
 }
 @Test fun pendingFailedAndSensitiveDocumentsCannotBecomeChatContext() {
  val doc = document(); assertTrue(DocumentSafety.mayUseContext(doc)); assertFalse(DocumentSafety.mayUseContext(doc.copy(sensitive = true))); assertFalse(DocumentSafety.mayUseContext(doc.copy(stage = "UPLOADING"))); assertFalse(DocumentSafety.mayUseContext(doc.copy(pages = listOf(DocumentPage(1, ocrStatus = "OCR_FAILED")))))
 }
}
