# Personality Corpus Schemas

Shared schemas live in
`/Users/arjunaravapalli/personalassistant/personalassistant/packages/shared/src/personality-corpus.ts`
and are exported through the shared package.

The main runtime records are:

- `CorpusManifest`
- `CorpusVersion`
- `CorpusEntry`
- `CorpusValidationIssue`
- `CorpusValidationResult`
- `CorpusImportRecord`
- `CorpusDashboardResponse`
- `CorpusTestUtteranceRequest`
- `CorpusTestUtteranceResponse`

`CorpusEntry` is the normalized envelope for corpus data. It includes stable
IDs, corpus version, domain, utterance, normalized utterance, intent, entities,
deterministic and vector-seed flags, non-execution flags, blocked intents, risk
level, source section, source line, enabled state, and bounded raw metadata.

The runtime imports entries into existing domain records such as vocabulary,
aliases, patterns, response templates, social rules, profiles, and memory
records. Corpus provenance remains attached through corpus tables and metadata.

