# Workflow Orchestration

Desktop workflow orchestration turns goals into reusable semantic skill graphs.
Skills may be sequential, parallel-safe, conditional, approval-gated, retryable,
recoverable, paused, resumed, or cancelled.

Normal workflows should not require AI reasoning. Deterministic resolution must
reuse the Skill Registry before asking the Planner for higher-level reasoning.
Ambiguous or missing skills fail closed rather than guessing.

Every workflow records:

- root skill;
- origin: planner, agent, voice, gesture, dashboard, or command;
- variables;
- current skill and current step;
- status;
- execution history;
- metrics and audit events.
