import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

export type UnitOfWork = <T>(key: string, work: () => Promise<T>) => Promise<T>;

/** Shared stores keep their existing SQL; only explicitly enclosed operations
 * join this transaction. Detached work must never reuse a released connection. */
export function transactionalPool(raw: Pool) {
  const context = new AsyncLocalStorage<{ client: PoolClient; active: boolean; key: string }>();
  const pool = new Proxy(raw, {
    get(target, property) {
      if (property === "query") {
        const transaction = context.getStore();
        if (transaction && !transaction.active) throw new Error("TRANSACTION_CLOSED");
        const connection = transaction?.client ?? target;
        return connection.query.bind(connection);
      }
      if (property === "connect" && context.getStore())
        throw new Error("NESTED_CONNECTION_NOT_ALLOWED");
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? (value.bind(target) as unknown) : value;
    },
  });
  const run: UnitOfWork = async (key, work) => {
    const parent = context.getStore();
    if (parent) {
      if (!parent.active || parent.key !== key) throw new Error("TRANSACTION_SCOPE_MISMATCH");
      return work();
    }
    const client = await raw.connect();
    const transaction = { client, active: true, key };
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
      const result = await context.run(transaction, work);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      transaction.active = false;
      client.release();
    }
  };
  return { pool, run };
}
