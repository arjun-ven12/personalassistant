import { z } from "zod";
import type { BusinessActionRequest, BusinessProvider } from "@alexa-control/shared";
import type {
  AccountingProvider,
  AdsProvider,
  AnalyticsProvider,
  BusinessProviderExecutionContext,
  BusinessProviderResult,
  CommerceProvider,
} from "./business-providers.js";

const JsonObjectSchema = z.record(z.string(), z.unknown());
type Fetcher = typeof fetch;
class ProviderHttpError extends Error {
  constructor(
    readonly kind: NonNullable<BusinessProviderResult["failureKind"]>,
    readonly retryable: boolean,
  ) {
    super(kind);
  }
}
const failure = (error: unknown, name: string): BusinessProviderResult => {
  const value =
    error instanceof ProviderHttpError
      ? error
      : new ProviderHttpError("INVALID_RECORD", false);
  return {
    outcome: "FAILED",
    externalReferenceId: null,
    summary: `${name} rejected the bounded read (${value.kind}).`,
    failureKind: value.kind,
    retryable: value.retryable,
  };
};
const bearer = async (
  fetcher: Fetcher,
  url: string,
  token: string,
  init: RequestInit = {},
  headers: Record<string, string> = {},
) => {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...headers,
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new ProviderHttpError("TIMEOUT", true);
    throw new ProviderHttpError("OUTAGE", true);
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
    if (response.status === 403)
      throw new ProviderHttpError("PERMISSION_DENIED", false);
    if (response.status === 429) throw new ProviderHttpError("RATE_LIMIT", true);
    if (response.status >= 500) throw new ProviderHttpError("OUTAGE", true);
    throw new ProviderHttpError("INVALID_RECORD", false);
  }
  const body = z.union([JsonObjectSchema, z.array(JsonObjectSchema).max(100)]).parse(await response.json());
  // HTTP success is not GraphQL/provider operation success. Never surface raw errors.
  if ((Array.isArray(body) ? body : [body]).some((part) => part.error !== undefined || part.errors !== undefined))
    throw new ProviderHttpError("INVALID_RECORD", false);
  return body;
};
const result = (name: string, reference: string | null): BusinessProviderResult => ({
  outcome: "VERIFIED",
  externalReferenceId: reference,
  summary: `${name} returned validated provider state for the bounded read.`,
});
const token = (context: BusinessProviderExecutionContext | undefined) => {
  if (!context?.credential?.accessToken)
    throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
  return context.credential.accessToken;
};
abstract class ReadProviderBase {
  readonly supportsIdempotentWrites = false;
  readonly requiresCredential = true;
  abstract readonly providerId: BusinessProvider;
  abstract readonly capabilities: ReadonlySet<BusinessActionRequest["capability"]>;
  health(context?: BusinessProviderExecutionContext) {
    return Promise.resolve(
      context?.credential?.accessToken
        ? {
            state: "DEGRADED" as const,
            reasonCode: "CREDENTIAL_CONFIGURED_PROVIDER_HEALTH_UNVERIFIED",
            rateLimitRemaining: null,
          }
        : {
            state: "REAUTH_REQUIRED" as const,
            reasonCode: "REVIEWED_OAUTH_REQUIRED",
            rateLimitRemaining: null,
          },
    );
  }
  reconcile(reference: string) {
    return Promise.resolve({
      outcome: "FAILED" as const,
      externalReferenceId: reference,
      summary:
        "This representative adapter exposes read-only capabilities; reconciliation is not applicable.",
      failureKind: "INVALID_RECORD" as const,
      retryable: false,
    });
  }
}

