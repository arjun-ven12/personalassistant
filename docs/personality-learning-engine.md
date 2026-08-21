# Personality Learning Engine

Learning in Phase 19A is statistical and evidence-based.

Observed preferences are stored with:

- value
- evidence count
- confidence
- source
- first/last seen timestamps
- decay
- manual override
- explanation

Preferences do not become active immediately. The default implementation marks a
preference active only after repeated evidence. Manual overrides are explicit,
owner-scoped, and reversible.
