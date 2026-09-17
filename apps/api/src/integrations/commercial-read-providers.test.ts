import { describe, expect, it, vi } from "vitest";
import { BusinessActionRequestSchema } from "@alexa-control/shared";
import {
  GoogleAdsTestProvider,
  GoogleAnalytics4Provider,
  ShopifyDevelopmentStoreProvider,
  XeroSandboxAccountingProvider,
} from "./commercial-read-providers.js";

const ok = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        validated: true,
        data: { products: { nodes: [{ id: "gid://shopify/Product/1", title: "Fixture" }] } },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    ),
  );
const base = {
  companyId: crypto.randomUUID(),
  credentialBindingId: crypto.randomUUID(),
};
describe("credential-gated representative commercial read adapters", () => {
  it("rejects generic and partial success payloads for every commercial adapter", async () => {
    const fetcher = () => Promise.resolve(Response.json({ validated: true }));
    const credential = { accessToken: "synthetic-only", tenantId: crypto.randomUUID(), developerToken: "synthetic-only", customerId: "1234567890", propertyId: "123456789" };
    for (const [provider, capability, extra] of [
      [new XeroSandboxAccountingProvider(fetcher), "accounting.read_pnl", {}],
      [new GoogleAdsTestProvider(fetcher), "ads.read_performance", {}],
      [new GoogleAnalytics4Provider(fetcher), "analytics.query_metric", { metricId: "conversions", dimensions: [] }],
    ] as const) {
      const action = BusinessActionRequestSchema.parse({ capability, idempotencyKey: "malformed-provider-1", reason: "Validate bounded provider evidence", references: {}, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-04T00:00:00.000Z", ...extra });
      expect(await provider.execute(action, { ...base, credential })).toMatchObject({ outcome: "FAILED", failureKind: "INVALID_RECORD" });
    }
  });
  it.each([
    { errors: [{ message: "sensitive provider details" }] },
    { data: null },
    { data: { products: { nodes: [{ name: "missing id" }] } } },
  ])("does not verify malformed or errored Shopify success envelopes", async (body) => {
    const provider = new ShopifyDevelopmentStoreProvider(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    );
    const outcome = await provider.execute(
      BusinessActionRequestSchema.parse({
        capability: "commerce.list_products",
        idempotencyKey: "shopify-negative-1",
        reason: "Read bounded products.",
        references: {},
        limit: 1,
      }),
      {
        ...base,
        credential: {
          accessToken: "synthetic-access-token-only",
          shopDomain: "fixture.myshopify.com",
          apiVersion: "2026-07",
        },
      },
    );
    expect(outcome.outcome).toBe("FAILED");
    expect(JSON.stringify(outcome)).not.toContain("sensitive provider details");
  });
  it("queries Xero through its reviewed tenant boundary", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json({ Status: "OK", Reports: [{ ReportID: "ProfitAndLoss", ReportName: "Profit and Loss", Rows: [{ RowType: "Header" }] }] }))),
      provider = new XeroSandboxAccountingProvider(fetcher),
      credential = {
        accessToken: "xero-access-token-fixture-long",
        tenantId: crypto.randomUUID(),
      };
    const result = await provider.execute(
      BusinessActionRequestSchema.parse({
        capability: "accounting.read_pnl",
        idempotencyKey: "xero-pnl-1",
        reason: "Read sandbox P&L.",
        references: {},
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-04T00:00:00.000Z",
      }),
      { ...base, credential },
    );
    expect(result.outcome).toBe("VERIFIED");
    const [url, init] = fetcher.mock.calls[0]!,
      urlText = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    expect(urlText).toContain("/Reports/ProfitAndLoss");
    expect(new Headers(init?.headers).get("xero-tenant-id")).toBe(credential.tenantId);
    expect(JSON.stringify(result)).not.toContain(credential.accessToken);
  });
  it("queries a Google Ads test account with a fixed bounded query", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json([{ results: [{ campaign: { id: "1", name: "Fixture", status: "ENABLED" }, metrics: { costMicros: "100", conversions: 2 } }] }]))),
      provider = new GoogleAdsTestProvider(fetcher),
      credential = {
        accessToken: "google-ads-access-token-long",
        developerToken: "developer-token-fixture",
        customerId: "1234567890",
      };
    const result = await provider.execute(
      BusinessActionRequestSchema.parse({
        capability: "ads.read_performance",
        idempotencyKey: "google-ads-read-1",
        reason: "Read test campaign performance.",
        references: {},
        externalResourceId: null,
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-04T00:00:00.000Z",
      }),
      { ...base, credential },
    );
    expect(result.outcome).toBe("VERIFIED");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("customers/1234567890/googleAds:searchStream"),
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("queries GA4 with explicit period, metric, dimensions, and property", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json({ metricHeaders: [{ name: "conversions", type: "TYPE_FLOAT" }], dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }], rowCount: 1, rows: [{ dimensionValues: [{ value: "Direct" }], metricValues: [{ value: "2" }] }] }))),
      provider = new GoogleAnalytics4Provider(fetcher),
      credential = {
        accessToken: "google-analytics-access-token",
        propertyId: "123456789",
      };
    const result = await provider.execute(
      BusinessActionRequestSchema.parse({
        capability: "analytics.query_metric",
        idempotencyKey: "ga4-metric-read-1",
        reason: "Read a canonical analytics metric.",
        references: {},
        metricId: "conversions",
        dimensions: ["sessionDefaultChannelGroup"],
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-04T00:00:00.000Z",
      }),
      { ...base, credential },
    );
    expect(result).toMatchObject({
      outcome: "VERIFIED",
      externalReferenceId: "ga4:123456789:conversions",
    });
  });
  it("restricts Shopify requests to a validated development-store host", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(ok),
      provider = new ShopifyDevelopmentStoreProvider(fetcher),
      credential = {
        accessToken: "shopify-development-token-long",
        shopDomain: "alexa-fixture.myshopify.com",
        apiVersion: "2026-07",
      };
    const result = await provider.execute(
      BusinessActionRequestSchema.parse({
        capability: "commerce.list_products",
        idempotencyKey: "shopify-products-1",
        reason: "Read development-store products.",
        references: {},
        limit: 10,
      }),
      { ...base, credential },
    );
    expect(result.outcome).toBe("VERIFIED");
    expect(fetcher).toHaveBeenCalledWith(
      "https://alexa-fixture.myshopify.com/admin/api/2026-07/graphql.json",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.stringify(result)).not.toContain(credential.accessToken);
  });
});
