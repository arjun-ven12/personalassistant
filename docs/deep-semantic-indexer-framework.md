# Deep Semantic Indexer Framework

Phase 18C upgrades workspace intelligence from metadata-only discovery to
reviewed, provider-scoped semantic indexing.

The framework does not scrape application UI. It accepts structured semantic
updates only from official application APIs, reviewed native providers, or
reviewed application extensions such as a VS Code semantic extension.

## Runtime model

Every indexer is registered against a trusted application and reviewed provider:

```text
Trusted Application
  → Reviewed Provider
  → Semantic Provider Indexer
  → Incremental Index Session
  → Semantic Objects
  → Relationships / Fingerprints / Events
```

The Planner still talks to semantic objects through the existing Workspace
Intelligence and Application Intelligence APIs. Phase 18C adds the indexing
source, event, health, fingerprint, and version records behind that surface.

## Reviewed source boundary

Allowed sources:

- official application APIs
- reviewed native providers
- reviewed application extensions

Blocked sources:

- OCR
- screenshots
- coordinate replay
- UI scraping
- unrestricted Accessibility traversal
- generic filesystem crawling
- arbitrary shell or scripts

Each `semantic_provider_indexers` record stores explicit booleans confirming
that UI scraping, OCR, screenshots, and unrestricted Accessibility are not
available for that indexer.

## VS Code indexer

The VS Code path is modeled as a reviewed extension indexer. It can expose
structured code objects such as:

- workspace
- repository
- folder
- file
- class
- function
- method
- variable
- diagnostics
- references

The current backend framework records and displays these objects, sessions,
fingerprints, versions, relationships, and events. Real source-level coverage
should come from the reviewed VS Code extension/provider surface, not from
scraping VS Code windows.

## APIs

- `GET /api/deep-indexers`
- `GET /api/deep-indexers/events`
- `GET /api/deep-indexers/health`
- `GET /api/deep-indexers/search-statistics`
- `POST /api/deep-indexers/incremental-sync`

Mutating sync requests require authentication, trusted origin, CSRF, and
network inspection. The request accepts a registered `indexerId` and bounded
sync mode only.

## Persistence

Phase 18C adds:

- `semantic_provider_indexers`
- `semantic_index_sessions`
- `semantic_index_events`
- `semantic_index_versions`
- `semantic_fingerprints`
- `semantic_event_log`
- `semantic_relationship_updates`
- `semantic_index_health`
- `semantic_search_statistics`

Workspace objects and relationships continue to live in the Phase 18B workspace
intelligence tables.

## Dashboard

The Semantic Workspace Explorer now includes a Phase 18C indexer panel showing:

- indexer coverage
- reviewed source type
- supported object types
- incremental sync actions
- recent semantic events
- indexed-provider/search statistics
