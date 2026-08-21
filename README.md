# Alexa Control

Alexa Control is a private, owner-operated engineering assistant platform. It
combines identity, governance, constrained execution, repository intelligence,
human-approved code editing, validation workflows, autonomous workflow
coordination, and governed engineering-tool integrations. It authenticates one
owner, pairs public-key devices, evaluates deterministic policy, and keeps
consequential work behind explicit approvals.

## Current contents

- A React/Vite owner dashboard with authentication, device management,
  application/workspace registries, policy simulation, approvals, audit events,
  and real API health.
- A Fastify API with liveness, readiness, status, and emergency-stop endpoints.
- Argon2id password authentication and hashed opaque-cookie sessions.
- One-time pairing codes, local Ed25519 key generation, public-key
  fingerprints, signed-request verification, and replay rejection.
- PostgreSQL adapters for identity, governance, replay nonces, audit, approvals,
  security state, recent authentication, and recovery-code hashes. In-memory
  adapters remain explicit development/test options.
- A separate governance store, trusted built-in tool registry, deterministic
  risk/policy engines, canonical action digests, and expiring approvals.
- A sandboxed Electron Mac-agent shell with a macOS Keychain-backed encrypted
  Ed25519 identity and narrow, schema-validated IPC.
- A Tailscale verifier using direct Tailscale addresses plus LocalAPI identity,
  or identity headers only behind an explicitly trusted loopback Serve proxy.
- Session-bound CSRF tokens, idle and absolute session expiry, recent password
  authentication, one-time recovery codes, secure production cookies, exact
  origins/hosts, security headers, and log redaction.
- Browser-safe Zod contracts for future devices, capabilities, registries,
  tools, policies, gestures, and API messages.
- Phase 3.2 read-only hardening: pairing-time server-key pinning, signed
  heartbeats, cancellation hints, explicit retention cleanup, owner-visible
  provenance/export controls, workspace-mapping confirmation, and richer
  structured Git summaries.
- Phase 4.1 repository intelligence: metadata-only repository indexing,
  generation-aware file inventory, directory tree, statistics, technology
  detection, and metadata search for registered workspaces.
- Phase 4.2 semantic code intelligence: TypeScript/JavaScript AST-based symbols,
  references, imports, exports, dependency graphs, API route hints, database
  model hints, architecture graphs, and repository insights.
- Phase 4.3 AI software engineer: read-only, evidence-cited repository Q&A,
  impact analysis, implementation planning, code review, architecture advice,
  documentation generation, and short-term investigation memory.
- Phase 5.1 human-in-the-loop code editing: explicit patch proposals, diff
  preview, owner approval, signed trusted Mac-agent patch execution, bounded
  rollback snapshots, and execution history.
- Phase 5.2 verified code validation: immutable validation profiles, signed
  trusted Mac-agent execution, temporary workspace sandboxes, bounded logs,
  result classification, cancellation, and validation history.
- Phase 5.3 autonomous development workflows: persistent engineering workflow
  plans, dependency-aware task timelines, approval checkpoints, artifact links,
  pause/resume/cancel controls, and completion reports.
- Phase 6 engineering integrations: built-in connector descriptors for GitHub,
  Jira, Slack, Notion, VS Code, GitHub Actions, and Vercel with owner-scoped
  capability permissions, health snapshots, usage tracking, operation requests,
  audit events, and PostgreSQL persistence.
- Phase 7 multi-agent engineering: built-in specialist agents, structured task
  assignments, immutable agent messages, shared context, consensus records,
  health, metrics, dashboard, and PostgreSQL persistence.
- Phase 7.5 futuristic command center UI: dark glass operating-system shell,
  holographic Three.js home scene, animated Earth, command rings, floating
  telemetry panels, Lucide navigation rail, command bar, context sidebar,
  telemetry bar, motion system, and centralized design tokens.
- Phase 8 cognitive memory: owner-scoped structured memories, evidence-backed
  engineering decisions, repository and agent memory summaries, knowledge graph
  nodes/edges, learning events, advisory suggestions, cognitive timeline,
  Memory Center dashboard, and PostgreSQL persistence.
- Phase 9 intelligence infrastructure: Redis-backed hot cache and coordination,
  pgvector-ready embeddings, OpenAI embedding boundary, hybrid retrieval,
  infrastructure status APIs, worker queue metrics, and Infrastructure dashboard.
