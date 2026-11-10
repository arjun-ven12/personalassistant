import { describe,expect,it,vi } from "vitest";
import { BusinessActionRequestSchema } from "@alexa-control/shared";
import { StripeTestPaymentsProvider } from "./stripe-provider.js";

const context={companyId:crypto.randomUUID(),credentialBindingId:crypto.randomUUID(),credential:{apiKey:"sk_test_reviewed_fixture_123456789"},mutationFence:7};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const payment=(id:string,status:string)=>json({id,object:"payment_intent",status,amount:500,currency:"usd"});
const confirmationFetcher=(id:string,status:string)=>vi.fn<typeof fetch>().mockImplementation((_input,init)=>Promise.resolve(payment(id,init?.method==="POST"?status:"requires_confirmation")));

describe("reviewed Stripe test-mode provider",()=>{
  it("reads Stripe test state without exposing the secret",async()=>{const fetcher=vi.fn<typeof fetch>().mockResolvedValue(json({id:"pi_test_1",object:"payment_intent",status:"succeeded"}));const provider=new StripeTestPaymentsProvider(fetcher);const result=await provider.execute(BusinessActionRequestSchema.parse({capability:"payments.read",idempotencyKey:"stripe-read-1",reason:"Read a test payment.",references:{},externalResourceId:"pi_test_1"}),context);expect(result).toMatchObject({outcome:"VERIFIED",externalReferenceId:"stripe:payment_intent:pi_test_1"});const [url,init]=fetcher.mock.calls[0]!,urlText=typeof url==="string"?url:url instanceof URL?url.href:url.url;expect(urlText).toBe("https://api.stripe.com/v1/payment_intents/pi_test_1");expect(new Headers(init?.headers).get("authorization")).toMatch(/^Bearer sk_test_/);expect(JSON.stringify(result)).not.toContain(context.credential.apiKey);});
  it("uses scoped Stripe idempotency and fencing for an approved test refund",async()=>{const fetcher=vi.fn<typeof fetch>().mockImplementation((_input,init)=>Promise.resolve(init?.method==="POST"?json({id:"re_test_1",object:"refund",status:"succeeded",payment_intent:"pi_test_1",amount:500,currency:"usd"}):payment("pi_test_1","succeeded")));const provider=new StripeTestPaymentsProvider(fetcher),action=BusinessActionRequestSchema.parse({capability:"payments.execute_refund",idempotencyKey:"stripe-refund-1",reason:"Execute an approved sandbox refund.",references:{},externalResourceId:"pi_test_1",amountMinor:500,currency:"USD",expectedVersion:"succeeded"});const first=await provider.execute(action,context),duplicate=await provider.execute(action,context);expect(first).toEqual(duplicate);expect(first.outcome).toBe("VERIFIED");expect(fetcher).toHaveBeenCalledTimes(2);const init=fetcher.mock.calls[1]![1]!;expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^[a-f0-9]{64}$/);expect(init.body instanceof URLSearchParams?init.body.toString():"").toContain("metadata%5Balexa_fence%5D=7");});
  it("never accepts a production Stripe key",async()=>{const provider=new StripeTestPaymentsProvider(vi.fn<typeof fetch>());expect(await provider.health({...context,credential:{apiKey:"sk_live_forbidden_123456789"}})).toMatchObject({state:"REAUTH_REQUIRED"});const result=await provider.execute(BusinessActionRequestSchema.parse({capability:"payments.read",idempotencyKey:"stripe-live-deny",reason:"Must deny a production key.",references:{},externalResourceId:"pi_1"}),{...context,credential:{apiKey:"sk_live_forbidden_123456789"}});expect(result).toMatchObject({outcome:"FAILED",failureKind:"EXPIRED_CREDENTIAL"});});
  it.each([
    ["succeeded","VERIFIED"],
    ["requires_action","EXTERNAL_RESULT_UNCERTAIN"],
    ["requires_payment_method","FAILED"],
    ["processing","EXTERNAL_RESULT_UNCERTAIN"],
    ["canceled","FAILED"],
    ["unknown","EXTERNAL_RESULT_UNCERTAIN"],
  ] as const)("classifies a test payment intent in %s as %s",async(status,outcome)=>{
    const fetcher=confirmationFetcher("pi_test_states",status);
    const provider=new StripeTestPaymentsProvider(fetcher);
    const action=BusinessActionRequestSchema.parse({capability:"payments.execute_charge",idempotencyKey:`charge-state-${status}`,reason:"Confirm a pre-existing test payment intent.",references:{},externalResourceId:"pi_test_states",amountMinor:500,currency:"USD",expectedVersion:"requires_confirmation"});
    expect((await provider.execute(action,context)).outcome).toBe(outcome);
  });
  it("does not reuse a private provider result or external idempotency key across companies",async()=>{
    const fetcher=confirmationFetcher("pi_shared","succeeded");
    const provider=new StripeTestPaymentsProvider(fetcher);
    const action=BusinessActionRequestSchema.parse({capability:"payments.execute_charge",idempotencyKey:"company-collision-1",reason:"Confirm a pre-existing test payment intent.",references:{},externalResourceId:"pi_shared",amountMinor:500,currency:"USD",expectedVersion:"requires_confirmation"});
    const other={...context,companyId:crypto.randomUUID(),credentialBindingId:crypto.randomUUID()};
    expect((await provider.execute(action,context)).outcome).toBe("VERIFIED");
    expect((await provider.execute(action,other)).outcome).toBe("VERIFIED");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get("idempotency-key")).not.toBe(new Headers(fetcher.mock.calls[3]![1]!.headers).get("idempotency-key"));
  });
  it("fails closed on malformed or stale payment evidence",async()=>{
    const action=BusinessActionRequestSchema.parse({capability:"payments.execute_charge",idempotencyKey:"malformed-charge-1",reason:"Check provider evidence.",references:{},externalResourceId:"pi_expected",amountMinor:500,currency:"USD",expectedVersion:"requires_confirmation"});
    const malformed=new StripeTestPaymentsProvider(vi.fn<typeof fetch>().mockImplementation((_input,init)=>Promise.resolve(init?.method==="POST"?json({id:"pi_expected",object:"payment_intent",amount:500,currency:"usd"}):payment("pi_expected","requires_confirmation"))));
    expect((await malformed.execute(action,context)).outcome).toBe("EXTERNAL_RESULT_UNCERTAIN");
    const wrongResource=new StripeTestPaymentsProvider(vi.fn<typeof fetch>().mockImplementation(()=>Promise.resolve(payment("pi_other","requires_confirmation"))));
    expect((await wrongResource.execute(action,context)).outcome).toBe("FAILED");
    const badBody=new StripeTestPaymentsProvider(vi.fn<typeof fetch>().mockImplementation(()=>Promise.resolve(json({unexpected:true}))));
    expect((await badBody.execute(action,context)).outcome).toBe("FAILED");
  });
  it("returns uncertain after a provider timeout without claiming a successful charge",async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation((_input,init)=>init?.method==="POST"?Promise.reject(new DOMException("timeout","TimeoutError")):Promise.resolve(payment("pi_timeout","requires_confirmation")));
    const provider=new StripeTestPaymentsProvider(fetcher);
    const action=BusinessActionRequestSchema.parse({capability:"payments.execute_charge",idempotencyKey:"timeout-charge-1",reason:"Check timeout handling.",references:{},externalResourceId:"pi_timeout",amountMinor:500,currency:"USD",expectedVersion:"requires_confirmation"});
    expect(await provider.execute(action,context)).toMatchObject({outcome:"EXTERNAL_RESULT_UNCERTAIN",failureKind:"TIMEOUT",retryable:false});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not verify a historical mutation from a later resource lookup",async()=>{
    const provider=new StripeTestPaymentsProvider(vi.fn<typeof fetch>().mockResolvedValue(payment("pi_reconciled","succeeded")));
    expect(await provider.reconcile("stripe:payment_intent:pi_reconciled",context)).toMatchObject({outcome:"EXTERNAL_RESULT_UNCERTAIN"});
  });
});
