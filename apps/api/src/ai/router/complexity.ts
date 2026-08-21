import type { AIRouterRequest, AIComplexityLevel } from "@alexa-control/shared";

const words = (request: AIRouterRequest) =>
  request.input
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .toLowerCase();

export const classifyComplexity = (
  request: AIRouterRequest,
): { level: AIComplexityLevel; reason: string } => {
  if (request.complexityHint?.level) {
    return {
      level: request.complexityHint.level,
      reason: request.complexityHint.reason ?? "Owner-supplied bounded complexity hint.",
    };
  }
  const text = words(request);
  const length = text.length;
  const multiStep = /\b(compare|contrast|debug|architect|design|trade-?off|step by step|multi[- ]?file|several|multiple|recommend)\b/.test(text);
  const deep = /\b(deep|comprehensive|critical|security|legal|contract|strategy|evaluate all|dependency reasoning)\b/.test(text);
  const coding = request.purpose === "CODING" || /\b(code|typescript|javascript|refactor|bug|test|api)\b/.test(text);
  if (request.risk === "CRITICAL" || (deep && multiStep)) return { level: "VERY_HIGH", reason: "Critical risk or deep multi-step reasoning signal." };
  if (request.risk === "HIGH" || deep || (multiStep && length > 600) || (coding && length > 1_200))
    return { level: "HIGH", reason: "High-risk, deep, or multi-step reasoning signal." };
  if (multiStep || length > 280 || request.context && request.context.length > 6)
    return { level: "MEDIUM", reason: "Bounded multi-step, context, or input-size signal." };
  return { level: "LOW", reason: "Short bounded request with no deep reasoning signal." };
};