export class XeroSandboxAccountingProvider
  extends ReadProviderBase
  implements AccountingProvider
{
  readonly providerId = "accounting" as const;
  readonly capabilities = new Set<BusinessActionRequest["capability"]>([
    "accounting.list_accounts",
    "accounting.read_account",
    "accounting.search_transactions",
    "accounting.read_transaction",
    "accounting.list_invoices",
    "accounting.read_invoice",
    "accounting.read_pnl",
    "accounting.read_balance_sheet",
    "accounting.read_cashflow",
  ]);
  constructor(readonly fetcher: Fetcher = fetch) {
    super();
  }
  async execute(
    action: BusinessActionRequest,
    context?: BusinessProviderExecutionContext,
  ) {
    if (!this.capabilities.has(action.capability))
      return failure(new ProviderHttpError("PERMISSION_DENIED", false), "Xero sandbox");
    try {
      const credential = context?.credential;
      if (!credential?.tenantId)
        throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
      let path = "/api.xro/2.0/Accounts";
      const id = "externalResourceId" in action ? action.externalResourceId : null;
      if (action.capability === "accounting.read_account")
        path = `/api.xro/2.0/Accounts/${encodeURIComponent(id!)}`;
      else if (
        action.capability === "accounting.search_transactions" ||
        action.capability === "accounting.read_transaction"
      )
        path = id
          ? `/api.xro/2.0/BankTransactions/${encodeURIComponent(id)}`
          : "/api.xro/2.0/BankTransactions?page=1";
      else if (
        action.capability === "accounting.list_invoices" ||
        action.capability === "accounting.read_invoice"
      )
        path = id
          ? `/api.xro/2.0/Invoices/${encodeURIComponent(id)}`
          : "/api.xro/2.0/Invoices?page=1";
      else if (
        action.capability === "accounting.read_pnl" ||
        action.capability === "accounting.read_balance_sheet" ||
        action.capability === "accounting.read_cashflow"
      ) {
        if (!("periodStart" in action) || !action.periodStart || !action.periodEnd)
          throw new ProviderHttpError("INVALID_RECORD", false);
        const report =
          action.capability === "accounting.read_pnl"
            ? "ProfitAndLoss"
            : action.capability === "accounting.read_balance_sheet"
              ? "BalanceSheet"
              : "CashSummary";
        path = `/api.xro/2.0/Reports/${report}?fromDate=${encodeURIComponent(action.periodStart.slice(0, 10))}&toDate=${encodeURIComponent(action.periodEnd.slice(0, 10))}`;
      }
      const body = JsonObjectSchema.parse(await bearer(
        this.fetcher,
        `https://api.xero.com${path}`,
        token(context),
        {},
        { "xero-tenant-id": credential.tenantId },
      ));
      if (body.Status !== "OK") throw new ProviderHttpError("INVALID_RECORD", false);
      const collection = path.includes("/Reports/") ? "Reports" : path.includes("BankTransactions") ? "BankTransactions" : path.includes("Invoices") ? "Invoices" : "Accounts";
      const idKey = collection === "Reports" ? "ReportID" : collection === "Accounts" ? "AccountID" : collection === "Invoices" ? "InvoiceID" : "BankTransactionID";
      const records = z.array(JsonObjectSchema).max(1000).parse(body[collection]);
      if (id && (records.length !== 1 || records[0]?.[idKey] !== id)) throw new ProviderHttpError("INVALID_RECORD", false);
      for (const record of records) {
        z.string().min(1).parse(record[idKey]);
        if (record.HasErrors === true || record.ValidationErrors !== undefined) throw new ProviderHttpError("INVALID_RECORD", false);
        if (collection === "Accounts") z.string().min(1).parse(record.Name);
        if (collection === "Invoices" || collection === "BankTransactions") z.number().finite().parse(record.Total);
        if (collection === "Reports") {
          z.string().min(1).parse(record.ReportName);
          z.array(z.object({ RowType: z.string().min(1) })).min(1).max(1000).parse(record.Rows);
        }
      }
      if (collection === "Reports" && (records.length !== 1 || records[0]?.ReportID !== path.split("/Reports/")[1]?.split("?")[0]))
        throw new ProviderHttpError("INVALID_RECORD", false);
      return result("Xero sandbox", id ? `xero:${id}` : null);
    } catch (error) {
      return failure(error, "Xero sandbox");
    }
  }
}

