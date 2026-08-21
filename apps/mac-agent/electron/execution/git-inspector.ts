import { spawn } from "node:child_process";

import { resolveWorkspace } from "./path-policy.js";
import { CapabilityError } from "./errors.js";

const GIT_EXECUTABLE = "/usr/bin/git";
const safeEnvironment = {
  PATH: "/usr/bin:/bin",
  HOME: "/var/empty",
  LC_ALL: "C",
  GIT_TERMINAL_PROMPT: "0",
  GIT_PAGER: "cat",
  PAGER: "cat",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
};

const fixedArguments = {
  status: [
    "-c",
    "color.ui=false",
    "-c",
    "core.pager=cat",
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
  ],
  current_branch: [
    "-c",
    "color.ui=false",
    "-c",
    "core.pager=cat",
    "branch",
    "--show-current",
  ],
  unstaged_summary: ["-c", "color.ui=false", "diff", "--no-ext-diff", "--stat"],
  staged_summary: [
    "-c",
    "color.ui=false",
    "diff",
    "--cached",
    "--no-ext-diff",
    "--stat",
  ],
  unstaged_name_status: [
    "-c",
    "color.ui=false",
    "diff",
    "--no-ext-diff",
    "--name-status",
  ],
  staged_name_status: [
    "-c",
    "color.ui=false",
    "diff",
    "--cached",
    "--no-ext-diff",
    "--name-status",
  ],
} as const;

const runGit = async (
  operation: keyof typeof fixedArguments,
  cwd: string,
  maxBytes: number,
  timeoutMs: number,
  signal?: AbortSignal,
) =>
  new Promise<{ stdout: string; durationMs: number }>((resolve, reject) => {
    const started = Date.now();
    const child = spawn(GIT_EXECUTABLE, fixedArguments[operation], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: safeEnvironment,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new CapabilityError("CAPABILITY_TIMEOUT", "Git inspection timed out."));
    }, timeoutMs);
    const abort = () => {
      child.kill("SIGKILL");
      fail(
        new CapabilityError("CAPABILITY_CANCELLED", "Git inspection was cancelled."),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill("SIGKILL");
        fail(
          new CapabilityError("GIT_OUTPUT_TOO_LARGE", "Git output exceeded the limit."),
        );
      } else target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", () =>
      fail(
        new CapabilityError(
          "GIT_NOT_AVAILABLE",
          "The fixed Git executable is unavailable.",
        ),
      ),
    );
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          new CapabilityError(
            "GIT_REPOSITORY_REQUIRED",
            "The workspace is not a readable Git repository.",
          ),
        );
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        durationMs: Date.now() - started,
      });
    });
  });

const kindFor = (index: string, worktree: string) => {
  const pair = `${index}${worktree}`;
  if (pair.includes("U")) return "conflicted" as const;
  if (pair.includes("R")) return "renamed" as const;
  if (pair.includes("C")) return "copied" as const;
  if (pair.includes("D")) return "deleted" as const;
  if (pair.includes("A")) return "added" as const;
  if (pair.includes("M")) return "modified" as const;
  return "unknown" as const;
};

