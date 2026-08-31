import { describe, expect, it, vi } from "vitest";

import { PostgresGovernanceStore } from "./postgres-store.js";
import type { GovernanceError } from "./errors.js";
import type { StoredApprovalRequest } from "./types.js";

describe("PostgresGovernanceStore approval transitions", () => {
  it("reports a compare-and-set race as an already-decided conflict", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const store = new PostgresGovernanceStore({ query } as never, []);
    const at = "2026-08-31T00:00:00.000Z";
    const approval: StoredApprovalRequest = {
      companyId: "00000000-0000-4000-8000-000000000005",
      id: "00000000-0000-4000-8000-000000000001",
      ownerId: "00000000-0000-4000-8000-000000000002",
      actionId: "00000000-0000-4000-8000-000000000003",
      actionDigest: "a".repeat(64),
      toolName: "security.modify",
      riskLevel: "high",
      approvalRequirement: "recent_authentication",
      status: "APPROVED",
      humanSummary: "Approve a bounded security change.",
      requestedAt: at,
      expiresAt: "2026-08-31T00:05:00.000Z",
      decidedAt: at,
      decidedBySessionId: "00000000-0000-4000-8000-000000000004",
      rejectionReason: null,
      action: {
        actionId: "00000000-0000-4000-8000-000000000003",
        toolName: "security.modify",
        arguments: {},
      },
    };

    await expect(store.updateApproval(approval)).rejects.toMatchObject({
      statusCode: 409,
      code: "APPROVAL_ALREADY_DECIDED",
    } satisfies Partial<GovernanceError>);
  });
});
