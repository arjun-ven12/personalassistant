# Phase 19C Implementation Report

## Delivered

- Shared Learning Engine schemas in `packages/shared`.
- `LearningEngineService` with deterministic evidence accumulation.
- Category policy registry with thresholds, decay, auto-apply, confirmation,
  sensitivity, and reversibility settings.
- First-class learning events, candidates, learned preferences, sequences,
  habits, suggestions, conflicts, timeline, stats, and explanations.
- In-memory and PostgreSQL stores.
- Migration `0051_phase_19c_learning_engine.sql`.
- Authenticated `/api/learning` routes with CSRF on mutations.
- Developer CLI commands for stats, candidates, simulation, decay/recompute,
  conflicts, export, explain, and reset-denied behavior.
- Private mode and do-not-learn exclusion.
- Manual teaching as locked owner-controlled preference.
- Suggestion rejection cooldowns.
- Low-risk auto-apply only for allowed reversible categories.
- High-impact categories blocked from auto-apply.
- Focused regression tests for Phase 19C scenarios.

## Security Posture

- No new memory engine.
- No new vector database.
- No new planner or intent engine.
- No LLM-dependent learning decision.
- No autonomous workflow creation.
- No learning-derived authorization.
- No policy, approval, device trust, or security bypass.
- No raw secret metadata persistence.

## Known Limitations

- Learning Studio UI is backend-ready but not fully expanded yet.
- Redis hot windows and pgvector-assisted deduplication are not enabled in this
  first slice.
- Knowledge Graph confidence evolution is prepared through event categories but
  not deeply merged into graph fact scoring yet.
- Export/import and rollback are represented by schema/versioning foundations
  but need dedicated owner-facing tooling.

## Phase 19D Boundary

Phase 19D Memory Studio should build on this by adding owner-facing memory and
learning management views, richer export/import, rollback workflows, and
cross-surface visualization. It should not begin automatically from Phase 19C.
