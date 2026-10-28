import { z } from "zod";
import path from "node:path";

const bool = z.enum(["true", "false"]).transform((value) => value === "true");

// Parsed only when SECURE_READER_ENABLED=true. DATABASE_URL is Athena's existing
// connection string; no Reader-specific database URL is accepted.
export const SecureReaderConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    SECURE_READER_ADMIN_ORIGIN: z.url(),
    SECURE_READER_STORAGE_MODE: z.enum(["local", "s3"]),
    RAILWAY_VOLUME_MOUNT_PATH: z.string().optional(),
    SECURE_READER_PRIVATE_STORAGE_DIR: z.string().optional(),
    SECURE_READER_S3_BUCKET: z.string().optional(),
    SECURE_READER_S3_REGION: z.string().optional(),
    SECURE_READER_S3_ENDPOINT: z.url().optional(),
    SECURE_READER_SMTP_HOST: z.string().min(1).optional(),
    SECURE_READER_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SECURE_READER_SMTP_SECURE: bool.optional(),
    SECURE_READER_SMTP_USER: z.string().optional(),
    SECURE_READER_SMTP_PASS: z.string().optional(),
    SECURE_READER_MAIL_FROM: z.email().optional(),
    SECURE_READER_ALLOW_UNSANDBOXED_PDF_PROCESSING: bool.default(false),
    SECURE_READER_RENDERER_URL: z.url().optional(),
    SECURE_READER_RENDERER_SHARED_SECRET_FILE: z.string().optional(),
  })
  .superRefine((config, context) => {
    const mailConfigured = [
      config.SECURE_READER_SMTP_HOST,
      config.SECURE_READER_SMTP_PORT,
      config.SECURE_READER_SMTP_SECURE,
      config.SECURE_READER_MAIL_FROM,
      config.SECURE_READER_SMTP_USER,
      config.SECURE_READER_SMTP_PASS,
    ].some((value) => value !== undefined);
    if (
      mailConfigured &&
      (!config.SECURE_READER_SMTP_HOST ||
        !config.SECURE_READER_SMTP_PORT ||
        config.SECURE_READER_SMTP_SECURE === undefined ||
        !config.SECURE_READER_MAIL_FROM ||
        Boolean(config.SECURE_READER_SMTP_USER) !==
          Boolean(config.SECURE_READER_SMTP_PASS))
    )
      context.addIssue({
        code: "custom",
        message: "Incomplete Reader mail configuration",
      });
    if (
      config.SECURE_READER_STORAGE_MODE === "local" &&
      !config.SECURE_READER_PRIVATE_STORAGE_DIR &&
      !config.RAILWAY_VOLUME_MOUNT_PATH
    )
      context.addIssue({
        code: "custom",
        message: "Reader local storage path required",
      });
    if (
      Boolean(config.SECURE_READER_RENDERER_URL) !==
      Boolean(config.SECURE_READER_RENDERER_SHARED_SECRET_FILE)
    )
      context.addIssue({
        code: "custom",
        message: "Reader renderer and secret file must be paired",
      });
    if (config.NODE_ENV === "production") {
      if (config.SECURE_READER_ALLOW_UNSANDBOXED_PDF_PROCESSING)
        context.addIssue({
          code: "custom",
          message: "Production may use only the bounded PDF worker",
        });
      if (config.SECURE_READER_STORAGE_MODE === "local") {
        const mount = config.RAILWAY_VOLUME_MOUNT_PATH;
        const expected = mount ? path.join(mount, "secure-reader-pdfs") : "";
        if (
          !mount ||
          !path.isAbsolute(mount) ||
          mount === "/" ||
          (config.SECURE_READER_PRIVATE_STORAGE_DIR &&
            config.SECURE_READER_PRIVATE_STORAGE_DIR !== expected)
        )
          context.addIssue({
            code: "custom",
            message: "Production local storage must use the Railway volume",
          });
      } else if (!config.SECURE_READER_S3_BUCKET || !config.SECURE_READER_S3_REGION)
        context.addIssue({
          code: "custom",
          message: "Production S3 storage requires a private bucket and region",
        });
      if (
        config.SECURE_READER_S3_ENDPOINT &&
        !config.SECURE_READER_S3_ENDPOINT.startsWith("https://")
      )
        context.addIssue({
          code: "custom",
          message: "Production storage endpoint requires HTTPS",
        });
      if (
        !config.SECURE_READER_ADMIN_ORIGIN.startsWith("https://") ||
        (mailConfigured && !config.SECURE_READER_SMTP_SECURE)
      )
        context.addIssue({
          code: "custom",
          message:
            "Production requires HTTPS admin origin and TLS when mail is configured",
        });
    }
  });

export type SecureReaderConfig = z.infer<typeof SecureReaderConfigSchema>;
