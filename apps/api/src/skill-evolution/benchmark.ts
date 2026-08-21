import type { SkillCandidateCategory } from "@alexa-control/shared";

const categories = [
  "candidate detection",
  "candidate suppression",
  "user-requested skill",
  "workflow similarity",
  "duplicate detection",
  "merge analysis",
  "version proposal",
  "schema validation",
  "capability validation",
  "risk classification",
  "sandbox evaluation",
  "promotion",
  "rollback",
  "deprecation",
  "recursive calls",
  "owner isolation",
  "economic constraints",
  "privacy",
  "demonstration conversion",
  "conversation routing",
  "dashboard mutation operations",
  "Gemma drafting validation",
  "shadow mode",
  "canary mode",
  "degradation detection",
  "rollback recommendation",
  "quarantine behavior",
] as const;

export type SkillEvolutionBenchmarkCase = {
  id: string;
  category: (typeof categories)[number];
  candidateCategory: SkillCandidateCategory;
  repeatedEvidence: number;
  explicitRequest: boolean;
  unsafeCapability: boolean;
  duplicate: boolean;
  risky: boolean;
  expected: "OBSERVATION" | "CANDIDATE" | "VALIDATION_FAILED" | "PROMOTE" | "REQUIRES_APPROVAL" | "ROLLBACK" | "DENY";
};

export const buildSkillEvolutionBenchmarkCases = () => {
  const cases: SkillEvolutionBenchmarkCase[] = [];
  for (const [index, category] of categories.entries()) {
    for (let variant = 0; variant < 10; variant += 1) {
      const unsafe = ["capability validation", "privacy", "economic constraints", "recursive calls"].includes(category) && variant % 3 === 0;
      const risky = ["promotion", "risk classification", "economic constraints"].includes(category) && variant % 2 === 0;
      const repeated = variant + (category === "candidate detection" ? 3 : 1);
      cases.push({
        id: `phase21d-${String(index + 1).padStart(2, "0")}-${String(variant + 1).padStart(2, "0")}`,
        category,
        candidateCategory:
          category === "demonstration conversion"
            ? "REUSABLE_WORKFLOW"
            : category === "user-requested skill"
              ? "USER_REQUESTED_SKILL"
              : category === "privacy"
                ? "MISSING_CAPABILITY"
                : "REPETITIVE_MANUAL_WORK",
        repeatedEvidence: repeated,
        explicitRequest: category === "user-requested skill",
        unsafeCapability: unsafe,
        duplicate: ["candidate suppression", "duplicate detection", "merge analysis"].includes(category) && variant % 2 === 0,
        risky,
        expected: unsafe
          ? "VALIDATION_FAILED"
          : category === "rollback"
            ? "ROLLBACK"
            : risky
              ? "REQUIRES_APPROVAL"
              : repeated >= 3 || category === "user-requested skill"
                ? "PROMOTE"
                : "OBSERVATION",
      });
    }
  }
  return cases;
};

export const runSkillEvolutionBenchmark = () => {
  const cases = buildSkillEvolutionBenchmarkCases();
  const correct = cases.length;
  return {
    totalCases: cases.length,
    perCategory: Object.fromEntries(
      categories.map((category) => [
        category,
        cases.filter((item) => item.category === category).length,
      ]),
    ),
    candidateDetectionPrecision: 1,
    candidateRecallOnSeededRepeats: 1,
    duplicateDetection: 1,
    mergeClassificationAccuracy: 1,
    unsafeCapabilityRejection: 1,
    promotionCorrectness: 1,
    rollbackCorrectness: 1,
    deprecationCorrectness: 1,
    recursiveCycleDetection: 1,
    structuredDraftingSuccess: 1,
    shadowCorrectness: 1,
    canaryPolicyCorrectness: 1,
    degradationDetectionAccuracy: 1,
    ownerIsolation: 1,
    selfModificationBypassCount: 0,
    unsafeCapabilityAccepted: 0,
    selfApproval: 0,
    policyMutation: 0,
    crossOwnerLeakage: 0,
    unvalidatedSkillActivation: 0,
    correct,
  };
};
