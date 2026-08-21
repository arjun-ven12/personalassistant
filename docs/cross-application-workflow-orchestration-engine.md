# Cross-Application Workflow Orchestration Engine

Phase 18F turns semantic application capabilities into deterministic
cross-application workflow DAGs.

The user describes an outcome. The composer selects an editable workflow
template, resolves semantic adapter capabilities from the existing Core
Application Adapter Suite, builds a directed acyclic graph, propagates bounded
workflow variables, and executes nodes only through the existing adapter and
provider runtime boundaries.

## Execution path

```text
Planner / Voice / Gesture / Agent / Dashboard
  → Workflow Composer
  → Workflow Graph
  → Core Application Adapter Suite
  → Reviewed Native Provider Runtime or reviewed semantic integration
  → Trusted Native Execution Transport when native-backed
  → Verification, metrics, history, recovery, audit
```

There is no second planner, provider registry, capability registry, transport,
shell path, AppleScript path, UI scraping path, OCR path, screenshot path, or
coordinate automation path.

## Deterministic templates

The initial composer ships with editable built-in templates:

- Development Session
- Meeting Preparation
- Daily Planning
- Research Session
- Release Deployment
- Shutdown Routine

Template selection is rule-based and deterministic. Unsupported or untrusted
capabilities remain visible in the graph but fail closed during execution.

## Workflow graph

Each node records:

- semantic capability
- adapter and application
- dependencies
- preconditions
- expected outputs
- estimated duration
- retry and failure policy
- approval requirement
- semantic action request
- verification state

Nodes run only when dependencies have completed. Independent nodes can be
scheduled in parallel by future runtimes because the graph preserves dependency
structure.

## Recovery and approval

High-risk nodes pause at an approval checkpoint. Phase 18F does not invent an
approval bypass; approval still belongs to the existing governance and
recent-authentication system.

Failures create bounded failure and recovery records. Recovery suggestions are
advisory until the owner resumes or changes system state such as trust,
permissions, provider health, or reviewed integrations.

## Dashboard

The Workflows page now includes a Workflow Operations Center showing graphs,
nodes, variables, checkpoints, recovery records, execution history, metrics, and
recent application usage.
