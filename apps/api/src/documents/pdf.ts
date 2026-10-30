import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  beginText,
  endText,
  setFontAndSize,
  setTextRenderingMode,
  TextRenderingMode,
  setTextMatrix,
  showText,
} from "pdf-lib";
import { DocumentRecordSchema, type DocumentRecord } from "@alexa-control/shared";

/** Local derivation only. No URLs, scripts, attachments, or model calls. */
export async function searchableDocumentPdf(raw: DocumentRecord, images: Buffer[]) {
  const doc = DocumentRecordSchema.parse(raw);
  if (
    images.length !== doc.pages.length ||
    doc.pages.some(
      (p) =>
        p.ocrStatus !== "COMPLETE" ||
        !p.ocr?.text.trim() ||
        !p.ocr.layout?.words.length,
    )
  )
    throw Error("PDF_OCR_LAYOUT_REQUIRED");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const sourceFont = new URL(
    "../../assets/documents/NotoSans-Regular.ttf",
    import.meta.url,
  );
  const builtFont = new URL("./assets/documents/NotoSans-Regular.ttf", import.meta.url);
  const font = await pdf.embedFont(
    await readFile(existsSync(sourceFont) ? sourceFont : builtFont),
    { subset: true },
  );
  pdf.setTitle(doc.title);
  pdf.setCreator("Athena document scanner");
  pdf.setCreationDate(new Date(doc.createdAt));
  pdf.setKeywords(doc.tags);
  pdf.setSubject(
    `Athena document ${doc.id}; pages=${doc.pages.length}; OCR=${[...new Set(doc.pages.map((p) => p.ocr!.language ?? "und"))].join(",")}`,
  );
  for (const [index, record] of doc.pages.entries()) {
    const image = await pdf.embedJpg(images[index]!);
    const scale = 612 / image.width,
      height = image.height * scale;
    const page = pdf.addPage([612, height]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height });
    const layout = record.ocr!.layout!;
    if (layout.width !== image.width || layout.height !== image.height)
      throw Error("PDF_LAYOUT_IMAGE_MISMATCH");
    const fontKey = page.node.newFontDictionary("OCR", font.ref);
    for (const word of layout.words) {
      // Reject unsupported glyphs rather than silently corrupt searchable text.
      const encoded = font.encodeText(word.text);
      const size = (word.bottom - word.top) * height;
      const width = font.widthOfTextAtSize(word.text, size);
      if (!width) continue;
      page.pushOperators(
        beginText(),
        setTextRenderingMode(TextRenderingMode.Invisible),
        setFontAndSize(fontKey, size),
        setTextMatrix(
          ((word.right - word.left) * 612) / width,
          0,
          0,
          1,
          word.left * 612,
          (1 - word.bottom) * height + size * 0.18,
        ),
        showText(encoded),
        endText(),
      );
    }
  }
  const bytes = Buffer.from(await pdf.save());
  if (bytes.length > 32 * 1024 * 1024) throw Error("PDF_SIZE_LIMIT");
  return bytes;
}
