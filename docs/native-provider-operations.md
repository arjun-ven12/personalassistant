# Native Provider Operations Guide

Before enabling Phase 17G persistence, run migration
`0038_phase_17g_reviewed_native_provider_runtime.sql`.

Operational checks:

- validate providers after application updates;
- monitor provider health and verification failures;
- keep approved terminal commands disabled until reviewed;
- revoke trusted applications when code signatures or bundle IDs change;
- treat Accessibility permission loss as provider failure;
- archive diagnostics and metrics through bounded owner-scoped jobs.

The runtime is safe without a connected native host: providers remain disabled
and dispatch fails closed instead of performing fake or raw automation.

Phase 17H adds a local Mac Agent provider host for the safe subset of provider
operations. Operators should expect launch/focus and safe browser URL opening
to be available locally, while deeper semantic app actions remain unavailable
until reviewed Accessibility or app-specific bridges are added. The backend
dispatcher still fails closed when the signed provider-host execution transport
is unavailable.
