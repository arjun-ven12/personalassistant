# Foundation Four: optimization research runtime

> Program version 0.1 · 2026-10-26 · INTERNAL REVIEW DRAFT
> Only MCP-1A is authorized for implementation in this run. Other foundations are designs and acceptance plans.

## Status and scope

**PLANNED classical benchmark; quantum research remains RESEARCH/UNKNOWN implementation.** Existing AI benchmark and business experiment records provide governance/evidence patterns, not optimization solvers. Implement no quantum code in MCP-1A. The first later QUANTUM-1 slice runs offline CPU-only on synthetic bounded binary problems.

## Representation and mathematical convention

Shared schemas should bound unique binary variable IDs, finite coefficients, linear/quadratic terms, hard constraints with sense/bounds, seed and finite solver configs. Define energy as `c + Σ a_i x_i + Σ_(i<j) b_ij x_i x_j`, with binary x. Store upper-triangular interactions once; reject duplicate/conflicting terms and NaN/infinite values. Feasibility uses original hard constraints, independently of any penalty energy.

For `x_i=(1+s_i)/2`, s in {-1,+1}, the same objective is Ising: `J_ij=b_ij/4`, `h_i=a_i/2+Σ_(j≠i)b_min(i,j),max(i,j)/4`, and offset `c+Σ a_i/2+Σ_(i<j)b_ij/4`. Verify all assignments on small instances and preserve offset. A symmetric matrix convention would double off-diagonal contribution unless normalized; label convention explicitly.

A supported squared linear equality penalty expands into a QUBO only with documented coefficient bounds and penalty rationale. Not every hard constraint is safely replaced by an arbitrary large penalty. Independent verification always reports original feasibility/violations; infeasible low energy is not a successful solution.

## Solvers and experiments

First implement exhaustive enumeration for <=16 binary variables and a deterministic greedy baseline; add seeded simulated annealing in a follow-up or the same bounded slice only after exact/verifier acceptance. All are classical. CP-SAT/MILP are future optional stronger baselines; [Google OR-Tools](https://github.com/google/or-tools) is a candidate Apache-2.0 project, requiring pinned runtime/dependency/platform review before integration. No such solver is claimed installed here.

Proposed generator: seeded small weighted independent-set or bounded binary quadratic instances; bind instance bytes/hash, variable/constraint bounds and generator version. Exact enumeration provides oracle objective/feasibility for small cases. Heuristics use the same original objective/constraints; report feasibility before objective gap. Separate time budget and iteration budget, and never reward an infeasible solution as best.

Every experiment records hypothesis/problem family, generator/seed, solver/config/code hash, hardware/OS/runtime, wall-clock time, objective/energy offset, assignment hash, original constraint violations, exact/greedy comparison, repeated seeds and uncertainty. Report heuristic success proportion and paired objective gaps with sample count; use an explicitly stated interval procedure when appropriate. Deterministic runs do not need artificial confidence intervals; timing variability still needs repeated measurement. No speed/quality claim from inconsistent problem definitions.

Example planned experiment: compare greedy with 20 independently seeded annealing runs on fixed 12-variable instances, exact oracle per instance; report all feasibility and paired gaps/runtime, including failures. A generated JSON/Markdown report must be reproducible from the versioned manifest. This experiment is not run by MCP-1A and establishes no quantum advantage.

## Phases and security

QUANTUM-1: schemas, independent verifier, convention conversions, generator, exact+greedy, deterministic tests and example report. QUANTUM-2: annealing schedules, bounded adaptive neighborhoods/populations/decomposition with classical baselines and preregistered analysis. QUANTUM-3: reviewed local simulator adapter with explicit resource caps. QUANTUM-4: separately approved remote provider/account, budget reservation, finite job schemas, cancellation, expiry, receipts and reconciliation. Remote access remains disabled until then.

Finite solver IDs/config values only; no expression evaluation, imported plugins, arbitrary code, caller filesystem paths or unrestricted worker launch. Company/project authorization and stop apply before allocation and result acceptance. Synthetic fixture stage needs CPU and bounded memory; paid/GPU/remote quantum resources require separate approval.

Test enumeration against hand-calculated instances, conversion round trips/all-assignments equivalence, constraint conflicts, seed repeatability, independent rejection of tampered/infeasible outputs, iteration/time limits, cancel/stop and scope denial. Persist immutable reports through existing approved artifact/store patterns where necessary; no new science database by default. Rollback disables finite capability and retains reports/audit, with no production allocation changes.
