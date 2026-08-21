import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BrainCircuit,
  ClipboardList,
  Compass,
  Gauge,
  GitBranch,
  Lightbulb,
  Map,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

const priorityClass = (priority: string) =>
  priority === "critical" || priority === "high"
    ? "danger-text"
    : priority === "medium"
      ? "warning-text"
      : "success-text";

export const AdvisorPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [goalTitle, setGoalTitle] = useState("Improve release readiness");
  const [goalRationale, setGoalRationale] = useState(
    "Use existing validation, repository intelligence, and recommendations to reduce release risk.",
  );
  const [scenario, setScenario] = useState(
    "Add OAuth without weakening owner identity",
  );
  const dashboard = useQuery({
    queryKey: ["advisor-dashboard"],
    queryFn: apiClient.getAdvisorDashboard,
    refetchInterval: 20_000,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
  };
  const createGoal = useMutation({
    mutationFn: apiClient.createEngineeringGoal,
    onSuccess: refresh,
  });
  const planGoal = useMutation({
    mutationFn: apiClient.planEngineeringGoal,
    onSuccess: refresh,
  });
  const simulate = useMutation({
    mutationFn: apiClient.runAdvisorSimulation,
    onSuccess: refresh,
  });

  const data = dashboard.data;
  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    createGoal.mutate({
      title: goalTitle,
      description: goalRationale,
      priority: "high",
      affectedRepositoryIds: [],
      rationale: goalRationale,
    });
  };
  const submitSimulation = (event: FormEvent) => {
    event.preventDefault();
    simulate.mutate({ scenario, repositoryIds: [] });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 10</p>
      <h1>Engineering Advisor</h1>
      <p>
        Strategic intelligence for long-term goals, repository health, risks, technical
        debt, simulations, release readiness, and recommendations. This layer is
        advisory only: it cannot approve, patch, execute, deploy, or trigger workflows
        on its own.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <Compass size={14} /> Active goals
          </span>
          <strong>{data?.metrics.activeGoals ?? 0}</strong>
          <small>{data?.goals.length ?? 0} tracked total</small>
        </article>
        <article className="status-card">
          <span>
            <Lightbulb size={14} /> Recommendations
          </span>
          <strong>{data?.metrics.openRecommendations ?? 0}</strong>
          <small>Open advisory items</small>
        </article>
        <article className="status-card">
          <span>
            <AlertTriangle size={14} /> Open risks
          </span>
          <strong>{data?.metrics.openRisks ?? 0}</strong>
          <small>Evidence-backed risk records</small>
        </article>
        <article className="status-card">
          <span>
            <Gauge size={14} /> Avg. health
          </span>
          <strong>{data?.metrics.averageRepositoryHealth ?? 0}%</strong>
          <small>Repository health score</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <BrainCircuit size={18} /> Strategic planning
        </h2>
        <form className="policy-form" onSubmit={submitGoal}>
          <label>
            Goal
            <input
              value={goalTitle}
              onChange={(event) => setGoalTitle(event.target.value)}
            />
          </label>
          <label>
            Rationale
            <textarea
              rows={3}
              value={goalRationale}
              onChange={(event) => setGoalRationale(event.target.value)}
            />
          </label>
          <button disabled={createGoal.isPending} type="submit">
            Create advisory goal
          </button>
        </form>
        {data?.goals.map((goal) => (
          <article className="panel" key={goal.id}>
            <p className="eyebrow">
              {goal.status} ·{" "}
              <span className={priorityClass(goal.priority)}>{goal.priority}</span>
            </p>
            <h3>{goal.title}</h3>
            <p>{goal.rationale}</p>
            <small>
              Effort {goal.estimatedEffort} · Completion {goal.completionPercent}%
            </small>
            <div className="button-row">
              <button
                disabled={planGoal.isPending}
                onClick={() => planGoal.mutate(goal.id)}
                type="button"
              >
                Generate strategic plan
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel-list">
        <h2>
          <GitBranch size={18} /> Scenario simulator
        </h2>
        <form className="policy-form" onSubmit={submitSimulation}>
          <label>
            Scenario
            <textarea
              rows={3}
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            />
          </label>
          <button disabled={simulate.isPending} type="submit">
            Simulate impact
          </button>
        </form>
        {simulate.data ? (
          <article className="panel">
            <p className="eyebrow">Simulation · advisory only</p>
            <h3>{simulate.data.scenario}</h3>
            <p>
              Risk {simulate.data.risk} · estimated files{" "}
              {simulate.data.affectedFilesEstimate} · confidence{" "}
              {Math.round(simulate.data.confidence * 100)}%
            </p>
            <small>{simulate.data.testingEffort}</small>
          </article>
        ) : null}
      </section>

      <section className="panel-list">
        <h2>
          <Lightbulb size={18} /> Recommendations
        </h2>
        {data?.recommendations.map((recommendation) => (
          <article className="panel" key={recommendation.id}>
            <p className="eyebrow">
              {recommendation.category} ·{" "}
              <span className={priorityClass(recommendation.priority)}>
                {recommendation.priority}
              </span>{" "}
              · confidence {Math.round(recommendation.confidence * 100)}%
            </p>
            <h3>{recommendation.title}</h3>
            <p>{recommendation.recommendation}</p>
            <small>
              Impact: {recommendation.estimatedImpact} · Effort:{" "}
              {recommendation.estimatedEffort}
            </small>
          </article>
        ))}
      </section>

      <section className="panel-list">
        <h2>
          <ShieldCheck size={18} /> Repository and architecture health
        </h2>
        <section className="status-grid">
          {data?.repositoryHealth.map((health) => (
            <article className="status-card" key={health.id}>
              <span>{health.repositoryName}</span>
              <strong>{health.overall}%</strong>
              <small>
                Architecture {health.architecture}% · Tests {health.tests}% · Security{" "}
                {health.security}%
              </small>
            </article>
          ))}
          {!data?.repositoryHealth.length ? (
            <article className="status-card">
              <span>No repositories</span>
              <strong>0%</strong>
              <small>Register and index a workspace first.</small>
            </article>
          ) : null}
        </section>
      </section>

      <section className="panel-list">
        <h2>
          <Map size={18} /> Roadmap and release readiness
        </h2>
        {data?.roadmaps.map((roadmap) => (
          <article className="panel" key={roadmap.id}>
            <p className="eyebrow">{roadmap.horizon}</p>
            <h3>{roadmap.title}</h3>
            <p>{roadmap.summary}</p>
            <small>{roadmap.items.map((item) => item.title).join(" · ")}</small>
          </article>
        ))}
        {data?.releaseAssessments.map((assessment) => (
          <article className="panel" key={assessment.id}>
            <p className="eyebrow">Release readiness</p>
            <h3>
              {assessment.releaseName}: {assessment.status}
            </h3>
            <p>{assessment.recommendation}</p>
            <small>Score {assessment.score}%</small>
          </article>
        ))}
      </section>

      <section className="panel-list">
        <h2>
          <ClipboardList size={18} /> Risks and technical debt
        </h2>
        {data?.risks.map((risk) => (
          <article className="panel" key={risk.id}>
            <p className="eyebrow">
              {risk.category} ·{" "}
              <span className={priorityClass(risk.severity)}>{risk.severity}</span>
            </p>
            <h3>{risk.title}</h3>
            <p>{risk.mitigation}</p>
          </article>
        ))}
        {data?.technicalDebt.map((debt) => (
          <article className="panel" key={debt.id}>
            <p className="eyebrow">
              debt ·{" "}
              <span className={priorityClass(debt.priority)}>{debt.priority}</span>
            </p>
            <h3>{debt.title}</h3>
            <p>{debt.suggestedSolution}</p>
          </article>
        ))}
        {!data?.risks.length && !data?.technicalDebt.length ? (
          <article className="panel">
            <p className="eyebrow">Inventory</p>
            <h3>No open risks or technical debt yet</h3>
            <p>Future analyses will add evidence-backed records here.</p>
          </article>
        ) : null}
      </section>
    </section>
  );
};
