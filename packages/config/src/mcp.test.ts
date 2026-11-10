import { describe, expect, it } from "vitest";
import { ApiEnvironmentSchema } from "./index.js";

describe("local MCP fixture configuration", () => {
  it("defaults disabled and permits explicit test/development enablement", () => {
    expect(ApiEnvironmentSchema.parse({}).MCP_LOCAL_FIXTURE_ENABLED).toBe(false);
    expect(
      ApiEnvironmentSchema.parse({
        NODE_ENV: "test",
        MCP_LOCAL_FIXTURE_ENABLED: "true",
      }).MCP_LOCAL_FIXTURE_ENABLED,
    ).toBe(true);
  });
  it("rejects production enablement independently of other production constraints", () => {
    const result = ApiEnvironmentSchema.safeParse({
      NODE_ENV: "production",
      MCP_LOCAL_FIXTURE_ENABLED: "true",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === "MCP_LOCAL_FIXTURE_ENABLED",
        ),
      ).toBe(true);
  });
});
