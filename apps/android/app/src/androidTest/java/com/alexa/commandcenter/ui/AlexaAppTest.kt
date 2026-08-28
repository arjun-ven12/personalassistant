package com.alexa.commandcenter.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
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
        onCreateObjective = { _ -> },
        onObjectiveAction = { _, _ -> },
        onModifyObjective = { _, _, _ -> },
        onApprovalDecision = { _, _ -> },
        onAgentSelected = {},
        onWorkflowSelected = {},
        onExperimentsSelected = {},
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
        onCreateObjective = { _ -> },
        onObjectiveAction = { _, _ -> },
        onModifyObjective = { _, _, _ -> },
        onApprovalDecision = { _, _ -> },
        onAgentSelected = {},
        onWorkflowSelected = {},
        onExperimentsSelected = {},
      )
    }

    composeRule.onNodeWithText("OFFLINE").assertIsDisplayed()
  }

  @Test fun secondary_operations_navigation_opens_activity() {
    composeRule.setContent { shell() }

    composeRule.onNodeWithText("Alexa").performClick()
    composeRule.onNodeWithContentDescription("Open Alexa operations").performClick()
    composeRule.onNodeWithText("Activity").performClick()

    composeRule.onNodeWithText("Executive events, not raw logs.").assertIsDisplayed()
  }

  @Test fun alexa_screen_shows_offline_draft_state() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.OFFLINE),
        environment = config(),
        onLogin = { _, _ -> }, onCreatePairing = {}, onRegister = { _, _ -> }, onRefreshApproval = {},
        onRefresh = {}, onLock = {}, onForgetDevice = {}, onCreateObjective = { _ -> },
        onObjectiveAction = { _, _ -> }, onModifyObjective = { _, _, _ -> }, onApprovalDecision = { _, _ -> },
        onAgentSelected = {}, onWorkflowSelected = {}, onExperimentsSelected = {},
      )
    }

    composeRule.onNodeWithText("Alexa").performClick()
    composeRule.onNodeWithText("Offline. History may be stale; messages and voice commands are not sent.").assertIsDisplayed()
    composeRule.onNodeWithText("Draft while offline").assertIsDisplayed()
  }

  @Composable private fun shell() = AlexaApp(
    state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.ONLINE),
    environment = config(),
    onLogin = { _, _ -> }, onCreatePairing = {}, onRegister = { _, _ -> }, onRefreshApproval = {},
    onRefresh = {}, onLock = {}, onForgetDevice = {}, onCreateObjective = { _ -> },
    onObjectiveAction = { _, _ -> }, onModifyObjective = { _, _, _ -> }, onApprovalDecision = { _, _ -> },
    onAgentSelected = {}, onWorkflowSelected = {}, onExperimentsSelected = {},
  )

  private fun config() = AlexaEnvironmentConfig(
    AlexaEnvironment.DEBUG,
    "https://api.example.test/",
    "https://web.example.test",
  ).validate()
}
