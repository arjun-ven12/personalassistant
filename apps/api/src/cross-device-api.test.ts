import {
  CrossDeviceClientInstanceSchema,
  CsrfTokenResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "./app.js";

const origin = "http://localhost:5173";
const password = "Violet-Harbor-2026!";
const cookieFrom = (headers: OutgoingHttpHeaders) => {
  const value = headers["set-cookie"];
  const cookie = Array.isArray(value) ? value[0] : value;
  if (!cookie) throw new Error("Expected a session cookie.");
  return cookie.split(";")[0] ?? "";
};

describe("cross-device API security", () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;

  beforeEach(async () => {
    app = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: false,
      nodeEnvironment: "test",
      logger: false,
    });
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: { email: "cross-device@example.com", displayName: "Owner", password },
    });
    cookie = cookieFrom(registered.headers);
    const token = await app.inject({
      method: "GET",
      url: "/api/security/csrf",
      headers: { cookie, origin },
    });
    csrf = CsrfTokenResponseSchema.parse(token.json()).token;
  });

  afterEach(async () => app.close());

  it("requires authentication, trusted origin, and CSRF for client registration", async () => {
    const payload = {
      clientInstanceId: "77777777-7777-4777-8777-777777777777",
      clientType: "WEB",
      displayName: "Test Web",
      platform: "test",
      capabilities: ["NAVIGATE_TO_ROUTE"],
      currentRoute: "/",
    };
    expect((await app.inject({ method: "POST", url: "/api/cross-device/clients", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/cross-device/clients", headers: { cookie, origin }, payload })).statusCode).toBe(403);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/cross-device/clients",
      headers: { cookie, origin, "x-csrf-token": csrf },
      payload,
    });
    expect(accepted.statusCode).toBe(200);
    expect(CrossDeviceClientInstanceSchema.parse(accepted.json())).toMatchObject({
      clientType: "WEB",
      presence: "ONLINE",
      trustedDeviceId: null,
    });
  });

  it("rejects capabilities outside the finite Web allowlist", async () => {
    const rejected = await app.inject({
      method: "POST",
      url: "/api/cross-device/clients",
      headers: { cookie, origin, "x-csrf-token": csrf },
      payload: {
        clientInstanceId: "88888888-8888-4888-8888-888888888888",
        clientType: "WEB",
        displayName: "Test Web",
        platform: "test",
        capabilities: ["OPEN_APPLICATION"],
        currentRoute: "/",
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ error: { code: "CAPABILITY_UNAVAILABLE" } });
  });
});
