import { z } from "zod";

export const ServiceStatusSchema = z.enum([
  "online",
  "offline",
  "degraded",
  "not_configured",
  "not_connected",
  "not_started",
  "unavailable",
  "disabled",
]);

export const ApiErrorSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const ApiResponseSchema = z.discriminatedUnion("success", [
  z
    .object({
      success: z.literal(true),
      data: z.unknown().optional(),
      error: z.never().optional(),
      requestId: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      data: z.never().optional(),
      error: ApiErrorSchema,
      requestId: z.string().trim().min(1).optional(),
    })
    .strict(),
]);

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("alexa-api"),
    version: z.literal("0.1.0"),
    timestamp: z.iso.datetime(),
    uptimeSeconds: z.number().nonnegative(),
  })
  .strict();

const statusObject = <TStatus extends z.ZodType>(status: TStatus) =>
  z.object({ status }).strict();

export const SystemStatusResponseSchema = z
  .object({
    api: statusObject(z.literal("online")),
    database: statusObject(z.literal("not_configured")),
    redis: statusObject(z.literal("not_configured")),
    aiProvider: statusObject(z.literal("not_configured")),
    macAgent: statusObject(z.enum(["online", "offline", "not_connected"])),
    privateNetwork: statusObject(z.literal("not_configured")),
    gestureEngine: statusObject(z.literal("not_started")),
    execution: z.object({ enabled: z.boolean() }).strict(),
  })
  .strict();

export const SecurityStatusResponseSchema = z
  .object({
    denyByDefault: z.literal(true),
    privateNetworkRequired: z.boolean(),
    registeredDeviceRequired: z.literal(true),
    signedRequestsRequired: z.literal(true),
    highRiskGestureApprovalAllowed: z.literal(false),
    arbitraryShellAllowed: z.literal(false),
    arbitraryFileAccessAllowed: z.literal(false),
    permanentDeletionAllowed: z.literal(false),
    executionEnabled: z.boolean(),
    authenticationRequired: z.literal(true),
    networkVerification: z.enum([
      "UNKNOWN",
      "PRIVATE_NETWORK",
      "PUBLIC_NETWORK",
      "UNAVAILABLE",
    ]),
    emergencyStopActive: z.boolean(),
    persistence: z.enum(["in_memory_development", "postgresql"]),
  })
  .strict();

export const EmergencyStopResponseSchema = z
  .object({
    success: z.literal(true),
    executionEnabled: z.literal(false),
  })
  .strict();

export const ExecutionEnableResponseSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.literal("EXECUTION_NOT_AVAILABLE"),
        message: z.literal("Execution cannot be enabled during Phase 2.3."),
      })
      .strict(),
  })
  .strict();

export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
export type SecurityStatusResponse = z.infer<typeof SecurityStatusResponseSchema>;
export type EmergencyStopResponse = z.infer<typeof EmergencyStopResponseSchema>;
export type ExecutionEnableResponse = z.infer<typeof ExecutionEnableResponseSchema>;
