import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BrainCircuit,
  Database,
  Download,
  Eye,
  FileSearch,
  History,
  Layers3,
  Pin,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { ExplicitMemoryType } from "@alexa-control/shared";

import type { ApiClient } from "./api.js";

const itemTypes = [
  "MEMORY",
  "KNOWLEDGE_ENTITY",
  "KNOWLEDGE_RELATIONSHIP",
  "KNOWLEDGE_FACT",
  "DECISION",
  "LEARNED_PREFERENCE",
  "LEARNING_CANDIDATE",
  "HABIT",
  "SEQUENCE_PATTERN",
  "ALIAS",
  "VOCABULARY_ENTRY",
  "PERSONALITY_TRAIT",
  "PERSONALITY_RULE",
  "SEMANTIC_EXAMPLE",
] as const;

export const MemoryPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [itemType, setItemType] = useState<(typeof itemTypes)[number] | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextInput, setContextInput] = useState(
    "What do you know about PostgreSQL?",
  );
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [explicitMemoryType, setExplicitMemoryType] =
    useState<ExplicitMemoryType>("FACT");
  const [explicitMemoryContent, setExplicitMemoryContent] = useState("");
  const studio = useQuery({
    queryKey: ["memory-studio"],
    queryFn: apiClient.getMemoryStudio,
    refetchInterval: 20_000,
  });
  const search = useQuery({
    queryKey: ["memory-studio-search", query, itemType],
    queryFn: () =>
      apiClient.searchMemoryStudio({
        q: query,
        itemType: itemType === "ALL" ? undefined : itemType,
        limit: 50,
        cursor: 0,
      }),
  });
  const explanation = useQuery({
    queryKey: ["memory-studio-explain", selectedId],
    queryFn: () => apiClient.explainMemoryStudioItem(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });
  const contextPreview = useMutation({
    mutationFn: apiClient.previewMemoryStudioContext,
  });
  const exportStudio = useMutation({
    mutationFn: apiClient.exportMemoryStudio,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["memory-studio"] }),
      queryClient.invalidateQueries({ queryKey: ["memory-studio-search"] }),
      queryClient.invalidateQueries({ queryKey: ["memory-studio-explain"] }),
    ]);
  };
  const teachMemory = useMutation({
    mutationFn: apiClient.teachExplicitMemory,
    onSuccess: async (result) => {
      setExplicitMemoryContent("");
      setShowAddMemory(false);
      setSelectedId(`MEMORY:${result.memory.id}`);
      await refresh();
    },
  });
  const archiveItem = useMutation({
    mutationFn: (id: string) => apiClient.archiveMemoryStudioItem(id),
    onSuccess: refresh,
  });
  const restoreItem = useMutation({
    mutationFn: (id: string) => apiClient.restoreMemoryStudioItem(id),
    onSuccess: refresh,
  });
  const pinItem = useMutation({
    mutationFn: (id: string) => apiClient.pinMemoryStudioItem(id),
    onSuccess: refresh,
  });
  const unpinItem = useMutation({
    mutationFn: (id: string) => apiClient.unpinMemoryStudioItem(id),
    onSuccess: refresh,
  });
  const deletePreview = useMutation({
    mutationFn: (id: string) => apiClient.deleteMemoryStudioItem(id),
  });
  const items = useMemo(
    () => search.data?.items ?? studio.data?.items ?? [],
    [search.data?.items, studio.data?.items],
  );
  const selected = useMemo(
    () =>
      items.find((item) => item.id === selectedId) ??
      studio.data?.items.find((item) => item.id === selectedId) ??
      null,
    [items, selectedId, studio.data?.items],
  );
  const overview = studio.data?.overview;
  const submitContextPreview = (event: FormEvent) => {
    event.preventDefault();
    contextPreview.mutate({
      input: contextInput,
      confidenceThreshold: 0.45,
      graphDepth: 1,
      limit: 12,
    });
  };
  const submitExplicitMemory = (event: FormEvent) => {
    event.preventDefault();
    teachMemory.mutate({
      type: explicitMemoryType,
      content: explicitMemoryContent,
      entityRefs: [],
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page memory-studio-page">
      <header className="memory-page-header">
        <div>
          <h1>Memory</h1>
          <p>
            What Athena remembers about you, your work, and how you like things done.
          </p>
        </div>
        <button onClick={() => setShowAddMemory((value) => !value)} type="button">
          {showAddMemory ? "Cancel" : "Add Memory"}
        </button>
      </header>

      {showAddMemory ? (
        <form className="panel-list stacked-form" onSubmit={submitExplicitMemory}>
          <h2>Teach Athena</h2>
          <div className="button-row">
            <select
              aria-label="Memory type"
              onChange={(event) => setExplicitMemoryType(event.target.value as ExplicitMemoryType)}
              value={explicitMemoryType}
            >
              <option value="FACT">Fact</option>
              <option value="PREFERENCE">Preference</option>
              <option value="PERSON">Person</option>
              <option value="PROJECT">Project</option>
              <option value="DECISION">Decision</option>
              <option value="ALIAS">Alias</option>
              <option value="INSTRUCTION">Instruction</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              aria-label="Memory content"
              maxLength={2000}
              onChange={(event) => setExplicitMemoryContent(event.target.value)}
              placeholder="I prefer concise emails."
              required
              value={explicitMemoryContent}
            />
            <button disabled={teachMemory.isPending} type="submit">
              {teachMemory.isPending ? "Saving..." : "Save"}
            </button>
          </div>
          {teachMemory.error ? (
            <div className="notice" role="alert">
              {teachMemory.error instanceof Error
                ? teachMemory.error.message
                : "Athena could not save that memory."}
            </div>
          ) : null}
        </form>
      ) : null}

      <section className="status-grid">
        <Metric
          label="Items"
          value={overview?.totalItems ?? 0}
          detail="Unified records"
        />
        <Metric
          label="Memories"
          value={overview?.memories ?? 0}
          detail="Stored memory"
        />
        <Metric
          label="Knowledge"
          value={overview?.knowledgeEntities ?? 0}
          detail="Entities"
        />
        <Metric
          label="Learning"
          value={overview?.learningCandidates ?? 0}
          detail="Candidates"
        />
        <Metric
          label="Conflicts"
          value={overview?.conflicts ?? 0}
          detail="Review queue"
        />
        <Metric label="Stale" value={overview?.staleItems ?? 0} detail="Needs review" />
      </section>

      <section className="panel-list">
        <h2>
          <Search size={18} /> Cognitive Explorer
        </h2>
        <div className="button-row">
          <input
            aria-label="Search cognitive items"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PostgreSQL, code, Chrome, project names..."
            type="search"
            value={query}
          />
          <select
            aria-label="Item type"
            onChange={(event) =>
              setItemType(event.target.value as (typeof itemTypes)[number] | "ALL")
            }
            value={itemType}
          >
            <option value="ALL">All types</option>
            {itemTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button onClick={() => void refresh()} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => exportStudio.mutate()} type="button">
            <Download size={16} /> Export
          </button>
        </div>
        <div className="resource-list">
          {items.slice(0, 20).map((item) => (
            <button
              className={`resource-row ${selectedId === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <div>
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
              </div>
              <div className="button-row compact-row">
                {item.pinned ? <Pin size={14} /> : null}
                {item.archived ? <Archive size={14} /> : null}
                <small>{item.itemType.replaceAll("_", " ")}</small>
                <small>{Math.round(item.confidence * 100)}%</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <details className="memory-advanced">
        <summary>Advanced - evidence, provenance, review, and context tools</summary>
        <div className="memory-advanced-body">
          <section className="two-column-grid">
            <article className="panel-list">
              <h2>
                <Eye size={18} /> Inspector
              </h2>
              {selected ? (
                <>
                  <div className="status-card flat-card">
                    <span>{selected.itemType.replaceAll("_", " ")}</span>
                    <strong>{selected.title}</strong>
                    <small>{selected.summary}</small>
                  </div>
                  <div className="detail-grid">
                    <Detail label="Status" value={selected.status} />
                    <Detail
                      label="Confidence"
                      value={`${Math.round(selected.confidence * 100)}%`}
                    />
                    <Detail
                      label="Source"
                      value={
                        selected.tags.includes("owner_explicit")
                          ? "Owner taught"
                          : selected.source
                      }
                    />
                    <Detail label="Retention" value={selected.retentionClass} />
                    <Detail label="Sensitivity" value={selected.sensitivityClass} />
                    <Detail label="Version" value={String(selected.version)} />
                  </div>
                  <div className="button-row">
                    <button
                      disabled={archiveItem.isPending || selected.archived}
                      onClick={() => archiveItem.mutate(selected.id)}
                      type="button"
                    >
                      <Archive size={16} /> Archive
                    </button>
                    <button
                      disabled={restoreItem.isPending || !selected.archived}
                      onClick={() => restoreItem.mutate(selected.id)}
                      type="button"
                    >
                      <RotateCcw size={16} /> Restore
                    </button>
                    <button
                      disabled={pinItem.isPending || selected.pinned}
                      onClick={() => pinItem.mutate(selected.id)}
                      type="button"
                    >
                      <Pin size={16} /> Pin
                    </button>
                    <button
                      disabled={unpinItem.isPending || !selected.pinned}
                      onClick={() => unpinItem.mutate(selected.id)}
                      type="button"
                    >
                      <Pin size={16} /> Unpin
                    </button>
                    <button
                      disabled={deletePreview.isPending}
                      onClick={() => deletePreview.mutate(selected.id)}
                      type="button"
                    >
                      <Shield size={16} /> Delete preview
                    </button>
                  </div>
                  {deletePreview.data ? (
                    <div className="notice" role="note">
                      {deletePreview.data.explanation}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="notice" role="note">
                  Select a memory to inspect its source, use, retention, and controls.
                </div>
              )}
            </article>
            <article className="panel-list">
              <h2>
                <FileSearch size={18} /> Why and how
              </h2>
              {explanation.data ? (
                <>
                  <p>{explanation.data.whyRemembered}</p>
                  <section className="status-grid">
                    <Metric
                      label="Evidence"
                      value={explanation.data.provenance.length}
                      detail="Sources"
                    />
                    <Metric
                      label="Usage"
                      value={explanation.data.usageTrace.length}
                      detail="Trace entries"
                    />
                    <Metric
                      label="Related"
                      value={explanation.data.relatedItemIds.length}
                      detail="Items"
                    />
                  </section>
                  <div className="resource-list">
                    {explanation.data.howUsed.map((usage) => (
                      <div className="resource-row" key={usage}>
                        <div>
                          <strong>{usage}</strong>
                          <span>Allowed consumer path</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="notice" role="note">
                  Explanation opens after item selection.
                </div>
              )}
            </article>
          </section>
          <section className="two-column-grid">
            <article className="panel-list">
              <h2>
                <BrainCircuit size={18} /> Review queues
              </h2>
              <div className="status-grid">
                <Metric
                  label="Low confidence"
                  value={studio.data?.lowConfidence.length ?? 0}
                  detail="Needs review"
                />
                <Metric
                  label="Stale"
                  value={studio.data?.stale.length ?? 0}
                  detail="Needs review"
                />
                <Metric
                  label="Conflicts"
                  value={studio.data?.conflicts.length ?? 0}
                  detail="Needs review"
                />
              </div>
            </article>
            <article className="panel-list">
              <h2>
                <History size={18} /> Health
              </h2>
              <div className="resource-list">
                {(studio.data?.health ?? []).map((metric) => (
                  <div className="resource-row" key={metric.key}>
                    <div>
                      <strong>{metric.label}</strong>
                      <span>{metric.explanation}</span>
                    </div>
                    <small>
                      {metric.count} · {metric.status}
                    </small>
                  </div>
                ))}
              </div>
            </article>
          </section>
          <section className="two-column-grid">
            <article className="panel-list">
              <h2>
                <Database size={18} /> Embedding inspector
              </h2>
              <div className="resource-list">
                {(studio.data?.embeddings ?? []).slice(0, 6).map((embedding) => (
                  <div className="resource-row" key={embedding.itemId}>
                    <div>
                      <strong>{embedding.title}</strong>
                      <span>
                        {embedding.modelName} · {embedding.dimension}d · vector hidden
                      </span>
                    </div>
                    <small>{embedding.indexNamespace}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel-list">
              <h2>
                <Layers3 size={18} /> Context preview
              </h2>
              <form className="stacked-form" onSubmit={submitContextPreview}>
                <textarea
                  onChange={(event) => setContextInput(event.target.value)}
                  value={contextInput}
                />
                <button disabled={contextPreview.isPending} type="submit">
                  <Sparkles size={16} /> Preview context
                </button>
              </form>
              <div className="resource-list">
                {(contextPreview.data?.included ?? []).map((item) => (
                  <div className="resource-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.itemType.replaceAll("_", " ")}</span>
                    </div>
                    <small>{Math.round(item.confidence * 100)}%</small>
                  </div>
                ))}
              </div>
            </article>
          </section>
          {exportStudio.data ? (
            <section className="panel-list">
              <h2>
                <Download size={18} /> Export summary
              </h2>
              <p>
                {exportStudio.data.itemCount} items prepared. Raw secrets and vectors
                are excluded.
              </p>
            </section>
          ) : null}
        </div>
      </details>
    </section>
  );
};

const Metric = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) => (
  <article className="status-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="context-module">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);
