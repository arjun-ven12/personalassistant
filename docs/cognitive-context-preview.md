# Cognitive Context Composition and Preview

Phase 20R-C composes bounded, owner-scoped context for each concrete provider
attempt. Preview answers “what context would be used for this input?” without
executing an action or invoking a model.

## Production source map

All adapters are registered by `registerProductionContextSources` during API
bootstrap. They receive the authenticated owner ID from the server-side route or
router context; model output and client content cannot choose another owner.

| Context source | Existing service/store | Persistence owner | Freshness/provenance |
| --- | --- | --- | --- |
| Personality | `HumanUnderstandingStore` active profile, communication rules, working styles, traits | Human Understanding migrations/store | Profile version and update time |
| Knowledge Graph | `KnowledgeGraphStore` entities, facts, relationships | Personal KG migrations/store | Entity/fact versions, observation and validity times |
| Memory | `MemoryStore.listMemories` | Memory migrations/store | Memory version, update and expiry times |
| Learned Preference | `LearningEngineStore.listPreferences` | Learning Engine migrations/store | Preference version, effective interval, confidence and override evidence |
| Conversation | Human Understanding recent interpretations, or exact-conversation `AgentStore` messages | Existing Human Understanding and Agent stores | Request/message IDs and creation time; bounded turn count |
| Project | `RepositoryStore.listRepositories` | Repository intelligence migrations/store | Active generation/fingerprint and index/update time |
| Workflow | `WorkflowStore` workflow, current task, prerequisites and recent events | Workflow migrations/store | Workflow version-by-update-time and live task state |
| Agent | `AgentStore` registered agent and bounded private tasks | Agent migrations/store | Agent version, state and update time |
| Recent Activity | `WorkspaceIntelligenceStore`, `ApplicationIntelligenceStore`, Human Understanding | Existing workspace/application/HU stores | Latest bounded records and update times |
| Semantic Workspace | `WorkspaceIntelligenceStore` contexts and semantic objects | Workspace intelligence migrations/store | Record IDs and update times |
| Application State | `ApplicationIntelligenceStore` sessions | Application intelligence migrations/store | Session IDs, status and update times |

No parallel cognitive database or new migration is introduced. The context
package and trace are currently bounded process-memory diagnostics; durable
source records remain owned by their existing stores.

## Selection and composition

Retrieval runs concurrently with per-source timeouts. Explicit owner,
project, workflow, task, agent and conversation scopes are applied before
ranking. The score combines semantic overlap, entity match, freshness,
importance, confidence, source/profile priority, authority, scope match and
task association. Canonical facts are deduplicated while merging provenance.
Conflicts resolve only on decisive authority or freshness; otherwise the
package requests clarification.

The input allowance is the minimum of the model-window remainder, requested
context cap and economic input cap. The model-window remainder reserves task,
output, reasoning, provider overhead and safety tokens. A package is compiled
again for every provider attempt, so local-only material is not reused after a
cloud escalation.

## Privacy and safety

Privacy filtering always runs. `SECRET` and `RESTRICTED` blocks never enter a
remote package. `PRIVATE` blocks require an approved cloud provider; an
untrusted provider receives only `NORMAL` blocks. `LOCAL_ONLY` forbids remote
composition and `NO_EXTERNAL` excludes document, tool and external sources.

External content remains labelled `UNTRUSTED_EXTERNAL` and is surrounded by a
system instruction stating that context is data, not authorization or
instructions. Preview is authenticated and owner-scoped. It may reveal private
context to that owner, so Runtime Studio displays an explicit warning. Preview
does not execute actions, launch workflows, approve work, mutate memory or call
tools.

## Health and observability

Health is not ready when production sources are absent and reports missing,
failed and degraded sources separately. Traces include request/context IDs,
source status and latency, selected and omitted candidates, token counts,
conflicts, sufficiency, provenance and the provider-bound fingerprint. Router
attempts and economic ledger entries correlate request, route, context and
attempt IDs without storing sensitive action arguments.
