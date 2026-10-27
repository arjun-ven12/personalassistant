# Recommended priorities and acceptance gates

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Prioritization principle

Prove useful, supervised outcomes before adding institutional breadth. Preserve the existing control paths and default denial. The sequence below prioritizes material evidence gaps and architectural risks; it does not authorize implementation, external effects, credentials or production changes. No duration, staffing commitment or budget is assumed.

## P0 — Establish a reliable baseline and accepted authority

**1. Preserve and reconcile the source baseline.** The audit covers a dirty workspace that differs from GitHub main. Review existing local changes, identify intended branch/release, compare a separate latest-remote checkout and retain hashes/decisions. **Owner:** Engineering maintainer. **Acceptance:** documented source snapshot and reviewable delta; no lost/unintended source edits; capability evidence points at accepted content. **Why first:** an institutional claim cannot be reproducible if its implementation version is ambiguous.

**Existing CI hygiene:** repository-wide formatting currently fails on 445 pre-existing files. Resolve through a separately scoped formatting change; this audit formats only its own artifacts and preserves all existing source bytes.

**2. Exercise durable governance and recovery on disposable PostgreSQL.** Run the isolated-schema migration suite, tenant rejection, exact approval binding, replay, lease fencing, duplicate dispatch, budget and audit restart/concurrency scenarios. **Owner:** Security/Infrastructure with domain maintainers. **Acceptance:** no effect on denied/unknown/revoked/stale state; single claimed action under races; retained evidence after restart; migration status known. **Dependencies:** explicit disposable DB with required extensions. **Risk controlled:** in-memory fixtures hide database isolation and failure behavior.

**3. Accept one signed Mac engineering workflow.** Use a disposable registered repository, trusted device, reviewed local images and explicit task criteria. Cover normal delivery, stale file hash, conflicting tasks, cancellation, revoked trust, failed validation, independent review and guarded local merge. **Owner:** Engineering + independent Security/QA reviewer. **Acceptance:** real operation/check receipts, preserved dirty work, exact authorization and measured human acceptance. **Dependencies:** P0 baseline and durable store. **Non-claim:** no public deployment or universal autonomous coding.

**4. Keep the general cloud artifact sandbox disabled until containment is accepted.** Decide whether a quota-contained worker is actually needed for the first product. **Owner:** Infrastructure/Security. **Acceptance before enablement:** resource/disk isolation, network deny, secret exclusion, artifact boundaries, kill/restart and independent adversarial review. **Tradeoff:** retain Mac dependency now versus a larger new remote containment obligation.

## P1 — Demonstrate the highest-value owner workflows

**5. Complete Android acceptance against the same governance API.** Build/unit test with compatible JDK/SDK, then emulator/device signing, biometric grant, foreground reconnect, session revoke, stop and approval inbox. **Acceptance:** no duplicate command, no biometric/voice assumption from ordinary login, and correct software-key fallback disclosure. No parallel execution path.

**6. Accept one sourced research objective.** Choose a founder-defined question and utility criteria; capture actual provider search receipts, authorized sources, bounded output, original-scope review and contradictory/missing evidence handling. **Acceptance:** source support verified for the requested claims, not merely a URL count or fluent prose; record cost, latency, intervention and unresolved uncertainty. **Owner:** proposed Intelligence Lab sponsor.

**7. Accept one finite external business workflow.** Prioritize a real owner need, starting with read-only health and safe test-account operations. **Acceptance:** exact account/company binding, current permission/stop/approval, independently reconciled terminal state, duplicate prevention and unknown-outcome recovery. Credential provisioning and any send/spend effect require their separate authorization. Missing CRM/support/document/project/GitHub adapters should remain unavailable until reviewed implementations exist.

**8. Align claims and coverage with reality.** Replace broad “supported” labels with declared/implemented/configured/fixture-verified/live-verified distinctions. Surface native unsupported operations, placeholder workspace objects, legacy keyword-only retrieval, missing provider adapters and cloud denial. **Acceptance:** each user-facing claim maps to a capability ID and evidence scope; no verified status from schema alone.

