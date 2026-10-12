import { describe, expect, it } from "vitest";
import { RegisterCrossDeviceClientRequestSchema } from "@alexa-control/shared";
import {
  crossDeviceCurrentRoute,
  webCrossDeviceCapabilities,
} from "./crossDeviceClient.js";

describe("cross-device presence on ordinary web routes", () => {
  it("accepts a Companies deep link without expanding remote navigation authority", () => {
    const currentRoute = crossDeviceCurrentRoute("/companies");
    expect(currentRoute).toBeNull();
    expect(
      RegisterCrossDeviceClientRequestSchema.safeParse({
        clientInstanceId: "9ac5fa8c-7442-4c76-a6bd-d407c9ca7478",
        clientType: "WEB",
        displayName: "Web",
        platform: "web",
        capabilities: webCrossDeviceCapabilities,
        currentRoute,
      }).success,
    ).toBe(true);
    expect(crossDeviceCurrentRoute("/engineering")).toBe("/engineering");
  });
});
