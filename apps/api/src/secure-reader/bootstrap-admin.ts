import { randomBytes, randomUUID, createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { PostgresDatabase } from "../persistence/database.js";
import { Email } from "./contracts.js";

// Offline, operator-only bootstrap. There is intentionally no HTTP endpoint.
// It reuses the existing DATABASE_URL and never grants an Athena owner session.
const settings = z
  .object({
    DATABASE_URL: z.string().min(1),
    SECURE_READER_SMTP_HOST: z.string().min(1),
    SECURE_READER_SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SECURE_READER_SMTP_USER: z.string().optional(),
    SECURE_READER_SMTP_PASS: z.string().optional(),
    SECURE_READER_MAIL_FROM: z.email(),
  })
  .parse(process.env);
const email = Email.parse(process.argv[2]);
const database = new PostgresDatabase(settings.DATABASE_URL);
const mailer = nodemailer.createTransport({
  host: settings.SECURE_READER_SMTP_HOST,
  port: settings.SECURE_READER_SMTP_PORT,
  secure: true,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  ...(settings.SECURE_READER_SMTP_USER
    ? {
        auth: {
          user: settings.SECURE_READER_SMTP_USER,
          pass: settings.SECURE_READER_SMTP_PASS,
        },
      }
    : {}),
});
try {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(7071882)");
    if (
      (
        await client.query(
          "SELECT id FROM secure_reader.users WHERE role='ADMIN' LIMIT 1",
        )
      ).rowCount
    )
      throw Error("Secure Reader administrator already exists; use reviewed recovery");
    const code = randomBytes(32).toString("hex");
    const id = randomUUID();
    await client.query(
      "INSERT INTO secure_reader.users(id,email,role) VALUES($1,$2,'ADMIN')",
      [id, email],
    );
    await client.query(
      "INSERT INTO secure_reader.challenges(hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [createHash("sha256").update(code).digest("hex"), id],
    );
    await client.query(
      "INSERT INTO secure_reader.audit_events(event,resource_id,outcome) VALUES('ADMIN_BOOTSTRAPPED',$1,'ALLOW')",
      [id],
    );
    await mailer.sendMail({
      from: settings.SECURE_READER_MAIL_FROM,
      to: email,
      subject: "Athena Secure Reader administrator verification",
      text: `Your one-time Secure Reader code expires in 10 minutes:\n\n${code}`,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  process.stdout.write(
    "Secure Reader administrator invitation sent. No code printed.\n",
  );
} finally {
  await database.pool.end();
}
