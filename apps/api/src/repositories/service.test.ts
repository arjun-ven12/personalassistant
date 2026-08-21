import { describe, expect, it } from "vitest";

import { BLOCKED_WORKSPACE_PATTERNS } from "@alexa-control/shared";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { RegistryService } from "../governance/registry-service.js";
import { InMemoryRepositoryStore } from "./store.js";
import { RepositoryService } from "./service.js";

const setup = async () => {
  const ownerId = crypto.randomUUID();
  const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
  const registry = new RegistryService(governance);
  await registry.createWorkspace(ownerId, {
    id: "project",
    displayName: "Project",
    rootPath: "/Users/test/project",
    enabled: true,
    permissions: {
      read: true,
      write: false,
      createFile: false,
      modifyFile: false,
      moveFile: false,
      deleteFile: false,
      runScripts: false,
    },
    blockedPatterns: [...BLOCKED_WORKSPACE_PATTERNS],
    allowedScripts: [],
    gitPermissions: {
      status: true,
      diff: false,
      createBranch: false,
      commit: false,
      push: false,
    },
  });
  const store = new InMemoryRepositoryStore();
  const service = new RepositoryService(
    store,
    registry,
    {
      create: () =>
        Promise.resolve({
          id: crypto.randomUUID(),
          deviceId: crypto.randomUUID(),
        }),
    } as never,
    () => Promise.resolve(),
  );
  return { ownerId, service, store };
};

