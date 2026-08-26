import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beaker, CirclePause, Play, Plus, Square } from "lucide-react";
import { useState } from "react";
import type { ObjectiveExecution } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";
import { ContextualAskAlexa } from "./BusinessOSComponents.js";

const mutationKey = () => `experiment-${crypto.randomUUID()}`;
export const ObjectiveExperimentsPanel = ({
  apiClient,
  objective,
}: {
  apiClient: ApiClient;
  objective: ObjectiveExecution;
}) => {
  const client = useQueryClient();
  const queryKey = ["objective-experiments", objective.id];
  const query = useQuery({
    queryKey,
    queryFn: () => apiClient.getObjectiveExperiments(objective.id),
    refetchInterval: 10_000,
  });
  const explorationCap = Math.floor(objective.budgetCredits * 0.2);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [metric, setMetric] = useState("Conversion rate");
  const [budget, setBudget] = useState(Math.max(2, explorationCap));
  const refresh = () => client.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: () => {
      const half = Math.max(1, Math.floor(budget / 2));
      return apiClient.createExperiment(objective.id, {
        title,
        hypothesis,
        expectedDirection: "INCREASE",
        trigger: "OWNER_REQUEST",
        projectId: null,
        primaryMetric: {
          id: "primary_conversion",
          name: metric,
          direction: "HIGHER_IS_BETTER",
          minimumMeaningfulImprovement: 0.02,
          aggregation: "RATE",
        },
        guardrails: [],
        explorationBudget: budget,
        explorationLevel: "BALANCED",
        minimumSampleSize: 20,
        maxDurationHours: 168,
        context: { objectiveId: objective.id },
        variants: [
          {
            name: "Current strategy",
            role: "CONTROL",
            configuration: { messageStyle: "CONCISE" },
            budgetCredits: half,
            predictedSuccess: 0.5,
            predictedCost: half,
            predictedMetricImpact: 0,
            predictedDurationMs: 60_000,
            strategyVersion: objective.strategyVersion,
          },
          {
            name: "Problem-focused strategy",
            role: "VARIANT",
            configuration: { messageStyle: "PROBLEM_FOCUSED" },
            budgetCredits: budget - half,
            predictedSuccess: 0.6,
            predictedCost: budget - half,
            predictedMetricImpact: 0.05,
            predictedDurationMs: 60_000,
            strategyVersion: objective.strategyVersion,
          },
        ],
      });
    },
    onSuccess: () => {
      setCreating(false);
      setTitle("");
      setHypothesis("");
      void refresh();
    },
  });
  const control = useMutation({
    mutationFn: (input: { id: string; action: "activate" | "pause" | "stop" }) =>
      input.action === "activate"
        ? apiClient.activateExperiment(input.id, mutationKey())
        : input.action === "pause"
          ? apiClient.pauseExperiment(input.id, mutationKey())
          : apiClient.stopExperiment(input.id, mutationKey()),
    onSuccess: refresh,
  });
  const data = query.data;
  return (
    <section className="objective-experiments">
      <header>
        <div>
          <h3>
            <Beaker size={15} /> Experiments
          </h3>
          <p>
            Compare bounded strategies using verified outcomes and a conserved
            exploration budget.
          </p>
        </div>
        <button
          disabled={explorationCap < 2}
          title={
            explorationCap < 2
              ? "This objective needs at least 10 credits for a two-variant experiment."
              : undefined
          }
          onClick={() => setCreating((value) => !value)}
        >
          <Plus size={14} /> New experiment
        </button>
      </header>
      {creating ? (
        <form
          className="experiment-composer"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Name
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="wide-control">
            Testable hypothesis
            <textarea
              required
              minLength={20}
              value={hypothesis}
              onChange={(event) => setHypothesis(event.target.value)}
              placeholder="Problem-focused outreach will improve qualified reply rate over the current approach."
            />
          </label>
          <label>
            Primary metric
            <input
              required
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
            />
          </label>
          <label>
            Exploration budget
            <input
              max={Math.floor(objective.budgetCredits * 0.2)}
              min={2}
              type="number"
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </label>
          <button className="primary-action" disabled={create.isPending} type="submit">
            Create bounded test
          </button>
        </form>
      ) : null}
      {data?.experiments.length ? (
        <div className="experiment-list">
          {data.experiments.map((experiment) => {
            const variants = data.variants.filter(
              (item) => item.experimentId === experiment.id,
            );
            const result = data.results.find(
              (item) => item.experimentId === experiment.id && item.variantId === null,
            );
            const leader = variants.find((item) => item.status === "LEADING") ?? [...variants].sort((left, right) => right.allocationPercent - left.allocationPercent)[0];
            return (
              <article key={experiment.id}>
                <header>
                  <div>
                    <span
                      className={`objective-state state-${experiment.status.toLowerCase()}`}
                    >
                      {experiment.status}
                    </span>
                    <strong>{experiment.title}</strong>
                    <small>{experiment.hypothesis}</small>
                  </div>
                  <div className="experiment-actions">
                    <ContextualAskAlexa kind="EXPERIMENT" id={experiment.id} label={experiment.title} />
                    {["READY", "PAUSED"].includes(experiment.status) ? (
                      <button
                        aria-label="Run experiment"
                        onClick={() =>
                          control.mutate({ id: experiment.id, action: "activate" })
                        }
                      >
                        <Play size={13} />
                      </button>
                    ) : null}
                    {experiment.status === "RUNNING" ? (
                      <button
                        aria-label="Pause experiment"
                        onClick={() =>
                          control.mutate({ id: experiment.id, action: "pause" })
                        }
                      >
                        <CirclePause size={13} />
                      </button>
                    ) : null}
                    {["RUNNING", "PAUSED"].includes(experiment.status) ? (
                      <button
                        aria-label="Stop experiment"
                        onClick={() =>
                          control.mutate({ id: experiment.id, action: "stop" })
                        }
                      >
                        <Square size={12} />
                      </button>
                    ) : null}
                  </div>
                </header>
                <div className="experiment-meta">
                  <span>{experiment.primaryMetric.name}</span>
                  <span>
                    {experiment.spentCredits} / {experiment.explorationBudget} cr
                  </span>
                  <span>Minimum sample {experiment.minimumSampleSize}</span>
                  <span>
                    {result
                      ? `${result.verdict} · ${Math.round(result.confidence * 100)}% confidence`
                      : "Awaiting evidence"}
                  </span>
                </div>
                <div className="variant-comparison">
                  {variants.map((variant) => (
                    <div key={variant.id}>
                      <div>
                        <strong>{variant.name}</strong>
                        <small>
                          {variant.role} · {variant.status}
                        </small>
                      </div>
                      <span>{variant.sampleSize} samples</span>
                      <span>
                        {variant.actualMetric === null
                          ? "No result"
                          : variant.actualMetric.toFixed(3)}
                      </span>
                      <span>{variant.actualCost} cr</span>
                      <div className="allocation-track">
                        <i style={{ width: `${variant.allocationPercent}%` }} />
                      </div>
                      <b>{variant.allocationPercent}%</b>
                    </div>
                  ))}
                </div>
                {leader ? <details className="structured-explanation"><summary>Why is {leader.name} leading?</summary><dl><div><dt>Primary metric</dt><dd>{leader.actualMetric === null ? "Awaiting evidence" : leader.actualMetric.toFixed(3)}</dd></div><div><dt>Samples</dt><dd>{leader.sampleSize}</dd></div><div><dt>Spend</dt><dd>{leader.actualCost} credits</dd></div><div><dt>Allocation</dt><dd>{leader.allocationPercent}%</dd></div><div><dt>Confidence</dt><dd>{result ? `${Math.round(result.confidence * 100)}%` : "Not established"}</dd></div><div><dt>Guardrails</dt><dd>{result?.verdict === "STOPPED_BY_GUARDRAIL" ? "BREACHED" : "PASS / PENDING"}</dd></div></dl><p>{result?.explanation ?? "Allocation remains bounded while verified evidence accumulates."}</p></details> : null}
                {result ? (
                  <p
                    className={
                      result.possibleProxyOptimization
                        ? "experiment-warning"
                        : "experiment-result"
                    }
                  >
                    {result.explanation}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="experiment-empty">
          <Beaker size={18} />
          <span>No experiments for this objective.</span>
        </div>
      )}
    </section>
  );
};
