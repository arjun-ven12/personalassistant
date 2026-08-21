# Cognitive Search

Cognitive search queries the unified `CognitiveItem` read model across memory,
knowledge, learning, personality, Human Understanding, semantic examples, and
embedding metadata.

Search is deterministic and bounded. Ranking combines lexical match,
confidence, pin state, archival state, and recency. It does not require an LLM.

## Filters

- query text;
- item type;
- source system;
- status;
- retention class;
- sensitivity class;
- tag;
- confidence range;
- stale, archived, pinned, and conflict flags.

## Boundaries

Search returns owner-scoped records only. Unknown item types, invalid cursors,
unbounded limits, and cross-owner records are rejected or omitted.
