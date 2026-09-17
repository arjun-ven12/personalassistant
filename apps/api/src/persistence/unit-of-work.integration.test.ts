import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "./test-database.js";
import type { PostgresDatabase } from "./database.js";

const url = safeTestDatabaseUrl();
describe.skipIf(!url)("PostgreSQL cross-store unit of work", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ database, cleanup } = await createIsolatedTestDatabase(url!, "uow"));
    await database.pool.query("CREATE TABLE closure_fixture (id text PRIMARY KEY, value integer NOT NULL)");
  }, 60_000);
  afterAll(async () => cleanup?.());

  it("rolls back all writes on an audit-like failure, then permits retry", async () => {
    await expect(database.transaction("portfolio:fixture", async () => {
      await database.pool.query("INSERT INTO closure_fixture VALUES ('objective', 1)");
      await database.pool.query("INSERT INTO closure_fixture VALUES ('rollup', 1)");
      throw new Error("AUDIT_UNAVAILABLE");
    })).rejects.toThrow("AUDIT_UNAVAILABLE");
    expect((await database.pool.query("SELECT * FROM closure_fixture")).rowCount).toBe(0);
    await database.transaction("portfolio:fixture", async () => {
      await database.pool.query("INSERT INTO closure_fixture VALUES ('objective', 1), ('rollup', 1)");
    });
    expect((await database.pool.query("SELECT * FROM closure_fixture")).rowCount).toBe(2);
  });

  it("serializes competing read-modify-write operations and rejects nested independent connections", async () => {
    await Promise.all(Array.from({ length: 8 }, () => database.transaction("portfolio:fixture", async () => {
      const current = await database.pool.query<{ value: number }>("SELECT value FROM closure_fixture WHERE id='rollup'");
      await database.pool.query("UPDATE closure_fixture SET value=$1 WHERE id='rollup'", [current.rows[0]!.value + 1]);
      expect(() => database.pool.connect()).toThrow("NESTED_CONNECTION_NOT_ALLOWED");
    })));
    expect((await database.pool.query<{ value: number }>("SELECT value FROM closure_fixture WHERE id='rollup'")).rows[0]!.value).toBe(9);
  });
});
