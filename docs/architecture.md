# Architecture

## Purpose and current boundary

Phase 2.2 preserves the identity layer and adds a separate governance domain:
owner-scoped registries, a trusted built-in tool catalogue, deterministic risk
and policy engines, digest-bound approvals, a default-active emergency stop,
and governance audit records. It deliberately contains no executor. Network
verification is `UNKNOWN`, and privileged execution is permanently unavailable.

## Intended architecture

```text
Text / Voice / Gesture / Web UI
              ↓
       Input normalisation
              ↓
         Intent planner
              ↓
       Structured tool plan
              ↓
         Policy engine
              ↓
       Approval workflow
              ↓
       Registered tool metadata
              ↓
      [future executor absent]
```

The AI planner proposes actions. The policy engine authorises actions. The
executor performs authorised actions. The AI does not decide its own
permissions.

Webpage, email, and document content are untrusted data. External content must
never become executable instructions. Voice and gesture are input sources, not
privileged security bypasses.

## Current components

### Web dashboard

The React dashboard validates API responses with shared Zod schemas. It supports
owner bootstrap/login, device approval/revocation, session revocation,
application/workspace metadata, policy simulation, approval management, audit
viewing, a disabled command field, and a safe emergency-stop button.

Phase 7.5 presents these same surfaces inside a futuristic command-center shell:
top command bar, Lucide navigation rail, central mission workspace, context
sidebar, telemetry bar, glass panels, centralized theme tokens, subtle motion,
and reduced-motion/high-contrast support. The redesign is presentation-only and
does not change API, policy, workflow, agent, integration, approval, or execution
behavior.

### API

Fastify exposes explicit authentication, session, pairing, device, audit,
signature-verification, registry, policy, approval, health, status, and
security routes. Argon2id,
HttpOnly cookies, trusted-origin checks, rate limits, request IDs, structured
logging, Zod validation, and graceful shutdown protect their boundaries. The
execution-enable endpoint always rejects.

### Mac-agent shell

Electron uses `nodeIntegration: false`, `contextIsolation: true`, and
`sandbox: true`. Its renderer receives four methods:

- `testApiConnection()`
- `getAgentDiagnostics()`
- `disableLocalExecution()`
- `getCapabilityStatus()`
- `beginPairing()`
- `getPairingStatus()`

The preload exposes no generic fetch, file, shell, environment, app-launch, or
navigation primitive. The main process permits fixed health and pairing
requests. Its Ed25519 private key remains in main-process memory and never
crosses IPC.

### Shared contracts

`packages/shared` is browser-safe and contains API, device, capability,
application, workspace, tool, risk, policy, gesture, and security contracts.
`packages/config` validates separate API, web, and Mac-agent environments.

### Governance domain

### Integration domain

Phase 6 adds an owner-scoped integration registry for engineering tools. The
registry stores connector descriptors, capability metadata, explicit
permissions, health snapshots, usage counters, and operation requests. It does
not treat installed connectors as authority. A request must still pass
authentication, CSRF/trusted-origin checks for mutations, exact capability
permission, declared operation validation, policy/approval requirements, and
audit recording.

The first connector set covers GitHub, Jira, Slack, Notion, VS Code, GitHub
Actions, and Vercel as governed descriptors. Live third-party API adapters and
credential exchange are intentionally deferred until they can be added as small,
operation-specific, schema-validated components that never expose credential
values.

### Multi-agent domain

Phase 7 adds specialist engineering agents as deterministic owner-scoped
coordination records. Agents can be assigned tasks, exchange immutable
structured messages, share versioned context, open consensus records, and expose
health and metrics. They cannot execute code, approve patches, mutate files,
call integrations, or bypass the workflow, policy, approval, audit, emergency
stop, and validation layers.

### Cognitive memory domain

Phase 8 adds owner-scoped structured memory, knowledge graph records,
engineering decisions, repository memory, agent memory, learning events,
advisory suggestions, and a cognitive timeline. Memory records carry source,
confidence, version, and evidence. They may inform repository reasoning and
future workflow planning, but they never grant permissions or trigger actions.

