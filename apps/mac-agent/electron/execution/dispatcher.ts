import {
  GitDiffInputSchema,
  ReadOnlyCapabilityResultSchema,
  RepositoryScanMetadataInputSchema,
  WorkspaceReadFileInputSchema,
  type ReadOnlyExecutionRequest,
} from "@alexa-control/shared";

import { readWorkspaceFile } from "./file-reader.js";
import {
  inspectCurrentBranch,
  inspectGitDiff,
  inspectGitStatus,
} from "./git-inspector.js";
import { inspectWorkspaceMetadata } from "./workspace-inspector.js";
import { scanRepositoryMetadata } from "./repository-scanner.js";
import { applyApprovedPatch } from "./patch-applier.js";
import { runValidationProfiles } from "./validation-runner.js";
import { CapabilityError } from "./errors.js";

export interface DispatcherLimits {
  maxFileReadBytes: number;
  maxGitOutputBytes: number;
  maxGitEntries: number;
}

export const dispatchReadOnlyCapability = async (
  request: ReadOnlyExecutionRequest,
  limits: DispatcherLimits,
  signal?: AbortSignal,
) => {
  const args = request.arguments;
  switch (request.toolName) {
    case "workspace.inspect_metadata":
      return ReadOnlyCapabilityResultSchema.parse(
        await inspectWorkspaceMetadata({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
        }),
      );
    case "workspace.read_file": {
      const fileInput = WorkspaceReadFileInputSchema.parse(args);
      return ReadOnlyCapabilityResultSchema.parse(
        await readWorkspaceFile({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          relativePath: fileInput.relativePath,
          blockedPatterns: request.blockedPatterns,
          maxBytes: Math.min(
            fileInput.maxBytes ?? limits.maxFileReadBytes,
            limits.maxFileReadBytes,
          ),
          ...(signal ? { signal } : {}),
        }),
      );
    }
    case "git.status":
      return ReadOnlyCapabilityResultSchema.parse(
        await inspectGitStatus({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          maxBytes: limits.maxGitOutputBytes,
          maxEntries: limits.maxGitEntries,
          ...(signal ? { signal } : {}),
        }),
      );
    case "git.diff": {
      const diffInput = GitDiffInputSchema.parse(args);
      return ReadOnlyCapabilityResultSchema.parse(
        await inspectGitDiff({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          mode: diffInput.mode,
          maxBytes: limits.maxGitOutputBytes,
          maxEntries: limits.maxGitEntries,
          ...(signal ? { signal } : {}),
        }),
      );
    }
    case "git.current_branch":
      return ReadOnlyCapabilityResultSchema.parse(
        await inspectCurrentBranch({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          maxBytes: limits.maxGitOutputBytes,
          ...(signal ? { signal } : {}),
        }),
      );
    case "repository.scan_metadata": {
      const scanInput = RepositoryScanMetadataInputSchema.parse(args);
      return ReadOnlyCapabilityResultSchema.parse(
        await scanRepositoryMetadata({
          workspaceId: scanInput.workspaceId,
          rootPath: request.workspaceRootPath,
          blockedPatterns: request.blockedPatterns,
          maxEntries: limits.maxGitEntries * 20,
          ...(signal ? { signal } : {}),
        }),
      );
    }
    case "workspace.apply_patch":
      return ReadOnlyCapabilityResultSchema.parse(
        await applyApprovedPatch({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          blockedPatterns: request.blockedPatterns,
          arguments: args,
        }),
      );
    case "workspace.validate_profile":
      return ReadOnlyCapabilityResultSchema.parse(
        await runValidationProfiles({
          workspaceId: request.workspaceId,
          rootPath: request.workspaceRootPath,
          arguments: args,
          ...(signal ? { signal } : {}),
        }),
      );
    default:
      throw new CapabilityError(
        "UNSUPPORTED_EXECUTION_TOOL",
        "The capability is not supported.",
      );
  }
};
