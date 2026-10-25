import sharp from "sharp";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createWorker } from "tesseract.js";
import type { z } from "zod";
import { DocumentOcrSchema } from "@alexa-control/shared";
const require = createRequire(import.meta.url);
export interface OcrProvider {
  readonly id: string;
  readonly version: string;
  extract(bytes: Buffer): Promise<z.infer<typeof DocumentOcrSchema>>;
}
export async function validateDocumentImage(bytes: Buffer, mime: string) {
  if (mime !== "image/jpeg" && mime !== "image/png") throw Error("IMAGE_MIME_DENIED");
  if (bytes.length > 6 * 1024 * 1024 || bytes.length < 16)
    throw Error("IMAGE_SIZE_DENIED");
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if ((mime === "image/jpeg" && !jpeg) || (mime === "image/png" && !png))
    throw Error("IMAGE_MIME_DENIED");
  const meta = await sharp(bytes, {
    limitInputPixels: 16_000_000,
    failOn: "warning",
    pages: 1,
  }).metadata();
  if (
    !meta.width ||
    !meta.height ||
    meta.width * meta.height > 16_000_000 ||
    (meta.pages ?? 1) !== 1 ||
    !["jpeg", "png"].includes(meta.format ?? "")
  )
    throw Error("IMAGE_DECODE_DENIED");
  // Decode fully before retaining a source; no SVG/PDF/URL or animated image path.
  await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" })
    .resize({ width: 64, height: 64, fit: "inside" })
    .raw()
    .toBuffer();
  return meta;
}
/** Conservative bright rectangular page detector; ambiguous/color scenes retain full frame. */
export async function pageBounds(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 16_000_000 })
    .rotate()
    .resize({ width: 240, height: 320, fit: "inside" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start]! < 190) continue;
    const stack = [start],
      component: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % w,
        y = Math.floor(i / w);
      for (const n of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ])
        if (n >= 0 && !seen[n] && data[n]! >= 190) {
          seen[n] = 1;
          stack.push(n);
        }
    }
    if (component.length > best.length) best = component;
  }
  if (best.length < w * h * 0.35 || best.length > w * h * 0.92) return null;
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (const i of best) {
    const x = i % w,
      y = Math.floor(i / w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (best.length / area < 0.94 || x0 < 3 || y0 < 3 || x1 > w - 4 || y1 > h - 4)
    return null;
  let outside = 0,
    count = 0;
  for (let i = 0; i < data.length; i++) {
    const x = i % w,
      y = Math.floor(i / w);
    if (x < x0 || x > x1 || y < y0 || y > y1) {
      outside += data[i]!;
      count++;
    }
  }
  if (!count || outside / count > 130) return null;
  return {
    left: Math.max(0, (x0 - 3) / w),
    top: Math.max(0, (y0 - 3) / h),
    right: Math.min(1, (x1 + 4) / w),
    bottom: Math.min(1, (y1 + 4) / h),
  };
}
export async function cleanDocumentImage(bytes: Buffer, enabled: boolean) {
  const oriented = await sharp(bytes, {
    limitInputPixels: 16_000_000,
    failOn: "warning",
  })
    .rotate()
    .toBuffer();
  const meta = await sharp(oriented).metadata();
  const bounds = enabled ? await pageBounds(oriented) : null;
  let image = sharp(oriented, { limitInputPixels: 16_000_000 });
  if (bounds && meta.width && meta.height) {
    const left = Math.floor(bounds.left * meta.width),
      top = Math.floor(bounds.top * meta.height);
    image = image.extract({
      left,
      top,
      width: Math.min(
        meta.width - left,
        Math.ceil((bounds.right - bounds.left) * meta.width),
      ),
      height: Math.min(
        meta.height - top,
        Math.ceil((bounds.bottom - bounds.top) * meta.height),
      ),
    });
  }
  const cropped = await image.png().toBuffer();
  const skew = enabled ? await textSkew(cropped) : 0;
  image = sharp(cropped, { limitInputPixels: 16_000_000 });
  if (skew) image = image.rotate(skew, { background: "white" });
  const output = await (
    enabled ? image.normalise({ lower: 1, upper: 99 }).sharpen({ sigma: 0.5 }) : image
  )
    .resize({ width: 2400, height: 3200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  const thumbnail = await sharp(output)
    .resize({ width: 240, height: 320, fit: "inside" })
    .jpeg({ quality: 75 })
    .toBuffer();
  const stats = await sharp(output).stats();
  return {
    bytes: output,
    thumbnail,
    warnings: [
      ...(skew
        ? ["Small text skew corrected; compare with the preserved original."]
        : []),
      ...(enabled && !bounds
        ? [
            "Page boundary confidence low; full frame retained. Perspective and glare corrections were not inferred.",
          ]
        : []),
      ...(stats.channels.every((c) => c.stdev < 3)
        ? ["Blank or low-contrast page; review original."]
        : []),
    ],
  };
}
/** Small-angle text projection only. Ambiguous/photo-like frames are not rotated. */
export async function textSkew(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 16_000_000 })
    .resize({ width: 480, height: 640, fit: "inside" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const points: Array<[number, number]> = [];
  for (let y = 2; y < info.height - 2; y++)
    for (let x = 2; x < info.width - 2; x++)
      if (data[y * info.width + x]! < 100) points.push([x, y]);
  const fraction = points.length / (info.width * info.height);
  if (fraction < 0.01 || fraction > 0.25) return 0;
  const score = (angle: number) => {
    const rows = new Uint32Array(info.height + 100);
    const tangent = Math.tan((angle * Math.PI) / 180);
    for (const [x, y] of points) {
      const row = Math.round(y + (x - info.width / 2) * tangent) + 50;
      if (row >= 0 && row < rows.length) rows[row]!++;
    }
    return rows.reduce((total, count) => total + count * count, 0);
  };
  const baseline = score(0);
  let best = baseline,
    selected = 0;
  for (let angle = -4; angle <= 4; angle += 0.5) {
    const candidate = score(angle);
    if (candidate > best) {
      best = candidate;
      selected = angle;
    }
  }
  return Math.abs(selected) < 4 && best > baseline * 1.18 ? selected : 0;
}
/** Fully local engine and bundled English data. Never downloads languages or sends pixels externally. */
export class TesseractDocumentOcr implements OcrProvider {
  readonly id = "tesseract.local";
  readonly version = "7.0.0-eng-1.0.0";
  private busy = false;
  async extract(bytes: Buffer) {
    if (this.busy) throw Error("OCR_BUSY");
    this.busy = true;
    const start = Date.now();
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = (async () => {
        worker = await createWorker("eng", 1, {
          langPath: join(dirname(require.resolve("@tesseract.js-data/eng")), "4.0.0"),
          gzip: true,
          cacheMethod: "none",
          logger: () => undefined,
          errorHandler: () => undefined,
        });
        if (expired) {
          await worker.terminate();
          throw Error("OCR_TIMEOUT");
        }
        const result = await worker.recognize(bytes, { rotateAuto: true });
        return DocumentOcrSchema.parse({
          text: result.data.text.slice(0, 50_000),
          confidence: result.data.confidence / 100,
          language: "en",
          provider: this.id,
          version: this.version,
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - start,
          costMinor: 0,
          costCurrency: "USD",
        });
      })();
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            void worker?.terminate().catch(() => undefined);
            reject(Error("OCR_TIMEOUT"));
          }, 40_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      await worker?.terminate().catch(() => undefined);
      this.busy = false;
    }
  }
}
