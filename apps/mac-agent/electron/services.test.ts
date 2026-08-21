import { describe, expect, it, vi } from "vitest";

import {
  apiErrorDetails,
  beginFixedPairing,
  generateLocalDeviceIdentity,
  submitDeviceActiveContext,
  testFixedApiConnection,
} from "./services.js";

describe("mac-agent connection test", () => {
  it("calls only the fixed health endpoint and validates the result", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "alexa-api",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
          uptimeSeconds: 1,
        }),
        { status: 200 },
      ),
    );

    await expect(
      testFixedApiConnection("http://localhost:3001", fetchImplementation),
    ).resolves.toMatchObject({ ok: true, status: "online" });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://localhost:3001/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fails closed on a malformed health response", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );

    await expect(
      testFixedApiConnection("http://localhost:3001", fetchImplementation),
    ).resolves.toMatchObject({ ok: false, status: "invalid_response" });
  });

  it("generates a local Ed25519 identity without serialising the private key", async () => {
    const identity = await generateLocalDeviceIdentity();

    expect(identity.publicKey).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
    });
    expect(identity.fingerprint).toMatch(/^SHA256:/);
    expect(identity.privateKey.type).toBe("private");
    expect(JSON.stringify(identity.publicKey)).not.toContain("private");
  });

  it("sends only the public key to the fixed pairing endpoint", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          deviceId: "00000000-0000-4000-8000-000000000010",
          pairingRequestToken:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
          trustStatus: "PENDING",
          serverExecutionPublicKey: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN",
          serverExecutionKeyFingerprint: "SHA256:server-test-key-pin",
        }),
        { status: 200 },
      ),
    );

    await expect(
      beginFixedPairing(
        "http://localhost:3001",
        "ABCDEFG2",
        "Owner Mac",
        fetchImplementation,
      ),
    ).resolves.toMatchObject({
      trustStatus: "PENDING",
      serverExecutionPublicKey: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN",
      serverExecutionKeyFingerprint: "SHA256:server-test-key-pin",
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/devices/pairing-requests");
    const body = typeof init.body === "string" ? init.body : "";
    expect(body).toContain('"publicKey"');
    expect(body).not.toContain("privateKey");
  });

  it("preserves nested API pairing error codes", async () => {
    await expect(
      apiErrorDetails(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "PAIRING_CODE_INVALID",
              message: "The pairing code is invalid or expired.",
            },
          }),
          { status: 400 },
        ),
        "Pairing request failed.",
      ),
    ).resolves.toEqual({
      code: "PAIRING_CODE_INVALID",
      message: "The pairing code is invalid or expired. (400)",
    });
  });

  it("submits bounded active context through the fixed signed device route", async () => {
    const identity = await generateLocalDeviceIdentity();
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ context: null, refreshed: false }), {
          status: 200,
        }),
      );
    const observation = {
      application: {
        name: "Visual Studio Code",
        bundleIdentifier: "com.microsoft.VSCode",
        processIdentifier: 42,
      },
      window: { title: "service.ts — personalassistant" },
      document: { title: "service.ts", type: "source", uri: "file:///repo/service.ts" },
      selection: {
        text: "const safe = true;",
        semanticType: "AXTextArea",
        secure: false,
      },
      accessibilityTrusted: true,
      capturedAt: new Date().toISOString(),
    };

    await submitDeviceActiveContext(
      "http://localhost:3001",
      "00000000-0000-4000-8000-000000000010",
      identity,
      observation,
      fetchImplementation,
    );

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    if (typeof init.body !== "string") throw new Error("Expected a JSON request body.");
    const envelope = JSON.parse(init.body) as { payload: unknown };
    expect(url).toBe("http://localhost:3001/api/active-context/device");
    expect(envelope.payload).toEqual(observation);
    expect(JSON.stringify(envelope.payload)).not.toMatch(/screenshot|pixels|ocr/i);
  });
});
