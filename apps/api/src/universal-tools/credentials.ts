import type { UniversalToolProvider } from "@alexa-control/shared";
import { z } from "zod";

import type { CompanyDataStore } from "../company-data/store.js";
import type { TrustedToolContext } from "./gateway.js";

export type UniversalCredentialState = "DISCONNECTED" | "AUTH_REQUIRED" | "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
const McpSecretSchema = z.object({
  providerId: z.string().regex(/^[a-z][a-z0-9_.:-]{2,119}$/),
  secretLocator: z.string().min(1).max(160),
  kind: z.enum(["bearer", "api_key"]),
  value: z.string().min(20).max(8_192),
}).strict();
export type UniversalMcpSecret = z.infer<typeof McpSecretSchema>;

/** Server-bootstrap allowlist; secret values never enter provider records or audit metadata. */
export class UniversalMcpSecretResolver {
  readonly #secrets: ReadonlyMap<string, UniversalMcpSecret>;
  constructor(raw: unknown) {
    const parsed = z.array(McpSecretSchema).max(20).parse(raw);
    this.#secrets = new Map(parsed.map((item) => [`${item.providerId}:${item.secretLocator}`, item]));
    if (this.#secrets.size !== parsed.length) throw new Error("Duplicate MCP secret locator.");
  }
  headers(providerId: string, secretLocator: string): Record<string, string> {
    const item = this.#secrets.get(`${providerId}:${secretLocator}`);
    if (!item) throw new Error("Reviewed MCP credential is unavailable.");
    return item.kind === "bearer" ? { authorization: `Bearer ${item.value}` } : { "x-api-key": item.value };
  }
}

/** Reads the existing company-scoped secure credential reference. Never returns a secret. */
export class UniversalCredentialScope {
  constructor(readonly store: Pick<CompanyDataStore, "findCredentialReference">) {}

  async state(context: TrustedToolContext, provider: UniversalToolProvider): Promise<UniversalCredentialState> {
    if (!context.companyId || provider.companyId !== context.companyId || provider.ownerId !== context.ownerId) return "ERROR";
    if (!provider.credentialReferenceId) return "DISCONNECTED";
    const credential = await this.store.findCredentialReference(context.ownerId, context.companyId, provider.credentialReferenceId);
    if (!credential || credential.ownerId !== context.ownerId || credential.companyId !== context.companyId || credential.provider !== provider.id) return "ERROR";
    switch (credential.status) {
      case "READY": return "CONNECTED";
      case "MISSING": return "AUTH_REQUIRED";
      case "EXPIRED": return "EXPIRED";
      case "REVOKED": return "REVOKED";
    }
  }

  async ready(input: { context: TrustedToolContext; provider: UniversalToolProvider; required: boolean }) {
    const state = await this.state(input.context, input.provider);
    return input.required ? state === "CONNECTED" : state === "CONNECTED" || state === "DISCONNECTED";
  }

  async headers(provider: UniversalToolProvider, resolver: UniversalMcpSecretResolver | undefined): Promise<Record<string, string>> {
    if (!provider.companyId || !provider.credentialReferenceId) return {};
    const credential = await this.store.findCredentialReference(provider.ownerId, provider.companyId, provider.credentialReferenceId);
    if (!credential || credential.ownerId !== provider.ownerId || credential.companyId !== provider.companyId || credential.provider !== provider.id || credential.status !== "READY" || !resolver) throw new Error("Reviewed MCP credential is unavailable.");
    return resolver.headers(provider.id, credential.secretLocator);
  }
}
