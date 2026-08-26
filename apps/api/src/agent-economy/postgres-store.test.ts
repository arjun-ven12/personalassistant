import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { PostgresAgentEconomyStore } from "./postgres-store.js";

const account = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  agentId: "native_strategy_analyst",
  availableCredits: 0,
  reservedCredits: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  reputation: 50,
  economyStatus: "DORMANT" as const,
  organizationId: "organization:workforce",
  departmentId: "department:executive",
  parentAgentId: "native_executive_lead",
  memoryScopeId: "agent:native_strategy_analyst",
  capabilityProfileId: "profile:planning:executive",
  modelPolicyId: "CHEAP_ROUTINE",
  activationPolicyId: "lazy_owner_or_task_activation_v1",
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:01.000Z",
};

describe("PostgresAgentEconomyStore", () => {
  it("uses contiguous parameters when updating an enrolled account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ record: account }] });
    const store = new PostgresAgentEconomyStore({ query } as unknown as Pool);

    await store.updateAccount(account);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    const parameters = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    expect(values).toHaveLength(10);
    expect(new Set(parameters)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });
});