The memory domain is injected as `MemoryIndexerService` over a `MemoryStore`.
Production uses PostgreSQL tables created by
`0011_phase_8_cognitive_memory.sql`; tests and explicit development mode may
use the in-memory adapter. The first retrieval implementation is deterministic
lexical/evidence ranking and does not call an external AI or embedding provider.

### Intelligence infrastructure domain

Phase 9 adds infrastructure services under the memory layer without redesigning
agents, workflows, approvals, or UI flows. `RedisService` provides namespaced
cache, lock, and pub/sub primitives for Upstash REST or standard Redis.
`CacheService` records cache metrics and invalidation events. `EmbeddingService`
creates bounded embedding jobs and calls the OpenAI Embeddings API only when a
server-side key is configured. `RetrievalService` performs owner-scoped hybrid
memory search using keyword, vector/fallback similarity, recency, importance,
and confidence. `InfrastructureMetricsService` exposes safe health summaries for
the dashboard.

PostgreSQL remains the source of truth. Migration
`0012_phase_9_intelligence_infrastructure.sql` enables pgvector and adds durable
tables for embedding jobs, worker jobs/history, retrieval logs, cache events,
queue events, and infrastructure metrics.

`GovernanceStore` is independent from `IdentityStore`. Its in-memory adapter
owns applications, workspaces, built-in tool metadata, approval requests,
policy evaluations, and emergency-stop state. Registry, approval, risk, and
policy services remain separate and are injected through `buildApi`.

Application and workspace paths are metadata only. The API performs lexical
validation but does not inspect the filesystem or discover applications.
Built-in tools are source-controlled and have no function pointers or handlers.

## Future components

- Authentication service and revocable owner sessions.
- Device registry and key-pair-based device identity.
- Tailscale private-network verification.
- Persistent adapters for identity and governance interfaces.
- Append-only audit log and memory service.
- AI planner with structured output only.
- Mac-agent and browser-automation runtimes.
- Integration adapters.
- Local gesture and voice engines.
- Android owner application.

Authentication, device identity, verification-only signing, governance
registries, policy/approval evaluation, and development audit records are now
implemented. Production persistence, Tailscale verification, recent
authentication, and every executor remain future.

## Future application resolution

```text
AI proposes applicationId
        ↓
Policy engine verifies applicationId
        ↓
Mac agent resolves trusted bundle ID
        ↓
Approved operation executes
```

The model never supplies an executable path. Password managers, banking apps,
macOS Keychain, authentication-code apps, and security settings are examples of
applications that should remain disabled.

## Future workspace protection

Workspaces start with every permission false. Before any filesystem access,
later phases must defend against path traversal, symbolic-link escape,
case-insensitive bypasses, Unicode-normalisation issues, hidden and credential
files, and access outside registered roots. Blocked patterns include `.env`,
`.env.*`, `*.pem`, `*.key`, `.ssh/`, `.aws/`, `.npmrc`, `.pypirc`,
`credentials.json`, `service-account*.json`, `Library/Keychains/`, and
`Library/Application Support/*password*`.

## Registered tool rule

The AI may only select a registered tool by name and provide schema-valid
arguments. It cannot create tools, invent capabilities, or bypass approval.
The current built-in catalogue includes governance tools and metadata-only
future operations such as `app.open`, `workspace.read_file`, `git.status`, and
`git.push`. Execution-oriented definitions are disabled. No execution exists.

# Phase 2.3 extension

Phase 2.3 keeps identity, governance, and security-state persistence behind
separate store interfaces. Production selects their PostgreSQL adapters and
fails if migrations or the default-active security state cannot be read.
Tailscale connectivity, HTTP/TLS, session authentication, device signatures,
network verification, policy, and recent-auth approval remain independent.
Phase 3.1 adds a separate read-only execution domain and a fixed Mac
dispatcher. It is not a general executor: only source-controlled read-only
handlers exist, while privileged and write execution remain unavailable.

# Phase 4.1 repository intelligence

