import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  validateDocumentImage,
  cleanDocumentImage,
  pageBounds,
  TesseractDocumentOcr,
  textSkew,
} from "./providers.js";
import { classifyDocument, sensitiveDocument } from "./privacy.js";
import { FileDocumentAssets } from "./assets.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const image = () =>
  sharp({ create: { width: 300, height: 400, channels: 3, background: "white" } })
    .png()
    .toBuffer();
describe("document decoder, local OCR and private asset boundaries", () => {
  it("rejects unsupported, corrupted, misleading MIME, huge bytes and decompression bounds", async () => {
    for (const [b, mime] of [
      [Buffer.alloc(7 * 1024 * 1024), "image/png"],
      [Buffer.from('<svg onload="bad"/>'), "image/png"],
      [
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array<number>(24).fill(0)]),
        "image/png",
      ],
      [await image(), "image/jpeg"],
      [await image(), "application/octet-stream"],
    ] as const)
      await expect(validateDocumentImage(b, mime)).rejects.toThrow();
    const large = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(validateDocumentImage(large, "image/png")).rejects.toThrow();
  });
  it("blank, glare and ambiguous scenes retain source and surface low-confidence cleanup warnings", async () => {
    const source = await image();
    const digest = Buffer.from(source);
    const result = await cleanDocumentImage(source, true);
    expect(result.warnings.join()).toContain("Blank");
    expect(result.warnings.join()).toContain("full frame retained");
    expect(source).toEqual(digest);
    expect((await sharp(result.thumbnail).metadata()).width).toBeLessThanOrEqual(240);
    expect(await pageBounds(source)).toBeNull();
  });
  it("high-confidence bright page on a dark background is cropped conservatively", async () => {
    const page = await sharp({
      create: { width: 300, height: 400, channels: 3, background: "#222" },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 220, height: 300, channels: 3, background: "white" },
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 50,
        },
      ])
      .png()
      .toBuffer();
    const bounds = await pageBounds(page);
    expect(bounds).not.toBeNull();
    const cleaned = await cleanDocumentImage(page, true);
    expect((await sharp(cleaned.bytes).metadata()).width).toBeLessThan(300);
  });
  it("normalizes orientation, preserves color and handles blurred text without invented OCR", async () => {
    const source = await sharp({
      create: { width: 500, height: 300, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const cleaned = await cleanDocumentImage(source, true);
    const meta = await sharp(cleaned.bytes).metadata();
    expect(meta.height).toBeGreaterThan(meta.width);
    const blur = await sharp(await image())
      .blur(8)
      .png()
      .toBuffer();
    expect((await cleanDocumentImage(blur, true)).warnings.length).toBeGreaterThan(0);
  });
  it("corrects small text skew only when projection evidence is strong", async () => {
    const source = await sharp(
      Buffer.from(
        '<svg width="700" height="500"><rect width="100%" height="100%" fill="white"/><g fill="black">' +
          [80, 140, 200, 260, 320, 380]
            .map((y) => `<rect x="80" y="${y}" width="520" height="9"/>`)
            .join("") +
          "</g></svg>",
      ),
    )
      .png()
      .toBuffer();
    const tilted = await sharp(source)
      .rotate(2, { background: "white" })
      .png()
      .toBuffer();
    expect(await textSkew(source)).toBe(0);
    expect(await textSkew(tilted)).toBeCloseTo(-2, 0);
    expect((await cleanDocumentImage(tilted, true)).warnings.join()).toContain(
      "skew corrected",
    );
  });
  it("recognizes a synthetic printed page using real bundled local Tesseract, not a provider fixture", async () => {
    const printed = await sharp(
      Buffer.from(
        '<svg width="1000" height="260"><rect width="100%" height="100%" fill="white"/><text x="40" y="130" font-size="62" font-family="sans-serif" fill="black">Gradient descent study notes</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    const result = await new TesseractDocumentOcr().extract(printed);
    expect(result.text.toLowerCase()).toContain("gradient");
    expect(result.provider).toBe("tesseract.local");
    expect(
      result.layout?.words.some((w) => w.text.toLowerCase().includes("gradient")),
    ).toBe(true);
    expect(result.layout?.width).toBe(1000);
    expect(result.version).toContain("7.0.0");
    expect(result.confidence).toBeGreaterThan(0.65);
  }, 60000);
  it("secret/PII and receipts cannot masquerade as automatic study memory", () => {
    for (const text of [
      "password: fixture-only",
      "api_key = sk-fixture123456789",
      "account number 1234567890",
      "me@example.test",
      "Passport identity card",
    ])
      expect(sensitiveDocument(text)).toBe(true);
    expect(classifyDocument("TOTAL receipt subtotal 52.10").documentType).toBe(
      "RECEIPT",
    );
    expect(classifyDocument("gradient descent learning theorem").documentType).toBe(
      "STUDY",
    );
    const note = classifyDocument(
      "Project: Athena\n2026-10-18\nTODO: Review the routing design.",
    );
    expect(note.understanding.dates).toEqual(["2026-10-18"]);
    expect(note.understanding.entities).toEqual(["Athena"]);
    expect(note.understanding.actionItems).toEqual([
      "TODO: Review the routing design.",
    ]);
    expect(
      classifyDocument("password: fixture-only").understanding.memoryCandidate,
    ).toBe(false);
  });
  it("opaque tenant asset reads cannot cross company or accept traversal/symlink paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-assets-"));
    try {
      const store = new FileDocumentAssets(root),
        s = { ownerId: crypto.randomUUID(), companyId: crypto.randomUUID() };
      const ref = await store.put(s, await image());
      expect(await store.read(s, ref)).toBeInstanceOf(Buffer);
      await expect(
        store.read({ ...s, companyId: crypto.randomUUID() }, ref),
      ).rejects.toThrow();
      await expect(store.read(s, "../escape")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
