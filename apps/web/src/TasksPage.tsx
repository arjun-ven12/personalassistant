import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CheckSquare,
  GitMerge,
  Goal,
  Play,
  Radar,
  Repeat,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

const statusClass = (status: string) =>
  status === "failed" || status === "blocked"
    ? "danger-text"
    : status === "waiting_approval" || status === "scheduled"
      ? "warning-text"
      : "success-text";

export const TasksPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("Morning engineering briefing");
  const [goal, setGoal] = useState(
    "Summarize open workflows, active risks, upcoming approvals, and repository health.",
  );
  const [description, setDescription] = useState(
    "A proactive read-only briefing that prepares the owner for the day.",
  );
  const [goalTitle, setGoalTitle] = useState("Keep releases boring");
  const taskCenter = useQuery({
    queryKey: ["task-center"],
    queryFn: apiClient.getTaskCenter,
    refetchInterval: 20_000,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["task-center"] });
    await queryClient.invalidateQueries({ queryKey: ["command-center"] });
  };
  const createTask = useMutation({
    mutationFn: apiClient.createTask,
    onSuccess: refresh,
  });
  const triggerTask = useMutation({
    mutationFn: apiClient.triggerTask,
    onSuccess: refresh,
  });
  const createGoal = useMutation({
    mutationFn: apiClient.createTaskGoal,
    onSuccess: refresh,
  });
  const createRoutine = useMutation({
    mutationFn: apiClient.createTaskRoutine,
    onSuccess: refresh,
  });
  const createChecklist = useMutation({
    mutationFn: apiClient.createTaskChecklist,
    onSuccess: refresh,
  });
  const data = taskCenter.data;
  const waitingApproval =
    data?.tasks.filter((task) => task.status === "waiting_approval").length ?? 0;
  const scheduled =
    data?.tasks.filter((task) => task.status === "scheduled").length ?? 0;

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    createTask.mutate({
      name,
      description,
      goal,
      type: "recurring",
      priority: "normal",
      category: "monitoring",
      scheduleKind: "daily",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      triggerType: "time",
      condition: "Only produce an advisory summary; do not execute actions.",
      deadlineAt: null,
      startAt: null,
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 12</p>
      <h1>Task Center</h1>
      <p>
        Persistent scheduled tasks, reminders, monitors, routines, checklists, and
        goals. The assistant can plan, watch, remind, and queue governed work over time,
        but autonomous execution never bypasses policy, approval, private network,
        trusted device, or audit controls.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <CalendarClock size={14} /> Tasks
          </span>
          <strong>{data?.tasks.length ?? 0}</strong>
          <small>{scheduled} scheduled</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldCheck size={14} /> Waiting approval
          </span>
          <strong>{waitingApproval}</strong>
          <small>High-risk work remains gated</small>
        </article>
        <article className="status-card">
          <span>
            <Radar size={14} /> Monitors
          </span>
          <strong>{data?.monitors.length ?? 0}</strong>
          <small>Lightweight background checks</small>
        </article>
        <article className="status-card">
          <span>
            <Sparkles size={14} /> Governance bypass
          </span>
          <strong>{data?.autonomousExecutionBypassesGovernance ? "Yes" : "No"}</strong>
          <small>Must remain false</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <TimerReset size={18} /> Create scheduled task
        </h2>
        <form className="policy-form" onSubmit={submitTask}>
          <div className="command-row">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <label>
            Goal
            <textarea
              rows={3}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <button disabled={createTask.isPending} type="submit">
            Create governed task
          </button>
        </form>
      </section>

      <section className="panel-list">
        <h2>
          <CalendarClock size={18} /> Upcoming and active tasks
        </h2>
        {data?.tasks.slice(0, 8).map((task) => (
          <article className="panel" key={task.id}>
            <p className="eyebrow">
              {task.type} ·{" "}
              <span className={statusClass(task.status)}>{task.status}</span> ·{" "}
              {task.priority}
            </p>
            <h3>{task.name}</h3>
            <p>{task.goal}</p>
            <small>
              Schedule: {task.schedule.kind} · Approval: {task.approvalPolicy} ·
              Providers: {task.executionPolicy.allowedProviders.join(" · ")}
            </small>
            <div className="button-row">
              <button
                disabled={triggerTask.isPending}
                onClick={() =>
                  triggerTask.mutate({
                    taskId: task.id,
                    reason: "Owner requested a manual task trigger.",
                  })
                }
                type="button"
              >
                <Play size={13} /> Queue governed run
              </button>
            </div>
          </article>
        ))}
        {!data?.tasks.length ? (
          <article className="panel">
            <p className="eyebrow">No tasks yet</p>
            <h3>Create a scheduled task to start proactive coordination.</h3>
            <p>
              Task runs create governed command records instead of direct execution.
            </p>
          </article>
        ) : null}
      </section>

      <section className="panel-list">
        <h2>
          <Bell size={18} /> Monitors, notifications, and runs
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Runs</span>
            <strong>{data?.runs.length ?? 0}</strong>
            <small>{data?.runs[0]?.outcome ?? "No runs queued yet"}</small>
          </article>
          <article className="status-card">
            <span>Notifications</span>
            <strong>{data?.notifications.length ?? 0}</strong>
            <small>{data?.notifications[0]?.message ?? "No reminders yet"}</small>
          </article>
          <article className="status-card">
            <span>Triggers</span>
            <strong>{data?.triggers.length ?? 0}</strong>
            <small>{data?.triggers[0]?.type ?? "No triggers registered yet"}</small>
          </article>
          <article className="status-card">
            <span>Conditions</span>
            <strong>{data?.conditions.length ?? 0}</strong>
            <small>
              {data?.conditions[0]?.field ?? "No conditions registered yet"}
            </small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Goal size={18} /> Goals, routines, and checklists
        </h2>
        <div className="button-row">
          <input
            aria-label="Goal title"
            value={goalTitle}
            onChange={(event) => setGoalTitle(event.target.value)}
          />
          <button
            disabled={createGoal.isPending}
            onClick={() =>
              createGoal.mutate({
                title: goalTitle,
                description:
                  "Track long-running work and generate supporting tasks manually.",
                priority: "high",
              })
            }
            type="button"
          >
            <Goal size={13} /> Create goal
          </button>
          <button
            disabled={createRoutine.isPending}
            onClick={() =>
              createRoutine.mutate({
                name: "End-of-day wrap-up",
                description: "Review open tasks, workflows, approvals, and reminders.",
                mode: "end_of_day",
                taskIds: data?.tasks.slice(0, 3).map((task) => task.id) ?? [],
              })
            }
            type="button"
          >
            <Repeat size={13} /> Create routine
          </button>
          <button
            disabled={createChecklist.isPending}
            onClick={() =>
              createChecklist.mutate({
                name: "Release checklist",
                category: "release",
                reusable: true,
                items: [
                  "Review approvals",
                  "Check validation status",
                  "Confirm rollback plan",
                ],
              })
            }
            type="button"
          >
            <CheckSquare size={13} /> Create checklist
          </button>
        </div>
        <section className="status-grid">
          <article className="status-card">
            <span>Goals</span>
            <strong>{data?.goals.length ?? 0}</strong>
            <small>{data?.goals[0]?.title ?? "No goals yet"}</small>
          </article>
          <article className="status-card">
            <span>Routines</span>
            <strong>{data?.routines.length ?? 0}</strong>
            <small>{data?.routines[0]?.name ?? "No routines yet"}</small>
          </article>
          <article className="status-card">
            <span>Checklists</span>
            <strong>{data?.checklists.length ?? 0}</strong>
            <small>{data?.checklists[0]?.name ?? "No checklists yet"}</small>
          </article>
          <article className="status-card">
            <span>
              <GitMerge size={14} /> Dependencies
            </span>
            <strong>{data?.dependencies.length ?? 0}</strong>
            <small>Dependency graph records</small>
          </article>
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Sparkles size={18} /> Proactive suggestions
        </h2>
        {data?.suggestions.map((suggestion) => (
          <article className="panel" key={suggestion.id}>
            <p className="eyebrow">
              confidence {Math.round(suggestion.confidence * 100)}%
            </p>
            <h3>{suggestion.title}</h3>
            <p>{suggestion.rationale}</p>
            <small>{suggestion.suggestedTask}</small>
          </article>
        ))}
      </section>
    </section>
  );
};
