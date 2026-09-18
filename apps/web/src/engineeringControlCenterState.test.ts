import type { AllowedWorkspace } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { ApiClientError } from "./api.js";
import {
  engineeringFirstRunMessage,
  formatEngineeringLoadError,
  isEligibleEngineeringRoot,
} from "./engineeringControlCenterState.js";

const root = {
  enabled: true,
  permissions: {
    read: true,
    write: true,
    createFile: true,
    modifyFile: true,
    moveFile: false,
    deleteFile: false as const,
    runScripts: true,
  },
  gitPermissions: {
    status: true,
    diff: true,
    createBranch: true,
    commit: true,
    push: false,
  },
} satisfies Pick<AllowedWorkspace, "enabled" | "permissions" | "gitPermissions">;

describe("Engineering Control Center onboarding state", () => {
  it("preserves the complete governed development-root permission gate", () => {
    expect(isEligibleEngineeringRoot(root)).toBe(true);
    expect(isEligibleEngineeringRoot({ ...root, enabled: false })).toBe(false);
    for (const permission of [
      "write",
      "createFile",
      "modifyFile",
      "runScripts",
    ] as const)
      expect(
        isEligibleEngineeringRoot({
          ...root,
          permissions: { ...root.permissions, [permission]: false },
        }),
      ).toBe(false);
    for (const permission of ["createBranch", "commit"] as const)
      expect(
        isEligibleEngineeringRoot({
          ...root,
          gitPermissions: { ...root.gitPermissions, [permission]: false },
        }),
      ).toBe(false);
  });

  it("provides actionable first-run and ineligible-root states", () => {
    expect(
      engineeringFirstRunMessage({
        workspaceCount: 0,
        eligibleRootCount: 0,
        deliveryCount: 0,
      }),
    ).toContain("configure a governed workspace");
    expect(
      engineeringFirstRunMessage({
        workspaceCount: 2,
        eligibleRootCount: 0,
        deliveryCount: 0,
      }),
    ).toContain("missing required Engineering permissions");
    expect(
      engineeringFirstRunMessage({
        workspaceCount: 2,
        eligibleRootCount: 1,
        deliveryCount: 0,
      }),
    ).toContain("Ready for your first build");
    expect(
      engineeringFirstRunMessage({
        workspaceCount: 2,
        eligibleRootCount: 1,
        deliveryCount: 1,
      }),
    ).toBeNull();
  });

  it("includes normalized API errors but hides unknown error details", () => {
    expect(
      formatEngineeringLoadError(
        new ApiClientError(503, "API_UNAVAILABLE", "Try again shortly."),
        "Unable to load governed workspaces.",
      ),
    ).toBe("Unable to load governed workspaces. Try again shortly.");
    expect(
      formatEngineeringLoadError(
        new Error("internal stack details"),
        "Unable to load delivery state.",
      ),
    ).toBe("Unable to load delivery state.");
  });
});
