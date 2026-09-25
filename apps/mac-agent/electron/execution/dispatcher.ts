import {
  GitDiffInputSchema,
  EngineeringTransportRequestSchema,
  EngineeringTransportResultSchema,
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
import type { NativeEngineeringRuntime } from "../engineering-runtime/runtime.js";

export interface DispatcherLimits {
  maxFileReadBytes: number;
  maxGitOutputBytes: number;
  maxGitEntries: number;
}

export const dispatchReadOnlyCapability = async (
  request: ReadOnlyExecutionRequest,
  limits: DispatcherLimits,
  signal?: AbortSignal,
  engineeringRuntime?: NativeEngineeringRuntime,
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
    case "engineering.repository_capability": {
      if (!engineeringRuntime)
        throw new CapabilityError(
          "ENGINEERING_RUNTIME_UNAVAILABLE",
          "The reviewed engineering runtime is unavailable.",
        );
      const transport = EngineeringTransportRequestSchema.parse(args);
      if (
        transport.workspaceLocatorId !== request.workspaceId ||
        transport.operationId !== request.actionId
      )
        throw new CapabilityError(
          "ENGINEERING_SCOPE_MISMATCH",
          "The signed engineering request scope is inconsistent.",
        );
      const common = {
        repositoryRootPath: request.workspaceRootPath,
        worktreeLocator: transport.worktreeLocator ?? "",
      };
      let output;
      switch (transport.capability) {
        case "repository.initialize_project":
          output = await engineeringRuntime.initializeProject({
            repositoryRootPath: request.workspaceRootPath,
            ...transport.input,
          });
          break;
        case "repository.inspect":
          output = await engineeringRuntime.inspectRepository({
            repositoryRootPath: request.workspaceRootPath,
          });
          break;
        case "repository.worktree_create":
          if (!transport.worktreeLocator)
            throw new CapabilityError(
              "ENGINEERING_SCOPE_MISMATCH",
              "A worktree locator is required.",
            );
          await engineeringRuntime.createWorktree({
            ...common,
            branchName: transport.input.branchName,
            baseCommit: transport.input.baseCommit,
          });
          output = { completed: true as const };
          break;
        case "repository.worktree_inspect":
          output = await engineeringRuntime.inspectWorktree(common);
          break;
        case "repository.worktree_remove":
          if (!transport.worktreeLocator)
            throw new CapabilityError(
              "ENGINEERING_SCOPE_MISMATCH",
              "A worktree locator is required.",
            );
          await engineeringRuntime.removeWorktree(common);
          output = { completed: true as const };
          break;
        case "repository.search":
          output = await engineeringRuntime.search({
            ...common,
            ...transport.input,
            ...(signal ? { signal } : {}),
          });
          break;
        case "repository.file_read":
          output = await engineeringRuntime.readFile({
            ...common,
            path: transport.input.path,
            startLine: transport.input.startLine,
            maxBytes: transport.input.maxBytes,
            ...(transport.input.endLine === undefined
              ? {}
              : { endLine: transport.input.endLine }),
            ...(signal ? { signal } : {}),
          });
          break;
        case "repository.file_patch":
          output = await engineeringRuntime.applyPatch({
            ...common,
            ...transport.input,
          });
          break;
        case "repository.file_create":
          output = await engineeringRuntime.createFile({
            ...common,
            ...transport.input,
          });
          break;
        case "repository.file_delete":
          output = await engineeringRuntime.quarantineFile({
            ...common,
            ...transport.input,
          });
          break;
        case "repository.git_status":
          output = await engineeringRuntime.gitStatus(common);
          break;
        case "repository.git_diff":
          output = await engineeringRuntime.gitDiff({
            ...common,
            maxBytes: transport.input.maxBytes,
          });
          break;
        case "repository.integration_diff":
          output = await engineeringRuntime.gitDiff({
            ...common,
            maxBytes: transport.input.maxBytes,
            baseCommit: transport.input.baseCommit,
          });
          break;
        case "repository.prepare_commit":
          output = await engineeringRuntime.prepareCommit({
            ...common,
            taskId: transport.input.taskId,
            agentId: transport.input.agentId,
            baseCommit: transport.input.baseCommit,
          });
          break;
        case "repository.integrate_commit":
          output = await engineeringRuntime.integrateCommit({
            ...common,
            commit: transport.input.commit,
            sourceWorktreeLocator: transport.input.sourceWorktreeLocator,
            ...(transport.input.expectedHead ? { expectedHead: transport.input.expectedHead } : {}),
          });
          break;
        case "repository.resolve_additive_docs_conflict":
          output = await engineeringRuntime.resolveAdditiveDocsConflict({
            ...common,
            sourceWorktreeLocator: transport.input.sourceWorktreeLocator,
            commit: transport.input.commit,
            path: transport.input.path,
            expectedHead: transport.input.expectedHead,
          });
          break;
        case "repository.merge_candidate":
          output = await engineeringRuntime.mergeCandidate({
            ...common,
            expectedBase: transport.input.expectedBase,
            candidateHead: transport.input.candidateHead,
            targetBranch: transport.input.targetBranch,
            leaseExpiresAt: transport.input.leaseExpiresAt,
          });
          break;
        case "repository.revert_commit":
          output = await engineeringRuntime.revertCommit({
            ...common,
            targetCommit: transport.input.targetCommit,
            expectedHead: transport.input.expectedHead,
          });
          break;
        case "repository.run_command":
          output = await engineeringRuntime.runCommand({
            ...common,
            command: transport.input.command,
            ...(signal ? { signal } : {}),
          });
          break;
        case "repository.install_dependencies":
        case "repository.add_dependency":
        case "repository.remove_dependency":
          output = await engineeringRuntime.dependencyOperation({
            ...common,
            packageManager: transport.input.packageManager,
            operation:
              transport.capability === "repository.install_dependencies"
                ? "INSTALL"
                : transport.capability === "repository.add_dependency"
                  ? "ADD"
                  : "REMOVE",
            packages: "packages" in transport.input ? transport.input.packages : [],
            ...("development" in transport.input
              ? { development: transport.input.development }
              : {}),
            ...(signal ? { signal } : {}),
          });
          break;
        case "repository.dev_server_start":
          output = await engineeringRuntime.startDevServer({
            ...common,
            ...transport.input,
          });
          break;
        case "repository.dev_server_status":
          output = await engineeringRuntime.devServerStatus(transport.input);
          break;
        case "repository.dev_server_stop":
          output = await engineeringRuntime.stopDevServer(transport.input);
          break;
        case "repository.dev_server_restart":
          output = await engineeringRuntime.restartDevServer({
            ...common,
            ...transport.input,
          });
          break;
      }
      return ReadOnlyCapabilityResultSchema.parse(
        EngineeringTransportResultSchema.parse({
          schemaVersion: "1",
          operationId: transport.operationId,
          capability: transport.capability,
          output,
        }),
      );
    }
    default:
      throw new CapabilityError(
        "UNSUPPORTED_EXECUTION_TOOL",
        "The capability is not supported.",
      );
  }
};