- Phase 10 engineering advisor: persistent engineering goals, strategic plans,
  recommendations, repository and architecture health, risk analysis, technical
  debt tracking, release readiness, scenario simulation, roadmap records, and an
  Advisor dashboard. All outputs are advisory only.
- Phase 10.5 dynamic agent workforce: agent templates, capability registry,
  capability-gap analysis, dynamic specialist creation, team composition,
  lifecycle archival, performance records, promotion recommendations, and
  Adaptive Workforce controls on the Agents page.
- Phase 10.6 Agent OS: manifest-backed agents, package records, runtime
  configuration, scoped knowledge sources, tool registry references, permission
  profiles, replayable sessions, runtime events, health, metrics, version
  records, and Agent OS controls on the Agents page.
- Phase 10.7 cognitive agent architecture: per-agent working, episodic,
  semantic, and procedural memory; reasoning traces; reflection reports;
  confidence history; experience records; specialization profiles; cognitive
  states; goal tracking; consolidation records; and cognitive controls in the
  Memory Center.
- Phase 10.8 autonomous agent evolution: evidence-backed expertise profiles,
  capability marketplace records, success/failure analysis, benchmarks,
  self-evaluations, evolution timelines, and approval-required improvement
  proposals in the Memory Center.
- Phase 10.9 agent society: organizational departments, roles, task forces,
  structured communications, debates, consensus sessions, meetings, reputation,
  collaboration graph records, organizational memory, and health analytics on
  the Agents page.
- Phase 11 intent and execution engine: natural-language command parsing,
  structured goals, safety classification, inspectable execution plans,
  clarification sessions, command history, reusable commands, macros,
  suggestions, and a Command Center dashboard. It routes only through existing
  governed systems.
- Phase 12 autonomous task engine: persistent scheduled tasks, recurring
  routines, reminders, lightweight monitors, condition records, goals,
  checklists, notifications, task runs, analytics, proactive suggestions, and a
  Task Center dashboard. Proactive work remains approval-gated and advisory
  until routed through existing governed execution systems.
- Phase 13 desktop capability layer: owner-scoped desktop capability contracts,
  provider health, metadata-only desktop context, application metadata,
  clipboard/layout/action history, metrics, preferences, Desktop Control Center,
  and PostgreSQL persistence. OS-affecting providers remain unavailable until a
  reviewed provider is installed; no generic executor exists.
- Phase 14 spatial interaction system: camera-inventory contracts, vision
  pipeline stages, gesture profiles, gesture-to-intent mappings, macros,
  calibration, custom gestures, tracking metrics, gesture history, and a
  Gesture Lab dashboard. Gestures route through the Intent Engine and never
  directly control the operating system.
- Phase 14A browser spatial runtime: browser-only camera permission, local
  MediaPipe hand tracking, gesture recognition, virtual cursor HUD, dashboard
  gesture navigation, and governed gesture event submission. Camera frames stay
  in the browser; no OS control is introduced.
- Phase 14B native spatial runtime: Electron-based local hand tracking for the
  Mac agent, signed-device gesture submission, native runtime metadata,
  provider/session/sync health, and dashboard visibility. Native gestures become
  intents and never directly move the mouse, press keys, launch apps, or bypass
  the Desktop Capability Layer.
- Phase 14C spatial UI framework: reusable React spatial primitives, global
  focus/hit-testing, hover/selection/activation states, framework diagnostics,
  and bounded interaction telemetry. Spatial UI remains additive and does not
  grant execution authority.
- Phase 14D spatial interaction engine: dashboard-only spatial cursor physics,
  hand rays, target prediction, dwell progress, gesture sequence metadata,
  physics profiles, and Gesture Lab diagnostics. It does not control macOS or
  invoke desktop capabilities directly.
- Phase 14E spatial desktop layer: desktop object registry, gesture-targetable
  application/window/dock/panel metadata, desktop interaction profiles, overlay
  settings, spatial dock records, navigation history, and governed interaction
  requests routed through the Desktop Capability Layer. It still does not expose
  raw mouse, keyboard, AppleScript, Accessibility, shell, or direct macOS
  automation.
