import {
  PolicyEvaluationResponseSchema,
  CsrfTokenResponseSchema,
  RecentAuthChallengeResponseSchema,
  RecoveryCodeGenerationResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "./app.js";
import { BUILT_IN_TOOLS } from "./governance/defaults.js";
import { InMemoryGovernanceStore } from "./governance/store.js";
import { StaticNetworkVerifier } from "./identity/network.js";

const origin = "http://localhost:5173";
const password = "Violet-Harbor-2026!";

describe("Phase 2.3 browser security", () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;

  beforeEach(async () => {
    app = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: true,
      nodeEnvironment: "test",
      logger: false,
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
    });
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "security@example.com",
        displayName: "Security Owner",
        password,
      },
    });
    const cookieHeader = registration.headers["set-cookie"];
    cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader)!.split(
      ";",
    )[0]!;
    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/security/csrf",
      headers: { cookie },
    });
    csrf = CsrfTokenResponseSchema.parse(csrfResponse.json()).token;
  });

  afterEach(async () => app.close());

  it("binds CSRF tokens to sessions and trusted origins", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/api/security/emergency-stop",
      headers: { cookie, origin },
    });
    expect(missing.json()).toMatchObject({
      error: { code: "CSRF_TOKEN_REQUIRED" },
    });
    const incorrect = await app.inject({
      method: "POST",
      url: "/api/security/emergency-stop",
      headers: { cookie, origin, "x-csrf-token": "x".repeat(43) },
    });
    expect(incorrect.json()).toMatchObject({
      error: { code: "CSRF_TOKEN_INVALID" },
    });
    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/security/emergency-stop",
      headers: {
        cookie,
        origin: "https://attacker.example",
        "x-csrf-token": csrf,
      },
    });
    expect(wrongOrigin.statusCode).toBe(403);
    const valid = await app.inject({
      method: "POST",
      url: "/api/security/emergency-stop",
      headers: { cookie, origin, "x-csrf-token": csrf },
    });
    expect(valid.statusCode).toBe(200);
  });

  it("rejects unexpected hosts and ignores spoofed forwarding headers", async () => {
    const host = await app.inject({
      method: "GET",
      url: "/health",
      headers: { host: "attacker.example" },
    });
    expect(host.json()).toMatchObject({ error: { code: "HOST_NOT_ALLOWED" } });
    const network = await app.inject({
      method: "GET",
      url: "/api/security/network",
      headers: {
        cookie,
        "x-forwarded-for": "100.100.100.100",
        "x-real-ip": "100.100.100.100",
      },
    });
    expect(network.json()).toMatchObject({
      source: "test",
      remoteAddress: "127.0.0.1",
    });
  });

  it("uses a short-lived password grant for high-risk approval without execution", async () => {
    const headers = { cookie, origin, "x-csrf-token": csrf };
    const evaluation = await app.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers,
      payload: {
        action: {
          actionId: crypto.randomUUID(),
          toolName: "security.modify",
          arguments: {},
        },
      },
    });
    const result = PolicyEvaluationResponseSchema.parse(evaluation.json());
    const approvalId = result.evaluation.approvalRequestId!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/approvals/${approvalId}/approve`,
          headers,
          payload: {},
        })
      ).json(),
    ).toMatchObject({ error: { code: "RECENT_AUTHENTICATION_REQUIRED" } });

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/security/recent-auth/challenge",
      headers,
      payload: { purpose: "approve_high_risk_action" },
    });
    const challenge = RecentAuthChallengeResponseSchema.parse(challengeResponse.json());
    const verified = await app.inject({
      method: "POST",
      url: "/api/security/recent-auth/verify-password",
      headers,
      payload: {
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        password,
      },
    });
    expect(verified.json()).toMatchObject({
      active: true,
      purpose: "approve_high_risk_action",
    });
    const approved = await app.inject({
      method: "POST",
      url: `/api/approvals/${approvalId}/approve`,
      headers,
      payload: {},
    });
    expect(approved.json()).toMatchObject({
      status: "APPROVED",
    });
    expect(JSON.stringify(approved.json())).not.toContain('executionAllowed":true');
  });

  it("generates one-time plaintext recovery codes only after purpose-bound re-auth", async () => {
    const headers = { cookie, origin, "x-csrf-token": csrf };
    const challenge = RecentAuthChallengeResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/security/recent-auth/challenge",
          headers,
          payload: { purpose: "generate_recovery_codes" },
        })
      ).json(),
    );
    await app.inject({
      method: "POST",
      url: "/api/security/recent-auth/verify-password",
      headers,
      payload: {
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        password,
      },
    });
    const generated = RecoveryCodeGenerationResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/security/recovery-codes/generate",
          headers,
          payload: {},
        })
      ).json(),
    );
    expect(generated.codes).toHaveLength(10);
    const status = await app.inject({
      method: "GET",
      url: "/api/security/recovery-codes/status",
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({ unusedCount: 10 });
    expect(JSON.stringify(status.json())).not.toContain(generated.codes[0]);
    const used = await app.inject({
      method: "POST",
      url: "/api/security/recovery-codes/verify",
      payload: {
        email: "security@example.com",
        code: generated.codes[0],
      },
    });
    expect(used.json()).toMatchObject({
      verified: true,
      nextStep: "LOCAL_PASSWORD_RESET_REQUIRED",
    });
    const reused = await app.inject({
      method: "POST",
      url: "/api/security/recovery-codes/verify",
      payload: {
        email: "security@example.com",
        code: generated.codes[0],
      },
    });
    expect(reused.json()).toMatchObject({
      error: { code: "RECOVERY_CODE_INVALID" },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/session",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
});
