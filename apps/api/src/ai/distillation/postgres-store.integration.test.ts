import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createIsolatedTestDatabase, provisionTestDefaultCompany, safeTestDatabaseUrl } from "../../persistence/test-database.js";
import { PostgresDistillationStore } from "./store.js";
import { AthenaDistillationService } from "./service.js";
import { fixtureBase, fixtureExport, fixtureRequest } from "./fixtures.js";
const connection = safeTestDatabaseUrl();
describe.skipIf(!connection)("Phase 28.6 isolated PostgreSQL authority and migration integrity", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedTestDatabase>>, store: PostgresDistillationStore;
  let context: { ownerId: string; companyId: string; requestId: string; ipAddress: string };
  let service: AthenaDistillationService;
  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(connection!, "distillation");
    const ownerId = crypto.randomUUID();
    await isolated.database.pool.query("INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'synthetic-fixture','{}',now(),now())", [ownerId, `fixture-${ownerId}@example.test`]);
    const companyId = await provisionTestDefaultCompany(isolated.database.pool, ownerId);
    context = { ownerId, companyId, requestId: "postgres-fixture", ipAddress: "127.0.0.1" };
    store = new PostgresDistillationStore(isolated.database.pool, isolated.database.transaction);
    const data = fixtureExport(context);
    service = new AthenaDistillationService(store, { exportVerified: () => Promise.resolve(data) }, () => Promise.resolve(), () => Promise.resolve(false), [fixtureBase]);
  }, 120000);
  afterAll(async () => { if (isolated) await isolated.cleanup(); });
  it("fresh migration history is content-verified and repeated deployment is idempotent", async () => {
    expect((await isolated.database.status()).state).toBe("current");
    await isolated.database.migrate();
    expect((await isolated.database.status()).state).toBe("current");
  });
  it("concurrent retries share an immutable scoped run and stale writes fail", async () => {
    const [a, b] = await Promise.all([service.prepare(context, fixtureRequest), service.prepare(context, fixtureRequest)]);
    expect(a.id).toBe(b.id);
    expect(await store.get({ ...context, companyId: crypto.randomUUID() }, a.id)).toBeUndefined();
    const restarted = new PostgresDistillationStore(isolated.database.pool, isolated.database.transaction);
    expect((await restarted.get(context, a.id))?.manifestDigest).toBe(a.manifestDigest);
    const next = { ...a, version: a.version + 1 };
    await store.atomic(context, () => store.replace(next, a.version));
    await expect(store.atomic(context, () => store.replace(next, a.version))).rejects.toThrow("CONFLICT");
  });
  it("database constraints reject missing/null/mismatched dataset and model identity", async () => {
    for (const record of [{}, { ownerId: null }, { ownerId: crypto.randomUUID() }]) {
      await expect(isolated.database.pool.query("INSERT INTO athena_coder_controls(owner_id,record) VALUES($1,$2)", [context.ownerId, record])).rejects.toMatchObject({ code: "23514" });
      await expect(isolated.database.pool.query("INSERT INTO engineering_dataset_records(owner_id,company_id,kind,record_key,record) VALUES($1,$2,'SNAPSHOT','fixture',$3)", [context.ownerId, context.companyId, record])).rejects.toMatchObject({ code: "23514" });
    }
    await expect(isolated.database.pool.query("INSERT INTO athena_distillation_runs(owner_id,company_id,id,idempotency_key,version,created_at,record) VALUES($1,$2,$3,'bad',0,now(),'{}')", [context.ownerId, context.companyId, crypto.randomUUID()])).rejects.toMatchObject({ code: "23514" });
  });
  it("unknown or corrupt migration digests deny deployment and cannot be reapproved silently", async () => {
    const rows = await isolated.database.pool.query<{ version: string; content_sha256: string }>("SELECT version,content_sha256 FROM schema_migrations ORDER BY version LIMIT 1");
    const original = rows.rows[0]!;
    await isolated.database.pool.query("UPDATE schema_migrations SET content_sha256=$2 WHERE version=$1", [original.version, "f".repeat(64)]);
    expect((await isolated.database.status()).state).toBe("unknown");
    await expect(isolated.database.migrate()).rejects.toThrow("DIGEST_UNKNOWN_OR_MISMATCH");
    const files = await isolated.database.migrationFiles();
    const migrations = await Promise.all(files.map(async file => ({ version: file.version, digest: createHash("sha256").update(await readFile(file.path)).digest("hex") })));
    await expect(isolated.database.recordReviewedHistory({ acknowledgement: "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY", migrations })).rejects.toThrow("CANNOT_BE_REWRITTEN");
    await isolated.database.pool.query("UPDATE schema_migrations SET content_sha256=$2 WHERE version=$1", [original.version, original.content_sha256]);
    await isolated.database.pool.query("UPDATE schema_migrations SET version='9999_unreviewed_fixture' WHERE version=$1", [original.version]);
    expect((await isolated.database.status()).issues).toContain("UNEXPECTED_APPLIED_VERSION");
    await expect(isolated.database.migrate()).rejects.toThrow("LINEAGE_DENIED");
    await isolated.database.pool.query("UPDATE schema_migrations SET version=$1 WHERE version='9999_unreviewed_fixture'", [original.version]);
    expect((await isolated.database.status()).state).toBe("current");
  });
  it("legacy null history requires explicit exact operator review before recovery", async () => {
    await isolated.database.pool.query("UPDATE schema_migrations SET content_sha256=NULL");
    expect((await isolated.database.status()).issues).toContain("REVIEWED_HISTORY_REQUIRED");
    await expect(isolated.database.migrate()).rejects.toThrow("DIGEST_UNKNOWN_OR_MISMATCH");
    const migrations = await Promise.all((await isolated.database.migrationFiles()).map(async file => ({ version: file.version, digest: createHash("sha256").update(await readFile(file.path)).digest("hex") })));
    await expect(isolated.database.recordReviewedHistory({ acknowledgement: "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY", migrations: migrations.slice(1) })).rejects.toThrow("LINEAGE_MISMATCH");
    await isolated.database.recordReviewedHistory({ acknowledgement: "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY", migrations });
    expect((await isolated.database.status()).state).toBe("current");
  });
});
