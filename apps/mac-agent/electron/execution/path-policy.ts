import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { CapabilityError } from "./errors.js";

const sensitiveRoots = new Set([
  "/",
  "/Users",
  "/System",
  "/Library",
  "/Applications",
  "/etc",
  "/var",
  "/private",
]);

const matchesBlocked = (relativePath: string, patterns: string[]) => {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return patterns.some((pattern) => {
    const clean = pattern.replace(/\/$/, "");
    if (clean.endsWith("/*password*"))
      return (
        normalized.startsWith(clean.slice(0, -"*password*".length)) &&
        normalized.toLowerCase().includes("password")
      );
    if (clean.startsWith("*."))
      return segments.some((segment) => segment.endsWith(clean.slice(1)));
    if (clean.includes("*")) {
      const [prefix = "", suffix = ""] = clean.split("*");
      return segments.some(
        (segment) => segment.startsWith(prefix) && segment.endsWith(suffix),
      );
    }
    return (
      normalized === clean ||
      normalized.startsWith(`${clean}/`) ||
      segments.includes(clean)
    );
  });
};

export interface ResolvedWorkspace {
  registeredRoot: string;
  canonicalRoot: string;
}

export const resolveWorkspace = async (
  registeredRoot: string,
): Promise<ResolvedWorkspace> => {
  if (!path.isAbsolute(registeredRoot) || registeredRoot.includes("\0"))
    throw new CapabilityError("WORKSPACE_PATH_INVALID", "Workspace root is invalid.");
  const canonicalRoot = await realpath(registeredRoot).catch(() => {
    throw new CapabilityError("WORKSPACE_ROOT_MISSING", "Workspace root is missing.");
  });
  if (sensitiveRoots.has(canonicalRoot) || /^\/Users\/[^/]+$/.test(canonicalRoot))
    throw new CapabilityError(
      "WORKSPACE_ROOT_TOO_BROAD",
      "Workspace root is too broad.",
    );
  if (!(await stat(canonicalRoot)).isDirectory())
    throw new CapabilityError(
      "WORKSPACE_ROOT_NOT_DIRECTORY",
      "Workspace root is not a directory.",
    );
  return { registeredRoot, canonicalRoot };
};

export const resolveWorkspaceFile = async (
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
    throw new CapabilityError("WORKSPACE_PATH_INVALID", "File path is invalid.");
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    throw new CapabilityError("WORKSPACE_PATH_INVALID", "File path is not normalised.");
  if (matchesBlocked(relativePath, blockedPatterns))
    throw new CapabilityError(
      "WORKSPACE_PATH_BLOCKED",
      "The file is blocked by workspace policy.",
    );

  let current = workspace.canonicalRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => {
      throw new CapabilityError("FILE_NOT_FOUND", "The requested file does not exist.");
    });
    if (info.isSymbolicLink())
      throw new CapabilityError(
        "WORKSPACE_SYMLINK_REJECTED",
        "Symlink traversal is not allowed.",
      );
  }
  const canonicalTarget = await realpath(current);
  const relativeCanonical = path.relative(workspace.canonicalRoot, canonicalTarget);
  if (
    !relativeCanonical ||
    relativeCanonical.startsWith("..") ||
    path.isAbsolute(relativeCanonical)
  )
    throw new CapabilityError(
      "WORKSPACE_PATH_ESCAPE",
      "The file escapes the workspace.",
    );
  const info = await stat(canonicalTarget);
  if (!info.isFile())
    throw new CapabilityError("FILE_NOT_REGULAR", "The target is not a regular file.");
  return { canonicalTarget, canonicalRelativePath: relativeCanonical, info };
};
