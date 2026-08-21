# Native Provider Developer Guide

Native providers must be small, finite, and auditable.

Rules:

1. expose declared semantic capabilities only;
2. accept registered application IDs, never executable paths;
3. validate all inputs with shared Zod schemas;
4. use approved terminal command records for terminal execution;
5. verify every capability result;
6. record diagnostics and metrics;
7. fail closed when permissions, app trust, provider health, or validation state
   is unknown.

Never expose arbitrary AppleScript, shell, scripts, raw Accessibility calls,
keyboard/mouse replay, coordinate clicking, OCR, screenshots, filesystem
exploration, app injection, or unrelated application access.

For Phase 17H implementations, prefer Electron and Node.js first. Fixed
Launch Services operations are acceptable only when the executable path is
provider-owned, arguments are finite and schema-validated, and verification is
bounded. Do not add a Swift bridge unless a specific reviewed capability cannot
be implemented safely or reliably in JavaScript. Unsupported capabilities must
return a structured failure rather than using keyboard shortcuts, AppleScript,
mouse movement, or raw Accessibility as a shortcut.
