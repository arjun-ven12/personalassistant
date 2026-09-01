import { describe, expect, it } from "vitest";

import { portfolioCompanyState } from "./portfolio-state.js";

describe("portfolio company summary state", () => {
  it("does not present unknown evidence as stable", () => {
    expect(
      portfolioCompanyState([
        { state: "HEALTHY" },
        { state: "UNKNOWN" },
        { state: "HEALTHY" },
      ]),
    ).toEqual({ label: "INSUFFICIENT DATA", tone: "UNKNOWN" });
  });

  it("preserves critical and warning precedence", () => {
    expect(portfolioCompanyState([{ state: "UNKNOWN" }, { state: "WARNING" }])).toEqual(
      { label: "ATTENTION", tone: "WARNING" },
    );
    expect(
      portfolioCompanyState([{ state: "WARNING" }, { state: "CRITICAL" }]),
    ).toEqual({ label: "CRITICAL", tone: "CRITICAL" });
  });

  it("reports stable only when all evidence dimensions are healthy", () => {
    expect(portfolioCompanyState([{ state: "HEALTHY" }, { state: "HEALTHY" }])).toEqual(
      { label: "STABLE", tone: "HEALTHY" },
    );
  });
});
