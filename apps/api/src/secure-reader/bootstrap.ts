import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import nodemailer from "nodemailer";
import { SecureReaderConfigSchema } from "./config.js";
import { PdfRenderer } from "./render.js";
import { RemotePdfRenderer } from "./remote-render.js";
import { LocalObjects, S3Objects } from "./storage.js";
import type { SecureReaderOptions } from "./routes.js";

function privateVolumeDirectory(mount: string): string {
  const root = path.join(mount, "secure-reader-pdfs");
  const mounted = readFileSync("/proc/self/mountinfo", "utf8")
    .split("\n")
    .some((line) => line.split(" ")[4] === mount);
  if (!mounted || realpathSync(mount) !== mount)
    throw new Error("Secure Reader volume is not mounted");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o700 ||
    stat.uid !== process.getuid?.() ||
    realpathSync(root) !== root
  )
    throw new Error("Secure Reader volume directory is not private");
  return root;
}

export function createSecureReaderOptions(
  environment: NodeJS.ProcessEnv,
  pool: Pool,
): SecureReaderOptions {
  const config = SecureReaderConfigSchema.parse(environment);
  const localRoot =
    config.SECURE_READER_STORAGE_MODE === "local"
      ? config.NODE_ENV === "production"
        ? privateVolumeDirectory(config.RAILWAY_VOLUME_MOUNT_PATH!)
        : config.SECURE_READER_PRIVATE_STORAGE_DIR!
      : undefined;
  const secret = config.SECURE_READER_RENDERER_SHARED_SECRET_FILE
    ? readFileSync(config.SECURE_READER_RENDERER_SHARED_SECRET_FILE, "utf8").trim()
    : undefined;
  const mail = config.SECURE_READER_SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SECURE_READER_SMTP_HOST,
        port: config.SECURE_READER_SMTP_PORT!,
        secure: config.SECURE_READER_SMTP_SECURE,
        ...(config.SECURE_READER_SMTP_USER
          ? {
              auth: {
                user: config.SECURE_READER_SMTP_USER,
                pass: config.SECURE_READER_SMTP_PASS,
              },
            }
          : {}),
      })
    : undefined;
  return {
    pool,
    objects:
      config.SECURE_READER_STORAGE_MODE === "s3"
        ? new S3Objects(
            config.SECURE_READER_S3_BUCKET!,
            config.SECURE_READER_S3_REGION!,
            config.SECURE_READER_S3_ENDPOINT,
          )
        : new LocalObjects(localRoot!),
    renderer:
      config.SECURE_READER_RENDERER_URL && secret
        ? new RemotePdfRenderer(config.SECURE_READER_RENDERER_URL, secret)
        : new PdfRenderer(),
    adminOrigin: config.SECURE_READER_ADMIN_ORIGIN,
    allowPdfProcessing:
      Boolean(config.SECURE_READER_RENDERER_URL && secret) ||
      config.NODE_ENV === "production" ||
      config.SECURE_READER_ALLOW_UNSANDBOXED_PDF_PROCESSING,
    ...(mail
      ? {
          mailer: {
            send: async (email: string, code: string) => {
              await mail.sendMail({
                from: config.SECURE_READER_MAIL_FROM,
                to: email,
                subject: "Athena Secure Reader · sign-in verification",
                text: `Your one-time verification code:\n\n${code}\n\nExpires in 10 minutes. Do not forward this message.`,
              });
            },
          },
        }
      : {}),
  };
}
