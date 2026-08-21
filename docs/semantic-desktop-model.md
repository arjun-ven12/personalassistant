# Semantic Desktop Model

Phase 17A introduces a read-only semantic model for trusted desktop surfaces.
The model represents applications, windows, dialogs, menus, forms, panels, and
controls as structured objects instead of pixels.

The current implementation provides:

- bounded schemas for semantic desktop objects, windows, relationships, events,
  accessibility snapshots, and semantic desktop context;
- a Desktop Registry extension in PostgreSQL and in-memory test storage;
- deterministic semantic search over registered objects;
- a Desktop Inspector section in the Desktop Control Center;
- safe baseline metadata for the Personal Assistant dashboard hierarchy.

Native Accessibility integration remains provider-gated. Until a reviewed native
provider is installed, the system reports `nativeAccessibilityProviderAvailable:
false` and uses registered metadata only.

## Security boundary

Phase 17A is read-only. It must not execute actions, move windows, press keys,
move the mouse, run AppleScript, use shell commands, capture pixels, require OCR
when accessibility metadata exists, or inspect unauthorized applications.

Secure text fields are redacted by contract. Semantic events and snapshots store
bounded metadata only and must never include passwords, secrets, raw screenshots,
raw OCR payloads, or unrestricted Accessibility dumps.
