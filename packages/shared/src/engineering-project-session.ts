import { z } from "zod";

export const CreateEngineeringProjectSessionRequestSchema = z.object({
  repositoryId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export const SendEngineeringProjectMessageRequestSchema = z.object({
  instruction: z.string().trim().min(3).max(2_000),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export const EngineeringProjectInstructionClassificationSchema = z.enum([
  "MODIFY_CURRENT_REQUIREMENT",
  "ADD_REQUIREMENT",
  "QUESTION",
  "CONTROL_ACTION",
  "NEW_INDEPENDENT_REQUEST",
]);

export const EngineeringProjectSessionRequestStatusSchema = z.enum([
  "QUEUED",
  "READY",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
  "BLOCKED",
]);

export const EngineeringProjectSessionRequestSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  instruction: z.string().trim().min(3).max(2_000),
  classification: z.literal("NEW_INDEPENDENT_REQUEST"),
  status: EngineeringProjectSessionRequestStatusSchema,
  deliveryId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const UpdateEngineeringProjectSessionQueueRequestSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["CANCEL", "MOVE_UP", "MOVE_DOWN", "START_NEXT"]),
}).strict();

export const EngineeringProjectSessionMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["OWNER", "ALEXA"]),
  text: z.string().min(1).max(2_000),
  deliveryId: z.string().uuid().nullable(),
  state: z.enum(["QUEUED", "ACTIVE", "COMPLETE", "BLOCKED"]).nullable(),
  idempotencyKey: z.string().min(8).max(200).nullable(),
  classification: EngineeringProjectInstructionClassificationSchema.nullable().default(null),
  createdAt: z.iso.datetime(),
}).strict();

export const EngineeringProjectSessionSchema = z.object({
  schemaVersion: z.literal("1"),
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  companyId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  conversationId: z.string().uuid(),
  projectName: z.string().min(1).max(120),
  messages: z.array(EngineeringProjectSessionMessageSchema).max(500),
  deliveryIds: z.array(z.string().uuid()).max(250),
  activeDeliveryId: z.string().uuid().nullable(),
  queuedRequests: z.array(EngineeringProjectSessionRequestSchema).max(100).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const EngineeringProjectSessionViewSchema = z.object({
  session: EngineeringProjectSessionSchema,
  runs: z.array(z.object({
    deliveryId: z.string().uuid(),
    status: z.string().max(40),
    request: z.string().max(8_000),
    filesChanged: z.number().int().nonnegative(),
    costUsd: z.string().regex(/^\d+(\.\d{1,8})?$/),
    durationMs: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  }).strict()).max(250),
}).strict();

export type EngineeringProjectSession = z.infer<typeof EngineeringProjectSessionSchema>;
export type EngineeringProjectInstructionClassification = z.infer<typeof EngineeringProjectInstructionClassificationSchema>;
