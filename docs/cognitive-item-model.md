# Cognitive Item Model

`CognitiveItem` is a normalized read model for owner-facing inspection. It
contains bounded metadata from existing cognitive systems without copying or
replacing their canonical records.

## Covered sources

- memory records and engineering decisions;
- memory graph nodes and relationships;
- Personal Knowledge Graph entities, relationships, facts, and conflicts;
- learning events, candidates, preferences, habits, sequences, and suggestions;
- personality traits, rules, decision preferences, and working styles;
- Human Understanding aliases, vocabulary, patterns, and templates;
- semantic examples and embedding references.

## Fields

Each item has an owner scope, type, canonical source, title, summary, confidence,
status, retention class, sensitivity class, provenance list, tags, related IDs,
version, timestamps, archive state, and pin state.

## Non-authority rule

`CognitiveItem` can inform retrieval, explanation, and review. It never grants
permissions, approves work, executes actions, changes trusted devices, or
bypasses Planner, policy, approval, audit, CSRF, recent authentication, or
emergency stop.
