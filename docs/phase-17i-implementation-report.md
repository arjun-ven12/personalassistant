# Phase 17I Implementation Report

Implemented:

- Reused the existing signed Mac Agent execution channel.
- Added `native.provider_capability` to shared execution schemas.
- Added native provider transport result schemas.
- Extended Mac Agent polling to report provider-host diagnostics.
- Extended backend `/api/agent/execution` poll handling to ingest provider-host
  health.
- Extended `ReadOnlyExecutionClient` to dispatch native provider requests
  through `MacNativeProviderHost`.
- Added backend native provider dispatch queueing through
  `ExecutionService.createNativeProviderExecution`.
- Removed the need for a second application registration by mapping Phase 17E
  trusted application records into bounded policy application targets.
- Kept unsupported native capabilities fail-closed.

No new WebSocket, shell executor, AppleScript bridge, raw Accessibility bridge,
keyboard/mouse replay, OCR, screenshot automation, coordinate clicking, or
generic native invocation path was introduced.

To open VS Code through the dashboard:

1. restart the API and Mac Agent so both run the Phase 17I code;
2. make sure the Mac Agent is paired and trusted;
3. make sure VS Code is trusted in the Application Center / trusted
   applications registry with bundle ID `com.microsoft.VSCode`;
4. wait for the Mac Agent poll to report provider host health;
5. open Desktop Control Center → Application Trust & Native Provider Runtime;
6. use the VS Code provider `Test launch` button.
