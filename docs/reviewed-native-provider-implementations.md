# Reviewed Native Provider Implementations

Phase 17H replaces placeholder native-provider behavior with finite provider
implementations hosted inside the existing Electron Mac Agent.

The implementation decision for this phase is deliberate: no Swift bridge was
introduced. The currently implemented subset can be performed safely with
Electron/Node and fixed macOS Launch Services operations. Capabilities that
would require deeper Accessibility control or app-specific native bridges return
structured unsupported results instead of falling back to brittle automation.

Implemented provider host capabilities:

- VS Code: `launch`, `focus`
- Finder: `launch`, `focus`, `focus_downloads`, `focus_desktop`
- Chrome: `launch`, `focus`, `open_url`
- Safari: `launch`, `focus`, `open_url`
- Terminal: `launch`, `focus`

Not implemented yet:

- VS Code semantic panel focus, command palette, save, file/repository opening
- Finder arbitrary folder/file operations and folder creation
- Chrome/Safari tab manipulation, reload, find, bookmark
- Terminal approved command entry, interrupt, clear, session focus

Those actions require either a reviewed Accessibility layer, app-specific
semantic provider APIs, or a carefully reviewed native bridge. They currently
fail closed with `REVIEWED_BRIDGE_REQUIRED`.

The provider host never exposes arbitrary shell, AppleScript, user scripts,
coordinate clicking, keyboard replay, mouse replay, OCR, screenshots, raw
Accessibility handles, or caller-selected executables.
