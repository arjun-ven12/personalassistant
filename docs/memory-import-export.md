# Memory Import And Export

Phase 19D implements safe export for owner review. Import remains a documented
future extension because canonical source-specific mutation rules need separate
review.

## Export

`GET /api/memory-studio/export` and `pnpm memory:export` produce a sanitized
JSON bundle containing cognitive item metadata, provenance summaries, and item
counts.

Exports omit raw vectors, secrets, hidden reasoning, raw prompts, secure text,
raw audio, camera frames, screenshots, tokens, cookies, private keys, recovery
codes, authentication codes, and sensitive action arguments.

## Import boundary

Future import must validate source type, owner scope, provenance, confidence,
retention, conflicts, schema version, and source-specific write authority before
any canonical record changes are allowed.
