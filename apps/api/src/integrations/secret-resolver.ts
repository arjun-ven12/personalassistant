import { z } from "zod";

import { ExecutionError } from "../execution/errors.js";
import type { BusinessProvider } from "@alexa-control/shared";

export const GmailOAuthSecretSchema = z.object({
  accessToken: z.string().trim().min(20).max(8_192).optional(),
  refreshToken: z.string().trim().min(20).max(8_192).optional(),
  clientId: z.string().trim().min(5).max(1_024).optional(),
  clientSecret: z.string().trim().min(5).max(1_024).optional(),
  expiresAt: z.iso.datetime().optional(),
}).strict().superRefine((value, context) => {
  const refreshable = value.refreshToken && value.clientId && value.clientSecret;
  if (!value.accessToken && !refreshable) context.addIssue({
    code: "custom",
    message: "A Gmail credential needs an access token or a complete refresh-token bundle.",
  });
});

export const StripeTestSecretSchema=z.object({apiKey:z.string().trim().regex(/^sk_test_[A-Za-z0-9_]+$/).max(512)}).strict();
const BearerSchema=z.string().trim().min(20).max(8_192);
export const XeroSandboxSecretSchema=z.object({accessToken:BearerSchema,tenantId:z.string().uuid()}).strict();
export const GoogleAdsTestSecretSchema=z.object({accessToken:BearerSchema,developerToken:z.string().trim().min(10).max(512),customerId:z.string().regex(/^\d{6,20}$/)}).strict();
export const GoogleAnalyticsSecretSchema=z.object({accessToken:BearerSchema,propertyId:z.string().regex(/^\d{4,30}$/)}).strict();
export const ShopifyDevelopmentSecretSchema=z.object({accessToken:BearerSchema,shopDomain:z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}\.myshopify\.com$/),apiVersion:z.string().regex(/^20\d{2}-(01|04|07|10)$/).default("2026-07")}).strict();

export interface ResolvedProviderSecret {
  accessToken?:string|undefined;refreshToken?:string|undefined;clientId?:string|undefined;clientSecret?:string|undefined;expiresAt?:string|undefined;apiKey?:string|undefined;tenantId?:string|undefined;developerToken?:string|undefined;customerId?:string|undefined;propertyId?:string|undefined;shopDomain?:string|undefined;apiVersion?:string|undefined;
}

const parseSecret=(provider:BusinessProvider,value:unknown):ResolvedProviderSecret=>provider==="gmail"?GmailOAuthSecretSchema.parse(value):provider==="payments"?StripeTestSecretSchema.parse(value):provider==="accounting"?XeroSandboxSecretSchema.parse(value):provider==="ads"?GoogleAdsTestSecretSchema.parse(value):provider==="analytics"?GoogleAnalyticsSecretSchema.parse(value):provider==="commerce"?ShopifyDevelopmentSecretSchema.parse(value):z.never().parse(value);

export interface ReviewedSecretResolver {
  resolve(input:{provider:BusinessProvider;secretLocator:string}):Promise<ResolvedProviderSecret>;
}

/** Resolves only locators explicitly registered by trusted server bootstrap. */
export class AllowlistedEnvironmentSecretResolver implements ReviewedSecretResolver {
  readonly #values:ReadonlyMap<string,string>;
  constructor(values:Record<string,string|undefined>){
    this.#values=new Map(Object.entries(values).filter((entry):entry is [string,string]=>Boolean(entry[1])));
  }
  resolve(input:{provider:BusinessProvider;secretLocator:string}){
    const serialized=this.#values.get(`${input.provider}:${input.secretLocator}`);
    if(!serialized)return Promise.reject(new ExecutionError(503,"CREDENTIAL_SECRET_UNAVAILABLE","The reviewed credential locator is not configured on this server."));
    try{return Promise.resolve(parseSecret(input.provider,JSON.parse(serialized)));}
    catch{return Promise.reject(new ExecutionError(503,"CREDENTIAL_SECRET_INVALID","The reviewed provider credential is malformed."));}
  }
}

export class StaticReviewedSecretResolver implements ReviewedSecretResolver {
  constructor(readonly secret:ResolvedProviderSecret,readonly provider:BusinessProvider="gmail"){}
  resolve(input:{provider:BusinessProvider;secretLocator:string}){if(input.provider!==this.provider)return Promise.reject(new ExecutionError(503,"CREDENTIAL_SECRET_UNAVAILABLE","The reviewed credential locator is not configured for this provider."));return Promise.resolve(parseSecret(this.provider,this.secret));}
}
