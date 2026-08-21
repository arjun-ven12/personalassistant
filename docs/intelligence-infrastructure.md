# Intelligence Infrastructure

Phase 9 adds production infrastructure for the cognitive memory layer:

- Redis-backed hot cache and coordination
- pgvector-ready embedding storage
- embedding job boundaries
- hybrid memory retrieval
- infrastructure health reporting
- worker queue status

PostgreSQL remains the only source of truth. Redis stores temporary state only.
pgvector stores embeddings only.

## Redis

The API supports two Redis configuration modes.

### Upstash REST

```env
REDIS_URL=https://example.upstash.io
REDIS_TOKEN=...
```

### Standard Redis

```env
REDIS_HOST=redis.internal
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=...
REDIS_TLS=true
```

All keys are namespaced:

```text
{REDIS_NAMESPACE}:cache:memory:{id}
{REDIS_NAMESPACE}:lock:embedding:{id}
{REDIS_NAMESPACE}:cache-events:memory
```

Redis is used for cache, invalidation events, pub/sub publishing, and
distributed lock hooks. It is not authoritative state.

## Cache

`CacheService` implements:

- read-through JSON cache helpers
- TTLs
- invalidation
- cache-event publishing
- hit/miss/write metrics

Configured TTLs:

- `CACHE_DEFAULT_TTL`
- `CACHE_CONTEXT_TTL`
- `CACHE_MEMORY_TTL`
- `CACHE_REPOSITORY_TTL`

## pgvector

Migration `0012_phase_9_intelligence_infrastructure.sql` runs:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

It adds a `vector(1536)` column to `memory_embeddings` and creates an ivfflat
cosine index. If the database cannot install pgvector, production migrations
fail closed.

## Embeddings

The API supports an OpenAI embedding boundary using
`text-embedding-3-small` by default. The implementation calls the OpenAI
Embeddings API only when all of these are true:

- `EMBEDDING_PROVIDER=openai`
- `OPENAI_API_KEY` is configured server-side
- semantic retrieval is enabled

The key is never exposed through frontend bundles, logs, Electron IPC, or API
responses.

Local development may use:

```env
EMBEDDING_PROVIDER=disabled
SEMANTIC_SEARCH_ENABLED=false
FEATURE_VECTOR_SEARCH=false
```

In that mode, hybrid retrieval falls back to deterministic lexical similarity.

## Hybrid retrieval

`RetrievalService` ranks memories by:

- keyword match
- vector/deterministic similarity
- recency
- importance
- confidence
- owner/repository/workflow/agent filters

Hybrid search never relies solely on vector similarity.

## Workers

`WorkerService` currently exposes bounded queue metrics and embedding-job
boundaries. Durable worker persistence tables are created by migration `0012`
for later background processors:

- `embedding_jobs`
- `worker_jobs`
- `worker_history`
- `queue_events`

Workers do not execute arbitrary commands and do not mutate repositories.

## API

Authenticated owner APIs:

- `GET /api/infrastructure/status`
- `GET /api/infrastructure/redis`
- `GET /api/infrastructure/cache/metrics`
- `GET /api/infrastructure/workers`
- `GET /api/infrastructure/embedding-jobs`
- `POST /api/infrastructure/hybrid-search`

Hybrid search is a cookie-authenticated mutation-style request and requires
trusted origin plus CSRF.

## Dashboard

The Infrastructure page displays:

- Redis status
- cache hit rate
- pgvector status
- worker queue state
- retrieval configuration
- embedding jobs

It does not expose secrets or internal connection strings.

## Production checklist

1. Use `STORE_MODE=postgres`.
2. Run `pnpm db:migrate:deploy`.
3. Confirm pgvector extension is available.
4. Configure Redis.
5. Configure `OPENAI_API_KEY` if semantic search is enabled.
6. Keep `FEATURE_AUTONOMOUS_SUGGESTIONS=false`.
7. Run `pnpm verify:production-config`.
8. Confirm `/api/infrastructure/status` from the authenticated dashboard.
