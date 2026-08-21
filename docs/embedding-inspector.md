# Embedding Inspector

The Phase 19D embedding inspector shows safe embedding metadata only.

## Visible fields

- item ID and title;
- source system;
- namespace;
- model name;
- vector dimension;
- last indexed timestamp;
- freshness and coverage state.

## Hidden fields

Raw vectors are never returned by Memory Studio. Vector similarity remains a
retrieval signal only and cannot merge records, authorize execution, approve
actions, bypass Planner, bypass policy, or hide conflicts.
