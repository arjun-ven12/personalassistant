import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PostgresExecutionStore } from "./postgres-store.js";

describe("PostgresExecutionStore", () => {
  it("uses one PostgreSQL parameter type when cancelling a timed-out execution", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const store = new PostgresExecutionStore({ query } as unknown as Pool);

    await store.cancel("request-id", "owner-id", "2026-09-25T00:00:00.000Z");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("completed_at=$3::text::timestamptz"),
      ["request-id", "owner-id", "2026-09-25T00:00:00.000Z", ["PENDING", "CLAIMED", "RUNNING"]],
    );
  });
});
