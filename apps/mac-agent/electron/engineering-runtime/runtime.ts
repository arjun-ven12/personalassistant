import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile as readFsFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  EngineeringCommandResultSchema,
  EngineeringFileReadRequestSchema,
  EngineeringFileReadResultSchema,
  EngineeringDiffResultSchema,
  EngineeringPreparedCommitSchema,
  EngineeringCommitIntegrationResultSchema,
  EngineeringCandidateMergeResultSchema,
  EngineeringDependencyOperationResultSchema,
  EngineeringPreviewResultSchema,
  EngineeringGitStatusSchema,
  EngineeringPatchSchema,
  EngineeringRelativePathSchema,
  EngineeringSearchRequestSchema,
  EngineeringSearchResultSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  type EngineeringCommandDefinition,
  type EngineeringCommandResult,
  type EngineeringDependencyOperationResult,
  type EngineeringPreviewResult,
} from "@alexa-control/shared";

const GIT = "/usr/bin/git";
const MAX_GIT_OUTPUT = 1_048_576;
const SAFE_GIT_ENV = {
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
const SAFE_COMMAND_ENV = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  HOME: "/tmp/alexa-engineering-home",
  CI: "true",
  NODE_ENV: "test",
  GIT_TERMINAL_PROMPT: "0",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};
const EXECUTABLES = {
  pnpm: "/usr/local/bin/pnpm",
  npm: "/usr/local/bin/npm",
  pytest: "/usr/local/bin/pytest",
  ruff: "/usr/local/bin/ruff",
  mypy: "/usr/local/bin/mypy",
  gradle: "/workspace/gradlew",
} as const;
const DEPENDENCY_IMAGE = "alexa-engineering-node:1";
const PREVIEW_NETWORK = "alexa-engineering-preview";
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  [
    "private-key",
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  ],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi],
  ["api-key", /\b(?:sk|pk|ghp|github_pat)[-_A-Za-z0-9]{16,}\b/g],
  ["database-password", /\b(postgres(?:ql)?|mysql|mongodb):\/\/([^:\s]+):([^@\s]+)@/gi],
  [
    "credential-assignment",
    /\b(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}/gi,
  ],
];
const IGNORED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".next",
  ".turbo",
]);
const GIT_SAFE_PATHSPECS = [
  ".",
  ":(exclude).env",
  ":(exclude,glob).env.*",
  ":(exclude,glob)**/*.pem",
  ":(exclude,glob)**/*.key",
  ":(exclude,glob)**/.ssh/**",
  ":(exclude,glob)**/.aws/**",
  ":(exclude,glob)**/.npmrc",
  ":(exclude,glob)**/.pypirc",
  ":(exclude,glob)**/credentials.json",
  ":(exclude,glob)**/service-account*.json",
  ":(exclude,glob)external-research/**",
];

export class NativeEngineeringRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NativeEngineeringRuntimeError";
  }
}

type BoundedProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
};

const runBounded = (input: {
  executable: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}): Promise<BoundedProcessResult> =>
  new Promise((resolve, reject) => {
    const started = new Date();
    const child = spawn(input.executable, input.args, {
      ...(input.cwd ? { cwd: input.cwd } : {}),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: input.env,
      windowsHide: true,
      detached: true,
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const collect = (current: Buffer, chunk: Buffer) => {
      const combined = Buffer.concat([current, chunk]);
      if (combined.length <= input.maxOutputBytes) return combined;
      truncated = true;
      return combined.subarray(combined.length - input.maxOutputBytes);
    };
    child.stdout.on("data", (chunk: Buffer) => (stdout = collect(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = collect(stderr, chunk)));
    const terminate = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, input.timeoutMs);
    const abort = () => {
      cancelled = true;
      terminate();
    };
    input.signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      const completed = new Date();
      resolve({
        exitCode,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        durationMs: completed.getTime() - started.getTime(),
        timedOut,
        cancelled,
        truncated,
      });
    });
  });

const runGit = async (
  cwd: string,
  args: string[],
  timeoutMs = 10_000,
  signal?: AbortSignal,
) => {
  const result = await runBounded({
    executable: GIT,
    args: ["-c", "color.ui=false", "-c", "core.pager=cat", ...args],
    cwd,
    env: SAFE_GIT_ENV,
    timeoutMs,
    maxOutputBytes: MAX_GIT_OUTPUT,
    ...(signal ? { signal } : {}),
  }).catch(() => {
    throw new NativeEngineeringRuntimeError(
      "GIT_ERROR",
      "The fixed Git executable could not be invoked.",
    );
  });
  if (result.timedOut)
    throw new NativeEngineeringRuntimeError(
      "COMMAND_TIMEOUT",
      "The bounded Git operation timed out.",
    );
  if (result.cancelled)
    throw new NativeEngineeringRuntimeError(
      "CANCELLED",
      "The bounded Git operation was cancelled.",
    );
  if (result.exitCode !== 0)
    throw new NativeEngineeringRuntimeError(
      "GIT_ERROR",
      "The bounded Git operation failed.",
    );
  return result.stdout;
};

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

const redact = (value: string) => {
  let output = value;
  const redactions: string[] = [];
  for (const [name, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(output)) continue;
    redactions.push(name);
    pattern.lastIndex = 0;
    output = output.replace(pattern, "[REDACTED]");
  }
  return { output, redactions };
};

const isProtected = (relativePath: string, patterns: string[]) =>
  patterns.some((pattern) => {
    const base = pattern
      .replace(/^\//, "")
      .replace(/(?:\/)?\*\*?$/, "")
      .replace(/\/$/, "");
    return relativePath === base || relativePath.startsWith(`${base}/`);
  });

const blockedWorkspacePath = (relativePath: string) => {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return BLOCKED_WORKSPACE_PATTERNS.some((pattern) => {
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

const assertNotIgnored = (relativePath: string) => {
  if (blockedWorkspacePath(relativePath))
    throw new NativeEngineeringRuntimeError(
      "PATH_OUTSIDE_REPOSITORY",
      "The path is blocked by mandatory workspace policy.",
    );
  if (relativePath.split("/").some((segment) => IGNORED_SEGMENTS.has(segment)))
    throw new NativeEngineeringRuntimeError(
      "PATH_OUTSIDE_REPOSITORY",
      "Generated and dependency directories are excluded by default.",
    );
};

const matchesExactProjectScaffold = async (
  root: string,
  files: Record<string, string>,
) => {
  const expectedFiles = new Set(Object.keys(files));
  const expectedDirectories = new Set(
    Object.keys(files)
      .map((relativePath) => path.dirname(relativePath))
      .filter((relativePath) => relativePath !== "."),
  );
  const actualFiles = new Set<string>();
  const visit = async (directory: string, prefix = ""): Promise<boolean> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(relativePath)) return false;
        if (!(await visit(path.join(directory, entry.name), relativePath))) return false;
        continue;
      }
      if (!entry.isFile() || !expectedFiles.has(relativePath)) return false;
      actualFiles.add(relativePath);
    }
    return true;
  };
  try {
    if (!(await visit(root)) || actualFiles.size !== expectedFiles.size) return false;
    for (const [relativePath, content] of Object.entries(files))
      if ((await readFsFile(path.join(root, relativePath), "utf8")) !== content)
        return false;
    return true;
  } catch {
    return false;
  }
};

export interface NetworkIsolatedEngineeringRunner {
  readonly networkIsolated: true;
  run(input: {
    cwd: string;
    command: EngineeringCommandDefinition;
    signal?: AbortSignal;
  }): Promise<EngineeringCommandResult>;
}

export interface EngineeringDependencyRunner {
  run(input: {
    cwd: string;
    packageManager: "pnpm" | "npm" | "yarn" | "pip" | "uv" | "gradle";
    operation: "INSTALL" | "ADD" | "REMOVE";
    packages: string[];
    development?: boolean;
    signal?: AbortSignal;
  }): Promise<EngineeringDependencyOperationResult>;
}

