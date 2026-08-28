import { describe, expect, it, vi } from "vitest";

import { RedisService } from "../intelligence/redis-service.js";
import { VoiceCaptureLeaseService } from "./capture-lease.js";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const deviceA = "00000000-0000-4000-8000-000000000010";
const deviceB = "00000000-0000-4000-8000-000000000011";
const sessionA = "00000000-0000-4000-8000-000000000100";
const sessionB = "00000000-0000-4000-8000-000000000101";

const setup = () => {
  let clock = new Date("2026-08-21T00:00:00.000Z");
  return {
    advance: (milliseconds: number) => {
      clock = new Date(clock.getTime() + milliseconds);
    },
    leases: new VoiceCaptureLeaseService(
      new RedisService({ namespace: `voice-capture-${crypto.randomUUID()}` }),
      () => clock,
    ),
  };
};

describe("VoiceCaptureLeaseService", () => {
  it("allows one web owner and denies the overlay", async () => {
    const { leases } = setup();
    await expect(
      leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB", action: "acquire" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "WEB" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionB, clientType: "OVERLAY", action: "acquire" }),
    ).resolves.toMatchObject({ status: "DENIED", owner: "WEB" });
  });

  it("denies web when the overlay owns capture, while different overlay devices remain isolated", async () => {
    const { leases } = setup();
    await leases.act({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionA, clientType: "OVERLAY", action: "acquire" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionB, clientType: "WEB", action: "acquire" }),
    ).resolves.toMatchObject({ status: "DENIED", owner: "OVERLAY" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceB, voiceSessionId: sessionB, clientType: "OVERLAY", action: "acquire" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "OVERLAY" });
  });

  it("keeps Android capture device-bound and mutually exclusive with web capture", async () => {
    const { leases } = setup();
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionA, clientType: "ANDROID", action: "acquire" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "ANDROID" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionB, clientType: "WEB", action: "acquire" }),
    ).resolves.toMatchObject({ status: "DENIED", owner: "ANDROID" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceB, voiceSessionId: sessionB, clientType: "ANDROID", action: "acquire" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "ANDROID" });
  });

  it("is idempotent, rejects a wrong-session release, and frees the exact owner", async () => {
    const { leases } = setup();
    const input = { ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB" as const };
    const first = await leases.act({ ...input, action: "acquire" });
    const second = await leases.act({ ...input, action: "acquire" });
    expect(second).toMatchObject({ status: "ACQUIRED", expiresAt: first.expiresAt });
    await expect(
      leases.act({ ...input, voiceSessionId: sessionB, action: "release" }),
    ).resolves.toMatchObject({ status: "DENIED", owner: "WEB" });
    await expect(leases.act({ ...input, action: "release" })).resolves.toMatchObject({ status: "FREE" });
  });

  it("expires stale capture and selects exactly one concurrent winner", async () => {
    const { leases, advance } = setup();
    await leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB", action: "acquire" });
    advance(20_001);
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionB, clientType: "OVERLAY", action: "acquire" }),
    ).resolves.toMatchObject({ status: "ACQUIRED" });
    const race = await Promise.all([
      leases.act({ ownerId: ownerB, deviceId: null, voiceSessionId: sessionA, clientType: "WEB", action: "acquire" }),
      leases.act({ ownerId: ownerB, deviceId: deviceA, voiceSessionId: sessionB, clientType: "OVERLAY", action: "acquire" }),
    ]);
    expect(race.filter((result) => result.status === "ACQUIRED")).toHaveLength(1);
    expect(race.filter((result) => result.status === "DENIED")).toHaveLength(1);
  });

  it("transfers explicit capture ownership without permitting duplicate transcript owners", async () => {
    const { leases } = setup();
    await leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB", action: "acquire" });
    await expect(
      leases.act({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionB, clientType: "OVERLAY", action: "takeover" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "OVERLAY" });
    await expect(
      leases.isOwner({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB" }),
    ).resolves.toBe(false);
    await expect(
      leases.isOwner({ ownerId: ownerA, deviceId: deviceA, voiceSessionId: sessionB, clientType: "OVERLAY" }),
    ).resolves.toBe(true);
    await expect(
      leases.act({ ownerId: ownerA, deviceId: null, voiceSessionId: sessionA, clientType: "WEB", action: "takeover" }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "WEB" });
  });

  it("retries a short distributed-lock collision", async () => {
    const redis = new RedisService({
      namespace: `voice-capture-${crypto.randomUUID()}`,
      host: "127.0.0.1",
      password: "test-only",
    });
    vi.spyOn(redis, "get").mockResolvedValue(null);
    vi.spyOn(redis, "set").mockResolvedValue(undefined);
    const lock = vi
      .spyOn(redis, "withLock")
      .mockRejectedValueOnce(new Error("DISTRIBUTED_LOCK_NOT_ACQUIRED"))
      .mockImplementation(async (_resource, _ttlSeconds, work) => work());
    const leases = new VoiceCaptureLeaseService(redis);

    await expect(
      leases.act({
        ownerId: ownerA,
        deviceId: deviceA,
        voiceSessionId: sessionA,
        clientType: "OVERLAY",
        action: "acquire",
      }),
    ).resolves.toMatchObject({ status: "ACQUIRED", owner: "OVERLAY" });
    expect(lock).toHaveBeenCalledTimes(2);
  });
});
