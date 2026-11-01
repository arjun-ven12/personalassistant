package com.alexa.commandcenter.documents

import com.alexa.commandcenter.model.AthenaDocument

internal enum class DocumentView { LIBRARY, REVIEW, SAVE, READY, DETAIL, SETTINGS }
internal data class ScanTask(val title: String, val detail: String, val completed: Int? = null, val total: Int? = null)
internal data class DocumentNotice(val title: String, val detail: String, val error: Boolean = false)

internal object DocumentFlow {
    val collections = listOf("Scans", "Study", "Projects", "Receipts", "Notes", "Other")
    fun tags(text: String) = text.split(',').map { it.trim().take(60) }.filter { it.isNotEmpty() }.distinct().take(12)
    fun mayExport(document: AthenaDocument) = document.stage == "COMPLETE" && document.pdf != null && !document.sensitive && document.pages.all { it.ocrStatus == "COMPLETE" }
    fun isProcessing(stage: String) = stage in setOf("PROCESSING_IMAGE", "EXTRACTING_TEXT", "CLASSIFYING", "SAVING", "MEMORY_INDEXING")
    fun task(stage: String, pages: Int) = when (stage) {
        "UPLOADING" -> ScanTask("Uploading your pages", "Sending $pages page(s) to your private Athena library.")
        "PROCESSING_IMAGE" -> ScanTask("Cleaning up your pages", "Preparing a clearer copy. Your originals are kept.")
        "EXTRACTING_TEXT" -> ScanTask("Reading the text", "Making the words in your scan searchable.")
        "CLASSIFYING" -> ScanTask("Organizing your document", "Preparing its title, tags and summary.")
        "SAVING" -> ScanTask("Building your searchable PDF", "Combining the pages in the order you chose.")
        "MEMORY_INDEXING" -> ScanTask("Finishing up", "Applying your existing memory preferences.")
        else -> ScanTask("Checking your document", "Waiting for Athena to confirm the saved result.")
    }
    fun status(document: AthenaDocument) = when {
        document.stage == "FAILED" -> "Needs attention"
        isProcessing(document.stage) || document.stage == "UPLOADING" -> "Processing"
        document.stage == "ARCHIVED" -> "Archived"
        document.pdf != null && document.stage == "COMPLETE" -> "Searchable PDF"
        document.stage == "COMPLETE" -> "Scan saved · PDF needs attention"
        else -> "Pending"
    }
    fun providerReviewNeeded(document: AthenaDocument?) = document?.errorCode in setOf("DOCUMENT_PROVIDER_REVIEW_REQUIRED", "DOCUMENT_PROVIDER_UNAVAILABLE")
    fun pageLabel(count: Int) = if (count == 1) "1 page" else "$count pages"
}
