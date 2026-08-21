# Demonstration Learning Operations

Operational checks:

- Monitor `workflow_validation` warnings.
- Review duplicate and optimization suggestions before accepting them.
- Archive old semantic recordings according to owner-scoped retention policy.
- Track `skill_usage` and `workflow_analytics` for health.
- Keep generated skills planner-unavailable until owner review.
- Verify migrations before deployment.

Production must remain deny-by-default and must not fall back to in-memory
storage.
