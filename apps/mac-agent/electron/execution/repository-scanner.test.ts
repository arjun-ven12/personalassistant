import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { scanRepositoryMetadata } from "./repository-scanner.js";

describe("repository metadata scanner", () => {
  it("collects deterministic metadata without file contents or ignored directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "assistant-repo-index-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
    await mkdir(path.join(root, "external-research/third-party"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"scripts":{"test":"vitest"}}\n');
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    await writeFile(
      path.join(root, "src/index.ts"),
      [
        "import { helper } from './util';",
        "export class Greeter {",
        "  greet(name: string) {",
        "    return helper(name);",
        "  }",
        "}",
        "export const useGreeting = () => helper('not indexed');",
      ].join("\n"),
    );
    await writeFile(
      path.join(root, "src/util.ts"),
      "export function helper(value: string) { return value; }\n",
    );
    await writeFile(path.join(root, "src/index.test.ts"), "expect(true).toBe(true);\n");
    await writeFile(path.join(root, ".env"), "SECRET=value\n");
    await writeFile(path.join(root, "node_modules/pkg/index.js"), "ignored\n");
    await writeFile(
      path.join(root, "external-research/third-party/index.ts"),
      "export const thirdPartyResearch = true;\n",
    );

    const scan = await scanRepositoryMetadata({
      workspaceId: "workspace",
      rootPath: root,
      blockedPatterns: [".env", "external-research/"],
      maxEntries: 1_000,
    });

    expect(scan.files.map((file) => file.relativePath).sort()).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "src/index.test.ts",
      "src/index.ts",
      "src/util.ts",
    ]);
    expect(JSON.stringify(scan)).not.toContain("not indexed");
    expect(JSON.stringify(scan)).not.toContain(".env");
    expect(JSON.stringify(scan)).not.toContain("external-research");
    expect(scan.semanticIndex.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(["Greeter", "greet", "helper", "useGreeting"]),
    );
    expect(scan.semanticIndex.imports[0]).toMatchObject({
      sourceFile: "src/index.ts",
      importedModule: "./util",
      importedNames: ["helper"],
    });
    expect(scan.semanticIndex.dependencies[0]).toMatchObject({
      sourceFile: "src/index.ts",
      targetFile: "src/util.ts",
      dependencyKind: "internal",
    });
    expect(
      scan.semanticIndex.references.some((reference) => reference.name === "helper"),
    ).toBe(true);
    expect(scan.technologySummary.detected).toContain("Node.js");
    expect(scan.technologySummary.packageManagers).toContain("pnpm");
    expect(scan.statistics.classificationSummary.test).toBe(1);
    expect(scan.rootFingerprint).toHaveLength(64);
  });
});
