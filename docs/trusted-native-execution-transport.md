# Trusted Native Execution Transport

Phase 17I reuses the existing trusted Mac Agent signed execution channel instead
of adding a second transport.

The current path is:

Planner / dashboard / skills → Native Capability Dispatcher → existing
server-signed execution queue → trusted Mac Agent → Provider Host → reviewed
native provider → macOS → provider verification → device-signed result → audit.

The transport now supports the finite tool name `native.provider_capability`.
Requests contain a provider ID, application ID, capability, bounded arguments,
expiry, nonce, and the existing server Ed25519 signature. The Mac Agent verifies
the server envelope before dispatching the provider host and returns the result
using the existing device Ed25519 result signature.

No WebSocket was added. No generic native executor was added.

Current practical coverage:

- `provider.vscode.launch`
- `provider.vscode.focus`
- `provider.finder.launch`
- `provider.finder.focus`
- `provider.finder.focus_downloads`
- `provider.finder.focus_desktop`
- `provider.chrome.launch`
- `provider.chrome.focus`
- `provider.chrome.open_url`
- `provider.safari.launch`
- `provider.safari.focus`
- `provider.safari.open_url`
- `provider.terminal.launch`
- `provider.terminal.focus`

Capabilities that the provider host does not implement still fail closed.
