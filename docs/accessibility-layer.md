# Reviewed Accessibility Layer

Phase 17H checks Accessibility permission health through Electron's macOS
system preferences API, but it does not expose raw Accessibility control.

Current status:

- Accessibility permission state is available as diagnostics.
- No raw Accessibility nodes cross renderer IPC.
- No Accessibility action API is exposed to Planner, Voice, Gesture, Agents, or
  browser content.
- Capabilities that require Accessibility fail closed until a reviewed semantic
  Accessibility layer exists.

Future reviewed Accessibility support must stay behind native providers and may
support only bounded semantic operations such as window discovery, role
inspection, supported action inspection, focus verification, and provider-owned
semantic target lookup.
