import {
  CompanyDataSourceSchema,
  CompanySemanticDocumentSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresCompanyDataStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)(
  "Phase 25.4 PostgreSQL company data isolation",
  () => {
    let administration: PostgresDatabase;
    let database: PostgresDatabase;
    let store: PostgresCompanyDataStore;
    let schema: string;
    const ownerId = crypto.randomUUID();
    const nova = crypto.randomUUID();
    const atlas = crypto.randomUUID();
    const at = "2026-09-01T00:00:00.000Z";

    beforeAll(async () => {
      administration = new PostgresDatabase(connectionString!);
      schema = `phase254_${crypto.randomUUID().replaceAll("-", "")}`;
      await administration.pool.query(`CREATE SCHEMA "${schema}"`);
      const isolated = new URL(connectionString!);
      isolated.hostname = isolated.hostname.replace("-pooler.", ".");
      if (isolated.searchParams.get("sslmode") !== "disable")
        isolated.searchParams.set("sslmode", "verify-full");
      isolated.searchParams.set("options", `-c search_path=${schema}`);
      database = new PostgresDatabase(isolated.toString());
      await database.migrate();
      await database.pool.query(
        "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
        [ownerId, `phase254-${ownerId}@example.test`, { id: ownerId }, at],
      );
      for (const [id, slug, name] of [
        [nova, "nova", "Nova"],
        [atlas, "atlas", "Atlas"],
      ] as const) {
        await database.pool.query(
          "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,$3,$4,'ACTIVE','UTC','USD',$5,$6,$6)",
          [id, ownerId, slug, name, { id, ownerId, slug, name, status: "ACTIVE" }, at],
        );
      }
      store = new PostgresCompanyDataStore(database.pool);
    }, 60_000);

    afterAll(async () => {
      await database?.close();
      if (administration && schema) {
        await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        await administration.close();
      }
    });

    it("persists company-scoped catalog data and filters vector candidates before ranking", async () => {
      const source = CompanyDataSourceSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: nova,
        sourceType: "SYNTHETIC",
        provider: "synthetic",
        displayName: "Nova source",
        status: "ACTIVE",
        connectionRef: null,
        ingestionMode: "MANUAL",
        metadata: {},
        createdAt: at,
        updatedAt: at,
      });
      await store.saveSource(source);
      expect(await store.findSource(ownerId, nova, source.id)).toEqual(source);
      expect(await store.findSource(ownerId, atlas, source.id)).toBeUndefined();

      const novaDocument = CompanySemanticDocumentSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        companyId: nova,
        entityType: "DOCUMENT",
        scopeType: "COMPANY",
        scopeId: `company:${nova}`,
        sourceEntityId: "nova-plan",
        title: "Nova private growth plan",
        summary: "Nova confidential growth evidence",
        sensitivity: "CONFIDENTIAL",
        embeddingVersion: "test-v1",
        createdAt: at,
        updatedAt: at,
      });
      const atlasDocument = CompanySemanticDocumentSchema.parse({
        ...novaDocument,
        id: crypto.randomUUID(),
        companyId: atlas,
        scopeId: `company:${atlas}`,
        sourceEntityId: "atlas-plan",
        title: "Atlas plan",
        summary: "Atlas operating evidence",
      });
      const embedding = Array.from({ length: 1_536 }, (_, index) =>
        index === 0 ? 1 : 0,
      );
      await store.saveSemanticDocument(novaDocument, embedding);
      await store.saveSemanticDocument(atlasDocument, embedding);

      const atlasResults = await store.searchSemanticDocuments({
        ownerId,
        companyId: atlas,
        scopeIds: [`company:${atlas}`],
        entityTypes: [],
        query: "growth evidence",
        queryEmbedding: embedding,
        limit: 10,
      });
      expect(atlasResults.map((result) => result.document.id)).toEqual([
        atlasDocument.id,
      ]);
      expect(
        atlasResults.some((result) => result.document.id === novaDocument.id),
      ).toBe(false);
    });
  },
);
