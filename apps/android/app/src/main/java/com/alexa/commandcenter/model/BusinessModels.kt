package com.alexa.commandcenter.model

import com.google.gson.JsonElement

data class BusinessDeliverable(val id: String, val type: String, val role: String, val status: String, val approvalState: String, val version: Int, val artifactRef: String? = null, val blockerCode: String? = null, val toolId: String? = null, val workforceTaskId: String? = null)
data class BusinessCampaign(val id: String, val companyId: String, val objectiveId: String, val title: String, val productOrCompany: String, val objectiveType: String, val status: String, val version: Int, val deliverables: List<BusinessDeliverable>)
data class BusinessArtifact(val id: String, val campaignId: String, val companyId: String, val deliverableId: String, val type: String, val version: Int, val status: String, val content: JsonElement, val provenance: JsonElement? = null, val approvalRequestId: String? = null)
data class BusinessCampaigns(val campaigns: List<BusinessCampaign>)
data class BusinessView(val campaign: BusinessCampaign, val artifacts: List<BusinessArtifact>, val progressPercent: Int, val approvalsPending: Int)
data class BusinessCreate(val idempotencyKey: String, val title: String, val productOrCompany: String, val objectiveType: String, val targetAudience: String? = null, val engineeringRepositoryId: String? = null, val sourceCampaignId: String? = null)
data class BusinessTelemetry(val campaignId: String, val objectiveId: String, val knownUsd: String, val modelCalls: Int, val inputTokens: Int, val outputTokens: Int, val unknownToolCostCount: Int, val unknownModelCostCount: Int, val unknownEngineeringCostCount: Int, val completeCostAttribution: Boolean)
object BusinessSafety {
  val types = listOf("BRAND_PACKAGE", "SOCIAL_CAMPAIGN", "AD_PACKAGE", "LANDING_PAGE", "PRODUCT_LAUNCH", "ANALYTICS", "MARKET_RESEARCH", "BUSINESS_IMPROVEMENT", "CAMPAIGN_ITERATION", "LAUNCH_CAMPAIGN")
  fun valid(c: BusinessCampaign, company: String): Boolean = EngineeringSafety.validId(c.id) && c.companyId == company && EngineeringSafety.validId(c.objectiveId) && c.version > 0 && c.title.length <= 160 && c.deliverables.size in 1..20 && c.deliverables.all { EngineeringSafety.validId(it.id) && it.version > 0 } && c.deliverables.map { it.id }.distinct().size == c.deliverables.size
  fun valid(v: BusinessView, company: String): Boolean = valid(v.campaign, company) && v.progressPercent in 0..100 && v.artifacts.size <= 200 && v.artifacts.all { it.companyId == company && it.campaignId == v.campaign.id && EngineeringSafety.validId(it.id) && v.campaign.deliverables.any { d -> d.id == it.deliverableId } }
}
