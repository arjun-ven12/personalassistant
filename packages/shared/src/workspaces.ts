import { z } from "zod";

import { BLOCKED_WORKSPACE_PATTERNS } from "./security.js";
import { RegistryIdSchema } from "./applications.js";

const disabled = false;
const workspacePermissionDefaults = {
  read: false,
  write: false,
  createFile: false,
  modifyFile: false,
  moveFile: false,
  deleteFile: false as const,
  runScripts: false,
};
const gitPermissionDefaults = {
  status: false,
  diff: false,
  createBranch: false,
  commit: false,
  push: false,
};

export const WorkspacePermissionsSchema = z
  .object({
    read: z.boolean().default(disabled),
    write: z.boolean().default(disabled),
    createFile: z.boolean().default(disabled),
    modifyFile: z.boolean().default(disabled),
    moveFile: z.boolean().default(disabled),
    deleteFile: z.literal(false).default(disabled),
    runScripts: z.boolean().default(disabled),
  })
  .strict();

export const GitPermissionsSchema = z
  .object({
    status: z.boolean().default(disabled),
    diff: z.boolean().default(disabled),
    createBranch: z.boolean().default(disabled),
    commit: z.boolean().default(disabled),
    push: z.boolean().default(disabled),
  })
  .strict();

export const AllowedWorkspaceSchema = z
  .object({
    id: RegistryIdSchema,
    ownerId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(100),
    rootPath: z
      .string()
      .trim()
      .min(2)
      .max(1_024)
      .refine((value) => value.startsWith("/"), "Path must be absolute.")
      .refine(
        (value) =>
          !value.includes("\0") &&
          !value.includes("//") &&
          !value.includes("/./") &&
          !value.includes("/../") &&
          !value.endsWith("/.") &&
          !value.endsWith("/..") &&
          !value.endsWith("/"),
        "Path must be lexically normalised.",
      )
      .refine(
        (value) =>
          ![
            "/",
            "/Users",
            "/System",
            "/Library",
            "/Applications",
            "/etc",
            "/var",
            "/private",
          ].includes(value) && !/^\/Users\/[^/]+$/.test(value),
        "Path is too broad or sensitive.",
      ),
    enabled: z.boolean(),
    permissions: WorkspacePermissionsSchema.default(workspacePermissionDefaults),
    blockedPatterns: z.array(z.string().trim().min(1)),
    allowedScripts: z.array(z.string().trim().min(1)),
    gitPermissions: GitPermissionsSchema.default(gitPermissionDefaults),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((workspace, context) => {
    for (const pattern of BLOCKED_WORKSPACE_PATTERNS) {
      if (!workspace.blockedPatterns.includes(pattern)) {
        context.addIssue({
          code: "custom",
          path: ["blockedPatterns"],
          message: `Mandatory blocked pattern is missing: ${pattern}`,
        });
      }
    }
  });

const WorkspaceRootPathSchema = AllowedWorkspaceSchema.shape.rootPath;

export const CreateWorkspaceRequestSchema = z
  .object({
    id: RegistryIdSchema,
    displayName: z.string().trim().min(1).max(100),
    rootPath: WorkspaceRootPathSchema,
    enabled: z.boolean().default(false),
    permissions: WorkspacePermissionsSchema.default(workspacePermissionDefaults),
    blockedPatterns: z.array(z.string().trim().min(1).max(200)).default([]),
    allowedScripts: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9._-]{1,100}$/),
      )
      .max(50)
      .default([]),
    gitPermissions: GitPermissionsSchema.default(gitPermissionDefaults),
  })
  .strict();

export const UpdateWorkspaceRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    enabled: z.boolean().optional(),
    permissions: WorkspacePermissionsSchema.optional(),
    blockedPatterns: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    allowedScripts: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9._-]{1,100}$/),
      )
      .max(50)
      .optional(),
    gitPermissions: GitPermissionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one workspace field must be updated.",
  });

export const WorkspaceResponseSchema = AllowedWorkspaceSchema;
export const WorkspaceListResponseSchema = z.array(AllowedWorkspaceSchema);
export const WorkspaceIdParametersSchema = z
  .object({ workspaceId: RegistryIdSchema })
  .strict();

export type WorkspacePermissions = z.infer<typeof WorkspacePermissionsSchema>;
export type GitPermissions = z.infer<typeof GitPermissionsSchema>;
export type AllowedWorkspace = z.infer<typeof AllowedWorkspaceSchema>;
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;
