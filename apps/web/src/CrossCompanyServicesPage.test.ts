import { describe, expect, it } from "vitest";

import { serviceReadiness } from "./crossCompanyServicesState.js";

const source = "10000000-0000-4000-8000-000000000001";
const destination = "10000000-0000-4000-8000-000000000002";
const draft = {
  sourceCompanyId: source,
  destinationCompanyId: destination,
  requestedOutcome: "Review benchmark assumptions",
  serviceType: "company.artifact.report",
  sharingScope: "SUMMARY_ONLY" as const,
  capabilities: "company.artifact.report",
  sharedReferences: "",
  budgetCredits: 10,
  deadline: "",
  confidentiality: "INTERNAL" as const,
};
const companies = [{ id: source, status: "ACTIVE" }, { id: destination, status: "ACTIVE" }];
const policy = (companyId: string, peer: string) => ({
  companyId,
  status: "ACTIVE",
  allowedDestinationCompanyIds: [peer],
  allowedServiceTypes: ["company.artifact.report"],
  allowedSharingScopes: ["SUMMARY_ONLY"],
  allowedCapabilities: ["company.artifact.report"],
  maxBudgetCredits: 100,
  approvalThresholdCredits: 25,
});

describe("cross-company service readiness", () => {
  it("requires bilateral policy before enabling submission", () => {
    const result = serviceReadiness(draft, companies, [policy(source, destination)]);
    expect(result.blockers).toContain("Destination collaboration policy is missing.");
  });

  it("reports ready only when both policies allow the bounded contract", () => {
    const result = serviceReadiness(draft, companies, [policy(source, destination), policy(destination, source)]);
    expect(result).toEqual({ blockers: [], executionBlockers: [], approvalRequired: false });
  });

  it("surfaces scheduler and reviewed-adapter readiness separately from policy", () => {
    const result = serviceReadiness(draft, companies, [policy(source, destination), policy(destination, source)], { scheduler: "NOT_ENABLED", activityCapabilities: [], externalTransferCompanyIds: [source, destination] });
    expect(result.blockers).toEqual([]);
    expect(result.executionBlockers).toEqual(expect.arrayContaining([
      expect.stringContaining("INTEGRATION_NOT_READY"),
      expect.stringContaining("CAPABILITY_NOT_READY"),
    ]));
  });

  it("blocks submission until both company data policies allow governed transfer", () => {
    const result = serviceReadiness(draft, companies, [policy(source, destination), policy(destination, source)], { scheduler: "CENTRALIZED_ENABLED", activityCapabilities: ["company.artifact.report"], externalTransferCompanyIds: [source] });
    expect(result.blockers).toContain("Destination company data policy does not allow external transfer.");
  });

  it("surfaces budget and capability blockers before the request reaches the API", () => {
    const result = serviceReadiness({ ...draft, budgetCredits: 101, capabilities: "unregistered.tool" }, companies, [policy(source, destination), policy(destination, source)]);
    expect(result.blockers).toContain("Source policy budget limit is too low.");
    expect(result.blockers).toContain("Destination policy does not allow every requested capability.");
  });
});
