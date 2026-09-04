import { describe, expect, it } from "vitest";

import { retainQueryAcrossCompanySwitch } from "./companyQueryCache.js";

describe("company switch query isolation", () => {
  it("retains only identity and the freshly replaced company list", () => {
    expect(retainQueryAcrossCompanySwitch(["auth-session"])).toBe(true);
    expect(retainQueryAcrossCompanySwitch(["companies"])).toBe(true);
  });

  it.each([
    ["company-management", "nova"],
    ["company-data", "nova"],
    ["owner-portfolio"],
    ["cross-company-services"],
    ["objectives"],
    ["agents"],
    ["memory"],
  ])("evicts company-scoped cache key %j", (...queryKey) => {
    expect(retainQueryAcrossCompanySwitch(queryKey)).toBe(false);
  });
});