export const inspectGitStatus = async (input: {
  workspaceId: string;
  rootPath: string;
  maxBytes: number;
  maxEntries: number;
  signal?: AbortSignal;
}) => {
  const workspace = await resolveWorkspace(input.rootPath);
  const run = await runGit(
    "status",
    workspace.canonicalRoot,
    input.maxBytes,
    5_000,
    input.signal,
  );
  const branch = {
    head: null as string | null,
    upstream: null as string | null,
    ahead: 0,
    behind: 0,
    detached: false,
  };
  const entries: Array<{
    path: string;
    originalPath?: string;
    indexStatus: string;
    worktreeStatus: string;
    kind:
      | "modified"
      | "added"
      | "deleted"
      | "renamed"
      | "copied"
      | "untracked"
      | "ignored"
      | "conflicted"
      | "unknown";
  }> = [];
  for (const line of run.stdout.split("\n").filter(Boolean)) {
    if (line.startsWith("# branch.head ")) {
      const head = line.slice(14);
      branch.detached = head === "(detached)";
      branch.head = branch.detached ? null : head;
    } else if (line.startsWith("# branch.upstream ")) branch.upstream = line.slice(18);
    else if (line.startsWith("# branch.ab ")) {
      const match = /ahead \+(\d+) -(\d+)/.exec(
        line.replace("# branch.ab +", "ahead +"),
      );
      const values = line.slice(12).split(" ");
      branch.ahead = Number(values[0]?.slice(1) ?? 0);
      branch.behind = Number(values[1]?.slice(1) ?? 0);
      void match;
    } else if (line.startsWith("? ")) {
      entries.push({
        path: line.slice(2),
        indexStatus: "?",
        worktreeStatus: "?",
        kind: "untracked",
      });
    } else if (/^[12u] /.test(line)) {
      const fields = line.split(" ");
      const xy = fields[1] ?? "..";
      const pathStart = line.indexOf("\t");
      const paths =
        pathStart >= 0 ? line.slice(pathStart + 1).split("\t") : [fields.at(-1) ?? ""];
      entries.push({
        path: paths.at(-1) ?? "",
        ...(paths.length > 1 ? { originalPath: paths[0] } : {}),
        indexStatus: xy[0] ?? ".",
        worktreeStatus: xy[1] ?? ".",
        kind: kindFor(xy[0] ?? ".", xy[1] ?? "."),
      });
    }
    if (entries.length >= input.maxEntries) break;
  }
  const summary = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0,
    ignored: 0,
    conflicted: 0,
    unknown: 0,
  };
  for (const entry of entries) summary[entry.kind] += 1;
  return {
    workspaceId: input.workspaceId,
    branch,
    entries,
    summary,
    truncated: entries.length >= input.maxEntries,
    durationMs: run.durationMs,
  };
};

export const inspectCurrentBranch = async (input: {
  workspaceId: string;
  rootPath: string;
  maxBytes: number;
  signal?: AbortSignal;
}) => {
  const workspace = await resolveWorkspace(input.rootPath);
  const run = await runGit(
    "current_branch",
    workspace.canonicalRoot,
    input.maxBytes,
    3_000,
    input.signal,
  );
  const branchName = run.stdout.trim() || null;
  return {
    workspaceId: input.workspaceId,
    branchName,
    detached: branchName === null,
    durationMs: run.durationMs,
  };
};

export const inspectGitDiff = async (input: {
  workspaceId: string;
  rootPath: string;
  mode: Exclude<keyof typeof fixedArguments, "status" | "current_branch">;
  maxBytes: number;
  maxEntries: number;
  signal?: AbortSignal;
}) => {
  const workspace = await resolveWorkspace(input.rootPath);
  const run = await runGit(
    input.mode,
    workspace.canonicalRoot,
    input.maxBytes,
    5_000,
    input.signal,
  );
  const files = run.stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, input.maxEntries)
    .map((line) => {
      if (input.mode.endsWith("name_status")) {
        const [status, filePath] = line.split("\t");
        return { path: filePath ?? "", status };
      }
      const match = /^\s*(.+?)\s+\|\s+\d+\s+([-+]+|Bin.*)$/.exec(line);
      return match
        ? {
            path: match[1]!,
            additions: (match[2]!.match(/\+/g) ?? []).length,
            deletions: (match[2]!.match(/-/g) ?? []).length,
            binary: match[2]!.startsWith("Bin"),
          }
        : { path: line.slice(0, 1_024) };
    });
  const totalsLine = run.stdout
    .split("\n")
    .reverse()
    .find((line) => /\bfiles? changed\b/.test(line));
  const totalFilesMatch = totalsLine?.match(/(\d+)\s+files? changed/);
  const additionsMatch = totalsLine?.match(/(\d+)\s+insertions?\(\+\)/);
  const deletionsMatch = totalsLine?.match(/(\d+)\s+deletions?\(-\)/);
  return {
    workspaceId: input.workspaceId,
    mode: input.mode,
    files,
    totalFiles: totalFilesMatch ? Number(totalFilesMatch[1]) : files.length,
    ...(additionsMatch ? { additions: Number(additionsMatch[1]) } : {}),
    ...(deletionsMatch ? { deletions: Number(deletionsMatch[1]) } : {}),
    truncated: run.stdout.split("\n").filter(Boolean).length > files.length,
    durationMs: run.durationMs,
  };
};
