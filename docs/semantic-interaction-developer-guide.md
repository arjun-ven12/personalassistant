# Semantic Interaction Developer Guide

To add a new trusted control:

1. Register or synchronize a `SemanticDesktopObjectRecord`.
2. Include semantic role, display name, aliases, accessibility labels, hierarchy,
   permissions, visibility, enabled state, and supported actions.
3. Register a `FieldMappingRecord` for form fields.
4. Bind mutating actions to an explicit Desktop Capability Layer capability.
5. Add tests for target resolution, ambiguity, validation, execution status,
   verification, and audit records.

Do not add generic executors, shell endpoints, arbitrary application launch,
coordinate automation, OCR fallbacks, computer-vision fallbacks, unrestricted
Accessibility, or caller-selected executable paths.
