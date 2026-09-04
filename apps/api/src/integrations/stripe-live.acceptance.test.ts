import { describe,expect,it } from "vitest";
import { BusinessActionRequestSchema } from "@alexa-control/shared";
import { AllowlistedEnvironmentSecretResolver } from "./secret-resolver.js";
import { StripeTestPaymentsProvider } from "./stripe-provider.js";

const serialized=process.env.STRIPE_TEST_CREDENTIAL_JSON;
describe.skipIf(!serialized)("Stripe test-mode credential acceptance",()=>{
  it("performs a read-only balance smoke check without exposing credentials",async()=>{const resolver=new AllowlistedEnvironmentSecretResolver({"payments:stripe-live-acceptance":serialized}),credential=await resolver.resolve({provider:"payments",secretLocator:"stripe-live-acceptance"}),provider=new StripeTestPaymentsProvider(),context={companyId:crypto.randomUUID(),credentialBindingId:crypto.randomUUID(),credential};expect(await provider.health(context)).toMatchObject({state:"HEALTHY"});const result=await provider.execute(BusinessActionRequestSchema.parse({capability:"payments.read",idempotencyKey:`stripe-balance-${crypto.randomUUID()}`,reason:"Read Stripe test-mode balance for credential acceptance.",references:{},externalResourceId:null}),context);expect(result.outcome).toBe("VERIFIED");expect(JSON.stringify(result)).not.toContain(credential.apiKey);},20_000);
});
