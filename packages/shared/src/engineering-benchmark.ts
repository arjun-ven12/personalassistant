import { z } from "zod";

import { EngineeringComplexitySchema } from "./engineering-delivery.js";

/** Comparison evidence, not an execution or model-routing instruction. */
export const EngineeringBenchmarkRunSchema = z
  .object({
    schemaVersion: z.literal("1"),
    taskId: z.string().trim().min(1).max(200),
    taskCategory: z.string().trim().min(1).max(120),
    complexity: EngineeringComplexitySchema,
    system: z.enum(["ATHENA", "CODEX", "MANUAL_OTHER"]),
    route: z.enum(["ENGINEERING_FAST_PATH", "ENGINEERING_FULL_PATH"]).nullable(),
    startedAt: z.iso.datetime(),
    firstActionAt: z.iso.datetime().nullable(),
    firstPatchAt: z.iso.datetime().nullable(),
    previewAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    modelCalls: z.number().int().nonnegative().nullable(),
    toolCalls: z.number().int().nonnegative().nullable(),
    toolRoundTrips: z.number().int().nonnegative().nullable(),
    managerCalls: z.number().int().nonnegative().nullable(),
    validationRuns: z.number().int().nonnegative().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    apiCostUsd: z.number().nonnegative().nullable(),
    retries: z.number().int().nonnegative().nullable(),
    ownerInterventions: z.number().int().nonnegative().nullable(),
    validationPass: z.boolean().nullable(),
    reviewPass: z.boolean().nullable(),
    finalSuccess: z.boolean().nullable(),
    source: z.enum(["RUNTIME", "OWNER_ENTERED"]),
  })
  .strict()
  .superRefine((run, context) => {
    const start = Date.parse(run.startedAt);
    for (const field of ["firstActionAt", "firstPatchAt", "previewAt", "completedAt"] as const) {
      const value = run[field];
      if (value !== null && Date.parse(value) < start)
        context.addIssue({ code: "custom", path: [field], message: "Milestone precedes start." });
    }
    if (run.completedAt !== null) {
      const completed = Date.parse(run.completedAt);
      for (const field of ["firstActionAt", "firstPatchAt", "previewAt"] as const) {
        const value = run[field];
        if (value !== null && Date.parse(value) > completed)
          context.addIssue({ code: "custom", path: [field], message: "Milestone follows completion." });
      }
      if (run.finalSuccess === null)
        context.addIssue({ code: "custom", path: ["finalSuccess"], message: "Completed runs require an outcome." });
    }
    if (run.system !== "ATHENA" && run.route !== null)
      context.addIssue({ code: "custom", path: ["route"], message: "Athena routing is only defined for Athena runs." });
  });

export type EngineeringBenchmarkRun = z.infer<typeof EngineeringBenchmarkRunSchema>;

export const benchmarkDurations = (run: EngineeringBenchmarkRun) => {
  const start = Date.parse(run.startedAt);
  const elapsed = (at: string | null) => at === null ? null : Date.parse(at) - start;
  return {
    firstActionMs: elapsed(run.firstActionAt),
    firstPatchMs: elapsed(run.firstPatchAt),
    previewMs: elapsed(run.previewAt),
    completionMs: elapsed(run.completedAt),
  };
};