/** Dependency networking is confined to a reviewed container and lifecycle scripts are disabled. */
export class DockerEngineeringDependencyRunner implements EngineeringDependencyRunner {
  constructor(readonly dockerExecutable = "/usr/local/bin/docker") {}

  async run(input: Parameters<EngineeringDependencyRunner["run"]>[0]) {
    if (!(["pnpm", "npm"] as const).includes(input.packageManager as "pnpm" | "npm"))
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "This package manager has no reviewed dependency image.",
      );
    const before = await this.lockHash(input.cwd, input.packageManager);
    const args =
      input.packageManager === "pnpm"
        ? input.operation === "INSTALL"
          ? ["install", "--ignore-scripts", "--registry=https://registry.npmjs.org"]
          : input.operation === "ADD"
            ? [
                "add",
                ...(input.development ? ["--save-dev"] : []),
                ...input.packages,
                "--ignore-scripts",
                "--registry=https://registry.npmjs.org",
              ]
            : ["remove", ...input.packages, "--ignore-scripts"]
        : input.operation === "INSTALL"
          ? ["install", "--ignore-scripts", "--registry=https://registry.npmjs.org"]
          : input.operation === "ADD"
            ? [
                "install",
                ...(input.development ? ["--save-dev"] : ["--save"]),
                ...input.packages,
                "--ignore-scripts",
                "--registry=https://registry.npmjs.org",
              ]
            : ["uninstall", ...input.packages, "--ignore-scripts"];
    const started = Date.now();
    const executable =
      input.packageManager === "pnpm" ? EXECUTABLES.pnpm : EXECUTABLES.npm;
    const result = await runBounded({
      executable: this.dockerExecutable,
      args: [
        "run",
        "--rm",
        "--pull",
        "never",
        "--network",
        "bridge",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "256",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        `${process.getuid?.() ?? 65534}:${process.getgid?.() ?? 65534}`,
        "--workdir",
        "/workspace",
        "--mount",
        `type=bind,source=${input.cwd},target=/workspace`,
        "--env",
        "HOME=/tmp/alexa-engineering-home",
        "--env",
        "CI=true",
        "--env",
        "npm_config_userconfig=/dev/null",
        DEPENDENCY_IMAGE,
        executable,
        ...args,
      ],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: 10 * 60_000,
      maxOutputBytes: 131_072,
      ...(input.signal ? { signal: input.signal } : {}),
    }).catch(() => {
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The reviewed dependency container is unavailable.",
      );
    });
    const safeOut = redact(result.stdout);
    const safeErr = redact(result.stderr);
    return EngineeringDependencyOperationResultSchema.parse({
      packageManager: input.packageManager,
      operation: input.operation,
      packages: input.packages,
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
      stdout: safeOut.output,
      stderr: safeErr.output,
      timedOut: result.timedOut,
      lockfileChanged:
        before !== (await this.lockHash(input.cwd, input.packageManager)),
    });
  }

  private async lockHash(
    cwd: string,
    manager: "pnpm" | "npm" | "yarn" | "pip" | "uv" | "gradle",
  ) {
    const name =
      manager === "pnpm"
        ? "pnpm-lock.yaml"
        : manager === "npm"
          ? "package-lock.json"
          : "";
    if (!name) return null;
    return readFsFile(path.join(cwd, name))
      .then((value) => createHash("sha256").update(value).digest("hex"))
      .catch(() => null);
  }
}

/** Docker is invoked with fixed containment flags and never pulls images implicitly. */
export class DockerEngineeringRunner implements NetworkIsolatedEngineeringRunner {
  readonly networkIsolated = true as const;
  constructor(readonly dockerExecutable = "/usr/local/bin/docker") {}

  async run(input: {
    cwd: string;
    command: EngineeringCommandDefinition;
    signal?: AbortSignal;
  }) {
    const command = input.command;
    const containerName = `alexa-engineering-${crypto.randomUUID()}`;
    const image =
      command.executable === "gradle"
        ? "alexa-engineering-gradle:1"
        : command.executable === "pnpm" || command.executable === "npm"
          ? "alexa-engineering-node:1"
          : "alexa-engineering-python:1";
    const executable = EXECUTABLES[command.executable];
    const result = await runBounded({
      executable: this.dockerExecutable,
      args: [
        "run",
        "--rm",
        "--name",
        containerName,
        "--pull",
        "never",
        "--network",
        "none",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "256",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        `${process.getuid?.() ?? 65534}:${process.getgid?.() ?? 65534}`,
        "--workdir",
        "/workspace",
        "--mount",
        `type=bind,source=${input.cwd},target=/workspace`,
        ...Object.entries(SAFE_COMMAND_ENV).flatMap(([key, value]) => [
          "--env",
          `${key}=${value}`,
        ]),
        image,
        executable,
        ...command.args,
      ],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: command.timeoutMs,
      maxOutputBytes: command.maxOutputBytes,
      ...(input.signal ? { signal: input.signal } : {}),
    }).catch(async () => {
      await this.forceRemove(containerName);
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The network-isolated command runner is unavailable.",
      );
    });
    if (result.timedOut || result.cancelled) await this.forceRemove(containerName);
    const safeOut = redact(result.stdout);
    const safeErr = redact(result.stderr);
    return EngineeringCommandResultSchema.parse({
      commandId: command.id,
      ...result,
      stdout: safeOut.output,
      stderr: safeErr.output,
      networkIsolated: true,
    });
  }

  private async forceRemove(containerName: string) {
    await runBounded({
      executable: this.dockerExecutable,
      args: ["rm", "-f", containerName],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
    }).catch(() => undefined);
  }
}

export class NativeEngineeringRuntime {
  readonly #previews = new Map<string, EngineeringPreviewResult>();
  constructor(
    readonly worktreeRoot: string,
    readonly commandRunner?: NetworkIsolatedEngineeringRunner,
    readonly dependencyRunner?: EngineeringDependencyRunner,
    readonly dockerExecutable = "/usr/local/bin/docker",
  ) {}

