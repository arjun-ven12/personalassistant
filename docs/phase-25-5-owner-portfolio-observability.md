# Phase 25.5 owner portfolio intelligence and observability

## Architecture and boundaries

Phase 25.5 adds one shared, owner-scoped portfolio read model over the existing
company data plane. It does not merge company namespaces, create a portfolio
database, or give company agents owner authority. Cross-company reads are
performed only after resolving the authenticated owner and are limited to
canonical metric observations, freshness, lineage, bounded telemetry, and
summaries. Raw dataset rows, documents, memory content, prompts, completions,
credentials, and chain-of-thought are not portfolio evidence.

Business, data, system, AI, objective, workforce, and economy health remain
separate components. Unknown components are reported as unknown rather than
being hidden in a magic aggregate score. An insight is advisory and read-only;
it carries confidence, evidence, lineage, trace references, a suggested next
step, and never executes that step.

## External research inspected

The locally pinned research revisions were inspected before implementation:

- Rill `6b5ceb340b7e`: metric views, measures/dimensions, time comparison,
  drill-down, and declarative semantic definitions.
- OpenTelemetry Collector `a183c9cc604a`: OTLP receiver pipelines, processor
  ordering, memory limiting, batching, tail sampling, retry-oriented exporter
  design, and attribute filtering.
- Langfuse `da05c4fbf28a`: trace/generation hierarchy, model and prompt version
  metadata, scores/evaluations, latency/token/cost analytics, and task-class
  comparison.
- OpenMetadata `7b1bc6b6a150`: ownership, lineage, domains, data products,
  provenance, quality, and usage relationships.

These repositories remain research inputs. Their licenses and deployment
topologies are not copied into Alexa.

## Integration decisions

### Rill

Decision: adopt Rill-style semantic patterns natively. Alexa continues to use
the Phase 25.4 `SemanticMetric` definitions and observations as the authority.
Portfolio comparison fingerprints the canonical key, normalized formula, unit,
version, dimensions, and time field. A requested period is resolved explicitly.
Incompatible formulas, versions, periods, units, or currencies are reported as
not directly comparable; no implicit FX conversion or nominal-key comparison
is performed. No Rill runtime or per-company process was added.

### OpenTelemetry

Decision: use the existing real OpenTelemetry SDK and OTLP HTTP exporter and
strengthen the shared Collector configuration. Application spans carry bounded
owner, company, objective, workflow, task, assignment, capability, provider,
and model identifiers. Parent/child context supports an execution waterfall.
Sanitization occurs before OTLP export and before local persistence.

The shared Collector uses a memory limiter, redaction, error-preserving tail
sampling, bounded success sampling, and batching. The checked-in exporter is
`debug`; production must configure an explicitly approved backend rather than
silently sending telemetry to a third party. Telemetry recording failure is
non-critical and cannot turn a successful business operation into a failure.
Audit remains a separate durable security record and is never sampled.

### Langfuse

Decision: adopt Langfuse-compatible AI-observability concepts natively and
defer its runtime. `AIObservabilityTrace` records correlation IDs, provider,
model, prompt/policy versions, controlled task class, reasoning class, locality,
latency, token counts, correlated cost, retries, success, review/verification,
and bounded evaluation scores. It deliberately has no prompt, completion,
memory, raw dataset, or chain-of-thought field. Restricted and local-only
company policy narrows export to local-only; confidential data permits metadata
only. A Langfuse deployment is deferred until an approved privacy topology and
operational need justify the additional service.

### OpenMetadata

Decision: reuse the native OpenMetadata-style concepts established in Phase
25.4. Executive insights now include the existing company-scoped lineage edges.
Ownership, classification, freshness, provenance, glossary, metric, and dataset
records are not duplicated in an observability catalog. A full OpenMetadata
deployment remains deferred because the native catalog already covers the
current acceptance scope and an additional stack would add operational cost.

## Storage, migration, and retention

Migration `0087_phase_25_5_owner_portfolio_observability.sql` creates shared
PostgreSQL tables for system spans, AI traces, and alert state. Composite
owner/company foreign keys and indexes enforce efficient scoped lookups. There
is no database, collector, AI-observability service, or worker per company.

Retention classes are short (7 days), standard (30), extended (90), and
security-critical (365). Expiry is stored on every telemetry record and the
store exposes bounded purge operations. Alert acknowledgement and snoozing are
non-destructive, owner-scoped, CSRF-protected mutations. Security audit events
have their own retention and are not treated as telemetry.

## Privacy and operations

Attribute keys and values are allow-shaped and bounded. Authorization headers,
cookies, credentials, passwords, secrets, tokens, API keys, prompts, inputs,
outputs, memory, payloads, content, email, phone data, and secret-looking values
are discarded centrally. The Collector repeats defense-in-depth redaction.

The Portfolio UI exposes Overview, Business, System, and AI views, including
company cards, canonical metrics and freshness, attention priority, service
health, trace inspection, model/task-class efficiency, and regressions. Android
CEO Command Center work is intentionally deferred; the authenticated API and
shared schemas are ready for a later bounded mobile surface.

## Known limitations and next adapters

- The objective component reports unknown until a safe explicit cross-company
  objective-summary adapter replaces ambient company context. It is not inferred
  from telemetry.
- AI cost is correlated from AIRouter economic response metadata; Agent Economy
  remains the accounting and budget authority. A portfolio economy-summary
  adapter is still required for reserved budgets and non-model costs.
- Current system health is span-derived (errors, request counts, and latency).
  Queue depth, database saturation, Redis health, scheduler lag, and host
  resource gauges need explicit metric instruments and an approved metrics
  query backend.
- Automated evaluation datasets/runs, daily or weekly scheduling, notifications,
  portfolio search, currency conversion, and Android UI are deferred.
- The Collector debug exporter is suitable for local validation only. Production
  acceptance requires an approved backend, deployment-specific TLS/auth, and a
  load/sampling exercise against that topology.

These limitations are explicit so unavailable evidence cannot be mistaken for
healthy state or current business truth.
