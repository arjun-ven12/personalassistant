import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  Flag,
  Gauge,
  Plus,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { ApiClientError, type ApiClient } from "./api.js";
import { ObjectiveExperimentsPanel } from "./ObjectiveExperimentsPanel.js";
import {
  ContextualAskAlexa,
  ExecutionChainStrip,
  StructuredExplanation,
} from "./BusinessOSComponents.js";

type Tab = "overview" | "active" | "drafts" | "completed";
const key = () => `owner-${crypto.randomUUID()}`;

export const ObjectivesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["objectives"],
    queryFn: apiClient.getObjectives,
    refetchInterval: 10_000,
  });
  const business = useQuery({
    queryKey: ["business-operations"],
    queryFn: apiClient.getBusinessOperations,
    refetchInterval: 15_000,
  });
  const businessOS = useQuery({
    queryKey: ["business-os-summary"],
    queryFn: apiClient.getBusinessOSSummary,
    refetchInterval: 15_000,
  });
  const workforceRuntime = useQuery({
    queryKey: ["workforce-runtime", "objectives"],
    queryFn: apiClient.getWorkforceRuntime,
    refetchInterval: 5_000,
  });
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("selected"));
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState(1);
  const [deadline, setDeadline] = useState("");
  const [budget, setBudget] = useState(100);
  const [questions, setQuestions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBudget, setEditBudget] = useState(100);
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState<
    "LOW" | "NORMAL" | "HIGH" | "URGENT"
  >("NORMAL");
  const [editConstraints, setEditConstraints] = useState("");
  const [editMetric, setEditMetric] = useState("");
  const [editTarget, setEditTarget] = useState(1);
  const [modificationStatus, setModificationStatus] = useState("");
  const [specialistStatus, setSpecialistStatus] = useState<{
    taskId: string;
    tone: "pending" | "success" | "error";
    message: string;
  } | null>(null);
  const [sort, setSort] = useState<"attention" | "priority" | "deadline" | "budget" | "outcome">("attention");
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["objectives"] });
    await client.invalidateQueries({ queryKey: ["workforce-runtime"] });
  };
  const create = useMutation({
    mutationFn: () =>
      apiClient.createObjective({
        title,
        outcome,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        budgetCredits: budget,
        priority: "NORMAL",
        organizationId: null,
        constraints: [],
        metrics: metric
          ? [{ name: metric, unit: "count", target, direction: "HIGHER_IS_BETTER" }]
          : [],
      }),
    onSuccess: (result) => {
      setQuestions(result.clarificationQuestions);
      if (result.objective) {
        setSelected(result.objective.id);
        setCreating(false);
        void refresh();
      }
    },
  });
  const mutate = useMutation({
    mutationFn: (input: {
      id: string;
      action: "activate" | "pause" | "replan" | "cancel";
    }) => {
      const idempotencyKey = key();
      if (input.action === "activate")
        return apiClient.activateObjective(input.id, idempotencyKey);
      if (input.action === "pause")
        return apiClient.pauseObjective(input.id, idempotencyKey);
      if (input.action === "replan")
        return apiClient.replanObjective(input.id, idempotencyKey);
      return apiClient.cancelObjective(input.id, idempotencyKey);
    },
    onSuccess: refresh,
  });
  const approveSpecialist = useMutation({
    mutationFn: (input: { taskId: string; proposalId: string; mode: "create" | "fund" }) =>
      apiClient.approveWorkforceSpecialist(input.taskId, {
        approved: true,
        proposalId: input.proposalId,
      }),
    onMutate: (input) => {
      setSpecialistStatus({
        taskId: input.taskId,
        tone: "pending",
        message: input.mode === "fund"
          ? "Funding the existing specialist and reserving this bounded task..."
          : "Creating specialist and reserving its first assignment...",
      });
    },
    onSuccess: async (result, input) => {
      setSpecialistStatus({
        taskId: input.taskId,
        tone: "success",
        message: result.task.assignedAgentId
          ? `Specialist created and assigned: ${result.task.assignedAgentId}.`
          : "Specialist created. The scheduler is preparing its assignment.",
      });
      await refresh();
    },
    onError: (error, input) => {
      const message = error instanceof ApiClientError
        ? `${error.code}: ${error.message}`
        : "Specialist creation could not be confirmed. No specialist was created.";
      setSpecialistStatus({ taskId: input.taskId, tone: "error", message });
    },
  });
  const modify = useMutation({
    mutationFn: (id: string) =>
      apiClient.modifyObjective(id, {
        idempotencyKey: key(),
        budgetCredits: editBudget,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        priority: editPriority,
        constraints: editConstraints
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        metrics: editMetric
          ? [
              {
                name: editMetric,
                unit: "count",
                target: editTarget,
                direction: "HIGHER_IS_BETTER",
              },
            ]
          : undefined,
      }),
    onSuccess: (result) => {
      setModificationStatus(
        `${result.status}${result.reasons.length ? ` · ${result.reasons.join(" ")}` : ""}`,
      );
      setEditing(false);
      void refresh();
    },
  });
  const data = query.data;
  const goals = new Map(data?.goals.map((item) => [item.id, item]) ?? []);
  const priorityRank = { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 } as const;
  const filtered = (data?.objectives.filter(
        (item) =>
          tab === "overview" ||
          (tab === "active" &&
            ["ACTIVE", "AT_RISK", "BLOCKED"].includes(item.status)) ||
          (tab === "drafts" &&
            ["DRAFT", "PLANNING", "AWAITING_CONFIRMATION"].includes(item.status)) ||
          (tab === "completed" &&
            ["COMPLETED", "FAILED", "CANCELLED"].includes(item.status)),
      ) ?? []).sort((left, right) => {
        if (sort === "priority") return (priorityRank[goals.get(right.executiveGoalId)?.priority as keyof typeof priorityRank] ?? 0) - (priorityRank[goals.get(left.executiveGoalId)?.priority as keyof typeof priorityRank] ?? 0);
        if (sort === "deadline") return (Date.parse(goals.get(left.executiveGoalId)?.targetDate ?? "9999-12-31") || Number.MAX_SAFE_INTEGER) - (Date.parse(goals.get(right.executiveGoalId)?.targetDate ?? "9999-12-31") || Number.MAX_SAFE_INTEGER);
        if (sort === "budget") return (right.projectedCost / Math.max(1, right.budgetCredits)) - (left.projectedCost / Math.max(1, left.budgetCredits));
        if (sort === "outcome") return (100 - right.outcomeProgress) - (100 - left.outcomeProgress);
        const attention = (item: typeof left) => (item.status === "BLOCKED" ? 5 : item.status === "AT_RISK" ? 4 : item.budgetStatus === "BUDGET_AT_RISK" ? 3 : item.deadlineStatus !== "ON_TRACK" ? 2 : 0);
        return attention(right) - attention(left);
      });
  const current = data?.objectives.find((item) => item.id === selected) ?? filtered[0];
  const goal = current ? goals.get(current.executiveGoalId) : undefined;
  const projects =
    data?.projects
      .filter((item) => item.objectiveExecutionId === current?.id)
      .sort((a, b) => a.sequence - b.sequence) ?? [];
  const runtimeTasks = new Map(
    workforceRuntime.data?.tasks.map((item) => [item.id, item]) ?? [],
  );
  const workforcePreparation = projects
    .map((project) => ({
      project,
      task: project.workforceTaskId ? runtimeTasks.get(project.workforceTaskId) : undefined,
    }))
    .filter((item) => item.task?.workforceGap || item.task?.selection.length);
  const scheduledProjects = projects.filter((project) => {
    const status = project.workforceTaskId
      ? runtimeTasks.get(project.workforceTaskId)?.status
      : undefined;
    return status !== undefined && ["ASSIGNED", "RESERVED", "RUNNING", "REVIEW_REQUIRED", "COMPLETED"].includes(status);
  }).length;
  const activationProgress = projects.length
    ? Math.round((scheduledProjects / projects.length) * 100)
    : 0;
  const events =
    data?.events.filter((item) => item.objectiveExecutionId === current?.id) ?? [];
  const externalExecutions =
    business.data?.executions.filter(
      (item) => item.references.objectiveId === current?.id,
    ) ?? [];
  const externalMetrics =
    business.data?.metrics.filter((item) => item.objectiveId === current?.id) ?? [];
  const externalAttributions =
    business.data?.attributions.filter((item) => item.objectiveId === current?.id) ??
    [];
  const executionChain = businessOS.data?.executionChains.find((item) =>
    item.nodes.some((node) => node.kind === "OBJECTIVE" && node.id === current?.id),
  );
  const explanation = businessOS.data?.explanations.find(
    (item) => item.entity.kind === "OBJECTIVE" && item.entity.id === current?.id,
  );
  return (
    <section className="objectives-page">
      <header className="objectives-header">
        <div>
          <span className="eyebrow">Outcome operations</span>
          <h1>Objectives</h1>
          <p>
            Turn measurable outcomes into governed projects, workflows, and specialist
            work.
          </p>
        </div>
        <button className="primary-action" onClick={() => setCreating(true)}>
          <Plus size={16} /> New objective
        </button>
      </header>
      <nav className="objectives-tabs" aria-label="Objective views">
        {(["overview", "active", "drafts", "completed"] as Tab[]).map((item) => (
          <button aria-selected={tab === item} key={item} onClick={() => setTab(item)}>
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </button>
        ))}
      </nav>
      <section className="objective-stats">
        <div>
          <Target />
          <span>Active</span>
          <strong>{data?.summary.active ?? 0}</strong>
        </div>
        <div>
          <AlertTriangle />
          <span>At risk</span>
          <strong>{data?.summary.atRisk ?? 0}</strong>
        </div>
        <div>
          <CirclePause />
          <span>Blocked</span>
          <strong>{data?.summary.blocked ?? 0}</strong>
        </div>
        <div>
          <CheckCircle2 />
          <span>Completed</span>
          <strong>{data?.summary.completed ?? 0}</strong>
        </div>
      </section>
      {creating ? (
        <form
          className="objective-composer"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <span className="eyebrow">Objective draft</span>
            <h2>Define the outcome</h2>
          </div>
          <label>
            Objective name
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Desired measurable outcome
            <textarea
              required
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
          </label>
          <div className="objective-form-row">
            <label>
              Success metric
              <input
                required
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
              />
            </label>
            <label>
              Target
              <input
                min={0}
                type="number"
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
              />
            </label>
            <label>
              Deadline
              <input
                required
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>
            <label>
              Budget (credits)
              <input
                min={1}
                type="number"
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
              />
            </label>
          </div>
          {questions.map((item) => (
            <p className="warning-text" key={item}>
              <AlertTriangle size={14} />
              {item}
            </p>
          ))}
          <div className="objective-actions">
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              className="primary-action"
              disabled={create.isPending}
              type="submit"
            >
              Create strategy draft
            </button>
          </div>
        </form>
      ) : null}
      {!creating ? (
        <section className="objectives-workspace">
          <div className="objective-list">
            <div className="objective-list-heading">
              <h2>
                {tab === "overview"
                  ? "Objective portfolio"
                  : `${tab[0]?.toUpperCase()}${tab.slice(1)} objectives`}
              </h2>
              <label className="objective-sort">Sort<select value={sort} onChange={(event)=>setSort(event.target.value as typeof sort)}><option value="attention">Attention</option><option value="priority">Priority</option><option value="deadline">Deadline</option><option value="budget">Budget burn</option><option value="outcome">Outcome gap</option></select></label>
              <span>{filtered.length}</span>
            </div>
            {filtered.length ? (
              filtered.map((item) => {
                const itemGoal = goals.get(item.executiveGoalId);
                return (
                  <button
                    className={current?.id === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span
                      className={`objective-state state-${item.status.toLowerCase()}`}
                    >
                      {item.status.replaceAll("_", " ")}
                    </span>
                    <strong>{itemGoal?.title ?? "Untitled objective"}</strong>
                    <small>
                      {itemGoal?.targetDate
                        ? new Date(itemGoal.targetDate).toLocaleDateString()
                        : "No deadline"}{" "}
                      · {item.budgetCredits} credits
                    </small>
                    <div className="mini-progress">
                      <i style={{ width: `${item.executionProgress}%` }} />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty-state">
                <Flag size={20} />
                <strong>No objectives here</strong>
                <p>Create a measurable objective to build a reviewable strategy.</p>
              </div>
            )}
          </div>
          <article className="objective-detail">
            {current && goal ? (
              <>
                <header>
                  <div>
                    <span
                      className={`objective-state state-${current.status.toLowerCase()}`}
                    >
                      {current.status.replaceAll("_", " ")}
                    </span>
                    <h2>{goal.title}</h2>
                    <p>{goal.description}</p>
                  </div>
                  <div className="objective-actions">
                    <ContextualAskAlexa
                      kind="OBJECTIVE"
                      id={current.id}
                      label={goal.title}
                    />
                    {current.status === "AWAITING_CONFIRMATION" ||
                    current.status === "PAUSED" ||
                    current.status === "BLOCKED" ? (
                      <button
                        className="primary-action"
                        onClick={() =>
                          mutate.mutate({ id: current.id, action: "activate" })
                        }
                      >
                        Confirm & activate
                      </button>
                    ) : null}
                    {["ACTIVE", "AT_RISK"].includes(current.status) ? (
                      <button
                        onClick={() =>
                          mutate.mutate({ id: current.id, action: "pause" })
                        }
                      >
                        <CirclePause size={14} /> Pause
                      </button>
                    ) : null}
                    <button
                      onClick={() =>
                        mutate.mutate({ id: current.id, action: "replan" })
                      }
                    >
                      <RefreshCw size={14} /> Replan
                    </button>
                    {!["COMPLETED", "CANCELLED"].includes(current.status) ? (
                      <button
                        className="danger-button"
                        onClick={() =>
                          mutate.mutate({ id: current.id, action: "cancel" })
                        }
                      >
                        <XCircle size={14} /> Cancel
                      </button>
                    ) : null}
                  </div>
                </header>
                <section className="objective-progress-grid">
                  <div>
                    <span>Execution progress</span>
                    <strong>{current.executionProgress}%</strong>
                    <div className="progress-track">
                      <i style={{ width: `${current.executionProgress}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Outcome progress</span>
                    <strong>{current.outcomeProgress}%</strong>
                    <div className="progress-track outcome">
                      <i style={{ width: `${current.outcomeProgress}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Budget · {current.budgetStatus.replaceAll("_", " ")}</span>
                    <strong>
                      {current.spentCredits} / {current.budgetCredits}
                    </strong>
                    <small>
                      {current.projectedCost} projected · {current.committedCredits}{" "}
                      committed
                    </small>
                  </div>
                  <div>
                    <span>
                      Strategy · {current.deadlineStatus.replaceAll("_", " ")}
                    </span>
                    <strong>Version {current.strategyVersion}</strong>
                    <small>
                      {current.lastReplanTrigger
                        ? `Last replan: ${current.lastReplanTrigger.replaceAll("_", " ")}`
                        : goal.targetDate
                          ? `Due ${new Date(goal.targetDate).toLocaleDateString()}`
                          : "No deadline"}
                    </small>
                  </div>
                </section>
                {current.blockers.map((item) => (
                  <p className="objective-blocker" key={item}>
                    <AlertTriangle size={15} />
                    {item}
                  </p>
                ))}
                {current.riskReasons.map((item) => (
                  <p className="objective-risk" key={item}>
                    <AlertTriangle size={15} />
                    {item}
                  </p>
                ))}
                {["ACTIVE", "AT_RISK", "BLOCKED"].includes(current.status) ? (
                  <section className="objective-activation-progress" aria-label="Activation progress">
                    <div>
                      <span>Activation progress</span>
                      <strong>{scheduledProjects} / {projects.length} projects scheduled</strong>
                    </div>
                    <div className="progress-track">
                      <i style={{ width: `${activationProgress}%` }} />
                    </div>
                    <small>
                      {scheduledProjects === projects.length
                        ? "All projects are scheduled. Execution progress updates as verified work completes."
                        : `${projects.length - scheduledProjects} project${projects.length - scheduledProjects === 1 ? "" : "s"} still need a specialist or reservation.`}
                    </small>
                  </section>
                ) : null}
                {workforcePreparation.length ? (
                  <section className="objective-workforce-prep">
                    <header>
                      <div>
                        <h3>Workforce preparation</h3>
                      </div>
                      <span>
                        {
                          workforcePreparation.filter(
                            (item) => item.task?.assignedAgentId,
                          ).length
                        }{" "}
                        / {workforcePreparation.length} assigned
                      </span>
                    </header>
                    {workforcePreparation.map(({ project, task }) => {
                      const proposal = task?.workforceGap?.proposal;
                      const selected =
                        task?.selection.find(
                          (score) => score.agentId === task.assignedAgentId,
                        ) ?? task?.selection[0];
                      const status = task
                        ? specialistStatus?.taskId === task.id
                          ? specialistStatus
                          : null
                        : null;
                      const requiredSkills = task?.requirement?.requiredSkills ?? project.requiredSkills;
                      const requiredCapabilities = task?.requirement?.requiredCapabilities ?? project.requiredCapabilities;
                      const missingCapabilities = task?.workforceGap?.missingCapabilities ?? [];
                      const needsFunding = selected?.rejectionReasons.includes(
                        "insufficient economic budget",
                      ) ?? false;
                      return (
                        <article key={project.id}>
                          <div>
                            <strong>{project.title}</strong>
                            <small>
                              {selected
                                ? `${selected.category.replaceAll("_", " ")} · ${Math.round(selected.finalScore * 100)}% match`
                                : task?.workforceGap?.blockerCode ?? project.status}
                            </small>
                            {selected?.rejectionReasons.length ? (
                              <small className="workforce-rejection-reason">
                                {selected.rejectionReasons.join(" · ")}
                              </small>
                            ) : null}
                            <small className="workforce-requirements">
                              Skills: {requiredSkills.length ? requiredSkills.join(", ") : "general bounded work"}
                            </small>
                            <small className="workforce-requirements">
                              Capabilities: {requiredCapabilities.length ? requiredCapabilities.join(", ") : "no external capability required"}
                            </small>
                            {missingCapabilities.length ? (
                              <small className="workforce-rejection-reason">
                                Missing capability: {missingCapabilities.join(", ")}
                              </small>
                            ) : null}
                          </div>
                          {proposal ? (
                            <div>
                              <strong>{proposal.name}</strong>
                              <small>
                                {proposal.departmentName ?? "Workforce"} ·{" "}
                                {proposal.recommendation.toLowerCase()} ·{" "}
                                {proposal.capabilities.length -
                                  proposal.missingCapabilities.length}
                                /{proposal.capabilities.length} specialist-profile capabilities available
                              </small>
                            </div>
                          ) : (
                            <p>{task?.workforceGap?.reasons[0] ?? task?.status}</p>
                          )}
                          {proposal &&
                          task?.workforceGap?.decision ===
                            "SPECIALIST_APPROVAL_PENDING" ? (
                            <button
                              className="primary-action"
                              disabled={approveSpecialist.isPending}
                              type="button"
                              onClick={() =>
                                approveSpecialist.mutate({
                                  taskId: task.id,
                                  proposalId: proposal.proposalId,
                                  mode: needsFunding ? "fund" : "create",
                                })
                              }
                            >
                              {approveSpecialist.isPending && status?.tone === "pending"
                                ? needsFunding ? "Funding specialist..." : "Creating specialist..."
                                : needsFunding ? "Fund & reserve" : "Create specialist"}
                            </button>
                          ) : null}
                          {status ? (
                            <p className={`specialist-creation-status ${status.tone}`} role="status">
                              {status.message}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </section>
                ) : null}
                <StructuredExplanation explanation={explanation} />
                <ExecutionChainStrip chain={executionChain} />
                {modificationStatus ? (
                  <p className="objective-modification-result">{modificationStatus}</p>
                ) : null}
                <div className="objective-edit-toggle">
                  <button
                    onClick={() => {
                      setEditBudget(current.budgetCredits);
                      setEditDeadline(
                        goal.targetDate
                          ? new Date(goal.targetDate).toISOString().slice(0, 16)
                          : "",
                      );
                      setEditPriority(goal.priority as typeof editPriority);
                      setEditConstraints(goal.constraints.join("\n"));
                      setEditMetric(
                        data?.metrics.find((item) => item.goalId === goal.id)?.name ??
                          "",
                      );
                      setEditTarget(
                        data?.metrics.find((item) => item.goalId === goal.id)?.target ??
                          1,
                      );
                      setEditing((value) => !value);
                    }}
                  >
                    Modify objective
                  </button>
                </div>
                {editing ? (
                  <form
                    className="objective-modifier"
                    onSubmit={(event) => {
                      event.preventDefault();
                      modify.mutate(current.id);
                    }}
                  >
                    <label>
                      Budget
                      <input
                        min={1}
                        type="number"
                        value={editBudget}
                        onChange={(event) => setEditBudget(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Deadline
                      <input
                        type="datetime-local"
                        value={editDeadline}
                        onChange={(event) => setEditDeadline(event.target.value)}
                      />
                    </label>
                    <label>
                      Priority
                      <select
                        value={editPriority}
                        onChange={(event) =>
                          setEditPriority(event.target.value as typeof editPriority)
                        }
                      >
                        <option>LOW</option>
                        <option>NORMAL</option>
                        <option>HIGH</option>
                        <option>URGENT</option>
                      </select>
                    </label>
                    <label>
                      Metric
                      <input
                        value={editMetric}
                        onChange={(event) => setEditMetric(event.target.value)}
                      />
                    </label>
                    <label>
                      Target
                      <input
                        type="number"
                        value={editTarget}
                        onChange={(event) => setEditTarget(Number(event.target.value))}
                      />
                    </label>
                    <label className="wide-control">
                      Constraints
                      <textarea
                        value={editConstraints}
                        onChange={(event) => setEditConstraints(event.target.value)}
                      />
                    </label>
                    <button className="primary-action" type="submit">
                      Apply changes
                    </button>
                  </form>
                ) : null}
                <section className="objective-projects">
                  <h3>Strategy and projects</h3>
                  {projects.map((project, index) => (
                    <div key={project.id}>
                      <span className="project-sequence">{index + 1}</span>
                      <div>
                        <strong>{project.title}</strong>
                        <p>{project.outcome}</p>
                        <small>
                          {project.departmentId ?? "Automatic assignment"} ·{" "}
                          {project.budgetCredits} credits · AI estimate {project.estimatedAiCostCredits} credits
                        </small>
                        <small className="strategy-capability-map">
                          Capabilities: {project.capabilityReadiness.length
                            ? project.capabilityReadiness.map((item) => `${item.capabilityId} (${item.status === "AVAILABLE" ? "available" : "grant/request needed"})`).join(" · ")
                            : "No external capability required"}
                        </small>
                        {project.workflowSelection[0] ? (
                          <small>
                            Workflow:{" "}
                            {project.workflowSelection.find(
                              (item) =>
                                item.templateId === project.selectedWorkflowTemplateId,
                            )?.name ?? "New candidate required"}{" "}
                            · score{" "}
                            {Math.round(
                              (project.workflowSelection.find(
                                (item) =>
                                  item.templateId ===
                                  project.selectedWorkflowTemplateId,
                              )?.totalScore ?? 0) * 100,
                            )}
                            %
                          </small>
                        ) : null}
                      </div>
                      <span
                        className={`objective-state state-${project.status.toLowerCase()}`}
                      >
                        {project.status}
                      </span>
                    </div>
                  ))}
                </section>
                <ObjectiveExperimentsPanel apiClient={apiClient} objective={current} />
                <section className="objective-external-operations">
                  <header>
                    <div>
                      <h3>External operations and outcomes</h3>
                      <p>Verified provider evidence linked to this objective.</p>
                    </div>
                    <span>{externalAttributions.length} outcomes</span>
                  </header>
                  <div className="external-outcome-summary">
                    <div>
                      <strong>
                        {
                          externalExecutions.filter(
                            (item) => item.status === "VERIFIED",
                          ).length
                        }
                      </strong>
                      <span>Verified actions</span>
                    </div>
                    <div>
                      <strong>{externalMetrics.length}</strong>
                      <span>Metric observations</span>
                    </div>
                    <div>
                      <strong>
                        {
                          externalAttributions.filter(
                            (item) => item.confidence === "HIGH",
                          ).length
                        }
                      </strong>
                      <span>Direct outcomes</span>
                    </div>
                    <div>
                      <strong>
                        {
                          externalExecutions.filter(
                            (item) => item.status === "EXTERNAL_RESULT_UNCERTAIN",
                          ).length
                        }
                      </strong>
                      <span>Needs reconciliation</span>
                    </div>
                  </div>
                  {externalExecutions.slice(0, 6).map((item) => (
                    <div className="external-operation-row" key={item.id}>
                      <div>
                        <strong>{item.actionSummary}</strong>
                        <small>
                          {item.provider.toUpperCase()} · {item.capability}
                        </small>
                      </div>
                      <span
                        className={`objective-state state-${item.status.toLowerCase()}`}
                      >
                        {item.status.replaceAll("_", " ")}
                      </span>
                      <small>{item.resultSummary}</small>
                    </div>
                  ))}
                  {!externalExecutions.length && !externalMetrics.length ? (
                    <div className="experiment-empty">
                      <span>No external evidence linked yet.</span>
                    </div>
                  ) : null}
                </section>
                <section className="objective-bottom">
                  <div>
                    <h3>
                      <Gauge size={15} /> Success metrics
                    </h3>
                    {data?.metrics
                      .filter((item) => item.goalId === goal.id)
                      .map((item) => (
                        <p key={item.id}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.currentValue} / {item.target} {item.unit}
                          </span>
                        </p>
                      ))}
                    <h3>Capability requests</h3>
                    {data?.capabilityRequests
                      .filter((item) => item.objectiveExecutionId === current.id)
                      .map((item) => (
                        <p key={item.id}>
                          <strong>{item.requiredCapability}</strong>
                          <span>{item.status} · affected project only</span>
                        </p>
                      ))}
                    {!data?.capabilityRequests.some(
                      (item) => item.objectiveExecutionId === current.id,
                    ) ? (
                      <small>No capability requests.</small>
                    ) : null}
                  </div>
                  <div>
                    <h3>Timeline</h3>
                    {events.slice(0, 8).map((item) => (
                      <p key={item.id}>
                        <strong>{item.type.replaceAll("_", " ")}</strong>
                        <span>{item.summary}</span>
                        <small>{new Date(item.createdAt).toLocaleString()}</small>
                      </p>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-state">
                <Target size={24} />
                <strong>Select an objective</strong>
                <p>Inspect its strategy, progress, projects, evidence, and controls.</p>
              </div>
            )}
          </article>
        </section>
      ) : null}
    </section>
  );
};
