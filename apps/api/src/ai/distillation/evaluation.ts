import { DistillationEvaluationSchema, DistillationPromotionPolicySchema, type DistillationEvaluation, type DistillationPromotionPolicy } from "@alexa-control/shared";

export const engineeringEvaluationCategories = ["UI", "CRUD", "BUGFIX", "TESTS", "REFACTOR", "MULTI_FILE", "CONVENTIONS", "SECURITY"] as const;
export const defaultPromotionPolicy = { minimumCases: 8, minimumPassRate: 0.9, maximumRegressions: 0, maximumDurationRatio: 1.5 } as const;
const passed = (v: DistillationEvaluation["cases"][number]) => v.completed && v.validationPass && v.reviewPass && v.securityPass && (v.category === "SECURITY" || !v.escalated);
export function decidePromotion(raw: DistillationEvaluation, rawPolicy: DistillationPromotionPolicy) {
  const evaluation = DistillationEvaluationSchema.parse(raw), policy = DistillationPromotionPolicySchema.parse(rawPolicy);
  const reasons: string[] = [];
  if (evaluation.evidence !== "REAL") reasons.push("synthetic-evidence");
  if (evaluation.cases.length < policy.minimumCases || engineeringEvaluationCategories.some(category => !evaluation.cases.some(v => v.category === category))) reasons.push("coverage-insufficient");
  if (new Set(evaluation.cases.map(v => v.caseId)).size !== evaluation.cases.length || new Set(evaluation.cases.map(v => v.taskId)).size !== evaluation.cases.length) reasons.push("duplicate-evaluation");
  if (evaluation.cases.some(v => !v.securityPass) || evaluation.cases.filter(passed).length / evaluation.cases.length < policy.minimumPassRate) reasons.push("quality-or-safety-failed");
  if (!evaluation.lunaBaseline) reasons.push("luna-baseline-missing");
  for (const baseline of [evaluation.lunaBaseline, evaluation.currentBaseline]) {
    if (!baseline) continue;
    if (new Set(baseline.map(v => v.caseId)).size !== baseline.length || new Set(baseline.map(v => v.taskId)).size !== baseline.length || baseline.some(v => evaluation.cases.some(candidate => candidate.taskId === v.taskId)) || baseline.length !== evaluation.cases.length) { reasons.push("baseline-mismatch"); continue; }
    for (const candidate of evaluation.cases) {
      const reference = baseline.find(v => v.caseId === candidate.caseId && v.category === candidate.category);
      if (!reference) { reasons.push("baseline-mismatch"); continue; }
      if (passed(reference) && !passed(candidate)) reasons.push("quality-regression");
    }
    const before = baseline.reduce((sum, v) => sum + v.durationMs, 0), after = evaluation.cases.reduce((sum, v) => sum + v.durationMs, 0);
    if (before <= 0 || after > before * policy.maximumDurationRatio) reasons.push("latency-regression-or-unknown");
  }
  return { promotion: reasons.length ? "BLOCKED" as const : "ELIGIBLE" as const, promotionReasons: [...new Set(reasons)] };
}
export function evaluationMetrics(cases: DistillationEvaluation["cases"]) {
  const average = (values: (number | null)[]) => {
    const measured = values.filter((v): v is number => v !== null);
    return { measuredSamples: measured.length, unknownSamples: values.length - measured.length, average: measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null };
  };
  return { samples: cases.length, passRate: cases.length ? cases.filter(passed).length / cases.length : null,
    completionRate: cases.length ? cases.filter(v => v.completed).length / cases.length : null,
    validationPassRate: cases.length ? cases.filter(v => v.validationPass).length / cases.length : null,
    reviewPassRate: cases.length ? cases.filter(v => v.reviewPass).length / cases.length : null,
    escalationRate: cases.length ? cases.filter(v => v.escalated).length / cases.length : null,
    retries: cases.reduce((sum, v) => sum + v.retries, 0),
    duration: average(cases.map(v => v.durationMs)), modelDuration: average(cases.map(v => v.modelDurationMs)),
    paidCost: average(cases.map(v => v.paidCostUsd)), computeCost: average(cases.map(v => v.computeCostUsd)),
    inputTokens: average(cases.map(v => v.inputTokens)), outputTokens: average(cases.map(v => v.outputTokens)),
    ownerInterventions: average(cases.map(v => v.ownerInterventions)) };
}