- Phase 14F spatial command space: optional Spatial Mode, persisted 3D scene
  metadata, themes, visualization layers, particle profiles, spatial mode
  sessions, and a holographic command-space UI with central AI core, agent
  constellation, workflow galaxy, knowledge universe, floating panels, and
  spatial cursor/ray overlays. It remains visualization-only unless actions are
  routed through existing governed systems.
- Phase 14.4 persistent spatial runtime overlay: browser hand tracking now lives
  at the authenticated app shell instead of inside Gesture Lab. Once started, it
  survives dashboard navigation, exposes a draggable floating control panel,
  renders cross-page skeleton/ray/cursor HUD layers, and releases the camera only
  when paused, stopped, permission is revoked, or the user logs out.
- Phase 15A voice operating system: persistent browser voice runtime, explicit
  microphone permission, local browser speech recognition/synthesis providers,
  wake-word activation, interruption handling, voice profiles, shortcuts,
  conversation timeline, Voice Center dashboard, bounded voice metadata APIs,
  PostgreSQL persistence, and transcript-to-Intent routing. Raw microphone audio
  is not stored by default, and voice cannot authenticate or approve work.
- Phase 15B conversational intelligence: conversation sessions, dialogue topics,
  goals, clarification history, summaries, personas, context snapshots,
  analytics, bookmarks, Conversation Center dashboard, and ambiguity handling
  that asks targeted clarifying questions instead of guessing. Conversation
  intelligence never exposes hidden reasoning or bypasses governed intent
  routing.
- Phase 16 intent recording and demonstration learning: Command Studio records
  semantic capability-level events, synthesizes reusable workflow templates,
  infers parameters, creates review-required generated commands, tracks versions
  and analytics, and publishes commands only after explicit user review. It is
  not a raw mouse, keyboard, camera, audio, or pixel macro recorder.
- Phase 16A deterministic voice navigation: the persistent Voice Runtime now
  handles common dashboard commands locally through semantic page metadata and
  the existing Spatial UI registry. “Alexa” opens a continuous navigation
  session, commands such as “Open Commands,” “Create command,” “Scroll down,”
  and “Click Save” avoid AI escalation when confidently matched, and misses fall
  back to the Intent Engine.
- Phase 16B semantic retrieval engine: commands, pages, aliases, synonyms,
  shortcuts, capabilities, planner skills, and future plugins can register in a
  unified Semantic Registry. Requests resolve through exact, alias, synonym,
  lexical/semantic ranking, confidence scoring, Redis retrieval cache, and
  pgvector-ready embedding metadata before AI fallback is considered.
- Phase 17A semantic desktop model: trusted applications, windows, controls,
  hierarchy relationships, semantic events, accessibility snapshot metadata, and
  current desktop context are represented as deterministic read-only objects in
  the Desktop Control Center. Native Accessibility is preferred but remains
  unavailable until a reviewed provider is installed; no AI, OCR, pixels, or OS
  control are required for registered semantic metadata.
- Phase 17B semantic desktop navigation engine: the assistant can build a
  deterministic navigation graph over registered semantic desktop objects,
  preview/highlight targets, move semantic focus, and maintain focus/navigation
  history without clicking, typing, activating controls, editing, or mutating
  application state.
- Phase 17C semantic interaction engine: trusted desktop and browser controls
  can be resolved, validated, previewed, capability-routed, verified, and
  audited as semantic objects. The engine supports deterministic click, focus,
  selection, form, dropdown, checkbox/radio, dialog, menu, table, and tree
  interaction contracts while refusing pixels, OCR, computer vision, raw
  coordinates, raw mouse/keyboard streams, unknown targets, ambiguous matches,
  untrusted apps, and unavailable providers.
- Phase 17D demonstration learning engine: users can teach reusable skills
  through semantic programming by demonstration. Recordings capture high-level
  events such as application focus, semantic interaction, field update,
  dropdown selection, wait condition, capability invocation, planner action,
  voice, and gesture events; they never store mouse coordinates, pixels, raw
  screenshots, raw keyboard streams, secure text, camera frames, or audio. The
  system generates review-required semantic workflow timelines, parameters,
  validations, and Skill Registry entries.