export class GoogleAdsTestProvider extends ReadProviderBase implements AdsProvider {
  readonly providerId = "ads" as const;
  readonly capabilities = new Set<BusinessActionRequest["capability"]>([
    "ads.list_campaigns",
    "ads.read_campaign",
    "ads.read_performance",
    "ads.read_spend",
    "ads.read_conversions",
  ]);
  constructor(readonly fetcher: Fetcher = fetch) {
    super();
  }
  async execute(
    action: BusinessActionRequest,
    context?: BusinessProviderExecutionContext,
  ) {
    if (!this.capabilities.has(action.capability))
      return failure(
        new ProviderHttpError("PERMISSION_DENIED", false),
        "Google Ads test account",
      );
    try {
      const credential = context?.credential;
      if (!credential?.developerToken || !credential.customerId)
        throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
      const id = "externalResourceId" in action ? action.externalResourceId : null;
      if (id && !/^[0-9]{1,20}$/.test(id)) throw new ProviderHttpError("INVALID_RECORD", false);
      const conditions = id ? [`campaign.id = ${id}`] : [];
      if (["ads.read_performance", "ads.read_spend", "ads.read_conversions"].includes(action.capability)) {
        if (!("periodStart" in action) || !action.periodStart || !action.periodEnd) throw new ProviderHttpError("INVALID_RECORD", false);
        conditions.push(`segments.date BETWEEN '${action.periodStart.slice(0,10)}' AND '${action.periodEnd.slice(0,10)}'`);
      }
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.conversions FROM campaign${where} LIMIT ${"limit" in action ? action.limit : 25}`;
      const body = await bearer(
        this.fetcher,
        `https://googleads.googleapis.com/v19/customers/${credential.customerId}/googleAds:searchStream`,
        token(context),
        { method: "POST", body: JSON.stringify({ query }) },
        { "developer-token": credential.developerToken },
      );
      const batches = z.array(z.object({ results: z.array(z.object({
        campaign: z.object({ id: z.string().regex(/^[0-9]+$/), name: z.string().min(1), status: z.enum(["ENABLED", "PAUSED", "REMOVED"]) }),
        metrics: z.object({ costMicros: z.string().regex(/^[0-9]+$/), conversions: z.number().finite().nonnegative() }),
      })).max(500) })).max(100).parse(body);
      const rows = batches.flatMap((batch) => batch.results);
      if (rows.length > ("limit" in action ? action.limit : 25) || (id && (rows.length !== 1 || rows[0]?.campaign.id !== id)))
        throw new ProviderHttpError("INVALID_RECORD", false);
      return result("Google Ads test account", id ? `google-ads:${id}` : null);
    } catch (error) {
      return failure(error, "Google Ads test account");
    }
  }
}

