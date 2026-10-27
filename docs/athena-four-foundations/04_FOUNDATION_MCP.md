# Foundation One: MCP client transport

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Current implementation map and reuse

No dedicated MCP client was located at baseline. Reuse `IntegrationRegistryService`/stores for company grants, `BUILT_IN_TOOLS` for finite risk/input/output/approval declarations, `PolicyEngine`/`RiskEngine` for current authorization, registered workspace read permission for project scope, and existing identity/device/signature/replay/origin/CSRF/network guards. Reuse the governance audit writer for bounded attributable events. Do not add a parallel Tool Gateway.

## MCP-1A contract and runtime design

One reviewed server identity and one tool: `athena_local_status`, returning static structured protocol health. API routes are finite discovery/read-status operations; no arbitrary method/tool composer. The request binds registered workspace and request identity. Company identity comes from authenticated context; server/tool/schema/risk are source-owned. No raw source or arbitrary user text is sent to the server.

Pin `2025-11-25` with official SDK `1.32.2`. Initialization must return the exact revision and fixed server name/version and advertise tools. Discovery accepts exactly the reviewed tool's object input/output schemas. A read-only hint is informational, never authority. Unexpected tools, schema changes, paging, tool-list change notifications or undeclared client features fail closed. No sampling, roots, prompts, resources, elicitation or tasks are negotiated.

The transport starts only the bundled fixture using a fixed executable/entry and minimal environment. Source mode uses the reviewed TypeScript loader; build mode uses its bundled JS entry. Bound bytes/messages before SDK decode. A request-wide deadline covers handshake, discovery and call; cancellation closes the child and prevents result acceptance. Runtime teardown is bounded. RPC errors and tool errors normalize to safe codes without returning raw provider data.

API/service authorization is repeated before dispatch and result acceptance, with active cancellation on revocation/stop. The company integration grant and readable workspace are required for discovery as well as invocation. Permission revocation is independent of catalog enablement. No public server/tool registration endpoint exists. Default feature off; enabling the fixture in production is rejected by config and composition.

## Transport alternatives

| Transport                | Decision                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Local stdio              | Implement fixed source-owned fixture only; no arbitrary local executable registration                  |
| Streamable HTTP          | Designed for MCP-3; needs authenticated endpoint allowlist, origin/SSRF controls and secret references |
| Legacy HTTP+SSE          | Excluded; no transparent fallback or network downgrade                                                 |
| In-memory fake transport | Use only for protocol/fault tests; not sufficient real stdio acceptance                                |

Protocol references: [handshake lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [stdio/HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [tool contracts](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [SDK release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.2). These define compatibility, not Athena authority.

## Phases and gates

- MCP-1A: exact local handshake/discovery/read, strict boundaries, policy/permission/audit integration, bytes/deadlines/cancel and real stdio test.
- MCP-1B: complete persistence/restart and shutdown acceptance for existing gates; review quota/rate semantics before wider workload.
- MCP-2: owner-reviewed registration, company/project binding, schema versions and health/trust lifecycle; remote discovery never auto-registers tools.
- MCP-3: remote authenticated Streamable HTTP, SSRF/DNS/origin/redirect defenses, credentials isolation and reconnection acceptance.
- MCP-4: finite side-effect capability classes, exact approval/recent auth, durable idempotency, unknown-outcome reconciliation and stop/revocation.

## Acceptance and rollback

Tests must prove a real local child handshake/discovery/call; unknown/mutating tools and malformed schemas denied; read output validated independently; policy/permission/company/workspace/device/session failures produce no tool call; stop/revoke mid-flight suppresses success; timeout/cancel/close clean resources; no sensitive audit metadata; duplicated envelopes fail; restart uses current permissions. A fault fake supplements but cannot replace stdio acceptance.

No new database table is required. Migration `0118_mcp_local_fixture_provider.sql` extends the existing provider CHECK constraint; migrations must run before enabling the new descriptor on PostgreSQL. Deployment requires Node >=22, pinned dependencies and the bundled fixture entry; no GPU, paid provider or remote server. Rollback disables fixture and closes sessions; retained policy/audit evidence is not removed. Wider compatibility remains unverified after this slice.

## Concrete API and local acceptance instructions

Both endpoints require an existing authenticated cookie session, exact trusted origin, CSRF token, trusted device header, and a valid device-signed `SignedCommandEnvelope`. The existing envelope uses `protocolVersion: "1"`; this is distinct from the MCP wire revision `2025-11-25`. The envelope command ID is the operation ID. Its signed payload contains `operation`, `workspaceId`, fixed `serverId: "athena.local.fixture"`, fixed `toolName: "athena_local_status"`, and `input: {"probe":"health"}`. Discovery uses `/api/mcp/local-fixture/discover` with operation `discover`; invocation uses `/api/mcp/local-fixture/read-status` with operation `read_status`. A mismatch or extra authority/process field is rejected.

The workspace ID is an authorization boundary; its host path/content is never sent to or read by the fixture. Existing `/api/integrations/permissions` grants the finite `mcp.local_fixture.read` capability to the active company, but grants do not enable the feature flag or production use. General integration dry-run records are metadata only; actual MCP acceptance uses these finite signed routes.

With supported Node/pnpm and installed reviewed dependencies, run `pnpm exec vitest run apps/api/src/mcp packages/config/src/mcp.test.ts`. This runs the real local SDK child and signed API test plus fault/authorization tests; no external server or credentials are needed. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, API `security:check`, and `pnpm verify:production-config` for regression acceptance. Use a clean test environment with live-provider flags off and no ambient production configuration. The recorded run additionally disabled implicit environment-file loading.

A separate `TEST_DATABASE_URL` must point to an explicitly disposable test database with pgvector/migration prerequisites before running `postgres.integration.test.ts`; never use production. Migration 0118 is required for the new provider constraint. Production remains prohibited even after that migration. Linux portable build does not accept Mac native helpers or Android/device behavior.

## MCP-1B acceptance increment — 2026-10-26

The existing merged MCP implementation is present at `90c77ecceb35682e0b64bcc512b8d83ae23a78d1`. The original pre-MCP implementation map above is historical. MCP-1B adds durable acceptance tests and scoped dependency patches; it adds no runtime tool, transport, server registration, approval bypass or production enablement. Migration `0118_mcp_local_fixture_provider.sql` remains unchanged. See [the current acceptance report](implementation-logs/mcp-1b/ACCEPTANCE_REPORT.md) and [reproduction instructions](implementation-logs/mcp-1b/REPRODUCING_ACCEPTANCE.md).

PostgreSQL-backed API/pool reconstruction, company isolation, persisted replay and duplicate races, approval digest/expiry, revocation, and bounded in-flight stop/cancellation are exercised against a newly created local disposable cluster and the actual local SDK fixture. Scripted protocol-poisoning cases remain fault-injection evidence. No remote/live provider acceptance or host-power-loss guarantee is inferred.

The previously reported ten Zod/Fastify/fast-uri advisory entries are removed by tested same-major updates. The whole dependency audit still fails on additional inherited packages. Production remains prohibited.
