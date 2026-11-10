# Phased implementation roadmap

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

| Order | Independently reviewable slice       | Deliverables / acceptance dependency                                                                                  |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 0     | Program plan and baseline            | Reuse map, source/status provenance, threat model and current validation                                              |
| 1     | MCP-1A local read-only               | Fixed stdio server/tool, strict contracts, central permissions/policy/audit, signed route, faults and real child test |
| 2     | MCP-1B/2 registration lifecycle      | Reviewed server/schema versions, binding/health/revocation and disposable-DB restart/concurrency; no arbitrary launch |
| 3     | CODER-1 accepted data + evaluation   | Synthetic accepted example through rights/privacy/dedup/holdouts/review/versioned manifest; CPU harness               |
| 4     | MODEL-1 inert artifacts + simulation | Immutable checksums/lineage/evaluation/review, simulated failure and deterministic rollback                           |
| 5     | QUANTUM-1 classical research         | Bounded binaries/conversions, verifier, seeded generator, exact+greedy and repeatable report                          |
| 6     | MCP-3 remote read-only               | Authenticated Streamable HTTP, SSRF/origin/credential/network/rate/reconnect conformance                              |
| 7     | MODEL-2 / CODER-2                    | Accepted local inference baseline; authorized training stack/scripts, hardware calibration and rights-ready dataset   |
| 8     | MCP-4 / MODEL-3                      | Separate side-effect semantics and staging deployment with exact approval/reconciliation                              |
| 9     | MODEL-4/5                            | Accepted canary/rollback and separately reviewed production promotion                                                 |
| 10    | QUANTUM-2+ / distillation charter    | Only after scientific baseline/rights/compute acceptance; no bundled claims                                           |

Each row begins with an updated implementation map/ADR/threat/data flow, shared contracts/API/persistence plan, tests and acceptance/rollback. Do not implement rows 2–10 in this run. Later independent low-risk research planning may proceed concurrently, but execution gates and authority dependencies cannot be bypassed.

Milestones are evidence gates, not promised dates or staffing. Priority favors concrete owner value and safe reproducibility. No production credential, GPU, paid model or quantum job is needed for rows 0–5. GPU pilots, remote effects and deployment require separate authorization and cost ceilings.
