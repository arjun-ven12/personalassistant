# Intent & Execution Engine

Phase 11 adds a universal command layer for natural-language requests. It turns
owner requests into structured intents, internal commands, inspectable execution
plans, plan steps, clarification sessions, reusable command templates, macros,
suggestions, metrics, and searchable command history.

The engine is intentionally a router and planner. It does not create a new
execution authority.

## Boundary

Every command remains governed by the existing platform layers:

1. owner authentication
2. private-network and device requirements where applicable
3. policy evaluation
4. approval and recent authentication
5. workflow, integration, validation, read-only, or patch execution providers
6. audit logging and history

Commands may be classified as informational, read-only, low risk, moderate
risk, high risk, or critical. Moderate and higher commands are persisted in a
waiting-approval state. High-risk and critical commands also require recent
authentication before future execution.

## Intent analysis

The first implementation uses deterministic parsing and classification. It
extracts:

- primary and secondary goals
- category
- context summary
- constraints
- priority and urgency
- required permissions
- required capabilities
- expected output
- success criteria
- confidence
- clarification questions

Ambiguous follow-up language such as “do that again” produces an open
clarification session instead of guessing.

## Command grammar

Internal commands are serializable records containing:

- action
- target
- context
- constraints
- priority
- approval level
- expected result
- dependencies
- retry policy

These records are stored for inspection and history. They are not executable
shell text and are never routed to an arbitrary command endpoint.

## Execution planning and routing

Execution plans contain ordered steps, optional parallel groups, estimated
duration, approvals required, rollback strategy, validation strategy, and
completion criteria. Steps are assigned to existing provider classes such as:

- Agent Society
- Workflow Engine
- integration registry
- read-only execution
- manual owner handling

The router does not bypass the provider’s own policy, approval, signing,
workspace, device, and network checks.

## Reusable commands and macros

Owners can save command templates and create macros. Macros compose saved
templates into reusable modes such as work, focus, research, coding,
deployment, or travel.

Saving a command or macro does not grant permission to execute it. Each expanded
command must still pass classification, planning, policy, and approval.

## Dashboard

The Command Center page shows:

- command counts
- waiting approvals
- governance-bypass status
- command parser form
- latest intent analysis
- execution steps
- intent inspector
- command history
- saved commands
- macros
- suggestions

The dashboard uses the same authenticated, CSRF-protected API client as other
owner mutations.

## Persistence

Phase 11 adds migration `0019_phase_11_intent_execution_engine.sql` with tables
for commands, intent analysis, execution plans, execution steps, history,
macros, saved commands, templates, clarification sessions, metrics, and
suggestions.

PostgreSQL remains the production source of truth. In-memory stores are retained
for tests and explicit development use only.

## Security guarantees

- No generic shell endpoint is added.
- No generic file endpoint is added.
- No application-launch endpoint is added.
- Natural-language text is not executed.
- Caller-supplied risk, identity, trust, network state, or approval status is
  ignored.
- Clarification is required when confidence is insufficient.
- Approval requirements can only be strengthened.
- Every command record is owner-scoped, auditable, and inspectable.
- Command parsing never bypasses policy, recent authentication, trusted-device
  checks, emergency stop, or execution provider restrictions.
