# Personality Corpus Tooling

The Part 3 tooling is implemented by
`/Users/arjunaravapalli/personalassistant/personalassistant/apps/api/src/scripts/personality-corpus.ts`.

Useful commands:

```bash
pnpm personality:validate
pnpm personality:compile
pnpm personality:stats
pnpm personality:diff <left.md> <right.md>
PERSONALITY_OWNER_ID=<owner_uuid> pnpm personality:import
PERSONALITY_OWNER_ID=<owner_uuid> pnpm personality:test-utterance "bro just open vscode"
pnpm personality:reindex
```

`personality:validate` prints manifest and validation counts with critical
issues first. `personality:compile` writes the structured `/personality`
package. `personality:import` is idempotent and activates the corpus only when
critical validation passes.

`personality:reindex` intentionally delegates to the existing retrieval
infrastructure; Part 3 does not create a new vector database.