## P2 — Make institutional collaboration possible

**9. Approve mandates and human decision rights.** Founder defines institutional status, mission, first product/service and accountable humans; appoint documentation/security/data stewards. **Acceptance:** current versus proposed divisions, actual roles and reserved decisions recorded without inventing employees/clients/legal form.

**10. Implement Organization Control incrementally after design review.** Start with identity/tenancy mapping and read-only effective-access views, then bounded internal access requests/clearances, invitations/offboarding and external reconciliation. **Acceptance:** strict shared schemas, authorization before data exposure, exact approval, expiry/revocation, reviewer independence and adversarial tenant tests. No inheritance of authority from Agent Society titles.

**11. Turn this audit into reviewed documentation sources.** Adopt stable capability/sector/evidence/publication metadata, appoint owners, validate references and flag source-impact review in CI. **Acceptance:** stale public claims block release; source changes never silently rewrite approved prose. First public artifact should be a tightly reviewed prospectus and contributor guide based on accepted workflows.

## P3 — Expand only after baseline evidence

**12. Define AthenaCoder/MCP/distillation contracts.** Decide product/training/dataset/runtime scope; specify rights, held-out evaluations, privacy, budgets and finite tool mappings. **Acceptance:** a named contract with implementation and test requirements; existing adjacent modules remain separate evidence.

**13. Build one governed creative/marketing path.** Establish versioned brand brief/assets/rights and factual claim sources before implementing generation/export or platform publication. **Acceptance:** reviewed package and edit invalidation first; publication requires separately reviewed finite provider, registered account, exact approval, receipt and verification. Keep current social blockage until then.

**14. Charter focused research.** Machine Intelligence Lab begins with reproducible intent/retrieval/delegation evaluation; Quantum Systems Research begins with literature/replication feasibility. **Acceptance:** hypotheses, qualified reviewers, rights, resource limits and reproducibility, including negative results. No claimed novel results from proposed charters.

## Founder choices with the greatest architectural effect

- Which one outcome should Athena reliably complete for whom, under what supervision?
- Is multi-human client/collaborator access required before broader provider work?
- Is Mac-offline engineering a necessary product promise, justifying cloud-worker containment work?
- Does AthenaCoder mean a product, dataset, model checkpoint or local coding experience?
- Which institutional statements and source evidence may be public?
- Who has human authority over access, scientific claims, spending, releases and incident recovery?

These decisions can be made from concrete options and evidence; implementation should not guess them. Continue useful current acceptance work while each independent institutional question is resolved.

## Completion evidence for this audit

The requested sixteen named files and supporting evidence indexes are present under this directory. The capability register distinguishes significant subsystem claims, narrower provider/runtime claims and UNKNOWN named ambitions. All twelve publication plans and ten proposed division mandates are included. Local typecheck/lint/test/build and repository/config invariants were rerun; current results and exclusions are in `14_EVIDENCE_AND_GAPS.md` and `evidence/validation-results.json`. No source implementation, production permission, external publication, commit or push is part of this audit.

## MCP-1B supplemental evidence — 2026-10-26

The historical audit baseline above is retained. The MCP-1B candidate based on merged `90c77ec` now has 63 passing focused assertions, including 16 PostgreSQL assertions against a newly created disposable local cluster. This closes the bounded MCP migration/store/replay/revocation/API-reconstruction evidence gap; it does not close all platform-wide durable governance or provider acceptance gaps. The historical ten Zod/Fastify/fast-uri advisory entries are resolved by scoped same-major updates, while the whole dependency audit still fails. Release decision: **REQUIRES_ADDITIONAL_VALIDATION**. See [current MCP-1B acceptance report](../athena-four-foundations/implementation-logs/mcp-1b/ACCEPTANCE_REPORT.md). No production enablement or permission expansion is authorized by this evidence.
