import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  CsrfTokenResponseSchema,
  canonicalizeSignedCommand,
  type SignedCommandEnvelope,
} from "@alexa-control/shared";
import { buildApi } from "../app.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { StaticNetworkVerifier } from "../identity/network.js";

const origin = "http://localhost:5173";
describe("MCP finite API routes", () => {
  let app: FastifyInstance;
  let identity: InMemoryIdentityStore;
  let cookie: string, csrf: string, deviceId: string;
  let keys: CryptoKeyPair;
  const payload = {
    workspaceId: "project.fixture",
    serverId: "athena.local.fixture",
    toolName: "athena_local_status",
    input: { probe: "health" },
    operation: "read_status",
  };
  const headers = () => ({
    cookie,
    origin,
    "x-csrf-token": csrf,
    "x-device-id": deviceId,
  });
  const signed = async (
    body: SignedCommandEnvelope["payload"] = payload,
  ): Promise<SignedCommandEnvelope> => {
    const unsigned = {
      commandId: crypto.randomUUID(),
      deviceId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: crypto.randomUUID(),
      payload: body,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(unsigned)),
    );
    return {
      ...unsigned,
      signature: Buffer.from(signature).toString("base64url"),
    };
  };

  beforeEach(async () => {
    identity = new InMemoryIdentityStore();
    app = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: true,
      nodeEnvironment: "test",
      logger: false,
      identityStore: identity,
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
      mcpLocalFixtureEnabled: true,
    });
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "fixture@example.invalid",
        displayName: "Fixture",
        password: "Violet-Harbor-2026!",
      },
    });
    expect(registration.statusCode).toBe(200);
    const cookies = registration.headers["set-cookie"];
    cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(";")[0] ?? "";
    csrf = CsrfTokenResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/security/csrf",
          headers: { cookie, origin },
        })
      ).json(),
    ).token;
    keys = (await webcrypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const publicKey = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
    const owner = identity.findUserByEmail("fixture@example.invalid");
    deviceId = crypto.randomUUID();
    identity.createDevice({
      id: deviceId,
      ownerId: owner!.id,
      deviceName: "Fixture",
      deviceType: "MAC_AGENT",
      trustStatus: "TRUSTED",
      publicKey: { kty: "OKP", crv: "Ed25519", x: publicKey.x! },
      fingerprint: "fixture-public",
      pairingRequestTokenHash: "fixture-hash",
      pairedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastSeen: null,
      revokedAt: null,
      capabilities: [],
      metadata: {},
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers: headers(),
          payload: {
            id: "project.fixture",
            displayName: "Fixture",
            rootPath: "/workspace/fixture",
            enabled: true,
            permissions: { read: true },
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/integrations/permissions",
          headers: headers(),
          payload: {
            integrationId: "mcp_local_fixture",
            capabilityId: "mcp.local_fixture.read",
            grant: true,
          },
        })
      ).statusCode,
    ).toBe(200);
  });
  afterEach(async () => app?.close());

  it("executes through actual API composition and real stdio, then rejects replay", async () => {
    const envelope = await signed();
    const response = await app.inject({
      method: "POST",
      url: "/api/mcp/local-fixture/read-status",
      headers: headers(),
      payload: envelope,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      operationId: envelope.commandId,
      trust: "UNTRUSTED_DATA",
      result: { status: "ok", readOnly: true },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/mcp/local-fixture/read-status",
          headers: headers(),
          payload: envelope,
        })
      ).statusCode,
    ).toBe(409);
  });

  it("denies absent identity, CSRF, wrong origin and revoked device", async () => {
    for (const h of [
      { origin },
      { cookie, origin, "x-device-id": deviceId },
      { ...headers(), origin: "https://example.invalid" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/mcp/local-fixture/read-status",
        headers: h,
        payload: await signed(),
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
    identity.updateDevice({
      ...identity.findDeviceById(deviceId)!,
      trustStatus: "REVOKED",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/mcp/local-fixture/read-status",
          headers: headers(),
          payload: await signed(),
        })
      ).statusCode,
    ).toBe(403);
  });

  it("denies foreign company, unknown tool, arbitrary process fields and expired signature", async () => {
    const foreign = await app.inject({
      method: "POST",
      url: "/api/mcp/local-fixture/read-status",
      headers: { ...headers(), "x-company-id": crypto.randomUUID() },
      payload: await signed(),
    });
    expect(foreign.statusCode).toBeGreaterThanOrEqual(400);
    for (const body of [
      { ...payload, toolName: "write_file" },
      { ...payload, executable: "/bin/sh" },
      { ...payload, approval: true },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/mcp/local-fixture/read-status",
            headers: headers(),
            payload: await signed(body),
          })
        ).statusCode,
      ).toBe(400);
    }
    const envelope = await signed();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/mcp/local-fixture/read-status",
          headers: headers(),
          payload: {
            ...envelope,
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
          },
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(400);
  });

  it("does not expose registration or arbitrary invocation routes", async () => {
    for (const url of ["/api/mcp/register", "/api/mcp/invoke", "/api/mcp/execute"])
      expect(
        (await app.inject({ method: "POST", url, headers: headers(), payload: {} }))
          .statusCode,
      ).toBe(404);
  });
});
