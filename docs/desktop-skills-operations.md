# Desktop Skills Operations Guide

Before enabling persistent desktop skill workflows, run migration
`0037_phase_17f_autonomous_desktop_skills.sql`.

Operational checks:

- monitor workflow startup, step scheduling, verification, retries, recovery,
  and failure causes;
- watch approval checkpoint queues for high-risk permissions;
- revoke or disable skills with repeated failures;
- archive old execution history through bounded owner-scoped jobs;
- ensure trusted application adapters and permissions remain current;
- treat unknown provider health as denial.

The engine is safe to run without native providers because it records semantic
orchestration state and fails preconditions for missing trusted capabilities.
