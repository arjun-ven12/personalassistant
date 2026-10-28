import type { Pool, PoolClient } from "pg";

// Reader and Athena share the existing pool and DATABASE_URL. Reader queries
// explicitly qualify their tables, so no connection-wide search_path changes.
export type Db = Pool;

export async function transaction<T>(
  pool: Db,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
