# Universal tool runtime (Phase 28.1)

The universal tool contract is an adapter boundary for MCP, API, native, and
local capabilities. It does not replace Agent OS, Capability Studio, the
governance registry, the existing integration business runtime, or the signed
Mac Agent execution channel. Model output and external tool content remain
untrusted data.

## Current path

The `UniversalToolGateway` accepts only server-derived owner, company, agent,
request, and emergency-stop context. A caller supplies a registered tool ID,
bounded arguments, invocation ID, and optional approval/idempotency references.
The gateway resolves a persisted definition, validates arguments against a
conservative JSON Schema subset, calls an injected authority bridge, reserves
an invocation receipt, atomically claims it, dispatches through a registered
source adapter, validates and bounds the result, and audits the outcome.
Discovered tools start disabled. Provider status and health are checked at
selection and invocation. A claimed receipt is never blindly replayed after a
crash; its external outcome requires reconciliation.

The remote MCP adapter uses a reviewed HTTPS host allowlist, bounded HTTP
responses, JSON-RPC validation, session reuse, and tool discovery. Its output
is returned as external data. The PostgreSQL store holds provider records,
tool definitions, tool reviews, and invocation receipts; an in-memory store is
for tests only. Migrations `0110_phase_28_1_universal_tools.sql` and
`0111_phase_28_1_tool_reviews.sql` must be applied before using the PostgreSQL
store.

## Governance and registration

A remote provider onboarding flow now exists under authenticated, company-scoped
`/api/universal-tools` routes: register an exact HTTPS allowlisted endpoint,
discover disabled tools, match a server-owned reviewed manifest to the exact
schema and provider version, then activate. The gateway requires an enabled
review and a short-lived, exact-request execution grant after existing policy
evaluation. A generic policy `ALLOW` cannot execute. Credentials are checked
by owner, company, provider, and reference status. Authenticated remote MCP
requests resolve a server-configured secret locator to a bearer or API-key
header only after the company credential reference is ready. The agent never
receives the secret. The server configuration is bounded and exact-provider
scoped; an unavailable secret denies registration, activation, and invocation.

Two finite, server-owned adapters share the gateway. `analytics:read_metric`
delegates a read to the existing business integration runtime, including its
company binding, permission, provider health, credential, and audit checks;
it returns an exact verified metric observation. `athena.native:provider_health`
reads bounded status from the existing native provider runtime. The separate
`athena.native:focus_vscode` capability delegates to the existing native
dispatcher and signed Mac Agent execution channel. It requires explicit
approval and an invocation-bound idempotency key, waits for the signed
provider verification record, and returns success only after verification.
If the signed result is delayed, the receipt remains indeterminate; a status
query can reconcile the exact native action without dispatching it again.
Finite adapters begin disabled and need exact schema review and activation.

Writes require an idempotency key and a reviewed adapter declaration with a
provider reconciliation method. Only the fixed VS Code focus action currently
declares that contract. Other universal writes deny. A claimed receipt is not
replayed after a crash; the reconciliation route reports an indeterminate
status without making another provider call when no provider status API can
resolve it. Local MCP
production activation remains disabled because a reviewed supervisor has not
been implemented.

For existing API integrations, `integrations/business-runtime.ts` continues to
own credential resolution, company binding, exact approval, idempotency,
reconciliation, health, rate limits, and audit. Native capability dispatch
continues through the Desktop Capability Layer and signed Mac Agent channel.
The new adapters delegate to those paths; they do not call privileged OS or
external APIs directly from an agent or renderer. Durable receipt telemetry
reports recent tool/provider call counts, outcomes, measured latency, retries,
known cost by currency, and owner acceptance. It is bounded to the most recent
500 company-scoped receipts and never includes provider output or arguments.
Unknown provider cost remains unknown; it is never assumed to be zero.

## Performance and measurement

Definitions are discovered and normalized once into PostgreSQL, so hot-path
selection reads the registry rather than reconnecting to MCP for every call.
`EngineeringBenchmarkRunSchema` records comparable Athena, Codex, and manual
milestones, model/tool/manager calls, validation, cost, and outcomes. The route
labels `ENGINEERING_FAST_PATH` and `ENGINEERING_FULL_PATH` are measurement
metadata only; Phase 28.5 routing is not implemented here. No Codex-speed
claim is supported until comparable live runs are measured.

The reproducible in-process harness is
`apps/api/src/scripts/benchmark-universal-tools.ts`. On 2026-09-30, one run on
the development Mac measured selection p50/p95 0.0080/0.0115 ms, lookup
0.0043/0.0046 ms, and schema validation 0.0018/0.0023 ms (1,000 samples each).
Actual in-memory PolicyEngine authority evaluation measured 0.0455/0.0950 ms
and gateway dispatch through a trivial fake API result measured
0.0888/0.1345 ms (200 samples each). These values exclude PostgreSQL, network,
external provider time, and model inference. They measure only the local path
and must not be used as production latency or Codex-comparison evidence.

## Validation and deployment limits

The production route is unavailable without PostgreSQL. Apply migrations
`0110` and `0111` and pass production-security validation before deployment.
The entrypoint supplies one pinned DeepWiki read manifest only when the
operator explicitly allowlists `mcp.deepwiki.com`. The opt-in live test
completed an authenticated DeepWiki read through the production route with a
PostgreSQL receipt, policy evaluation, audit, and telemetry; its latest route
latency was 1,096.2 ms and receipt latency was 1,036 ms. Provider cost was
unavailable. That run used a test session and governance store, so it is a
production-shaped scenario, not a deployed production invocation.

The analytics adapter passed an authenticated gateway test with a deterministic
reviewed business provider, company binding, exact permission, duplicate
receipt, and verified metric result. A live Google Analytics 4 read needs an
operator-configured company credential, binding, permission, and test property.
The native status adapter passed a read-only runtime query. The fixed VS Code
focus adapter passed focused tests of signed-result gating and exact native
reconciliation; live macOS execution still requires a registered trusted Mac
Agent, a trusted VS Code registration, and owner approval. Provider status-query
reconciliation for other universal writes has not been implemented, so those
actions remain denied. These live provider and deployment gates are the
remaining validation limits for a verified-complete claim.
