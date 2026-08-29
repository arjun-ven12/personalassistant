import { ExecutivePushPayloadSchema, RegisteredDeviceSchema } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { InMemoryIdentityStore } from "../identity/store.js";
import type { StoredDevice } from "../identity/types.js";
import type { PushProvider } from "./provider.js";
import { ExecutiveNotificationService } from "./service.js";
import { InMemoryNotificationStore } from "./store.js";

const OWNER = "00000000-0000-4000-8000-000000000001";
const DEVICE = "00000000-0000-4000-8000-000000000002";

const trustedAndroid = (trustStatus: "TRUSTED" | "REVOKED" = "TRUSTED"): StoredDevice => ({
  ...RegisteredDeviceSchema.parse({
    id: DEVICE,
    deviceName: "Galaxy",
    deviceType: "ANDROID",
    trustStatus,
    publicKey: { kty: "OKP", crv: "Ed25519", x: "A".repeat(43), ext: true, key_ops: ["verify"] },
    fingerprint: `SHA256:${"A".repeat(43)}`,
    pairedAt: new Date().toISOString(),
    lastSeen: null,
    revokedAt: trustStatus === "REVOKED" ? new Date().toISOString() : null,
    ownerId: OWNER,
    createdAt: new Date().toISOString(),
    capabilities: [],
    metadata: {},
  }),
  pairingRequestTokenHash: "token-hash",
});

const setup = (limit = 30) => {
  const identities = new InMemoryIdentityStore();
  identities.createDevice(trustedAndroid());
  const store = new InMemoryNotificationStore();
  const send = vi.fn<PushProvider["send"]>().mockResolvedValue({
    accepted: true,
    messageId: "projects/test/messages/1",
    reasonCode: "FCM_ACCEPTED",
    invalidateToken: false,
  });
  const service = new ExecutiveNotificationService(
    store,
    identities,
    { send },
    vi.fn(),
    () => new Date("2026-08-29T00:00:00.000Z"),
    60 * 60_000,
    limit,
  );
  return { identities, store, service, send };
};

const event = (stateVersion = "PENDING:1") => ({
  ownerId: OWNER,
  eventId: `event:${stateVersion}`,
  category: "APPROVAL_REQUIRED" as const,
  severity: "HIGH" as const,
  objectKind: "APPROVAL" as const,
  objectId: "00000000-0000-4000-8000-000000000003",
  stateVersion,
  title: "Alexa approval required",
});

describe("Phase 24.5 executive notifications", () => {
  it("rotates one trusted Android device token without retaining the stale token", async () => {
    const { service, store } = setup();
    await service.register({ ownerId: OWNER, deviceId: DEVICE, token: "a".repeat(40), appVersion: "1", requestId: "r1", ipAddress: "127.0.0.1" });
    await service.register({ ownerId: OWNER, deviceId: DEVICE, token: "b".repeat(40), appVersion: "2", requestId: "r2", ipAddress: "127.0.0.1" });

    expect(store.findSubscription(DEVICE)).toMatchObject({ token: "b".repeat(40), appVersion: "2", enabled: true });
  });

  it("rejects push registration after device revocation", async () => {
    const { service, identities } = setup();
    identities.updateDevice(trustedAndroid("REVOKED"));

    await expect(service.register({ ownerId: OWNER, deviceId: DEVICE, token: "a".repeat(40), appVersion: "1", requestId: "r", ipAddress: "127.0.0.1" })).rejects.toMatchObject({ code: "TRUSTED_ANDROID_DEVICE_REQUIRED", statusCode: 403 });
  });

  it("deduplicates identical state and rate-limits distinct non-critical pushes", async () => {
    const { service, send } = setup(1);
    await service.register({ ownerId: OWNER, deviceId: DEVICE, token: "a".repeat(40), appVersion: "1", requestId: "r", ipAddress: "127.0.0.1" });
    await service.dispatch(event());
    await service.dispatch(event());
    await service.dispatch(event("PENDING:2"));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("honors owner preferences while keeping security alerts mandatory", async () => {
    const { service, send } = setup();
    await service.register({ ownerId: OWNER, deviceId: DEVICE, token: "a".repeat(40), appVersion: "1", requestId: "r", ipAddress: "127.0.0.1" });
    const preferences = await service.updatePreferences({ ownerId: OWNER, deviceId: DEVICE, patch: { approvals: false, securityAlerts: false as never }, requestId: "prefs", ipAddress: "127.0.0.1" });
    await service.dispatch(event());

    expect(preferences.preferences.securityAlerts).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts only minimal non-authoritative push payload fields", () => {
    const parsed = ExecutivePushPayloadSchema.parse({ type: "OBJECTIVE_AT_RISK", objectKind: "OBJECTIVE", objectId: "objective-id", eventId: "event-id", severity: "HIGH", title: "Objective at risk" });
    expect(parsed).not.toHaveProperty("ownerId");
    expect(() => ExecutivePushPayloadSchema.parse({ ...parsed, approved: true })).toThrow();
  });
});
