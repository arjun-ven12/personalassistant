# Learning Engine

Phase 19C adds a deterministic Personal Learning Engine that turns repeated
structured observations into inspectable candidates, suggestions, and stable
learned preferences.

Learning is evidence accumulation:

1. structured event;
2. scoped candidate;
3. confidence recalculation;
4. conflict and policy checks;
5. suggestion or low-risk reversible activation;
6. timeline and audit visibility.

The engine reuses PostgreSQL as source of truth and keeps Redis/vector systems
as optional acceleration layers only. It does not train models, create a new
memory system, bypass policy, or authorize execution.

## Surfaces

- `GET /api/learning`
- `GET /api/learning/events`
- `GET /api/learning/candidates`
- `GET /api/learning/preferences`
- `GET /api/learning/habits`
- `GET /api/learning/sequences`
- `GET /api/learning/suggestions`
- `GET /api/learning/conflicts`
- `GET /api/learning/stats`
- `GET /api/learning/explain/:id`
- `POST /api/learning/events`
- `POST /api/learning/preferences`
- `POST /api/learning/sequences`
- `POST /api/learning/preferences/:id/approve`
- `POST /api/learning/preferences/:id/reject`
- `POST /api/learning/suggestions/:id/accept`
- `POST /api/learning/suggestions/:id/reject`
- `POST /api/learning/recompute`

All mutations require authentication, trusted origin, and CSRF.
