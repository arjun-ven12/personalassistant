import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { z } from "zod";
import { buildApi } from "../app.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import type { Objects } from "./storage.js";
import type { PdfRenderPort } from "./render.js";
import { hash } from "./routes.js";
import { hashPassword } from "../identity/crypto.js";

const url = process.env.ATHENA_READER_TEST_DATABASE_URL;
const enabled = process.env.ATHENA_READER_DISPOSABLE_TEST === "1" && !!url;

describe.skipIf(!enabled)(
  "Secure Reader in Athena API with disposable PostgreSQL",
  () => {
    const parsed = new URL(url ?? "postgresql://localhost/disabled");
    const databaseName = parsed.pathname.slice(1);
    if (
      enabled &&
      (!/^(reader_test|.*disposable)/.test(databaseName) ||
        !["localhost", "127.0.0.1"].includes(parsed.hostname))
    )
      throw new Error(
        "Secure Reader integration tests require a local disposable database",
      );

    const pool = new pg.Pool({ connectionString: url });
    const bytes = Buffer.from("%PDF-1.7\nsynthetic integration fixture\n");
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const objects = new Map<string, Buffer>();
    const store: Objects = {
      put: (key, value) => {
        objects.set(key, Buffer.from(value));
        return Promise.resolve();
      },
      get: (key) => {
        const value = objects.get(key);
        if (!value) throw new Error("Missing private object");
        return Promise.resolve(Buffer.from(value));
      },
    };
    const renderer: PdfRenderPort = {
      inspect: () => Promise.resolve({ pages: 1 }),
      page: () => Promise.resolve(png),
    };
    const mail = new Map<string, string>();
    let app: Awaited<ReturnType<typeof buildApi>>;
    const governance = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    let admin: string;
    let revokedReader: string;
    let adminPasswordHash: string;
    const adminEmail = `admin-${randomUUID()}@example.test`;
    const readerEmail = `reader-${randomUUID()}@example.test`;

    async function request(
      method: "GET" | "POST" | "DELETE",
      path: string,
      token?: string,
      payload?: Record<string, unknown>,
    ) {
      return app.inject({
        method,
        url: path,
        headers: {
          host: "localhost",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(payload === undefined ? {} : { payload }),
      });
    }
    async function login(email: string) {
      expect(
        (await request("POST", "/api/secure-reader/auth/start", undefined, { email }))
          .statusCode,
      ).toBe(202);
      const response = await request(
        "POST",
        "/api/secure-reader/auth/finish",
        undefined,
        {
          email,
          code: mail.get(email),
          deviceLabel: "Integration fixture",
        },
      );
      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      return z.object({ token: z.string() }).parse(body).token;
    }
    async function upload(token: string, sector: string) {
      const boundary = "reader-test-boundary";
      return app.inject({
        method: "POST",
        url: `/api/secure-reader/admin/documents?title=${sector}&sector=${sector}`,
        headers: {
          host: "localhost",
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
    }
    function openApp(withMailer: boolean | "failing" = true) {
      return buildApi({
        corsOrigin: "http://localhost",
        privateNetworkRequired: false,
        allowedHosts: ["localhost"],
        logger: false,
        governanceStore: governance,
        secureReader: {
          pool,
          objects: store,
          renderer,
          adminOrigin: "http://localhost",
          allowPdfProcessing: true,
          adminPassword: {
            email: adminEmail,
            passwordHash: adminPasswordHash,
          },
          ...(withMailer
            ? {
                mailer: {
                  send: (email: string, code: string) => {
                    if (withMailer === "failing")
                      return Promise.reject(new Error("fixture mail unavailable"));
                    mail.set(email, code);
                    return Promise.resolve();
                  },
                },
              }
            : {}),
        },
      });
    }

    beforeAll(async () => {
      if (!enabled) return;
      adminPasswordHash = await hashPassword("test-only-reader-admin-password-2026");
      const exists = await pool.query<{ schema: string | null }>(
        "SELECT to_regnamespace('secure_reader') AS schema",
      );
      if (!exists.rows[0]?.schema) {
        const migration = await readFile(
          new URL("../../migrations/0119_secure_reader_namespace.sql", import.meta.url),
          "utf8",
        );
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(migration);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      await pool.query(
        "INSERT INTO secure_reader.users(id,email,role,verified_at) VALUES($1,$2,'ADMIN',now())",
        [randomUUID(), adminEmail],
      );
      app = await openApp();
      admin = await login(adminEmail);
    });
    afterAll(async () => {
      if (app) await app.close();
      await pool.end();
    });

    it("issues a 30-day session and still rejects expiry and revocation", async () => {
      const email = `session-${randomUUID()}@example.test`;
      const userId = randomUUID();
      await pool.query(
        "INSERT INTO secure_reader.users(id,email,role,verified_at) VALUES($1,$2,'READER',now())",
        [userId, email],
      );
      const token = await login(email);
      const session = await pool.query<{ id: string; days: number }>(
        "SELECT id, extract(epoch FROM (expires_at-created_at))/86400 AS days FROM secure_reader.sessions WHERE token_hash=$1",
        [hash(token)],
      );
      expect(Number(session.rows[0]?.days)).toBeCloseTo(30, 2);
      expect(
        (await request("GET", "/api/secure-reader/session", token)).statusCode,
      ).toBe(200);
      await pool.query(
        "UPDATE secure_reader.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
        [session.rows[0]?.id],
      );
      expect(
        (await request("GET", "/api/secure-reader/session", token)).statusCode,
      ).toBe(401);
      const next = await login(email);
      await pool.query(
        "UPDATE secure_reader.sessions SET revoked_at=now() WHERE token_hash=$1",
        [hash(next)],
      );
      expect(
        (await request("GET", "/api/secure-reader/session", next)).statusCode,
      ).toBe(401);
    });

    it("keeps Athena routes available and never accepts a Reader bearer as an Athena owner", async () => {
      expect((await request("GET", "/health")).statusCode).toBe(200);
      expect((await request("GET", "/api/secure-reader/health")).json()).toEqual({
        status: "ready",
      });
      expect((await request("GET", "/api/secure-reader/ready")).json()).toEqual({
        status: "ready",
      });
      expect((await request("GET", "/api/auth/session", admin)).statusCode).toBe(401);
    });

    it("allows only the configured administrator to sign in with a password", async () => {
      const path = "/api/secure-reader/auth/admin-password";
      const body = {
        email: adminEmail,
        password: "test-only-reader-admin-password-2026",
        deviceLabel: "Admin web fixture",
      };
      expect(
        (
          await request("POST", path, undefined, {
            ...body,
            password: "wrong-password-fixture-2026",
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await request("POST", path, undefined, { ...body, email: readerEmail }))
          .statusCode,
      ).toBe(401);
      const ok = await request("POST", path, undefined, body);
      expect(ok.statusCode).toBe(200);
      const token = z.object({ token: z.string() }).parse(ok.json()).token;
      expect(
        (await request("GET", "/api/secure-reader/admin/state", token)).statusCode,
      ).toBe(200);
      expect((await request("GET", "/api/auth/session", token)).statusCode).toBe(401);
      await pool.query("UPDATE secure_reader.users SET enabled=false WHERE email=$1", [
        adminEmail,
      ]);
      try {
        expect((await request("POST", path, undefined, body)).statusCode).toBe(401);
        expect(
          (await request("GET", "/api/secure-reader/admin/state", token)).statusCode,
        ).toBe(401);
      } finally {
        await pool.query("UPDATE secure_reader.users SET enabled=true WHERE email=$1", [
          adminEmail,
        ]);
      }
      await pool.query("UPDATE secure_reader.users SET role='READER' WHERE email=$1", [
        adminEmail,
      ]);
      try {
        expect((await request("POST", path, undefined, body)).statusCode).toBe(401);
      } finally {
        await pool.query("UPDATE secure_reader.users SET role='ADMIN' WHERE email=$1", [
          adminEmail,
        ]);
      }
      const session = await pool.query<{ id: string }>(
        "SELECT id FROM secure_reader.sessions WHERE token_hash=$1",
        [hash(token)],
      );
      await pool.query(
        "UPDATE secure_reader.sessions SET revoked_at=now() WHERE id=$1",
        [session.rows[0]?.id],
      );
      expect(
        (await request("GET", "/api/secure-reader/admin/state", token)).statusCode,
      ).toBe(401);
    });

    it("restores browser cookies for 30 days and requires origin and CSRF for mutations", async () => {
      const origin = "http://localhost";
      await pool.query(
        "DELETE FROM secure_reader.rate_buckets WHERE key LIKE 'admin-password-%'",
      );
      const login = await app.inject({
        method: "POST",
        url: "/api/secure-reader/auth/admin-password",
        headers: { host: "localhost", origin },
        payload: {
          email: adminEmail,
          password: "test-only-reader-admin-password-2026",
          deviceLabel: "Browser fixture",
        },
      });
      expect(login.statusCode).toBe(200);
      const setCookie = String(login.headers["set-cookie"]);
      expect(setCookie).toContain("Max-Age=2592000");
      expect(setCookie).toContain("HttpOnly; Secure; SameSite=Strict");
      const cookie = setCookie.split(";")[0]!;
      const session = await app.inject({
        method: "GET",
        url: "/api/secure-reader/session",
        headers: { host: "localhost", cookie },
      });
      expect(session.statusCode).toBe(200);
      const body = z
        .object({ id: z.string(), csrfToken: z.string() })
        .parse(session.json());
      const url = "/api/secure-reader/sessions/" + body.id;
      expect(
        (
          await app.inject({
            method: "DELETE",
            url,
            headers: { host: "localhost", cookie, origin },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url,
            headers: {
              host: "localhost",
              cookie,
              origin,
              "x-reader-csrf": body.csrfToken,
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/secure-reader/session",
            headers: { host: "localhost", cookie },
          })
        ).statusCode,
      ).toBe(401);
    });

    it("enforces independent grants, Founder restriction, one-use tickets and revocation", async () => {
      const invited = await request(
        "POST",
        "/api/secure-reader/admin/invitations",
        admin,
        { email: readerEmail },
      );
      expect(invited.statusCode).toBe(201);
      const reader = await login(readerEmail);
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", reader)).json(),
      ).toEqual([]);
      const forbiddenUpload = await upload(reader, "institutional");
      expect(forbiddenUpload.statusCode).toBe(403);

      const document = await upload(admin, "institutional");
      expect(document.statusCode).toBe(201);
      const documentBody: unknown = document.json();
      const documentId = z.object({ id: z.uuid() }).parse(documentBody).id;
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", admin)).json(),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id: documentId })]));
      const adminTicket = await request(
        "POST",
        "/api/secure-reader/reader/tickets",
        admin,
        { documentId, page: 1 },
      );
      expect(adminTicket.statusCode).toBe(200);
      expect(
        (
          await request("POST", "/api/secure-reader/reader/page", admin, {
            ticket: z.object({ ticket: z.string() }).parse(adminTicket.json()).ticket,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", reader)).json(),
      ).toEqual([]);
      const grant = await request("POST", "/api/secure-reader/admin/grants", admin, {
        userId: z.object({ id: z.uuid() }).parse(invited.json()).id,
        documentId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(grant.statusCode).toBe(201);
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", reader)).json(),
      ).toHaveLength(1);
      const ticket = await request(
        "POST",
        "/api/secure-reader/reader/tickets",
        reader,
        { documentId, page: 1 },
      );
      expect(ticket.statusCode).toBe(200);
      const ticketBody: unknown = ticket.json();
      const ticketValue = z.object({ ticket: z.string() }).parse(ticketBody).ticket;
      const page = await request("POST", "/api/secure-reader/reader/page", reader, {
        ticket: ticketValue,
      });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("image/png");
      expect(
        (
          await request("POST", "/api/secure-reader/reader/page", reader, {
            ticket: ticketValue,
          })
        ).statusCode,
      ).toBe(404);
      const concurrentTicket = await request(
        "POST",
        "/api/secure-reader/reader/tickets",
        reader,
        { documentId, page: 1 },
      );
      const concurrentValue = z
        .object({ ticket: z.string() })
        .parse(concurrentTicket.json()).ticket;
      const attempts = await Promise.all([
        request("POST", "/api/secure-reader/reader/page", reader, {
          ticket: concurrentValue,
        }),
        request("POST", "/api/secure-reader/reader/page", reader, {
          ticket: concurrentValue,
        }),
      ]);
      expect(attempts.map((attempt) => attempt.statusCode).sort()).toEqual([200, 404]);
      expect(
        (
          await request(
            "GET",
            `/api/secure-reader/reader/documents/${documentId}/original`,
            reader,
          )
        ).statusCode,
      ).toBe(404);

      const founder = await upload(admin, "founder");
      expect(founder.statusCode).toBe(201);
      const founderGrant = await request(
        "POST",
        "/api/secure-reader/admin/grants",
        admin,
        {
          userId: z.object({ id: z.uuid() }).parse(invited.json()).id,
          documentId: z.object({ id: z.uuid() }).parse(founder.json()).id,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      );
      expect(founderGrant.statusCode).toBe(403);
      const invitedId = z.object({ id: z.uuid() }).parse(invited.json()).id;
      expect(
        (
          await request(
            "DELETE",
            `/api/secure-reader/admin/grants/${invitedId}/${documentId}`,
            admin,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", reader)).json(),
      ).toEqual([]);
      expect(
        (
          await request("POST", "/api/secure-reader/reader/tickets", reader, {
            documentId,
            page: 1,
          })
        ).statusCode,
      ).toBe(404);
      const readerSession = await request("GET", "/api/secure-reader/session", reader);
      const readerSessionId = z.object({ id: z.uuid() }).parse(readerSession.json()).id;
      expect(
        (
          await request(
            "DELETE",
            `/api/secure-reader/sessions/${readerSessionId}`,
            reader,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/api/secure-reader/reader/documents", reader))
          .statusCode,
      ).toBe(401);
      revokedReader = reader;
      const audit = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM secure_reader.audit_events WHERE event IN ('DOCUMENT_UPLOADED','GRANT_SET','GRANT_REVOKED','PAGE_DELIVERED')",
      );
      expect(audit.rows[0]?.count ?? 0).toBeGreaterThanOrEqual(4);
    });

    it("recovers persisted Reader authority and revocation after an API restart", async () => {
      await app.close();
      app = await openApp();
      expect(
        (await request("GET", "/api/secure-reader/session", admin)).statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/api/secure-reader/session", revokedReader)).statusCode,
      ).toBe(401);
      expect(
        (await request("GET", "/api/secure-reader/admin/state", admin)).statusCode,
      ).toBe(200);
    });

    it("allows only an administrator to hand off a single-use manual code without SMTP", async () => {
      await app.close();
      app = await openApp(false);
      const email = `manual-${randomUUID()}@example.test`;
      const path = "/api/secure-reader/admin/invitations";
      expect(
        (await request("POST", path, undefined, { email, delivery: "manual" }))
          .statusCode,
      ).toBe(401);
      const issued = await request("POST", path, admin, { email, delivery: "manual" });
      expect(issued.statusCode).toBe(201);
      const body = z
        .object({ id: z.uuid(), code: z.string().length(64) })
        .parse(issued.json());
      expect(mail.has(email)).toBe(false);
      const first = await request("POST", "/api/secure-reader/auth/finish", undefined, {
        email,
        code: body.code,
        deviceLabel: "Manual handoff fixture",
      });
      expect(first.statusCode).toBe(200);
      const reader = z.object({ token: z.string() }).parse(first.json()).token;
      expect(
        (await request("POST", path, reader, { email, delivery: "manual" })).statusCode,
      ).toBe(403);
      expect(
        (
          await request("POST", "/api/secure-reader/auth/finish", undefined, {
            email,
            code: body.code,
            deviceLabel: "Replay fixture",
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await request("POST", path, admin, { email, delivery: "email" })).statusCode,
      ).toBe(503);
      const next = await request("POST", path, admin, { email, delivery: "manual" });
      const nextCode = z
        .object({ code: z.string().length(64) })
        .parse(next.json()).code;
      await pool.query(
        "UPDATE secure_reader.challenges SET expires_at=now()-interval '1 second' WHERE hash=$1",
        [hash(nextCode)],
      );
      expect(
        (
          await request("POST", "/api/secure-reader/auth/finish", undefined, {
            email,
            code: nextCode,
            deviceLabel: "Expired fixture",
          })
        ).statusCode,
      ).toBe(401);
      const before = await pool.query<{ count: string }>(
        "SELECT count(*) FROM secure_reader.challenges WHERE user_id=$1 AND used_at IS NULL AND expires_at>now()",
        [body.id],
      );
      expect(
        (await request("POST", "/api/secure-reader/auth/start", undefined, { email }))
          .statusCode,
      ).toBe(202);
      const after = await pool.query<{ count: string }>(
        "SELECT count(*) FROM secure_reader.challenges WHERE user_id=$1 AND used_at IS NULL AND expires_at>now()",
        [body.id],
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    });

    it("preserves a manual invitation when an optional email request fails", async () => {
      await app.close();
      app = await openApp("failing");
      const email = `mail-failure-${randomUUID()}@example.test`;
      const invitation = await request(
        "POST",
        "/api/secure-reader/admin/invitations",
        admin,
        { email, delivery: "manual" },
      );
      expect(invitation.statusCode).toBe(201);
      const code = z.object({ code: z.string() }).parse(invitation.json()).code;
      expect(
        (await request("POST", "/api/secure-reader/auth/start", undefined, { email }))
          .statusCode,
      ).toBe(202);
      const login = await request("POST", "/api/secure-reader/auth/finish", undefined, {
        email,
        code,
        deviceLabel: "Manual invitation after mail failure",
      });
      expect(login.statusCode).toBe(200);
    });

    it("denies Reader requests when Athena emergency stop activates", async () => {
      governance.activateEmergencyStop(new Date().toISOString());
      expect((await request("GET", "/api/secure-reader/health")).statusCode).toBe(503);
      expect(
        (await request("GET", "/api/secure-reader/admin/state", admin)).statusCode,
      ).toBe(503);
      expect(
        (
          await request("POST", "/api/secure-reader/reader/tickets", admin, {
            documentId: randomUUID(),
            page: 1,
          })
        ).statusCode,
      ).toBe(503);
    });
  },
);
