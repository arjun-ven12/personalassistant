import { z } from "zod";

export const ReflectionSynthesisSchema = z
  .object({
    outcome: z.enum(["MET_EXPECTATION", "PARTIALLY_MET", "MISSED", "INCONCLUSIVE", "NOT_ADOPTED"]),
    summary: z.string().min(1).max(1_500),
    evidenceIds: z.array(z.string().min(1).max(240)).max(20),
    causalClaims: z
      .array(
        z.object({
          claim: z.string().min(1).max(500),
          evidenceIds: z.array(z.string().min(1).max(240)).min(1).max(10),
        }).strict(),
      )
      .max(10),
    lessons: z.array(z.string().min(1).max(500)).max(10),
    inconclusive: z.boolean(),
  })
  .strict();

export const ReflectionSynthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    outcome: { type: "string", enum: ["MET_EXPECTATION", "PARTIALLY_MET", "MISSED", "INCONCLUSIVE", "NOT_ADOPTED"] },
    summary: { type: "string" },
    evidenceIds: { type: "array", items: { type: "string" } },
    causalClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { claim: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" }, minItems: 1 } },
        required: ["claim", "evidenceIds"],
      },
    },
    lessons: { type: "array", items: { type: "string" } },
    inconclusive: { type: "boolean" },
  },
  required: ["outcome", "summary", "evidenceIds", "causalClaims", "lessons", "inconclusive"],
} as const;

export interface LiveReflectionInput {
  question: string;
  expectedOutcome: "MET_EXPECTATION" | "PARTIALLY_MET" | "MISSED" | "INCONCLUSIVE" | "NOT_ADOPTED";
  evidence: Array<{ id: string; fact: string }>;
}

export class ReflectionContextComposer {
  compose(input: LiveReflectionInput) {
    return {
      prompt: [
        `Reflection question: ${input.question}`,
        `Durable evidence: ${JSON.stringify(input.evidence)}`,
        "Classify the outcome and summarize only what this evidence supports.",
        "Every causal claim must cite one or more supplied evidence IDs. If causality or outcome is not observable, return INCONCLUSIVE.",
        "Do not execute, mutate records, reveal hidden reasoning, or invent evidence.",
      ].join("\n"),
      evidenceIds: new Set(input.evidence.map((item) => item.id)),
    };
  }
}
