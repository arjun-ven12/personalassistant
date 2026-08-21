# Personality Seed Corpus

Phase 19A Part 3 turns the canonical seed corpus Markdown into structured,
versioned runtime data. The corpus is not a prompt and is not sent wholesale to
an AI model.

The canonical source is:

`/Users/arjunaravapalli/Downloads/Alexa_Personality_Seed_Corpus_v4_coverage_safety.md`

The compiled runtime package is generated under `/personality`:

- `core/` for identity, traits, policies, and social rules.
- `language/` for vocabulary, aliases, patterns, intents, entity types, and
  normalization.
- `responses/` for bounded response templates.
- `examples/` for deterministic utterance, ASR, context, and negative examples.
- `profiles/` for Default, Founder, Developer, Research, Trading, Focus, and
  Presentation profiles.
- `learning/`, `planner/`, `voice/`, `gestures/`, and `agents/` for bootstrap
  preferences and inheritance metadata.

Runtime data is imported into existing Phase 19A tables where possible.
Corpus-specific tables store provenance, versions, import records, entries, and
validation results. They do not replace the Human Understanding store, Memory
Infrastructure, pgvector, Planner, or Intent Engine.

## Resolution precedence

Runtime interpretation uses this order:

1. Security and governance.
2. Manual locked owner preferences.
3. Explicit current-turn correction.
4. Approved learned aliases and preferences.
5. Active personality profile.
6. Base personality corpus.
7. Generic semantic retrieval.
8. Clarification.
9. AI fallback.

Embeddings are retrieval context only. They never authorize execution.

## Validation

`CorpusValidator` checks duplicate IDs, duplicate utterances, ambiguous
utterances, negative/executable conflicts, alias collisions, quoted executable
phrases, and high-risk conflicting mappings.

Ordinary contextual ambiguity is a warning so the corpus can still boot and the
Human Understanding pipeline can clarify. High-risk or negative/executable
conflicts remain critical and block activation.

