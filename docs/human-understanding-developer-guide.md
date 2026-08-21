# Human Understanding Developer Guide

Use the shared schemas in
`/Users/arjunaravapalli/personalassistant/personalassistant/packages/shared/src/human-understanding.ts`.

Backend implementation lives in:

- `/Users/arjunaravapalli/personalassistant/personalassistant/apps/api/src/human-understanding/service.ts`
- `/Users/arjunaravapalli/personalassistant/personalassistant/apps/api/src/human-understanding/store.ts`
- `/Users/arjunaravapalli/personalassistant/personalassistant/apps/api/src/human-understanding/postgres-store.ts`
- `/Users/arjunaravapalli/personalassistant/personalassistant/apps/api/src/routes/human-understanding.ts`

Rules:

1. Add deterministic vocabulary, alias, synonym, and pattern rules first.
2. Reuse the existing memory/vector retrieval service for examples only.
3. Do not add another planner, command engine, memory system, vector database, or
   AI router.
4. Do not use model output as authority.
5. Persist explainable confidence and clarification records.
6. Add Personality Core Part 2 records through the existing
   `HumanUnderstandingStore`; do not create another personality store.
7. Keep `plannerInput.personalityCore` advisory. It may influence wording,
   small deterministic preferences, and planning context, but it must never
   grant permissions, approvals, provider health, or execution authority.
8. Add seed corpus data through the Part 3 compiler/importer instead of
   hardcoding utterances into services. Corpus entries must become structured
   vocabulary, alias, pattern, response, profile, and memory records.

Useful corpus commands:

```bash
pnpm personality:validate
pnpm personality:compile
PERSONALITY_OWNER_ID=<owner_uuid> pnpm personality:import
PERSONALITY_OWNER_ID=<owner_uuid> pnpm personality:test-utterance "bro just open vscode"
```
