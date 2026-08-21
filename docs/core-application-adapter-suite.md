# Core Application Adapter Suite

Phase 18E installs the first core semantic adapter suite on top of the existing
Universal Application Adapter SDK, Reviewed Native Provider Runtime, semantic
object model, Planner, and trusted native transport.

It does not add a new provider registry, capability registry, semantic object
model, or execution path.

## Core adapters

The suite registers semantic adapters for:

- VS Code
- Finder
- Chrome
- Safari
- Terminal
- Apple Notes
- Calendar
- Reminders

Each adapter exposes application-independent semantic capabilities and maps
objects into the existing universal semantic object model.

## Execution model

Semantic adapter actions follow this path:

```text
Planner / Voice / Gesture / Agent / Dashboard
  → Core Adapter semantic capability
  → existing Adapter SDK contract
  → existing Reviewed Native Provider Runtime when mapped
  → existing Trusted Native Execution Transport
  → verification and audit
```

Capabilities that require an official API or reviewed extension, such as Apple
Notes note-body operations or Calendar event writes, fail closed until that
reviewed dependency is connected.

## Safety boundary

The suite forbids:

- app-specific Planner logic
- raw UI automation
- OCR
- screenshots
- coordinate clicking
- unrestricted Accessibility traversal
- arbitrary shell commands
- arbitrary AppleScript
- unsupported filesystem or browser scraping

Terminal command execution remains limited to Approved Command Registry entries.
Delete, patch, and other high-risk operations remain approval-protected.

## APIs

- `GET /api/core-adapters`
- `GET /api/core-adapters/health`
- `GET /api/core-adapters/context`
- `GET /api/core-adapters/actions`
- `POST /api/core-adapters/semantic-actions`

Mutating semantic actions require authentication, trusted origin, CSRF, network
inspection, trusted application registration, granted permissions, declared
capability, and reviewed provider/API availability.

## Dashboard

The Application Management Center now displays:

- installed core adapters
- semantic domains
- supported semantic object types
- semantic capabilities
- provider dependency state
- health metrics
- permission status
- context snapshots
- recent actions
