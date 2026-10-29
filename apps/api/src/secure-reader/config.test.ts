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
  it("accepts bounded production PDF processing with private S3 and TLS mail", () => {
    expect(
      SecureReaderConfigSchema.safeParse({ ...base, NODE_ENV: "production" }).success,
    ).toBe(true);
  });

  it("accepts only the mounted Railway volume for production local storage", () => {
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        SECURE_READER_STORAGE_MODE: "local",
        RAILWAY_VOLUME_MOUNT_PATH: "/app/api/.local",
        SECURE_READER_PRIVATE_STORAGE_DIR: "/app/api/.local/secure-reader-pdfs",
        SECURE_READER_RENDERER_URL: undefined,
        SECURE_READER_RENDERER_SHARED_SECRET_FILE: undefined,
      }).success,
    ).toBe(true);
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        SECURE_READER_STORAGE_MODE: "local",
        SECURE_READER_PRIVATE_STORAGE_DIR: "/tmp/pdfs",
        SECURE_READER_RENDERER_URL: undefined,
        SECURE_READER_RENDERER_SHARED_SECRET_FILE: undefined,
      }).success,
    ).toBe(false);
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        NODE_ENV: "production",
        SECURE_READER_ALLOW_UNSANDBOXED_PDF_PROCESSING: "true",
      }).success,
    ).toBe(false);
  });

  it("permits manual preview invitations without SMTP and rejects partial mail settings", () => {
    const noMail = {
      ...base,
      NODE_ENV: "production",
      SECURE_READER_STORAGE_MODE: "local",
      RAILWAY_VOLUME_MOUNT_PATH: "/app/api/.local",
      SECURE_READER_RENDERER_URL: undefined,
      SECURE_READER_RENDERER_SHARED_SECRET_FILE: undefined,
      SECURE_READER_SMTP_HOST: undefined,
      SECURE_READER_SMTP_PORT: undefined,
      SECURE_READER_SMTP_SECURE: undefined,
      SECURE_READER_MAIL_FROM: undefined,
    };
    expect(SecureReaderConfigSchema.safeParse(noMail).success).toBe(true);
    expect(
      SecureReaderConfigSchema.safeParse({
        ...noMail,
        SECURE_READER_SMTP_HOST: "mail.example.org",
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit non-production fixture configuration", () => {
    expect(
      SecureReaderConfigSchema.safeParse({ ...base, NODE_ENV: "test" }).success,
    ).toBe(true);
  });

  it("requires an administrator password to be bound to an email", () => {
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        SECURE_READER_ADMIN_PASSWORD_EMAIL: "admin@example.org",
        SECURE_READER_ADMIN_PASSWORD_HASH:
          "$argon2id$v=19$m=19456,t=2,p=1$test$safe-test",
      }).success,
    ).toBe(true);
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        SECURE_READER_ADMIN_PASSWORD_HASH:
          "$argon2id$v=19$m=19456,t=2,p=1$test$safe-test",
      }).success,
    ).toBe(false);
    expect(
      SecureReaderConfigSchema.safeParse({
        ...base,
        SECURE_READER_ADMIN_PASSWORD_EMAIL: "admin@example.org",
      }).success,
    ).toBe(false);
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
