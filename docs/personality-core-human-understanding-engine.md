# Phase 19A — Personality Core & Human Understanding Engine

Phase 19A adds a deterministic Human Understanding Layer before the existing
Intent Engine and Planner.

The implementation is deliberately model-independent:

- vocabulary, aliases, synonyms, patterns, behaviour rules, context, memory
  retrieval, and confidence scoring run first;
- the existing vector/memory infrastructure is used only for retrieval context;
- embeddings never make decisions;
- AI fallback is represented as a confidence outcome and remains a capability
  provider, not the personality, planner, or memory.

## Runtime pipeline

The backend `HumanUnderstandingService` executes:

Voice/Text → Tokenizer → Normalization → Vocabulary → Aliases → Synonyms →
Pattern Recognition → Behaviour Rules → Intent Classification → Entity
Resolution → Context Resolution → Existing Memory/Vector Retrieval → Confidence
Engine → Planner context.

Every stage records bounded input, output, confidence, explanation, timing, and
an audit event label. Sensitive values and raw audio are not stored.

## Services

Phase 19A introduces independently testable service boundaries:

- `HumanUnderstandingService`
- `PersonalityCoreService`
- `VocabularyService`
- `AliasResolutionService`
- `SynonymService`
- `PatternRecognitionService`
- `IntentClassificationService`
- `ConfidenceEngine`
- `ConversationStateService`
- `ContextResolutionService`
- `BehaviourRuleEngine`
- `InteractionLearningService`
- `BehaviourStatisticsService`
- `SemanticRetrievalService19A`
- `ClarificationService`
- `PersonalityBootstrapService`

Part 2 extends that runtime with model-independent personality records:

- stable identity;
- bounded traits;
- communication rules;
- interaction policies;
- decision preferences;
- owner working style;
- structured behaviour examples;
- personality simulations;
- response explanation records.

## Voice integration

Final voice transcripts now pass through Human Understanding before creating an
Intent Engine command. Deterministic behaviour rules such as greetings, thanks,
stop, cancel, repeat, and help are answered locally and do not create planner
commands.

Commands that require planning still route through the existing Intent Engine.
Voice remains unable to authenticate, approve high-risk actions, bypass policy,
or execute capabilities directly.

## Studios

The web dashboard exposes a Personality page with:

- Personality Studio profile, communication, working, and decision state;
- identity, traits, interaction policies, decision preferences, and working
  style;
- no-AI personality profile simulation;
- “Why did I respond this way?” response inspector;
- Human Understanding Studio simulation input;
- tokenization, vocabulary, aliases, synonyms, patterns, intent candidates,
  entities, confidence, retrieval, and clarification inspection;
- evidence-based learning and preference status.

## Persistence

Migration `0047_phase_19a_personality_human_understanding.sql` adds
owner-scoped, version-friendly JSONB records for personality profiles, states,
rules, vocabulary, aliases, patterns, confidence history, preference learning,
retrieval history, templates, and profile versions.

Migration `0048_phase_19a_part2_personality_core.sql` adds the Part 2
personality core records: identity, behaviours, communication rules,
interaction policies, decision preferences, working styles, learning events,
preference confidence, simulations, state history, and response explanations.

The phase reuses existing memory tables and retrieval services. It does not add
another vector database.

## Security boundaries

The Human Understanding Layer:

- never bypasses the Intent Engine, Planner, policy, approval, audit, or
  emergency stop;
- never learns across owners;
- never modifies behaviour without evidence records;
- never treats embeddings as decisions;
- never treats AI output as authority;
- stores bounded metadata only.
