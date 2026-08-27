package com.alexa.commandcenter.config

import com.alexa.commandcenter.BuildConfig
import java.net.URI

enum class AlexaEnvironment { DEBUG, DEV, PRODUCTION }

data class AlexaEnvironmentConfig(
  val environment: AlexaEnvironment,
  val apiBaseUrl: String,
  val trustedWebOrigin: String,
) {
  fun validate(): AlexaEnvironmentConfig {
    val api = URI(apiBaseUrl)
    val origin = URI(trustedWebOrigin)
    require(api.scheme == "https" || environment != AlexaEnvironment.PRODUCTION) {
      "Production API URLs must use HTTPS."
    }
    require(origin.scheme == "https" || environment != AlexaEnvironment.PRODUCTION) {
      "Production trusted origins must use HTTPS."
    }
    require(api.host != null && origin.host != null) { "API and origin hosts are required." }
    return copy(apiBaseUrl = apiBaseUrl.ensureTrailingSlash())
  }

  private fun String.ensureTrailingSlash() = if (endsWith('/')) this else "$this/"
}

object AlexaEnvironments {
  fun current(): AlexaEnvironmentConfig {
    val environment = AlexaEnvironment.valueOf(BuildConfig.ENVIRONMENT)
    return AlexaEnvironmentConfig(
      environment = environment,
      apiBaseUrl = BuildConfig.API_BASE_URL,
      trustedWebOrigin = BuildConfig.WEB_ORIGIN,
    ).validate()
  }
}
