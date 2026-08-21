import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { resolveWorkspace } from "./path-policy.js";

export const inspectWorkspaceMetadata = async (input: {
  workspaceId: string;
  rootPath: string;
}) => {
  const workspace = await resolveWorkspace(input.rootPath);
  const entries = await readdir(workspace.canonicalRoot, { withFileTypes: true });
  return {
    workspaceId: input.workspaceId,
    registeredRootPath: workspace.registeredRoot,
    canonicalRootPath: workspace.canonicalRoot,
    exists: true,
    isDirectory: true,
    isGitRepository: await stat(path.join(workspace.canonicalRoot, ".git"))
      .then((value) => value.isDirectory() || value.isFile())
      .catch(() => false),
    rootEntryCount: entries.length,
    rootFileCount: entries.filter((entry) => entry.isFile()).length,
    rootDirectoryCount: entries.filter((entry) => entry.isDirectory()).length,
    warnings: entries.some((entry) => entry.isSymbolicLink())
      ? ["Root contains symlinks; Phase 3.1 will not traverse them."]
      : [],
    inspectedAt: new Date().toISOString(),
  };
};