- Phase 17E universal application adapter framework: trusted macOS and browser
  applications can register a common semantic adapter surface for discovery,
  capabilities, profiles, permissions, lifecycle events, context, diagnostics,
  synchronization, metrics, optional plugins, and Application Center controls.
  The framework accepts registered application IDs only, never caller-supplied
  executable paths, and refuses untrusted applications, pixel automation, OCR,
  computer vision, coordinate replay, shell, AppleScript, code injection, and
  unrestricted Accessibility.
- Phase 17F autonomous desktop skills engine: approved demonstrated skills and
  trusted application adapter capabilities can be orchestrated into
  deterministic desktop workflow graphs with goal resolution, dependencies,
  context preservation, approval checkpoints, semantic verification, recovery
  suggestions, pause/resume/cancel controls, metrics, audit records, and Desktop
  Skills Center visibility. It composes existing semantic skills and never uses
  pixels, OCR, computer vision, coordinate replay, hidden capabilities, shell,
  AppleScript, or direct OS APIs.
- Phase 17G reviewed native provider runtime: finite native provider
  descriptors, validation, health, diagnostics, approved terminal commands,
  capability dispatch, verification, audit, and Application Trust Center /
  Capability Explorer surfaces now bridge the semantic desktop architecture
  toward macOS execution. Providers remain disabled until reviewed native host
  health is available and never expose arbitrary AppleScript, shell, scripts,
  keyboard/mouse replay, coordinate clicking, OCR, screenshots, unrestricted
  Accessibility, or untrusted application control.
- Phase 17H reviewed native provider implementations: the existing Electron Mac
  Agent now hosts finite real provider implementations where Node/Electron can
  do so safely. VS Code, Finder, Chrome, Safari, and Terminal support reviewed
  launch/focus primitives, Chrome/Safari support reviewed HTTP(S) URL opening,
  and Finder supports Mac-Agent-owned Downloads/Desktop focus. Deeper app
  actions that require Accessibility or app-specific bridges fail closed with a
  structured `REVIEWED_BRIDGE_REQUIRED` result. No Swift bridge has been added
  because the implemented subset does not require one.
- Phase 17I trusted native execution transport: native provider capability
  requests now reuse the existing signed Mac Agent execution channel. The
  backend queues finite `native.provider_capability` requests, the trusted Mac
  Agent verifies server-signed envelopes, dispatches the Provider Host, verifies
  provider results, and returns device-signed completion records. No second
  transport, generic native executor, shell, AppleScript, raw Accessibility,
  keyboard/mouse replay, OCR, screenshots, or coordinate automation is added.
- Phase 18A universal application intelligence: the Planner-facing layer now
  resolves semantic capabilities such as `CodeEditing.OpenFile`,
  `Browser.OpenUrl`, and `NoteTaking.CreateNote` to trusted application
  providers using deterministic provider selection. Applications become
  interchangeable providers, while execution remains governed by existing
  adapter/provider validation, permissions, approval, audit, emergency stop, and
  trusted native transport boundaries.
- Phase 18B semantic workspace intelligence: trusted applications can expose
  bounded semantic content objects such as workspaces, files, functions, notes,
  browser tabs, folders, and relationships. The new `/semantic-workspace`
  explorer and workspace intelligence APIs support deterministic semantic search,
  context tracking, navigation history, and workspace memory without pixels,
  OCR, screenshots, raw Accessibility dumps, or application content scraping.
- Phase 18C deep semantic indexers: reviewed provider-specific indexers now
  register deep content sources, incremental index sessions, semantic events,
  fingerprints, object versions, relationship updates, health, and search
  statistics. The Semantic Workspace Explorer shows indexer coverage and can
  request bounded incremental syncs. Content understanding must come from
  official app APIs, reviewed native providers, or reviewed app extensions such
  as a VS Code semantic extension; UI scraping, OCR, screenshots, unrestricted
  Accessibility traversal, generic filesystem crawling, shell, and scripts stay
  unavailable.
- Phase 18D universal application adapter SDK: future adapters can install into
  the existing Universal Application Adapter Framework through reviewed SDK
  contracts that reference current adapter instances, provider dependencies,
  semantic domains, capabilities, object types, lifecycle state, sandbox
  boundaries, compatibility checks, usage, and diagnostics. The Adapter
  Management Center surfaces these contracts without duplicating provider
  registries, capability registries, semantic object models, or native transport
  layers.
