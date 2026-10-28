import { describe, expect, it } from "vitest";
import { SecureReaderConfigSchema } from "./config.js";
import { buildApi } from "../app.js";

const base = {
  DATABASE_URL: "postgresql://example.invalid/athena",
  SECURE_READER_ADMIN_ORIGIN: "https://athena.example.org",
  SECURE_READER_STORAGE_MODE: "s3",
  SECURE_READER_S3_BUCKET: "private-reader-test",
  SECURE_READER_S3_REGION: "us-east-1",
  SECURE_READER_SMTP_HOST: "smtp.example.org",
  SECURE_READER_SMTP_PORT: "465",
  SECURE_READER_SMTP_SECURE: "true",
  SECURE_READER_MAIL_FROM: "reader@example.org",
  SECURE_READER_RENDERER_URL: "http://127.0.0.1:4311",
  SECURE_READER_RENDERER_SHARED_SECRET_FILE: "/run/secrets/reader-renderer",
};

describe("Secure Reader activation gate", () => {
  it("retains the upstream production isolation block even with all fields supplied", () => {
    expect(
      SecureReaderConfigSchema.safeParse({ ...base, NODE_ENV: "production" }).success,
    ).toBe(false);
  });

  it("rejects local storage and missing renderer credentials in production", () => {
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        SECURE_READER_STORAGE_MODE: "local",
        SECURE_READER_RENDERER_SHARED_SECRET_FILE: undefined,
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit non-production fixture configuration", () => {
    expect(
      SecureReaderConfigSchema.safeParse({ ...base, NODE_ENV: "test" }).success,
    ).toBe(true);
  });

  it("leaves Reader unavailable by default while Athena health stays available", async () => {
    const app = await buildApi({
      corsOrigin: "http://localhost",
      privateNetworkRequired: false,
      allowedHosts: ["localhost"],
      logger: false,
    });
    try {
      const headers = { host: "localhost" };
      expect(
        (await app.inject({ method: "GET", url: "/health", headers })).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: "GET", url: "/api/secure-reader/health", headers }))
          .statusCode,
      ).toBe(503);
      expect(
        (await app.inject({ method: "GET", url: "/api/secure-reader/ready", headers }))
          .statusCode,
      ).toBe(503);
    } finally {
      await app.close();
    }
  });
});
