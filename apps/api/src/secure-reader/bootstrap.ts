import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import nodemailer from "nodemailer";
import { SecureReaderConfigSchema } from "./config.js";
import { PdfRenderer } from "./render.js";
import { RemotePdfRenderer } from "./remote-render.js";
import { LocalObjects, S3Objects } from "./storage.js";
import type { SecureReaderOptions } from "./routes.js";

export function createSecureReaderOptions(
  environment: NodeJS.ProcessEnv,
  pool: Pool,
): SecureReaderOptions {
  const config = SecureReaderConfigSchema.parse(environment);
  const secret = config.SECURE_READER_RENDERER_SHARED_SECRET_FILE
    ? readFileSync(config.SECURE_READER_RENDERER_SHARED_SECRET_FILE, "utf8").trim()
    : undefined;
  const mail = nodemailer.createTransport({
    host: config.SECURE_READER_SMTP_HOST,
    port: config.SECURE_READER_SMTP_PORT,
    secure: config.SECURE_READER_SMTP_SECURE,
    ...(config.SECURE_READER_SMTP_USER
      ? {
          auth: {
            user: config.SECURE_READER_SMTP_USER,
            pass: config.SECURE_READER_SMTP_PASS,
          },
        }
      : {}),
  });
  return {
    pool,
    objects:
      config.SECURE_READER_STORAGE_MODE === "s3"
        ? new S3Objects(
            config.SECURE_READER_S3_BUCKET!,
            config.SECURE_READER_S3_REGION!,
            config.SECURE_READER_S3_ENDPOINT,
          )
        : new LocalObjects(config.SECURE_READER_PRIVATE_STORAGE_DIR!),
    renderer:
      config.SECURE_READER_RENDERER_URL && secret
        ? new RemotePdfRenderer(config.SECURE_READER_RENDERER_URL, secret)
        : new PdfRenderer(),
    adminOrigin: config.SECURE_READER_ADMIN_ORIGIN,
    allowPdfProcessing:
      Boolean(config.SECURE_READER_RENDERER_URL && secret) ||
      (config.NODE_ENV !== "production" &&
        config.SECURE_READER_ALLOW_UNSANDBOXED_PDF_PROCESSING),
    mailer: {
      send: async (email, code) => {
        await mail.sendMail({
          from: config.SECURE_READER_MAIL_FROM,
          to: email,
          subject: "Athena Secure Reader · sign-in verification",
          text: `Your one-time verification code:\n\n${code}\n\nExpires in 10 minutes. Do not forward this message.`,
        });
      },
    },
  };
}
