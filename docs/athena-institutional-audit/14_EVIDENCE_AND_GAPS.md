# Evidence, coverage and unresolved gaps

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Audit method and plan executed

Discovery → relevant documentation → source composition → contracts/routes/persistence → objective/authority tracing → interface/provider boundaries → safe local checks → capability classification → proposed institutional/access/publication design → artifact review. Work was performed in the authorized workspace without merging GitHub changes or editing implementation source. Generated tracked Mac bundle bytes were preserved and restored to their pre-audit state after build.

The investigation used repository evidence rather than external marketing or assumed product features. Earlier phase documents and prior audits were treated as historical leads and checked against current composition. No external account credentials, production database, customer records or deployed workforce state were inspected. Files under ignored private/runtime areas were not treated as publication evidence.

## Coverage ledger

| Area            | Discovery and examined evidence                                                                                               | Coverage limit                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Root/build      | Root/workspace/app/package manifests, TypeScript strict options, Vitest config, Dockerfile and CI/release workflow files      | Build is portable Linux check; not Mac packaging/signing or Android acceptance                           |
| API composition | `index.ts`, `app.ts::buildApi`, `routes/context.ts`, all domain directory inventories                                         | 68 domain directories; not line-by-line proof of every handler                                           |
| API surface     | 594 literal method/path expressions with source lines                                                                         | Loops/template expressions are retained structurally; not an OpenAPI-complete expanded runtime inventory |
| Contracts       | Shared exports, role/status/capability enum/literal declaration index                                                         | Declaration does not prove registered/enabled/dispatched capability                                      |
| Database        | 111 migration files, created/altered table indexes and store SQL references                                                   | Dynamic SQL extraction incomplete; migration application/concurrency/restore not run                     |
| Agents          | All source-controlled built-ins/native/ECC seed IDs and department templates                                                  | No deployed/user-created identities, teams or people inspected                                           |
| Orchestration   | Objectives, Workforce Runtime, Agent OS, engineering DAG/integration/delivery, durable scheduler and recovery composition     | Synthetic fixture evidence; no live objective accepted                                                   |
| Intelligence    | Canonical router/context/economics, local registry/facade, memory/graph/learning/reflection/evolution and company vector path | No live models, training, retrieval-quality or adaptation benchmark                                      |
| Tools/providers | Bootstrap, business dispatch, six credential-gated adapters, unavailable defaults, native implemented/unsupported descriptors | No external API mutation, credentials, provider health or real receipts                                  |
| Clients         | React shell/input ownership, Electron IPC/dispatcher/native bridge source, Android repository/security/network/Compose paths  | No sensors, Accessibility, emulator UI, real device permissions or push acceptance                       |
| Organization    | Company context/membership, Agent Society and workforce department models                                                     | Multi-human enterprise access and staffed divisions unestablished                                        |
| Publications    | All 12 requested publication blueprints, organization/access design, documentation automation design                          | Draft source material; no approval, PDF render or external sync performed                                |

## Evidence indexes

- `evidence/provenance.json`: audited HEAD/cached remote/working-scope statement, counts and caveats.
- `evidence/source-inventory.json`: 1,206 eligible text source/document/config files with SHA-256, line count and exported symbols; this is structural inventory, not a claim of behavioral review of every line.
- `evidence/domain-inventory.json`: service classes, discovered operations, tests and observed store table references by domain.
- `evidence/route-inventory.json`: literal route expressions and source lines, including unexpanded dynamic expressions.
- `evidence/migration-inventory.json`: migration hashes and structural table declarations/alterations.
- `evidence/agent-catalog.json`: 8 original built-ins, 64 ECC-derived seeds, 40 native seeds, 13 department templates. Names describe source metadata, not verified employees/workers.
- `evidence/finite-catalogs.json`: AST-derived source catalogs for 72 tool declarations, nine agent templates, six cross-application workflow templates, semantic capabilities, integrations and provider coverage; symbolic references remain unevaluated and prompt fields are omitted.
- `evidence/contract-declarations.json`: exported capability/role/status/provider/risk/permission/action enums and literals identified structurally.
- `evidence/static-record-identifiers.json`: literal source-controlled IDs and labels in non-test runtime declarations; may include fixture/seed/example records and must never be interpreted as observed production data.
- `evidence/artifact-validation.json`: strict schema/reference/hash integrity checks for this audit; structural diagram checks do not establish rendering.
- `evidence/validation-results.json`: sanitized rerun commands, exit codes, timing, test-file pass/skip counts and safety exclusions; no raw prompts/provider payloads copied.
- `evidence/sectors.json`, `evidence/publication-map.json`: proposed institutional sector and claim-to-publication metadata seeds.

