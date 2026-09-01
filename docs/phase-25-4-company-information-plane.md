# Phase 25.4 company information plane

## Purpose and boundaries

Phase 25.4 adds one shared, logically isolated company information plane. It keeps four concepts separate:

- ingestion moves externally sourced records into a company-scoped destination;
- metadata describes ownership, meaning, sensitivity, provenance, quality, and lineage;
- semantic metrics provide versioned numerical business truth;
- semantic memory retrieves contextual experience and documents.

Similarity never grants access. A pipeline never grants permission to use its output. Agent definitions contain logical data requirements, never company data or credentials. No company receives its own database, vector service, metadata server, metric runtime, AI router, or permanent worker.

## External research inspected

The repositories already checked out under `external-research` were inspected at their current local revisions.

### dlt

Adopted patterns:

- explicit extract, normalize, and load boundaries;
- load-package/run identity and bounded run statistics;
- incremental state committed only with a successful destination load;
- append/merge dispositions and primary-key idempotency;
- EVOLVE and FREEZE schema contracts;
- degraded state, retry metadata, and preservation of last known good data.

Intentionally not adopted:

- dlt as an authorization authority;
- arbitrary Python source loading or model-supplied connector code;
- a permanent worker per company or assignment;
- the Python runtime before a reviewed Phase 26 connector demonstrates a concrete operational need.

Decision: architectural adoption through a native TypeScript connector and load-package substrate. The current phase does not claim that the dlt runtime is embedded.

### OpenMetadata

Adopted concepts:

- bounded typed metadata entities;
- domains distinct from physical schemas;
- owner, department, and assignment ownership references;
- classification, sensitivity, provenance, glossary aliases, and quality metadata;
- company-scoped lineage edges and dependency traversal.

Intentionally not adopted:

- the full Java, search, ingestion, and UI deployment;
- a metadata instance per company;
- a parallel identity, policy, graph, or audit system.

Decision: selected OpenMetadata-style concepts are implemented in Alexa's existing PostgreSQL, company, policy, and audit abstractions. Full deployment is deferred because its operational cost and duplicated governance outweigh the present benefit.

### Rill

Adopted concepts:

- metrics-as-code semantics with canonical keys, formulas, dimensions, time fields, units, and definition sources;
- one active, immutable historical version sequence per company metric;
- shared human/agent query results containing definition, observation, freshness, quality, and lineage;
- metrics are queried rather than re-derived by an LLM.

Intentionally not adopted:

- the Rill runtime, ClickHouse/DuckDB deployment, dashboard server, or per-company process;
- caller-supplied executable SQL. Metric formulas are inert bounded definitions in this phase.

Decision: Rill-style semantic metric patterns are implemented natively. No Rill runtime integration is claimed.

### pgvector

The existing PostgreSQL pgvector integration remains the only vector layer. Phase 25.4 adds typed company semantic documents and an HNSW cosine index. PostgreSQL queries first materialize authorized owner, company, scope, and entity-type candidates and only then rank them. A lexical path uses the same database-side scope constraints. Qdrant is deferred to Phase 25.8.

## Architecture

Registered connectors produce Zod-validated record batches. A centralized scheduler or manual route can invoke a registered pipeline; the service carries `ownerId`, `companyId`, `sourceId`, and `pipelineId` throughout the run and revalidates those identifiers inside the destination transaction. Schema, dataset freshness, incremental state, metadata, lineage, records, and the successful run are committed as one scoped load package. Failures preserve the prior checkpoint and records while marking the pipeline and dataset degraded.

The metadata catalog covers data sources, pipelines, datasets, tables, fields, metrics, reports, documents, memory scopes, workflow/objective outputs, and integrations. The initial automatic lineage is source → pipeline → dataset; metric definitions extend this to dataset → metric. Later objective/workflow phases can add `MEASURES`, `INFORMS`, and `USES` edges through the same bounded interface.

Semantic metrics do not execute arbitrary formulas. Observations are written by trusted integrations or workflows against an active definition version. Queries return the canonical definition and newest observation, with current, stale, conflict, or unavailable status and its lineage. Changing a definition supersedes the prior version instead of rewriting historical meaning.

## Authorization and context resolution

All store methods require owner and company identifiers. Composite keys and foreign keys repeat that isolation in PostgreSQL. Department and assignment data policies are deny-first, sensitivity-bounded, and may narrow but not widen. A Governor can receive broad aggregate metrics and metadata without receiving raw restricted rows.

Resolved company context contains only authorized datasets, memory scopes, active metric results, glossary, domains, sensitivity policy, and integration bindings. Resolved assignment context further intersects agent requirements with policy, company state, integration capability exposure, and credential readiness. Credential responses contain status metadata but never the secret locator.

The effective capability states are `AVAILABLE`, `APPROVAL_REQUIRED`, `INTEGRATION_MISSING`, `CREDENTIAL_EXPIRED`, `POLICY_DENIED`, `DEVICE_OFFLINE`, `BUDGET_BLOCKED`, and `COMPANY_PAUSED`. This phase resolves the states but does not add a new executor.

Memory authorization order is fixed: authenticate company → resolve assignment scopes → filter owner/company/scope/type → rank. Supported scopes are owner, company, department, assignment, task, and conversation. The same reusable agent definition receives different dataset, metric, memory, integration, and credential metadata in each company.

## AI routing and data minimization

The AI router accepts a server-resolved data-routing policy. Restricted or local-only context structurally disables cloud candidates. Approved-cloud rules restrict remote candidates to explicit provider IDs. The model cannot override these flags through prompt text. Callers should send metric observations, bounded retrieval results, aggregations, or summaries—not whole datasets.

## Storage and migration

Migration `0086_phase_25_4_company_information_plane.sql` adds normalized, shared tables for sources, datasets, pipelines, runs, records, metadata, lineage, glossary, metrics, observations, credential references, integration bindings, policies, and semantic documents. Deployment must run the ordinary migration and production-security validation before enabling routes or schedulers. The migration is additive and preserves existing memory, PKG, agent, workforce, integration, policy, and audit data.

## UI

The company detail area adds compact Data, Metrics, Integrations, and Memory tabs. It shows source and pipeline health, dataset freshness/sensitivity, canonical metric values and definitions, integration readiness, semantic memory counts, and a searchable glossary. It only loads for the active company. Agent data context is exposed through a validated assignment-scoped API for inspector integration without revealing credential locators.

## Auditing and observability

Audit event types cover source, dataset, schema, pipeline, metric, glossary, data-access, integration, and credential changes. Pipeline runs expose record counts, schema-change counts, duration, retry count, last success, failure code, and freshness. Ordinary logs and audit metadata never contain record payloads, formulas as executable text, credential locators, or secrets.

## Known limitations and deferred work

- Phase 26 must supply reviewed CRM, payments, accounting, advertising, analytics, commerce, support, email, and project-management connectors. Unknown connectors fail closed today.
- Scheduled and event-driven trigger modes are modeled, but the existing centralized scheduler must invoke them; no background service is created in this phase.
- Semantic metric observations are ingested results, not an arbitrary SQL engine. A reviewed analytical adapter may be added later.
- The metadata graph is integrated by identifiers and relationships; richer projection into the existing Personal Knowledge Graph is deferred until a consumer requires it, avoiding duplicate graph state.
- Secret storage remains behind the existing credential provider. This plane stores only opaque references and readiness metadata.
- Qdrant and other per-company vector infrastructure are explicitly out of scope.
