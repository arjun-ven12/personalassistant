import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import multipart from "@fastify/multipart";
import type { PoolClient } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z, ZodError } from "zod";
import {
  LoginStart,
  LoginFinish,
  AdminPasswordLogin,
  Invite,
  Grant,
  PageRequest,
  Redeem,
  UploadMeta,
  Id,
  Watermark,
} from "./contracts.js";
import { verifyPassword } from "../identity/crypto.js";
import { transaction, type Db } from "./db.js";
import type { Objects } from "./storage.js";
import type { PdfRenderPort } from "./render.js";
export interface Mailer {
  send(email: string, code: string): Promise<void>;
}
export interface SecureReaderOptions {
  pool: Db;
  objects: Objects;
  renderer: PdfRenderPort;
  mailer?: Mailer;
  adminPassword?: { email: string; passwordHash: string };
  adminOrigin: string;
  allowPdfProcessing: boolean;
  emergencyStopActive?: () => Promise<boolean>;
}
export const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const secret = () => randomBytes(32).toString("hex");
class Denied extends Error {
  constructor(readonly status = 404) {
    super("Request unavailable");
  }
}
interface Principal {
  csrfToken?: string;
  id: string;
  sessionId: string;
  email: string;
  role: "ADMIN" | "READER";
  expiresAt: Date;
}
interface Doc {
  id: string;
  title: string;
  sector: string;
  classification: string;
  page_count: number;
  version: number;
  object_key: string;
  sha256: string;
  watermark: unknown;
}
// The reviewed SQL projections below select subsets of this internal row shape.
// Public request bodies and parameters are validated by the shared Zod contracts.
interface ReaderSqlRow extends Doc {
  user_id: string;
  session_id: string;
  document_id: string;
  email: string;
  role: "ADMIN" | "READER";
  enabled: boolean;
  verified_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  used_at: Date | null;
  page: number;
  grant_version: number;
  admin_preview: boolean;
  count: string | number;
  hash: string;
}
const publicDoc = (d: Doc) => ({
  id: d.id,
  title: d.title,
  sector: d.sector,
  classification: d.classification,
  pageCount: d.page_count,
  version: d.version,
});
export async function registerSecureReaderRoutes(
  app: FastifyInstance,
  o: SecureReaderOptions,
) {
  const assetsDirectory = path.resolve(
    process.cwd(),
    path.basename(process.cwd()) === "api"
      ? "dist/secure-reader-ui"
      : "apps/api/dist/secure-reader-ui",
  );
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  const principals = new WeakMap<FastifyRequest, Principal>();
  const adminPasswordHash = o.adminPassword?.passwordHash;
  async function audit(
    c: PoolClient,
    event: string,
    p?: Principal,
    resource?: string,
    outcome = "ALLOW",
    subject?: string,
  ) {
    await c.query<ReaderSqlRow>(
      "INSERT INTO secure_reader.audit_events(actor_id,session_id,event,resource_id,outcome,subject_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        p?.id ?? null,
        p?.sessionId ?? null,
        event,
        resource ?? null,
        outcome,
        subject ?? null,
      ],
    );
  }
  async function rate(key: string, max: number) {
    const r = await o.pool.query<ReaderSqlRow>(
      "INSERT INTO secure_reader.rate_buckets(key,window_at,count) VALUES($1,floor(extract(epoch from now())/60),1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_buckets.window_at=excluded.window_at THEN rate_buckets.count+1 ELSE 1 END,window_at=excluded.window_at RETURNING count",
      [key],
    );
    const count = r.rows[0]?.count;
    if (count === undefined) throw new Denied(503);
    if (Number(count) > max) throw new Denied(429);
  }
  async function issueSession(c: PoolClient, u: ReaderSqlRow, deviceLabel: string) {
    const n = (
      await c.query<ReaderSqlRow>(
        "SELECT count(*) FROM secure_reader.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()",
        [u.id],
      )
    ).rows[0];
    if (!n) throw new Denied(503);
    if (Number(n.count) >= 5) throw new Denied(409);
    const token = secret(),
      id = randomUUID();
    await c.query<ReaderSqlRow>(
      "UPDATE secure_reader.users SET verified_at=coalesce(verified_at,now()) WHERE id=$1",
      [u.id],
    );
    await c.query<ReaderSqlRow>(
      "INSERT INTO secure_reader.sessions(id,token_hash,user_id,device_label,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')",
      [id, hash(token), u.id, deviceLabel],
    );
    await audit(c, "SESSION_CREATED", {
      id: u.id,
      sessionId: id,
      email: u.email,
      role: u.role,
      expiresAt: new Date(),
    });
    return { token };
  }
  async function auth(c: PoolClient, req: FastifyRequest): Promise<Principal> {
    const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)athena_reader_admin=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    const raw = bearer ?? cookie;
    if (!raw) throw new Denied(401);
    const csrfToken = hash("reader-csrf:" + raw);
    if (
      !bearer &&
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers.origin !== o.adminOrigin ||
        req.headers["x-reader-csrf"] !== csrfToken)
    )
      throw new Denied(403);
    const pre = await c.query<ReaderSqlRow>(
      "SELECT id,user_id FROM secure_reader.sessions WHERE token_hash=$1",
      [hash(raw)],
    );
    const preRow = pre.rows[0];
    if (!preRow) throw new Denied(401);
    const uid = preRow.user_id;
    const u = (
      await c.query<ReaderSqlRow>(
        "SELECT id,email,role,enabled,verified_at FROM secure_reader.users WHERE id=$1 FOR SHARE",
        [uid],
      )
    ).rows[0];
    const s = (
      await c.query<ReaderSqlRow>(
        "SELECT id,expires_at,revoked_at FROM secure_reader.sessions WHERE id=$1 AND token_hash=$2 FOR SHARE",
        [preRow.id, hash(raw)],
      )
    ).rows[0];
    if (
      !u?.enabled ||
      !u.verified_at ||
      !s ||
      s.revoked_at ||
      s.expires_at <= new Date()
    )
      throw new Denied(401);
    const p = {
      csrfToken,
      id: u.id,
      sessionId: s.id,
      email: u.email,
      role: u.role,
      expiresAt: s.expires_at,
    } satisfies Principal;
    principals.set(req, p);
    return p;
  }
  async function authorized<T>(
    req: FastifyRequest,
    fn: (c: PoolClient, p: Principal) => Promise<T>,
    admin = false,
  ) {
    return transaction(o.pool, async (c) => {
      const p = await auth(c, req);
      if (admin && p.role !== "ADMIN") throw new Denied(403);
      return fn(c, p);
    });
  }
  async function access(c: PoolClient, p: Principal, id: string, page?: number) {
    const d = (
      await c.query<ReaderSqlRow>(
        "SELECT * FROM secure_reader.documents WHERE id=$1 AND removed_at IS NULL FOR SHARE",
        [id],
      )
    ).rows[0];
    const g = (
      await c.query<ReaderSqlRow>(
        "SELECT * FROM secure_reader.grants WHERE user_id=$1 AND document_id=$2 FOR SHARE",
        [p.id, id],
      )
    ).rows[0];
    if (
      !d ||
      !g ||
      g.revoked_at ||
      g.expires_at <= new Date() ||
      (d.sector === "founder" && p.role !== "ADMIN") ||
      (page !== undefined && page > d.page_count)
    )
      throw new Denied();
    return { ...d, grantVersion: g.version };
  }
  async function previewAccess(c: PoolClient, p: Principal, id: string, page: number) {
    if (p.role !== "ADMIN") throw new Denied(403);
    const d = (
      await c.query<ReaderSqlRow>(
        "SELECT * FROM secure_reader.documents WHERE id=$1 AND removed_at IS NULL FOR SHARE",
        [id],
      )
    ).rows[0];
    if (!d || page > d.page_count) throw new Denied();
    return { ...d, grantVersion: 0 };
  }
  app.addHook("onRequest", async (req, reply) => {
    // Missing or unreadable governance state denies the entire Reader module.
    if ((await o.emergencyStopActive?.()) !== false) throw new Denied(503);
    reply
      .header("cache-control", "no-store, private")
      .header("pragma", "no-cache")
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("cross-origin-resource-policy", "same-origin");
    await rate("request-ip:" + hash(req.ip), 180);
    const origin = req.headers.origin;
    if (origin && origin !== o.adminOrigin) throw new Denied(403);
    if (origin) {
      reply
        .header("access-control-allow-origin", o.adminOrigin)
        .header("vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      reply
        .header("access-control-allow-methods", "GET, POST, PUT, DELETE")
        .header("access-control-allow-headers", "Authorization, Content-Type");
      return reply.code(204).send();
    }
  });
  app.setErrorHandler(async (error, req, reply) => {
    let status =
      error instanceof Denied ? error.status : error instanceof ZodError ? 400 : 500;
    if (
      error instanceof Error &&
      "code" in error &&
      String(error.code).startsWith("FST_")
    )
      status = 400;
    try {
      await transaction(o.pool, (c) =>
        audit(c, "REQUEST_DENIED", principals.get(req), undefined, "DENY"),
      );
    } catch {
      status = 503;
    }
    return reply.code(status).send({
      error: status === 429 ? "Rate limit exceeded" : "Request unavailable",
    });
  });
  app.setNotFoundHandler(async (req, reply) => {
    await transaction(o.pool, (c) =>
      audit(c, "ROUTE_DENIED", principals.get(req), undefined, "DENY"),
    );
    return reply.code(404).send({ error: "Request unavailable" });
  });
  const readiness = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!o.allowPdfProcessing) return reply.code(503).send({ status: "unavailable" });
    await o.pool.query<ReaderSqlRow>("SELECT 1 FROM secure_reader.users LIMIT 1");
    return { status: "ready" };
  };
  app.get("/health", readiness);
  app.get("/ready", readiness);
  app.get("/admin.html", async (_req, reply) => {
    try {
      return reply
        .type("text/html; charset=utf-8")
        .send(await readFile(path.join(assetsDirectory, "admin.html")));
    } catch {
      return reply.code(503).send({ error: "Administrator interface unavailable" });
    }
  });
  app.get("/assets/:file", async (request, reply) => {
    const file = z
      .string()
      .regex(/^[A-Za-z0-9_-]+\.(?:js|css|svg)$/)
      .parse((request.params as { file: string }).file);
    try {
      const bytes = await readFile(path.join(assetsDirectory, "assets", file));
      const extension = path.extname(file);
      return reply
        .type(
          extension === ".js"
            ? "text/javascript"
            : extension === ".css"
              ? "text/css"
              : "image/svg+xml",
        )
        .send(bytes);
    } catch {
      return reply.code(404).send({ error: "Request unavailable" });
    }
  });
  app.post("/auth/start", async (req, reply) => {
    const b = LoginStart.parse(req.body);
    await rate("login-ip:" + hash(req.ip), 10);
    await rate("login-email:" + hash(b.email), 5);
    const u = (
      await o.pool.query<ReaderSqlRow>(
        "SELECT id FROM secure_reader.users WHERE email=$1 AND enabled=true",
        [b.email],
      )
    ).rows[0];
    if (u && o.mailer) {
      const code = secret();
      await o.pool.query<ReaderSqlRow>(
        "INSERT INTO secure_reader.challenges(hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [hash(code), u.id],
      );
      try {
        await o.mailer.send(b.email, code);
      } catch {
        await o.pool.query<ReaderSqlRow>(
          "DELETE FROM secure_reader.challenges WHERE hash=$1",
          [hash(code)],
        );
        return reply.code(202).send({
          message:
            "If invited, use the verification code from your administrator or email.",
        });
      }
      await o.pool.query<ReaderSqlRow>(
        "UPDATE secure_reader.challenges SET used_at=now() WHERE user_id=$1 AND hash<>$2 AND used_at IS NULL",
        [u.id, hash(code)],
      );
    }
    return reply.code(202).send({
      message:
        "If invited, use the verification code from your administrator or email.",
    });
  });
  app.post("/auth/finish", async (req) => {
    const b = LoginFinish.parse(req.body);
    await rate("finish:" + hash(req.ip), 20);
    return transaction(o.pool, async (c) => {
      const u = (
        await c.query<ReaderSqlRow>(
          "SELECT * FROM secure_reader.users WHERE email=$1 FOR UPDATE",
          [b.email],
        )
      ).rows[0];
      if (!u?.enabled) throw new Denied(401);
      const challenge = (
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.challenges SET used_at=now() WHERE hash=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now() RETURNING hash",
          [hash(b.code), u.id],
        )
      ).rows[0];
      if (!challenge) throw new Denied(401);
      return issueSession(c, u, b.deviceLabel);
    });
  });
  app.post("/auth/admin-password", async (req, reply) => {
    const b = AdminPasswordLogin.parse(req.body);
    await rate("admin-password-ip:" + hash(req.ip), 5);
    await rate("admin-password-email:" + hash(b.email), 5);
    if (
      !adminPasswordHash ||
      b.email !== o.adminPassword?.email ||
      !(await verifyPassword(adminPasswordHash, b.password))
    )
      throw new Denied(401);
    const session = await transaction(o.pool, async (c) => {
      const u = (
        await c.query<ReaderSqlRow>(
          "SELECT * FROM secure_reader.users WHERE email=$1 FOR UPDATE",
          [b.email],
        )
      ).rows[0];
      if (!u?.enabled || !u.verified_at || u.role !== "ADMIN") throw new Denied(401);
      return issueSession(c, u, b.deviceLabel);
    });
    if (req.headers.origin === o.adminOrigin) {
      reply.header(
        "set-cookie",
        `athena_reader_admin=${session.token}; Path=/api/secure-reader; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`,
      );
    }
    return session;
  });
  app.get("/session", (req) =>
    authorized(req, (_c, p) =>
      Promise.resolve({
        id: p.sessionId,
        email: p.email,
        role: p.role,
        expiresAt: p.expiresAt.toISOString(),
        csrfToken: p.csrfToken,
      }),
    ),
  );
  app.get("/sessions", (req) =>
    authorized(
      req,
      async (c, p) =>
        (
          await c.query<ReaderSqlRow>(
            'SELECT id,device_label AS "deviceLabel",created_at AS "createdAt",expires_at AS "expiresAt" FROM secure_reader.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',
            [p.id],
          )
        ).rows,
    ),
  );
  app.delete("/sessions/:id", (req) =>
    authorized(req, async (c, p) => {
      const id = Id.parse((req.params as { id: string }).id);
      await c.query<ReaderSqlRow>(
        "UPDATE secure_reader.sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2",
        [id, p.id],
      );
      await audit(c, "SESSION_REVOKED", p, id);
      return { ok: true };
    }),
  );
  app.get("/reader/documents", (req) =>
    authorized(req, async (c, p) => {
      const rows = (
        await c.query<ReaderSqlRow>(
          "SELECT d.* FROM secure_reader.documents d WHERE d.removed_at IS NULL AND ($2='ADMIN' OR (d.sector<>'founder' AND EXISTS (SELECT 1 FROM secure_reader.grants g WHERE g.document_id=d.id AND g.user_id=$1 AND g.revoked_at IS NULL AND g.expires_at>now()))) ORDER BY d.title",
          [p.id, p.role],
        )
      ).rows;
      return rows.map(publicDoc);
    }),
  );
  app.post("/reader/tickets", async (req) => {
    const b = PageRequest.parse(req.body);
    const p = await authorized(req, (_c, p) => Promise.resolve(p));
    await rate("page:" + p.id, 40);
    return authorized(req, async (c, current) => {
      const d =
        current.role === "ADMIN"
          ? await previewAccess(c, current, b.documentId, b.page)
          : await access(c, current, b.documentId, b.page);
      const ticket = secret();
      await c.query<ReaderSqlRow>(
        "INSERT INTO secure_reader.page_tickets(hash,session_id,user_id,document_id,page,version,grant_version,admin_preview,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '30 seconds')",
        [
          hash(ticket),
          current.sessionId,
          current.id,
          d.id,
          b.page,
          d.version,
          d.grantVersion,
          current.role === "ADMIN",
        ],
      );
      await audit(c, "PAGE_TICKET_ISSUED", current, d.id);
      return { ticket, expiresInSeconds: 30 };
    });
  });
  app.post("/reader/page", async (req, reply) => {
    const b = Redeem.parse(req.body);
    // Commit consumption before rendering: timeout/failure never re-enables ticket.
    const t = await authorized(req, async (c, p) => {
      const t = (
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.page_tickets SET used_at=now() WHERE hash=$1 AND user_id=$2 AND session_id=$3 AND used_at IS NULL AND expires_at>now() RETURNING *",
          [hash(b.ticket), p.id, p.sessionId],
        )
      ).rows[0];
      if (!t) throw new Denied();
      if (t.admin_preview) await previewAccess(c, p, t.document_id, t.page);
      else await access(c, p, t.document_id, t.page);
      return t;
    });
    const png = await authorized(req, async (c, p) => {
      const d = t.admin_preview
        ? await previewAccess(c, p, t.document_id, t.page)
        : await access(c, p, t.document_id, t.page);
      if (
        d.version !== t.version ||
        d.grantVersion !== t.grant_version ||
        t.expires_at <= new Date()
      )
        throw new Denied();
      if (!o.allowPdfProcessing) throw new Denied(503);
      const pdf = await o.objects.get(d.object_key);
      if (hash(pdf) !== d.sha256) throw new Denied(503);
      // Public random session ID is not a bearer token; no session secret is watermarked.
      const label = `${p.email} | ${d.id} | ${p.sessionId.slice(0, 8)} | ${new Date().toISOString()}`;
      const image = await o.renderer.page(
        pdf,
        t.page,
        label,
        Watermark.parse(d.watermark),
      );
      if (t.admin_preview) await previewAccess(c, p, t.document_id, t.page);
      else await access(c, p, t.document_id, t.page);
      if (p.expiresAt <= new Date() || t.expires_at <= new Date())
        throw new Denied(401);
      await audit(
        c,
        t.admin_preview ? "ADMIN_PREVIEW_DELIVERED" : "PAGE_DELIVERED",
        p,
        d.id,
      );
      return image;
    });
    return reply.type("image/png").send(png);
  });
  app.get("/admin/state", (req) =>
    authorized(
      req,
      async (c) => ({
        users: (
          await c.query<ReaderSqlRow>(
            "SELECT id,email,role,enabled,verified_at FROM secure_reader.users ORDER BY email",
          )
        ).rows,
        documents: (
          await c.query<ReaderSqlRow>(
            "SELECT id,title,sector,classification,page_count,version,removed_at,watermark,sha256 FROM secure_reader.documents ORDER BY title",
          )
        ).rows,
        documentVersions: (
          await c.query<ReaderSqlRow>(
            "SELECT document_id,version,sha256,page_count,title,created_at FROM secure_reader.document_versions ORDER BY document_id,version DESC",
          )
        ).rows,
        grants: (
          await c.query<ReaderSqlRow>(
            "SELECT * FROM secure_reader.grants ORDER BY expires_at DESC",
          )
        ).rows,
        sessions: (
          await c.query<ReaderSqlRow>(
            "SELECT id,user_id,device_label,expires_at,revoked_at FROM secure_reader.sessions ORDER BY created_at DESC LIMIT 200",
          )
        ).rows,
        audit: (
          await c.query<ReaderSqlRow>(
            "SELECT * FROM secure_reader.audit_events ORDER BY id DESC LIMIT 200",
          )
        ).rows,
      }),
      true,
    ),
  );
  app.post("/admin/invitations", async (req, reply) => {
    const b = Invite.parse(req.body);
    const result = await authorized(
      req,
      async (c, p) => {
        if (b.delivery === "email" && !o.mailer) throw new Denied(503);
        const id = randomUUID();
        const row = (
          await c.query<ReaderSqlRow>(
            "INSERT INTO secure_reader.users(id,email,role) VALUES($1,$2,'READER') ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id,enabled,role",
            [id, b.email],
          )
        ).rows[0];
        if (!row) throw new Denied(503);
        if (!row.enabled || row.role !== "READER") throw new Denied(403);
        const code = secret();
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.challenges SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [row.id],
        );
        await c.query<ReaderSqlRow>(
          "INSERT INTO secure_reader.challenges(hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
          [hash(code), row.id],
        );
        await audit(
          c,
          b.delivery === "manual" ? "RECIPIENT_INVITED_MANUAL" : "RECIPIENT_INVITED",
          p,
          row.id,
        );
        return { id: row.id, code };
      },
      true,
    );
    if (b.delivery === "manual") {
      return reply
        .code(201)
        .send({ id: result.id, code: result.code, expiresInSeconds: 600 });
    }
    try {
      await o.mailer!.send(b.email, result.code);
    } catch {
      await o.pool.query<ReaderSqlRow>(
        "DELETE FROM secure_reader.challenges WHERE hash=$1",
        [hash(result.code)],
      );
      throw new Denied(503);
    }
    return reply.code(201).send({ id: result.id });
  });
  app.post("/admin/grants", async (req, reply) => {
    const b = Grant.parse(req.body);
    await authorized(
      req,
      async (c, p) => {
        const u = (
          await c.query<ReaderSqlRow>(
            "SELECT * FROM secure_reader.users WHERE id=$1 FOR SHARE",
            [b.userId],
          )
        ).rows[0];
        const d = (
          await c.query<ReaderSqlRow>(
            "SELECT * FROM secure_reader.documents WHERE id=$1 AND removed_at IS NULL FOR SHARE",
            [b.documentId],
          )
        ).rows[0];
        if (
          !u?.enabled ||
          !d ||
          Date.parse(b.expiresAt) <= Date.now() ||
          (d.sector === "founder" && u.role !== "ADMIN")
        )
          throw new Denied(403);
        await c.query<ReaderSqlRow>(
          "INSERT INTO secure_reader.grants(user_id,document_id,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id,document_id) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=NULL,version=grants.version+1",
          [b.userId, b.documentId, b.expiresAt],
        );
        await audit(c, "GRANT_SET", p, b.documentId, "ALLOW", b.userId);
      },
      true,
    );
    return reply.code(201).send({ ok: true });
  });
  app.delete("/admin/grants/:userId/:documentId", (req) =>
    authorized(
      req,
      async (c, p) => {
        const b = z.object({ userId: Id, documentId: Id }).parse(req.params);
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.grants SET revoked_at=now(),version=version+1 WHERE user_id=$1 AND document_id=$2",
          [b.userId, b.documentId],
        );
        await audit(c, "GRANT_REVOKED", p, b.documentId, "ALLOW", b.userId);
        return { ok: true };
      },
      true,
    ),
  );
  app.post("/admin/users/:id/disable", (req) =>
    authorized(
      req,
      async (c, p) => {
        const id = Id.parse((req.params as { id: string }).id);
        if (id === p.id) throw new Denied(403);
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.users SET enabled=false WHERE id=$1",
          [id],
        );
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.sessions SET revoked_at=now() WHERE user_id=$1",
          [id],
        );
        await audit(c, "USER_DISABLED", p, id);
        return { ok: true };
      },
      true,
    ),
  );
  app.delete("/admin/sessions/:id", (req) =>
    authorized(
      req,
      async (c, p) => {
        const id = Id.parse((req.params as { id: string }).id);
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.sessions SET revoked_at=now() WHERE id=$1",
          [id],
        );
        await audit(c, "SESSION_REVOKED", p, id);
        return { ok: true };
      },
      true,
    ),
  );
  app.delete("/admin/documents/:id", (req) =>
    authorized(
      req,
      async (c, p) => {
        const id = Id.parse((req.params as { id: string }).id);
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.documents SET removed_at=now(),version=version+1 WHERE id=$1",
          [id],
        );
        await audit(c, "DOCUMENT_REMOVED", p, id);
        return { ok: true };
      },
      true,
    ),
  );
  app.post("/admin/documents/:id/preview-ticket", async (req) => {
    const id = Id.parse((req.params as { id: string }).id);
    const { page } = z
      .object({ page: z.number().int().min(1).max(100) })
      .strict()
      .parse(req.body);
    return authorized(
      req,
      async (c, p) => {
        await rate("page:" + p.id, 40);
        const d = await previewAccess(c, p, id, page);
        const ticket = secret();
        await c.query<ReaderSqlRow>(
          "INSERT INTO secure_reader.page_tickets(hash,session_id,user_id,document_id,page,version,grant_version,admin_preview,expires_at) VALUES($1,$2,$3,$4,$5,$6,0,true,now()+interval '30 seconds')",
          [hash(ticket), p.sessionId, p.id, id, page, d.version],
        );
        await audit(c, "ADMIN_PREVIEW_TICKET_ISSUED", p, id);
        return { ticket, expiresInSeconds: 30 };
      },
      true,
    );
  });
  app.put("/admin/documents/:id/watermark", (req) =>
    authorized(
      req,
      async (c, p) => {
        const id = Id.parse((req.params as { id: string }).id),
          style = Watermark.parse(req.body);
        await c.query<ReaderSqlRow>(
          "UPDATE secure_reader.documents SET watermark=$2,version=version+1 WHERE id=$1",
          [id, style],
        );
        await audit(c, "WATERMARK_CHANGED", p, id);
        return { ok: true };
      },
      true,
    ),
  );
  app.post("/admin/documents", async (req, reply) => {
    const b = UploadMeta.parse(req.query);
    const result = await authorized(
      req,
      async (c, p) => {
        if (!o.allowPdfProcessing) throw new Denied(503);
        const file = await req.file();
        if (!file || file.mimetype !== "application/pdf") throw new Denied(400);
        const bytes = await file.toBuffer();
        if (
          bytes.length > 5 * 1024 * 1024 ||
          !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
        )
          throw new Denied(400);
        const checksum = hash(bytes);
        if (b.expectedSha256 && b.expectedSha256 !== checksum) throw new Denied(400);
        let info;
        try {
          info = await o.renderer.inspect(bytes);
        } catch {
          throw new Denied(400);
        }
        if (!Number.isInteger(info.pages) || info.pages < 1 || info.pages > 100)
          throw new Denied(400);
        const id = b.replaceId ?? randomUUID(),
          key = randomUUID() + ".pdf";
        const classification =
          b.sector === "founder" ? "HIGHLY RESTRICTED" : "CONFIDENTIAL";
        if (b.replaceId) {
          const old = (
            await c.query<ReaderSqlRow>(
              "SELECT sector FROM secure_reader.documents WHERE id=$1 AND removed_at IS NULL FOR UPDATE",
              [id],
            )
          ).rows[0];
          if (!old || old.sector !== b.sector) throw new Denied(400);
        }
        await o.objects.put(key, bytes);
        let version = 1;
        if (b.replaceId) {
          const updated = await c.query<ReaderSqlRow>(
            "UPDATE secure_reader.documents SET object_key=$2,sha256=$3,page_count=$4,title=$5,version=version+1 WHERE id=$1 RETURNING version",
            [id, key, checksum, info.pages, b.title],
          );
          const updatedRow = updated.rows[0];
          if (!updatedRow) throw new Denied(503);
          version = updatedRow.version;
        } else
          await c.query<ReaderSqlRow>(
            "INSERT INTO secure_reader.documents(id,title,sector,classification,object_key,sha256,page_count) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [id, b.title, b.sector, classification, key, checksum, info.pages],
          );
        await c.query<ReaderSqlRow>(
          "INSERT INTO secure_reader.document_versions(document_id,version,object_key,sha256,page_count,title) VALUES($1,$2,$3,$4,$5,$6)",
          [id, version, key, checksum, info.pages, b.title],
        );
        await audit(c, b.replaceId ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED", p, id);
        return {
          id,
          title: b.title,
          sector: b.sector,
          classification,
          version,
          pageCount: info.pages,
          sha256: checksum,
        };
      },
      true,
    );
    return reply.code(201).send(result);
  });
}
