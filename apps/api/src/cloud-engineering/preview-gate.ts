import { createServer, request as httpRequest } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { z } from "zod";
export const CloudPreviewGrantSchema = z
  .object({
    workspaceId: z.string().uuid(),
    companyId: z.string().uuid(),
    previewId: z.string().uuid(),
    generation: z.number().int().positive(),
    port: z.literal(4173),
    healthPath: z.literal("/"),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(),
  })
  .strict();
/** Fixed loopback port, no model/caller-selected upstream host or credentials. */
export function createCloudPreviewGate(
  scope: { workspaceId: string; companyId: string; generation: number },
  load: () => Promise<unknown>,
  now: () => number = Date.now,
) {
  return createServer((req, res) => {
    void (async () => {
      try {
        const grant = CloudPreviewGrantSchema.parse(await load());
        if (
          grant.workspaceId !== scope.workspaceId ||
          grant.companyId !== scope.companyId ||
          grant.generation !== scope.generation ||
          Date.parse(grant.expiresAt) <= now()
        )
          throw Error();
        const url = new URL(req.url ?? "/", "https://preview.invalid");
        const parts = url.pathname.split("/");
        const cookie = req.headers.cookie
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("athena_preview="))
          ?.slice(15);
        const ticket = parts[1] === "p" ? parts[2] : cookie;
        const hash = createHash("sha256")
          .update(ticket ?? "")
          .digest("hex");
        if (
          !ticket ||
          !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
          !timingSafeEqual(Buffer.from(hash), Buffer.from(grant.tokenHash))
        )
          throw Error();
        if (parts[1] === "p") {
          res.setHeader(
            "set-cookie",
            `athena_preview=${ticket}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor((Date.parse(grant.expiresAt) - now()) / 1000))}`,
          );
          res.setHeader("location", "/");
          res.setHeader("referrer-policy", "no-referrer");
          res.setHeader("cache-control", "no-store");
          res.writeHead(303);
          res.end();
          return;
        }
        if (!["GET", "HEAD"].includes(req.method ?? "")) throw Error();
        // No cookies, Authorization, forwarding headers, or Athena session reach the app.
        const headers: Record<string, string> = {
          host: "127.0.0.1:4173",
          ...(typeof req.headers.accept === "string"
            ? { accept: req.headers.accept }
            : {}),
        };
        const proxy = httpRequest(
          {
            hostname: "127.0.0.1",
            port: grant.port,
            method: req.method,
            path: url.pathname + url.search,
            headers,
            timeout: 5000,
          },
          (upstream) => {
            res.writeHead(upstream.statusCode ?? 502, {
              "content-type":
                upstream.headers["content-type"] ?? "application/octet-stream",
              "cache-control": "no-store",
              "referrer-policy": "no-referrer",
              "x-content-type-options": "nosniff",
              "content-security-policy": "frame-ancestors 'none'",
            });
            upstream.pipe(res);
          },
        );
        proxy.on("timeout", () => proxy.destroy());
        proxy.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.on("aborted", () => proxy.destroy());
        proxy.end();
      } catch {
        res.writeHead(404, { "cache-control": "no-store" });
        res.end();
      }
    })();
  });
}
export async function readCloudPreviewGrant() {
  const file = "/run/athena/preview.json";
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    (stat.mode & 0o077) !== 0 ||
    stat.size > 4096
  )
    throw Error("Preview grant unavailable.");
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
