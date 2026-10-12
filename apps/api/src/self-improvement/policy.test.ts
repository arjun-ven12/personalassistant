import { isSelfImprovementAuthorityPath } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { classifySelfImprovement, escalateSelfImprovementPaths, needsSelfImprovementClarification, recognizeSelfImprovementRequest } from "./policy.js";

describe("self-improvement policy", () => {
  it("recognizes Athena-targeted owner changes without treating general software requests as self-improvement", () => {
    expect(recognizeSelfImprovementRequest("Athena, improve your Engineering dashboard.")).toBe(true);
    expect(recognizeSelfImprovementRequest("Fix this bug in your Android app.")).toBe(true);
    expect(recognizeSelfImprovementRequest("Build a customer dashboard for Acme.")).toBe(false);
    expect(needsSelfImprovementClarification("Athena, improve yourself.")).toBe(true);
    expect(needsSelfImprovementClarification("Make your Engineering dashboard cards compact.")).toBe(false);
  });

  it("routes routine UI through FAST and authority changes through FULL", () => {
    expect(classifySelfImprovement("Make your dashboard cards compact", [], [])).toMatchObject({ riskLevel: "LOW", engineeringMode: "FAST" });
    expect(classifySelfImprovement("Improve your backend workflow", [], [])).toMatchObject({ riskLevel: "MEDIUM", engineeringMode: "FAST" });
    expect(classifySelfImprovement("Remove approval requirements for tool actions", [], [])).toMatchObject({ riskLevel: "HIGH", engineeringMode: "FULL", requiresOwnerApproval: true });
    expect(classifySelfImprovement("Update apps/api/src/agents/os-service.ts for a bug", [], []))
      .toMatchObject({ riskLevel: "HIGH", engineeringMode: "FULL", targetAreas: ["apps/api/src/agents/os-service.ts"] });
  });

  it("escalates actual protected and authority paths even when initial text appeared low risk", () => {
    const low = classifySelfImprovement("Make dashboard cards compact", [], ["apps/api/src/auth/**"]);
    for (const path of [
      "apps/api/src/agents/os-service.ts", "apps/api/src/ai/router/service.ts",
      "apps/api/src/companies/scope.ts", "packages/config/src/index.ts",
      "apps/api/src/app.ts", "apps/api/src/engineering-integration/service.ts",
      "apps/mac-agent/electron/execution/dispatcher.ts", "apps/api/src/auth/login.ts",
    ]) {
      expect(isSelfImprovementAuthorityPath(path), path).toBe(true);
      expect(escalateSelfImprovementPaths(low, [path], [])).toMatchObject({ riskLevel: "HIGH", engineeringMode: "FULL", requiresOwnerApproval: true });
    }
    expect(escalateSelfImprovementPaths(low, ["apps/api/src/auth/custom.ts"], ["apps/api/src/auth/**"]).riskLevel).toBe("HIGH");
    expect(escalateSelfImprovementPaths(low, ["apps/web/src/components/Card.tsx"], []).riskLevel).toBe("LOW");
  });
});
