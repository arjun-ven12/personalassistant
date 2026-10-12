import { describe, it, expect } from "vitest";
import { EngineeringEvaluationBindingSchema } from "./engineering-evaluator.js";
import { athenaCoderEngineeringCases } from "../../engineering-dataset/benchmark.js";
import { fixtureScope } from "./fixtures.js";
const binding = () => ({ ...fixtureScope, runId: crypto.randomUUID(), adapterDigest: "d".repeat(64),
  candidateModelId: "synthetic-candidate", lunaModelId: "synthetic-luna", currentModelId: null,
  currentVersionId: null, currentArtifactDigest: null, evidence: "SYNTHETIC",
  cases: athenaCoderEngineeringCases.filter(v => v.id !== "phase28-4-portfolio-baseline").map(v => ({
    caseId: v.id, category: v.category === "ESCALATION" ? "SECURITY" : v.category,
    candidateDeliveryId: crypto.randomUUID(), lunaDeliveryId: crypto.randomUUID(), currentDeliveryId: null })) });
describe("canonical evaluation binding security (synthetic configuration)", () => {
  it("requires independent workload runs instead of replaying one delivery as a baseline", () => {
    const value = binding();
    expect(EngineeringEvaluationBindingSchema.parse(value).cases).toHaveLength(8);
    value.cases[0]!.lunaDeliveryId = value.cases[0]!.candidateDeliveryId;
    expect(() => EngineeringEvaluationBindingSchema.parse(value)).toThrow("independent");
  });
  it("rejects category spoofing and caller-supplied scores", () => {
    const value = binding();
    value.cases[0]!.category = "SECURITY";
    expect(() => EngineeringEvaluationBindingSchema.parse(value)).toThrow("category");
    expect(() => EngineeringEvaluationBindingSchema.parse({ ...binding(), score: 1 })).toThrow();
  });
  it("requires complete current baseline identity and delivery coverage", () => {
    const value = { ...binding(), currentVersionId: crypto.randomUUID() };
    expect(() => EngineeringEvaluationBindingSchema.parse(value)).toThrow("baseline");
  });
});
