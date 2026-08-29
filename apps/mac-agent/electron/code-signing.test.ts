import { describe, expect, it } from "vitest";

import { isDeveloperIdSignatureOutput } from "./code-signing.js";

describe("Mac Agent release signature detection", () => {
  it("accepts Developer ID Application authority only", () => {
    expect(
      isDeveloperIdSignatureOutput(
        "Authority=Developer ID Application: Alexa Control (TEAM123456)",
      ),
    ).toBe(true);
    expect(
      isDeveloperIdSignatureOutput("Signature=adhoc\nTeamIdentifier=not set"),
    ).toBe(false);
    expect(isDeveloperIdSignatureOutput("Authority=Apple Development: Developer")).toBe(
      false,
    );
  });
});
