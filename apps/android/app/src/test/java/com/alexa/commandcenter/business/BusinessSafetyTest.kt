package com.alexa.commandcenter.business

import com.alexa.commandcenter.model.*
import org.junit.Assert.*
import org.junit.Test

class BusinessSafetyTest {
  private val company = "20000000-0000-4000-8000-000000000002"
  private val item = BusinessDeliverable("40000000-0000-4000-8000-000000000004", "RESEARCH", "MARKET_RESEARCH", "READY", "NOT_REQUIRED", 1)
  private val campaign = BusinessCampaign("10000000-0000-4000-8000-000000000001", company, "30000000-0000-4000-8000-000000000003", "Research", "Product", "MARKET_RESEARCH", "DRAFT", 1, listOf(item))
  @Test fun deniesWrongCompanyAndDuplicateDeliverables() {
    assertTrue(BusinessSafety.valid(campaign, company))
    assertFalse(BusinessSafety.valid(campaign, "other-company"))
    assertFalse(BusinessSafety.valid(campaign.copy(deliverables = listOf(item, item)), company))
    assertFalse(BusinessSafety.valid(campaign.copy(id = "../other"), company))
  }
  @Test fun deniesForeignArtifactAndInvalidProgress() {
    val artifact = BusinessArtifact("50000000-0000-4000-8000-000000000005", campaign.id, company, item.id, "RESEARCH", 1, "DRAFT", com.google.gson.JsonObject())
    val view = BusinessView(campaign, listOf(artifact), 20, 0)
    assertTrue(BusinessSafety.valid(view, company))
    assertFalse(BusinessSafety.valid(view.copy(artifacts = listOf(artifact.copy(companyId = "other"))), company))
    assertFalse(BusinessSafety.valid(view.copy(progressPercent = 101), company))
    assertFalse(BusinessSafety.valid(view.copy(artifacts = listOf(artifact.copy(campaignId = item.id))), company))
  }
}
