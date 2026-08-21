import {
  VoicePageContextSchema,
  type VoicePageContext,
} from "@alexa-control/shared";

import { collectSemanticUiTargets } from "./voiceNavigation.js";

const sensitiveLabel =
  /\b(?:password|secret|token|cookie|private key|recovery code|authentication code)\b/i;

const visible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
};

const boundedText = (element: HTMLElement, maxLength: number) => {
  const value = element.textContent?.trim().replace(/\s+/g, " ") ?? "";
  if (!value || sensitiveLabel.test(value)) return null;
  return value.slice(0, maxLength);
};

const unique = (values: Array<string | null>, limit: number) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].slice(
    0,
    limit,
  );

const queryTerms = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2),
  );

const relevance = (text: string, transcript: string, base: number) => {
  const terms = queryTerms(transcript);
  if (terms.size === 0) return base;
  const normalizedText = text.toLowerCase();
  const matches = [...terms].filter((term) => normalizedText.includes(term)).length;
  return Math.min(1, base + matches / Math.max(4, terms.size));
};

export const collectVoicePageContext = (
  pathname: string,
  transcript = "",
  preservedSelection: string | null = null,
): VoicePageContext => {
  const main = document.querySelector<HTMLElement>("main") ?? document.body;
  const headingElements = [
    ...main.querySelectorAll<HTMLElement>("h1, h2, h3"),
  ].filter(visible);
  const headings = unique(
    headingElements.map((element) => boundedText(element, 240)),
    30,
  );
  const content = unique(
    [...main.querySelectorAll<HTMLElement>("p, th, td, li, [role='note'], [role='status']")]
      .filter(
        (element) =>
          visible(element) &&
          !element.closest("nav, footer, [role='navigation'], [aria-label*='cookie' i]"),
      )
      .map((element) => boundedText(element, 300)),
    40,
  );
  const title =
    headings[0] ?? (document.title.trim().slice(0, 160) || "Current page");
  const description = content[0] ?? null;
  const rawSelection =
    window.getSelection()?.toString().trim().replace(/\s+/g, " ") ||
    preservedSelection?.trim().replace(/\s+/g, " ") ||
    "";
  const selectedText =
    rawSelection && !sensitiveLabel.test(rawSelection)
      ? rawSelection.slice(0, 2_000)
      : null;
  const focused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const focusedText = focused
    ? focused.getAttribute("aria-label") ??
      focused.getAttribute("title") ??
      boundedText(focused, 240)
    : null;
  const focusedElement =
    focusedText && !sensitiveLabel.test(focusedText)
      ? focusedText.slice(0, 240)
      : null;
  const rawChunks = [
    { kind: "TITLE" as const, text: title, base: 0.92 },
    ...(selectedText
      ? [{ kind: "SELECTION" as const, text: selectedText, base: 1 }]
      : []),
    ...(description
      ? [{ kind: "INTRO" as const, text: description, base: 0.85 }]
      : []),
    ...headings.map((text) => ({ kind: "HEADING" as const, text, base: 0.7 })),
    ...content.slice(1).map((text) => ({ kind: "SECTION" as const, text, base: 0.55 })),
  ];
  const chunks = rawChunks
    .map((chunk, index) => ({
      id: `${pathname}#context-${index}`.slice(0, 240),
      kind: chunk.kind,
      text: chunk.text.slice(0, 1_200),
      relevance: relevance(chunk.text, transcript, chunk.base),
    }))
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, 20);
  const controls = collectSemanticUiTargets(pathname)
    .filter((target) => !sensitiveLabel.test(target.label))
    .slice(0, 60)
    .map((target) => ({
      id: target.id.slice(0, 240),
      label: target.label.slice(0, 200),
      role: target.role.slice(0, 80),
      enabled: target.enabled,
    }));

  return VoicePageContextSchema.parse({
    pathname,
    url: window.location.href,
    title,
    description,
    headings,
    content,
    selectedText,
    focusedElement,
    chunks,
    extractionStatus:
      chunks.length === 0 ? "CONTENT_UNAVAILABLE" : content.length === 0 ? "PARTIAL" : "AVAILABLE",
    controls,
    authority: "CONTEXT_ONLY",
  });
};
