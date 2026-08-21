# Knowledge Relationships

Relationships connect two knowledge entities with a typed edge such as `OWNS`,
`PART_OF`, `USES`, `HAS_REPOSITORY`, `HAS_WORKFLOW`, `DEPENDS_ON`,
`DECIDED_BY`, `MENTIONS`, or `RELATED_TO`.

Relationships are owner-scoped, confidence-scored, provenance-aware, and bounded
for traversal. The query engine supports neighborhoods and shortest bounded
paths without introducing a separate graph database.

Automatic relationship creation is limited to reviewed deterministic sources:
trusted application records, repositories, agents, workflows, memory promotion,
and explicit owner-scoped API calls.