- Phase 18E core application adapter suite: VS Code, Finder, Chrome, Safari,
  Terminal, Apple Notes, Calendar, and Reminders now expose reviewed semantic
  adapter capability surfaces through the existing SDK. Native-backed operations
  map to existing reviewed provider capabilities where available; official
  API/extension-dependent operations fail closed until those reviewed
  integrations are connected. The Application Management Center shows core
  adapter health, permissions, context snapshots, sessions, usage, recent
  actions, and semantic capability coverage.
- Phase 18F cross-application workflow orchestration: user outcomes can now be
  composed into deterministic multi-application workflow DAGs. The Workflow
  Operations Center shows graph nodes, dependencies, variables, checkpoints,
  recovery suggestions, execution history, and metrics. Execution routes through
  existing semantic core adapters and reviewed provider transport only.
- Phase 19B personal knowledge graph and world model: owner-scoped entities,
  aliases, relationships, facts, evidence, conflicts, graph events, and memory
  promotions now live in PostgreSQL-backed graph tables. Human Understanding
  receives bounded graph context before Planner dispatch, Knowledge Graph Studio
  exposes search/context/conflict inspection, and developer tooling can validate,
  search, inspect paths, and promote durable memories without creating another
  graph database, vector database, memory system, planner, or executor.
- Phase 19C personal learning engine: owner-scoped structured learning events,
  evidence accumulation, candidates, learned preferences, category policies,
  scoped aliases, style/application/workflow/agent preference learning,
  sequence and habit detection, suggestions with cooldowns, explanations,
  private-mode exclusions, PostgreSQL persistence, and authenticated Learning
  APIs. Learning remains deterministic, reversible, and unable to authorize
  execution.
- Phase 19D Memory Studio: a unified cognitive data control center with
  `CognitiveItem` read-model search, item inspection, why/how explanations,
  provenance, usage history, retention controls, archive/pin metadata,
  fail-closed delete impact previews, merge/reindex previews, conflict and stale
  queues, embedding metadata inspection, context preview, export, CLI tooling,
  and PostgreSQL persistence for Studio controls.
- Environment validation and security, network, architecture, and roadmap
  documentation.

## Safety boundary

Only fixed bounded workspace, Git, repository-metadata, approved-patch,
validation-profile, workflow, integration-registry, and agent-coordination
capabilities may execute. Generic privileged execution remains disabled. There
is no generic shell endpoint, caller-selected command, arbitrary filesystem
endpoint, application launcher, browser automation, AI provider, camera,
microphone, screen capture, or operating-system input control. Phase 6 connector
descriptors do not perform live third-party mutations or expose credential
values. Phase 7 agents coordinate and review work; they do not gain independent
execution authority. Phase 17E adapters expose semantic trusted-application
metadata and governed capability surfaces only; native app control remains
unavailable until reviewed providers route through the Desktop Capability Layer.
Phase 17F desktop skills orchestrate approved semantic workflows only; they do
not grant new execution authority, bypass approvals, or modify skills
automatically. Phase 17G native providers may dispatch finite reviewed
capabilities only and fail closed until provider validation and health pass.
Phase 17H provider implementations live inside the existing Mac Agent and use
fixed provider-owned native operations only; API dispatch no longer reports
placeholder success when the real Mac Agent provider-host transport is absent.
Phase 18A Application Intelligence resolves semantic capabilities to candidate
trusted providers only; it does not execute actions, grant permissions, bypass
provider validation, or expose generic app automation.
Phase 18B Workspace Intelligence indexes and searches bounded semantic content
metadata only; it does not scrape unsupported app content, expose secrets, or
execute navigation/manipulation by itself.
Phase 18C Deep Semantic Indexers may enrich that workspace graph only through
official APIs, reviewed native providers, or reviewed application extensions.
Indexer sync records, event logs, fingerprints, versions, and relationship
updates remain metadata/audit surfaces; they do not grant authority to control
applications or inspect unsupported content.
Phase 18D Adapter SDK contracts standardize future adapter integration only.
They do not add application-specific Planner logic, generic execution, raw UI
automation, unrestricted OS APIs, or a second provider/capability/transport
registry.
Phase 18E Core Adapters expose production semantic surfaces only through the
existing SDK/provider/runtime boundaries. They do not scrape app UIs, run
unapproved shell commands, bypass approvals, or invent application-specific
Planner behavior.
Phase 18F Cross-Application Workflows compose outcomes into deterministic DAGs
only. They do not add a new Planner, provider system, execution transport,
generic application automation, AI-based normal workflow reasoning, or approval
bypass. Nodes execute through existing reviewed semantic capabilities and fail
closed when trust, permissions, provider health, or reviewed integrations are
missing.
Phase 19B Personal Knowledge Graph stores structured world-model context in
PostgreSQL only. It does not replace Memory, create a separate graph/vector
database, execute actions, resolve approvals, or treat vector similarity as
authority. Graph context may inform Human Understanding and Planner input, but
execution still requires existing provider, policy, approval, trusted-device,
and emergency-stop checks.
Phase 19C Learning Engine output is evidence-backed, owner-scoped advisory
preference context only. It cannot approve work, grant permissions, mutate
trusted devices, bypass private-mode exclusions, or authorize execution.
Phase 19D Memory Studio is a read-model and control surface over existing
cognitive stores. Archive, pin, retention, explanation, context preview, export,
merge preview, and delete impact preview do not grant execution authority, do
not expose raw vectors or hidden reasoning, and do not permit permanent
deletion.

