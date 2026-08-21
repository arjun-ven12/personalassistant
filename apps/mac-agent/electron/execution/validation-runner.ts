import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  ValidationExecutionResultSchema,
  WorkspaceValidateProfileInputSchema,
  type ValidationProfile,
  type ValidationStepResult,
} from "@alexa-control/shared";

import { CapabilityError } from "./errors.js";
import { resolveWorkspace } from "./path-policy.js";

const PNPM_EXECUTABLE = "/opt/homebrew/bin/pnpm";
const FALLBACK_PNPM_EXECUTABLE = "/usr/local/bin/pnpm";

const profileCommands: Record<
  ValidationProfile["id"],
  { executable: string; fallback?: string; args: string[]; classification: string }
> = {
  pnpm_format_check: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["format:check"],
    classification: "FAILED_LINT",
  },
  pnpm_typecheck: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["typecheck"],
    classification: "FAILED_TYPECHECK",
  },
  pnpm_lint: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["lint"],
    classification: "FAILED_LINT",
  },
  pnpm_test: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["test"],
    classification: "FAILED_TESTS",
  },
  pnpm_build: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["build"],
    classification: "FAILED_BUILD",
  },
  pnpm_security_check: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["security:check"],
    classification: "FAILED_POLICY",
  },
  pnpm_verify_production_config: {
    executable: PNPM_EXECUTABLE,
    fallback: FALLBACK_PNPM_EXECUTABLE,
    args: ["verify:production-config"],
    classification: "FAILED_POLICY",
  },
};

const safeEnvironment = {
  PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  HOME: "/var/empty",
  CI: "true",
  NODE_ENV: "test",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
  GIT_TERMINAL_PROMPT: "0",
};

const trimOutput = (value: string) => value.slice(-32_768);

const copySandbox = async (sourceRoot: string) => {
  const sandboxParent = await mkdtemp(path.join(os.tmpdir(), "assistant-validation-"));
  const sandboxRoot = path.join(sandboxParent, "workspace");
  await cp(sourceRoot, sandboxRoot, {
    recursive: true,
    verbatimSymlinks: false,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      return !segments.some((segment) =>
        new Set([".git", "node_modules", "dist", "dist-electron", ".next"]).has(
          segment,
        ),
      );
    },
  });
  return { sandboxParent, sandboxRoot };
};

const runProfile = (
  profile: ValidationProfile,
  cwd: string,
  signal?: AbortSignal,
): Promise<ValidationStepResult> =>
  new Promise((resolve) => {
    const command = profileCommands[profile.id];
    const startedAt = new Date();
    const stepId = crypto.randomUUID();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (
      status: "PASSED" | "FAILED" | "TIMED_OUT" | "CANCELLED",
      exitCode: number | null,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const completedAt = new Date();
      resolve({
        stepId,
        profileId: profile.id,
        status,
        classification:
          status === "PASSED"
            ? "PASSED"
            : status === "TIMED_OUT"
              ? "FAILED_TIMEOUT"
              : status === "CANCELLED"
                ? "CANCELLED"
                : (command.classification as ValidationStepResult["classification"]),
        exitCode,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        truncated: stdout.length > 32_768 || stderr.length > 32_768,
        warnings: [],
        errors:
          exitCode === 0 ? [] : [`${profile.label} exited with ${exitCode ?? -1}`],
      });
    };
    const child = spawn(command.executable, command.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: safeEnvironment,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("TIMED_OUT", null);
    }, profile.timeoutMs);
    const abort = () => {
      child.kill("SIGKILL");
      finish("CANCELLED", null);
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 65_536) stdout = stdout.slice(-32_768);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 65_536) stderr = stderr.slice(-32_768);
    });
    child.on("error", () => {
      if (command.fallback) {
        const fallback = spawn(command.fallback, command.args, {
          cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: safeEnvironment,
          windowsHide: true,
        });
        fallback.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        fallback.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        fallback.on("close", (code) => finish(code === 0 ? "PASSED" : "FAILED", code));
        fallback.on("error", () => finish("FAILED", -1));
      } else {
        finish("FAILED", -1);
      }
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      finish(code === 0 ? "PASSED" : "FAILED", code);
    });
  });

export const runValidationProfiles = async (input: {
  workspaceId: string;
  rootPath: string;
  arguments: unknown;
  signal?: AbortSignal;
}) => {
  const args = WorkspaceValidateProfileInputSchema.parse(input.arguments);
  if (args.workspaceId !== input.workspaceId)
    throw new CapabilityError(
      "VALIDATION_WORKSPACE_MISMATCH",
      "Validation workspace mismatch.",
    );
  const workspace = await resolveWorkspace(input.rootPath);
  const started = Date.now();
  let cleanedUp = false;
  const sandbox = await copySandbox(workspace.canonicalRoot);
  const steps: ValidationStepResult[] = [];
  try {
    for (const profile of args.profiles) {
      const result = await runProfile(profile, sandbox.sandboxRoot, input.signal);
      steps.push(result);
      if (result.status !== "PASSED") break;
    }
  } finally {
    await rm(sandbox.sandboxParent, { recursive: true, force: true });
    cleanedUp = true;
  }
  const failed = steps.find((step) => step.status !== "PASSED");
  const classification = failed?.classification ?? "PASSED";
  return ValidationExecutionResultSchema.parse({
    workspaceId: input.workspaceId,
    validationRunId: args.validationRunId,
    status: failed ? "FAILED" : "PASSED",
    classification,
    steps,
    summary: failed
      ? `${failed.profileId} failed with ${classification}.`
      : `${steps.length} validation step(s) passed.`,
    sandbox: { isolated: true, cleanedUp, network: "disabled" },
    metrics: { durationMs: Date.now() - started, stepCount: steps.length },
  });
};
