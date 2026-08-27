package com.alexa.commandcenter.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlexaEnvironmentTest {
  @Test fun `normalizes configured API URLs`() {
    val environment = AlexaEnvironmentConfig(
      AlexaEnvironment.DEV,
      "http://192.168.1.4:3001",
      "http://192.168.1.4:5173",
    )

    assertEquals("http://192.168.1.4:3001/", environment.validate().apiBaseUrl)
  }

  @Test fun `production refuses an insecure API URL`() {
    val result = runCatching {
      AlexaEnvironmentConfig(
        AlexaEnvironment.PRODUCTION,
        "http://api.example.test",
        "https://app.example.test",
      ).validate()
    }

    assertTrue(result.isFailure)
  }
}