Source hashes freeze the working content. They do not make the workspace reproducible from HEAD because significant files were already modified/untracked. This directory itself is a new uncommitted audit artifact. No automatic commit/push was performed.

## Current local validation

Supported toolchain used from temporary installed tools: Node **22.16.0**, pnpm **11.17.0**. Default shell Node **20.20.2** and pnpm **9.15.9** do not match repository requirements. Subprocesses received an allowlisted environment, disabled live acceptance flags and no database/provider secrets; a temporary preload disabled `process.loadEnvFile` to prevent implicit local environment loading in tests. No source changes were needed for this isolation.

| Check                                           | Result and precise interpretation                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                | PASS across the TypeScript workspace packages                                                                                                       |
| `pnpm lint`                                     | PASS with increased Node heap                                                                                                                       |
| `pnpm test`                                     | PASS: **1,092 passed, 0 failed, 58 skipped**, across **197 test files**; fixture and mocked-transport evidence only                                 |
| `pnpm build`                                    | PASS for portable workspace output; Linux native-helper script explicitly skips macOS Swift helpers                                                 |
| API `security:check`                            | PASS for selected repository invariants; not penetration testing or full control composition proof                                                  |
| `pnpm verify:production-config`                 | PASS for hardcoded private/cloud example profile parser invariants; not deployed configuration acceptance                                           |
| New audit documentation formatting              | PASS after formatting only this audit directory                                                                                                     |
| Repository-wide `pnpm format:check`             | FAIL: 445 existing files have formatting differences; no pre-existing source was reformatted                                                        |
| Audit artifact integrity                        | PASS: strict Zod register validation, unique IDs, source/symbol/hash references, required files and passing-assertion binding; Mermaid not rendered |
| PostgreSQL integration                          | NOT_RUN; no disposable database selected, no migrations executed                                                                                    |
| Android Gradle / instrumentation                | NOT_RUN; JDK 21 is present but a compatible SDK 35/toolchain/emulator was not established or configured by audit                                    |
| macOS native/sensors/device                     | NOT_RUN; Linux environment, no OS mutation/permissions requested                                                                                    |
| Live AI/business providers and deployed API/web | NOT_RUN / UNKNOWN; no credentials, endpoints or receipts accepted                                                                                   |
| Dependency advisory scan                        | NOT_RUN in this audit; earlier reports are historical and not adopted as current results                                                            |

Skipped assertions are reported per test file in the validation manifest. Tests with only skipped assertions may still appear as “passed” files in Vitest JSON; assertion counts are the accepted skip evidence. No skipped database/provider/device test upgrades a capability to verified. The register has one deliberately narrow IMPLEMENTED_AND_VERIFIED claim for canonical digest regression behavior, rather than labeling broad modules verified because their fixture tests pass.

## Contradictions, deprecated paths and disconnected features

