import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import type { WorkflowApprovalStrategy } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import {
  isWorkflowTerminal,
  workflowProgress,
  workflowReadableLabel,
  workflowWorkspaceTabs,
} from "./workflowOperations.js";
import { ContextualAskAlexa } from "./BusinessOSComponents.js";

type WorkflowTab = (typeof workflowWorkspaceTabs)[number];
type SelectedRun = { kind: "workflow" | "graph"; id: string } | null;

const statusClass = (status: string) =>
  `workflow-status status-${status.toLowerCase().replace(/_/g, "-")}`;

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not started";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

const elapsed = (startedAt: string, completedAt?: string | null) => {
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt ?? new Date().toISOString()).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "Not measured";
  const minutes = Math.floor((end - start) / 60_000);
  return minutes < 1
    ? "Under 1 min"
    : minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export const WorkflowsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkflowTab>("overview");
  const [selectedRun, setSelectedRun] = useState<SelectedRun>(() => {
    const id = new URLSearchParams(window.location.search).get("selected");
    return id ? { kind: "graph", id } : null;
  });
  const [workflowGoal, setWorkflowGoal] = useState("Prepare for today's meeting");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [engineeringGoal, setEngineeringGoal] = useState("Add OAuth safely");
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);
  const [approvalStrategy, setApprovalStrategy] =
    useState<WorkflowApprovalStrategy>("approve_every_patch");

  const repositories = useQuery({
    queryKey: ["repositories"],
    queryFn: apiClient.getRepositories,
  });
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: apiClient.getWorkflows,
    refetchInterval: 5_000,
  });
  const crossApplication = useQuery({
    queryKey: ["cross-application-workflows"],
    queryFn: apiClient.getCrossApplicationWorkflows,
    refetchInterval: 5_000,
  });
  const detail = useQuery({
    queryKey: ["workflow", selectedRun?.kind === "workflow" ? selectedRun.id : null],
    queryFn: () => apiClient.getWorkflow(selectedRun!.id),
    enabled: selectedRun?.kind === "workflow",
    refetchInterval: 5_000,
  });
  const refresh = async (workflowId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["workflows"] });
    await queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] });
    if (workflowId)
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
  };
  const selectRun = (next: SelectedRun, nextTab?: WorkflowTab) => {
    setSelectedRun(next);
    if (nextTab) setTab(nextTab);
  };

  const compose = useMutation({
    mutationFn: () =>
      apiClient.composeCrossApplicationWorkflow({
        goal: workflowGoal,
        variables: {},
        origin: "dashboard",
        ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
      }),
    onSuccess: async (response) => {
      const newest =
        response.graphs.find((graph) => graph.goal === workflowGoal) ??
        response.graphs[0];
      if (newest) selectRun({ kind: "graph", id: newest.id }, "active");
      await refresh();
    },
  });
  const createEngineeringWorkflow = useMutation({
    mutationFn: () =>
      apiClient.createWorkflow({
        goal: engineeringGoal,
        repositoryIds,
        approvalStrategy,
      }),
    onSuccess: async (response) => {
      selectRun({ kind: "workflow", id: response.workflow.id }, "active");
      await refresh(response.workflow.id);
    },
  });
  const approve = useMutation({
    mutationFn: apiClient.approveWorkflow,
    onSuccess: async (response) => refresh(response.workflow.id),
  });
  const advance = useMutation({
    mutationFn: apiClient.advanceWorkflow,
    onSuccess: async (response) => refresh(response.workflow.id),
  });
  const pause = useMutation({
    mutationFn: apiClient.pauseWorkflow,
    onSuccess: async (response) => refresh(response.workflow.id),
  });
  const cancel = useMutation({
    mutationFn: apiClient.cancelWorkflow,
    onSuccess: async (response) => refresh(response.workflow.id),
  });
  const completeTask = useMutation({
    mutationFn: (input: { workflowId: string; taskId: string }) =>
      apiClient.completeWorkflowTask(input.workflowId, input.taskId),
    onSuccess: async (response) => refresh(response.workflow.id),
  });
  const startGraph = useMutation({
    mutationFn: apiClient.startCrossApplicationWorkflow,
    onSuccess: async () => refresh(),
  });
  const pauseGraph = useMutation({
    mutationFn: apiClient.pauseCrossApplicationWorkflow,
    onSuccess: async () => refresh(),
  });
  const cancelGraph = useMutation({
    mutationFn: apiClient.cancelCrossApplicationWorkflow,
    onSuccess: async () => refresh(),
  });
  const recoverGraph = useMutation({
    mutationFn: apiClient.recoverCrossApplicationWorkflow,
    onSuccess: async () => refresh(),
  });

  const graphById = useMemo(
    () =>
      new Map((crossApplication.data?.graphs ?? []).map((graph) => [graph.id, graph])),
    [crossApplication.data?.graphs],
  );
  const selectedGraph =
    selectedRun?.kind === "graph" ? (graphById.get(selectedRun.id) ?? null) : null;
  const graphNodes = useMemo(
    () =>
      selectedGraph
        ? (crossApplication.data?.nodes ?? []).filter(
            (node) => node.graphId === selectedGraph.id,
          )
        : [],
    [crossApplication.data?.nodes, selectedGraph],
  );
  const graphHistory = useMemo(
    () =>
      selectedGraph
        ? (crossApplication.data?.executionHistory ?? []).filter(
            (event) => event.graphId === selectedGraph.id,
          )
        : [],
    [crossApplication.data?.executionHistory, selectedGraph],
  );
  const activeGraphs = useMemo(
    () =>
      (crossApplication.data?.graphs ?? []).filter(
        (graph) => !isWorkflowTerminal(graph.status),
      ),
    [crossApplication.data?.graphs],
  );
  const activeRuns = useMemo(
    () =>
      (workflows.data ?? []).filter((workflow) => !isWorkflowTerminal(workflow.status)),
    [workflows.data],
  );
  const waitingForApproval =
    activeRuns.filter((workflow) => workflow.status === "WAITING_APPROVAL").length +
    activeGraphs.filter((graph) => graph.status === "waiting_approval").length;
  const completedToday = [
    ...(workflows.data ?? []),
    ...(crossApplication.data?.graphs ?? []),
  ].filter(
    (run) =>
      run.completedAt &&
      new Date(run.completedAt).toDateString() === new Date().toDateString(),
  ).length;
  const failedRuns = [
    ...(workflows.data ?? []),
    ...(crossApplication.data?.graphs ?? []),
  ].filter((run) => ["FAILED", "failed"].includes(run.status)).length;
  const recentRuns = useMemo(
    () =>
      [...(workflows.data ?? []), ...(crossApplication.data?.graphs ?? [])]
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        )
        .slice(0, 20),
    [crossApplication.data?.graphs, workflows.data],
  );
  const applyTemplate = (templateId: string) => {
    const template = crossApplication.data?.templates.find(
      (candidate) => candidate.id === templateId,
    );
    setSelectedTemplateId(templateId);
    if (template) setWorkflowGoal(template.description);
    setTab("builder");
  };
  const submitEngineeringWorkflow = (event: FormEvent) => {
    event.preventDefault();
    if (repositoryIds.length > 0) createEngineeringWorkflow.mutate();
  };
  const detailProps = {
    detail: detail.data,
    graph: selectedGraph,
    graphNodes,
    graphHistory,
    onApprove: () => detail.data && approve.mutate(detail.data.workflow.id),
    onAdvance: () => detail.data && advance.mutate(detail.data.workflow.id),
    onCancel: () =>
      selectedRun?.kind === "workflow"
        ? cancel.mutate(selectedRun.id)
        : selectedGraph && cancelGraph.mutate(selectedGraph.id),
    onPause: () =>
      selectedRun?.kind === "workflow"
        ? pause.mutate(selectedRun.id)
        : selectedGraph && pauseGraph.mutate(selectedGraph.id),
    onRecover: () => selectedGraph && recoverGraph.mutate(selectedGraph.id),
    onStart: () => selectedGraph && startGraph.mutate(selectedGraph.id),
    onCompleteTask: (taskId: string) =>
      detail.data &&
      completeTask.mutate({ workflowId: detail.data.workflow.id, taskId }),
  };

  return (
    <section className="placeholder-page wide-page governance-page workflows-page">
      <header className="workflow-page-header">
        <div>
          <p className="eyebrow">Workflow operations</p>
          <h1>Workflows</h1>
          <p>
            Run repeatable processes, see their progress, and review the work Alexa has
            completed.
          </p>
        </div>
        <button
          className="workflow-primary-action"
          onClick={() => setTab("builder")}
          type="button"
        >
          Create Workflow
        </button>
      </header>
      <nav
        className="workspace-tabs workflow-tabs"
        aria-label="Workflow workspace views"
      >
        {workflowWorkspaceTabs.map((item) => (
          <button
            aria-current={tab === item ? "page" : undefined}
            className={tab === item ? "active" : ""}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {workflowReadableLabel(item)}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="workflow-view">
          <section className="workflow-metrics" aria-label="Workflow summary">
            <article>
              <span>Active workflows</span>
              <strong>{activeRuns.length + activeGraphs.length}</strong>
              <small>In progress or ready to continue</small>
            </article>
            <article>
              <span>Waiting for approval</span>
              <strong>{waitingForApproval}</strong>
              <small>Paused at a governed checkpoint</small>
            </article>
            <article>
              <span>Completed today</span>
              <strong>{completedToday}</strong>
              <small>Finished workflow runs</small>
            </article>
            <article>
              <span>Needs attention</span>
              <strong>{failedRuns}</strong>
              <small>Failed workflow runs</small>
            </article>
          </section>
          <section className="workflow-overview-grid">
            <section className="workflow-section workflow-active-preview">
              <div className="workflow-section-heading">
                <div>
                  <p className="eyebrow">Active work</p>
                  <h2>What Alexa is running</h2>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setTab("active")}
                  type="button"
                >
                  View active
                </button>
              </div>
              {activeRuns.length + activeGraphs.length === 0 ? (
                <WorkflowEmptyState
                  onLibrary={() => setTab("library")}
                  onBuilder={() => setTab("builder")}
                />
              ) : null}
              {activeRuns.slice(0, 3).map((workflow) => (
                <WorkflowRunRow
                  key={workflow.id}
                  name={workflow.goal}
                  progress="Open to inspect progress"
                  status={workflow.status}
                  updatedAt={workflow.updatedAt}
                  onClick={() =>
                    selectRun({ kind: "workflow", id: workflow.id }, "active")
                  }
                />
              ))}
              {activeGraphs.slice(0, 3).map((graph) => {
                const progress = workflowProgress(
                  (crossApplication.data?.nodes ?? []).filter(
                    (node) => node.graphId === graph.id,
                  ),
                );
                return (
                  <WorkflowRunRow
                    key={graph.id}
                    name={graph.goal}
                    progress={`${progress.completed} / ${progress.total} steps`}
                    status={graph.status}
                    updatedAt={graph.updatedAt}
                    onClick={() => selectRun({ kind: "graph", id: graph.id }, "active")}
                  />
                );
              })}
            </section>
            <section className="workflow-section workflow-attention-panel">
              <p className="eyebrow">Needs attention</p>
              {waitingForApproval > 0 ? (
                <>
                  <h2>Approval required</h2>
                  <p>
                    {waitingForApproval} workflow{" "}
                    {waitingForApproval === 1 ? "is" : "are"} waiting at an existing
                    approval checkpoint.
                  </p>
                  <a className="secondary-button" href="/approvals">
                    Review approvals
                  </a>
                </>
              ) : null}
              {waitingForApproval === 0 && failedRuns === 0 ? (
                <>
                  <h2>Nothing is blocked</h2>
                  <p>Alexa has no workflow approvals or failures needing review.</p>
                </>
              ) : null}
              {failedRuns > 0 ? (
                <>
                  <h2>
                    {failedRuns} run{failedRuns === 1 ? "" : "s"} failed
                  </h2>
                  <p>
                    Open History to see the affected step and any available recovery.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => setTab("history")}
                    type="button"
                  >
                    View history
                  </button>
                </>
              ) : null}
            </section>
          </section>
          <section className="workflow-section">
            <div className="workflow-section-heading">
              <div>
                <p className="eyebrow">Recently used</p>
                <h2>Workflow runs</h2>
              </div>
              <button
                className="secondary-button"
                onClick={() => setTab("history")}
                type="button"
              >
                View history
              </button>
            </div>
            {recentRuns.length === 0 ? (
              <p className="workflow-empty-copy">
                No workflow runs yet. Start with a reusable process in the Library or
                create one in Builder.
              </p>
            ) : null}
            {recentRuns.slice(0, 5).map((run) => (
              <WorkflowRunRow
                key={run.id}
                name={run.goal}
                progress={
                  isWorkflowTerminal(run.status) ? "Run finished" : "In progress"
                }
                status={run.status}
                updatedAt={run.updatedAt}
                onClick={() =>
                  selectRun(
                    { kind: "nodeCount" in run ? "graph" : "workflow", id: run.id },
                    "history",
                  )
                }
              />
            ))}
          </section>
        </div>
      ) : null}

      {tab === "active" ? (
        <div className="workflow-view">
          <section className="workflow-section">
            <div className="workflow-section-heading">
              <div>
                <p className="eyebrow">Active workflows</p>
                <h2>Current multi-step work</h2>
              </div>
              <small>{activeRuns.length + activeGraphs.length} open</small>
            </div>
            {activeRuns.length + activeGraphs.length === 0 ? (
              <WorkflowEmptyState
                onLibrary={() => setTab("library")}
                onBuilder={() => setTab("builder")}
              />
            ) : (
              <WorkflowRunTable
                activeGraphs={activeGraphs}
                activeRuns={activeRuns}
                nodes={crossApplication.data?.nodes ?? []}
                onSelect={selectRun}
              />
            )}
          </section>
          <WorkflowDetail {...detailProps} />
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="workflow-view">
          <section className="workflow-section">
            <div className="workflow-section-heading">
              <div>
                <p className="eyebrow">Workflow library</p>
                <h2>Reusable processes</h2>
              </div>
              <small>{crossApplication.data?.templates.length ?? 0} available</small>
            </div>
            {(crossApplication.data?.templates.length ?? 0) === 0 ? (
              <p className="workflow-empty-copy">
                No reusable workflow templates are available yet.
              </p>
            ) : null}
            <div className="workflow-library-grid">
              {crossApplication.data?.templates.map((template) => (
                <article className="workflow-template-card" key={template.id}>
                  <p className="eyebrow">
                    {workflowReadableLabel(template.category)} ·{" "}
                    {workflowReadableLabel(template.source)}
                  </p>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <dl>
                    <div>
                      <dt>Steps</dt>
                      <dd>{template.capabilityIds.length}</dd>
                    </div>
                    <div>
                      <dt>Assignment</dt>
                      <dd>Automatic</dd>
                    </div>
                    <div>
                      <dt>Last used</dt>
                      <dd>Not measured</dd>
                    </div>
                  </dl>
                  <div className="button-row">
                    <button onClick={() => applyTemplate(template.id)} type="button">
                      Run
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => applyTemplate(template.id)}
                      type="button"
                    >
                      Inspect
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "builder" ? (
        <div className="workflow-view">
          <section className="workflow-builder workflow-section">
            <div className="workflow-section-heading">
              <div>
                <p className="eyebrow">Workflow builder</p>
                <h2>Create a repeatable process</h2>
              </div>
            </div>
            <label>
              What should Alexa accomplish?
              <textarea
                rows={3}
                required
                value={workflowGoal}
                onChange={(event) => setWorkflowGoal(event.target.value)}
              />
            </label>
            <label>
              Start from a reusable workflow
              <select
                value={selectedTemplateId}
                onChange={(event) => applyTemplate(event.target.value)}
              >
                <option value="">Start with a new workflow</option>
                {crossApplication.data?.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="workflow-builder-flow">
              <span>Goal</span>
              <i>↓</i>
              <span>Steps</span>
              <i>↓</i>
              <span>Assignment</span>
              <i>↓</i>
              <span>Approvals</span>
              <i>↓</i>
              <span>Review</span>
            </div>
            <section className="workflow-builder-summary">
              <h3>Workflow preview</h3>
              {selectedTemplateId ? (
                <p>
                  The selected reusable workflow will provide its existing governed
                  steps. Alexa keeps approvals and capability controls in place.
                </p>
              ) : (
                <p>
                  Alexa will compose a bounded, repeatable sequence from registered
                  workflow capabilities. Each step remains subject to its existing
                  policy and approval checks.
                </p>
              )}
              <p>
                <strong>Assignment:</strong> Automatic where a matching agent is
                available; otherwise awaiting assignment.
              </p>
            </section>
            <button
              className="workflow-primary-action"
              disabled={compose.isPending || !workflowGoal.trim()}
              onClick={() => compose.mutate()}
              type="button"
            >
              Create workflow
            </button>
            <details className="workflow-advanced">
              <summary>Advanced engineering workflow</summary>
              <p>
                Create a repository-backed development workflow using the existing
                review and approval model.
              </p>
              <form className="policy-form" onSubmit={submitEngineeringWorkflow}>
                <label>
                  Engineering goal
                  <textarea
                    rows={3}
                    required
                    value={engineeringGoal}
                    onChange={(event) => setEngineeringGoal(event.target.value)}
                  />
                </label>
                <label>
                  Approval strategy
                  <select
                    value={approvalStrategy}
                    onChange={(event) =>
                      setApprovalStrategy(
                        event.target.value as WorkflowApprovalStrategy,
                      )
                    }
                  >
                    <option value="approve_every_patch">Approve every patch</option>
                    <option value="approve_every_task">Approve every task</option>
                    <option value="approve_every_stage">Approve every stage</option>
                    <option value="approve_high_risk_only">
                      Approve high-risk only
                    </option>
                  </select>
                </label>
                <fieldset>
                  <legend>Repositories</legend>
                  <div className="checkbox-grid">
                    {repositories.data?.map((repository) => (
                      <label key={repository.id}>
                        <input
                          checked={repositoryIds.includes(repository.id)}
                          type="checkbox"
                          onChange={() =>
                            setRepositoryIds((current) =>
                              current.includes(repository.id)
                                ? current.filter((id) => id !== repository.id)
                                : [...current, repository.id],
                            )
                          }
                        />
                        {repository.workspaceId}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button
                  disabled={
                    createEngineeringWorkflow.isPending || repositoryIds.length === 0
                  }
                  type="submit"
                >
                  Create engineering workflow
                </button>
              </form>
            </details>
          </section>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="workflow-view">
          <section className="workflow-section">
            <div className="workflow-section-heading">
              <div>
                <p className="eyebrow">Workflow history</p>
                <h2>Previous workflow runs</h2>
              </div>
              <small>{recentRuns.length} recent</small>
            </div>
            {recentRuns.length === 0 ? (
              <p className="workflow-empty-copy">
                No completed or previous workflows are available yet.
              </p>
            ) : (
              <div
                className="workflow-run-table"
                role="table"
                aria-label="Workflow history"
              >
                <div className="workflow-run-header" role="row">
                  <span>Workflow</span>
                  <span>Started</span>
                  <span>Result</span>
                  <span>Duration</span>
                  <span>Updated</span>
                </div>
                {recentRuns.map((run) => (
                  <WorkflowRunRow
                    history
                    key={run.id}
                    name={run.goal}
                    progress={formatDate(run.createdAt)}
                    status={run.status}
                    updatedAt={run.updatedAt}
                    duration={elapsed(run.createdAt, run.completedAt)}
                    onClick={() =>
                      selectRun({
                        kind: "nodeCount" in run ? "graph" : "workflow",
                        id: run.id,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>
          <WorkflowDetail {...detailProps} />
        </div>
      ) : null}
    </section>
  );
};

const WorkflowEmptyState = ({
  onLibrary,
  onBuilder,
}: {
  onLibrary: () => void;
  onBuilder: () => void;
}) => (
  <div className="workflow-empty-state">
    <h3>No workflows running</h3>
    <p>Start a workflow from the Library or create one for a new repeatable process.</p>
    <div className="button-row">
      <button className="secondary-button" onClick={onLibrary} type="button">
        Browse Library
      </button>
      <button onClick={onBuilder} type="button">
        Create Workflow
      </button>
    </div>
  </div>
);

const WorkflowRunRow = ({
  name,
  progress,
  assignment = "Awaiting assignment",
  status,
  updatedAt,
  duration,
  history = false,
  onClick,
}: {
  name: string;
  progress: string;
  assignment?: string;
  status: string;
  updatedAt: string;
  duration?: string;
  history?: boolean;
  onClick: () => void;
}) => (
  <button className="workflow-run-row" onClick={onClick} role="row" type="button">
    <strong>{name}</strong>
    <span>{progress}</span>
    {history ? (
      <span className={statusClass(status)}>{workflowReadableLabel(status)}</span>
    ) : (
      <span>{assignment}</span>
    )}
    {history ? (
      <span>{duration ?? "Not measured"}</span>
    ) : (
      <span className={statusClass(status)}>{workflowReadableLabel(status)}</span>
    )}
    <time>{formatDate(updatedAt)}</time>
  </button>
);

const WorkflowRunTable = ({
  activeRuns,
  activeGraphs,
  nodes,
  onSelect,
}: {
  activeRuns: Awaited<ReturnType<ApiClient["getWorkflows"]>>;
  activeGraphs: Awaited<
    ReturnType<ApiClient["getCrossApplicationWorkflows"]>
  >["graphs"];
  nodes: Awaited<ReturnType<ApiClient["getCrossApplicationWorkflows"]>>["nodes"];
  onSelect: (run: SelectedRun) => void;
}) => (
  <div className="workflow-run-table" role="table" aria-label="Active workflows">
    <div className="workflow-run-header" role="row">
      <span>Workflow</span>
      <span>Progress</span>
      <span>Owner / agents</span>
      <span>State</span>
      <span>Updated</span>
    </div>
    {activeRuns.map((workflow) => (
      <WorkflowRunRow
        key={workflow.id}
        name={workflow.goal}
        progress="Open to inspect progress"
        status={workflow.status}
        updatedAt={workflow.updatedAt}
        onClick={() => onSelect({ kind: "workflow", id: workflow.id })}
      />
    ))}
    {activeGraphs.map((graph) => {
      const progress = workflowProgress(
        nodes.filter((node) => node.graphId === graph.id),
      );
      return (
        <WorkflowRunRow
          key={graph.id}
          name={graph.goal}
          progress={`${progress.completed} / ${progress.total} steps`}
          status={graph.status}
          updatedAt={graph.updatedAt}
          onClick={() => onSelect({ kind: "graph", id: graph.id })}
        />
      );
    })}
  </div>
);

const WorkflowDetail = ({
  detail,
  graph,
  graphNodes,
  graphHistory,
  onApprove,
  onAdvance,
  onPause,
  onCancel,
  onRecover,
  onStart,
  onCompleteTask,
}: {
  detail: Awaited<ReturnType<ApiClient["getWorkflow"]>> | undefined;
  graph:
    | Awaited<ReturnType<ApiClient["getCrossApplicationWorkflows"]>>["graphs"][number]
    | null;
  graphNodes: Awaited<ReturnType<ApiClient["getCrossApplicationWorkflows"]>>["nodes"];
  graphHistory: Awaited<
    ReturnType<ApiClient["getCrossApplicationWorkflows"]>
  >["executionHistory"];
  onApprove: () => void;
  onAdvance: () => void;
  onPause: () => void;
  onCancel: () => void;
  onRecover: () => void;
  onStart: () => void;
  onCompleteTask: (taskId: string) => void;
}) => {
  if (!detail && !graph)
    return (
      <section className="workflow-detail-empty">
        <p>Select a workflow run to inspect its goal, steps, approvals, and results.</p>
      </section>
    );
  if (detail)
    return (
      <section className="workflow-detail">
        <div className="workflow-section-heading">
          <div>
            <p className="eyebrow">Workflow detail</p>
            <h2>{detail.workflow.goal}</h2>
          </div>
        <div className="workflow-heading-actions">
          <ContextualAskAlexa kind="WORKFLOW" id={detail.workflow.id} label={detail.workflow.goal} />
          <span className={statusClass(detail.workflow.status)}>{workflowReadableLabel(detail.workflow.status)}</span>
        </div>
        </div>
        <p>{detail.workflow.planSummary}</p>
        <dl className="workflow-detail-metrics">
          <div>
            <dt>Progress</dt>
            <dd>
              {detail.progress.completedTasks} / {detail.progress.totalTasks} steps
            </dd>
          </div>
          <div>
            <dt>Current step</dt>
            <dd>
              {detail.tasks.find((task) => task.id === detail.workflow.currentTaskId)
                ?.title ?? "Awaiting next step"}
            </dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>
              {detail.progress.waitingApprovalTasks > 0
                ? "Waiting for approval"
                : "No approval waiting"}
            </dd>
          </div>
          <div>
            <dt>Estimated completion</dt>
            <dd>{detail.progress.estimatedCompletion ?? "Not measured"}</dd>
          </div>
        </dl>
        <div className="button-row">
          <button onClick={onApprove} type="button">
            Approve / resume
          </button>
          <button className="secondary-button" onClick={onAdvance} type="button">
            Continue
          </button>
          <button className="secondary-button" onClick={onPause} type="button">
            Pause
          </button>
          <button className="danger-button" onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
        <h3>Steps</h3>
        <ol className="workflow-step-list">
          {detail.tasks.map((task) => (
            <li key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <p>{task.goal}</p>
                <small>Assignment: Awaiting assignment</small>
              </div>
              <div>
                <span className={statusClass(task.status)}>
                  {workflowReadableLabel(task.status)}
                </span>
                {task.status !== "COMPLETED" ? (
                  <button
                    className="secondary-button"
                    onClick={() => onCompleteTask(task.id)}
                    type="button"
                  >
                    Mark complete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {detail.checkpoints.length > 0 ? (
          <section className="workflow-checkpoints">
            <h3>Approvals and checkpoints</h3>
            {detail.checkpoints.map((checkpoint) => (
              <p key={checkpoint.id}>
                <span className={statusClass(checkpoint.status)}>
                  {workflowReadableLabel(checkpoint.status)}
                </span>
                {checkpoint.summary}
              </p>
            ))}
          </section>
        ) : null}
        {detail.report ? (
          <section className="workflow-result">
            <h3>Result</h3>
            <p>{detail.report.summary}</p>
            <p>{detail.report.validationSummary}</p>
          </section>
        ) : null}
        <details className="workflow-advanced">
          <summary>Advanced</summary>
          <p>Workflow ID: {detail.workflow.id}</p>
          <p>
            Risk: {detail.workflow.riskLevel} · Difficulty: {detail.workflow.difficulty}
          </p>
          <p>
            Validation requirements:{" "}
            {detail.workflow.validationRequirements.join(", ") || "None recorded"}
          </p>
        </details>
      </section>
    );
  const progress = workflowProgress(graphNodes);
  return (
    <section className="workflow-detail">
      <div className="workflow-section-heading">
        <div>
          <p className="eyebrow">Workflow detail</p>
          <h2>{graph!.goal}</h2>
        </div>
      <div className="workflow-heading-actions">
        <ContextualAskAlexa kind="WORKFLOW" id={graph!.id} label={graph!.goal} />
        <span className={statusClass(graph!.status)}>{workflowReadableLabel(graph!.status)}</span>
      </div>
      </div>
      <p>
        This run follows the selected reusable process through registered capabilities
        and existing approvals.
      </p>
      <dl className="workflow-detail-metrics">
        <div>
          <dt>Progress</dt>
          <dd>
            {progress.completed} / {progress.total} steps
          </dd>
        </div>
        <div>
          <dt>Current step</dt>
          <dd>
            {graphNodes.find((node) =>
              ["running", "waiting_approval"].includes(node.status),
            )?.label ?? "Awaiting next step"}
          </dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>
            {graphNodes.some((node) => node.status === "waiting_approval")
              ? "Waiting for approval"
              : "No approval waiting"}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatDate(graph!.createdAt)}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button onClick={onStart} type="button">
          Start
        </button>
        <button className="secondary-button" onClick={onPause} type="button">
          Pause
        </button>
        <button className="secondary-button" onClick={onRecover} type="button">
          Recover
        </button>
        <button className="danger-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      <h3>Steps</h3>
      <ol className="workflow-step-list">
        {graphNodes.map((node) => (
          <li key={node.id}>
            <div>
              <strong>{node.label}</strong>
              <p>{node.expectedOutputs[0] ?? "Completes the next workflow step."}</p>
              <small>Assignment: Awaiting assignment</small>
            </div>
            <span className={statusClass(node.status)}>
              {workflowReadableLabel(node.status)}
            </span>
          </li>
        ))}
      </ol>
      {graphHistory.length > 0 ? (
        <section className="workflow-checkpoints">
          <h3>Timeline</h3>
          {graphHistory.slice(0, 12).map((event) => (
            <p key={event.id}>
              <time>{formatDate(event.createdAt)}</time>
              {event.summary}
            </p>
          ))}
        </section>
      ) : null}
      <details className="workflow-advanced">
        <summary>Advanced</summary>
        <p>Workflow ID: {graph!.id}</p>
        <p>
          {graph!.nodeCount} nodes · {graph!.edgeCount} dependencies · parallelism{" "}
          {graph!.parallelism}
        </p>
      </details>
    </section>
  );
};
