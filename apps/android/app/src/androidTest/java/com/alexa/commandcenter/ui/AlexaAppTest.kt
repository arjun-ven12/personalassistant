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
import com.alexa.commandcenter.documents.DocumentActions
import com.alexa.commandcenter.network.AlexaApiClient
import com.alexa.commandcenter.repository.AlexaRepository
import com.alexa.commandcenter.security.*
import org.junit.Rule
import org.junit.Test

class AlexaAppTest {
  @get:Rule val composeRule = createComposeRule()

  @Test fun locked_state_exposes_biometric_gate() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.BiometricLocked),
        documentActions = documentActions(),
        onCompanySelected = {}, onPortfolioSelected = {}, onPortfolioSearch = { _, _ -> },
        onCompanyCreated = { _, _, _ -> }, onCompanyAction = { _, _ -> },
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

    composeRule.onNodeWithText("Unlock Athena with biometrics").assertIsDisplayed()
  }

  @Test fun offline_shell_exposes_connection_state() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.OFFLINE),
        documentActions = documentActions(),
        onCompanySelected = {}, onPortfolioSelected = {}, onPortfolioSearch = { _, _ -> },
        onCompanyCreated = { _, _, _ -> }, onCompanyAction = { _, _ -> },
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

    composeRule.onNodeWithText("Athena").performClick()
    composeRule.onNodeWithContentDescription("Open Athena operations").performClick()
    composeRule.onNodeWithText("Activity").performClick()

    composeRule.onNodeWithText("Executive events, not raw logs.").assertIsDisplayed()
  }

  @Test fun alexa_screen_shows_offline_draft_state() {
    composeRule.setContent {
      AlexaApp(
        state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.OFFLINE),
        documentActions = documentActions(),
        onCompanySelected = {}, onPortfolioSelected = {}, onPortfolioSearch = { _, _ -> },
        onCompanyCreated = { _, _, _ -> }, onCompanyAction = { _, _ -> },
        environment = config(),
        onLogin = { _, _ -> }, onCreatePairing = {}, onRegister = { _, _ -> }, onRefreshApproval = {},
        onRefresh = {}, onLock = {}, onForgetDevice = {}, onCreateObjective = { _ -> },
        onObjectiveAction = { _, _ -> }, onModifyObjective = { _, _, _ -> }, onApprovalDecision = { _, _ -> },
        onAgentSelected = {}, onWorkflowSelected = {}, onExperimentsSelected = {},
      )
    }

    composeRule.onNodeWithText("Athena").performClick()
    composeRule.onNodeWithText("Offline. History may be stale; messages and voice commands are not sent.").assertIsDisplayed()
    composeRule.onNodeWithText("Draft while offline").assertIsDisplayed()
  }

  @Composable private fun shell() = AlexaApp(
    state = AlexaUiState(screen = AlexaScreenState.Shell, connection = ConnectionState.ONLINE),
    documentActions = documentActions(),
    onCompanySelected = {}, onPortfolioSelected = {}, onPortfolioSearch = { _, _ -> },
    onCompanyCreated = { _, _, _ -> }, onCompanyAction = { _, _ -> },
    environment = config(),
    onLogin = { _, _ -> }, onCreatePairing = {}, onRegister = { _, _ -> }, onRefreshApproval = {},
    onRefresh = {}, onLock = {}, onForgetDevice = {}, onCreateObjective = { _ -> },
    onObjectiveAction = { _, _ -> }, onModifyObjective = { _, _, _ -> }, onApprovalDecision = { _, _ -> },
    onAgentSelected = {}, onWorkflowSelected = {}, onExperimentsSelected = {},
  )

  @Test fun document_entry_requires_a_company_before_capture() {
    composeRule.setContent { shell() }
    composeRule.onNodeWithText("Athena").performClick()
    composeRule.onNodeWithText("Scan / Documents").performClick()
    composeRule.onNodeWithText("Select a company before scanning documents.").assertIsDisplayed()
    composeRule.onNodeWithText("Back to Athena").performClick()
    composeRule.onNodeWithText("Scan / Documents").assertIsDisplayed()
  }

  // Empty test-only storage: no owner session, real credentials or network action.
  private fun documentActions(): DocumentActions {
    val values = object : SecureValues {
      private val entries = mutableMapOf<String, String>()
      override fun read(key: String) = entries[key]
      override fun write(key: String, value: String) { entries[key] = value }
      override fun remove(key: String) { entries.remove(key) }
      override fun clear() { entries.clear() }
    }
    val session = SessionStore(values)
    return DocumentActions(AlexaRepository(
      AlexaApiClient.create(config(), session),
      AndroidDeviceIdentity(values, "athena.documents.ui.fixture"),
      DeviceRegistrationStore(values), session, SecureCache(values),
    ))
  }

  private fun config() = AlexaEnvironmentConfig(
    AlexaEnvironment.DEBUG,
    "https://api.example.test/",
    "https://web.example.test",
  ).validate()
}
