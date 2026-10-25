import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MarketingResearchSchema } from "@alexa-control/shared";
import { boundedMarketingModelContext } from "./model-context.js";

const fixture = () => ({
  product: "Athena", marketingCompanyId: crypto.randomUUID(),
  approvedBrand: [JSON.stringify({ positioning: "Approved positioning. ".repeat(250), prohibitedClaims: ["No unverified guarantees"] })],
  dependencyContent: [{ type: "RESEARCH", artifactId: crypto.randomUUID(), version: 3,
    content: { summary: "Verified findings with gaps requiring owner review.", observations: Array.from({ length: 12 }, (_, i) => ({
      source: `https://example.test/source-${i}`, observation: `Observation ${i}: ${"Complete supported factual sentence. ".repeat(30).trim()}`,
      relevance: "Strategy evidence", confidence: i === 0 ? 0.2 : 0.9, observedAt: "2026-10-24T09:00:00.000Z",
    })) } }], sourceCampaignContent: [],
});

describe("bounded canonical Marketing model context", () => {
  it("keeps approved brand and source bindings intact, omitting whole lower-confidence observations with disclosure", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const encoded = boundedMarketingModelContext(input);
    expect(encoded.length).toBeLessThanOrEqual(12000);
    const decoded = z.object({ approvedBrand: z.array(z.string()), marketingCompanyId: z.string(), dependencyContent: z.array(z.object({
      artifactId: z.string(), version: z.number(), content: MarketingResearchSchema.extend({ contextOmittedObservationCount: z.number().int().positive() }),
    })) }).parse(JSON.parse(encoded));
    expect(decoded.approvedBrand).toEqual(input.approvedBrand);
    expect(decoded.marketingCompanyId).toBe(input.marketingCompanyId);
    const projected = decoded.dependencyContent[0]!;
    expect(projected.artifactId).toBe(input.dependencyContent[0]!.artifactId);
    expect(projected.version).toBe(3);
    expect(projected.content.summary).toBe(input.dependencyContent[0]!.content.summary);
    expect(projected.content.observations.some(item => item.confidence === 0.2)).toBe(false);
    for (const item of projected.content.observations) expect(input.dependencyContent[0]!.content.observations).toContainEqual(item);
    expect(projected.content.contextOmittedObservationCount + projected.content.observations.length).toBe(12);
    expect(projected.content.observations.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
    expect(boundedMarketingModelContext(input)).toBe(encoded);
  });

  it("applies the same projection to source campaigns without changing canonical source references", () => {
    const input = fixture();
    const encoded = boundedMarketingModelContext({ ...input, dependencyContent: [], sourceCampaignContent: input.dependencyContent });
    expect(encoded.length).toBeLessThanOrEqual(12000);
    expect(JSON.parse(encoded) as unknown).toMatchObject({ sourceCampaignContent: [{ artifactId: input.dependencyContent[0]!.artifactId,
      content: { contextOmittedObservationCount: expect.any(Number) as unknown } }] });
  });

  it("does not project or alter context that already fits", () => {
    const input = { approvedBrand: ["Complete approved rules"], dependencyContent: [{ type: "RESEARCH", content: { summary: "Summary", observations: [] } }] };
    expect(boundedMarketingModelContext(input)).toBe(JSON.stringify(input));
  });

  it("fails closed when fitting would require truncating brand, claims, summary or the last source observation", () => {
    expect(() => boundedMarketingModelContext({ approvedBrand: ["x".repeat(12001)], dependencyContent: [] })).toThrow("safe bounds");
    const input = fixture();
    input.approvedBrand = ["x".repeat(11500)];
    expect(() => boundedMarketingModelContext(input)).toThrow("safe bounds");
  });
});
