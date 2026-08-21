# Cognitive Agent Architecture

Phase 10.7 adds persistent cognition to every Agent OS agent.

This phase does not redesign Agent OS, workflows, approval, validation, or
execution. It adds an agent-specific cognitive layer above Agent OS and beside
the existing Cognitive Memory Engine.

## Security boundary

Agent cognition is advisory.

- It does not execute commands.
- It does not apply patches.
- It does not run validations.
- It does not approve workflows.
- It does not deploy.
- It does not call integrations.
- It does not change permissions.

All cognition is owner-scoped, authenticated, auditable, evidence-backed, and
versionable. Low-confidence reasoning must say it is low-confidence; confidence
must not be fabricated.

## Memory layers

Each agent now has four cognitive memory layers:

- working memory: temporary task context that can expire;
- episodic memory: significant experiences and workflow outcomes;
- semantic memory: generalized facts and domain knowledge;
- procedural memory: learned procedures, checklists, and workflows.

Working memory may be promoted into long-term memory through reflection and
learning. Original records are preserved during consolidation.

## Reasoning and confidence

The reasoning service records structured reasoning decisions with alternatives,
constraints, future implications, evidence, and confidence. Confidence is stored
separately in confidence history and includes the basis and any low-confidence
action, such as additional retrieval, cross-agent review, clarification, or
human approval.

## Reflection and learning

After completed work, agents can record reflection reports:

- objectives;
- quality summary;
- mistakes;
- missed opportunities;
- unexpected outcomes;
- lessons learned;
- reusable patterns;
- confidence;
- evidence.

Reflection can promote lessons into semantic memory and create experience
records and learning-pipeline events.

## Specialization

Every agent receives a specialization profile derived from its registered
capabilities and supported tasks. Profiles track domains, frameworks, languages,
libraries, architectures, business areas, performance score, confidence,
preferred workflows, and expertise growth.

## Cognitive state

Each agent has a persisted cognitive state:

- idle;
- observing;
- planning;
- reasoning;
- researching;
- implementing;
- reviewing;
- reflecting;
- learning;
- waiting;
- completed;
- archived.

State transitions are observable through the cognitive dashboard.

## Consolidation

Consolidation summarizes related memories while preserving original records.
Phase 10.7 implements explicit owner-triggered consolidation and records
learning events. Future background workers may schedule consolidation, but they
must preserve evidence and originals.

## APIs

Authenticated APIs are exposed under `/api/agent-cognition/*`:

- `GET /dashboard`;
- `GET /search`;
- `POST /reflections`;
- `POST /reason`;
- `POST /agents/:agentId/consolidate`.

State-changing routes require trusted origin and CSRF validation.

## Persistence

Migration `0016_phase_10_7_agent_cognition.sql` adds persistence for working,
episodic, semantic, and procedural memory; memory relationships; experience
records; agent decision logs; specializations; reflection reports; confidence
history; goal tracking; cognitive states; learning events; memory
consolidation; and cognitive metrics.

PostgreSQL remains the production source of truth. In-memory stores are for
explicit development and tests only.
