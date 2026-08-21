import { z } from "zod";

export const ActiveContextSourceSchema = z.enum([
  "REVIEWED_ADAPTER",
  "APPLICATION_INTELLIGENCE",
  "REVIEWED_NATIVE_PROVIDER",
  "ACCESSIBILITY_METADATA",
  "APPLICATION_IDENTITY",
]);

export const ActiveContextObservationSchema = z
  .object({
    application: z
      .object({
        name: z.string().trim().min(1).max(160),
        bundleIdentifier: z.string().trim().min(3).max(255),
        processIdentifier: z.number().int().positive().nullable().default(null),
      })
      .strict(),
    window: z
      .object({
        title: z.string().trim().max(240).nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
    document: z
      .object({
        title: z.string().trim().max(240).nullable().default(null),
        type: z.string().trim().max(80).nullable().default(null),
        uri: z.string().trim().max(2_000).nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
    selection: z
      .object({
        text: z.string().trim().max(2_000).nullable().default(null),
        semanticType: z.string().trim().max(80).nullable().default(null),
        secure: z.boolean().default(false),
      })
      .strict()
      .nullable()
      .default(null),
    accessibilityTrusted: z.boolean(),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const ActiveContextSchema = z
  .object({
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid(),
    status: z.enum(["CURRENT", "DEGRADED", "DENIED", "STALE"]),
    application: z
      .object({
        id: z.string().min(1).max(160).nullable(),
        name: z.string().min(1).max(160),
        bundleIdentifier: z.string().min(3).max(255),
      })
      .strict(),
    window: z
      .object({ title: z.string().max(240).nullable() })
      .strict()
      .nullable(),
    document: z
      .object({
        title: z.string().max(240).nullable(),
        type: z.string().max(80).nullable(),
        uri: z.string().max(2_000).nullable(),
      })
      .strict()
      .nullable(),
    selection: z
      .object({
        text: z.string().max(2_000).nullable(),
        semanticType: z.string().max(80).nullable(),
        characterCount: z.number().int().nonnegative().max(2_000),
      })
      .strict()
      .nullable(),
    semanticObjects: z
      .array(
        z
          .object({
            id: z.string().min(1).max(180),
            label: z.string().min(1).max(240),
            type: z.string().min(1).max(80),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(20),
    capabilityReferences: z.array(z.string().min(1).max(160)).max(30),
    sources: z.array(ActiveContextSourceSchema).min(1).max(5),
    confidence: z.number().min(0).max(1),
    permission: z.enum(["ALLOWED", "IDENTITY_ONLY", "DENIED"]),
    secureContentSuppressed: z.boolean(),
    contextSummary: z.string().min(1).max(300),
    capturedAt: z.iso.datetime(),
    lastConfirmedAt: z.iso.datetime(),
    staleAt: z.iso.datetime(),
    authority: z.literal("CONTEXT_ONLY"),
  })
  .strict();

export const ActiveContextResponseSchema = z
  .object({
    context: ActiveContextSchema.nullable(),
    refreshed: z.boolean(),
  })
  .strict();

export type ActiveContextObservation = z.infer<typeof ActiveContextObservationSchema>;
export type ActiveContext = z.infer<typeof ActiveContextSchema>;
export type ActiveContextResponse = z.infer<typeof ActiveContextResponseSchema>;
