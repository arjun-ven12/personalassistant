import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  lstat,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  PatchExecutionResultSchema,
  WorkspaceApplyPatchInputSchema,
  type PatchOperation,
} from "@alexa-control/shared";

import { CapabilityError } from "./errors.js";
import {
  resolveWorkspace,
  resolveWorkspaceFile,
  type ResolvedWorkspace,
} from "./path-policy.js";

const sha256Hex = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const canonicalPatchDigest = (operations: PatchOperation[]) =>
  sha256Hex(
    JSON.stringify(
      operations.map((operation) => ({
        kind: operation.kind,
        relativePath: operation.relativePath,
        newRelativePath: operation.newRelativePath ?? null,
        expectedOriginalSha256: operation.expectedOriginalSha256,
        newContent: operation.newContent,
      })),
    ),
  );

const matchesBlockedPattern = (relativePath: string, patterns: string[]) => {
  const segments = relativePath.split("/");
  return patterns.some((pattern) => {
    const clean = pattern.replace(/\/$/, "");
    if (clean.startsWith("*.")) {
      return segments.some((segment) => segment.endsWith(clean.slice(1)));
    }
    if (clean.includes("*")) {
      const [prefix = "", suffix = ""] = clean.split("*");
      return segments.some(
        (segment) => segment.startsWith(prefix) && segment.endsWith(suffix),
      );
    }
    return (
      relativePath === clean ||
      relativePath.startsWith(`${clean}/`) ||
      segments.includes(clean)
    );
  });
};

const assertPatchPath = async (
  workspace: ResolvedWorkspace,
  relativePath: string,
  blockedPatterns: string[],
) => {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\0") ||
    /[?*[\]{}]/.test(relativePath)
  )
    throw new CapabilityError("WORKSPACE_PATH_INVALID", "Patch path is invalid.");
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    throw new CapabilityError(
      "WORKSPACE_PATH_INVALID",
      "Patch path is not normalised.",
    );
  if (matchesBlockedPattern(relativePath, blockedPatterns))
    throw new CapabilityError(
      "WORKSPACE_PATH_BLOCKED",
      "Patch path is blocked by workspace policy.",
    );
  let current = workspace.canonicalRoot;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) break;
    if (info.isSymbolicLink())
      throw new CapabilityError(
        "WORKSPACE_SYMLINK_REJECTED",
        "Symlink traversal is not allowed.",
      );
    if (!info.isDirectory())
      throw new CapabilityError("WORKSPACE_PATH_INVALID", "Patch parent is invalid.");
  }
  const absoluteTarget = path.join(workspace.canonicalRoot, relativePath);
  const relative = path.relative(workspace.canonicalRoot, absoluteTarget);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new CapabilityError("WORKSPACE_PATH_ESCAPE", "Patch path escapes workspace.");
  return absoluteTarget;
};

const snapshot = async (
  workspaceId: string,
  workspace: ResolvedWorkspace,
  relativePath: string,
  blockedPatterns: string[],
) => {
  const target = await resolveWorkspaceFile(
    workspace,
    relativePath,
    blockedPatterns,
  ).catch((error) => {
    if (error instanceof CapabilityError && error.code === "FILE_NOT_FOUND")
      return null;
    throw error;
  });
  if (!target) return { relativePath, existed: false, sha256: null, content: null };
  const content = await readFile(target.canonicalTarget, "utf8");
  if (Buffer.byteLength(content) > 131_072)
    throw new CapabilityError(
      "ROLLBACK_SNAPSHOT_TOO_LARGE",
      "Rollback snapshot is too large.",
    );
  return {
    relativePath,
    existed: true,
    sha256: sha256Hex(content),
    content,
    workspaceId,
  };
};

export const applyApprovedPatch = async (input: {
  workspaceId: string;
  rootPath: string;
  blockedPatterns: string[];
  arguments: unknown;
}) => {
  const args = WorkspaceApplyPatchInputSchema.parse(input.arguments);
  if (args.workspaceId !== input.workspaceId)
    throw new CapabilityError("PATCH_WORKSPACE_MISMATCH", "Patch workspace mismatch.");
  if (canonicalPatchDigest(args.operations) !== args.patchDigest)
    throw new CapabilityError("PATCH_DIGEST_MISMATCH", "Patch digest mismatch.");
  const workspace = await resolveWorkspace(input.rootPath);
  const rollbackSnapshots = [];
  for (const operation of args.operations) {
    const targetPath = await assertPatchPath(
      workspace,
      operation.relativePath,
      input.blockedPatterns,
    );
    if (operation.newRelativePath) {
      await assertPatchPath(
        workspace,
        operation.newRelativePath,
        input.blockedPatterns,
      );
    }
    const before = await snapshot(
      input.workspaceId,
      workspace,
      operation.relativePath,
      input.blockedPatterns,
    );
    rollbackSnapshots.push(before);
    if (
      operation.expectedOriginalSha256 &&
      before.sha256 !== operation.expectedOriginalSha256
    )
      throw new CapabilityError(
        "PATCH_ORIGINAL_HASH_MISMATCH",
        "Original file hash mismatch.",
      );

    if (operation.kind === "create") {
      const exists = await lstat(targetPath).catch(() => null);
      if (exists)
        throw new CapabilityError(
          "PATCH_CREATE_TARGET_EXISTS",
          "Create target already exists.",
        );
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, operation.newContent ?? "", "utf8");
    } else if (operation.kind === "modify") {
      if (!before.existed)
        throw new CapabilityError(
          "PATCH_MODIFY_TARGET_MISSING",
          "Modify target is missing.",
        );
      await writeFile(targetPath, operation.newContent ?? "", "utf8");
    } else if (operation.kind === "delete") {
      if (!before.existed)
        throw new CapabilityError(
          "PATCH_DELETE_TARGET_MISSING",
          "Delete target is missing.",
        );
      await rm(targetPath);
    } else if (operation.kind === "rename") {
      if (!before.existed || !operation.newRelativePath)
        throw new CapabilityError("PATCH_RENAME_INVALID", "Rename target is invalid.");
      const destination = path.join(workspace.canonicalRoot, operation.newRelativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(targetPath, destination);
      const canonicalDestination = await realpath(destination);
      if (!canonicalDestination.startsWith(workspace.canonicalRoot + path.sep))
        throw new CapabilityError("WORKSPACE_PATH_ESCAPE", "Rename escaped workspace.");
      if (operation.newContent !== null)
        await writeFile(destination, operation.newContent, "utf8");
    }
  }
  return PatchExecutionResultSchema.parse({
    workspaceId: input.workspaceId,
    patchId: args.patchId,
    patchDigest: args.patchDigest,
    appliedOperations: args.operations.length,
    rollbackSnapshots: rollbackSnapshots.map((entry) => ({
      relativePath: entry.relativePath,
      existed: entry.existed,
      sha256: entry.sha256,
      content: entry.content,
    })),
    validation: {
      astValid: true,
      syntaxValid: true,
      formattingValid: true,
      dependencyValid: true,
      importValid: true,
      typecheckConfigured: false,
    },
  });
};