Phase 4.1 adds repository intelligence as a metadata-only layer above the
existing signed read-only execution pipeline. Repository APIs read cached
owner-scoped metadata generations. Only the fixed Mac-agent
`repository.scan_metadata` capability traverses registered workspace metadata,
and it persists no source contents, absolute host paths, shell commands, Git
mutations, or application control. See
[repository intelligence](repository-intelligence.md).

# Phase 10 engineering advisor

Phase 10 adds an advisory strategic-intelligence domain. It reuses repository
intelligence, semantic intelligence, workflows, multi-agent context, cognitive
memory, and audit logging to maintain engineering goals, recommendations,
health records, risks, debt, roadmaps, release assessments, and scenario
simulations.

The advisor has no execution dependency. It does not create patches, run
validation, call integrations, approve workflows, deploy, inspect files
directly, invoke shell commands, or control macOS. Its records can inform a
later owner-approved workflow, but they are not authority by themselves.

See [engineering advisor](engineering-advisor.md).

# Phase 10.5 dynamic agent workforce

Phase 10.5 adds an Agent Factory beside the existing Agent Registry. Built-in
agents remain unchanged. The factory analyses workflow goals, maps them to
capabilities, reuses existing specialists where possible, and creates temporary
dynamic agents from templates or synthesized specialist descriptions when a
capability gap exists.

Dynamic agents are persisted and also registered into the existing agent
collaboration substrate so they can receive tasks, send messages, participate in
consensus, and appear in health/metrics views. They inherit the existing agent
permission model and cannot execute, approve, patch, deploy, install tools, or
modify permissions.

See [dynamic agent workforce](dynamic-agent-workforce.md).

# Phase 10.6 Agent OS

Phase 10.6 adds a common Agent Operating System below both permanent and
dynamic agents. It preserves the Phase 7 collaboration model and Phase 10.5
Agent Factory, but standardizes every agent as a manifest-backed, packageable,
versioned runtime component.

The API now persists Agent OS manifests, packages, runtime configurations,
permission profiles, tool-registry references, knowledge sources, sessions,
runtime events, health, metrics, versions, and context packages. Agents use
permission profiles and tool references instead of defining ad hoc permissions
or embedding tool logic.

Starting an Agent OS session builds bounded, owner-scoped context from
registered repositories, cognitive memory, engineering decisions, declared
knowledge sources, and capability references. It records a replayable session
and runtime events. It does not execute commands, run tools, apply patches,
approve workflows, call integrations, deploy, or bypass policy.

See [Agent OS](agent-os.md).

# Phase 10.7 cognitive agent architecture

Phase 10.7 adds persistent cognition to every Agent OS agent without changing
the Agent OS runtime contract. The cognitive layer stores per-agent working,
episodic, semantic, and procedural memory; memory relationships; experiences;
decision logs; specialization profiles; reflection reports; confidence history;
goal tracking; cognitive state; learning events; consolidation records; and
cognitive metrics.

The service reuses Agent OS for agent identity and uses the existing Phase 8
Cognitive Memory Engine for broader owner-scoped decisions and knowledge graph
context. Reasoning and reflection are explicit records. They are not authority
to execute work.

See [agent cognition](agent-cognition.md).

# Phase 10.8 autonomous agent evolution

Phase 10.8 adds an advisory evolution layer above Agent OS and agent cognition.
It measures expertise growth, capability usage, prompt/reasoning quality,
workflow patterns, knowledge quality, success/failure history, benchmarks, and
self-evaluation results.

The evolution service writes owner-scoped records and creates proposals with
evidence, impact, confidence, risk, rollback plans, and `requiresApproval:
true`. Proposals are not applied automatically. They do not update Agent OS
manifests, packages, prompts, capabilities, tools, permission profiles,
workflows, patches, validations, integrations, files, deployments, or
governance state.

See [agent evolution](agent-evolution.md).

# Phase 10.9 Agent Society

Phase 10.9 adds an organizational-intelligence layer above the existing
multi-agent, Agent OS, cognition, and evolution services. It records
organizations, departments, roles, teams, team membership, communications,
debates, consensus sessions, meetings, reputation scores, collaboration edges,
organizational metrics, and organizational memory.

