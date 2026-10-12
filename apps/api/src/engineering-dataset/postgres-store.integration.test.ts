import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { PostgresEngineeringDatasetStore } from "./store.js";
import { datasetHash } from "./service.js";
import { PostgresAthenaCoderControlStore } from "../ai/athena-coder/postgres-control-store.js";
const url = safeTestDatabaseUrl();
describe.skipIf(!url)("dataset PostgreSQL scope and immutable snapshots", () => {
  let db: PostgresDatabase,
    cleanup: () => Promise<void>,
    store: PostgresEngineeringDatasetStore;
  beforeAll(async () => {
    const fixture = await createIsolatedTestDatabase(url!, "engineering285");
    db = fixture.database;
    cleanup = fixture.cleanup;
    store = new PostgresEngineeringDatasetStore(db.pool);
  });
  afterAll(async () => {
    await cleanup();
  });
  it("concurrent retries preserve one original frozen identity with scoped reads", async () => {
    const ownerId = crypto.randomUUID(),
      companyId = crypto.randomUUID();
    const value = {
      kind: "SNAPSHOT" as const,
      ownerId,
      companyId,
      key: "dataset-v1",
      schemaVersion: "1" as const,
      members: [],
      contentHash: datasetHash([]),
      createdAt: new Date().toISOString(),
      evidence: "EMPTY" as const,
    };
    await Promise.all(Array.from({ length: 8 }, () => store.save(value)));
    expect(await store.list(ownerId, companyId, "SNAPSHOT")).toEqual([value]);
    expect(
      await store.get(ownerId, crypto.randomUUID(), "SNAPSHOT", value.key),
    ).toBeUndefined();
    expect(
      await store.save({
        ...value,
        createdAt: new Date(Date.now() + 1000).toISOString(),
      }),
    ).toEqual(value);
  });
  it("durable owner controls cannot cross owner boundaries", async () => {
    const controls = new PostgresAthenaCoderControlStore(db.pool),
      ownerId = crypto.randomUUID();
    await controls.put({
      ownerId,
      enabled: false,
      selectedModelId: null,
      allowedCategories: [],
      updatedAt: null,
    });
    expect(await controls.get(ownerId)).toMatchObject({ enabled: false });
    expect(await controls.get(crypto.randomUUID())).toBeUndefined();
  });
});
