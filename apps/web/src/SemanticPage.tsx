import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Database, Gauge, GitCompareArrows, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

const confidenceText = (value: number) => `${Math.round(value * 100)}%`;

export const SemanticPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("open commands");
  const intelligence = useQuery({
    queryKey: ["semantic-intelligence"],
    queryFn: apiClient.getSemanticIntelligence,
    refetchInterval: 20_000,
  });
  const search = useMutation({
    mutationFn: apiClient.semanticSearch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["semantic-intelligence"] });
    },
  });
  const data = intelligence.data;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    search.mutate({
      query,
      source: "dashboard",
      currentPage: window.location.pathname,
      workspaceId: null,
      repositoryId: null,
      categories: [],
      limit: 8,
      confidenceThreshold: 0.78,
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 16B</p>
      <h1>Semantic Intelligence</h1>
      <p>
        Deterministic retrieval resolves commands, pages, aliases, synonyms, and
        semantic objects before AI is considered. PostgreSQL remains the source of
        truth; Redis is only a cache; pgvector stores embeddings.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <Database size={14} /> Registry
          </span>
          <strong>{data?.stats.registryCount ?? 0}</strong>
          <small>searchable semantic objects</small>
        </article>
        <article className="status-card">
          <span>
            <GitCompareArrows size={14} /> Aliases
          </span>
          <strong>{data?.stats.aliasCount ?? 0}</strong>
          <small>manual, learned, suggested, and system aliases</small>
        </article>
        <article className="status-card">
          <span>
            <BrainCircuit size={14} /> Deterministic
          </span>
          <strong>{data?.stats.deterministicResolutionCount ?? 0}</strong>
          <small>resolved without AI fallback</small>
        </article>
        <article className="status-card">
          <span>
            <Gauge size={14} /> AI escalations
          </span>
          <strong>{data?.stats.aiEscalationCount ?? 0}</strong>
          <small>low-confidence or ambiguous retrievals</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <Search size={18} /> Retrieval inspector
        </h2>
        <form className="policy-form" onSubmit={submit}>
          <label>
            Query
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try: open memory, create command, voice settings"
            />
          </label>
          <button disabled={search.isPending} type="submit">
            Resolve deterministically
          </button>
        </form>
        {search.data ? (
          <article className="panel">
            <p className="eyebrow">
              {search.data.resolution} · {search.data.latencyMs}ms · cache{" "}
              {search.data.cacheHit ? "hit" : "miss"}
            </p>
            <h3>
              {search.data.selected
                ? `${search.data.selected.displayName} (${confidenceText(
                    search.data.selected.confidence,
                  )})`
                : "No safe deterministic selection"}
            </h3>
            <p>{search.data.aiEscalationReason ?? "No AI fallback required."}</p>
            <div className="command-list">
              {search.data.candidates.map((candidate) => (
                <div className="command-item" key={candidate.objectId}>
                  <strong>{candidate.displayName}</strong>
                  <span>
                    {candidate.matchKind} · {confidenceText(candidate.confidence)} ·{" "}
                    {candidate.routePath ?? candidate.category}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </section>

      <section className="panel-list">
        <h2>Registered objects</h2>
        <div className="command-list">
          {data?.registry.slice(0, 30).map((object) => (
            <div className="command-item" key={object.id}>
              <strong>{object.displayName}</strong>
              <span>
                {object.category} · {object.visibility} ·{" "}
                {object.aliases.slice(0, 4).join(", ") || "no aliases"}
              </span>
            </div>
          )) ?? null}
        </div>
      </section>

      <section className="panel-list">
        <h2>Recent retrieval history</h2>
        <div className="command-list">
          {data?.retrievalHistory.slice(0, 20).map((item) => (
            <div className="command-item" key={item.id}>
              <strong>{item.query}</strong>
              <span>
                {item.source} · {item.resolution} ·{" "}
                {confidenceText(item.selectedConfidence)}
              </span>
            </div>
          )) ?? null}
        </div>
      </section>
    </section>
  );
};
