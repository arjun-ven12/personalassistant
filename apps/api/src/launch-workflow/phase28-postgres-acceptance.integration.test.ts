import { LaunchPackageSchema } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companyScope } from "../companies/scope.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";
import {
  createIsolatedTestDatabase,
  provisionTestDefaultCompany,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresLaunchPackageStore } from "./store.js";

const testUrl = safeTestDatabaseUrl();
const ownerId = crypto.randomUUID();
const objectiveId = crypto.randomUUID();
const at = "2026-10-14T00:00:00.000Z";

describe.skipIf(!testUrl)("Phase 28 PostgreSQL restart and audit acceptance", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let isolatedUrl: string;
  let companyId: string;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(testUrl!, "phase28accept");
    database = isolated.database;
    cleanup = isolated.cleanup;
    isolatedUrl = isolated.connectionString;
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `phase28-${ownerId}@example.test`, { id: ownerId }, at],
    );
    companyId = await provisionTestDefaultCompany(database.pool, ownerId);
  }, 60_000);

  afterAll(async () => cleanup?.());

  const scope = <T>(work: () => Promise<T>) =>
    companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "phase28-postgres-acceptance" },
      work,
    );
  const packageRecord = () =>
    LaunchPackageSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      objectiveId,
      product: "Review-only launch acceptance",
      channels: ["LINKEDIN"],
      version: 1,
      status: "DRAFT",
      taskIds: { research: null, branding: null, marketing: null, social: null },
      research: null,
      branding: null,
      marketing: null,
      social: null,
      approvalDigest: null,
      approvedAt: null,
      createdAt: at,
      updatedAt: at,
    });

  it("migrates the isolated schema and reconstructs package and audit state through another connection", async () => {
    const status = await database.status();
    expect(status.state).toBe("current");
    expect(status.applied).toContain("0110_phase_28_launch_review_packages");
    const packageStore = new PostgresLaunchPackageStore(database.pool);
    const auditStore = new PostgresIdentityStore(database.pool);
    const record = packageRecord();
    expect(await packageStore.create(record)).toBe(true);
    const audit = await scope(() =>
      auditStore.appendAudit({
        eventType: "LAUNCH_PACKAGE_CREATED",
        userId: ownerId,
        companyId,
        ipAddress: "127.0.0.1",
        outcome: "SUCCESS",
        reason: "Isolated acceptance fixture.",
        requestId: crypto.randomUUID(),
        metadata: { packageId: record.id },
      }),
    );
    const restartedDatabase = new PostgresDatabase(isolatedUrl);
    try {
      expect((await restartedDatabase.status()).state).toBe("current");
      const reconstructed = new PostgresLaunchPackageStore(restartedDatabase.pool);
      expect(await reconstructed.find(ownerId, companyId, record.id)).toEqual(record);
      expect(await reconstructed.findVersion(ownerId, companyId, record.id, 1)).toEqual(
        record,
      );
      const audits = await scope(() =>
        new PostgresIdentityStore(restartedDatabase.pool).listAudit(ownerId, 10),
      );
      expect(
        audits.some((entry) => entry.id === audit.id && entry.companyId === companyId),
      ).toBe(true);
    } finally {
      await restartedDatabase.close();
    }
  });

  it("rolls back an interrupted package write and keeps the committed objective unique", async () => {
    const store = new PostgresLaunchPackageStore(database.pool);
    const committed = (await store.findByObjective(ownerId, companyId, objectiveId))!;
    const attempted = {
      ...committed,
      version: 2,
      status: "IN_PROGRESS" as const,
      updatedAt: "2026-10-14T00:00:01.000Z",
    };
    await expect(
      database.transaction(`phase28:${committed.id}`, async () => {
        expect(await store.update(attempted, 1)).toBe(true);
        throw new Error("SIMULATED_WORKER_FAILURE");
      }),
    ).rejects.toThrow("SIMULATED_WORKER_FAILURE");
    expect((await store.find(ownerId, companyId, committed.id))?.version).toBe(1);
    expect(
      await store.findVersion(ownerId, companyId, committed.id, 2),
    ).toBeUndefined();
    expect(await store.create(packageRecord())).toBe(false);
    expect((await store.findByObjective(ownerId, companyId, objectiveId))?.id).toBe(
      committed.id,
    );
  });
});
