# External architecture harvest

Phase 23.0 inspected the pinned, read-only research repositories below. They are
not workspace packages, dependencies, runtime plugins, or production data
sources. Alexa contains no imported external runtime.

| Project                           | Commit                                     | License | Direct copying | Attribution                       |
| --------------------------------- | ------------------------------------------ | ------- | -------------- | --------------------------------- |
| `garrytan/gbrain`                 | `4e4677b1b992df42a2cb862565798f667ebacfb3` | MIT     | Permitted      | Preserve copyright and MIT notice |
| `NousResearch/Hermes-Agent`       | `f293e7206b4ddd66042329442c6afebc19a8808d` | MIT     | Permitted      | Preserve copyright and MIT notice |
| `affaan-m/everything-claude-code` | `d8409a4b0813771235555e32e3d8046a73988bfa` | MIT     | Permitted      | Preserve copyright and MIT notice |

The authoritative machine-readable integration manifest is
`apps/api/src/external-harvest/manifest.ts`. Every harvested item has exactly one
classification: `COPY_DIRECTLY`, `ADAPT_INTO_ALEXA`, `USE_AS_REFERENCE`,
`ALREADY_HAVE`, or `REJECT`.

No source file was copied directly in this phase. The implementation uses
independently authored Alexa schemas and services informed by the cited public
patterns. External repositories remain excluded from lint, type checking,
tests, builds, runtime indexing, repository scanning, and dev watchers.

## Authority boundary

- AI reasoning remains behind AIRouter.
- Memory access remains owner scoped through Alexa Memory.
- Delegation may only reduce server-owned agent capabilities and memory scopes.
- Prepared delegations are advisory and do not execute.
- The only declared sandbox profile is the existing registered validation path,
  with no host shell, arbitrary commands, network access, or host writes.
- Imported reviewers produce evidence only; they cannot approve work.

## MIT attribution

Concepts and source references were reviewed from:

- Copyright (c) 2026 Garry Tan
- Copyright (c) 2025 Nous Research
- Copyright (c) 2026 Affaan Mustafa

The complete upstream MIT license texts remain in each read-only repository's
`LICENSE` file. If a future phase copies a substantial source file, its required
notice must travel with the adapted file.
