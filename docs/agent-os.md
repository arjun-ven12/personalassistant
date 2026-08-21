# Agent Operating System

Phase 10.6 defines the Agent Operating System, the runtime contract used by
both permanent and dynamic agents.

Agent OS does not replace the Phase 7 multi-agent framework or the Phase 10.5
dynamic workforce. It standardizes what every agent is: a manifest-backed,
packageable, versioned software component with runtime configuration, scoped
knowledge sources, reusable capability references, tool references, permission
profiles, health, metrics, sessions, and runtime events.

## Security boundary

Agent OS is advisory and coordination-focused.

- It does not execute commands.
- It does not apply patches.
- It does not run validations.
- It does not deploy.
- It does not call integrations directly.
- It does not approve work.
- It does not grant agents new permissions.

All existing authentication, CSRF, Tailscale/private-network checks, policy,
approval, audit, signed execution, replay protection, and emergency-stop
controls remain authoritative.

## Manifest source of truth

Every agent receives an `agent_manifests` record. The manifest stores:

- identity and display metadata;
- permanent or dynamic agent type;
- version and lifecycle status;
- runtime configuration;
- memory configuration;
- capability references;
- tool references;
- permission profile reference;
- knowledge source references;
- workflow roles;
- evaluation strategy;
- lifecycle rules.

The manifest is the source of truth for runtime behaviour. Agents do not store
ad hoc permissions directly; they reference permission profiles.

## Agent packages

Every agent is represented as an installable package record containing:

- manifest;
- prompt summary;
- memory schema version;
- package version;
- integrity hash;
- export flag;
- package metadata.

Packages are owner-scoped and integrity hashed. Export/import support is
modelled at the record level; it does not provide external installation
automation or permission changes.

## Runtime configuration

Runtime configuration includes:

- default model and fallback model;
- temperature;
- context limit;
- execution timeout;
- retry policy;
- memory retrieval limits;
- reflection and planning depth;
- parallelism;
- tool preferences;
- logging level and debug mode.

Configuration records are persisted separately and require signed/audited
changes by policy. Phase 10.6 exposes configuration state; it does not introduce
silent runtime mutation.

## Tool registry

Tools are separated from agents. Agents reference tools by ID.

The initial registry contains advisory-only references for repository
intelligence, semantic code intelligence, workflow context, memory retrieval,
and policy review. These records describe capabilities that already exist in the
platform; they do not add a generic tool executor.

## Permission profiles

Agents use permission profiles instead of embedding permissions.

The default profile is `existing_agent_permissions`:

- registered read-only repository access;
- registered read-only filesystem boundary;
- owner-scoped memory read;
- assigned workflow context;
- owner-authenticated read APIs;
- approved integrations only;
- no deployment permissions.

Dynamic agents inherit the same boundary.

## Knowledge sources

Knowledge sources are dynamically mountable references such as repositories,
architecture, knowledge graph, documentation, cognitive memory, user
preferences, project history, design decisions, and previous workflows.

Context packages are built from these references before a session starts. The
context package stores only IDs and bounded summaries; it does not dump source
code or secrets into runtime state.

## Sessions and events

Each runtime invocation creates an `agent_os_sessions` record and corresponding
runtime events. Sessions are replayable coordination records containing inputs,
outputs, counts, errors, timing, and reasoning statistics.

Runtime events include agent creation, start, pause, resume, completion,
failure, capability loading, tool invocation, memory updates, knowledge
retrieval, workflow join/leave, context packaging, configuration change, and
package validation.

Starting an Agent OS session currently prepares bounded context and records
runtime state. It does not execute tools.

## Health and metrics

Agent OS records health and metrics independently per agent so failures,
latency, success rate, memory retrieval, capability usage, and tool usage can be
observed without affecting another agent's runtime stability.

## APIs

Authenticated owner APIs are available under `/api/agent-os/*`:

- dashboard;
- manifests;
- packages;
- sessions;
- events;
- configurations;
- tools;
- permission profiles;
- knowledge sources;
- health;
- metrics;
- versions;
- context packages.

State-changing session creation requires authentication, trusted origin, and
CSRF validation.

## Persistence

Phase 10.6 adds migration `0015_phase_10_6_agent_os.sql` with tables for
manifests, packages, sessions, runtime events, configurations, Agent OS tool
registry references, Agent OS permission profiles, Agent OS knowledge sources,
versions, health, metrics, and context packages. PostgreSQL remains the
production source of truth. In-memory stores remain only for explicit
development and tests.
