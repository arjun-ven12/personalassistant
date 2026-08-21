import { useQuery } from "@tanstack/react-query";
import { Boxes, Cpu, Database, Gauge, Network, Search } from "lucide-react";

import type { ApiClient } from "./api.js";

const statusClass = (status: string) =>
  status === "ready"
    ? "success-text"
    : status === "disabled" || status === "not_configured"
      ? "muted-text"
      : "danger-text";

export const InfrastructurePage = ({ apiClient }: { apiClient: ApiClient }) => {
  const status = useQuery({
    queryKey: ["infrastructure-status"],
    queryFn: apiClient.getInfrastructureStatus,
    refetchInterval: 10_000,
  });
  const jobs = useQuery({
    queryKey: ["embedding-jobs"],
    queryFn: apiClient.getEmbeddingJobs,
    refetchInterval: 10_000,
  });
  const data = status.data;

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 9</p>
      <h1>Intelligence Infrastructure</h1>
      <p>
        PostgreSQL remains source of truth. Redis provides hot cache and coordination
        when configured. pgvector stores embeddings only. Hybrid retrieval combines
        keyword, vector, recency, importance, confidence, and owner-scoped filters.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <Network size={14} /> Redis
          </span>
          <strong className={statusClass(data?.redis.status ?? "not_configured")}>
            {data?.redis.status ?? "loading"}
          </strong>
          <small>
            {data?.redis.mode ?? "disabled"} · {data?.redis.latencyMs ?? "—"} ms
          </small>
        </article>
        <article className="status-card">
          <span>
            <Boxes size={14} /> Cache
          </span>
          <strong>{Math.round((data?.cache.hitRate ?? 0) * 100)}%</strong>
          <small>
            {data?.cache.hits ?? 0} hits · {data?.cache.misses ?? 0} misses
          </small>
        </article>
        <article className="status-card">
          <span>
            <Database size={14} /> pgvector
          </span>
          <strong className={statusClass(data?.pgvector.status ?? "disabled")}>
            {data?.pgvector.status ?? "loading"}
          </strong>
          <small>{data?.pgvector.dimensions ?? 1536} dimensions</small>
        </article>
        <article className="status-card">
          <span>
            <Cpu size={14} /> Workers
          </span>
          <strong>{data?.workers.queued ?? 0}</strong>
          <small>
            queued · {data?.workers.running ?? 0} running · {data?.workers.failed ?? 0}{" "}
            failed
          </small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Search size={18} /> Retrieval
        </h2>
        <article className="panel">
          <p className="eyebrow">Hybrid search</p>
          <h3>
            Keyword {Math.round((data?.retrieval.keywordWeight ?? 0.35) * 100)}% ·
            Vector {Math.round((data?.retrieval.vectorWeight ?? 0.65) * 100)}%
          </h3>
          <p>
            Semantic search:{" "}
            {data?.retrieval.semanticSearchEnabled ? "enabled" : "disabled"} · Hybrid
            search: {data?.retrieval.hybridSearchEnabled ? "enabled" : "disabled"}
          </p>
          <small>
            Memory limit {data?.memory.retrievalLimit ?? 12} · threshold{" "}
            {data?.memory.similarityThreshold ?? 0.75} · max context{" "}
            {data?.memory.maxContext ?? 40}
          </small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Gauge size={18} /> Embedding jobs
        </h2>
        {jobs.data?.length ? (
          jobs.data.map((job) => (
            <article className="panel" key={job.id}>
              <p className="eyebrow">
                {job.targetType} · {job.status}
              </p>
              <h3>{job.model}</h3>
              <p>Target: {job.targetId}</p>
              <small>
                Attempts {job.attempts} · {job.lastErrorCode ?? "no error"}
              </small>
            </article>
          ))
        ) : (
          <article className="panel">
            <p className="eyebrow">Queue</p>
            <h3>No embedding jobs queued</h3>
            <p>Jobs appear here when memory records are scheduled for embedding.</p>
          </article>
        )}
      </section>
    </section>
  );
};