Production requires PostgreSQL and a real Tailscale verifier; it never falls
back to memory. Emergency stop starts active. Policy `allow` means
only that a proposal passed governance; `executionAllowed` is always false.
Memory suggestions are recommendations only and never perform autonomous
actions. Engineering Advisor recommendations, goals, roadmaps, simulations, and
release assessments are also advisory only and never approve, execute, patch, or
deploy work. Dynamic agents inherit the existing agent permission boundary; they
cannot create agents, escalate privileges, approve work, execute commands,
modify files, call integrations, or deploy.
Voice input is an interaction source only: speech is transcribed into bounded
metadata and routed through the Intent Engine, Planner, policy, approval, audit,
and emergency-stop systems. It cannot authenticate users, approve privileged
actions, or bypass existing execution boundaries.
Conversation personas, summaries, goals, and clarifications are context records
only. They do not grant authority and cannot execute, approve, or change policy.
Intent recordings are semantic demonstrations only. They do not store raw
mouse paths, unrestricted keyboard streams, pixels, camera frames, microphone
audio, passwords, tokens, cookies, authentication codes, or secrets. Generated
commands remain inert until reviewed and saved, and saved commands still route
through the Intent Engine and governance model.
Deterministic voice navigation can navigate and activate registered dashboard UI
controls only. It cannot approve work, inspect arbitrary DOM text as authority,
control macOS, execute desktop capabilities, or bypass Intent Engine fallback
for complex requests.
Agent OS manifests, packages, sessions, tools, and knowledge sources describe
runtime identity and context only; they do not grant execution authority or
bypass the existing approval system.
Agent cognition records memory, reasoning, confidence, reflection, and learning
only. It never performs autonomous actions or changes governance.
Agent evolution measures growth and proposes improvements only. It cannot
change prompts, capabilities, tools, packages, permissions, approvals,
workflows, files, integrations, or deployments automatically.
Agent Society coordinates specialists as an organization only. Leadership,
debate, reputation, and consensus records cannot grant permissions, approve
work, execute tools, apply patches, run validations, call integrations, or
deploy.
The Intent & Execution Engine converts natural-language requests into
structured commands and plans only. It cannot execute shell text, infer
permissions from wording, skip clarification, bypass approvals, or route around
the existing policy, execution, workflow, integration, validation, or audit
systems.
The Autonomous Task Engine can schedule, monitor, remind, and queue governed
runs. It cannot silently execute actions, approve work, call integrations,
modify files, run validations, launch apps, or bypass the Intent Engine,
policy, recent authentication, trusted-device checks, private networking,
emergency stop, or audit logging.
The Desktop Capability Layer registers explicit desktop capability contracts
and provider boundaries only. It cannot launch applications, inject keyboard or
mouse input, run shell text, execute AppleScript, expose unrestricted
Accessibility, read or write arbitrary files, automate browsers, access camera
or microphone devices, or treat a registered application/workspace as authority.
Unreviewed providers are unavailable and fail closed.
The Spatial Interaction System treats hands/body movement as an input source,
not authority. It does not request camera permission by default, never persists
raw frames, never sends frames to agents, never approves high-risk actions, and
never directly controls the desktop. Confirmed mapped gestures become ordinary
Intent Engine commands with `source: "gesture"`.