| Issue                                                | Evidence and current interpretation                                                               | Required documentation action                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Early architecture says no executor                  | `docs/architecture.md` versus current `ExecutionService`, engineering/native paths and `buildApi` | Preserve history but add current architecture/claim mapping; do not quote early limits as global current behavior |
| Early engineering documents say no integration/merge | Phase 27.1/27.2 docs versus current integration/delivery services                                 | Map each phase limit to its later extension and exact capability                                                  |
| Mobile outline versus real Android app               | `apps/mobile/README.md` versus `apps/android` Kotlin/Gradle source                                | Mark outline historical/planned and reference actual client with unrun acceptance                                 |
| Deprecated local AI facade                           | `local-ai/service.ts` deprecation and canonical router requirement                                | Distinguish administrative compatibility from canonical inference                                                 |
| Legacy vector retrieval claim                        | `RetrievalService.hybridSearch` rejects vector mode; company data has separate pgvector query     | Publish separate capability entries and avoid universal “hybrid search works” claim                               |
| Worker queue metrics imply workers                   | `WorkerService` is counters; separate durable scheduler/engineering leases exist                  | Explain distinct responsibilities and actual execution environments                                               |
| Native declaration wider than host                   | Backend descriptors versus Mac implemented/unsupported arrays                                     | Generate explicit coverage; unsupported capabilities remain denied                                                |
| Workspace baseline semantics                         | Placeholder code/browser/note objects in `workspace-intelligence/service.ts`                      | Identify synthetic/seed provenance and do not imply live application understanding                                |
| Business connectors wider than adapters              | `integrations/builtins.ts`, unavailable defaults and conditional bootstrap                        | Separate schema/permission/provider/binding/receipt maturity                                                      |
| Social/creative labels imply publishing              | `LaunchWorkflowService` is review-only; posts blocked                                             | Describe artifact review capability separately from publication and media generation                              |
| Multi-company implies enterprise IAM                 | `CompanyService.resolve` returns OWNER                                                            | Keep collaborator RBAC/clearance application as proposed design                                                   |
| Named Phase 28 ambitions                             | Acceptance report and source searches do not establish MCP/AthenaCoder/distillation               | UNKNOWN pending exact scope/specification; adjacent tests cannot substitute                                       |
| Quantum mentions imply research                      | Incidental conversational tests only                                                              | Proposed feasibility charter; no implementation/result claims                                                     |

These are evidence/claim alignment issues, not proof that every underlying implementation is defective. Source code deprecation and unavailable-state checks are stronger evidence than the age of a document.

## Open evidence gaps and how to close them

1. **Workspace versus GitHub:** inspect the latest remote in a separate checkout and compare architecture/evidence, preserving local work. This audit's claims are scoped to current workspace, not remote main.
2. **Production posture:** separately authorized read-only endpoints/deployment access for health/readiness, exact configuration posture, migrations, bindings and safe logs; do not request secret values.
3. **PostgreSQL authority:** explicit disposable test-named database, pgvector prerequisites, isolated-schema migrations and concurrency/restart/idempotency/tenant/audit tests. A passing local in-memory store does not establish it.
4. **Trusted Mac:** configured reviewed images, repository profiles, registered device and explicit integration-test authorization. Verify actual effects, signed receipts, stop, stale approvals and recovery in a disposable repository.
5. **Android:** compatible JDK/SDK 35, unit/build, emulator and real-device Ed25519/biometric/session/reconnect tests. `AndroidDeviceIdentity` includes encrypted software-key fallback, so “always hardware-backed” would be false.
6. **Provider acceptance:** test/sandbox credentials in a secret manager and exact company account bindings, read-only health first, then separately authorized harmless reversible effects. No actual external messages/payments/posts are authorized by this audit.
7. **Cloud containment:** quota-backed resource containment and independent security review before enabling the real general sandbox. Keep the intentional denial.
8. **Named intelligence programs:** founder-approved definition/acceptance for AthenaCoder, MCP and distillation; training/data rights and measured evaluations if relevant.
9. **Institutional facts:** founder input on legal status, leadership, missions, actual collaborators and client/service scope. Source catalog names are insufficient.
10. **Publication readiness:** technical/security/scientific review, classification decisions, current evidence links and approved public subset. No existing audit score substitutes for these decisions.

## Limits of this investigation

This is broad repository discovery with targeted behavioral tracing and rerun local tests, not formal verification, a complete dynamic route/authentication audit, an independent cryptographic review, source-by-source manual proof, an operational penetration test, or a live deployment assessment. Runtime-created objects and external systems that could not be inspected are UNKNOWN. Every future verification must report environment, exact scope, version, prerequisites and exclusions.

## Capability register navigation

The 110 significant claims include 71 implemented but not fully accepted, 27 partial, one deprecated facade, one locally verified digest regression, six UNKNOWN named systems, two architecture-only designs and two proposed research programs. These are claim categories, not a weighted readiness score.

