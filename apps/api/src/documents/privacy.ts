import type { DocumentRecord } from "@alexa-control/shared";
import { hasSensitiveMemoryContent } from "../memory/sensitive-content.js";
export function sensitiveDocument(text: string) {
  // Date punctuation must not make a date look like a telephone/account number.
  const numeric = text.replace(
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    " ",
  );
  return (
    hasSensitiveMemoryContent(text) ||
    /\b(?:password|passwd|secret|api[ _-]?key|credential|account[ _-]?(?:number|no)|passport|identity card|credit card|medical|confidential|date of birth)\b/i.test(
      text,
    ) ||
    /\b\d{8,19}\b/.test(numeric) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /\b(?:\+?\d[\d ()-]{8,}\d)\b/.test(numeric)
  );
}
export function classifyDocument(text: string) {
  const sensitive = sensitiveDocument(text);
  const kind: DocumentRecord["documentType"] = sensitive
    ? "SENSITIVE"
    : /\b(total|subtotal|receipt|invoice|gst|payment)\b/i.test(text)
      ? "RECEIPT"
      : /\b(theorem|gradient|learning|chapter|algorithm|quantum|study|definition)\b/i.test(
            text,
          )
        ? "STUDY"
        : text.trim()
          ? "NOTE"
          : "UNKNOWN";
  return {
    sensitive,
    documentType: kind,
    understanding: {
      version: "extractive-1" as const,
      dates: sensitive
        ? []
        : [
            ...new Set(
              text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g) ??
                [],
            ),
          ].slice(0, 12),
      // Only explicitly labelled entities; no inference from capitalization.
      entities: sensitive
        ? []
        : [
            ...new Set(
              [
                ...text.matchAll(/^(?:author|prepared by|project):\s*([^\n]{1,80})/gim),
              ].map((match) => match[1]!.trim()),
            ),
          ].slice(0, 12),
      actionItems: sensitive
        ? []
        : text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) =>
              /^(?:todo|action(?: item)?|task|remember|decision)\s*[:-]/i.test(line),
            )
            .slice(0, 12)
            .map((line) => line.slice(0, 240)),
      memoryCandidate: !sensitive && (kind === "STUDY" || kind === "NOTE"),
      ownerReviewRequired: true as const,
    },
    title: sensitive
      ? "Sensitive document"
      : text
          .split("\n")
          .find((l) => l.trim().length > 3)
          ?.trim()
          .slice(0, 160) || "Untitled scan",
    summary: sensitive
      ? "Private content. Automatic memory is blocked."
      : text.trim().slice(0, 1200),
    tags: sensitive
      ? []
      : [
          ...new Set(
            text
              .toLowerCase()
              .match(
                /\b(?:gradient|learning|quantum|architecture|project|algorithm|study|idea)\b/g,
              ) ?? [],
          ),
        ].slice(0, 12),
  };
}
