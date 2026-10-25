import { MarketingResearchSchema, type MarketingResearch } from "@alexa-control/shared";

const CONTEXT_CHAR_LIMIT = 12_000;
type ResearchProjection = { entry: Record<string, unknown>; original: MarketingResearch; observations: MarketingResearch["observations"]; omitted: number };

/** Project existing canonical artifacts into bounded model context. Never changes
 * stored evidence, source identity, approved brand text or individual claims. */
export function boundedMarketingModelContext(input: Record<string, unknown>): string {
  const context = structuredClone(input);
  const research: ResearchProjection[] = [];
  for (const field of ["dependencyContent", "sourceCampaignContent"]) {
    const entries = context[field];
    if (!Array.isArray(entries)) continue;
    for (const value of entries as unknown[]) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (entry.type !== "RESEARCH") continue;
      const parsed = MarketingResearchSchema.safeParse(entry.content);
      if (parsed.success) {
        // Validation must not normalize or trim bytes from canonical claims.
        const original = entry.content as MarketingResearch;
        research.push({ entry, original, observations: [...original.observations], omitted: 0 });
      }
    }
  }
  let encoded = JSON.stringify(context);
  while (encoded.length > CONTEXT_CHAR_LIMIT) {
    const candidates = research.flatMap((item, sourceIndex) => item.observations.length > 1
      ? item.observations.map((observation, index) => ({ item, index, sourceIndex, confidence: observation.confidence, size: JSON.stringify(observation).length })) : []);
    candidates.sort((a, b) => a.confidence - b.confidence || b.size - a.size || a.sourceIndex - b.sourceIndex || a.index - b.index);
    const selected = candidates[0];
    if (!selected) throw Error("Marketing context exceeds safe bounds.");
    selected.item.observations.splice(selected.index, 1);
    selected.item.omitted++;
    selected.item.entry.content = { ...selected.item.original, observations: selected.item.observations,
      contextOmittedObservationCount: selected.item.omitted };
    encoded = JSON.stringify(context);
  }
  return encoded;
}
