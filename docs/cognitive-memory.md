# Cognitive Memory

Phase 8 adds a structured cognitive memory layer to the Personal Assistant. It
is designed to help the system remember repository knowledge, decisions,
preferences, agent behaviour, workflow outcomes, and recurring engineering
patterns across sessions.

This is not chat history. It is owner-scoped, evidence-backed application data.

## Security boundary

Memory never grants authority. A remembered fact or suggestion cannot bypass
authentication, device trust, policy evaluation, approval, CSRF, signed
execution, validation, or emergency stop.

Autonomous suggestions are advisory only. They do not start workflows, mutate
repositories, call integrations, approve patches, run validations, or change
settings automatically.

Memory records must not contain secrets, raw cookies, session tokens, recovery
codes, private keys, credential values, unbounded source code, or hidden
instructions from untrusted content.

## Data model

The shared contracts live in `packages/shared/src/memory.ts`.

The API persists these record families:

- `memories`
- `memory_embeddings`
- `knowledge_nodes`
- `knowledge_edges`
- `engineering_decisions`
- `repository_memory`
- `agent_memory`
- `learning_events`
- `memory_confidence`
- `memory_clusters`
- `memory_suggestions`
- `memory_timeline`

The initial implementation keeps embeddings as a persistence boundary only. It
does not call an external embedding or AI provider. Retrieval is deterministic
and lexical/evidence ranked until a provider is explicitly designed and reviewed.

## Memory layers

### Episodic memory

Events such as repository indexing, workflow completion, validation failures,
conversation summaries, and agent collaboration records.

### Semantic memory

Facts about repositories, architecture, tools, and decisions. These records must
carry confidence and evidence.

### Procedural memory

Learned workflows, validation sequences, debugging patterns, and preferred
implementation order.

### Preference memory

Owner preferences such as code style, architecture choices, testing habits, and
review expectations.

### Repository memory

Long-term repository summaries: architecture, common files, known issues,
technical debt, and historical context.

### Agent memory

Specialist agent expertise, success rate, common mistakes, and preferred
reasoning paths.

## Services

`MemoryIndexerService` provides the current service boundary:

- memory recording
- memory retrieval
- engineering decision logging
- baseline repository-memory consolidation
- baseline agent-memory consolidation
- knowledge graph node creation
- cognitive timeline updates
- advisory suggestion generation
- aggregate Memory Center data

The service depends on injected stores for memory, repositories, agents, and
workflows. It does not read the filesystem, call tools, invoke shell commands,
or perform AI-provider calls.

## API routes

All routes require owner authentication. Mutations additionally require exact
trusted origin and CSRF validation.

- `GET /api/memory/center`
- `GET /api/memory/search`
- `POST /api/memory`
- `GET /api/memory/graph`
- `GET /api/memory/decisions`
- `POST /api/memory/decisions`
- `GET /api/memory/repositories/:repositoryId`
- `GET /api/memory/agents/:agentId`
- `GET /api/memory/timeline`
- `GET /api/memory/suggestions`
- `GET /api/memory/statistics`

## Dashboard

The Memory Center appears under Engineering → Memory. It shows:

- memory statistics
- search/retrieval
- preference-memory capture
- engineering decision log
- advisory suggestions
- knowledge graph preview
- cognitive timeline

The dashboard is a control surface for memory data. It is not an execution
surface.

## Auditing

The audit schema includes Phase 8 events:

- `MEMORY_RECORDED`
- `MEMORY_RETRIEVED`
- `MEMORY_CONSOLIDATED`
- `ENGINEERING_DECISION_LOGGED`
- `KNOWLEDGE_GRAPH_UPDATED`
- `LEARNING_EVENT_RECORDED`
- `MEMORY_SUGGESTION_CREATED`

The current implementation records audits for owner-created memories and
engineering decisions. Additional consolidation and retrieval audit coverage can
be expanded as background workers mature.

## Current limitations

- Retrieval is lexical and evidence ranked, not vector-semantic.
- Memory consolidation is synchronous and baseline-oriented, not a long-running
  background worker yet.
- Suggestions are seeded from current state and explicit learning events; they
  are not produced by an LLM.
- No memory deletion/export/retention UI exists yet. Those operations require
  dedicated policy and audit controls before implementation.
