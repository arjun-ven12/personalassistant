import type { Pool } from "pg";

import { PostgresDatabase } from "./database.js";

/** Refuse integration tests unless the target is explicitly isolated for tests. */
export const safeTestDatabaseUrl = () => {
  if (!process.env.TEST_DATABASE_URL) {
    try {
      process.loadEnvFile?.(
        process.cwd().endsWith("/apps/api") ? ".env" : "apps/api/.env",
      );
    } catch {
      // An absent local env file leaves integration tests skipped.
    }
  }
  const value = process.env.TEST_DATABASE_URL;
  if (!value) return undefined;
  const test = new URL(value);
  const configured = process.env.DATABASE_URL;
  if (configured && new URL(configured).toString() === test.toString())
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  const databaseName = decodeURIComponent(test.pathname).replace(/^\//, "");
  const clearlyNamed = /(^|[_-])(test|testing|ci)([_-]|$)/i.test(databaseName);
  const separatelyHosted = configured
    ? new URL(configured).host !== test.host
    : false;
  if (!clearlyNamed && !separatelyHosted)
    throw new Error("Refusing database integration tests: use a test-named database or a distinct test host.");
  return value;
};

/** Direct SQL fixtures bypass registration, so provision its company explicitly. */
export const provisionTestDefaultCompany = async (pool: Pool, ownerId: string) => {
  const existing = await pool.query<{ default_company_id: string | null }>(
    "SELECT default_company_id FROM owners WHERE id=$1",
    [ownerId],
  );
  if (!existing.rows[0]) throw new Error("Test owner must exist before provisioning its company.");
  if (existing.rows[0].default_company_id) return existing.rows[0].default_company_id;
  const companyId = crypto.randomUUID();
  const at = new Date().toISOString();
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at)
     VALUES($1,$2,'default-company','Default Company','ACTIVE','UTC','USD',$3,$4,$4)
     ON CONFLICT(owner_id,slug) DO UPDATE SET updated_at=companies.updated_at
     RETURNING id`,
    [companyId, ownerId, { id: companyId, ownerId, slug: "default-company", name: "Default Company", status: "ACTIVE", timezone: "UTC", defaultCurrency: "USD", createdAt: at, updatedAt: at }, at],
  );
  const resolvedCompanyId = inserted.rows[0]!.id;
  await pool.query(
    `INSERT INTO company_memberships(company_id,principal_id,principal_type,role,status,record,created_at,updated_at)
     VALUES($1,$2,'OWNER','OWNER','ACTIVE',$3,$4,$4)
     ON CONFLICT(company_id,principal_id) DO NOTHING`,
    [resolvedCompanyId, ownerId, { companyId: resolvedCompanyId, principalId: ownerId, principalType: "OWNER", role: "OWNER", status: "ACTIVE", createdAt: at, updatedAt: at }, at],
  );
  await pool.query("UPDATE owners SET default_company_id=$2 WHERE id=$1", [ownerId, resolvedCompanyId]);
  return resolvedCompanyId;
};

export const createIsolatedTestDatabase = async (connectionString: string, prefix: string) => {
  if (!/^[a-z][a-z0-9_]{1,24}$/.test(prefix)) throw new Error("Invalid test schema prefix.");
  const administration = new PostgresDatabase(connectionString, { connectionTimeoutMillis: 60_000 });
  const schema = `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  await administration.pool.query(`CREATE SCHEMA "${schema}"`);
  const isolated = new URL(connectionString);
  isolated.hostname = isolated.hostname.replace("-pooler.", ".");
  if (isolated.searchParams.get("sslmode") !== "disable") isolated.searchParams.set("sslmode", "verify-full");
  isolated.searchParams.set("options", `-c search_path=${schema}`);
  const database = new PostgresDatabase(isolated.toString(), { connectionTimeoutMillis: 60_000 });
  try {
    await database.migrate();
  } catch (error) {
    await database.close();
    await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await administration.close();
    throw error;
  }
  return {
    database,
    cleanup: async () => {
      await database.close();
      await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await administration.close();
    },
  };
};
