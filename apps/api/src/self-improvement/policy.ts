import { EngineeringRelativePathSchema, isSelfImprovementAuthorityPath } from "@alexa-control/shared";

export const recognizeSelfImprovementRequest = (text: string) =>
  /\b(improve|change|modify|fix|add|update|make|refine|optimi[sz]e)\b/i.test(text) &&
  /\b(athena|yourself|your (?:engineering|dashboard|approvals?|memory|model|routing|android|app|system|code|feature|workflow|ui|backend))\b/i.test(text);

export const needsSelfImprovementClarification = (text: string) =>
  /^(?:athena[,.]?\s*)?(?:please\s+)?(?:improve|fix|update|change|make|enhance)\s+(?:yourself|athena|your system|your code|you|this feature)(?:[.!?])?$/i.test(text.trim());

const authorityRequest = /\b(auth(?:entication|orization)?|agent[ -]?os|capabilit(?:y|ies)|permissions?|tenant|secur(?:ity|e)|memory isolation|approvals?|trusted[ -]?devices?|self[ -]?updat(?:e|ing)|self[ -]?improv(?:e|ement)|airouter|model authority|execution policy|governance|credentials?|tokens?|passkeys?|biometrics?|bypass|disable safeguard)\b/i;
const mediumRequest = /\b(workflows?|agents?|routing|orchestrat(?:ion|e)|backend|api|endpoint|database|migrations?|mobile|android|mac|native|dependencies|build pipeline)\b/i;
const lowRequest = /\b(ui|dashboard|cards?|spacing|layout|styles?|components?|docs?|documentation|tests?|labels?|typography|colors?|small bug|simple bug)\b/i;
const largeRequest = /\b(multi[ -]?domain|across (?:web|api|mobile)|architecture|refactor|rewrite|migration|cross[ -]?device|entire|whole system)\b/i;

const matchesProtected = (path: string, patterns: string[]) => patterns.some((pattern) => {
  const prefix = pattern.replace(/^\.\//, "").replace(/\*\*?$/, "");
  return Boolean(prefix) && (path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
});

export type SelfImprovementDecision = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  engineeringMode: "FAST" | "FULL";
  targetAreas: string[];
  requiresOwnerApproval: boolean;
};

export const classifySelfImprovement = (request: string, criteria: string[], protectedPaths: string[]): SelfImprovementDecision => {
  const text = `${request} ${criteria.join(" ")}`;
  const targetAreas = [...new Set([...text.matchAll(/\b(?:apps|packages|docs)\/[A-Za-z0-9_./-]{1,250}/g)]
    .map((match) => match[0].replace(/[.,;:]+$/, ""))
    .filter((path) => EngineeringRelativePathSchema.safeParse(path).success))].slice(0, 30);
  const referencedProtected = protectedPaths.some((pattern) => {
    const words = pattern.replace(/[^a-z0-9]+/gi, " ").trim();
    return words.length >= 5 && text.toLowerCase().includes(words.toLowerCase());
  });
  const riskLevel = authorityRequest.test(text) || referencedProtected ||
    targetAreas.some((path) => isSelfImprovementAuthorityPath(path) || matchesProtected(path, protectedPaths)) ? "HIGH" :
    mediumRequest.test(text) ? "MEDIUM" : lowRequest.test(text) ? "LOW" : "MEDIUM";
  const engineeringMode = riskLevel === "HIGH" || largeRequest.test(text) ? "FULL" : "FAST";
  return { riskLevel, engineeringMode, targetAreas, requiresOwnerApproval: riskLevel === "HIGH" };
};

export const escalateSelfImprovementPaths = (
  previous: SelfImprovementDecision,
  filesChanged: string[],
  protectedPaths: string[],
): SelfImprovementDecision => {
  const authority = filesChanged.some((path) => isSelfImprovementAuthorityPath(path) || matchesProtected(path, protectedPaths));
  if (!authority) return previous;
  return { ...previous, riskLevel: "HIGH", engineeringMode: "FULL", requiresOwnerApproval: true };
};
