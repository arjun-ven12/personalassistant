import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  DocumentRecordSchema,
  DocumentPageEditSchema,
  DocumentLayoutSchema,
} from "@alexa-control/shared";
import { searchableDocumentPdf } from "./pdf.js";

const texts = ["Café naïve — study (page 1).", "Second page: résumé + 42!"];
function document() {
  const now = new Date().toISOString();
  return DocumentRecordSchema.parse({
    id: crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    companyId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    sourceType: "IMPORT",
    title: "Study scan",
    documentType: "STUDY",
    collection: "Study",
    tags: ["learning"],
    summary: "",
    stage: "COMPLETE",
    pages: texts.map((text, i) => ({
      number: i + 1,
      original: crypto.randomUUID(),
      originalDigest: "a".repeat(64),
      cleaned: crypto.randomUUID(),
      thumbnail: null,
      ocrStatus: "COMPLETE",
      warnings: [],
      memoryIds: [],
      ocr: {
        text,
        confidence: 0.95,
        language: "en",
        provider: "fixture",
        version: "test",
        timestamp: now,
        latencyMs: 0,
        costMinor: 0,
        costCurrency: "USD",
        layout: {
          width: 600,
          height: 800,
          words: [{ text, left: 0.1, top: 0.1, right: 0.85, bottom: 0.15 }],
        },
      },
    })),
    memoryStatus: "OFF",
    neverMemory: false,
    sensitive: false,
    version: 1,
    attempt: 1,
    leaseUntil: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  });
}
const images = () =>
  Promise.all(
    texts.map((_, i) =>
      sharp({
        create: {
          width: 600,
          height: 800,
          channels: 3,
          background: i ? "#bbffdd" : "#ffddbb",
        },
      })
        .jpeg({ quality: 92 })
        .toBuffer(),
    ),
  );
describe("searchable scan PDF", () => {
  it("embeds ordered images and selectable Unicode OCR that a separate PDF engine extracts", async () => {
    const doc = document(),
      source = await images();
    const bytes = await searchableDocumentPdf(doc, source);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
      verbosity: 0,
    });
    const pdf = await task.promise;
    try {
      expect(pdf.numPages).toBe(2);
      const metadata = await pdf.getMetadata();
      expect(metadata.info).toMatchObject({
        Title: "Study scan",
        Keywords: "learning",
      });
      for (const n of [1, 2]) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const extracted = content.items.map((t) => ("str" in t ? t.str : "")).join("");
        expect(extracted).toBe(texts[n - 1]);
        expect(extracted.toLowerCase()).toContain(n === 1 ? "study" : "résumé");
        const operators = await page.getOperatorList();
        expect(operators.fnArray).toContain(OPS.paintImageXObject);
        expect(operators.fnArray).toContain(OPS.setTextRenderingMode);
        // Raster comparison proves the invisible layer does not obscure the visible image.
        const viewport = page.getViewport({ scale: 600 / 612 });
        const canvas = createCanvas(600, 800);
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const raster = await sharp(canvas.toBuffer("image/png")).raw().toBuffer();
        const original = await sharp(source[n - 1])
          .removeAlpha()
          .raw()
          .toBuffer();
        const channels = raster.length / (600 * 800);
        for (const pixel of [0, 100 * 600 + 100, 400 * 600 + 300])
          for (let c = 0; c < 3; c++)
            expect(
              Math.abs(raster[pixel * channels + c]! - original[pixel * 3 + c]!),
            ).toBeLessThan(5);
      }
    } finally {
      await task.destroy();
    }
  });
  it("fails closed without OCR layout, on mismatched geometry, and missing pages", async () => {
    const d = document(),
      source = await images();
    await expect(searchableDocumentPdf(d, source.slice(1))).rejects.toThrow(
      "LAYOUT_REQUIRED",
    );
    d.pages[0]!.ocr!.layout!.width = 601;
    await expect(searchableDocumentPdf(d, source)).rejects.toThrow("MISMATCH");
    d.pages[0]!.ocr!.layout = null;
    await expect(searchableDocumentPdf(d, source)).rejects.toThrow("LAYOUT_REQUIRED");
  });
  it("bounds crop/rotation and OCR geometry, rejecting inverted or unbounded layouts", () => {
    expect(DocumentPageEditSchema.safeParse({ rotation: 45 }).success).toBe(false);
    expect(
      DocumentPageEditSchema.safeParse({
        crop: { left: 0.8, top: 0, right: 0.2, bottom: 1 },
      }).success,
    ).toBe(false);
    expect(
      DocumentLayoutSchema.safeParse({
        width: 600,
        height: 800,
        words: [{ text: "word", left: -1, top: 0, right: 1, bottom: 1 }],
      }).success,
    ).toBe(false);
  });
});
