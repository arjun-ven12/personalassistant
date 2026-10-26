# Repository baseline and investigation

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Snapshot

Branch `main`, HEAD `7ee28be9de093a0446dfbe95b7145278b9087ea9`. Cached `origin/main` is `7e7c4627b8d38a7a5747ba0cbd5f655ac31887c1` after the prior documentation push. The local checkout was not rebased or reset. It has substantial pre-existing tracked/untracked Phase 28/security work and the audit directory; the local-only responsive-dashboard commit and newer remote commits remain separate. No current remote fetch is required to audit this authorized working snapshot.

The baseline hash/status manifest is retained in the implementation log. Existing source is not overwritten or globally formatted. Modified shared composition/contract files are edited minimally on top of their pre-existing changes. Generated tracked Mac bundles are backed up/restored around build checks. No automatic commit/push is part of this run.

## Toolchain and validation

Repository requires Node >=22 <25 and pnpm 11; default shell Node 20.20.2/pnpm 9.15.9 are unsuitable. Use existing temporary Node 22.16.0 and pnpm 11.17.0 tools. No model/runtime credentials are needed. Test subprocesses use an allowlisted environment, live acceptance flags disabled and implicit environment-file loading disabled. Database acceptance requires an explicitly selected disposable database.

Pre-change checks are recorded in `implementation-logs/baseline-validation.json`: typecheck, lint, all 1,092 local tests (58 skipped), portable build and selected security/configuration invariants passed. The preceding audit reported 1,092 passing/58 skipped tests and 445 pre-existing format differences; these are leads until rerun. Native macOS, Android, production and live provider acceptance are separate.

## Source investigation map

| Boundary              | Reused source / exact responsibility                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap/composition | `apps/api/src/index.ts`, `app.ts::buildApi`, `routes/context.ts::ApiRouteContext`                                                                    |
| Identity              | `identity/service.ts::IdentityService`, `security.ts::SecurityMiddleware`: owner/session/device/signature/replay/network                             |
| Company scope         | `companies/context.ts::CompanyContextResolver`, `scope.ts::companyScope`: authenticated context and scoped store operations                          |
| Tool policy           | `governance/defaults.ts::BUILT_IN_TOOLS`, `PolicyEngine`, `RiskEngine`, `ApprovalService`: finite metadata, server-computed risk and exact approvals |
| Integrations          | `IntegrationRegistryService`, `IntegrationStore` and PostgreSQL adapter: existing explicit company grants/revocation and operation/audit records     |
| Workspace scope       | `RegistryService`, `GovernanceStore`: registered IDs, read permission and mandatory blocked patterns                                                 |
| Workforce             | `AgentOsService`, `AgentWorkforceService`, `WorkforceRuntimeService`: definitions/assignments, scoped sessions, budgets and task provenance          |
| AI                    | `AIModelRegistry`, `AIProviderRegistry`, `AIRouterService`, economics/context/benchmark services: inference eligibility and resource accounting      |
| Engineering           | runtime/manager/integration/delivery services: validated work and independent review; human acceptance and training rights remain distinct           |
| Learning              | reflection, skill evolution, memory/knowledge services: advisory evidence and reviewed skill promotion, not model-weight promotion                   |
| Native execution      | `ExecutionService` plus Mac finite dispatchers: signed device execution; MCP does not replace or extend native control                               |
| Research              | `experiments/` business experiment records and `ai/benchmark/`; no binary optimizer or training artifact service located                             |
| Persistence           | existing identity/governance/integration PostgreSQL adapters and migrations; MCP-1A needs no additional store/table                                  |

## Audit reconciliation

The audit's UNKNOWN MCP/AthenaCoder/distillation/quantum-runtime entries match the investigated baseline: no dedicated implementation located. Existing provider/model registries are real and must be extended instead of duplicated. They do not have immutable model-artifact/promotion semantics. `SkillEvolutionService.promote` promotes governed skill versions, not model weights. Existing business experiments are not optimization solvers or training experiments.

The general Docker artifact sandbox still refuses the real default runner for unverified disk containment; it is not a prerequisite for fixed read-only MCP fixture execution, nor a usable training worker. No audit claim is upgraded merely from these adjacent services. MCP-1A will add a narrow new claim and retain the broader universal-runtime gap.

Mandatory audit documents 00–07, 10–11 and 13–15 were reviewed, including the full JSON register and its status semantics. Institutional source maps are corroborated against current source rather than treated as authority.

## Post-investigation discrepancy

The earlier audit’s dependency-audit evidence is historical. The current advisory query reports inherited Zod/Fastify/fast-uri findings, including SDK paths to existing vulnerable versions. Original HEAD lockfile entries confirm those versions predate this slice. No zero-advisory claim is carried forward; see the current risk and dependency-audit log.
