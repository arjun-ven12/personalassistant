import { z } from "zod";
import { EngineeringBenchmarkRunSchema } from "./engineering-benchmark.js";

const time = z.iso.datetime().nullable();
export const SelfImprovementTelemetrySchema = z.object({
  objectiveId: z.string().uuid(), deliveryId: z.string().uuid(),
  benchmark: EngineeringBenchmarkRunSchema,
  milestones: z.object({ requestReceivedAt: time, objectiveCreatedAt: time, firstTaskAt: time,
    firstModelCallAt: time, firstPatchAt: time, validatedAt: time, candidateAt: time }).strict(),
  agents: z.array(z.string().min(1).max(160)).max(100),
  models: z.array(z.object({ providerId: z.string().max(80), modelId: z.string().max(160),
    calls: z.number().int().nonnegative() }).strict()).max(100),
  calls: z.object({ manager: z.number().int().nonnegative(), worker: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(), repair: z.number().int().nonnegative() }).strict(),
  toolsByCapability: z.record(z.string().max(120), z.number().int().nonnegative()),
  knownCostUsd: z.string().regex(/^\d+\.\d{8}$/), unknownCostCount: z.number().int().nonnegative(),
  attributionComplete: z.boolean(), ownerInterventions: z.number().int().nonnegative(),
  evidenceWarnings: z.array(z.string().max(300)).max(10),
}).strict();
export type SelfImprovementTelemetry = z.infer<typeof SelfImprovementTelemetrySchema>;
