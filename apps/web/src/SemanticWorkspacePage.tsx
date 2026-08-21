import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, GitBranch, Network, RefreshCcw, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { ApiClient } from "./api.js";

export const SemanticWorkspacePage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("login API");
  const workspace = useQuery({
    queryKey: ["workspace-intelligence"],
    queryFn: apiClient.getWorkspaceIntelligence,
    refetchInterval: 10_000,
  });
  const indexers = useQuery({
    queryKey: ["deep-indexers"],
    queryFn: apiClient.getDeepIndexers,
    refetchInterval: 10_000,
  });
  const search = useMutation({
    mutationFn: apiClient.searchWorkspaceIntelligence,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-intelligence"] });
    },
  });
  const sync = useMutation({
    mutationFn: apiClient.runDeepIndexerSync,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["deep-indexers"] }),
      ]);
    },
  });
  const data = workspace.data;
  const indexerData = indexers.data;
  const results = search.data?.results ?? [];
  const objects = data?.objects ?? [];
  const relationships = data?.relationships ?? [];
  const semanticIndexers = indexerData?.indexers ?? [];

  return (
    <section className="desktop-center">
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Phase 18B · Semantic Workspace Intelligence</p>
          <h2>Semantic Workspace Explorer</h2>
          <p>
            Trusted applications expose structured content objects: workspaces,
            files, functions, notes, tabs, folders, and relationships. Planner
            navigation can resolve meaning instead of UI position.
          </p>
        </div>
        <div className="voice-hero-actions">
          <button
            disabled={workspace.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["workspace-intelligence"] })
            }
            type="button"
          >
            <RefreshCcw size={15} /> Refresh
          </button>
        </div>
      </div>

      <section className="status-grid">
        <article className="status-card">
          <span>Semantic objects</span>
          <strong>{objects.length}</strong>
          <small>application-independent content objects</small>
        </article>
        <article className="status-card">
          <span>Relationships</span>
          <strong>{relationships.length}</strong>
          <small>cross-object graph edges</small>
        </article>
        <article className="status-card">
          <span>Contexts</span>
          <strong>{data?.contexts.length ?? 0}</strong>
          <small>live workspace/application context</small>
        </article>
        <article className="status-card">
          <span>Deep indexers</span>
          <strong>{semanticIndexers.length}</strong>
          <small>reviewed provider APIs/extensions only</small>
        </article>
        <article className="status-card">
          <span>Raw content automation</span>
          <strong>{data?.rawContentAutomationAvailable ? "Available" : "Blocked"}</strong>
          <small>pixels/OCR/scraping stay blocked</small>
        </article>
      </section>

      <article className="panel">
        <p className="eyebrow">
          <ShieldCheck size={13} /> Phase 18C · Deep Semantic Indexers
        </p>
        <h3>Indexer coverage and semantic event bus</h3>
        <p>
          Content understanding comes from reviewed providers, official APIs, or
          reviewed app extensions. UI scraping, OCR, screenshots, unrestricted
          Accessibility traversal, and generic filesystem crawling remain blocked.
        </p>
        <section className="status-grid">
          {semanticIndexers.slice(0, 8).map((indexer) => (
            <article className="status-card" key={indexer.id}>
              <span>{indexer.indexerType.replaceAll("_", " ")}</span>
              <strong>{indexer.status}</strong>
              <small>
                {indexer.providerId} · {indexer.source}
              </small>
              <small>
                {indexer.supportedObjectTypes.slice(0, 6).join(", ")}
              </small>
              <button
                disabled={sync.isPending || !indexer.supportsIncremental}
                onClick={() =>
                  sync.mutate({ indexerId: indexer.id, mode: "incremental" })
                }
                type="button"
              >
                Incremental sync
              </button>
            </article>
          ))}
          {semanticIndexers.length === 0 ? (
            <article className="status-card">
              <span>No indexers registered</span>
              <strong>Waiting</strong>
              <small>Trust an application with a reviewed provider first.</small>
            </article>
          ) : null}
        </section>
        <section className="voice-lab-layout">
          <div>
            <p className="eyebrow">Recent semantic events</p>
            {(indexerData?.events ?? []).slice(0, 6).map((event) => (
              <div className="timeline-row" key={event.id}>
                <strong>{event.eventType}</strong>
                <span>{event.providerId}</span>
                <small>{new Date(event.occurredAt).toLocaleTimeString()}</small>
              </div>
            ))}
            {indexerData?.events.length === 0 ? <p>No semantic events yet.</p> : null}
          </div>
          <div>
            <p className="eyebrow">Search statistics</p>
            <div className="voice-shortcut-card">
              <strong>{indexerData?.searchStatistics.totalObjects ?? 0} objects</strong>
              <span>
                {indexerData?.searchStatistics.totalRelationships ?? 0} relationships ·{" "}
                {indexerData?.searchStatistics.indexedProviders ?? 0} indexed providers
              </span>
              <small>
                avg search {indexerData?.searchStatistics.averageSearchMs ?? 0}ms
              </small>
            </div>
          </div>
        </section>
      </article>

      <section className="voice-lab-layout">
        <article className="glass-panel">
          <p className="eyebrow">
            <Search size={13} /> Universal Semantic Search
          </p>
          <h3>Search across trusted application content</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              search.mutate({ query, limit: 10 });
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Try: "login API" or "README"'
            />
            <button disabled={search.isPending} type="submit">
              Search
            </button>
          </form>
          {results.map((result) => (
            <div className="voice-shortcut-card" key={result.object.id}>
              <strong>{result.object.title}</strong>
              <span>
                {result.object.objectType} · {result.object.applicationId} · score{" "}
                {Math.round(result.score * 100)}%
              </span>
              <small>{result.reasons.join(" ")}</small>
            </div>
          ))}
        </article>

        <article className="glass-panel">
          <p className="eyebrow">
            <Boxes size={13} /> Current Context
          </p>
          {(data?.contexts ?? []).slice(0, 6).map((context) => (
            <div className="voice-shortcut-card" key={context.id}>
              <strong>{context.currentApplicationId ?? "No app"}</strong>
              <span>object {context.currentObjectId ?? "none"}</span>
              <small>{new Date(context.updatedAt).toLocaleTimeString()}</small>
            </div>
          ))}
        </article>
      </section>

      <section className="status-grid">
        {objects.slice(0, 12).map((object) => (
          <article className="status-card" key={object.id}>
            <span>{object.objectType.replaceAll("_", " ")}</span>
            <strong>{object.title}</strong>
            <small>
              {object.applicationId} · confidence {Math.round(object.confidence * 100)}%
            </small>
            <small>{object.tags.join(", ") || "no tags"}</small>
          </article>
        ))}
      </section>

      <article className="panel">
        <p className="eyebrow">
          <GitBranch size={13} /> Relationship graph
        </p>
        {relationships.slice(0, 10).map((relationship) => (
          <div className="timeline-row" key={relationship.id}>
            <strong>{relationship.relationship}</strong>
            <span>
              {relationship.fromObjectId.slice(0, 8)} →{" "}
              {relationship.toObjectId.slice(0, 8)}
            </span>
            <small>confidence {Math.round(relationship.confidence * 100)}%</small>
          </div>
        ))}
        {relationships.length === 0 ? <p>No relationships indexed yet.</p> : null}
      </article>

      <article className="panel">
        <p className="eyebrow">
          <Network size={13} /> Workspace memory
        </p>
        {(data?.memory ?? []).slice(0, 8).map((memory) => (
          <div className="timeline-row" key={memory.id}>
            <strong>{memory.memoryType}</strong>
            <span>{memory.objectId.slice(0, 8)}</span>
            <small>{new Date(memory.lastUsedAt).toLocaleTimeString()}</small>
          </div>
        ))}
        {data?.memory.length === 0 ? <p>No workspace memory yet.</p> : null}
      </article>
    </section>
  );
};
