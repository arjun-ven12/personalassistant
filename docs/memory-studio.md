# Memory Studio

Phase 19D adds an owner-facing cognitive data control center. It unifies memory,
knowledge graph, learning, personality, human-understanding, semantic examples,
and embedding metadata through a single `CognitiveItem` read model.

Memory Studio is not a new memory engine. PostgreSQL source tables owned by the
existing services remain canonical. Studio-specific state stores only control
metadata such as archive, pin, retention override, usage traces, versions, and
audit links.

## Surfaces

- `GET /api/memory-studio`
- `GET /api/memory-studio/search`
- `GET /api/memory-studio/items/:id`
- `GET /api/memory-studio/items/:id/explain`
- `GET /api/memory-studio/items/:id/provenance`
- `GET /api/memory-studio/items/:id/usage`
- `GET /api/memory-studio/items/:id/history`
- `GET /api/memory-studio/items/:id/related`
- `GET /api/memory-studio/conflicts`
- `GET /api/memory-studio/low-confidence`
- `GET /api/memory-studio/stale`
- `GET /api/memory-studio/embeddings`
- `GET /api/memory-studio/health`
- `GET /api/memory-studio/export`
- `PATCH /api/memory-studio/items/:id`
- `POST /api/memory-studio/items/:id/archive`
- `POST /api/memory-studio/items/:id/restore`
- `POST /api/memory-studio/items/:id/pin`
- `POST /api/memory-studio/items/:id/unpin`
- `DELETE /api/memory-studio/items/:id`
- `POST /api/memory-studio/merge`
- `POST /api/memory-studio/reindex`
- `POST /api/memory-studio/context-preview`

All routes require authentication. Mutations also require trusted origin and
CSRF. The delete route is intentionally an impact-preview endpoint and returns
`allowed: false` because permanent deletion is prohibited.

## Dashboard

The Memory page now shows:

- cognitive search and type filters;
- detail inspector with status, source, retention, sensitivity, and version;
- why/how explanation panels;
- low-confidence, stale, and conflict queues;
- embedding metadata without raw vectors;
- context preview and export summary.

## CLI

Developer commands mirror the safe inspection surface:

- `pnpm memory:stats`
- `pnpm memory:search`
- `pnpm memory:inspect`
- `pnpm memory:health`
- `pnpm memory:conflicts`
- `pnpm memory:stale`
- `pnpm memory:duplicates`
- `pnpm memory:validate`
- `pnpm memory:reindex`
- `pnpm memory:export`
- `pnpm memory:cleanup`

Commands require `MEMORY_STUDIO_OWNER_ID`, `LEARNING_OWNER_ID`,
`PERSONALITY_OWNER_ID`, or an owner UUID argument.
