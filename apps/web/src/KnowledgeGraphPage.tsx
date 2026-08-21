import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, GitBranch, Network, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import type { ApiClient } from "./api.js";

const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

const StatCard = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) => (
  <div className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
);

export const KnowledgeGraphPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const [query, setQuery] = useState("Quant");
  const [contextText, setContextText] = useState("open my current project");
  const graph = useQuery({
    queryKey: ["personal-knowledge-graph"],
    queryFn: apiClient.getPersonalKnowledgeGraph,
    refetchInterval: 30_000,
  });
  const search = useQuery({
    queryKey: ["personal-knowledge-graph-search", query],
    queryFn: () =>
      apiClient.searchPersonalKnowledgeGraph({ q: query, limit: 20, depth: 1 }),
    enabled: Boolean(query.trim()),
  });
  const context = useQuery({
    queryKey: ["personal-knowledge-context", contextText],
    queryFn: () =>
      apiClient.getPersonalKnowledgeContext({
        text: contextText,
        entityIds: [],
        depth: 1,
        limit: 20,
      }),
    enabled: Boolean(contextText.trim()),
  });
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of graph.data?.recentEntities ?? []) {
      counts.set(entity.entityType, (counts.get(entity.entityType) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [graph.data?.recentEntities]);

  if (graph.isPending) {
    return <section className="placeholder-page">Loading personal knowledge graph…</section>;
  }

  if (graph.isError) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Phase 19B</p>
        <h1>Personal Knowledge Graph</h1>
        <div className="notice">The graph could not be loaded.</div>
      </section>
    );
  }

  const stats = graph.data.statistics;

  return (
    <section className="page-grid">
      <div className="page-heading">
        <p className="eyebrow">Phase 19B Knowledge Graph Studio</p>
        <h1>Personal Knowledge Graph & World Model</h1>
        <p>
          PostgreSQL remains the source of truth. The graph stores deterministic,
          owner-scoped entities, relationships, facts, evidence, conflicts, and
          provenance without replacing memory or using vector similarity as authority.
        </p>
      </div>

      <div className="status-grid">
        <StatCard label="Entities" value={stats.entityCount} detail="owner-scoped semantic objects" />
        <StatCard label="Relationships" value={stats.relationshipCount} detail="bounded graph edges" />
        <StatCard label="Facts" value={stats.factCount} detail="evidence-backed assertions" />
        <StatCard label="Open conflicts" value={stats.conflictCount} detail="manual review required" />
      </div>

      <div className="panel-grid two-column">
        <article className="panel-card">
          <h2>
            <Search size={18} /> Graph search
          </h2>
          <input
            aria-label="Search knowledge graph"
            className="full-width-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, projects, apps, workflows…"
            value={query}
          />
          <div className="voice-timeline">
            {(search.data?.entities ?? []).slice(0, 8).map((entity) => (
              <article key={entity.id}>
                <span>{entity.entityType}</span>
                <strong>{entity.displayName}</strong>
                <small>
                  confidence {Math.round(entity.confidence * 100)}% · version {entity.version} · {entity.sourceType}
                </small>
              </article>
            ))}
            {!search.data?.entities.length ? (
              <p className="empty-state">No entity matches yet.</p>
            ) : null}
          </div>
        </article>

        <article className="panel-card">
          <h2>
            <Network size={18} /> Human Understanding context
          </h2>
          <input
            aria-label="Simulate knowledge context"
            className="full-width-input"
            onChange={(event) => setContextText(event.target.value)}
            placeholder="Try: open my current project"
            value={contextText}
          />
          <div className="voice-timeline">
            <article>
              <span>Resolution</span>
              <strong>{context.data?.explanation ?? "Waiting for context…"}</strong>
              <small>confidence {Math.round((context.data?.sourceConfidence ?? 0) * 100)}%</small>
            </article>
            {(context.data?.resolvedEntities ?? []).slice(0, 5).map((entity) => (
              <article key={entity.id}>
                <span>{entity.entityType}</span>
                <strong>{entity.displayName}</strong>
                <small>source {entity.sourceType} · updated {formatDate(entity.updatedAt)}</small>
              </article>
            ))}
          </div>
        </article>
      </div>

      <div className="panel-grid two-column">
        <article className="panel-card">
          <h2>
            <GitBranch size={18} /> Entity coverage
          </h2>
          <div className="voice-timeline">
            {typeCounts.map(([type, count]) => (
              <article key={type}>
                <span>{type}</span>
                <strong>{count}</strong>
                <small>entities discovered from trusted sources and promotions</small>
              </article>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <h2>
            <AlertTriangle size={18} /> Conflict queue
          </h2>
          <div className="voice-timeline">
            {graph.data.conflicts.slice(0, 8).map((conflict) => (
              <article key={conflict.id}>
                <span>{conflict.status}</span>
                <strong>{conflict.reason}</strong>
                <small>created {formatDate(conflict.createdAt)}</small>
              </article>
            ))}
            {!graph.data.conflicts.length ? (
              <p className="empty-state">No open knowledge conflicts.</p>
            ) : null}
          </div>
        </article>
      </div>

      <article className="panel-card">
        <h2>
          <ShieldCheck size={18} /> Provenance and graph events
        </h2>
        <div className="voice-timeline">
          {graph.data.events.slice(0, 12).map((event) => (
            <article key={event.id}>
              <span>{formatDate(event.createdAt)}</span>
              <strong>{event.summary}</strong>
              <small>
                {event.eventType} · {event.title}
              </small>
            </article>
          ))}
          {!graph.data.events.length ? (
            <p className="empty-state">No graph events recorded yet.</p>
          ) : null}
        </div>
      </article>
    </section>
  );
};
