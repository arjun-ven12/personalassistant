# Conversation State Machine

Phase 19A introduces deterministic states for the Human Understanding Layer:

`IDLE`, `LISTENING`, `UNDERSTANDING`, `CLARIFYING`, `PLANNING`, `EXECUTING`,
`WAITING`, `PAUSED`, `COMPLETED`, `CANCELLED`, and `ERROR`.

Transitions are persisted in `conversation_states` with previous state, new
state, reason, timestamp, owner, and a `deterministic: true` marker.

Voice uses these states as context only. State never grants execution authority.
