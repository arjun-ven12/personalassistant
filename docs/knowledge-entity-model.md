# Knowledge Entity Model

Knowledge entities are universal semantic objects such as people, projects,
repositories, files, applications, agents, workflows, goals, decisions, tasks,
events, notes, companies, concepts, technologies, and memories.

Every entity includes:

- stable ID
- owner ID
- entity type
- canonical, normalized, and display names
- aliases
- tags
- source type and source ID
- confidence
- provenance
- timestamps
- version

Entity deduplication is deterministic. The first boundary is
`owner_id + entity_type + normalized_name`; aliases add additional lookup paths
but do not grant execution authority.

