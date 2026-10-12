import { z } from "zod";

const uuid = z.string().uuid();
const githubName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);

/** A server decision, never a model-selected execution placement. */
export const EngineeringExecutionTargetSchema = z.object({
  type: z.enum(["CLOUD", "MAC"]),
  reason: z.enum(["PORTABLE_REPOSITORY", "MAC_NATIVE", "LOCAL_ONLY", "DEVICE_RESOURCE", "CLOUD_UNAVAILABLE", "MAC_UNAVAILABLE"]),
  availability: z.enum(["READY", "WAITING_FOR_DEVICE", "UNAVAILABLE"]),
  requiredCapabilities: z.array(z.string().min(1).max(100)).max(40),
  environmentRequirements: z.array(z.string().min(1).max(100)).max(20),
}).strict();

export const GitHubRepositoryIdentitySchema = z.object({
  provider: z.literal("github"),
  providerRepositoryId: z.number().int().positive(),
  owner: githubName,
  name: githubName,
  fullName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/),
  defaultBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/),
  private: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  permissions: z.object({ pull: z.boolean(), push: z.boolean(), admin: z.boolean() }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.fullName !== `${value.owner}/${value.name}`)
    ctx.addIssue({ code: "custom", path: ["fullName"], message: "Repository identity is inconsistent." });
});

export const EngineeringGitHubRegistrationSchema = z.object({
  schemaVersion: z.literal("1"),
  id: uuid,
  ownerId: uuid,
  companyId: uuid,
  credentialReferenceId: uuid,
  repository: GitHubRepositoryIdentitySchema,
  engineeringRepositoryId: uuid.nullable(),
  status: z.enum(["ACTIVE", "REVOKED"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const RegisterEngineeringGitHubRepositoryRequestSchema = z.object({
  credentialReferenceId: uuid,
  providerRepositoryId: z.number().int().positive(),
}).strict();

export const CreateEngineeringGitHubRepositoryRequestSchema = z.object({
  credentialReferenceId: uuid,
  name: githubName,
  description: z.string().trim().max(300).default(""),
  private: z.boolean().default(true),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,119}$/),
}).strict();

export const EngineeringGitHubRepositoryListQuerySchema = z.object({
  credentialReferenceId: uuid,
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100).default(1),
}).strict();

export type EngineeringExecutionTarget = z.infer<typeof EngineeringExecutionTargetSchema>;
export type GitHubRepositoryIdentity = z.infer<typeof GitHubRepositoryIdentitySchema>;
export type EngineeringGitHubRegistration = z.infer<typeof EngineeringGitHubRegistrationSchema>;

export const EngineeringProjectInputRequestSchema = z.object({
  fileName: z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/),
  mimeType: z.enum(["image/png", "image/jpeg", "text/plain"]),
  contentBase64: z.string().min(4).max(349_528).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  idempotencyKey: z.string().uuid(),
}).strict();
export const EngineeringProjectInputMetadataSchema = z.object({
  id: uuid, objectiveId: uuid, fileName: z.string().min(1).max(120),
  mimeType: z.enum(["image/png", "image/jpeg", "text/plain"]),
  byteLength: z.number().int().min(1).max(262_144), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  provenance: z.literal("OWNER_UPLOADED_UNTRUSTED"), createdAt: z.iso.datetime(),
}).strict();
