# Interaction Verification

Every Phase 17C interaction records verification.

Verification categories include:

- preview visible
- capability recorded
- state changed
- value updated
- selection changed
- dialog closed
- submission completed

When a reviewed native provider is unavailable, mutating interactions are
verified as failed and the failure is recorded as non-retry-safe. Safe metadata
preview interactions can be verified through the Desktop Capability Layer
without touching the operating system.
