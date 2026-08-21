# Repository intelligence

Phase 4.1 added metadata-only repository intelligence for registered
workspaces. Phase 4.2 adds semantic metadata for TypeScript and JavaScript. It
does not add writes, shell execution, Git mutation, application control,
browser automation, Codex, AI calls, or a generic executor.

The API owns repository records, generations, jobs, search, tree, and file
inventory queries. The Mac agent owns only the fixed
`repository.scan_metadata` read-only capability, reached through the existing
signed execution pipeline. API handlers never traverse the filesystem directly.

## Lifecycle

Repositories are owner scoped and workspace scoped. A registered workspace is
represented as a repository in one of these states: `UNINDEXED`, `INDEXING`,
`INDEXED`, `STALE`, `FAILED`, or `REINDEX_REQUIRED`.

Owner re-index requests create a repository index job and then create a normal
read-only execution request for `repository.scan_metadata`. The existing
controls still apply: owner session, CSRF, private network, trusted Mac device,
policy evaluation, emergency stop, server signature, device signature, replay
protection, result digest, and retention limits.

Only one active index job may exist per repository. Failed scans mark the job
failed and never replace the previous successful generation.

## Metadata model

The active generation stores only metadata:

- relative file and directory paths
- file size and modified timestamp
- extension, language, and classification
- metadata fingerprints
- extension, language, and classification counts
- largest files by size, without contents
- technology hints from well-known filenames and metadata
- semantic symbols, imports, exports, references, relationships, discovered API
  route hints, database model hints, architecture graph nodes/edges, and bounded
  repository insights

Absolute host paths, file contents, binary payloads, secrets, private keys,
cookies, tokens, and blocked-pattern internals are not stored in repository
records or returned by repository APIs.

## APIs

Authenticated owner routes:

- `GET /api/repositories`
- `GET /api/repositories/:repositoryId`
- `POST /api/repositories/:repositoryId/reindex`
- `GET /api/repositories/:repositoryId/tree`
- `GET /api/repositories/:repositoryId/files`
- `GET /api/repositories/:repositoryId/search`
- `GET /api/repositories/:repositoryId/statistics`
- `GET /api/repositories/:repositoryId/semantic-search`
- `GET /api/repositories/:repositoryId/definition`
- `GET /api/repositories/:repositoryId/references`
- `GET /api/repositories/:repositoryId/dependencies`
- `GET /api/repositories/:repositoryId/architecture`
- `GET /api/repositories/:repositoryId/api-routes`
- `GET /api/repositories/:repositoryId/database-models`
- `GET /api/repositories/:repositoryId/insights`

Re-index is a cookie-authenticated mutation and requires CSRF and private
network verification. Query routes read only indexed metadata and never touch
the live filesystem.

## Semantic intelligence

Semantic code intelligence is documented in
[semantic-code-intelligence](semantic-code-intelligence.md).
The read-only engineering reasoning layer is documented in
[ai-software-engineer](ai-software-engineer.md).

## Limitations

Phase 4.2 performs AST-based TypeScript/JavaScript metadata extraction. It does
not perform source-content search, package-manager execution, language-server
execution, build-tool execution, or framework-perfect whole-program type
checking.
