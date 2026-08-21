import { describe, expect, it } from "vitest";

import { parseNativeActiveContextLine } from "./native-active-context.js";

describe("native active context contract", () => {
  it("accepts bounded read-only desktop metadata", () => {
    expect(
      parseNativeActiveContextLine(
        JSON.stringify({
          application: {
            name: "Finder",
            bundleIdentifier: "com.apple.finder",
            processIdentifier: 42,
          },
          window: { title: "Downloads" },
          document: null,
          selection: { text: "report.pdf", semanticType: "AXCell", secure: false },
          accessibilityTrusted: true,
          capturedAt: new Date().toISOString(),
        }),
      ),
    ).toMatchObject({
      application: { bundleIdentifier: "com.apple.finder" },
      selection: { text: "report.pdf" },
    });
  });

  it("rejects arbitrary native operations and oversized selection data", () => {
    const base = {
      application: {
        name: "Terminal",
        bundleIdentifier: "com.apple.Terminal",
        processIdentifier: 42,
      },
      window: { title: "personalassistant" },
      document: null,
      selection: null,
      accessibilityTrusted: true,
      capturedAt: new Date().toISOString(),
    };
    expect(
      parseNativeActiveContextLine(
        JSON.stringify({ ...base, shell: "cat ~/.ssh/id_rsa" }),
      ),
    ).toBeNull();
    expect(
      parseNativeActiveContextLine(
        JSON.stringify({
          ...base,
          selection: { text: "x".repeat(2_001), semanticType: "text", secure: false },
        }),
      ),
    ).toBeNull();
  });
});