The society service models leadership, delegation, collective planning,
challenge, consensus, peer review, mentorship, workload balancing, and
organizational health as observable records. These records are coordination and
decision-support data only. They do not grant permissions, approve work, execute
tools, apply patches, run validations, call integrations, deploy, or bypass
policy.

See [agent society](agent-society.md).

# Phase 11 Intent & Execution Engine

Phase 11 adds a universal command layer above the existing planning,
workflow, integration, validation, patch, agent, and organizational systems. It
accepts natural-language owner requests and persists structured intent
analysis, internal commands, execution plans, execution steps, clarification
sessions, command history, reusable saved commands, macros, command templates,
metrics, and suggestions.

The engine is the primary command entry point, but it is not a privileged
executor. It classifies safety, identifies required permissions and
capabilities, asks clarification questions when confidence is low, and creates
inspectable plans. Moderate-risk and higher requests wait for approval, and
high-risk or critical requests require recent authentication before any future
execution path can proceed.

Execution routing is provider-based and always flows through existing
subsystems such as Agent Society, Workflow Engine, read-only execution,
integration registry, validation, or manual owner handling. Provider-specific
policy, approval, network, trusted-device, workspace, signing, rollback, and
audit requirements remain independently enforceable.

See [intent and execution engine](intent-execution-engine.md).

# Phase 12 Autonomous Task Engine

Phase 12 adds persistent proactive coordination above the Intent & Execution
Engine. It records tasks, task runs, schedules, triggers, conditions,
dependencies, notifications, long-term goals, checklists, checklist items,
routines, background monitors, metrics, and task suggestions.

Tasks can represent one-time work, recurring routines, reminders, background
monitors, condition watches, automations, pipelines, and long-running projects.
The scheduling model stores time zones, previews, quiet-hour and blackout-period
structures, and future extensibility for cron, business days, and external event
sources.

The task engine does not execute actions directly. A safe triggered task is
routed into the Phase 11 Intent Engine as a `scheduled_task` source, producing
normal command, intent, plan, history, and audit records. Approval-required
tasks create waiting-approval run records instead of routing. Provider
execution remains responsible for policy, recent authentication, private
network, trusted device, rollback, and audit enforcement.

See [autonomous task engine](autonomous-task-engine.md).

# Phase 13 Desktop Capability Layer

Phase 13 adds a governed desktop-capability subsystem below future operating
system integrations. It records owner-scoped desktop capabilities, capability
providers, metadata-only desktop context, application metadata, window layout
records, clipboard summaries, action history, metrics, and preferences.

The architecture separates capability contracts from providers. A registered
capability is only a typed boundary; it does not imply an executable provider is
installed. The baseline `desktop_metadata_provider` can serve safe metadata
records, while the `mac_agent_desktop_provider` is explicitly unavailable until
a reviewed macOS provider exists.

All desktop requests pass through explicit API routes, shared Zod schemas,
trusted-origin and CSRF checks for browser mutations, store-backed action
records, and governance audit events. There is no generic executor, shell,
unrestricted AppleScript bridge, raw Accessibility bridge, or direct renderer
IPC surface for OS control.

See [desktop capability layer](desktop-capability-layer.md).

# Phase 14 Spatial Interaction System

Phase 14 adds a governed spatial input subsystem above the Phase 11 Intent
Engine and Phase 13 Desktop Capability Layer. It records camera-device
metadata, vision sessions, pipeline stages, gesture profiles, gesture mappings,
macros, calibration, custom gestures, versions, gesture history, gesture
metrics, and tracking metrics.

The spatial layer does not execute gestures directly. A confirmed mapped
gesture is converted into an Intent Engine command with `source: "gesture"`.
That command then follows the existing safety classification, planning,
approval, recent-authentication, policy, trusted-device, private-network, task,
workflow, desktop capability, and audit path.

The current provider state is conservative: camera permission is not requested,
raw frames are not persisted, local-only processing is declared, and direct OS
control remains unavailable. Future camera/landmark providers must provide
bounded structured recognition events rather than raw frame access to agents or
backend services.

See [spatial interaction system](spatial-interaction-system.md).
