import { describe, expect, it } from "vitest";

import { parseCompanyMembershipRecord, parseCompanyRecord } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000001";
const postgresTimestamp = "2026-08-31T09:00:20.123456+00:00";

describe("Postgres company record parsing", () => {
  it("normalizes migration-created timestamp strings to the shared ISO contract", () => {
    const company = parseCompanyRecord({
      id: companyId,
      ownerId,
      slug: "default-company",
      name: "Default Company",
      status: "ACTIVE",
      timezone: null,
      defaultCurrency: null,
      createdAt: postgresTimestamp,
      updatedAt: postgresTimestamp,
    });

    expect(company.createdAt).toBe("2026-08-31T09:00:20.123Z");
    expect(company.updatedAt).toBe("2026-08-31T09:00:20.123Z");
  });

  it("normalizes company membership timestamps produced by the migration", () => {
    const membership = parseCompanyMembershipRecord({
      companyId,
      principalId: ownerId,
      principalType: "OWNER",
      role: "OWNER",
      status: "ACTIVE",
      createdAt: postgresTimestamp,
      updatedAt: postgresTimestamp,
    });

    expect(membership.createdAt).toBe("2026-08-31T09:00:20.123Z");
  });
});
