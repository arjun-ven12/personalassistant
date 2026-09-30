import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BLOCKED_WORKSPACE_PATTERNS } from "@alexa-control/shared";
import { expect, it } from "vitest";
import { copyValidationSandbox } from "./validation-runner.js";

it("copies source only, excluding packaged apps, blocked paths and symlink escapes", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "validation-copy-test-"));
  let sandbox: Awaited<ReturnType<typeof copyValidationSandbox>> | undefined;
  try {
    const root = path.join(fixture, "workspace");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "app.ts"), "export const value = 1;\n");
    for (const directory of ["release/Test.app/Contents/Resources", "external-research", "private-custom", "dist-native"]) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, "payload"), "omitted");
    }
    await writeFile(path.join(root, "release/Test.app/Contents/Resources/app.asar"), "not an archive");
    await writeFile(path.join(root, ".env"), "test fixture only");
    await writeFile(path.join(fixture, "outside"), "outside workspace");
    await symlink(path.join(fixture, "outside"), path.join(root, "link"));
    sandbox = await copyValidationSandbox(root, [...BLOCKED_WORKSPACE_PATTERNS, "private-custom/"]);
    expect(await readFile(path.join(sandbox.sandboxRoot, "src/app.ts"), "utf8")).toContain("value = 1");
    for (const omitted of ["release", "dist-native", "external-research", "private-custom", ".env", "link"]) {
      await expect(access(path.join(sandbox.sandboxRoot, omitted))).rejects.toThrow();
    }
    expect(await readFile(path.join(fixture, "outside"), "utf8")).toBe("outside workspace");
  } finally {
    if (sandbox) await rm(sandbox.sandboxParent, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
  }
});
