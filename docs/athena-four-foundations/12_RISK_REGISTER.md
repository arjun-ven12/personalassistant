# Program risks and unresolved decisions

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

| Risk                             | Consequence                                         | Control / owner role                                                        | State                                   |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| Dirty diverged baseline          | Evidence may not match remote checkout              | Hash/status manifest, minimal edits; Engineering maintainer                 | Known pre-existing                      |
| Historical audit drift           | Adjacent services mistaken for complete foundations | Current source map and narrow claim scope; Documentation steward            | Controlled by this plan                 |
| MCP metadata as authority        | Tool/server gains unintended actions                | Exact schema/tool pin and existing policy/permission gates; Security        | Must pass adversarial tests             |
| Local process overreach          | Read-only label mistaken for sandbox                | Fixed source-owned fixture only; no arbitrary local registration            | Future third-party registration blocked |
| SDK unbounded input/default env  | Memory exhaustion or secret inheritance             | Pre-parse byte limits and minimal fixed child env; Runtime maintainer       | Implementation gate                     |
| Stop/revoke race                 | Stale permission permits call/result                | Revalidation + active cancellation + no side effects; Security              | Acceptance gate                         |
| Audit failure                    | Unattributable work or false success                | Await required audit; fail closed without payload logging                   | Acceptance gate                         |
| Registry/persistence drift       | Foreign/stale grant survives restart                | Existing scoped stores + gated DB tests                                     | DB acceptance prerequisite              |
| Protocol revision mismatch       | Unsupported modern server appears compatible        | Exact 2025-11-25 negotiation and docs; no silent downgrade                  | Explicit compatibility limit            |
| Training rights unclear          | Unauthorized source/PII reuse                       | Explicit human acceptance/rights before candidate ingestion                 | CODER blocked pending policy            |
| Holdout leakage                  | Misleading model quality                            | Repository/time/component split invariants                                  | CODER acceptance gate                   |
| Unsafe model serialization       | Artifact loading executes code                      | Inert checksums/approved safe formats; no arbitrary paths                   | MODEL design constraint                 |
| Autonomous self-promotion        | Model becomes authority                             | Separate independent human exact promotion approval                         | MODEL production unavailable            |
| Cloud sandbox containment        | Untrusted compute escapes resource ceiling          | Preserve real-runner refusal; separate containment review                   | Existing blocker for general workers    |
| Quantum-themed overclaim         | Classical results sold as advantage                 | Independent objective/feasibility verification and explicit algorithm class | Scientific review gate                  |
| Paid compute/resource exhaustion | Unbounded cost                                      | No paid jobs now; future capped reservations/calibration                    | No current paid allocation              |
| Pre-existing format failures     | Broad CI formatting remains red                     | Target only changed files; report prior differences                         | Separate hygiene work                   |

Residual risks must be reviewed before expanding the fixture to third-party servers, external data, training, model hosting or quantum accounts. A READY_FOR_REVIEW recommendation for MCP-1A is not approval of these later risk surfaces.

## Dependency audit discovered during MCP-1A

The current `pnpm audit --prod` returns exit 1: one high, four moderate and five low advisory entries. Zod 4.4.3, Fastify 5.12.5 and fast-uri 3.1.8/4.1.5 are present in the original HEAD lockfile; the SDK adds paths to some of those existing versions. This is not a passing dependency-security gate, and an earlier audit report of zero findings is not current evidence.

The principal high finding is [Zod constrained-collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The audit also reports [Fastify header schema validation](https://github.com/advisories/GHSA-389g-gv7q-r4x8) and [fast-uri normalization/confusion](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) issues. The sanitized advisory list includes patched ranges in `implementation-logs/dependency-audit.json`; installing those versions and rerunning compatibility/security checks is separate follow-up work. No vulnerability has been claimed exploitable or fixed solely from this scan.

MCP-1A bounds bytes before parsing, avoids dynamic JSON Schema compilation and denies production enablement, but these do not repair the inherited dependency graph. Release recommendation remains REQUIRES_ADDITIONAL_VALIDATION pending reviewed dependency remediation and disposable PostgreSQL acceptance.
