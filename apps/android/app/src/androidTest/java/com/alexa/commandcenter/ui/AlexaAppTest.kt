package com.alexa.commandcenter.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.alexa.commandcenter.config.AlexaEnvironment
import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.ConnectionState
import org.junit.Rule
import org.junit.Test

class AlexaAppTest {
  @get:Rule val composeRule = createComposeRule()

  @Test fun locked_state_exposes_biometric_gate() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.BiometricLocked),
        environment = config(),
        onLogin = { _, _ -> },
        onCreatePairing = {},
        onRegister = { _, _ -> },
        onRefreshApproval = {},
        onRefresh = {},
        onLock = {},
        onForgetDevice = {},
      )
    }

    composeRule.onNodeWithText("Unlock Alexa with biometrics").assertIsDisplayed()
  }

  @Test fun offline_shell_exposes_connection_state() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.OFFLINE),
        environment = config(),
        onLogin = { _, _ -> },
        onCreatePairing = {},
        onRegister = { _, _ -> },
        onRefreshApproval = {},
        onRefresh = {},
        onLock = {},
        onForgetDevice = {},
      )
    }

    composeRule.onNodeWithText("OFFLINE").assertIsDisplayed()
  }

  private fun config() = AlexaEnvironmentConfig(
    AlexaEnvironment.DEBUG,
    "https://api.example.test/",
    "https://web.example.test",
  ).validate()
}
