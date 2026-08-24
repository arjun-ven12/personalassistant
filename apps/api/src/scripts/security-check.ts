import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");
const ignored = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "coverage",
  "external-research",
]);

const walk = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const pathname = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(pathname)));
    else files.push(pathname);
  }
  return files;
};

const files = await walk(root);
const failures: string[] = [];
if (process.env.CI) {
  for (const file of files) {
    const basename = path.basename(file);
    if (basename.startsWith(".env") && basename !== ".env.example") {
      failures.push(
        `Environment file must not be tracked: ${path.relative(root, file)}`,
      );
    }
  }
}

for (const file of files.filter(
  (candidate) =>
    candidate.startsWith(path.join(root, "deploy")) &&
    !candidate.toLowerCase().endsWith(".md"),
)) {
  const content = await readFile(file, "utf8");
  if (/\bfunnel\b/i.test(content)) {
    failures.push(
      `Public exposure reference in deployment artifact: ${path.relative(root, file)}`,
    );
  }
}

for (const file of files.filter(
  (candidate) => candidate.endsWith(".ts") || candidate.endsWith(".tsx"),
)) {
  const content = await readFile(file, "utf8");
  if (/shell\s*:\s*true/.test(content)) {
    failures.push(`Shell process execution is forbidden: ${path.relative(root, file)}`);
  }
}

const preload = await readFile(
  path.join(root, "apps/mac-agent/electron/preload.ts"),
  "utf8",
);
for (const forbidden of [
  "readFile:",
  "runGit:",
  "runCommand:",
  "executeTool:",
  "spawn:",
]) {
  if (preload.includes(forbidden)) {
    failures.push(`Renderer capability IPC is forbidden: ${forbidden}`);
  }
}

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}
process.stdout.write("Repository security invariants validated.\n");
