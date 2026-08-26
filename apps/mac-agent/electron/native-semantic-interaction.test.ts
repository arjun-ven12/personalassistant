import { describe, expect, it } from "vitest";

import { NativeSemanticBridgeResultSchema } from "./native-semantic-interaction.js";

describe("NativeSemanticBridgeResultSchema", () => {
  it("preserves a target failure when Swift omits its nil semantic ID", () => {
    expect(
      NativeSemanticBridgeResultSchema.parse({
        status: "TARGET_NOT_FOUND",
        matchedCount: 0,
      }),
    ).toEqual({
      status: "TARGET_NOT_FOUND",
      semanticId: null,
      matchedCount: 0,
    });
  });
});
