import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { PatchOperationSchema } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

export const RepositoriesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [engineeringQuestion, setEngineeringQuestion] = useState(
    "How does this repository work?",
  );
  const [engineeringGoal, setEngineeringGoal] = useState("Add OAuth support");
  const [patchTitle, setPatchTitle] = useState("Proposed code change");
  const [patchSummary, setPatchSummary] = useState("Human-reviewed patch proposal.");
  const [patchOperationsJson, setPatchOperationsJson] = useState(
    JSON.stringify(
      [
        {
          operationId: "00000000-0000-4000-8000-000000000001",
          kind: "create",
          relativePath: "docs/example-proposal.md",
          expectedOriginalSha256: null,
          expectedOriginalContent: null,
          newContent: "# Example proposal\\n",
        },
      ],
      null,
      2,
    ),
  );
  const [approvalTokenByPatch, setApprovalTokenByPatch] = useState<
    Record<string, string>
  >({});
  const repositories = useQuery({
    queryKey: ["repositories"],
    queryFn: apiClient.getRepositories,
    refetchInterval: 3_000,
  });
  const selected = selectedId ?? repositories.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ["repository", selected],
    queryFn: () => apiClient.getRepository(selected!),
    enabled: Boolean(selected),
    refetchInterval: 3_000,
  });
  const files = useQuery({
    queryKey: ["repository-files", selected],
    queryFn: () => apiClient.getRepositoryFiles(selected!),
    enabled: Boolean(selected),
  });
  const tree = useQuery({
    queryKey: ["repository-tree", selected],
    queryFn: () => apiClient.getRepositoryTree(selected!),
    enabled: Boolean(selected),
  });
  const search = useQuery({
    queryKey: ["repository-search", selected, query],
    queryFn: () => apiClient.searchRepository(selected!, query),
    enabled: Boolean(selected && query.trim()),
  });
  const semanticSearch = useQuery({
    queryKey: ["repository-semantic-search", selected, semanticQuery],
    queryFn: () => apiClient.semanticSearchRepository(selected!, semanticQuery),
    enabled: Boolean(selected && semanticQuery.trim()),
  });
  const dependencies = useQuery({
    queryKey: ["repository-dependencies", selected],
    queryFn: () => apiClient.getRepositoryDependencies(selected!),
    enabled: Boolean(selected),
  });
  const architecture = useQuery({
    queryKey: ["repository-architecture", selected],
    queryFn: () => apiClient.getRepositoryArchitecture(selected!),
    enabled: Boolean(selected),
  });
  const apiRoutes = useQuery({
    queryKey: ["repository-api-routes", selected],
    queryFn: () => apiClient.getRepositoryApiRoutes(selected!),
    enabled: Boolean(selected),
  });
  const databaseModels = useQuery({
    queryKey: ["repository-database-models", selected],
    queryFn: () => apiClient.getRepositoryDatabaseModels(selected!),
    enabled: Boolean(selected),
  });
  const insights = useQuery({
    queryKey: ["repository-insights", selected],
    queryFn: () => apiClient.getRepositoryInsights(selected!),
    enabled: Boolean(selected),
  });
  const memory = useQuery({
    queryKey: ["repository-engineering-memory", selected],
    queryFn: () => apiClient.getRepositoryEngineeringMemory(selected!),
    enabled: Boolean(selected),
  });
  const patches = useQuery({
    queryKey: ["patches"],
    queryFn: apiClient.getPatches,
    refetchInterval: 3_000,
  });
  const reindex = useMutation({
    mutationFn: apiClient.reindexRepository,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["repositories"] }),
        queryClient.invalidateQueries({ queryKey: ["repository", selected] }),
      ]);
    },
  });
  const askEngineer = useMutation({
    mutationFn: (question: string) =>
      apiClient.askRepositoryEngineer(selected!, question),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository-engineering-memory", selected],
      });
    },
  });
  const impact = useMutation({
    mutationFn: (change: string) =>
      apiClient.analyzeRepositoryImpact(selected!, change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository-engineering-memory", selected],
      });
    },
  });
  const plan = useMutation({
    mutationFn: (goal: string) =>
      apiClient.planRepositoryImplementation(selected!, goal),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository-engineering-memory", selected],
      });
    },
  });
  const review = useMutation({
    mutationFn: () => apiClient.reviewRepositoryCode(selected!),
  });
  const docs = useMutation({
    mutationFn: () => apiClient.generateRepositoryDocumentation(selected!),
  });
  const generatePatch = useMutation({
    mutationFn: () =>
      apiClient.generatePatch({
        repositoryId: selected!,
        title: patchTitle,
        summary: patchSummary,
        operations: PatchOperationSchema.array().parse(JSON.parse(patchOperationsJson)),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patches"] });
    },
  });
  const approvePatch = useMutation({
    mutationFn: (patchId: string) => apiClient.decidePatch(patchId, "approve"),
    onSuccess: async (response) => {
      if (response.approvalToken) {
        setApprovalTokenByPatch((tokens) => ({
          ...tokens,
          [response.patch.id]: response.approvalToken!,
        }));
      }
      await queryClient.invalidateQueries({ queryKey: ["patches"] });
    },
  });
  const rejectPatch = useMutation({
    mutationFn: (patchId: string) => apiClient.decidePatch(patchId, "reject"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patches"] });
    },
  });
  const executePatch = useMutation({
    mutationFn: (patchId: string) =>
      apiClient.executePatch(patchId, approvalTokenByPatch[patchId] ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patches"] });
    },
  });
  const createRollbackPatch = useMutation({
    mutationFn: (patchId: string) => apiClient.createRollbackPatch(patchId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patches"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search.refetch();
  };
  const submitSemantic = (event: FormEvent) => {
    event.preventDefault();
    void semanticSearch.refetch();
  };
  const submitEngineering = (event: FormEvent) => {
    event.preventDefault();
    if (engineeringQuestion.trim()) askEngineer.mutate(engineeringQuestion);
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Repository intelligence</p>
      <h1>Repositories</h1>
      <p>
        Metadata-only indexing for registered workspaces. Source code contents, writes,
        shell execution, Git mutation, and application control remain unavailable.
      </p>

      <div className="compact-list">
        {repositories.data?.map((repository) => (
          <article
            key={repository.id}
            onClick={() => setSelectedId(repository.id)}
            role="button"
            tabIndex={0}
          >
            <strong>{repository.workspaceId}</strong>
            <span
              className={`trust-pill trust-${repository.indexStatus.toLowerCase()}`}
            >
              {repository.indexStatus}
            </span>
            <small>
              generation {repository.activeGeneration ?? "none"} ·{" "}
              {repository.lastIndexedAt
                ? new Date(repository.lastIndexedAt).toLocaleString()
                : "not indexed"}
            </small>
          </article>
        ))}
      </div>

      {detail.data ? (
        <article className="policy-result">
          <h2>Selected repository</h2>
          <p>
            Workspace: <code>{detail.data.repository.workspaceId}</code>
          </p>
          <p>
            Fingerprint:{" "}
            <code>{detail.data.repository.activeFingerprint ?? "not indexed"}</code>
          </p>
          <p>
            Latest job: <strong>{detail.data.latestJob?.status ?? "no job yet"}</strong>
          </p>
          <button
            disabled={reindex.isPending}
            onClick={() => reindex.mutate(detail.data.repository.id)}
            type="button"
          >
            Re-index metadata
          </button>

          {detail.data.activeGeneration ? (
            <div className="metric-grid">
              <article>
                <span>Files</span>
                <strong>{detail.data.activeGeneration.statistics.fileCount}</strong>
              </article>
              <article>
                <span>Directories</span>
                <strong>
                  {detail.data.activeGeneration.statistics.directoryCount}
                </strong>
              </article>
              <article>
                <span>Technologies</span>
                <strong>
                  {detail.data.activeGeneration.technologySummary.detected.length}
                </strong>
              </article>
              <article>
                <span>Symbols</span>
                <strong>{architecture.data?.nodes.length ?? 0}</strong>
              </article>
              <article>
                <span>Dependencies</span>
                <strong>{dependencies.data?.dependencies.length ?? 0}</strong>
              </article>
              <article>
                <span>API routes</span>
                <strong>{apiRoutes.data?.routes.length ?? 0}</strong>
              </article>
            </div>
          ) : null}

          <form className="policy-form" onSubmit={submit}>
            <label>
              Metadata search
              <input
                maxLength={200}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="filename, path, extension"
                value={query}
              />
            </label>
            <button disabled={!query.trim()} type="submit">
              Search
            </button>
          </form>

          {search.data?.results.length ? (
            <pre>{JSON.stringify(search.data.results, null, 2)}</pre>
          ) : null}
          <form className="policy-form" onSubmit={submitSemantic}>
            <label>
              Semantic search
              <input
                maxLength={200}
                onChange={(event) => setSemanticQuery(event.target.value)}
                placeholder="function, class, component, hook"
                value={semanticQuery}
              />
            </label>
            <button disabled={!semanticQuery.trim()} type="submit">
              Search symbols
            </button>
          </form>

          {semanticSearch.data?.symbols.length ? (
            <>
              <h2>Symbol explorer</h2>
              <pre>
                {JSON.stringify(semanticSearch.data.symbols.slice(0, 50), null, 2)}
              </pre>
            </>
          ) : null}
          {apiRoutes.data?.routes.length ? (
            <>
              <h2>API explorer</h2>
              <pre>{JSON.stringify(apiRoutes.data.routes.slice(0, 50), null, 2)}</pre>
            </>
          ) : null}
          {databaseModels.data?.models.length ? (
            <>
              <h2>Database explorer</h2>
              <pre>
                {JSON.stringify(databaseModels.data.models.slice(0, 50), null, 2)}
              </pre>
            </>
          ) : null}
          {dependencies.data ? (
            <>
              <h2>Dependency graph</h2>
              <pre>
                {JSON.stringify(
                  {
                    dependencyCount: dependencies.data.dependencies.length,
                    cycles: dependencies.data.cycles.slice(0, 20),
                    entryPoints: dependencies.data.entryPoints.slice(0, 20),
                    leafNodes: dependencies.data.leafNodes.slice(0, 20),
                  },
                  null,
                  2,
                )}
              </pre>
            </>
          ) : null}
          {insights.data?.insights.length ? (
            <>
              <h2>Repository insights</h2>
              <pre>{JSON.stringify(insights.data.insights, null, 2)}</pre>
            </>
          ) : null}
          <h2>Engineering Chat</h2>
          <p>
            Ask read-only engineering questions. Answers cite indexed repository
            metadata and include confidence; this does not modify files or execute code.
          </p>
          <form className="policy-form" onSubmit={submitEngineering}>
            <label>
              Engineering question
              <input
                maxLength={1000}
                onChange={(event) => setEngineeringQuestion(event.target.value)}
                placeholder="How does authentication work?"
                value={engineeringQuestion}
              />
            </label>
            <button
              disabled={!engineeringQuestion.trim() || askEngineer.isPending}
              type="submit"
            >
              Ask
            </button>
          </form>
          <div className="button-row">
            <button
              disabled={impact.isPending}
              onClick={() => impact.mutate(engineeringGoal)}
              type="button"
            >
              Impact analysis
            </button>
            <button
              disabled={plan.isPending}
              onClick={() => plan.mutate(engineeringGoal)}
              type="button"
            >
              Implementation plan
            </button>
            <button
              disabled={review.isPending}
              onClick={() => review.mutate()}
              type="button"
            >
              Code review
            </button>
            <button
              disabled={docs.isPending}
              onClick={() => docs.mutate()}
              type="button"
            >
              Generate docs
            </button>
          </div>
          <label className="policy-form">
            Goal/change for impact and planning
            <input
              maxLength={1000}
              onChange={(event) => setEngineeringGoal(event.target.value)}
              placeholder="Add MFA"
              value={engineeringGoal}
            />
          </label>
          {askEngineer.data ? (
            <>
              <h2>Repository Evidence Panel</h2>
              <pre>{JSON.stringify(askEngineer.data, null, 2)}</pre>
            </>
          ) : null}
          {impact.data ? (
            <>
              <h2>Impact Analysis</h2>
              <pre>{JSON.stringify(impact.data, null, 2)}</pre>
            </>
          ) : null}
          {plan.data ? (
            <>
              <h2>Implementation Plan</h2>
              <pre>{JSON.stringify(plan.data, null, 2)}</pre>
            </>
          ) : null}
          {review.data ? (
            <>
              <h2>Code Review</h2>
              <pre>{JSON.stringify(review.data, null, 2)}</pre>
            </>
          ) : null}
          {docs.data ? (
            <>
              <h2>Generated Documentation</h2>
              <pre>{docs.data.body}</pre>
            </>
          ) : null}
          {memory.data ? (
            <>
              <h2>Investigation Timeline</h2>
              <pre>{JSON.stringify(memory.data, null, 2)}</pre>
            </>
          ) : null}
          <h2>Patch Review</h2>
          <p>
            Generate a patch proposal from explicit operations, review the diff,
            approve, then execute. Nothing is modified before approval and execution.
          </p>
          <form
            className="policy-form"
            onSubmit={(event) => {
              event.preventDefault();
              generatePatch.mutate();
            }}
          >
            <label>
              Patch title
              <input
                maxLength={255}
                onChange={(event) => setPatchTitle(event.target.value)}
                value={patchTitle}
              />
            </label>
            <label>
              Patch summary
              <input
                maxLength={2000}
                onChange={(event) => setPatchSummary(event.target.value)}
                value={patchSummary}
              />
            </label>
            <label>
              Operations JSON
              <textarea
                onChange={(event) => setPatchOperationsJson(event.target.value)}
                rows={10}
                value={patchOperationsJson}
              />
            </label>
            <button disabled={!selected || generatePatch.isPending} type="submit">
              Generate patch
            </button>
          </form>
          {patches.data?.map((patch) => (
            <article className="panel" key={patch.id}>
              <p className="eyebrow">Patch {patch.status}</p>
              <h3>{patch.title}</h3>
              <p>{patch.summary}</p>
              <p>
                Risk {patch.riskScore}/100 · complexity {patch.complexity} · digest{" "}
                <code>{patch.patchDigest}</code>
              </p>
              <div className="button-row">
                <button
                  disabled={
                    patch.status !== "PENDING_APPROVAL" || approvePatch.isPending
                  }
                  onClick={() => approvePatch.mutate(patch.id)}
                  type="button"
                >
                  Approve
                </button>
                <button
                  disabled={
                    patch.status !== "PENDING_APPROVAL" || rejectPatch.isPending
                  }
                  onClick={() => rejectPatch.mutate(patch.id)}
                  type="button"
                >
                  Reject
                </button>
                <button
                  disabled={
                    patch.status !== "APPROVED" ||
                    !approvalTokenByPatch[patch.id] ||
                    executePatch.isPending
                  }
                  onClick={() => executePatch.mutate(patch.id)}
                  type="button"
                >
                  Execute approved patch
                </button>
                <button
                  disabled={
                    !["EXECUTION_REQUESTED", "APPLIED", "FAILED"].includes(
                      patch.status,
                    ) || createRollbackPatch.isPending
                  }
                  onClick={() => createRollbackPatch.mutate(patch.id)}
                  type="button"
                >
                  Create rollback patch
                </button>
              </div>
              <pre>{patch.unifiedDiff}</pre>
            </article>
          ))}
          {tree.data?.nodes.length ? (
            <>
              <h2>Directory tree</h2>
              <pre>{JSON.stringify(tree.data.nodes.slice(0, 50), null, 2)}</pre>
            </>
          ) : null}
          {files.data?.files.length ? (
            <>
              <h2>File inventory</h2>
              <pre>{JSON.stringify(files.data.files.slice(0, 50), null, 2)}</pre>
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
};
