# Semantic Retrieval Engine

Phase 16B adds a deterministic semantic retrieval layer for commands, pages,
UI elements, shortcuts, planner skills, capabilities, and future plugins.

The retrieval path is intentionally conservative:

1. Normalize the request.
2. Try exact object labels and stable keys.
3. Try approved aliases.
4. Try deterministic synonyms.
5. Rank registry matches with lexical and semantic scores.
6. Apply context and usage boosts without overriding permissions.
7. Return a selected object only when confidence is high and unambiguous.
8. Require AI or clarification fallback for low-confidence or ambiguous input.

PostgreSQL remains the source of truth. The `semantic_embeddings` table is
pgvector-ready and versioned, while Redis is only used as a short-lived retrieval
cache. The resolver does not execute actions. It returns semantic candidates and
records bounded audit/metric metadata; actual command execution still routes
through the Intent Engine, Planner, policy, approval, and audit systems.

## API

- `GET /api/semantic` returns the Semantic Intelligence dashboard model.
- `POST /api/semantic/search` resolves a query deterministically when safe.
- `POST /api/semantic/objects` registers an owner-scoped semantic object.
- `POST /api/semantic/aliases` adds or updates an alias suggestion/record.
- `POST /api/semantic/synonyms` adds owner-scoped deterministic synonyms.

Mutations require authentication, trusted origin, and CSRF validation. Retrieval
is authenticated and owner scoped.

## Security boundary

Semantic retrieval is not authority. Hidden, disabled, unauthorized,
low-confidence, and ambiguous objects fail closed. Aliases and synonyms are never
silently overwritten. Embeddings are versioned, and raw prompts, raw audio,
camera frames, DOM dumps, secrets, and sensitive action arguments must not enter
semantic records or audit metadata.
