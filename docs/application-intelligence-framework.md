# Universal Application Intelligence Framework

Phase 18A adds a semantic capability layer above trusted application adapters
and reviewed native providers.

The Planner should request application-independent capabilities such as
`CodeEditing.OpenFile`, `Browser.OpenUrl`, or `NoteTaking.CreateNote`.
Applications are candidate providers for those capabilities. The framework
selects a provider using deterministic, auditable signals:

- trusted application registration
- reviewed provider capability coverage
- permission state
- provider health
- application memory and recent-use signals
- explicit user preference when provided

No action is executed by provider selection. Selection only answers which
trusted provider should handle a semantic capability. Execution must still route
through the existing Planner, Desktop Skills Engine, Capability Registry,
Trusted Native Execution Transport, provider validation, approval, audit, and
emergency-stop controls.

## Initial domains

- Code Editing
- Note Taking
- Browser
- File Management
- Terminal

Domains are intentionally extensible. Future applications should map into
domains and capabilities rather than adding planner logic for specific app
names.

## Initial semantic capabilities

Examples include:

- `CodeEditing.CreateFile`
- `CodeEditing.OpenFile`
- `CodeEditing.OpenWorkspace`
- `CodeEditing.PatchFile`
- `CodeEditing.SaveFile`
- `CodeEditing.SearchWorkspace`
- `Browser.OpenUrl`
- `Browser.ReloadPage`
- `FileManagement.RevealFile`
- `FileManagement.CreateFolder`
- `NoteTaking.CreateNote`
- `NoteTaking.SearchNotes`

Provider mappings are derived from existing trusted application and reviewed
native provider records. Unsupported capabilities fail closed with no selected
provider.

## API

- `GET /api/application-intelligence`
- `POST /api/application-intelligence/provider-selection`

The dashboard endpoint exposes semantic domains, capabilities, provider
mappings, application memory, sessions, semantic objects, cross-application
workflow metadata, and provider selection history.

Provider selection accepts a semantic capability request and persists the
deterministic decision:

```json
{
  "capabilityId": "CodeEditing.OpenFile",
  "origin": "planner"
}
```

## Dashboard

The Application Intelligence Center is available at:

`/application-intelligence`

It displays domain coverage, semantic capabilities, provider mappings, selection
history, and cross-application workflow metadata.

## Security boundary

Application Intelligence must not:

- execute actions
- bypass provider validation
- bypass trusted application registration
- bypass Planner, policy, approval, audit, or emergency stop
- expose generic app automation
- expose shell, AppleScript, raw Accessibility, keyboard/mouse replay,
  screenshots, OCR, pixels, coordinates, or caller-selected executables

It is a deterministic resolution layer only.
