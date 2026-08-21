# Phase 17H Implementation Report

Phase 17H adds a real reviewed native provider host inside the existing Electron
Mac Agent.

Implemented:

- `MacNativeProviderHost` with finite provider descriptors.
- Reviewed Launch Services support for trusted app launch/focus.
- Reviewed HTTP(S) URL opening for Chrome and Safari.
- Reviewed Finder Downloads/Desktop focus using Mac-Agent-owned special folder
  lookup.
- Process-state verification using fixed provider-owned process names.
- Provider host status and execution IPC contracts.
- Renderer preload validation for the new finite IPC methods.
- Accessibility permission diagnostics without requesting permission.
- API-side regression behavior that prevents placeholder provider execution
  success when the real Mac Agent provider-host transport is unavailable.
- Unit tests for provider coverage, fixed native command arguments, URL scheme
  rejection, unsupported capability failure, and contract safety.

Native bridge decision:

- No Swift bridge was added.
- The implemented subset is achievable through Electron/Node and fixed macOS
  Launch Services calls.
- Deeper app semantic actions remain unavailable until a reviewed
  Accessibility or app-specific bridge is designed and implemented.

Known limitations:

- The API dispatcher does not yet have a signed transport to invoke the Mac
  Agent provider host from the backend.
- Terminal approved command execution remains intentionally unsupported because
  entering commands safely requires a reviewed terminal bridge.
- VS Code panel focus, save, repository opening, and command palette operations
  remain unsupported because safe semantic app control is not available through
  the current JavaScript-only implementation.

Security result:

- No generic executor was added.
- No arbitrary shell or AppleScript was added.
- No caller-selected executable path was added.
- No raw Accessibility API was exposed.
- No coordinate, OCR, screenshot, mouse, keyboard, or pixel automation was
  introduced.
