import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApi } from "../app.js";
import {
  CsrfTokenResponseSchema,
  EngineeringDatasetStatsSchema,
} from "@alexa-control/shared";
const origin = "http://localhost:5173";
describe("Engineering dataset HTTP governance", () => {
  let app: FastifyInstance, cookie: string, csrf: string;
  beforeAll(async () => {
    app = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: false,
      nodeEnvironment: "test",
      logger: false,
    });
    const auth = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "dataset-owner@example.test",
        displayName: "Dataset Owner",
        password: "Violet-Harbor-2026!",
      },
    });
    expect(auth.statusCode).toBe(200);
    const cookies = auth.headers["set-cookie"];
    cookie = (Array.isArray(cookies) ? cookies : [cookies])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.split(";")[0])
      .join("; ");
    const response = await app.inject({
      method: "GET",
      url: "/api/security/csrf",
      headers: { cookie, origin },
    });
    csrf = CsrfTokenResponseSchema.parse(response.json()).token;
  });
  afterAll(async () => {
    await app.close();
  });
  it("denies unauthenticated statistics and requires exact origin/CSRF for mutation", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/engineering-dataset" })).statusCode,
    ).toBe(401);
    const mutation = {
      method: "POST" as const,
      url: "/api/engineering-dataset/snapshots",
      payload: { version: "dataset-v1" },
    };
    expect(
      (await app.inject({ ...mutation, headers: { cookie, origin } })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          ...mutation,
          headers: {
            cookie,
            origin: "https://untrusted.example",
            "x-csrf-token": csrf,
          },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("returns honest empty statistics and freezes bounded version membership", async () => {
    const stats = await app.inject({
      method: "GET",
      url: "/api/engineering-dataset",
      headers: { cookie, origin },
    });
    expect(stats.statusCode).toBe(200);
    expect(EngineeringDatasetStatsSchema.parse(stats.json())).toMatchObject({
      eligibleExamples: 0,
      comparisonStatus: "PENDING_LIVE_BASELINE",
    });
    const snapshot = await app.inject({
      method: "POST",
      url: "/api/engineering-dataset/snapshots",
      headers: { cookie, origin, "x-csrf-token": csrf },
      payload: { version: "dataset-v1" },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      evidence: "EMPTY",
      members: [],
    });
  });
  it("normal login cannot export private training data or activate AthenaCoder", async () => {
    const headers = { cookie, origin, "x-csrf-token": csrf };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/engineering-dataset/export",
          headers,
          payload: { version: "dataset-v1" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/engineering-dataset/model-control",
          headers,
          payload: { action: "ENABLE" },
        })
      ).statusCode,
    ).toBe(409);
    const disabled = await app.inject({
      method: "POST",
      url: "/api/engineering-dataset/model-control",
      headers,
      payload: { action: "DISABLE" },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ enabled: false });
  });
});
