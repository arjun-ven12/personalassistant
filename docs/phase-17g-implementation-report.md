# Phase 17G Implementation Report

Implemented:

- shared schemas for reviewed native providers, finite capabilities, health,
  validation, execution, metrics, diagnostics, approved terminal commands, and
  dispatch requests;
- in-memory and PostgreSQL stores;
- `NativeProviderRuntime` plus dispatcher, registry, validation, health,
  verification, sandbox, trust, and diagnostics service aliases;
- finite baseline provider descriptors for VS Code, Finder, Terminal, Chrome,
  and Safari;
- approved terminal command registry records for `pnpm dev`, `pnpm test`,
  `pnpm build`, and `pnpm lint`, disabled by default;
- authenticated APIs for registry dashboard, validation, and capability
  dispatch;
- Application Trust Center / Capability Explorer dashboard panel;
- migration `0038_phase_17g_reviewed_native_provider_runtime.sql`;
- audit events for validation, dispatch denial, dispatch request, and
  verification;
- tests for finite provider loading, validation fail-closed behavior, untrusted
  app denial, unhealthy provider denial, and approved command requirements.

Security implications:

- no arbitrary AppleScript, shell, user scripts, coordinate clicking, OCR,
  screenshots, keyboard replay, mouse replay, unrestricted Accessibility, code
  injection, or generic native execution path was added;
- dispatch requires trusted application records, finite declared capabilities,
  granted adapter permissions, approved terminal commands where applicable, and
  healthy provider validation;
- without a reviewed native host reporting health, providers remain disabled
  and execution is denied.

Known limitation:

- this phase adds the secure runtime and dispatcher foundation. Actual macOS
  effects still require a reviewed native host/provider implementation that can
  report healthy validation without widening the security boundary.
