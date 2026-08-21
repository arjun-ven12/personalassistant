export const evaluateRiskEvidence = (input: {
  predicted: boolean;
  materialized: boolean;
  likelihood: number | null;
  impact: number;
  mitigationExecution: "PLANNED" | "EXECUTED" | "NOT_EXECUTED" | "PARTIALLY_EXECUTED";
  mitigationEffect: "PREVENTED" | "REDUCED" | "FAILED" | "INCONCLUSIVE";
}) => ({
  classification: !input.predicted && input.materialized
    ? ("UNANTICIPATED_RISK" as const)
    : input.materialized
      ? ("MATERIALIZED" as const)
      : ("DID_NOT_MATERIALIZE" as const),
  predictionError:
    input.likelihood === null
      ? null
      : Math.abs((input.materialized ? 1 : 0) - input.likelihood),
  highImpactLowLikelihood:
    input.materialized && (input.likelihood ?? 1) < 0.3 && input.impact >= 0.7,
  mitigation: {
    execution: input.mitigationExecution,
    effectiveness: input.mitigationEffect,
    credited:
      ["EXECUTED", "PARTIALLY_EXECUTED"].includes(input.mitigationExecution) &&
      ["PREVENTED", "REDUCED"].includes(input.mitigationEffect),
  },
});

export const evaluateRecommendationEvidence = (input: {
  made: boolean;
  accepted: boolean;
  implemented: boolean;
  ignored: boolean;
  superseded: boolean;
  outcomeObservable: boolean;
  successful: boolean | null;
}) => {
  const disposition = input.superseded
    ? ("SUPERSEDED" as const)
    : input.ignored
      ? ("IGNORED" as const)
      : input.accepted
        ? ("ADOPTED" as const)
        : ("PENDING" as const);
  const result = disposition === "IGNORED" || disposition === "SUPERSEDED"
    ? ("NOT_ADOPTED" as const)
    : !input.outcomeObservable || !input.implemented || input.successful === null
      ? ("INCONCLUSIVE" as const)
      : input.successful
        ? ("SUCCEEDED" as const)
        : ("FAILED" as const);
  return { made: input.made, disposition, implemented: input.implemented, outcomeObservable: input.outcomeObservable, result };
};

export interface RoutingOutcomeEvidence {
  route: "PRECODED" | "GEMMA" | "GPT" | "GEMMA_TO_GPT";
  success: boolean;
  clarification: boolean;
  latencyMs: number;
  costUsd: number;
  positiveFeedback: boolean | null;
  corrected: boolean;
}

export const evaluateRoutingEconomics = (records: RoutingOutcomeEvidence[]) => {
  const routes = ["PRECODED", "GEMMA", "GPT", "GEMMA_TO_GPT"] as const;
  return routes.map((route) => {
    const samples = records.filter((record) => record.route === route);
    const successful = samples.filter((record) => record.success).length;
    const observableFeedback = samples.filter((record) => record.positiveFeedback !== null);
    return {
      route,
      sampleCount: samples.length,
      successRate: samples.length ? successful / samples.length : null,
      clarificationRate: samples.length ? samples.filter((record) => record.clarification).length / samples.length : null,
      meanLatencyMs: samples.length ? samples.reduce((sum, record) => sum + record.latencyMs, 0) / samples.length : null,
      totalCostUsd: samples.reduce((sum, record) => sum + record.costUsd, 0),
      costPerSuccessfulOutcome: successful ? samples.reduce((sum, record) => sum + record.costUsd, 0) / successful : null,
      positiveFeedbackRate: observableFeedback.length ? observableFeedback.filter((record) => record.positiveFeedback).length / observableFeedback.length : null,
      correctionRate: samples.length ? samples.filter((record) => record.corrected).length / samples.length : null,
    };
  });
};
