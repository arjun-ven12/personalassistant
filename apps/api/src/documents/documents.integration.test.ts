import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { DocumentCreateSchema, type DocumentScope } from "@alexa-control/shared";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
  provisionTestDefaultCompany,
} from "../persistence/test-database.js";
import { DocumentStore } from "./store.js";
import { FileDocumentAssets } from "./assets.js";
import { DocumentService } from "./service.js";
import { documentTools } from "./tools.js";
import { PostgresMemoryStore } from "../memory/postgres-store.js";
import { MemoryIndexerService } from "../memory/service.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryWorkflowStore } from "../workflows/store.js";
import { companyScope } from "../companies/scope.js";
import { classifyDocument } from "./privacy.js";
import type { TrustedToolContext } from "../universal-tools/gateway.js";
import { UniversalToolGateway } from "../universal-tools/gateway.js";
import { InMemoryUniversalToolStore } from "../universal-tools/store.js";
import { ReviewedDelegatingAdapter } from "../universal-tools/reviewed-adapter.js";
const connection = safeTestDatabaseUrl();
describe.skipIf(!connection)("private document vault PostgreSQL authority", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedTestDatabase>>,
    service: DocumentService,
    scope: DocumentScope,
    other: DocumentScope,
    root: string,
    bytes: Buffer,
    ctx: TrustedToolContext;
  let ocrFailure = false;
  const within = <T>(work: () => T) =>
    companyScope.run({ ...scope, role: "OWNER", requestId: "document-test" }, work);
  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(connection!, "documents");
    const ownerId = crypto.randomUUID();
    await isolated.database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'fixture','{}',now(),now())",
      [ownerId, `${ownerId}@example.test`],
    );
    const companyId = await provisionTestDefaultCompany(
      isolated.database.pool,
      ownerId,
    );
    scope = { ownerId, companyId };
    // Second real company row: no supplied identity is accepted from API/model content.
    const second = crypto.randomUUID();
    await isolated.database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,record,created_at,updated_at) VALUES($1,$2,'fixture-docs','Fixture','ACTIVE','{}',now(),now())",
      [second, ownerId],
    );
    other = { ownerId, companyId: second };
    root = await mkdtemp(join(tmpdir(), "athena-documents-"));
    bytes = await sharp({
      create: { width: 600, height: 800, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const memory = new MemoryIndexerService(
      new PostgresMemoryStore(isolated.database.pool),
      new InMemoryRepositoryStore(),
      new InMemoryAgentStore(),
      new InMemoryWorkflowStore(),
      () => Promise.resolve(),
    );
    service = new DocumentService(
      new DocumentStore(isolated.database),
      new FileDocumentAssets(root),
      memory,
      () => Promise.resolve(),
    );
    const tools = documentTools(
      service,
      {
        id: "fixture",
        version: "test",
        extract: () =>
          ocrFailure
            ? Promise.reject(Error("OCR_PROVIDER_TIMEOUT"))
            : Promise.resolve({
                text: "Gradient descent improves learning. A study concept.",
                confidence: 0.95,
                language: "en",
                provider: "fixture",
                version: "fixture-not-live",
                timestamp: new Date().toISOString(),
                latencyMs: 1,
                costMinor: null,
                costCurrency: null,
              }),
      },
      [companyId],
    );
    const store = new InMemoryUniversalToolStore();
    const gateway = new UniversalToolGateway(
      store,
      (input) =>
        Promise.resolve({
          kind: "REVIEWED_EXECUTION_GRANT",
          ownerId: input.context.ownerId,
          companyId: input.context.companyId!,
          requestId: input.context.requestId,
          invocationId: input.invocationId,
          toolId: input.tool.id,
          providerId: input.provider.id,
          schemaDigest: input.tool.schemaDigest,
          providerVersion: input.provider.version,
          credentialReferenceId: null,
          requestDigest: input.requestDigest,
          approvalId: null,
          expiresAt: new Date(Date.now() + 10000).toISOString(),
        }),
      () => Promise.resolve(),
      [new ReviewedDelegatingAdapter("API", tools.handlers)],
    );
    service.gateway = gateway;
    ctx = { ...scope, agentId: null, requestId: "fixture", emergencyStopActive: false };
    const providerId = `athena.documents.${companyId}`;
    await gateway.registerReviewedProvider(ctx, {
      id: providerId,
      ...scope,
      sourceType: "API",
      displayName: "Fixture only",
      endpoint: null,
      credentialReferenceId: null,
      status: "REVIEW_REQUIRED",
      health: "HEALTHY",
      version: "1.0.0",
      updatedAt: new Date().toISOString(),
    });
    const found = await gateway.discover(ctx, providerId);
    for (const t of found) {
      await store.saveTools(ownerId, providerId, [{ ...t, enabled: true }]);
      await store.saveReview({
        ...scope,
        providerId,
        toolId: t.id,
        schemaDigest: t.schemaDigest,
        providerVersion: t.version,
        riskLevel: t.riskLevel,
        approvalRequirement: t.approvalRequirement,
        credentialReferenceId: null,
        governanceToolName: "universal.external_read",
        status: "ENABLED",
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    const provider = await store.findProvider(ownerId, providerId);
    await store.saveProvider({ ...provider!, status: "ENABLED" });
  }, 120000);
  afterAll(async () => {
    await isolated?.cleanup();
    if (root) await rm(root, { recursive: true, force: true });
  });
  const draft = () =>
    service.create(scope, {
      idempotencyKey: crypto.randomUUID(),
      sourceType: "IMPORT",
      pageCount: 1,
    });
  async function uploaded() {
    const d = await draft(),
      grant = (await service.grants(scope, d.id))[0]!;
    await service.upload(scope, d.id, 1, grant.token, "image/png", bytes);
    return d;
  }
  it("duplicate creation and upload are idempotent and source bytes preserved", async () => {
    const request = {
      idempotencyKey: crypto.randomUUID(),
      sourceType: "IMPORT",
      pageCount: 1,
    };
    const [a, b] = await Promise.all([
      service.create(scope, request),
      service.create(scope, request),
    ]);
    expect(a.id).toBe(b.id);
    const g = (await service.grants(scope, a.id))[0]!;
    await service.upload(scope, a.id, 1, g.token, "image/png", bytes);
    await service.upload(scope, a.id, 1, g.token, "image/png", bytes);
    const different = await sharp({
      create: { width: 300, height: 400, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      service.upload(scope, a.id, 1, g.token, "image/png", different),
    ).rejects.toThrow("UPLOAD_PAGE_CONFLICT");
    expect(await service.asset(scope, a.id, 1, "original")).toEqual(bytes);
    await expect(service.create(scope, { ...request, pageCount: 2 })).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
  });
  it("wrong tenant and stale upload grants deny", async () => {
    const d = await draft(),
      g = (await service.grants(scope, d.id))[0]!;
    await expect(service.require(other, d.id)).rejects.toThrow("NOT_FOUND");
    await expect(
      service.upload(scope, d.id, 1, "wrong", "image/png", bytes),
    ).rejects.toThrow("GRANT_DENIED");
    await isolated.database.pool.query(
      "UPDATE athena_document_upload_grants SET expires_at=now()-interval '1 second' WHERE document_id=$1",
      [d.id],
    );
    await expect(
      service.upload(scope, d.id, 1, g.token, "image/png", bytes),
    ).rejects.toThrow("GRANT_DENIED");
  });
  it("real pipeline through fixture Gateway persists clean assets/OCR separately; retry complete is inert", async () =>
    within(async () => {
      const d = await uploaded();
      const result = await service.process(scope, d.id, ctx);
      expect(result.errorCode).toBeNull();
      expect(result.stage).toBe("COMPLETE");
      expect(result.pages[0]?.ocr?.text).toContain("Gradient");
      expect(result.pages[0]?.original).not.toBe(result.pages[0]?.cleaned);
      expect(result.memoryStatus).toBe("SUGGESTED");
      const repeat = await service.process(scope, d.id, ctx);
      expect(repeat.attempt).toBe(result.attempt);
      await service.ingest(scope, d.id);
      const indexed = await service.require(scope, d.id);
      expect(indexed.pages[0]?.memoryIds).toHaveLength(1);
      expect(
        (await service.linkedMemories(scope, d.id)).memories[0]?.summary,
      ).toContain("Gradient");
      await expect(service.linkedMemories(other, d.id)).rejects.toThrow("SCOPE_DENIED");
      expect(
        (await service.memory.search(scope.ownerId, { q: "Gradient", limit: 10 }))
          .memories,
      ).toHaveLength(1);
      await service.exclude(scope, d.id, true, true);
      expect(
        (await service.memory.search(scope.ownerId, { q: "Gradient", limit: 10 }))
          .memories,
      ).toHaveLength(0);
      await expect(service.asset(scope, d.id, 1, "original")).rejects.toThrow(
        "NOT_FOUND",
      );
      expect((await service.require(scope, d.id, true)).stage).toBe("ARCHIVED");
    }));
  it("unavailable provider fails without losing original; restart retry succeeds", async () => {
    const d = await uploaded(),
      gateway = service.gateway;
    service.gateway = undefined;
    const result = await service.process(scope, d.id, ctx);
    expect(result.stage).toBe("FAILED");
    expect(result.pages[0]?.original).toBeTruthy();
    service.gateway = gateway;
    expect((await service.process(scope, d.id, ctx)).stage).toBe("COMPLETE");
  });
  it("sensitive text can remain in vault but never enters long-term memory", async () =>
    within(async () => {
      const d = await uploaded();
      await service.store.atomic(scope, d.id, (record) => {
        record.stage = "COMPLETE";
        record.documentType = "NOTE";
        record.pages[0]!.ocr = {
          text: "api_key = sk-fixture1234567890",
          confidence: 0.99,
          language: "en",
          provider: "fixture",
          version: "test",
          timestamp: new Date().toISOString(),
          latencyMs: 0,
          costMinor: null,
          costCurrency: null,
        };
        record.pages[0]!.ocrStatus = "COMPLETE";
      });
      expect(classifyDocument("api_key = sk-fixture1234567890").sensitive).toBe(true);
      await expect(service.ingest(scope, d.id)).rejects.toThrow("MEMORY_DENIED");
    }));
  it("page order, bounds and archived fencing survive reconstruction", async () =>
    within(async () => {
      expect(
        DocumentCreateSchema.safeParse({
          idempotencyKey: crypto.randomUUID(),
          sourceType: "IMPORT",
          pageCount: 6,
        }).success,
      ).toBe(false);
      const d = await service.create(scope, {
        idempotencyKey: crypto.randomUUID(),
        sourceType: "CAMERA",
        pageCount: 3,
      });
      expect(d.pages.map((p) => p.number)).toEqual([1, 2, 3]);
      await service.exclude(scope, d.id, true, true);
      const restarted = new DocumentStore(isolated.database);
      expect((await restarted.get(scope, d.id))?.stage).toBe("ARCHIVED");
      await expect(service.process(scope, d.id, ctx)).rejects.toThrow("ARCHIVED");
    }));
  it("OCR provider timeout preserves scans, records OCR_FAILED, and retry recovers", async () => {
    const d = await uploaded();
    ocrFailure = true;
    try {
      const failed = await service.process(scope, d.id, ctx);
      expect(failed.pages[0]?.ocrStatus).toBe("OCR_FAILED");
      expect(failed.pages[0]?.original).toBeTruthy();
      expect(failed.pages[0]?.cleaned).toBeTruthy();
    } finally {
      ocrFailure = false;
    }
    await service.reprocess(scope, d.id);
    const retry = await service.process(scope, d.id, ctx);
    expect(retry.pages[0]?.ocrStatus).toBe("COMPLETE");
  });
  it("object storage failure rolls back attachment and retains a retryable draft", async () => {
    const d = await draft(),
      grant = (await service.grants(scope, d.id))[0]!;
    const failure = vi
      .spyOn(service.assets, "put")
      .mockRejectedValueOnce(Error("STORAGE_UNAVAILABLE"));
    try {
      await expect(
        service.upload(scope, d.id, 1, grant.token, "image/png", bytes),
      ).rejects.toThrow("STORAGE_UNAVAILABLE");
      expect((await service.require(scope, d.id)).pages[0]?.original).toBeNull();
    } finally {
      failure.mockRestore();
    }
    await service.upload(scope, d.id, 1, grant.token, "image/png", bytes);
    expect((await service.require(scope, d.id)).pages[0]?.original).toBeTruthy();
  });
  it("memory failure preserves the scan, reports FAILED, and permits retry", async () =>
    within(async () => {
      const d = await uploaded();
      await service.process(scope, d.id, ctx);
      const before = await service.memory.store.listMemories(scope.ownerId, 100);
      const previousIndex = service.semanticIndex;
      service.semanticIndex = () => Promise.reject(Error("MEMORY_UNAVAILABLE"));
      try {
        await expect(service.ingest(scope, d.id)).rejects.toThrow("MEMORY_UNAVAILABLE");
        const saved = await service.require(scope, d.id);
        expect(saved.stage).toBe("COMPLETE");
        expect(saved.memoryStatus).toBe("FAILED");
        expect(saved.pages[0]?.memoryIds).toHaveLength(0);
        expect(
          await service.memory.store.listMemories(scope.ownerId, 100),
        ).toHaveLength(before.length);
      } finally {
        if (previousIndex) service.semanticIndex = previousIndex;
        else delete service.semanticIndex;
      }
      await service.ingest(scope, d.id);
      expect((await service.require(scope, d.id)).memoryStatus).toBe("INDEXED");
    }));

  it("archival during extraction fences a late completion and blocks memory writes", async () =>
    within(async () => {
      const d = await uploaded(),
        real = service.gateway!;
      const original = real.invoke.bind(real);
      const spy = vi.spyOn(real, "invoke").mockImplementation(async (context, raw) => {
        const result = await original(context, raw);
        if (
          typeof raw === "object" &&
          raw !== null &&
          "toolId" in raw &&
          String(raw.toolId).endsWith("document.ocr")
        )
          await service.exclude(scope, d.id, true, true);
        return result;
      });
      try {
        expect((await service.process(scope, d.id, ctx)).stage).toBe("ARCHIVED");
        expect(
          (await service.require(scope, d.id, true)).pages[0]?.memoryIds,
        ).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    }));
});