describe("RepositoryService", () => {
  it("publishes immutable metadata generations and searches active inventory", async () => {
    const { ownerId, service, store } = await setup();
    const repository = await service.ensureRepository(ownerId, "project");
    const executionRequestId = crypto.randomUUID();
    store.createJob({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      ownerId,
      workspaceId: "project",
      status: "RUNNING",
      reason: "manual",
      executionRequestId,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
    });
    const symbolId = "c".repeat(64);
    const referenceId = "d".repeat(64);
    const nodeId = "e".repeat(64);
    const routeNodeId = "f".repeat(64);

    await service.publishExecutionResult({
      ownerId,
      executionRequestId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      result: {
        schemaVersion: "1",
        workspaceId: "project",
        rootFingerprint: "a".repeat(64),
        scannedAt: new Date().toISOString(),
        ignoreVersion: "phase-4.1-default-v1",
        files: [
          {
            schemaVersion: "1",
            workspaceId: "project",
            relativePath: "src/index.ts",
            parentDirectory: "src",
            fileName: "index.ts",
            extension: "ts",
            language: "TypeScript",
            sizeBytes: 42,
            modifiedAt: new Date().toISOString(),
            classification: "source",
            metadataFingerprint: "b".repeat(64),
          },
        ],
        directories: [
          {
            schemaVersion: "1",
            workspaceId: "project",
            relativePath: "",
            parentDirectory: null,
            name: ".",
            fileCount: 0,
            directoryCount: 1,
            totalBytes: 0,
            languageSummary: {},
          },
        ],
        statistics: {
          fileCount: 1,
          directoryCount: 1,
          totalBytes: 42,
          largestFiles: [{ relativePath: "src/index.ts", sizeBytes: 42 }],
          extensionStats: { ts: 1 },
          languageSummary: { TypeScript: 1 },
          classificationSummary: {
            source: 1,
            test: 0,
            configuration: 0,
            documentation: 0,
            asset: 0,
            generated: 0,
            build_output: 0,
            unknown: 0,
          },
        },
        technologySummary: {
          detected: ["Node.js"],
          packageManagers: ["pnpm"],
          frameworks: [],
          databases: [],
          languages: ["TypeScript"],
        },
        semanticIndex: {
          symbols: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              symbolId,
              name: "handler",
              kind: "function",
              parentSymbolId: null,
              language: "TypeScript",
              relativePath: "src/index.ts",
              line: 1,
              column: 1,
              visibility: "public",
              exported: true,
            },
          ],
          imports: [],
          exports: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              sourceFile: "src/index.ts",
              exportedName: "handler",
              localName: "handler",
              line: 1,
              column: 1,
            },
          ],
          dependencies: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              sourceFile: "src/index.ts",
              targetModule: "./service",
              targetFile: null,
              dependencyKind: "unknown",
            },
          ],
          references: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              referenceId,
              name: "handler",
              kind: "call",
              sourceSymbolId: null,
              targetSymbolId: symbolId,
              location: {
                relativePath: "src/index.ts",
                line: 2,
                column: 3,
              },
            },
          ],
          relations: [],
          apiRoutes: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              relativePath: "src/index.ts",
              httpMethod: "GET",
              routePath: "/api/example",
              handlerName: "handler",
              authRequired: true,
              line: 1,
              column: 1,
            },
          ],
          databaseModels: [],
          architectureNodes: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              nodeId,
              kind: "api_layer",
              label: "src/index.ts",
              relativePath: "src/index.ts",
            },
            {
              schemaVersion: "1",
              workspaceId: "project",
              nodeId: routeNodeId,
              kind: "route",
              label: "GET /api/example",
              relativePath: "src/index.ts",
            },
          ],
          architectureEdges: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              sourceNodeId: nodeId,
              targetNodeId: routeNodeId,
              relation: "exposes",
            },
          ],
          insights: [
            {
              schemaVersion: "1",
              workspaceId: "project",
              insightType: "architecture_hotspots",
              title: "Architecture hotspots",
              severity: "info",
              data: { files: [] },
            },
          ],
        },
        truncated: false,
      },
    });

    const detail = await service.get(ownerId, repository.id);
    expect(detail.repository.indexStatus).toBe("INDEXED");
    expect(detail.activeGeneration?.statistics.fileCount).toBe(1);
    const search = await service.search(ownerId, repository.id, { q: "index" });
    expect(search.results[0]).toMatchObject({
      type: "file",
      relativePath: "src/index.ts",
    });
    const semantic = await service.semanticSearch(ownerId, repository.id, {
      q: "handler",
    });
    expect(semantic.symbols[0]?.symbolId).toBe(symbolId);
    const definition = await service.definition(ownerId, repository.id, {
      name: "handler",
    });
    expect(definition.symbol?.relativePath).toBe("src/index.ts");
    const references = await service.references(ownerId, repository.id, {
      name: "handler",
    });
    expect(references.references[0]?.referenceId).toBe(referenceId);
    const apiRoutes = await service.apiDiscovery(ownerId, repository.id);
    expect(apiRoutes.routes[0]).toMatchObject({
      httpMethod: "GET",
      routePath: "/api/example",
    });
    const dependencies = await service.dependencyGraph(ownerId, repository.id);
    expect(dependencies.dependencies[0]?.targetModule).toBe("./service");
    const engineering = await service.engineeringQuestion({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { question: "How does handler work?" },
    });
    expect(engineering.insufficientEvidence).toBe(false);
    expect(engineering.evidence.some((entry) => entry.kind === "symbol")).toBe(true);
    expect(engineering.answer).toContain("generation");
    const impact = await service.impactAnalysis({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { change: "Change handler API" },
    });
    expect(impact.affectedFiles).toContain("src/index.ts");
    expect(impact.apiImpact[0]?.routePath).toBe("/api/example");
    const plan = await service.implementationPlan({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { goal: "Add OAuth" },
    });
    expect(plan.implementationOrder.length).toBeGreaterThan(0);
    const review = await service.codeReview({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { focus: "all" },
    });
    expect(review.summary).toContain("metadata");
    const docs = await service.documentation({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { docType: "architecture_overview" },
    });
    expect(docs.body).toContain("source-code snippets");
  });

  it("does not hallucinate when a reasoning question has no indexed evidence", async () => {
    const { ownerId, service } = await setup();
    const repository = await service.ensureRepository(ownerId, "project");
    const response = await service.engineeringQuestion({
      ownerId,
      sessionId: crypto.randomUUID(),
      repositoryId: repository.id,
      body: { question: "Where is the quantum cache?" },
    });

    expect(response.insufficientEvidence).toBe(true);
    expect(response.confidence).toBe(0);
    expect(response.answer).toContain("not have enough indexed repository evidence");
  });
});
