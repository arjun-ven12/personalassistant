# Reviewed Native Provider Runtime

Phase 17G adds the final desktop execution bridge: a reviewed native provider
runtime and dispatcher. It is not generic desktop automation. Providers expose a
finite set of semantic capabilities for explicitly trusted applications.

Required path:

Planner → Desktop Skill → Capability Registry → Universal Application Adapter →
Native Capability Dispatcher → Reviewed Native Provider → macOS

The runtime refuses arbitrary AppleScript, shell execution, keyboard replay,
mouse replay, coordinate clicking, OCR, screenshot automation, unrestricted
Accessibility access, user-supplied scripts, and untrusted applications.

The current implementation registers finite provider descriptors, validates
trusted application/provider alignment, records health and diagnostics, enforces
approved terminal command checks, and fails closed until a reviewed native host
reports healthy provider validation.

Phase 17H adds the first real Mac Agent provider host implementation for the
safe JavaScript/Electron subset. API dispatch must not report placeholder
execution success; if the signed backend-to-Mac-Agent provider execution
transport is unavailable, dispatch fails closed and records that no macOS action
occurred.
