import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import type { PdfRenderPort } from "./render.js";
import { PdfRenderer, watermark } from "./render.js";
import type { Watermark } from "./contracts.js";
import { z } from "zod";
const MAX_PDF = 5 * 1024 * 1024,
  MAX_IMAGE = 8 * 1024 * 1024;
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function createRenderService(
  secret: string,
  renderer: PdfRenderer = new PdfRenderer(),
) {
  if (secret.length < 32) throw Error("Renderer secret too short");
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_PDF,
    trustProxy: false,
    requestTimeout: 12000,
  });
  app.addContentTypeParser(
    "application/pdf",
    { parseAs: "buffer", bodyLimit: MAX_PDF },
    (_req, body, done) => done(null, body),
  );
  app.addHook("onRequest", async (req, reply) => {
    if (!equalSecret(req.headers.authorization ?? "", `Bearer ${secret}`))
      return reply.code(401).send({ error: "Unauthorized" });
  });
  app.setErrorHandler((_error, _req, reply) =>
    reply.code(400).send({ error: "Render unavailable" }),
  );
  app.post("/inspect", async (req, reply) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length > MAX_PDF)
      return reply.code(400).send({ error: "Invalid input" });
    return renderer.inspect(b);
  });
  app.post<{ Params: { page: string } }>("/pages/:page", async (req, reply) => {
    const page = Number(req.params.page),
      b = req.body;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100 ||
      !Buffer.isBuffer(b) ||
      b.length > MAX_PDF
    )
      return reply.code(400).send({ error: "Invalid input" });
    const png = await renderer.run(b, page);
    if (png.length > MAX_IMAGE)
      return reply.code(400).send({ error: "Render unavailable" });
    return reply.type("image/png").header("cache-control", "no-store").send(png);
  });
  return app;
}
export class RemotePdfRenderer implements PdfRenderPort {
  constructor(
    private origin: string,
    private secret: string,
  ) {
    const u = new URL(origin);
    if (
      u.protocol !== "http:" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      secret.length < 32
    )
      throw Error("Internal renderer configuration invalid");
    this.origin = u.origin;
  }
  private async request(path: string, pdf: Buffer) {
    if (pdf.length > MAX_PDF) throw Error("PDF too large");
    const r = await fetch(this.origin + path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secret}`,
        "content-type": "application/pdf",
      },
      body: new Uint8Array(pdf),
      signal: AbortSignal.timeout(12000),
      redirect: "error",
      cache: "no-store",
    });
    if (!r.ok) throw Error("Remote render denied");
    const chunks: Uint8Array[] = [];
    let n = 0;
    const stream = r.body?.getReader();
    if (!stream) throw Error("Empty render");
    for (;;) {
      const x = await stream.read();
      if (x.done) break;
      n += x.value.length;
      if (n > MAX_IMAGE) {
        await stream.cancel();
        throw Error("Render response too large");
      }
      chunks.push(x.value);
    }
    return Buffer.concat(chunks);
  }
  async inspect(pdf: Buffer) {
    const result: unknown = JSON.parse(
      (await this.request("/inspect", pdf)).toString(),
    );
    return z
      .object({ pages: z.number().int().min(1).max(100) })
      .strict()
      .parse(result);
  }
  async page(
    pdf: Buffer,
    page: number,
    attribution: string,
    style: z.infer<typeof Watermark>,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > 100) throw Error("Invalid page");
    return watermark(await this.request("/pages/" + page, pdf), attribution, style);
  }
}