| Capability ID                      | Current classification   | Purpose                                                                     |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| ATHENA.ACTIVE_CONTEXT              | IMPLEMENTED_NOT_VERIFIED | Bound current page/application/project context for conversation             |
| ATHENA.ADAPTER_SDK                 | PARTIALLY_IMPLEMENTED    | Describe reviewed application adapter lifecycle and compatibility           |
| ATHENA.ADVISOR                     | IMPLEMENTED_NOT_VERIFIED | Explain engineering goals, risks and readiness                              |
| ATHENA.AGENT_COGNITION             | IMPLEMENTED_NOT_VERIFIED | Preserve inspectable agent experience and bounded cognition metadata        |
| ATHENA.AGENT_ECONOMY               | IMPLEMENTED_NOT_VERIFIED | Bound agent resources and attribute verified outcomes                       |
| ATHENA.AGENT_EVOLUTION             | IMPLEMENTED_NOT_VERIFIED | Propose evidence-backed agent improvement                                   |
| ATHENA.AGENT_SOCIETY               | IMPLEMENTED_NOT_VERIFIED | Represent teams, leadership and collaborative decisions                     |
| ATHENA.AGENT_WORKFORCE             | IMPLEMENTED_NOT_VERIFIED | Reuse logical specialists and company departments                           |
| ATHENA.AGENTS                      | IMPLEMENTED_NOT_VERIFIED | Standardize logical identity, packages and delegation sessions              |
| ATHENA.AI                          | IMPLEMENTED_NOT_VERIFIED | Route inference through registered models with privacy, context and budgets |
| ATHENA.APPLICATION_ADAPTERS        | PARTIALLY_IMPLEMENTED    | Trust applications and discover finite semantic capabilities                |
| ATHENA.APPLICATION_DISCOVERY       | IMPLEMENTED_NOT_VERIFIED | Ingest bounded trusted application installation metadata                    |
| ATHENA.APPLICATION_INTELLIGENCE    | PARTIALLY_IMPLEMENTED    | Resolve semantic domains and select reviewed providers                      |
| ATHENA.APPLICATION_INTERACTIONS    | IMPLEMENTED_NOT_VERIFIED | Resolve deterministic utterances into reviewed semantic actions             |
| ATHENA.BUSINESS_OS                 | IMPLEMENTED_NOT_VERIFIED | Present a company business operations read model                            |
| ATHENA.CAPABILITY_STUDIO           | PARTIALLY_IMPLEMENTED    | Create reviewable capability requests and skill candidates                  |
| ATHENA.COMPANIES                   | IMPLEMENTED_NOT_VERIFIED | Separate an owner's company data and lifecycle                              |
| ATHENA.COMPANY_DATA                | IMPLEMENTED_NOT_VERIFIED | Govern company information sources, metrics, lineage and semantic context   |
| ATHENA.COMPANY_MANAGEMENT          | IMPLEMENTED_NOT_VERIFIED | Produce bounded company intelligence reviews                                |
| ATHENA.CONVERSATION                | IMPLEMENTED_NOT_VERIFIED | Classify conversational requests and evaluate route behavior                |
| ATHENA.CONVERSATION_CONTINUITY     | IMPLEMENTED_NOT_VERIFIED | Preserve references and confirmation state across turns                     |
| ATHENA.CORE_ADAPTERS               | PARTIALLY_IMPLEMENTED    | Map common application semantic operations through existing adapters        |
| ATHENA.CROSS_APPLICATION_WORKFLOWS | PARTIALLY_IMPLEMENTED    | Compose dependency graphs across registered semantic capabilities           |
| ATHENA.CROSS_DEVICE                | IMPLEMENTED_NOT_VERIFIED | Route bounded commands among registered UI devices                          |
| ATHENA.DEEP_INDEXERS               | PARTIALLY_IMPLEMENTED    | Maintain semantic indexing lifecycle and relationships                      |
| ATHENA.DESKTOP                     | PARTIALLY_IMPLEMENTED    | Govern semantic desktop context, navigation and capability requests         |
| ATHENA.DESKTOP_SKILLS              | PARTIALLY_IMPLEMENTED    | Orchestrate approved desktop skills with checkpoints and verification       |
| ATHENA.DURABLE_EXECUTION           | PARTIALLY_IMPLEMENTED    | Coordinate explicit cross-company requests with durable lifecycle           |
| ATHENA.ENGINEERING_DELIVERY        | IMPLEMENTED_NOT_VERIFIED | Coordinate software objective to reviewed local delivery                    |
| ATHENA.ENGINEERING_INTEGRATION     | IMPLEMENTED_NOT_VERIFIED | Combine validated task worktrees with independent review                    |
| ATHENA.ENGINEERING_ORCHESTRATION   | IMPLEMENTED_NOT_VERIFIED | Decompose and schedule parallel coding tasks                                |
| ATHENA.ENGINEERING_RUNTIME         | IMPLEMENTED_NOT_VERIFIED | Constrain repository reads, edits, worktrees and validation                 |
| ATHENA.EXECUTION                   | IMPLEMENTED_NOT_VERIFIED | Carry finite approved operations over trusted signed device transport       |
| ATHENA.EXECUTIVE                   | IMPLEMENTED_NOT_VERIFIED | Interpret priorities and persist inspectable decision support               |
| ATHENA.EXPERIMENTS                 | IMPLEMENTED_NOT_VERIFIED | Manage bounded business/product experiment records                          |
| ATHENA.EXTERNAL_HARVEST            | IMPLEMENTED_NOT_VERIFIED | Normalize reviewed external specialist knowledge and delegated tasks        |
| ATHENA.GOVERNANCE                  | IMPLEMENTED_NOT_VERIFIED | Compute and persist explainable default-deny decisions                      |
| ATHENA.HUMAN_UNDERSTANDING         | IMPLEMENTED_NOT_VERIFIED | Interpret bounded human language before model fallback                      |
| ATHENA.IDENTITY                    | IMPLEMENTED_NOT_VERIFIED | Authenticate owner sessions and register trusted device identities          |
| ATHENA.INTEGRATIONS                | PARTIALLY_IMPLEMENTED    | Register connectors and dispatch reviewed business capabilities             |
| ATHENA.INTELLIGENCE                | PARTIALLY_IMPLEMENTED    | Provide caching, embeddings interfaces, retrieval and queue telemetry       |
| ATHENA.INTENT                      | IMPLEMENTED_NOT_VERIFIED | Translate natural-language requests into inspectable command plans          |
| ATHENA.INTENT_RECORDING            | IMPLEMENTED_NOT_VERIFIED | Learn reviewable semantic workflow demonstrations                           |
| ATHENA.KNOWLEDGE_GRAPH             | IMPLEMENTED_NOT_VERIFIED | Preserve typed knowledge, provenance, conflict and temporal facts           |
| ATHENA.LAUNCH_WORKFLOW             | IMPLEMENTED_NOT_VERIFIED | Produce versioned cross-department launch review packages                   |
| ATHENA.LEARNING_ENGINE             | IMPLEMENTED_NOT_VERIFIED | Learn reversible contextual preferences from evidence                       |
| ATHENA.LOCAL_AI                    | DEPRECATED               | Administer local models through a compatibility facade                      |
| ATHENA.MEMORY                      | IMPLEMENTED_NOT_VERIFIED | Persist evidence-bearing context and stable engineering facts               |
| ATHENA.MEMORY_STUDIO               | IMPLEMENTED_NOT_VERIFIED | Expose a unified owner-facing cognitive read/control model                  |
| ATHENA.NATIVE_PROVIDERS            | PARTIALLY_IMPLEMENTED    | Validate and dispatch finite trusted native capabilities                    |
| ATHENA.NOTIFICATIONS               | IMPLEMENTED_NOT_VERIFIED | Deliver bounded objective/approval status to trusted clients                |
| ATHENA.OBJECTIVES                  | IMPLEMENTED_NOT_VERIFIED | Track user outcomes separately from task execution progress                 |
| ATHENA.OBSERVABILITY               | IMPLEMENTED_NOT_VERIFIED | Expose portfolio status, governor proposals and attributable telemetry      |
| ATHENA.PATCHES                     | IMPLEMENTED_NOT_VERIFIED | Review and apply bounded code patch proposals                               |
| ATHENA.PERSISTENCE                 | IMPLEMENTED_NOT_VERIFIED | Maintain durable storage, migrations and transaction boundaries             |
| ATHENA.REFLECTION                  | IMPLEMENTED_NOT_VERIFIED | Turn bounded feedback/outcomes into advisory calibration                    |
| ATHENA.REPOSITORIES                | IMPLEMENTED_NOT_VERIFIED | Index registered repositories and answer evidence-linked questions          |
| ATHENA.SECURITY_STATE              | IMPLEMENTED_NOT_VERIFIED | Provide CSRF, recent authentication, recovery and security posture          |
| ATHENA.SEMANTIC                    | IMPLEMENTED_NOT_VERIFIED | Resolve registered objects deterministically with confidence                |
| ATHENA.SKILL_EVOLUTION             | IMPLEMENTED_NOT_VERIFIED | Propose and evaluate reviewable reusable skills                             |
| ATHENA.SPATIAL                     | IMPLEMENTED_NOT_VERIFIED | Interpret local gesture metadata into governed UI/intent events             |
| ATHENA.TASKS                       | IMPLEMENTED_NOT_VERIFIED | Persist schedules, routines, monitors and governed triggers                 |
| ATHENA.TELEMETRY                   | IMPLEMENTED_NOT_VERIFIED | Record bounded application spans through reviewed sinks                     |
| ATHENA.VALIDATION                  | IMPLEMENTED_NOT_VERIFIED | Run registered immutable validation profiles through signed execution       |
| ATHENA.VOICE                       | IMPLEMENTED_NOT_VERIFIED | Maintain persistent governed voice/conversation input                       |
| ATHENA.WORKFLOWS                   | IMPLEMENTED_NOT_VERIFIED | Coordinate reviewed engineering workflow task records                       |
| ATHENA.WORKFORCE_RUNTIME           | IMPLEMENTED_NOT_VERIFIED | Schedule eligible company specialists and verify task outcomes              |
| ATHENA.WORKSPACE_INTELLIGENCE      | PARTIALLY_IMPLEMENTED    | Represent cross-application semantic objects and relationships              |
| ATHENA.AI.ROUTING                  | IMPLEMENTED_NOT_VERIFIED | Canonical model routing and privacy                                         |
| ATHENA.AI.ECONOMICS                | IMPLEMENTED_NOT_VERIFIED | Provider cost reservation and settlement                                    |
| ATHENA.AI.CONTEXT                  | IMPLEMENTED_NOT_VERIFIED | Cognitive context source compiler                                           |
| ATHENA.AI.BENCHMARK                | IMPLEMENTED_NOT_VERIFIED | Runtime benchmark evaluation substrate                                      |
| ATHENA.MEMORY.LEGACY_VECTOR        | PARTIALLY_IMPLEMENTED    | Legacy memory vector mode                                                   |
| ATHENA.DATA.COMPANY_VECTOR         | IMPLEMENTED_NOT_VERIFIED | Company semantic vector retrieval                                           |
| ATHENA.WORKERS.QUEUE_COUNTERS      | PARTIALLY_IMPLEMENTED    | Legacy intelligence worker counters                                         |
| ATHENA.WORKERS.CLOUD_SANDBOX       | PARTIALLY_IMPLEMENTED    | General artifact sandbox execution                                          |
| ATHENA.UI.WEB                      | IMPLEMENTED_NOT_VERIFIED | Authenticated web operating surfaces                                        |
| ATHENA.UI.PERSISTENT_INPUT         | IMPLEMENTED_NOT_VERIFIED | Persistent browser voice and gesture shell                                  |
| ATHENA.UI.ANDROID                  | IMPLEMENTED_NOT_VERIFIED | Native Android command and control                                          |
| ATHENA.UI.MAC                      | IMPLEMENTED_NOT_VERIFIED | Trusted Electron agent shell                                                |
| ATHENA.GOV.DIGEST                  | IMPLEMENTED_AND_VERIFIED | Canonical action digest regression coverage                                 |
| ATHENA.PROVIDER.GMAIL              | IMPLEMENTED_NOT_VERIFIED | Gmail finite mail operations                                                |
| ATHENA.PROVIDER.STRIPE_TEST        | IMPLEMENTED_NOT_VERIFIED | Stripe test payments                                                        |
| ATHENA.PROVIDER.XERO_READ          | IMPLEMENTED_NOT_VERIFIED | Xero sandbox reads                                                          |
| ATHENA.PROVIDER.ADS_READ           | IMPLEMENTED_NOT_VERIFIED | Google Ads test-account reads                                               |
| ATHENA.PROVIDER.GA4_READ           | IMPLEMENTED_NOT_VERIFIED | Google Analytics 4 reads                                                    |
| ATHENA.PROVIDER.SHOPIFY_READ       | IMPLEMENTED_NOT_VERIFIED | Shopify development reads                                                   |
| ATHENA.PROVIDER.CRM                | PARTIALLY_IMPLEMENTED    | Crm business adapter                                                        |
| ATHENA.PROVIDER.SUPPORT            | PARTIALLY_IMPLEMENTED    | Support business adapter                                                    |
| ATHENA.PROVIDER.DOCUMENTS          | PARTIALLY_IMPLEMENTED    | Documents business adapter                                                  |
| ATHENA.PROVIDER.PROJECTS           | PARTIALLY_IMPLEMENTED    | Projects business adapter                                                   |
| ATHENA.PROVIDER.GITHUB_BUSINESS    | PARTIALLY_IMPLEMENTED    | Github Business business adapter                                            |
| ATHENA.NATIVE.VSCODE               | PARTIALLY_IMPLEMENTED    | Reviewed Mac provider.vscode                                                |
| ATHENA.NATIVE.FINDER               | PARTIALLY_IMPLEMENTED    | Reviewed Mac provider.finder                                                |
| ATHENA.NATIVE.CHROME               | PARTIALLY_IMPLEMENTED    | Reviewed Mac provider.chrome                                                |
| ATHENA.NATIVE.SAFARI               | PARTIALLY_IMPLEMENTED    | Reviewed Mac provider.safari                                                |
| ATHENA.NATIVE.TERMINAL             | PARTIALLY_IMPLEMENTED    | Reviewed Mac provider.terminal                                              |
| ATHENA.NATIVE.CHATGPT              | IMPLEMENTED_NOT_VERIFIED | Reviewed Mac provider.chatgpt                                               |
| ATHENA.NATIVE.CODEX                | IMPLEMENTED_NOT_VERIFIED | Reviewed Mac provider.codex                                                 |
| ATHENA.NATIVE.FIGMA                | IMPLEMENTED_NOT_VERIFIED | Reviewed Mac provider.figma                                                 |
| ATHENA.UNKNOWN.MCP_UNIVERSAL       | UNKNOWN                  | Universal MCP runtime                                                       |
| ATHENA.UNKNOWN.ATHENACODER         | UNKNOWN                  | AthenaCoder and curated coding dataset                                      |
| ATHENA.UNKNOWN.DISTILLATION        | UNKNOWN                  | Model distillation pipeline                                                 |
| ATHENA.UNKNOWN.QUANTUM_RUNTIME     | UNKNOWN                  | Quantum simulator or hardware research runtime                              |
| ATHENA.UNKNOWN.NOTION_SYNC         | UNKNOWN                  | Institutional Notion synchronization                                        |
| ATHENA.UNKNOWN.DRIVE_SYNC          | UNKNOWN                  | Institutional Google Drive synchronization                                  |
| ATHENA.ORG.CONTROL                 | ARCHITECTURE_ONLY        | Organization Control application                                            |
| ATHENA.RESEARCH.MACHINE_LAB        | RESEARCH                 | Machine Intelligence Lab institutional program                              |
| ATHENA.RESEARCH.QUANTUM_LAB        | RESEARCH                 | Quantum Systems Research institutional program                              |
| ATHENA.DOCS.PIPELINE               | ARCHITECTURE_ONLY        | Institutional documentation automation                                      |
