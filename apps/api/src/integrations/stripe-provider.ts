import { z } from "zod";
import type { BusinessActionRequest } from "@alexa-control/shared";
import type { BusinessProviderExecutionContext,BusinessProviderResult,PaymentsProvider } from "./business-providers.js";

const StripeObjectSchema=z.object({id:z.string().min(3).max(255),object:z.string().min(1).max(80),status:z.string().max(80).optional(),currency:z.string().max(3).optional(),amount:z.number().int().safe().nonnegative().optional()}).passthrough();
const StripeListSchema=z.object({data:z.array(StripeObjectSchema).max(100)}).passthrough();
type Fetcher=typeof fetch;

/** Test-mode-only Stripe adapter. Production keys are rejected structurally. */
export class StripeTestPaymentsProvider implements PaymentsProvider{
  readonly providerId="payments" as const;readonly supportsIdempotentWrites=true;readonly requiresCredential=true;
  readonly capabilities=new Set<BusinessActionRequest["capability"]>(["payments.read","payments.prepare_refund","payments.execute_refund","payments.execute_charge","payments.cancel_subscription"]);
  readonly #results=new Map<string,BusinessProviderResult>();
  constructor(readonly fetcher:Fetcher=fetch){}
  health(context?:BusinessProviderExecutionContext){return Promise.resolve(context?.credential?.apiKey?.startsWith("sk_test_")?{state:"HEALTHY" as const,reasonCode:"STRIPE_TEST_MODE_READY",rateLimitRemaining:null}:{state:"REAUTH_REQUIRED" as const,reasonCode:"STRIPE_TEST_CREDENTIAL_REQUIRED",rateLimitRemaining:null});}
  async execute(action:BusinessActionRequest,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    if(!this.capabilities.has(action.capability))return this.failed("PERMISSION_DENIED",false,"The Stripe test adapter does not expose this capability.");
    const prior=this.#results.get(action.idempotencyKey);if(prior)return structuredClone(prior);
    const resource="externalResourceId" in action?action.externalResourceId:null;
    try{
      const key=this.key(context);
      let parsed:z.infer<typeof StripeObjectSchema>;
      if(action.capability==="payments.read"){if(resource)parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}`,key));else{z.object({object:z.literal("balance")}).passthrough().parse(await this.request("/v1/balance",key));parsed={id:"balance",object:"balance"};}}
      else if(action.capability==="payments.prepare_refund"){if(!resource)return this.failed("INVALID_RECORD",false,"A Stripe payment intent is required to prepare a refund.");parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}`,key));}
      else if(action.capability==="payments.execute_refund"){if(!resource||action.amountMinor===null)return this.failed("INVALID_RECORD",false,"A Stripe payment intent and amount are required.");parsed=StripeObjectSchema.parse(await this.request("/v1/refunds",key,{method:"POST",body:new URLSearchParams({payment_intent:resource,amount:String(action.amountMinor),"metadata[alexa_fence]":String(context?.mutationFence??0)})},action.idempotencyKey));}
      else if(action.capability==="payments.execute_charge"){if(!resource)return this.failed("INVALID_RECORD",false,"A pre-existing Stripe test payment intent is required.");parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}/confirm`,key,{method:"POST",body:new URLSearchParams({"metadata[alexa_fence]":String(context?.mutationFence??0)})},action.idempotencyKey));}
      else {if(!resource)return this.failed("INVALID_RECORD",false,"A Stripe test subscription is required.");parsed=StripeObjectSchema.parse(await this.request(`/v1/subscriptions/${encodeURIComponent(resource)}`,key,{method:"DELETE"},action.idempotencyKey));}
      const kind=parsed.object==="refund"?"refund":parsed.object==="subscription"?"subscription":"payment_intent",result:BusinessProviderResult={outcome:"VERIFIED",externalReferenceId:`stripe:${kind}:${parsed.id}`,summary:`Stripe test mode acknowledged and returned ${kind} state.`};this.#results.set(action.idempotencyKey,result);return structuredClone(result);
    }catch(error){const failure=error instanceof StripeProviderError?error:new StripeProviderError("INVALID_RECORD",false);const mutation=["payments.execute_refund","payments.execute_charge","payments.cancel_subscription"].includes(action.capability);return mutation&&failure.retryable?{outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:`stripe:lookup:${action.capability}:${resource??action.idempotencyKey}`,summary:"Stripe test-mode acknowledgement was indeterminate; reconcile before retry.",failureKind:failure.kind,retryable:false}:this.failed(failure.kind,failure.retryable,`Stripe test mode rejected the bounded request (${failure.kind}).`);}
  }
  async reconcile(reference:string,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    const parts=reference.split(":");try{
      const key=this.key(context);
      if(parts[1]==="refund"||parts[1]==="payment_intent"||parts[1]==="subscription"){const route=parts[1]==="refund"?"refunds":parts[1]==="subscription"?"subscriptions":"payment_intents";await this.request(`/v1/${route}/${encodeURIComponent(parts.slice(2).join(":"))}`,key);return {outcome:"VERIFIED",externalReferenceId:reference,summary:"Stripe test mode independently confirmed the external resource."};}
      if(parts[1]==="lookup"&&parts[2]==="payments.execute_refund"){const payment=parts.slice(3).join(":");const list=StripeListSchema.parse(await this.request(`/v1/refunds?payment_intent=${encodeURIComponent(payment)}&limit=1`,key));if(list.data.length)return {outcome:"VERIFIED",externalReferenceId:`stripe:refund:${list.data[0]!.id}`,summary:"Stripe test mode found the refund during reconciliation."};}
      return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe test mode has not yet confirmed the external mutation."};
    }catch{return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe test-mode reconciliation could not confirm the external mutation."};}
  }
  private key(context?:BusinessProviderExecutionContext){const key=context?.credential?.apiKey;if(!key?.startsWith("sk_test_"))throw new StripeProviderError("EXPIRED_CREDENTIAL",false);return key;}
  private async request(path:string,key:string,init:RequestInit={method:"GET"},idempotencyKey?:string):Promise<unknown>{let response:Response;try{response=await this.fetcher(`https://api.stripe.com${path}`,{...init,headers:{authorization:`Bearer ${key}`,...(idempotencyKey?{"idempotency-key":idempotencyKey}:{}),...(init.body?{"content-type":"application/x-www-form-urlencoded"}:{}),...init.headers},signal:AbortSignal.timeout(10_000)});}catch(error){if(error instanceof Error&&error.name==="TimeoutError")throw new StripeProviderError("TIMEOUT",true);throw new StripeProviderError("OUTAGE",true);}if(!response.ok){if(response.status===401)throw new StripeProviderError("EXPIRED_CREDENTIAL",false);if(response.status===403)throw new StripeProviderError("PERMISSION_DENIED",false);if(response.status===429)throw new StripeProviderError("RATE_LIMIT",true);if(response.status>=500)throw new StripeProviderError("OUTAGE",true);throw new StripeProviderError("INVALID_RECORD",false);}const body:unknown=await response.json();return body;}
  private failed(kind:NonNullable<BusinessProviderResult["failureKind"]>,retryable:boolean,summary:string):BusinessProviderResult{return {outcome:"FAILED",externalReferenceId:null,summary,failureKind:kind,retryable};}
}
class StripeProviderError extends Error{constructor(readonly kind:NonNullable<BusinessProviderResult["failureKind"]>,readonly retryable:boolean){super(kind);}}
