import { CrossDeviceCommandSchema } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { crossDeviceCommandPath } from "./crossDeviceClient.js";

const command = CrossDeviceCommandSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  sourceClientInstanceId: "33333333-3333-4333-8333-333333333333",
  sourceDeviceId: null,
  sourceClientType: "ANDROID",
  targetType: "WEB",
  targetId: "44444444-4444-4444-8444-444444444444",
  targetDisplayName: "Web",
  capability: "OPEN_APPROVAL",
  arguments: { objectId: "approval_123" },
  status: "DISPATCHED",
  failureCode: null,
  safeMessage: "Sent.",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  conversationId: null,
  executionRequestId: null,
  approvalRequestId: null,
  acknowledgedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  expiresAt: "2026-08-30T00:02:00.000Z",
});

describe("crossDeviceCommandPath", () => {
  it("builds only registered Alexa object routes", () => {
    expect(crossDeviceCommandPath(command)).toBe("/approvals?approvalId=approval_123");
    expect(crossDeviceCommandPath({ ...command, capability: "OPEN_APPLICATION" })).toBeNull();
  });
});
