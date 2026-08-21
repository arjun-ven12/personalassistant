# Human Understanding Operations

Operational checklist:

1. Run `pnpm db:migrate:deploy` before using PostgreSQL mode.
2. Open the dashboard Personality page to verify bootstrap status.
3. In the Personality Seed Corpus section, verify the active corpus version,
   manifest checksum, validation status, and import history.
4. Use simulation to inspect tokenization, aliases, patterns, entities,
   confidence, and Planner context before wiring new voice phrases.
5. Check clarifications before enabling new patterns.
6. Review confidence history when a phrase is unexpectedly escalated.
7. Use the Personality Studio “Why did I respond this way?” inspector to verify
   response influences without exposing hidden reasoning.
8. Use the corpus utterance simulator to inspect normalized input,
   negative-example matches, deterministic candidates, and AI fallback status.
9. Confirm profile switching changes response/planner context only and never
   grants new capabilities.
10. Confirm learning events require repeated evidence before preferences become
   active.

Expected performance targets:

- vocabulary lookup under 5ms
- alias lookup under 5ms
- intent recognition under 10ms
- context resolution under 10ms
- vector retrieval under 30ms
- overall understanding under 50ms for ordinary commands
