import { describe, expect, it } from "vitest";
import { bestSourcedCompanyRecords, independentSourceHosts, requiredIndependentSources } from "./objectives.js";

describe("objective source qualification", () => {
  it("requires distinct retrieved HTTPS hosts for a two-source objective", () => {
    expect(requiredIndependentSources("two independent HTTPS source URLs")).toBe(2);
    expect(independentSourceHosts(["https://example.test/a", "https://www.example.test/b", "http://other.test/c"])).toBe(1);
    expect(independentSourceHosts(["https://example.test/a", "https://other.test/b"])).toBe(2);
  });

  it("retains the best evidenced record when a company appears in several research tasks", () => {
    const records = bestSourcedCompanyRecords([
      { companyName: "Example AI", sourceUrls: ["https://example.test/about", "https://other.test/profile"] },
      { companyName: " example ai ", sourceUrls: ["https://example.test/about"] },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]?.sourceUrls).toHaveLength(2);
  });
});
