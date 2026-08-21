# Semantic Workspace & Content Intelligence Engine

Phase 18B adds a semantic content layer above the Universal Application
Intelligence Framework.

18A answers: which provider should handle a semantic capability?

18B answers: what semantic objects exist inside trusted application workspaces?

The engine indexes application-independent objects such as workspaces,
repositories, folders, files, functions, notes, browser tabs, bookmarks, tasks,
events, documents, and relationships. The Planner can search and navigate
objects by meaning instead of by window, button, or coordinate.

## Current implementation

- `WorkspaceIntelligenceService`
- `SemanticObjectService`
- `RelationshipGraphService`
- `ContentDiscoveryService`
- `SemanticSearchService`
- `ContextTrackingService`
- `WorkspaceMemoryService`
- `GET /api/workspace-intelligence`
- `POST /api/workspace-intelligence/search`
- `/semantic-workspace` dashboard
- migration `0042_phase_18b_workspace_intelligence.sql`

The initial content discovery path is conservative. It seeds bounded semantic
objects from trusted application/provider metadata and known reviewed profiles.
It does not scrape application content, use OCR, capture screenshots, dump raw
Accessibility trees, or inspect untrusted apps.

## Search

Search is deterministic lexical ranking over bounded semantic metadata:

```json
{
  "query": "login API",
  "limit": 10
}
```

Results include the matched object, score, and explainable reasons.

## Security boundary

The engine must not:

- bypass application permissions
- bypass provider boundaries
- expose unsupported objects
- execute actions
- bypass Planner, approval, policy, audit, or emergency stop
- use pixels, OCR, screenshots, screen scraping, raw Accessibility dumps,
  mouse/keyboard replay, shell, AppleScript, or caller-selected executable paths

All records are owner-scoped, bounded, traceable, and sensitive content is
redacted by default.
