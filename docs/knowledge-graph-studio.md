# Knowledge Graph Studio

Knowledge Graph Studio lives in the dashboard at `/knowledge-graph`.

It displays:

- entity, relationship, fact, evidence, conflict, source, and embedding counts
- recent entities
- graph search
- Human Understanding context simulation
- entity type coverage
- conflict queue
- recent graph events

The page uses bounded read-only APIs. Mutations remain behind authenticated,
CSRF-protected, trusted-origin API routes.

