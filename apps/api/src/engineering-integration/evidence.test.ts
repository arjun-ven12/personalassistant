import { describe, expect, it } from "vitest";
import {
  EngineeringValidationReportSchema,
  type EngineeringChangeMapEntry,
} from "@alexa-control/shared";

import { checkGeneratedContracts, classifyValidationRegressions } from "./evidence.js";

const report = (failures: Array<{ file: string | null; testName: string | null; message: string }>) =>
  EngineeringValidationReportSchema.parse({
    id: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    status: failures.length ? "FAIL" : "PASS",
    steps: [{
      commandId: "test",
      kind: "TEST",
      status: failures.length ? "FAIL" : "PASS",
      result: null,
      failures,
    }],
    durationMs: 1,
    createdAt: new Date().toISOString(),
  });

describe("conservative integration evidence", () => {
  it("separates existing failures, new regressions, resolved failures and unknown prose", () => {
    const baseline = report([
      { file: "src/old.test.ts", testName: "old", message: "timing 1" },
      { file: "src/gone.test.ts", testName: "gone", message: "failure" },
    ]);
    const integrated = report([
      { file: "src/old.test.ts", testName: "old", message: "timing 2" },
      { file: "src/new.test.ts", testName: "new", message: "failure" },
      { file: null, testName: null, message: "unstructured output" },
    ]);
    expect(classifyValidationRegressions(baseline, integrated).map((value) => value.classification))
      .toEqual(["PRE_EXISTING", "NEW_REGRESSION", "UNKNOWN", "RESOLVED"]);
    expect(classifyValidationRegressions(undefined, integrated).every((value) => value.classification === "UNKNOWN")).toBe(true);
  });

  it("flags only explicit schema/generated-client metadata mismatches", () => {
    const taskId = crypto.randomUUID();
    const source: EngineeringChangeMapEntry = {
      path: "api/openapi.yaml",
      taskIds: [taskId],
      kinds: ["MODIFIED"],
      overlap: "NONE",
      protectedPath: false,
      generated: false,
    };
    const binding = [{ sourcePath: "api/openapi.yaml", generatedPathPrefix: "src/generated" }];
    expect(checkGeneratedContracts([source], binding)[0]?.kind)
      .toBe("GENERATED_CLIENT_MISMATCH");
    expect(checkGeneratedContracts([source, { ...source, path: "src/generated/client.ts", generated: true }], binding))
      .toEqual([]);
    expect(checkGeneratedContracts([source], [])).toEqual([]);
  });
});