## Start

Requirements: Node.js 22 or newer and pnpm 11.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mac-agent/.env.example apps/mac-agent/.env
pnpm dev
```

To enable read-only execution, apply migrations, set
`READ_ONLY_EXECUTION_ENABLED=true`, configure a persistent server signing-key
path, register an enabled workspace with read/Git permissions, pair a trusted
Mac so it stores the server public-key pin, and release emergency stop through
the recent-authenticated Security page. Existing development agents may still
use `ALEXA_SERVER_EXECUTION_PUBLIC_KEY` as a fallback pin. See
[read-only execution](docs/read-only-execution.md).

See [development guidance](docs/development.md), the
[architecture](docs/architecture.md), and the [security model](docs/security.md)
plus the [identity protocol](docs/identity.md) before extending the platform.
Governance behavior is documented in [governance](docs/governance.md),
[policy-engine](docs/policy-engine.md), and [approvals](docs/approvals.md).
Command demonstration learning is documented in
[intent recording](docs/intent-recording.md).
The personal knowledge graph is documented in
[personal knowledge graph](docs/personal-knowledge-graph.md),
[knowledge entity model](docs/knowledge-entity-model.md),
[knowledge relationships](docs/knowledge-relationships.md),
[knowledge provenance](docs/knowledge-provenance.md),
[knowledge ingestion](docs/knowledge-ingestion.md),
[knowledge query engine](docs/knowledge-query-engine.md),
[knowledge conflicts](docs/knowledge-conflicts.md),
[Knowledge Graph Studio](docs/knowledge-graph-studio.md), and
[knowledge/memory integration](docs/knowledge-memory-integration.md).
Deterministic voice UI control is documented in
[voice navigation](docs/voice-navigation-engine.md).
Production operators should also read [private networking](docs/private-networking.md),
[deployment security](docs/deployment-security.md), and
[incident response](docs/incident-response.md).
Repository metadata behaviour is documented in
[repository intelligence](docs/repository-intelligence.md) and
[semantic code intelligence](docs/semantic-code-intelligence.md). The
read-only engineering reasoning layer is documented in
[AI software engineer](docs/ai-software-engineer.md).
Human-in-the-loop editing is documented in
[human-in-the-loop code editing](docs/human-in-the-loop-code-editing.md).
Verified code validation is documented in
[verified code validation](docs/verified-code-validation.md).
Autonomous workflow coordination is documented in
[autonomous development workflows](docs/autonomous-development-workflows.md).
Engineering integrations are documented in
[engineering integrations](docs/engineering-integrations.md).
Multi-agent coordination is documented in
[multi-agent engineering](docs/multi-agent-engineering.md).
The dashboard redesign is documented in
[command center UI](docs/command-center-ui.md).
Cognitive memory is documented in
[cognitive memory](docs/cognitive-memory.md).
Intelligence infrastructure is documented in
[intelligence infrastructure](docs/intelligence-infrastructure.md).
Strategic engineering intelligence is documented in
[engineering advisor](docs/engineering-advisor.md).
Dynamic agent generation is documented in
[dynamic agent workforce](docs/dynamic-agent-workforce.md).
Agent runtime contracts are documented in [Agent OS](docs/agent-os.md).
Per-agent cognition is documented in
[agent cognition](docs/agent-cognition.md).
Agent evolution is documented in
[agent evolution](docs/agent-evolution.md).
Agent Society is documented in [agent society](docs/agent-society.md).
The universal command system is documented in
[intent and execution engine](docs/intent-execution-engine.md).
Proactive scheduling and task coordination are documented in
[autonomous task engine](docs/autonomous-task-engine.md).
Desktop capability contracts are documented in
[desktop capability layer](docs/desktop-capability-layer.md).
Spatial interaction and gesture routing are documented in
[spatial interaction system](docs/spatial-interaction-system.md).
Native spatial runtime behavior is documented in
[native spatial runtime](docs/native-spatial-runtime.md).
The reusable dashboard interaction layer is documented in
[spatial UI framework](docs/spatial-ui-framework.md).
The dashboard-only 3D interaction layer is documented in
[spatial interaction engine](docs/spatial-interaction-engine.md).
The governed desktop object layer is documented in
[spatial desktop layer](docs/spatial-desktop-layer.md).
The optional holographic operating environment is documented in
[spatial command space](docs/spatial-command-space.md).
Semantic desktop understanding and navigation are documented in
[semantic desktop model](docs/semantic-desktop-model.md) and
[desktop navigation engine](docs/desktop-navigation-engine.md). Phase 17C
semantic manipulation is documented in
[semantic interaction engine](docs/semantic-interaction-engine.md), including
[form interaction](docs/form-interaction.md),
[field matching](docs/field-matching.md),
[interaction verification](docs/interaction-verification.md), and the
[interaction inspector](docs/interaction-inspector.md). Demonstration learning
is documented in
[demonstration learning engine](docs/demonstration-learning-engine.md),
[programming by demonstration](docs/programming-by-demonstration.md),
[workflow generation](docs/workflow-generation.md),
[skill registry](docs/skill-registry.md), and
[workflow editor](docs/workflow-editor.md). Universal application adapters are
documented in
[universal application adapter framework](docs/universal-application-adapter-framework.md),
[trusted applications](docs/trusted-applications.md),
[application profiles](docs/application-profiles.md),
[capability discovery](docs/capability-discovery.md),
[adapter plugin architecture](docs/adapter-plugin-architecture.md), and the
[Application Center](docs/application-center.md). Autonomous desktop workflow
orchestration is documented in
[autonomous desktop skills engine](docs/autonomous-desktop-skills-engine.md),
[workflow orchestration](docs/workflow-orchestration.md),
[execution graph](docs/execution-graph.md),
[desktop workflow recovery](docs/desktop-workflow-recovery.md), and
[Desktop Skills Center](docs/desktop-skills-center.md). Reviewed native provider
execution is documented in
[reviewed native provider runtime](docs/reviewed-native-provider-runtime.md),
[native capability dispatcher](docs/native-capability-dispatcher.md),
[provider registry](docs/provider-registry.md),
[provider validation](docs/provider-validation.md), and
[capability explorer](docs/capability-explorer.md). Phase 19A personality and
human understanding are documented in
[personality core and human understanding](docs/personality-core-human-understanding-engine.md),
[conversation state machine](docs/conversation-state-machine.md),
[confidence engine](docs/confidence-engine.md),
[personality learning engine](docs/personality-learning-engine.md),
[personality core](docs/personality-core.md),
[behaviour engine](docs/behaviour-engine.md),
[adaptive learning](docs/adaptive-learning.md),
[communication engine](docs/communication-engine.md),
[social rules](docs/social-rules.md),
[decision preferences](docs/decision-preferences.md),
[working style](docs/working-style.md),
[personality studio](docs/personality-studio.md),
[personality simulation](docs/personality-simulation.md),
[personality seed corpus](docs/personality-seed-corpus.md),
[personality corpus schemas](docs/personality-corpus-schemas.md),
[personality corpus tooling](docs/personality-corpus-tooling.md),
[personality corpus negative examples](docs/personality-corpus-negative-examples.md),
[human understanding developer guide](docs/human-understanding-developer-guide.md),
and [human understanding operations](docs/human-understanding-operations.md). The
Phase 19A delivery summary is captured in
[the implementation report](docs/phase-19a-implementation-report.md).
Phase 19B, 19C, and 19D are documented in
[Personal Knowledge Graph](docs/personal-knowledge-graph.md),
[Learning Engine](docs/learning-engine.md),
[Memory Studio](docs/memory-studio.md),
[Cognitive Item Model](docs/cognitive-item-model.md),
[Memory Provenance](docs/memory-provenance.md),
[Memory Retention](docs/memory-retention.md),
[Memory Health](docs/memory-health.md),
[Embedding Inspector](docs/embedding-inspector.md),
[Cognitive Search](docs/cognitive-search.md),
[Cognitive Context Preview](docs/cognitive-context-preview.md),
[Memory Security](docs/memory-security.md),
[Memory Import And Export](docs/memory-import-export.md), and
[the Phase 19D implementation report](docs/phase-19d-implementation-report.md).
