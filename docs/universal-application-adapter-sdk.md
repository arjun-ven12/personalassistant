# Universal Application Adapter SDK

Phase 18D standardizes how future application adapters plug into the existing
assistant architecture. It does not replace the Universal Application Adapter
Framework, Reviewed Native Provider Runtime, Capability Registry, Semantic
Workspace Engine, Deep Semantic Indexers, or trusted native transport.

The SDK records adapter contracts around existing adapter instances.

```text
Existing trusted application
  → existing adapter instance
  → existing reviewed provider / semantic indexer dependencies
  → Phase 18D SDK contract
  → Planner discovers semantic capabilities
```

## Adapter contract

An SDK contract declares:

- application identity
- semantic domains
- existing adapter capabilities
- semantic capability IDs
- universal semantic object types
- supported reviewed operations
- permissions
- dependencies
- lifecycle state
- sandbox boundaries
- version and compatibility metadata

Contracts are reviewed, sandboxed, owner-scoped, and planner-agnostic. They
explicitly record that raw UI automation, generic execution, and unrestricted OS
APIs are unavailable.

## Lifecycle

Supported lifecycle states:

```text
discovered → installed → validated → enabled → active → paused
                                      ↓
                                  disabled → archived → removed
```

Lifecycle transitions are persisted and audited. They do not grant execution
authority by themselves; real actions still route through Planner, capability
resolution, provider validation, trusted native transport, policy, approvals,
verification, and audit.

## SDK APIs

- `GET /api/adapter-sdk`
- `GET /api/adapter-sdk/metadata`
- `POST /api/adapter-sdk/lifecycle`

Mutations require authentication, trusted origin, CSRF, and network inspection.

## Persistence

Phase 18D adds SDK-specific records that point back to existing adapter
instances:

- `adapter_sdk_contracts`
- `adapter_lifecycle`
- `adapter_sandboxes`
- `adapter_dependencies`
- `adapter_usage`
- `adapter_compatibility`
- `adapter_domains`

Existing Phase 17E tables continue to own trusted applications, adapter
instances, adapter versions, permissions, health, capabilities, events, plugins,
and metrics.

## Reference adapters

Existing trusted applications such as VS Code, Finder, Chrome, Safari, and
Terminal become reference SDK adapters by generating contracts from their
current adapter/provider records. Future adapters for Apple Notes, Notion,
Obsidian, Spotify, Mail, Messages, Slack, Figma, Linear, Calendar, and other
applications should implement the same contract without changing Planner logic.

## Security boundary

The SDK forbids:

- raw UI automation
- generic OS APIs
- arbitrary shell or AppleScript
- coordinate clicking
- OCR or screenshots
- unrestricted Accessibility
- caller-supplied executable paths
- unreviewed third-party adapters

Adapters can expose only reviewed semantic capabilities through existing
governed systems.
