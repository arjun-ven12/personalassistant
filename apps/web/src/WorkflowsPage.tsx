import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { WorkflowApprovalStrategy } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

export const WorkflowsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState("Add OAuth safely");
  const [crossAppGoal, setCrossAppGoal] = useState(
    "Prepare me for today's meeting",
  );
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);
  const [approvalStrategy, setApprovalStrategy] =
    useState<WorkflowApprovalStrategy>("approve_every_patch");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const repositories = useQuery({
    queryKey: ["repositories"],
    queryFn: apiClient.getRepositories,
  });
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: apiClient.getWorkflows,
    refetchInterval: 5_000,
  });
  const crossAppWorkflows = useQuery({
    queryKey: ["cross-application-workflows"],
    queryFn: apiClient.getCrossApplicationWorkflows,
    refetchInterval: 5_000,
  });
  const detail = useQuery({
    queryKey: ["workflow", selectedWorkflowId],
    queryFn: () => apiClient.getWorkflow(selectedWorkflowId!),
    enabled: Boolean(selectedWorkflowId),
    refetchInterval: 5_000,
  });
  const refresh = async (workflowId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["workflows"] });
    if (workflowId ?? selectedWorkflowId)
      await queryClient.invalidateQueries({
        queryKey: ["workflow", workflowId ?? selectedWorkflowId],
      });
  };
  const create = useMutation({
    mutationFn: () =>
      apiClient.createWorkflow({ goal, repositoryIds, approvalStrategy }),
    onSuccess: async (response) => {
      setSelectedWorkflowId(response.workflow.id);
      await refresh(response.workflow.id);
    },
  });
  const composeCrossApp = useMutation({
    mutationFn: () =>
      apiClient.composeCrossApplicationWorkflow({
        goal: crossAppGoal,
        variables: {},
        origin: "planner",
      }),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] }),
  });
  const startCrossApp = useMutation({
    mutationFn: apiClient.startCrossApplicationWorkflow,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] }),
  });
  const pauseCrossApp = useMutation({
    mutationFn: apiClient.pauseCrossApplicationWorkflow,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] }),
  });
  const cancelCrossApp = useMutation({
    mutationFn: apiClient.cancelCrossApplicationWorkflow,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] }),
  });
  const recoverCrossApp = useMutation({
    mutationFn: apiClient.recoverCrossApplicationWorkflow,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["cross-application-workflows"] }),
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
  const toggleRepository = (id: string) =>
    setRepositoryIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (repositoryIds.length > 0) create.mutate();
  };
  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 5.3</p>
      <h1>Workflow Explorer</h1>
      <p>
        Coordinate repository analysis, patch checkpoints, validation checkpoints,
        review, and reporting. Workflows stay observable, auditable, and manually gated.
      </p>

      <form className="policy-form" onSubmit={submit}>
        <label>
          Engineering goal
          <textarea
            required
            rows={3}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <label>
          Approval strategy
          <select
            value={approvalStrategy}
            onChange={(event) =>
              setApprovalStrategy(event.target.value as WorkflowApprovalStrategy)
            }
          >
            <option value="approve_every_patch">Approve every patch</option>
            <option value="approve_every_task">Approve every task</option>
            <option value="approve_every_stage">Approve every stage</option>
            <option value="approve_high_risk_only">Approve high-risk only</option>
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
                  onChange={() => toggleRepository(repository.id)}
                />
                {repository.workspaceId}
                <small>{repository.indexStatus}</small>
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={create.isPending} type="submit">
          Create workflow
        </button>
      </form>

      <section className="status-grid">
        <article className="status-card">
          <span>Total workflows</span>
          <strong>{workflows.data?.length ?? 0}</strong>
          <small>Persistent queue</small>
        </article>
        <article className="status-card">
          <span>Selected progress</span>
          <strong>{detail.data?.progress.percentComplete ?? 0}%</strong>
          <small>
            {detail.data?.progress.estimatedCompletion ?? "No workflow selected"}
          </small>
        </article>
      </section>

      <section className="panel-list">
        <h2>Phase 18F Workflow Operations Center</h2>
        <article className="panel">
          <p className="eyebrow">Cross-application orchestration</p>
          <h3>Outcome → deterministic workflow DAG</h3>
          <p>
            Compose real-world workflows from semantic adapter capabilities. Nodes
            execute only through the Core Application Adapter Suite and existing
            provider transport.
          </p>
          <label>
            Desired outcome
            <textarea
              rows={3}
              value={crossAppGoal}
              onChange={(event) => setCrossAppGoal(event.target.value)}
            />
          </label>
          <button
            disabled={composeCrossApp.isPending}
            onClick={() => composeCrossApp.mutate()}
            type="button"
          >
            Compose workflow
          </button>
        </article>

        <section className="status-grid">
          <article className="status-card">
            <span>Graphs</span>
            <strong>{crossAppWorkflows.data?.graphs.length ?? 0}</strong>
            <small>Cross-application workflow DAGs</small>
          </article>
          <article className="status-card">
            <span>Templates</span>
            <strong>{crossAppWorkflows.data?.templates.length ?? 0}</strong>
            <small>Built-in + demonstrated templates</small>
          </article>
          <article className="status-card">
            <span>Open approvals</span>
            <strong>
              {crossAppWorkflows.data?.checkpoints.filter(
                (checkpoint) => checkpoint.status === "open",
              ).length ?? 0}
            </strong>
            <small>Paused checkpoints</small>
          </article>
        </section>

        {crossAppWorkflows.data?.graphs.slice(0, 5).map((graph) => {
          const nodes = crossAppWorkflows.data.nodes.filter(
            (node) => node.graphId === graph.id,
          );
          const history = crossAppWorkflows.data.executionHistory.filter(
            (event) => event.graphId === graph.id,
          );
          return (
            <article className="panel" key={graph.id}>
              <p className="eyebrow">
                {graph.status} · {graph.nodeCount} nodes · {graph.edgeCount} edges
              </p>
              <h3>{graph.goal}</h3>
              <p>
                Deterministic composer: {String(graph.deterministicComposer)} ·
                Planner app-specific logic:{" "}
                {String(graph.plannerApplicationSpecificLogicAvailable)}
              </p>
              <div className="button-row">
                <button
                  disabled={startCrossApp.isPending}
                  onClick={() => startCrossApp.mutate(graph.id)}
                  type="button"
                >
                  Start
                </button>
                <button
                  disabled={pauseCrossApp.isPending}
                  onClick={() => pauseCrossApp.mutate(graph.id)}
                  type="button"
                >
                  Pause
                </button>
                <button
                  disabled={recoverCrossApp.isPending}
                  onClick={() => recoverCrossApp.mutate(graph.id)}
                  type="button"
                >
                  Recover
                </button>
                <button
                  disabled={cancelCrossApp.isPending}
                  onClick={() => cancelCrossApp.mutate(graph.id)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <div className="timeline">
                {nodes.map((node) => (
                  <div className="timeline-item" key={node.id}>
                    <strong>{node.label}</strong>
                    <span>
                      {node.status} · {node.adapterId ?? "checkpoint"} ·{" "}
                      {node.semanticCapabilityId ?? node.nodeKind}
                    </span>
                    <small>
                      deps {node.dependencies.length} · approval{" "}
                      {node.approvalRequired ? "required" : "not required"}
                    </small>
                  </div>
                ))}
              </div>
              <h4>Execution timeline</h4>
              {history.slice(0, 5).map((event) => (
                <p key={event.id}>
                  <small>
                    {event.createdAt} · {event.eventType} · {event.summary}
                  </small>
                </p>
              ))}
            </article>
          );
        })}
      </section>

      <section className="panel-list">
        <h2>Workflow history</h2>
        {workflows.data?.map((workflow) => (
          <article className="panel" key={workflow.id}>
            <p className="eyebrow">{workflow.status}</p>
            <h3>{workflow.goal}</h3>
            <p>{workflow.planSummary}</p>
            <button type="button" onClick={() => setSelectedWorkflowId(workflow.id)}>
              Inspect workflow
            </button>
          </article>
        ))}
      </section>

      {detail.data ? (
        <section className="panel-list">
          <h2>Selected workflow</h2>
          <article className="panel">
            <p className="eyebrow">{detail.data.workflow.status}</p>
            <h3>{detail.data.workflow.goal}</h3>
            <p>
              Risk {detail.data.workflow.riskLevel} · difficulty{" "}
              {detail.data.workflow.difficulty} · {detail.data.progress.completedTasks}/
              {detail.data.progress.totalTasks} tasks complete
            </p>
            <div className="button-row">
              <button
                disabled={approve.isPending}
                onClick={() => approve.mutate(detail.data.workflow.id)}
                type="button"
              >
                Approve/resume
              </button>
              <button
                disabled={advance.isPending}
                onClick={() => advance.mutate(detail.data.workflow.id)}
                type="button"
              >
                Advance
              </button>
              <button
                disabled={pause.isPending}
                onClick={() => pause.mutate(detail.data.workflow.id)}
                type="button"
              >
                Pause
              </button>
              <button
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(detail.data.workflow.id)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </article>

          <h2>Task timeline</h2>
          {detail.data.tasks.map((task) => (
            <article className="panel" key={task.id}>
              <p className="eyebrow">{task.status}</p>
              <h3>{task.title}</h3>
              <p>{task.goal}</p>
              <p>
                Risk {task.riskLevel} · complexity {task.estimatedComplexity} · deps{" "}
                {task.dependencies.length}
              </p>
              <p>Validation: {task.validationPlan.join(", ")}</p>
              <div className="button-row">
                <button
                  disabled={task.status === "COMPLETED" || completeTask.isPending}
                  onClick={() =>
                    completeTask.mutate({
                      workflowId: detail.data.workflow.id,
                      taskId: task.id,
                    })
                  }
                  type="button"
                >
                  Mark complete
                </button>
              </div>
            </article>
          ))}

          <h2>Checkpoints</h2>
          {detail.data.checkpoints.map((checkpoint) => (
            <article className="panel" key={checkpoint.id}>
              <p className="eyebrow">
                {checkpoint.kind} · {checkpoint.status}
              </p>
              <p>{checkpoint.summary}</p>
            </article>
          ))}

          <h2>Events</h2>
          {detail.data.events.slice(0, 20).map((event) => (
            <article className="panel" key={event.id}>
              <p className="eyebrow">{event.eventType}</p>
              <p>{event.message}</p>
              <small>{event.createdAt}</small>
            </article>
          ))}

          {detail.data.report ? (
            <>
              <h2>Report</h2>
              <article className="panel">
                <h3>{detail.data.report.title}</h3>
                <p>{detail.data.report.summary}</p>
                <p>{detail.data.report.validationSummary}</p>
              </article>
            </>
          ) : null}
        </section>
      ) : null}
    </section>
  );
};
