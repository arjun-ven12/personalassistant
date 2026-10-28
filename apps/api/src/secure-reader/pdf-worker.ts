import { createCanvas } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const chunks: Buffer[] = [];
let size = 0;
for await (const value of process.stdin) {
  const chunk: unknown = value;
  if (!Buffer.isBuffer(chunk)) throw Error("Invalid PDF input");
  size += chunk.length;
  if (size > 5 * 1024 * 1024) throw Error("PDF too large");
  chunks.push(chunk);
}
const bytes = Buffer.concat(chunks);
if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
  throw Error("PDF signature required");
const task = getDocument({
  data: new Uint8Array(bytes),
  disableFontFace: true,
  useSystemFonts: false,
  enableXfa: false,
  verbosity: 0,
  standardFontDataUrl: fileURLToPath(
    new URL("standard_fonts/", import.meta.resolve("pdfjs-dist/package.json")),
  ),
  wasmUrl: fileURLToPath(
    new URL("wasm/", import.meta.resolve("pdfjs-dist/package.json")),
  ),
});
const doc = await task.promise;
if (doc.numPages < 1 || doc.numPages > 100) throw Error("Page limit");
if (process.argv[2] === "inspect") {
  process.stdout.write(JSON.stringify({ pages: doc.numPages }));
} else {
  const page = Number(process.argv[2]);
  if (!Number.isInteger(page) || page < 1 || page > doc.numPages)
    throw Error("Page out of range");
  const p = await doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({
    scale: Math.min(1.7, 1600 / base.width, 2200 / base.height),
  });
  if (
    !Number.isFinite(viewport.width * viewport.height) ||
    viewport.width * viewport.height > 3_600_000 ||
    viewport.width < 1 ||
    viewport.height < 1
  )
    throw Error("Invalid dimensions");
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await p.render({
    canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;
  process.stdout.write(canvas.toBuffer("image/png"));
  canvas.width = 1;
  canvas.height = 1;
}
await task.destroy();
