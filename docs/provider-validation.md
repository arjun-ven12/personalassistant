# Provider Validation

Provider validation runs before native execution is allowed.

Validation checks:

- provider installed;
- bundle identifier matches;
- code signature valid;
- macOS permissions granted;
- Accessibility available when required;
- provider version compatible;
- declared capabilities healthy;
- supported application version.

Failed validation disables the provider, stores diagnostics, refreshes health,
and prevents dispatch. Unknown native-host health is treated as failure.

Phase 17H provider implementations report host-side capability coverage and
Accessibility permission diagnostics from the Mac Agent. Unsupported
capabilities must remain disabled or fail closed; validation must never widen
coverage by falling back to raw Accessibility, AppleScript, shell, keyboard,
mouse, OCR, screenshot, or coordinate automation.
