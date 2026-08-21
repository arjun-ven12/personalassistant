# AI software engineer

Phase 4.3 adds a read-only engineering reasoning layer on top of repository and
semantic intelligence. It does not call external AI providers and does not
modify code. The service uses indexed repository metadata to build bounded
context bundles and produce evidence-cited explanations, impact analyses,
implementation plans, code-review findings, and generated documentation.

## Capabilities

- Engineering questions about repositories, modules, files, symbols, APIs,
  database models, components, and workflows
- Change impact analysis with affected files, symbols, APIs, database models,
  frontend nodes, test impact, and risk level
- Implementation plans with order of work, risk, migration, testing, and rollback
  strategy
- Bug-investigation starting points from symbols, references, routes, models,
  dependencies, architecture nodes, and insights
- Code review from indexed metadata and repository insights
- Architecture and documentation generation from stored metadata
- Short-term engineering memory scoped to the authenticated session

## Evidence model

Every response includes:

- repository ID and active generation
- evidence records with kind, label, relative path, optional line, and detail
- confidence score
- insufficient-evidence flag where applicable
- current short-term engineering memory

The answer generator is deliberately conservative. If the active generation is
missing or the context builder cannot find relevant symbols, files, routes,
models, references, dependencies, or insights, it says that evidence is
insufficient.

## APIs

Cookie-authenticated, CSRF-protected owner routes:

- `POST /api/repositories/:repositoryId/engineering/question`
- `POST /api/repositories/:repositoryId/engineering/impact`
- `POST /api/repositories/:repositoryId/engineering/plan`
- `POST /api/repositories/:repositoryId/engineering/review`
- `POST /api/repositories/:repositoryId/engineering/documentation`
- `GET /api/repositories/:repositoryId/engineering/memory`

These routes query stored repository metadata only. They do not traverse the
live filesystem and do not trigger repository re-indexing or execution.

## Security boundary

Phase 4.3 remains read-only:

- no file writes
- no Git writes
- no shell execution
- no browser automation
- no application control
- no code edits
- no autonomous execution
- no generic executor

The context builder only uses bounded indexed metadata from immutable repository
generations. Responses never include source-code snippets, raw file contents,
absolute host paths, credentials, cookies, tokens, private keys, or blocked
secret files.

## Limitations

This is a deterministic evidence-based reasoning layer, not a free-form LLM
agent. It can explain and plan from indexed metadata, but it cannot guarantee a
complete whole-program trace where semantic metadata is sparse or unsupported.
Re-index the repository after material changes before relying on impact or
architecture answers.
