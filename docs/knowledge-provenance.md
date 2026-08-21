# Knowledge Provenance

Phase 19B treats provenance as first-class runtime data.

Entities, relationships, facts, and evidence retain:

- source type
- source ID
- source URI where available
- source timestamp
- extraction method
- confidence
- evidence snippet
- owner confirmation flag

Contradictory facts are not silently merged. They create conflict records for
review. Provenance and confidence enrich Planner context but never bypass policy
or approvals.

