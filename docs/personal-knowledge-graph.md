# Personal Knowledge Graph & World Model

Phase 19B adds an owner-scoped knowledge graph on top of the existing Memory,
Human Understanding, Semantic Workspace, Application Adapter, Planner, and audit
systems.

PostgreSQL is the source of truth. The graph is represented with relational
tables for entities, relationships, facts, evidence, conflicts, events, and
memory promotions. pgvector remains an optional retrieval aid through the
existing vector infrastructure; vector similarity is never authorization and
never performs automatic merges.

The graph answers questions like:

- Who is involved with this project?
- Which repository belongs to this workspace?
- What facts do we know about a decision?
- Which workflows, agents, applications, and memories are related?
- What conflicts need owner review?

The Human Understanding pipeline requests a bounded graph context after
deterministic context resolution. Planner receives the resolved graph entities,
relationships, facts, confidence, and explanation as context only. Execution
authority still belongs to Planner, policy, approvals, trusted providers, and
the emergency stop system.

