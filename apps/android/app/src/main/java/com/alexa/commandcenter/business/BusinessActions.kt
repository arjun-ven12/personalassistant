package com.alexa.commandcenter.business

import com.alexa.commandcenter.model.*

data class BusinessActions(
  val company: () -> String? = { null },
  val projects: suspend () -> Result<List<EngineeringProject>> = { Result.success(emptyList()) },
  val list: suspend () -> Result<List<BusinessCampaign>> = { Result.failure(IllegalStateException("Business service unavailable")) },
  val get: suspend (String) -> Result<BusinessView> = { Result.failure(IllegalStateException("Business service unavailable")) },
  val create: suspend (BusinessCreate) -> Result<BusinessCampaign> = { Result.failure(IllegalStateException("Business service unavailable")) },
  val control: suspend (String, String) -> Result<Unit> = { _, _ -> Result.failure(IllegalStateException("Business service unavailable")) },
  val telemetry: suspend (String) -> Result<BusinessTelemetry> = { Result.failure(IllegalStateException("Business service unavailable")) },
  val review: suspend (String, String, String) -> Result<Unit> = { _, _, _ -> Result.failure(IllegalStateException("Business service unavailable")) },
  val analytics: suspend (String, String, String, String) -> Result<Unit> = { _, _, _, _ -> Result.failure(IllegalStateException("Business service unavailable")) },
  val initiative: suspend (String, String, Int) -> Result<Unit> = { _, _, _ -> Result.failure(IllegalStateException("Business service unavailable")) },
  val recover: suspend (String, String) -> Result<Unit> = { _, _ -> Result.failure(IllegalStateException("Business service unavailable")) },
)