export class GoogleAnalytics4Provider
  extends ReadProviderBase
  implements AnalyticsProvider
{
  readonly providerId = "analytics" as const;
  readonly capabilities = new Set<BusinessActionRequest["capability"]>([
    "analytics.query_metric",
    "analytics.query_timeseries",
    "analytics.query_conversions",
    "analytics.query_channel_performance",
  ]);
  constructor(readonly fetcher: Fetcher = fetch) {
    super();
  }
  async execute(
    action: BusinessActionRequest,
    context?: BusinessProviderExecutionContext,
  ) {
    if (
      !this.capabilities.has(action.capability) ||
      !("metricId" in action) ||
      !("periodStart" in action) ||
      !action.metricId ||
      !action.periodStart ||
      !action.periodEnd
    )
      return failure(
        new ProviderHttpError("PERMISSION_DENIED", false),
        "Google Analytics 4",
      );
    try {
      const propertyId = context?.credential?.propertyId;
      if (!propertyId) throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
      const body = JsonObjectSchema.parse(await bearer(
        this.fetcher,
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        token(context),
        {
          method: "POST",
          body: JSON.stringify({
            dateRanges: [
              {
                startDate: action.periodStart.slice(0, 10),
                endDate: action.periodEnd.slice(0, 10),
              },
            ],
            metrics: [{ name: action.metricId }],
            dimensions: action.dimensions.map((name: string) => ({ name })),
            limit: String(action.limit),
          }),
        },
      ));
      const header = z.object({ name: z.string().min(1) });
      const metricHeaders = z.array(header.extend({ type: z.string().min(1) })).length(1).parse(body.metricHeaders);
      const dimensionHeaders = z.array(header).parse(body.dimensionHeaders ?? []);
      if (metricHeaders[0]!.name !== action.metricId || dimensionHeaders.map((h) => h.name).join("\0") !== action.dimensions.join("\0"))
        throw new ProviderHttpError("INVALID_RECORD", false);
      const value = z.object({ value: z.string() });
      const rows = z.array(z.object({ dimensionValues: z.array(value).default([]), metricValues: z.array(value).length(1) })).max(action.limit).parse(body.rows ?? []);
      const rowCount = z.number().int().nonnegative().parse(body.rowCount ?? (rows.length === 0 ? 0 : undefined));
      if (rowCount !== rows.length || rows.some((row) => row.dimensionValues.length !== dimensionHeaders.length || !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(row.metricValues[0]!.value) || !Number.isFinite(Number(row.metricValues[0]!.value))))
        throw new ProviderHttpError("INVALID_RECORD", false);
      return result("Google Analytics 4", `ga4:${propertyId}:${action.metricId}`);
    } catch (error) {
      return failure(error, "Google Analytics 4");
    }
  }
}

export class ShopifyDevelopmentStoreProvider
  extends ReadProviderBase
  implements CommerceProvider
{
  readonly providerId = "commerce" as const;
  readonly capabilities = new Set<BusinessActionRequest["capability"]>([
    "commerce.list_products",
    "commerce.read_product",
    "commerce.list_orders",
    "commerce.read_order",
  ]);
  constructor(readonly fetcher: Fetcher = fetch) {
    super();
  }
  async execute(
    action: BusinessActionRequest,
    context?: BusinessProviderExecutionContext,
  ) {
    if (!this.capabilities.has(action.capability))
      return failure(
        new ProviderHttpError("PERMISSION_DENIED", false),
        "Shopify development store",
      );
    try {
      const credential = context?.credential;
      if (!credential?.shopDomain || !credential.apiVersion)
        throw new ProviderHttpError("EXPIRED_CREDENTIAL", false);
      const id = "externalResourceId" in action ? action.externalResourceId : null,
        root =
          action.capability.includes("product") ||
          action.capability === "commerce.read_inventory"
            ? "product"
            : action.capability.includes("customer")
              ? "customer"
              : "order",
        query = id
          ? `query AlexaNode($id: ID!) { node(id: $id) { id __typename ... on Product { title } ... on Order { name } } }`
          : `query AlexaList($first: Int!) { ${root}s(first: $first) { nodes { id ${root === "product" ? "title" : "name"} } } }`,
        variables = id ? { id } : { first: "limit" in action ? action.limit : 25 };
      const body = await bearer(
        this.fetcher,
        `https://${credential.shopDomain}/admin/api/${credential.apiVersion}/graphql.json`,
        token(context),
        { method: "POST", body: JSON.stringify({ query, variables }) },
        { "x-shopify-access-token": token(context) },
      );
      const data = JsonObjectSchema.parse(JsonObjectSchema.parse(body).data);
      const node = z.object({ id: z.string().min(1).max(512), [root === "product" ? "title" : "name"]: z.string().min(1).max(512) });
      if (id) {
        const entity = node
          .extend({ __typename: z.enum(["Product", "Customer", "Order"]) })
          .parse(data.node);
        if (entity.id !== id || entity.__typename?.toLowerCase() !== root)
          throw new ProviderHttpError("INVALID_RECORD", false);
      } else {
        z.object({
          nodes: z.array(node).max("limit" in action ? action.limit : 25),
        }).parse(data[`${root}s`]);
      }
      return result("Shopify development store", id ? `shopify:${id}` : null);
    } catch (error) {
      return failure(error, "Shopify development store");
    }
  }
}
