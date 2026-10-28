import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Watermark } from "./contracts.js";
import type { z } from "zod";
export interface PdfRenderPort {
  inspect(pdf: Buffer): Promise<{ pages: number }>;
  page(
    pdf: Buffer,
    page: number,
    attribution: string,
    style: z.infer<typeof Watermark>,
  ): Promise<Buffer>;
}
export class PdfRenderer implements PdfRenderPort {
  private active = 0;
  async run(pdf: Buffer, page: number | "inspect"): Promise<Buffer> {
    if (this.active >= 2 || pdf.length > 5 * 1024 * 1024)
      throw Error("Renderer resource limit");
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        const productionWorker = process.env.NODE_ENV === "production";
        const child = spawn(
          process.execPath,
          [
            "--max-old-space-size=256",
            ...(productionWorker ? [] : ["--import", "tsx"]),
            fileURLToPath(
              new URL(
                productionWorker ? "./secure-reader-pdf-worker.js" : "./pdf-worker.ts",
                import.meta.url,
              ),
            ),
            String(page),
          ],
          {
            env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        const chunks: Buffer[] = [];
        let size = 0,
          settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) {
            child.kill("SIGKILL");
            reject(error);
          } else resolve(Buffer.concat(chunks));
        };
        const timer = setTimeout(() => finish(Error("Render timeout")), 10000);
        child.stdout.on("data", (b: Buffer) => {
          size += b.length;
          if (size > 8 * 1024 * 1024) finish(Error("Result limit"));
          else chunks.push(b);
        });
        child.stderr.resume();
        child.on("error", () => finish(Error("Renderer unavailable")));
        child.on("close", (code) =>
          finish(code === 0 ? undefined : Error("PDF rejected")),
        );
        child.stdin.on("error", () => finish(Error("PDF rejected")));
        child.stdin.end(pdf);
      });
    } finally {
      this.active--;
    }
  }
  async inspect(pdf: Buffer) {
    return JSON.parse((await this.run(pdf, "inspect")).toString()) as {
      pages: number;
    };
  }
  async page(
    pdf: Buffer,
    page: number,
    attribution: string,
    style: z.infer<typeof Watermark>,
  ) {
    return watermark(await this.run(pdf, page), attribution, style);
  }
}
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function watermark(
  png: Buffer,
  label: string,
  style: z.infer<typeof Watermark>,
) {
  const parsed = Watermark.parse(style);
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) throw Error("Invalid raster");
  const lines = label.match(/.{1,48}/gu) ?? [];
  const angle = parsed.placement === "diagonal" ? -27 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><g fill="#171717" opacity="${parsed.opacity}" font-family="sans-serif" font-size="${parsed.fontSize}" text-anchor="middle">${[0.18, 0.4, 0.62, 0.84].map((y) => `<text x="50%" y="${meta.height * y}" transform="rotate(${angle} ${meta.width / 2} ${meta.height * y})">${lines.map((line, n) => `<tspan x="50%" dy="${n ? parsed.fontSize + 4 : 0}">${xml(line)}</tspan>`).join("")}</text>`).join("")}</g></svg>`;
  return sharp(png)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}
