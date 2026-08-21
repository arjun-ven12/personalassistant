# Semantic code intelligence

Phase 4.2 extends repository intelligence from file metadata into bounded
semantic metadata. It remains read-only.

The Mac agent parses TypeScript and JavaScript files with the TypeScript AST
parser during the existing `repository.scan_metadata` capability. The API
persists the resulting metadata in immutable repository generations and serves
authenticated owner queries from the database.

## What is indexed

- symbols: classes, interfaces, enums, types, methods, functions, variables,
  constants, React components, and hooks
- imports, exports, and file dependencies
- references: calls, property access, type references, and JSX usages
- symbol relations: inheritance, implementations, ownership, and call edges
- API route hints for common Fastify/Express-style route declarations
- database model hints for TypeScript table/model declarations
- architecture nodes and edges for files, modules, components, hooks, routes,
  services, middleware, tests, configuration, infrastructure, and shared code
- repository insights such as most-imported modules, circular-dependency
  candidates, architecture hotspots, large-component candidates, unused-export
  candidates, and shared utilities

## APIs

Authenticated owner routes:

- `GET /api/repositories/:repositoryId/semantic-search`
- `GET /api/repositories/:repositoryId/definition`
- `GET /api/repositories/:repositoryId/references`
- `GET /api/repositories/:repositoryId/dependencies`
- `GET /api/repositories/:repositoryId/architecture`
- `GET /api/repositories/:repositoryId/api-routes`
- `GET /api/repositories/:repositoryId/database-models`
- `GET /api/repositories/:repositoryId/insights`

These routes read stored metadata only. They do not access the live filesystem.

## Security boundary

Semantic indexing stores names, relative paths, locations, relationships, and
bounded summaries. It does not store source bodies, snippets, binary payloads,
absolute host paths, cookies, tokens, private keys, credentials, or blocked
secret files.

Unsupported languages and oversized files are skipped for semantic extraction.
Parser failures omit semantic metadata for the affected file rather than
widening access. Repository indexing continues to run through the existing
signed, policy-gated, emergency-stop-aware read-only execution pipeline.

Phase 4.2 does not add writes, Git mutation, shell execution, package-manager
execution, browser automation, application control, Codex execution, AI calls,
or a generic executor.

## Limitations

The first implementation focuses on TypeScript and JavaScript. API and database
discovery are AST-based hints, not framework-perfect compilers. Future phases
can add language-specific parsers for Python, Go, Rust, Java, C#, C++, and
Kotlin while preserving the same stored-metadata boundary.
