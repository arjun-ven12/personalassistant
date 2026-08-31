import { describe, expect, it, vi } from "vitest";

import { InMemoryExecutionStore, type ExecutionStore } from "../execution/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import { CrossDeviceService, parseCrossDeviceUtterance } from "./service.js";
import { InMemoryCrossDeviceStore } from "./store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const androidDeviceId = "22222222-2222-4222-8222-222222222222";
const androidClientId = "33333333-3333-4333-8333-333333333333";
const webClientId = "44444444-4444-4444-8444-444444444444";

const createService = () => {
  let current = new Date("2026-08-30T00:00:00.000Z");
  const service = new CrossDeviceService(
    new InMemoryCrossDeviceStore(),
    new InMemoryIdentityStore(),
    { dashboard: vi.fn() } as unknown as NativeProviderRuntime,
    new InMemoryExecutionStore(),
    vi.fn(),
    () => current,
  );
  return {
    service,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
};

const registerAndroid = (service: CrossDeviceService) =>
  service.registerClient({
    ownerId,
    sessionId: androidDeviceId,
    trustedDeviceId: androidDeviceId,
    requestId: crypto.randomUUID(),
    ipAddress: "127.0.0.1",
    body: {
      clientInstanceId: androidClientId,
      clientType: "ANDROID",
      displayName: "Owner phone",
      platform: "Android",
      capabilities: ["SHOW_SCREEN", "OPEN_APPROVAL"],
      currentRoute: null,
    },
  });

const registerWeb = (service: CrossDeviceService, id = webClientId, displayName = "Office Web") =>
  service.registerClient({
    ownerId,
    sessionId: `session-${id}`,
    requestId: crypto.randomUUID(),
    ipAddress: "127.0.0.1",
    body: {
      clientInstanceId: id,
      clientType: "WEB",
      displayName,
      platform: "macOS",
      capabilities: ["NAVIGATE_TO_ROUTE", "OPEN_APPROVAL"],
      currentRoute: "/",
    },
  });

const route = (service: CrossDeviceService, idempotencyKey = crypto.randomUUID()) =>
  service.routeUtterance({
    ownerId,
    sessionId: androidDeviceId,
    sourceDeviceId: androidDeviceId,
    requestId: crypto.randomUUID(),
    ipAddress: "127.0.0.1",
    networkState: "PRIVATE_NETWORK",
    body: {
      utterance: "Open approvals on web",
      clientInstanceId: androidClientId,
      clientType: "ANDROID",
      conversationId: null,
      currentRoute: null,
      idempotencyKey,
    },
  });

describe("CrossDeviceService", () => {
  it("rebinds a legacy Android device lease to its authenticated session", async () => {
    const { service } = createService();
    await registerAndroid(service);

    const rebound = await service.registerClient({
      ownerId,
      sessionId: "55555555-5555-4555-8555-555555555555",
      trustedDeviceId: androidDeviceId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        clientInstanceId: androidClientId,
        clientType: "ANDROID",
        displayName: "Owner phone",
        platform: "Android",
        capabilities: ["SHOW_SCREEN", "OPEN_APPROVAL"],
        currentRoute: null,
      },
    });

    expect(rebound.sessionId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("routes Android to one online Web client and separates ACK from result", async () => {
    const { service } = createService();
    await registerAndroid(service);
    await registerWeb(service);

    const routed = await route(service);
    expect(routed.command?.status).toBe("DISPATCHED");
    expect(routed.command?.targetId).toBe(webClientId);

    const polled = await service.poll({
      ownerId,
      sessionId: `session-${webClientId}`,
      body: { clientInstanceId: webClientId, currentRoute: "/", limit: 5 },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(polled.commands).toHaveLength(1);

    const acknowledged = await service.receipt({
      ownerId,
      sessionId: `session-${webClientId}`,
      body: {
        clientInstanceId: webClientId,
        commandId: routed.command!.id,
        status: "ACKNOWLEDGED",
        failureCode: null,
        safeMessage: "Web acknowledged.",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(acknowledged.status).toBe("ACKNOWLEDGED");
    expect(acknowledged.completedAt).toBeNull();

    const completed = await service.receipt({
      ownerId,
      sessionId: `session-${webClientId}`,
      body: {
        clientInstanceId: webClientId,
        commandId: routed.command!.id,
        status: "SUCCEEDED",
        failureCode: null,
        safeMessage: "Web opened approvals.",
      },
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
    });
    expect(completed.status).toBe("SUCCEEDED");
    expect(completed.completedAt).not.toBeNull();
  });

  it("returns the same command for an idempotent retry", async () => {
    const { service } = createService();
    await registerAndroid(service);
    await registerWeb(service);
    const key = crypto.randomUUID();
    const first = await route(service, key);
    const second = await route(service, key);
    expect(second.command?.id).toBe(first.command?.id);
  });

  it("atomically collapses concurrent idempotent submissions", async () => {
    const { service } = createService();
    await registerAndroid(service);
    await registerWeb(service);
    const key = crypto.randomUUID();
    const [first, second] = await Promise.all([route(service, key), route(service, key)]);
    expect(second.command?.id).toBe(first.command?.id);
    expect(await service.store.listSourceCommands(ownerId, androidClientId, 10)).toHaveLength(1);
  });

  it("reuses the last conversation target only when the owner says there", async () => {
    const { service } = createService();
    await registerAndroid(service);
    await registerWeb(service);
    const conversationId = "99999999-9999-4999-8999-999999999999";
    const first = await service.routeUtterance({
      ownerId,
      sessionId: androidDeviceId,
      sourceDeviceId: androidDeviceId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      networkState: "PRIVATE_NETWORK",
      body: {
        utterance: "Open approvals on web",
        clientInstanceId: androidClientId,
        clientType: "ANDROID",
        conversationId,
        currentRoute: null,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(first.command?.targetId).toBe(webClientId);
    const continued = await service.routeUtterance({
      ownerId,
      sessionId: androidDeviceId,
      sourceDeviceId: androidDeviceId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      networkState: "PRIVATE_NETWORK",
      body: {
        utterance: "Open objectives there",
        clientInstanceId: androidClientId,
        clientType: "ANDROID",
        conversationId,
        currentRoute: null,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(continued.command).toMatchObject({
      targetId: webClientId,
      status: "DISPATCHED",
      arguments: { route: "/objectives" },
    });
  });

  it("fails closed when a target is ambiguous", async () => {
    const { service } = createService();
    await registerAndroid(service);
    await registerWeb(service);
    await registerWeb(service, "55555555-5555-4555-8555-555555555555", "Home Web");
    const result = await route(service);
    expect(result.command?.status).toBe("REJECTED");
    expect(result.command?.failureCode).toBe("TARGET_AMBIGUOUS");
    expect(result.clarificationTargets).toEqual(["Home Web", "Office Web"]);
  });

  it("reports offline without creating a target delivery", async () => {
    const { service, advance } = createService();
    await registerAndroid(service);
    await registerWeb(service);
    advance(46_000);
    const result = await route(service);
    expect(result.command?.status).toBe("TARGET_OFFLINE");
    expect(result.command?.targetId).toBeNull();
  });

  it("keeps client instances owner scoped", async () => {
    const { service } = createService();
    await registerWeb(service);
    await expect(service.status(ownerId, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.heartbeat({
        ownerId: "66666666-6666-4666-8666-666666666666",
        sessionId: `session-${webClientId}`,
        body: { clientInstanceId: webClientId },
        requestId: crypto.randomUUID(),
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps a Mac command dispatched when execution was queued before a provider response error", async () => {
    const identity = new InMemoryIdentityStore();
    const macDeviceId = "77777777-7777-4777-8777-777777777777";
    const executionRequestId = "88888888-8888-4888-8888-888888888888";
    const now = new Date("2026-08-30T00:00:00.000Z");
    identity.createDevice({
      id: macDeviceId,
      ownerId,
      deviceName: "Owner Mac",
      deviceType: "MAC_AGENT",
      trustStatus: "TRUSTED",
      publicKey: {
        kty: "OKP",
        crv: "Ed25519",
        x: "a".repeat(43),
        ext: true,
        key_ops: ["verify"],
      },
      fingerprint: "SHA256:test",
      pairingRequestTokenHash: "a".repeat(64),
      pairedAt: now.toISOString(),
      createdAt: now.toISOString(),
      lastSeen: now.toISOString(),
      revokedAt: null,
      capabilities: [],
      metadata: {},
    });
    const nativeProviders = {
      dashboard: vi.fn().mockResolvedValue({
        nativeProviders: [{ id: "provider.chrome", status: "healthy" }],
        providerCapabilities: [
          { providerId: "provider.chrome", capability: "launch", enabled: true },
        ],
      }),
      dispatch: vi.fn().mockRejectedValue(new Error("Dashboard response failed")),
    } as unknown as NativeProviderRuntime;
    const executionStore = {
      findByActionId: vi.fn().mockImplementation((_ownerId: string, actionId: string) => ({
        id: executionRequestId,
        actionId,
      })),
    } as unknown as ExecutionStore;
    const service = new CrossDeviceService(
      new InMemoryCrossDeviceStore(),
      identity,
      nativeProviders,
      executionStore,
      vi.fn(),
      () => now,
    );
    await registerAndroid(service);

    const result = await service.routeUtterance({
      ownerId,
      sessionId: androidDeviceId,
      sourceDeviceId: androidDeviceId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      networkState: "UNKNOWN",
      body: {
        utterance: "Open Chrome on my Mac",
        clientInstanceId: androidClientId,
        clientType: "ANDROID",
        conversationId: null,
        currentRoute: null,
        idempotencyKey: crypto.randomUUID(),
      },
    });

    expect(result.command).toMatchObject({
      status: "DISPATCHED",
      executionRequestId,
      targetId: macDeviceId,
    });
    expect(result.responseText).toContain("waiting for the trusted Mac Agent");
  });
});

describe("parseCrossDeviceUtterance", () => {
  it("maps only finite Mac and Web actions", () => {
    expect(parseCrossDeviceUtterance("Open Chrome on my Mac", null)).toMatchObject({
      targetType: "MAC",
      capability: "OPEN_APPLICATION",
      arguments: { applicationId: "chrome" },
    });
    expect(parseCrossDeviceUtterance("Show this on my phone", "/approvals")).toMatchObject({
      targetType: "ANDROID",
      capability: "SHOW_SCREEN",
      arguments: { route: "/approvals" },
    });
    expect(parseCrossDeviceUtterance("Run rm -rf on my Mac", null)).toBeNull();
    expect(parseCrossDeviceUtterance("Open Figma on Arjun's MacBook Air", null)).toMatchObject({
      targetType: "MAC",
      targetName: "Arjun's MacBook Air",
      capability: "OPEN_APPLICATION",
    });
    expect(parseCrossDeviceUtterance("Open approvals here", "/")).toMatchObject({
      currentDevice: true,
      capability: "NAVIGATE_TO_ROUTE",
      arguments: { route: "/approvals" },
    });
  });
});
