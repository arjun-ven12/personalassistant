# Knowledge Conflicts

Knowledge conflicts represent contradictory evidence.

Example:

- Fact A: project status is `active`
- Fact B: project status is `paused`

The system records an open conflict rather than overwriting either fact.
Conflict records are owner-scoped and visible in Knowledge Graph Studio.

Automatic resolution is intentionally deferred. Owners or reviewed future
workflows may resolve conflicts, but vector similarity and LLM output cannot
silently decide truth.

