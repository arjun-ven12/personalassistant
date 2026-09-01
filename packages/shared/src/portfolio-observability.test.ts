import { describe, expect, it } from "vitest";

import {
  PortfolioAITraceQuerySchema,
  PortfolioTraceQuerySchema,
} from "./portfolio-observability.js";

describe("portfolio observability query contracts", () => {
  it("coerces bounded HTTP query-string limits", () => {
    expect(PortfolioTraceQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(PortfolioAITraceQuerySchema.parse({ limit: "30" }).limit).toBe(30);
  });

  it("still rejects out-of-range query-string limits", () => {
    expect(PortfolioTraceQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(PortfolioAITraceQuerySchema.safeParse({ limit: "501" }).success).toBe(false);
  });
});