  async initializeProject(input: {
    repositoryRootPath: string;
    projectSlug: string;
    template: "REACT_VITE_TYPESCRIPT" | "EMPTY_TYPESCRIPT";
    defaultBranch: string;
  }) {
    const target = path.resolve(input.repositoryRootPath);
    if (
      !path.isAbsolute(target) ||
      path.basename(target) !== input.projectSlug ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.projectSlug)
    )
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The derived project directory is invalid.",
      );
    const parent = await realpath(path.dirname(target));
    if (
      ["/", "/Users", "/System", "/Library", "/Applications", "/private"].includes(
        parent,
      ) ||
      /^\/Users\/[^/]+$/.test(parent)
    )
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The registered development root is too broad or sensitive.",
      );
    const files: Record<string, string> =
      input.template === "REACT_VITE_TYPESCRIPT"
        ? {
            "package.json": `${JSON.stringify({ name: input.projectSlug, private: true, version: "0.0.0", type: "module", scripts: { dev: "vite", build: "tsc --noEmit -p tsconfig.app.json && vite build", lint: "eslint .", typecheck: "tsc --noEmit -p tsconfig.app.json --pretty false" }, dependencies: { "@vitejs/plugin-react": "^5.0.2", vite: "^7.1.5", typescript: "^5.9.2", react: "^19.1.1", "react-dom": "^19.1.1" }, devDependencies: { "@eslint/js": "^9.35.0", "@types/react": "^19.1.12", "@types/react-dom": "^19.1.9", eslint: "^9.35.0", "eslint-plugin-react-hooks": "^5.2.0", "eslint-plugin-react-refresh": "^0.4.20", globals: "^16.3.0", "typescript-eslint": "^8.43.0" } }, null, 2)}\n`,
            "index.html":
              '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
            "src/main.tsx":
              "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './styles.css';\n\nconst App = () => <main><h1>Project ready</h1></main>;\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
            "src/styles.css":
              ":root { font-family: Inter, system-ui, sans-serif; color-scheme: dark; }\nbody { margin: 0; min-width: 320px; min-height: 100vh; }\n",
            "tsconfig.json": `${JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }, null, 2)}\n`,
            "tsconfig.app.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["src"] }, null, 2)}\n`,
            "vite.config.ts":
              "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
            "eslint.config.js":
              "import js from '@eslint/js';\nimport globals from 'globals';\nimport reactHooks from 'eslint-plugin-react-hooks';\nimport reactRefresh from 'eslint-plugin-react-refresh';\nimport tseslint from 'typescript-eslint';\nexport default tseslint.config({ ignores: ['dist'] }, { extends: [js.configs.recommended, ...tseslint.configs.recommended], files: ['**/*.{ts,tsx}'], languageOptions: { ecmaVersion: 2020, globals: globals.browser }, plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } });\n",
            ".gitignore": "node_modules\ndist\n.env\n.env.*\n!.env.example\n",
          }
        : {
            "package.json": `${JSON.stringify({ name: input.projectSlug, private: true, version: "0.0.0", type: "module", scripts: { typecheck: "tsc --noEmit", build: "tsc" }, devDependencies: { typescript: "^5.9.2" } }, null, 2)}\n`,
            "tsconfig.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist" }, include: ["src"] }, null, 2)}\n`,
            "src/index.ts": "export const ready = true;\n",
            ".gitignore": "node_modules\ndist\n.env\n.env.*\n!.env.example\n",
          };
    const existing = await lstat(target).catch(() => null);
    if (existing) {
      if (!existing.isDirectory() || !(await matchesExactProjectScaffold(target, files)))
        throw new NativeEngineeringRuntimeError(
          "INCONSISTENT_STATE",
          "The project directory already exists and is not the exact incomplete governed scaffold.",
        );
    } else {
      await mkdir(path.join(target, "src"), { recursive: true, mode: 0o700 });
      for (const [relative, content] of Object.entries(files)) {
        const destination = path.join(target, relative);
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await writeFile(destination, content, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      }
    }
    if (!this.dependencyRunner)
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "Project initialization requires the reviewed dependency runner.",
      );
    const installed = await this.dependencyRunner.run({
      cwd: target,
      packageManager: "pnpm",
      operation: "INSTALL",
      packages: [],
    });
    if (
      installed.exitCode !== 0 &&
      /cannot connect to the docker daemon|is the docker daemon running|no such image/i.test(
        installed.stderr,
      )
    )
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The reviewed dependency container is unavailable. Start Docker Desktop and retry the exact build.",
      );
    if (installed.exitCode !== 0 || installed.timedOut)
      throw new NativeEngineeringRuntimeError(
        "DEPENDENCY_INSTALL_FAILED",
        "Initial project dependencies did not install successfully.",
      );
    await runGit(target, ["init", "-b", input.defaultBranch]);
    await runGit(target, ["add", "--", "."]);
    await runGit(target, [
      "-c",
      "user.name=Alexa Engineering",
      "-c",
      "user.email=engineering@localhost",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-m",
      "Initialize governed project",
    ]);
    return this.inspectRepository({ repositoryRootPath: target });
  }

  async dependencyOperation(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    packageManager: "pnpm" | "npm" | "yarn" | "pip" | "uv" | "gradle";
    operation: "INSTALL" | "ADD" | "REMOVE";
    packages: string[];
    development?: boolean;
    signal?: AbortSignal;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    if (!this.dependencyRunner)
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The reviewed dependency runner is unavailable.",
      );
    if (["pnpm", "npm", "yarn"].includes(input.packageManager)) {
      const manifest = JSON.parse(
        await readFsFile(path.join(worktree, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      for (const spec of Object.values({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      }))
        if (
          typeof spec !== "string" ||
          !/^(?:[~^]?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?|latest|workspace:\*)$/.test(
            spec,
          )
        )
          throw new NativeEngineeringRuntimeError(
            "CAPABILITY_DENIED",
            "Dependency manifests may contain only bounded registry or local-workspace versions.",
          );
    }
    return this.dependencyRunner.run({
      cwd: worktree,
      packageManager: input.packageManager,
      operation: input.operation,
      packages: input.packages,
      ...(input.development === undefined ? {} : { development: input.development }),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  async startDevServer(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    previewId: string;
    server: {
      id: string;
      executable: "pnpm" | "npm" | "yarn" | "python" | "gradle";
      args: string[];
      portFlag: "--port" | "-p" | "--server.port" | null;
      hostFlag: "--host" | "--hostname" | null;
      healthPath: string;
      startupTimeoutMs: number;
      maxLifetimeMs: number;
    };
    preferredPort: number | null;
    portRangeStart: number;
    portRangeEnd: number;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    if (!(["pnpm", "npm"] as string[]).includes(input.server.executable))
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The development server has no reviewed preview image.",
      );
    const port = await this.availablePort(
      input.preferredPort,
      input.portRangeStart,
      input.portRangeEnd,
    );
    if (!port)
      throw new NativeEngineeringRuntimeError(
        "PORT_UNAVAILABLE",
        "No allowed local preview port is available.",
      );
    await this.ensurePreviewNetwork();
    const container = `alexa-preview-${input.previewId.replaceAll("-", "")}`;
    await this.removePreviewContainer(container);
    const executable =
      input.server.executable === "pnpm" ? EXECUTABLES.pnpm : EXECUTABLES.npm;
    const args = [
      ...input.server.args,
      ...(input.server.hostFlag ? [input.server.hostFlag, "0.0.0.0"] : []),
      ...(input.server.portFlag ? [input.server.portFlag, String(port)] : []),
    ];
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.server.maxLifetimeMs,
    ).toISOString();
    const child = spawn(
      this.dockerExecutable,
      [
        "run",
        "--rm",
        "--name",
        container,
        "--pull",
        "never",
        "--network",
        PREVIEW_NETWORK,
        "-p",
        `127.0.0.1:${port}:${port}`,
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "256",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        `${process.getuid?.() ?? 65534}:${process.getgid?.() ?? 65534}`,
        "--workdir",
        "/workspace",
        "--mount",
        `type=bind,source=${worktree},target=/workspace`,
        "--env",
        "HOME=/tmp/alexa-engineering-home",
        "--env",
        "NODE_ENV=development",
        DEPENDENCY_IMAGE,
        executable,
        ...args,
      ],
      {
        env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
        stdio: "ignore",
        detached: false,
      },
    );
    child.unref();
    const starting = EngineeringPreviewResultSchema.parse({
      previewId: input.previewId,
      serverId: input.server.id,
      state: "STARTING",
      pid: child.pid ?? null,
      port,
      url: `http://localhost:${port}`,
      healthStatus: "PENDING",
      startedAt: now.toISOString(),
      checkedAt: now.toISOString(),
      expiresAt,
      failureSummary: null,
    });
    this.#previews.set(input.previewId, starting);
    const deadline = Date.now() + input.server.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.healthy(`http://127.0.0.1:${port}${input.server.healthPath}`)) {
        const ready = EngineeringPreviewResultSchema.parse({
          ...starting,
          state: "RUNNING",
          healthStatus: "PASS",
          checkedAt: new Date().toISOString(),
        });
        this.#previews.set(input.previewId, ready);
        const timer = setTimeout(
          () => void this.removePreviewContainer(container),
          input.server.maxLifetimeMs,
        );
        timer.unref();
        return ready;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await this.removePreviewContainer(container);
    const failed = EngineeringPreviewResultSchema.parse({
      ...starting,
      state: "FAILED",
      healthStatus: "FAIL",
      checkedAt: new Date().toISOString(),
      failureSummary: "The bounded preview health check did not pass before timeout.",
    });
    this.#previews.set(input.previewId, failed);
    return failed;
  }

  async devServerStatus(input: { previewId: string }) {
    const current = this.#previews.get(input.previewId);
    if (!current)
      return EngineeringPreviewResultSchema.parse({
        previewId: input.previewId,
        serverId: "unknown",
        state: "STOPPED",
        pid: null,
        port: null,
        url: null,
        healthStatus: "FAIL",
        startedAt: null,
        checkedAt: new Date().toISOString(),
        expiresAt: null,
        failureSummary: "Preview is not active in this trusted agent process.",
      });
    if (current.state !== "RUNNING" || !current.port) return current;
    const healthy = await this.healthy(`http://127.0.0.1:${current.port}/`);
    const result = EngineeringPreviewResultSchema.parse({
      ...current,
      state: healthy ? "RUNNING" : "FAILED",
      healthStatus: healthy ? "PASS" : "FAIL",
      checkedAt: new Date().toISOString(),
      failureSummary: healthy ? null : "Preview health check failed.",
    });
    this.#previews.set(input.previewId, result);
    return result;
  }

  async stopDevServer(input: { previewId: string }) {
    const current = this.#previews.get(input.previewId);
    await this.removePreviewContainer(
      `alexa-preview-${input.previewId.replaceAll("-", "")}`,
    );
    const result = EngineeringPreviewResultSchema.parse({
      previewId: input.previewId,
      serverId: current?.serverId ?? "unknown",
      state: "STOPPED",
      pid: null,
      port: current?.port ?? null,
      url: current?.url ?? null,
      healthStatus: "FAIL",
      startedAt: current?.startedAt ?? null,
      checkedAt: new Date().toISOString(),
      expiresAt: current?.expiresAt ?? null,
      failureSummary: null,
    });
    this.#previews.set(input.previewId, result);
    return result;
  }

  async restartDevServer(
    input: Parameters<NativeEngineeringRuntime["startDevServer"]>[0],
  ) {
    await this.stopDevServer({ previewId: input.previewId });
    return this.startDevServer(input);
  }

  private async ensurePreviewNetwork() {
    const inspected = await runBounded({
      executable: this.dockerExecutable,
      args: ["network", "inspect", PREVIEW_NETWORK],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
    }).catch(() => null);
    if (inspected?.exitCode === 0) return;
    const created = await runBounded({
      executable: this.dockerExecutable,
      args: ["network", "create", "--internal", PREVIEW_NETWORK],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: 10_000,
      maxOutputBytes: 4_096,
    }).catch(() => null);
    if (created?.exitCode !== 0)
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "The internal preview network is unavailable.",
      );
  }

  private async removePreviewContainer(name: string) {
    await runBounded({
      executable: this.dockerExecutable,
      args: ["rm", "-f", name],
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty" },
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
    }).catch(() => undefined);
  }

  private async healthy(url: string) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
        redirect: "error",
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  }

  private async availablePort(preferred: number | null, start: number, end: number) {
    const ports = [
      ...new Set([
        ...(preferred ? [preferred] : []),
        ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ]),
    ];
    for (const port of ports)
      if (
        await new Promise<boolean>((resolve) => {
          const server = createServer();
          server.once("error", () => resolve(false));
          server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
        })
      )
        return port;
    return null;
  }

  async inspectRepository(input: { repositoryRootPath: string }) {
    const root = await this.resolveRepository(input.repositoryRootPath);
    const [baseCommit, branch, statusOutput, files] = await Promise.all([
      runGit(root, ["rev-parse", "HEAD"]),
      runGit(root, ["branch", "--show-current"]),
      runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
      runGit(root, ["ls-files", "-z"]),
    ]);
    const names = files.split("\0").filter(Boolean);
    const has = (name: string) => names.includes(name);
    const languages = new Set<string>();
    for (const name of names) {
      if (/\.tsx?$/.test(name)) languages.add("TypeScript");
      else if (/\.jsx?$/.test(name)) languages.add("JavaScript");
      else if (/\.py$/.test(name)) languages.add("Python");
      else if (/\.(?:kt|java)$/.test(name)) languages.add("JVM");
    }
    const packageManagers = [
      has("pnpm-lock.yaml") && "pnpm",
      has("package-lock.json") && "npm",
      has("yarn.lock") && "yarn",
      has("pyproject.toml") && "python",
      has("requirements.txt") && "pip",
      has("gradlew") && "gradle",
    ].filter((value): value is string => Boolean(value));
    const frameworks = [
      names.some((name) => name.endsWith("vite.config.ts")) && "Vite",
      names.some((name) => name.endsWith("next.config.js")) && "Next.js",
      has("gradlew") && "Gradle",
    ].filter((value): value is string => Boolean(value));
    const importantFiles = names
      .filter((name) =>
        /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|gradlew|tsconfig\.json|AGENTS\.md|README\.md)$/.test(
          name,
        ),
      )
      .slice(0, 50);
    return {
      baseCommit: baseCommit.trim(),
      branch: branch.trim(),
      dirty: statusOutput.length > 0,
      metadata: {
        languages: [...languages],
        packageManagers,
        frameworks,
        importantFiles,
      },
    };
  }

  async createWorktree(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    branchName: string;
    baseCommit: string;
  }) {
    const root = await this.resolveRepository(input.repositoryRootPath);
    const inspection = await this.inspectRepository({ repositoryRootPath: root });
    if (inspection.dirty)
      throw new NativeEngineeringRuntimeError(
        "DIRTY_REPOSITORY",
        "The source checkout is dirty; worktree creation denied without modifying it.",
      );
    if (
      !/^alexa\/[a-z0-9][a-z0-9-]{0,119}$/.test(input.branchName) ||
      !/^[0-9a-f]{40,64}$/.test(input.baseCommit)
    )
      throw new NativeEngineeringRuntimeError(
        "WORKTREE_ERROR",
        "The derived branch or base commit is invalid.",
      );
    const target = await this.derivedWorktreePath(input.worktreeLocator, false);
    if (await lstat(target).catch(() => null))
      throw new NativeEngineeringRuntimeError(
        "WORKTREE_ERROR",
        "The derived worktree already exists.",
      );
    await runGit(
      root,
      ["worktree", "add", "-b", input.branchName, target, input.baseCommit],
      30_000,
    );
  }

  async inspectWorktree(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const target = await this.derivedWorktreePath(input.worktreeLocator, false);
    if (!(await lstat(target).catch(() => null)))
      return {
        exists: false,
        baseCommit: null,
        headCommit: null,
        dirty: false,
        branch: null,
      };
    const canonical = await realpath(target);
    const [headCommit, branch, statusOutput] = await Promise.all([
      runGit(canonical, ["rev-parse", "HEAD"]),
      runGit(canonical, ["branch", "--show-current"]),
      runGit(canonical, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ]);
    return {
      exists: true,
      baseCommit: headCommit.trim(),
      headCommit: headCommit.trim(),
      dirty: statusOutput.length > 0,
      branch: branch.trim() || null,
    };
  }

  async removeWorktree(input: { repositoryRootPath: string; worktreeLocator: string }) {
    const root = await this.resolveRepository(input.repositoryRootPath);
    const target = await this.resolveWorktree(input.worktreeLocator);
    const dirty =
      (await runGit(target, ["status", "--porcelain=v1", "--untracked-files=all"]))
        .length > 0;
    if (dirty)
      throw new NativeEngineeringRuntimeError(
        "WORKTREE_ERROR",
        "Dirty worktree cleanup is denied so changes remain inspectable.",
      );
    await runGit(root, ["worktree", "remove", target], 30_000);
  }

  async search(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    query: string;
    mode: "TEXT" | "FILE_NAME";
    limit: number;
    signal?: AbortSignal;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const request = EngineeringSearchRequestSchema.parse({
      query: input.query,
      mode: input.mode,
      limit: input.limit,
    });
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const results: Array<{ path: string; line: number | null; preview: string }> = [];
    if (request.mode === "FILE_NAME") {
      const output = await runGit(
        worktree,
        ["ls-files", "-z", "--", ...GIT_SAFE_PATHSPECS],
        10_000,
        input.signal,
      );
      for (const name of output.split("\0")) {
        if (
          !name ||
          blockedWorkspacePath(name) ||
          !name.toLowerCase().includes(request.query.toLowerCase()) ||
          name.split("/").some((segment) => IGNORED_SEGMENTS.has(segment))
        )
          continue;
        results.push({ path: name, line: null, preview: name });
        if (results.length >= request.limit) break;
      }
    } else {
      const result = await runBounded({
        executable: GIT,
        args: [
          "-c",
          "color.ui=false",
          "grep",
          "-n",
          "-I",
          "-F",
          "-e",
          request.query,
          "--",
          ...GIT_SAFE_PATHSPECS,
        ],
        cwd: worktree,
        env: SAFE_GIT_ENV,
        timeoutMs: 10_000,
        maxOutputBytes: 262_144,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (![0, 1].includes(result.exitCode ?? -1))
        throw new NativeEngineeringRuntimeError(
          "GIT_ERROR",
          "Repository text search failed.",
        );
      for (const line of result.stdout.split("\n")) {
        const match = /^(.+?):(\d+):(.*)$/.exec(line);
        if (
          !match ||
          blockedWorkspacePath(match[1]!) ||
          match[1]!.split("/").some((segment) => IGNORED_SEGMENTS.has(segment))
        )
          continue;
        const redacted = redact(match[3]!);
        results.push({
          path: match[1]!,
          line: Number(match[2]),
          preview: redacted.output.slice(0, 500),
        });
        if (results.length >= request.limit) break;
      }
    }
    return results.map((item) => EngineeringSearchResultSchema.parse(item));
  }

  async readFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    startLine: number;
    endLine?: number;
    maxBytes: number;
    signal?: AbortSignal;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const request = EngineeringFileReadRequestSchema.parse({
      path: input.path,
      startLine: input.startLine,
      ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
      maxBytes: input.maxBytes,
    });
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const target = await this.resolveFile(worktree, request.path);
    input.signal?.throwIfAborted();
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 2_097_152)
        throw new NativeEngineeringRuntimeError(
          "OUTPUT_LIMIT",
          "The file is not a bounded regular source file.",
        );
      const bytes = Buffer.alloc(Math.min(info.size, request.maxBytes + 1));
      const count = await handle.read(bytes, 0, bytes.length, 0);
      const contentBytes = bytes.subarray(
        0,
        Math.min(count.bytesRead, request.maxBytes),
      );
      if (contentBytes.includes(0))
        throw new NativeEngineeringRuntimeError(
          "BINARY_FILE",
          "Binary file reads are denied.",
        );
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes);
      const allLines = decoded.split("\n");
      const selected = allLines
        .slice(request.startLine - 1, request.endLine)
        .join("\n");
      const safe = redact(selected);
      return EngineeringFileReadResultSchema.parse({
        path: request.path,
        startLine: request.startLine,
        endLine: Math.min(request.endLine ?? allLines.length, allLines.length),
        content: safe.output,
        sha256: sha256(contentBytes),
        truncated:
          count.bytesRead > request.maxBytes ||
          (request.endLine !== undefined && request.endLine < allLines.length),
        redactions: safe.redactions,
      });
    } finally {
      await handle.close();
    }
  }

  async applyPatch(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    patch: unknown;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const patch = EngineeringPatchSchema.parse(input.patch);
    this.assertProtected(patch.path, input.protectedPaths, input.protectedPathApproved);
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const target = await this.resolveFile(worktree, patch.path);
    const original = await this.readRawFile(target, 2_097_152);
    if (sha256(original) !== patch.expectedSha256)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The patch target changed after it was read.",
      );
    const lines = original.toString("utf8").split("\n");
    const hunks = [...patch.hunks].sort(
      (left, right) => right.startLine - left.startLine,
    );
    let previousStart = Number.POSITIVE_INFINITY;
    for (const hunk of hunks) {
      if (
        hunk.endLine >= previousStart ||
        hunk.startLine > lines.length + 1 ||
        hunk.endLine > lines.length
      )
        throw new NativeEngineeringRuntimeError(
          "INCONSISTENT_STATE",
          "Patch hunks overlap or exceed the current file.",
        );
      lines.splice(
        hunk.startLine - 1,
        hunk.endLine - hunk.startLine + 1,
        ...hunk.replacement.split("\n"),
      );
      previousStart = hunk.startLine;
    }
    const output = lines.join("\n");
    await this.atomicReplace(worktree, patch.path, output);
    return { path: patch.path, sha256: sha256(output) };
  }

  async createFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    content: string;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const relativePath = EngineeringRelativePathSchema.parse(input.path);
    this.assertProtected(
      relativePath,
      input.protectedPaths,
      input.protectedPathApproved,
    );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    assertNotIgnored(relativePath);
    const target = path.join(worktree, relativePath);
    if (await lstat(target).catch(() => null))
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The create target already exists.",
      );
    await this.atomicReplace(worktree, relativePath, input.content, true);
    return { path: relativePath, sha256: sha256(input.content) };
  }

  async quarantineFile(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    path: string;
    expectedSha256: string;
    protectedPaths: string[];
    protectedPathApproved: boolean;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const relativePath = EngineeringRelativePathSchema.parse(input.path);
    this.assertProtected(
      relativePath,
      input.protectedPaths,
      input.protectedPathApproved,
    );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const target = await this.resolveFile(worktree, relativePath);
    const content = await this.readRawFile(target, 2_097_152);
    if (sha256(content) !== input.expectedSha256)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The delete target changed after it was read.",
      );
    const recoveryLocator = `${input.worktreeLocator}:${crypto.randomUUID()}`;
    const recoveryRoot = path.join(
      await this.resolveWorktreeRoot(),
      ".recovery",
      input.worktreeLocator,
      recoveryLocator.split(":")[1]!,
    );
    const destination = path.join(recoveryRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await rename(target, destination);
    return { path: relativePath, recoveryLocator };
  }

  async gitStatus(input: { repositoryRootPath: string; worktreeLocator: string }) {
    await this.resolveRepository(input.repositoryRootPath);
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const [branch, output] = await Promise.all([
      runGit(worktree, ["branch", "--show-current"]),
      runGit(worktree, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        ...GIT_SAFE_PATHSPECS,
      ]),
    ]);
    const fields = output.split("\0").filter(Boolean);
    const entries: Array<{
      path: string;
      originalPath: string | null;
      kind: "MODIFIED" | "ADDED" | "DELETED" | "RENAMED" | "UNTRACKED" | "CONFLICTED";
    }> = [];
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]!;
      const code = field.slice(0, 2);
      const file = field.slice(3);
      if (code.startsWith("R") || code.endsWith("R")) {
        const originalPath = fields[++index] ?? null;
        entries.push({ path: file, originalPath, kind: "RENAMED" });
      } else {
        const kind =
          code === "??"
            ? "UNTRACKED"
            : code.includes("U")
              ? "CONFLICTED"
              : code.includes("D")
                ? "DELETED"
                : code.includes("A")
                  ? "ADDED"
                  : "MODIFIED";
        entries.push({ path: file, originalPath: null, kind });
      }
      if (entries.length >= 2_000) break;
    }
    return EngineeringGitStatusSchema.parse({
      branch: branch.trim(),
      entries,
      dirty: entries.length > 0,
      truncated: entries.length >= 2_000,
    });
  }

  async gitDiff(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    maxBytes: number;
    baseCommit?: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    if (input.baseCommit && !/^[0-9a-f]{40,64}$/.test(input.baseCommit))
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "Invalid registered integration base.",
      );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const refArgs = input.baseCommit ? [input.baseCommit, "HEAD"] : ["HEAD"];
    const maxBytes = Math.min(Math.max(input.maxBytes, 1_024), 524_288);
    const [patchResult, numstat, status] = await Promise.all([
      runBounded({
        executable: GIT,
        args: [
          "-c",
          "color.ui=false",
          "diff",
          "--no-ext-diff",
          "--binary",
          ...refArgs,
          "--",
          ...GIT_SAFE_PATHSPECS,
        ],
        cwd: worktree,
        env: SAFE_GIT_ENV,
        timeoutMs: 10_000,
        maxOutputBytes: maxBytes,
      }),
      runGit(worktree, [
        "diff",
        "--no-ext-diff",
        "--no-renames",
        "--numstat",
        ...refArgs,
        "--",
        ...GIT_SAFE_PATHSPECS,
      ]),
      this.gitStatus({
        repositoryRootPath: input.repositoryRootPath,
        worktreeLocator: input.worktreeLocator,
      }),
    ]);
    if (patchResult.exitCode !== 0)
      throw new NativeEngineeringRuntimeError("GIT_ERROR", "Git diff failed.");
    let rawPatch = patchResult.stdout;
    let truncated = patchResult.truncated;
    const files = numstat
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [additions = "0", deletions = "0", file = ""] = line.split("\t");
        return {
          path: file,
          additions: additions === "-" ? 0 : Number(additions),
          deletions: deletions === "-" ? 0 : Number(deletions),
          binary: additions === "-" || deletions === "-",
        };
      });
    for (const entry of input.baseCommit
      ? []
      : status.entries.filter((item) => item.kind === "UNTRACKED")) {
      const remaining = maxBytes - Buffer.byteLength(rawPatch);
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const target = await this.resolveFile(worktree, entry.path);
      const info = await stat(target);
      if (info.size > remaining) {
        truncated = true;
        files.push({ path: entry.path, additions: 0, deletions: 0, binary: true });
        continue;
      }
      const untracked = await runBounded({
        executable: GIT,
        args: [
          "-c",
          "color.ui=false",
          "diff",
          "--no-index",
          "--",
          "/dev/null",
          entry.path,
        ],
        cwd: worktree,
        env: SAFE_GIT_ENV,
        timeoutMs: 5_000,
        maxOutputBytes: remaining,
      });
      if (![0, 1].includes(untracked.exitCode ?? -1))
        throw new NativeEngineeringRuntimeError(
          "GIT_ERROR",
          "Untracked file diff failed.",
        );
      rawPatch += untracked.stdout;
      truncated ||= untracked.truncated;
      const content = await this.readRawFile(target, remaining);
      const text = content.toString("utf8");
      files.push({
        path: entry.path,
        additions: text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
        deletions: 0,
        binary: false,
      });
    }
    const safe = redact(rawPatch);
    return EngineeringDiffResultSchema.parse({
      patch: safe.output,
      files,
      truncated,
      redactions: safe.redactions,
    });
  }

  async prepareCommit(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    taskId: string;
    agentId: string;
    baseCommit: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    if (!/^[0-9a-f]{40,64}$/.test(input.baseCommit))
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "Invalid registered task base commit.",
      );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const status = await this.gitStatus(input);
    const files = [...new Set(status.entries.map((entry) => entry.path))];
    const currentHead = (await runGit(worktree, ["rev-parse", "HEAD"])).trim();
    if (!files.length) {
      const [parent, author, message, changed] = await Promise.all([
        runGit(worktree, ["rev-parse", "HEAD^"]),
        runGit(worktree, ["log", "-1", "--format=%an <%ae>"]),
        runGit(worktree, ["log", "-1", "--format=%B"]),
        runGit(worktree, [
          "diff",
          "--name-only",
          input.baseCommit,
          "HEAD",
          "--",
          ...GIT_SAFE_PATHSPECS,
        ]),
      ]);
      if (
        parent.trim() === input.baseCommit &&
        author.trim() === "Alexa Engineering <alexa-engineering@localhost>" &&
        message.includes(
          `Alexa-Task: ${input.taskId}\nAlexa-Agent: ${input.agentId}`,
        ) &&
        changed.trim()
      )
        return EngineeringPreparedCommitSchema.parse({
          commit: currentHead,
          files: changed.split("\n").filter(Boolean),
          redactions: [],
        });
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "The task workspace has no changes or its existing commit lacks controlled provenance.",
      );
    }
    if (currentHead !== input.baseCommit)
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "Task workspace head diverged from its registered base.",
      );
    const diff = await this.gitDiff({ ...input, maxBytes: 524_288 });
    if (diff.truncated || diff.redactions.length)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Task commit preparation failed the bounded diff or secret check.",
      );
    await runGit(worktree, ["add", "-A", "--", ...files], 20_000);
    await runGit(
      worktree,
      [
        "-c",
        "user.name=Alexa Engineering",
        "-c",
        "user.email=alexa-engineering@localhost",
        "commit",
        "--no-gpg-sign",
        "-m",
        `Alexa engineering task ${input.taskId}`,
        "-m",
        `Alexa-Task: ${input.taskId}\nAlexa-Agent: ${input.agentId}`,
      ],
      30_000,
    );
    return EngineeringPreparedCommitSchema.parse({
      commit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
      files,
      redactions: diff.redactions,
    });
  }

  async revertCommit(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    targetCommit: string;
    expectedHead: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    if (!/^[0-9a-f]{40,64}$/.test(input.targetCommit) || !/^[0-9a-f]{40,64}$/.test(input.expectedHead))
      throw new NativeEngineeringRuntimeError("GIT_ERROR", "Invalid governed revert identity.");
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const status = await this.gitStatus(input);
    if (status.dirty)
      throw new NativeEngineeringRuntimeError("DIRTY_REPOSITORY", "The isolated revert workspace must be clean.");
    const head = (await runGit(worktree, ["rev-parse", "HEAD"])).trim();
    if (head !== input.expectedHead || input.targetCommit !== input.expectedHead)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The revert target is not the current registered head; later dependent work requires owner review.",
      );
    await runGit(worktree, ["cat-file", "-e", `${input.targetCommit}^{commit}`]);
    const result = await runBounded({
      executable: GIT,
      args: ["revert", "--no-commit", input.targetCommit],
      cwd: worktree,
      env: SAFE_GIT_ENV,
      timeoutMs: 30_000,
      maxOutputBytes: MAX_GIT_OUTPUT,
    });
    if (result.exitCode !== 0) {
      await runGit(worktree, ["revert", "--abort"], 20_000).catch(() => undefined);
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The deterministic revert conflicted with current repository history.",
      );
    }
    const reverted = await this.gitStatus(input);
    if (!reverted.dirty)
      throw new NativeEngineeringRuntimeError("GIT_ERROR", "The target commit produced no reversible project change.");
    return reverted;
  }

  async integrateCommit(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    commit: string;
    sourceWorktreeLocator: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    if (!/^[0-9a-f]{40,64}$/.test(input.commit))
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "The task commit is invalid.",
      );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const sourceWorktree = await this.resolveWorktree(input.sourceWorktreeLocator);
    if ((await runGit(sourceWorktree, ["rev-parse", "HEAD"])).trim() !== input.commit)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "The task commit is not the registered source worktree head.",
      );
    const status = await this.gitStatus(input);
    if (status.dirty)
      throw new NativeEngineeringRuntimeError(
        "DIRTY_REPOSITORY",
        "The integration workspace must be clean before applying a task commit.",
      );
    await runGit(worktree, ["cat-file", "-e", `${input.commit}^{commit}`]);
    const history = await runGit(worktree, ["log", "--format=%B", "-n", "30"]);
    if (history.includes(`(cherry picked from commit ${input.commit})`))
      return EngineeringCommitIntegrationResultSchema.parse({
        integrated: true,
        commit: input.commit,
        headCommit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
        conflictPaths: [],
      });
    const show = await runBounded({
      executable: GIT,
      args: ["-c", "color.ui=false", "show", "--format=", "--binary", input.commit],
      cwd: worktree,
      env: SAFE_GIT_ENV,
      timeoutMs: 10_000,
      maxOutputBytes: 524_288,
    });
    const secretCheck = redact(show.stdout);
    if (show.exitCode !== 0 || show.truncated || secretCheck.redactions.length)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "The task commit failed bounded provenance or secret checks.",
      );
    const result = await runBounded({
      executable: GIT,
      args: ["-c", "color.ui=false", "cherry-pick", "-x", input.commit],
      cwd: worktree,
      env: SAFE_GIT_ENV,
      timeoutMs: 30_000,
      maxOutputBytes: MAX_GIT_OUTPUT,
    });
    if (result.exitCode !== 0) {
      const conflicts = (
        await runGit(worktree, ["diff", "--name-only", "--diff-filter=U"])
      )
        .split("\n")
        .filter(Boolean)
        .map((file) => EngineeringRelativePathSchema.parse(file))
        .slice(0, 500);
      const conflictHunks: Array<{ path: string; startLine: number; endLine: number }> =
        [];
      for (const file of conflicts.slice(0, 20)) {
        try {
          const target = await this.resolveFile(worktree, file);
          const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const info = await handle.stat();
            if (!info.isFile() || info.size > 131_072) continue;
            const lines = new TextDecoder("utf-8", { fatal: true })
              .decode(await handle.readFile())
              .split("\n");
            let start: number | null = null;
            for (const [index, line] of lines.entries()) {
              if (line.startsWith("<<<<<<< ")) start = index + 1;
              if (line.startsWith(">>>>>>> ") && start !== null) {
                conflictHunks.push({
                  path: file,
                  startLine: start,
                  endLine: index + 1,
                });
                start = null;
                if (conflictHunks.length >= 100) break;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {
          /* Line metadata is optional; conflict path still persists. */
        }
        if (conflictHunks.length >= 100) break;
      }
      await runGit(worktree, ["cherry-pick", "--abort"], 20_000);
      return EngineeringCommitIntegrationResultSchema.parse({
        integrated: false,
        commit: input.commit,
        headCommit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
        conflictPaths: conflicts,
        conflictHunks,
      });
    }
    return EngineeringCommitIntegrationResultSchema.parse({
      integrated: true,
      commit: input.commit,
      headCommit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
      conflictPaths: [],
    });
  }

  /** Finite, local-only fast-forward of a verified integration worktree head. */
  async mergeCandidate(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    expectedBase: string;
    candidateHead: string;
    targetBranch: string;
    leaseExpiresAt: string;
  }) {
    if (
      !Number.isFinite(Date.parse(input.leaseExpiresAt)) ||
      Date.parse(input.leaseExpiresAt) <= Date.now()
    )
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Merge lease expired before native execution.",
      );
    const repositoryRoot = await this.resolveRepository(input.repositoryRootPath);
    if (
      !/^[0-9a-f]{40,64}$/.test(input.expectedBase) ||
      !/^[0-9a-f]{40,64}$/.test(input.candidateHead) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(input.targetBranch)
    )
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "Invalid reviewed merge identity.",
      );
    const integrationWorktree = await this.resolveWorktree(input.worktreeLocator);
    const sourceHead = (
      await runGit(integrationWorktree, ["rev-parse", "HEAD"])
    ).trim();
    if (sourceHead !== input.candidateHead)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "Candidate worktree head changed.",
      );
    const branch = (
      await runGit(repositoryRoot, ["symbolic-ref", "--short", "HEAD"])
    ).trim();
    if (branch !== input.targetBranch)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Registered target branch is not checked out.",
      );
    const dirty = (
      await runGit(repositoryRoot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ])
    ).trim();
    if (dirty)
      throw new NativeEngineeringRuntimeError(
        "DIRTY_REPOSITORY",
        "Target checkout must be clean before merge.",
      );
    const currentHead = (await runGit(repositoryRoot, ["rev-parse", "HEAD"])).trim();
    if (currentHead === input.candidateHead)
      return EngineeringCandidateMergeResultSchema.parse({
        merged: true,
        alreadyMerged: true,
        headCommit: currentHead,
        targetBranch: branch,
      });
    if (currentHead !== input.expectedBase)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "Protected target branch advanced; reintegration is required.",
      );
    const ancestor = await runBounded({
      executable: GIT,
      args: ["merge-base", "--is-ancestor", input.expectedBase, input.candidateHead],
      cwd: repositoryRoot,
      env: SAFE_GIT_ENV,
      timeoutMs: 10_000,
      maxOutputBytes: 2_048,
    });
    if (ancestor.exitCode !== 0)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Candidate does not descend from the reviewed base.",
      );
    if (Date.parse(input.leaseExpiresAt) <= Date.now())
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Merge lease expired before target mutation.",
      );
    const merged = await runBounded({
      executable: GIT,
      args: [
        "-c",
        "core.hooksPath=/dev/null",
        "merge",
        "--ff-only",
        "--no-edit",
        input.candidateHead,
      ],
      cwd: repositoryRoot,
      env: SAFE_GIT_ENV,
      timeoutMs: 30_000,
      maxOutputBytes: MAX_GIT_OUTPUT,
    });
    if (merged.exitCode !== 0 || merged.truncated)
      throw new NativeEngineeringRuntimeError(
        "GIT_ERROR",
        "Fast-forward candidate merge failed.",
      );
    const resultingHead = (await runGit(repositoryRoot, ["rev-parse", "HEAD"])).trim();
    if (resultingHead !== input.candidateHead)
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "Merge did not publish the reviewed candidate head.",
      );
    return EngineeringCandidateMergeResultSchema.parse({
      merged: true,
      alreadyMerged: false,
      headCommit: resultingHead,
      targetBranch: branch,
    });
  }

  /** Resolve only two independently appended, bounded Markdown tails. */
  async resolveAdditiveDocsConflict(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    sourceWorktreeLocator: string;
    commit: string;
    path: string;
    expectedHead: string;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const file = EngineeringRelativePathSchema.parse(input.path);
    if (
      !/(^|\/)(README\.md|docs\/[^/]+\.md|[^/]+\.md)$/i.test(file) ||
      /(^|\/)(auth|authentication|authorization|tenant|billing|security|policy|permissions?|migrations?|secrets?|credentials?)(\/|\.|-)/i.test(
        file,
      ) ||
      !/^[0-9a-f]{40,64}$/.test(input.commit) ||
      !/^[0-9a-f]{40,64}$/.test(input.expectedHead)
    )
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Only bounded non-sensitive additive documentation conflicts are eligible.",
      );
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    const sourceWorktree = await this.resolveWorktree(input.sourceWorktreeLocator);
    if (
      (await runGit(worktree, ["rev-parse", "HEAD"])).trim() !== input.expectedHead ||
      (await runGit(sourceWorktree, ["rev-parse", "HEAD"])).trim() !== input.commit ||
      (await this.gitStatus(input)).dirty
    )
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "Conflict worktrees changed before resolution.",
      );
    const boundedBlob = async (revision: string) => {
      const result = await runBounded({
        executable: GIT,
        args: ["show", `${revision}:${file}`],
        cwd: worktree,
        env: SAFE_GIT_ENV,
        timeoutMs: 10_000,
        maxOutputBytes: 32_769,
      });
      if (
        result.exitCode !== 0 ||
        result.truncated ||
        result.stdout.includes("\0") ||
        Buffer.byteLength(result.stdout) > 32_768 ||
        redact(result.stdout).redactions.length
      )
        throw new NativeEngineeringRuntimeError(
          "CAPABILITY_DENIED",
          "Documentation conflict content is not bounded and safe.",
        );
      return result.stdout;
    };
    const [base, ours, theirs] = await Promise.all([
      boundedBlob(`${input.commit}^`),
      boundedBlob("HEAD"),
      boundedBlob(input.commit),
    ]);
    if (
      !base ||
      !ours.startsWith(base) ||
      !theirs.startsWith(base) ||
      !ours.endsWith("\n") ||
      !theirs.endsWith("\n")
    )
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Conflict is not independently additive against the same base.",
      );
    const oursTail = ours.slice(base.length);
    const theirsTail = theirs.slice(base.length);
    if (
      !oursTail ||
      !theirsTail ||
      /^(<<<<<<<|=======|>>>>>>>)/m.test(oursTail + theirsTail)
    )
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Additive documentation tails are ambiguous.",
      );
    const combined = base + oursTail + (oursTail === theirsTail ? "" : theirsTail);
    if (Buffer.byteLength(combined) > 65_536 || redact(combined).redactions.length)
      throw new NativeEngineeringRuntimeError(
        "CAPABILITY_DENIED",
        "Combined documentation exceeds bounded safety limits.",
      );
    const pick = await runBounded({
      executable: GIT,
      args: ["-c", "core.hooksPath=/dev/null", "cherry-pick", "-x", input.commit],
      cwd: worktree,
      env: SAFE_GIT_ENV,
      timeoutMs: 30_000,
      maxOutputBytes: MAX_GIT_OUTPUT,
    });
    if (pick.exitCode === 0)
      return EngineeringCommitIntegrationResultSchema.parse({
        integrated: true,
        commit: input.commit,
        headCommit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
        conflictPaths: [],
      });
    try {
      const conflicts = (
        await runGit(worktree, ["diff", "--name-only", "--diff-filter=U"])
      )
        .trim()
        .split("\n")
        .filter(Boolean);
      if (conflicts.length !== 1 || conflicts[0] !== file)
        throw new NativeEngineeringRuntimeError(
          "CAPABILITY_DENIED",
          "Conflict set changed during bounded resolution.",
        );
      const target = await this.resolveFile(worktree, file);
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink())
        throw new NativeEngineeringRuntimeError(
          "SYMLINK_REJECTED",
          "Documentation conflict target is not a regular file.",
        );
      await writeFile(target, combined, { encoding: "utf8", flag: "w" });
      await runGit(worktree, ["add", "--", file]);
      await runGit(worktree, ["diff", "--cached", "--check"]);
      await runGit(
        worktree,
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "core.editor=/usr/bin/true",
          "cherry-pick",
          "--continue",
        ],
        30_000,
      );
      const status = await this.gitStatus(input);
      if (status.dirty)
        throw new NativeEngineeringRuntimeError(
          "INCONSISTENT_STATE",
          "Resolved integration workspace is not clean.",
        );
      return EngineeringCommitIntegrationResultSchema.parse({
        integrated: true,
        commit: input.commit,
        headCommit: (await runGit(worktree, ["rev-parse", "HEAD"])).trim(),
        conflictPaths: [],
      });
    } catch (error) {
      await runBounded({
        executable: GIT,
        args: ["cherry-pick", "--abort"],
        cwd: worktree,
        env: SAFE_GIT_ENV,
        timeoutMs: 20_000,
        maxOutputBytes: MAX_GIT_OUTPUT,
      }).catch(() => undefined);
      throw error;
    }
  }

  async runCommand(input: {
    repositoryRootPath: string;
    worktreeLocator: string;
    command: EngineeringCommandDefinition;
    signal?: AbortSignal;
  }) {
    await this.resolveRepository(input.repositoryRootPath);
    const worktree = await this.resolveWorktree(input.worktreeLocator);
    if (!this.commandRunner?.networkIsolated)
      throw new NativeEngineeringRuntimeError(
        "COMMAND_SANDBOX_UNAVAILABLE",
        "Engineering commands require an attested network-isolated runner.",
      );
    return this.commandRunner.run({
      cwd: worktree,
      command: input.command,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  private async resolveRepository(rootPath: string) {
    if (!path.isAbsolute(rootPath) || rootPath.includes("\0"))
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The registered repository root is invalid.",
      );
    const canonical = await realpath(rootPath).catch(() => {
      throw new NativeEngineeringRuntimeError(
        "REPOSITORY_NOT_FOUND",
        "The registered repository root does not exist.",
      );
    });
    if (
      [
        "/",
        "/Users",
        "/System",
        "/Library",
        "/Applications",
        "/etc",
        "/var",
        "/private",
      ].includes(canonical) ||
      /^\/Users\/[^/]+$/.test(canonical)
    )
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The repository root is too broad or sensitive.",
      );
    if (!(await stat(canonical)).isDirectory())
      throw new NativeEngineeringRuntimeError(
        "REPOSITORY_NOT_FOUND",
        "The registered repository root is not a directory.",
      );
    await runGit(canonical, ["rev-parse", "--show-toplevel"]);
    return canonical;
  }

  private async resolveWorktreeRoot() {
    if (!path.isAbsolute(this.worktreeRoot))
      throw new NativeEngineeringRuntimeError(
        "WORKTREE_ERROR",
        "The configured worktree root must be absolute.",
      );
    await mkdir(this.worktreeRoot, { recursive: true, mode: 0o700 });
    return realpath(this.worktreeRoot);
  }

  private async derivedWorktreePath(locator: string, mustExist: boolean) {
    if (!/^ew-[0-9a-f-]{36}$/.test(locator))
      throw new NativeEngineeringRuntimeError(
        "WORKTREE_ERROR",
        "The derived worktree locator is invalid.",
      );
    const root = await this.resolveWorktreeRoot();
    const target = path.join(root, locator);
    if (mustExist && !(await lstat(target).catch(() => null)))
      throw new NativeEngineeringRuntimeError(
        "WORKSPACE_NOT_FOUND",
        "The worktree is unavailable.",
      );
    return target;
  }

  private async resolveWorktree(locator: string) {
    const root = await this.resolveWorktreeRoot();
    const target = await this.derivedWorktreePath(locator, true);
    const canonical = await realpath(target);
    const relative = path.relative(root, canonical);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The worktree escaped the configured runtime root.",
      );
    return canonical;
  }

  private async resolveFile(worktree: string, relativePath: string) {
    const parsed = EngineeringRelativePathSchema.parse(relativePath);
    assertNotIgnored(parsed);
    let current = worktree;
    for (const segment of parsed.split("/")) {
      current = path.join(current, segment);
      const info = await lstat(current).catch(() => null);
      if (!info)
        throw new NativeEngineeringRuntimeError(
          "REPOSITORY_NOT_FOUND",
          "The requested repository file does not exist.",
        );
      if (info.isSymbolicLink())
        throw new NativeEngineeringRuntimeError(
          "SYMLINK_REJECTED",
          "Repository symlink traversal is denied.",
        );
    }
    const canonical = await realpath(current);
    const relative = path.relative(worktree, canonical);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The repository path escaped its worktree.",
      );
    if (!(await stat(canonical)).isFile())
      throw new NativeEngineeringRuntimeError(
        "REPOSITORY_NOT_FOUND",
        "The repository path is not a regular file.",
      );
    return canonical;
  }

  private async readRawFile(target: string, limit: number) {
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit)
        throw new NativeEngineeringRuntimeError(
          "OUTPUT_LIMIT",
          "The file exceeds the bounded mutation limit.",
        );
      const bytes = Buffer.alloc(info.size);
      await handle.read(bytes, 0, bytes.length, 0);
      if (bytes.includes(0))
        throw new NativeEngineeringRuntimeError(
          "BINARY_FILE",
          "Binary file mutations are denied.",
        );
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return bytes;
    } finally {
      await handle.close();
    }
  }

  private async atomicReplace(
    worktree: string,
    relativePath: string,
    content: string,
    creating = false,
  ) {
    const parsed = EngineeringRelativePathSchema.parse(relativePath);
    assertNotIgnored(parsed);
    const target = path.join(worktree, parsed);
    const parent = path.dirname(target);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const canonicalParent = await realpath(parent);
    const relativeParent = path.relative(worktree, canonicalParent);
    if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent))
      throw new NativeEngineeringRuntimeError(
        "PATH_OUTSIDE_REPOSITORY",
        "The file parent escaped its worktree.",
      );
    if (creating && (await lstat(target).catch(() => null)))
      throw new NativeEngineeringRuntimeError(
        "INCONSISTENT_STATE",
        "The create target already exists.",
      );
    const temporary = path.join(parent, `.alexa-tmp-${crypto.randomUUID()}`);
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  }

  private assertProtected(relativePath: string, patterns: string[], approved: boolean) {
    if (isProtected(relativePath, patterns) && !approved)
      throw new NativeEngineeringRuntimeError(
        "PROTECTED_PATH",
        "The protected repository path requires existing governance approval.",
      );
  }
}
