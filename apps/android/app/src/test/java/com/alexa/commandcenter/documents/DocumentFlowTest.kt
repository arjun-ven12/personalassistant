package com.alexa.commandcenter.documents

import com.alexa.commandcenter.model.*
import org.junit.Assert.*
import org.junit.Test

class DocumentFlowTest {
    private val document = AthenaDocument("11111111-1111-4111-8111-111111111111", "owner", "company", "Notes", "NOTE", "Notes", "COMPLETE", listOf(DocumentPage(1, ocrStatus = "COMPLETE")), pdf = "22222222-2222-4222-8222-222222222222")
    @Test fun exportRequiresCompleteNonsensitiveConsistentDocument() {
        assertTrue(DocumentFlow.mayExport(document))
        assertFalse(DocumentFlow.mayExport(document.copy(sensitive = true)))
        assertFalse(DocumentFlow.mayExport(document.copy(stage = "FAILED")))
        assertFalse(DocumentFlow.mayExport(document.copy(stage = "UPLOADING")))
        assertFalse(DocumentFlow.mayExport(document.copy(pdf = null)))
        assertFalse(DocumentFlow.mayExport(document.copy(pages = listOf(DocumentPage(1, ocrStatus = "PENDING")))))
    }
    @Test fun failureAndPdfReadinessAreNotConflatedWithSuccessfulScanning() {
        assertEquals("Searchable PDF", DocumentFlow.status(document))
        assertEquals("Scan saved · PDF needs attention", DocumentFlow.status(document.copy(pdf = null)))
        assertEquals("Needs attention", DocumentFlow.status(document.copy(stage = "FAILED")))
        assertEquals("Processing", DocumentFlow.status(document.copy(stage = "EXTRACTING_TEXT")))
        assertFalse(DocumentFlow.isProcessing("UNKNOWN"))
        assertFalse(DocumentFlow.isProcessing("COMPLETE"))
    }
    @Test fun reviewRequirementIsFiniteAndNeverInferredFromArbitraryErrors() {
        assertTrue(DocumentFlow.providerReviewNeeded(document.copy(errorCode = "DOCUMENT_PROVIDER_REVIEW_REQUIRED")))
        assertFalse(DocumentFlow.providerReviewNeeded(document.copy(errorCode = "some untrusted document text")))
        assertFalse(DocumentFlow.providerReviewNeeded(null))
    }
    @Test fun tagsStayWithinExistingApiBoundsAndDoNotDuplicate() {
        assertEquals(listOf("Study", "Project"), DocumentFlow.tags(" Study, Project, Study, ,"))
        assertEquals(12, DocumentFlow.tags((1..20).joinToString(",")).size)
        assertEquals(60, DocumentFlow.tags("a".repeat(100)).single().length)
    }
}
