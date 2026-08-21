# Semantic Interaction Operations

Operational checks for Phase 17C:

- Review `interaction_failures` for repeated provider, ambiguity, validation, or
  unsupported-action failures.
- Review `interaction_metrics` for initiation, matching, verification, and
  failure counts.
- Archive old interaction history according to owner-scoped retention policy.
- Keep reviewed providers disabled when their health, permissions, network
  trust, or registration state is unknown.
- Verify production migrations are current before enabling native semantic
  interaction providers.

The safe default remains deny-by-default. Production must not fall back to
in-memory storage or unknown/test network verification.
