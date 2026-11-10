import { LaunchPackageSchema, type LaunchPackage } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import {
  createIsolatedTestDatabase,
  provisionTestDefaultCompany,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresLaunchPackageStore } from "./store.js";

const connectionString = safeTestDatabaseUrl();
const ownerId = crypto.randomUUID();
const objectiveId = crypto.randomUUID();
const at = "2026-10-13T00:00:00.000Z";

describe.skipIf(!connectionString)("Phase 28 PostgreSQL launch package concurrency", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let companyA: string;
  const companyB = crypto.randomUUID();

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(connectionString!, "launch28");
    database = isolated.database;
    cleanup = isolated.cleanup;
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `launch28-${ownerId}@example.test`, { id: ownerId }, at],
    );
    companyA = await provisionTestDefaultCompany(database.pool, ownerId);
    await database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'second-company','Second Company','ACTIVE','UTC','USD',$3,$4,$4)",
      [companyB, ownerId, { id: companyB, ownerId }, at],
    );
  }, 60_000);

  afterAll(async () => cleanup?.());

  const packageFor = (companyId: string): LaunchPackage =>
    LaunchPackageSchema.parse({
      id: crypto.randomUUID(), ownerId, companyId, objectiveId,
      product: "Bounded launch", channels: ["LINKEDIN"], version: 1,
      status: "DRAFT", taskIds: { research: null, branding: null, marketing: null, social: null },
      research: null, branding: null, marketing: null, social: null,
      approvalDigest: null, approvedAt: null, createdAt: at, updatedAt: at,
    });

  it("accepts one concurrent objective claim, preserves versions, and isolates companies", async () => {
    const left = new PostgresLaunchPackageStore(database.pool);
    const right = new PostgresLaunchPackageStore(database.pool);
    const first = packageFor(companyA);
    const competing = packageFor(companyA);
    const claims = await Promise.all([left.create(first), right.create(competing)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = (await right.findByObjective(ownerId, companyA, objectiveId))!;
    expect([first.id, competing.id]).toContain(winner.id);
    expect(await right.find(ownerId, companyB, winner.id)).toBeUndefined();

    const stage = { ...winner, version: 2, status: "IN_PROGRESS" as const, updatedAt: "2026-10-13T00:00:01.000Z" };
    const updates = await Promise.all([left.update(stage, 1), right.update(stage, 1)]);
    expect(updates.filter(Boolean)).toHaveLength(1);
    const reopened = new PostgresLaunchPackageStore(database.pool);
    expect(await reopened.find(ownerId, companyA, winner.id)).toMatchObject({ version: 2, status: "IN_PROGRESS" });
    expect(await reopened.findVersion(ownerId, companyA, winner.id, 1)).toMatchObject({ version: 1, status: "DRAFT" });
    expect(await reopened.findVersion(ownerId, companyA, winner.id, 2)).toMatchObject({ version: 2, status: "IN_PROGRESS" });

    const sibling = packageFor(companyB);
    expect(await right.create(sibling)).toBe(true);
    expect((await reopened.findByObjective(ownerId, companyB, objectiveId))?.id).toBe(sibling.id);
    expect(await reopened.findVersion(ownerId, companyB, winner.id, 1)).toBeUndefined();
  });

  it("rejects duplicate stage tasks inside one company while allowing the sibling company", async () => {
    const key = `launch:${crypto.randomUUID()}:research:1`;
    const insert = (companyId: string) => {
      const id = crypto.randomUUID();
      return database.pool.query(
        "INSERT INTO workforce_runtime_tasks(id,owner_id,company_id,status,root_task_id,created_at,updated_at,record) VALUES($1,$2,$3,'QUEUED',$1,$4,$4,$5)",
        [id, ownerId, companyId, at, { idempotencyKey: key }],
      );
    };
    const claims = await Promise.allSettled([insert(companyA), insert(companyA)]);
    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(1);
    await expect(insert(companyB)).resolves.toBeDefined();
  });
});
