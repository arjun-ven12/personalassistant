import { describe, expect, it } from "vitest";

import { ALEXA_NATIVE_WORKFORCE, ECC_AGENT_SEEDS } from "./catalog.js";

const marketingSpecialistIds = [
  "native_brand_strategist",
  "native_copywriter",
  "native_social_media",
  "native_advertising",
  "native_creative_director",
] as const;

describe("ALEXA_NATIVE_WORKFORCE marketing specialists", () => {
  it("includes the five dormant marketing specialists with bounded native metadata", () => {
    const specialists = ALEXA_NATIVE_WORKFORCE.filter((seed) =>
      marketingSpecialistIds.some((id) => id === seed.id),
    );

    expect(specialists.map((seed) => seed.id).sort()).toEqual([...marketingSpecialistIds].sort());
    expect(specialists).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "native_brand_strategist", role: "planning" }),
      expect.objectContaining({ id: "native_copywriter", role: "documentation" }),
      expect.objectContaining({ id: "native_social_media", role: "planning" }),
      expect.objectContaining({ id: "native_advertising", role: "planning" }),
      expect.objectContaining({ id: "native_creative_director", role: "review" }),
    ]));
    expect(specialists.every((seed) =>
      seed.department === "Marketing" && seed.source === "ALEXA_NATIVE" && seed.sourcePath === null,
    )).toBe(true);
  });

  it("keeps all catalog seed identifiers unique for bootstrap", () => {
    const ids = [...ALEXA_NATIVE_WORKFORCE, ...ECC_AGENT_SEEDS].map((seed) => seed.id);

    expect(new Set(ids)).toHaveLength(ids.length);
  });
});
