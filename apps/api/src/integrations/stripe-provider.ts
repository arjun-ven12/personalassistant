import { z } from "zod";
import type { BusinessActionRequest } from "@alexa-control/shared";
import type { BusinessProviderExecutionContext,BusinessProviderResult,PaymentsProvider } from "./business-providers.js";
import { providerActionIdentity } from "./provider-cache.js";

const StripeObjectSchema=z.object({id:z.string().min(3).max(255),object:z.string().min(1).max(80),status:z.string().max(80).optional(),currency:z.string().max(3).optional(),amount:z.number().int().safe().nonnegative().optional(),payment_intent:z.string().max(255).nullable().optional()}).passthrough();
const StripeListSchema=z.object({data:z.array(StripeObjectSchema).max(100)}).passthrough();
type Fetcher=typeof fetch;

/** Test-mode-only Stripe adapter. Production keys are rejected structurally. */
export class StripeTestPaymentsProvider implements PaymentsProvider{
  readonly providerId="payments" as const;readonly supportsIdempotentWrites=true;readonly requiresCredential=true;
  readonly capabilities=new Set<BusinessActionRequest["capability"]>(["payments.read","payments.prepare_refund","payments.execute_refund","payments.execute_charge","payments.cancel_subscription"]);
  readonly #results=new Map<string,{digest:string;result:BusinessProviderResult}>();
  constructor(readonly fetcher:Fetcher=fetch){}
  health(context?:BusinessProviderExecutionContext){return Promise.resolve(context?.credential?.apiKey?.startsWith("sk_test_")?{state:"HEALTHY" as const,reasonCode:"STRIPE_TEST_MODE_READY",rateLimitRemaining:null}:{state:"REAUTH_REQUIRED" as const,reasonCode:"STRIPE_TEST_CREDENTIAL_REQUIRED",rateLimitRemaining:null});}
  async execute(action:BusinessActionRequest,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    if(!this.capabilities.has(action.capability))return this.failed("PERMISSION_DENIED",false,"The Stripe test adapter does not expose this capability.");
    const identity=providerActionIdentity(this.providerId,action,context);
    if(!identity)return this.failed("PERMISSION_DENIED",false,"A company-scoped credential binding is required.");
    const prior=this.#results.get(identity.scope);if(prior)return prior.digest===identity.digest?structuredClone(prior.result):this.failed("INVALID_RECORD",false,"The provider idempotency key is bound to another action.");
    const resource="externalResourceId" in action?action.externalResourceId:null;
    let mutationDispatched=false;
    try{
      const key=this.key(context);
      let parsed:z.infer<typeof StripeObjectSchema>;
      if((action.capability==="payments.execute_charge"||action.capability==="payments.execute_refund")&&resource){
        const current=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}`,key));
        if(current.object!=="payment_intent"||current.id!==resource||current.status!==action.expectedVersion||current.currency?.toUpperCase()!==action.currency||(action.capability==="payments.execute_charge"&&current.amount!==action.amountMinor)||(action.capability==="payments.execute_refund"&&(current.amount===undefined||action.amountMinor===null||current.amount<action.amountMinor)))return this.failed("INVALID_RECORD",false,"The Stripe payment version, amount, or currency changed before the approved mutation.");
      }
      if(action.capability==="payments.read"){if(resource)parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}`,key));else{z.object({object:z.literal("balance")}).passthrough().parse(await this.request("/v1/balance",key));parsed={id:"balance",object:"balance"};}}
      else if(action.capability==="payments.prepare_refund"){if(!resource)return this.failed("INVALID_RECORD",false,"A Stripe payment intent is required to prepare a refund.");parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}`,key));}
      else if(action.capability==="payments.execute_refund"){if(!resource||action.amountMinor===null)return this.failed("INVALID_RECORD",false,"A Stripe payment intent and amount are required.");mutationDispatched=true;parsed=StripeObjectSchema.parse(await this.request("/v1/refunds",key,{method:"POST",body:new URLSearchParams({payment_intent:resource,amount:String(action.amountMinor),"metadata[alexa_fence]":String(context?.mutationFence??0)})},identity.externalIdempotencyKey));}
      else if(action.capability==="payments.execute_charge"){if(!resource)return this.failed("INVALID_RECORD",false,"A pre-existing Stripe test payment intent is required.");mutationDispatched=true;parsed=StripeObjectSchema.parse(await this.request(`/v1/payment_intents/${encodeURIComponent(resource)}/confirm`,key,{method:"POST",body:new URLSearchParams({"metadata[alexa_fence]":String(context?.mutationFence??0)})},identity.externalIdempotencyKey));}
      else {if(!resource)return this.failed("INVALID_RECORD",false,"A Stripe test subscription is required.");mutationDispatched=true;parsed=StripeObjectSchema.parse(await this.request(`/v1/subscriptions/${encodeURIComponent(resource)}`,key,{method:"DELETE"},identity.externalIdempotencyKey));}
      const result=this.classify(action,parsed);
      this.#results.set(identity.scope,{digest:identity.digest,result});return structuredClone(result);
    }catch(error){const failure=error instanceof StripeProviderError?error:new StripeProviderError("INVALID_RECORD",false);return mutationDispatched&&failure.retryable?{outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:`stripe:lookup:${action.capability}:${resource??action.idempotencyKey}`,summary:"Stripe test-mode acknowledgement was indeterminate; reconcile before retry.",failureKind:failure.kind,retryable:false}:this.failed(failure.kind,mutationDispatched?failure.retryable:false,`Stripe test mode rejected the bounded request (${failure.kind}).`);}
  }
  async reconcile(reference:string,context?:BusinessProviderExecutionContext):Promise<BusinessProviderResult>{
    const parts=reference.split(":");try{
      const key=this.key(context);
      if(parts[1]==="refund"||parts[1]==="payment_intent"||parts[1]==="subscription"){const route=parts[1]==="refund"?"refunds":parts[1]==="subscription"?"subscriptions":"payment_intents";const parsed=StripeObjectSchema.parse(await this.request(`/v1/${route}/${encodeURIComponent(parts.slice(2).join(":"))}`,key));if(parsed.id!==parts.slice(2).join(":"))return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe returned a different resource during reconciliation."};return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"The provider resource exists, but its current state cannot prove the exact approved mutation; owner reconciliation is required."};}
      if(parts[1]==="lookup"&&parts[2]==="payments.execute_refund"){const payment=parts.slice(3).join(":");StripeListSchema.parse(await this.request(`/v1/refunds?payment_intent=${encodeURIComponent(payment)}&limit=1`,key));return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"A refund list cannot prove this exact approved mutation; owner reconciliation is required."};}
      return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe test mode has not yet confirmed the external mutation."};
    }catch{return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe test-mode reconciliation could not confirm the external mutation."};}
  }
  private key(context?:BusinessProviderExecutionContext){const key=context?.credential?.apiKey;if(!key?.startsWith("sk_test_"))throw new StripeProviderError("EXPIRED_CREDENTIAL",false);return key;}
  private classify(action:BusinessActionRequest,parsed:z.infer<typeof StripeObjectSchema>):BusinessProviderResult{
    const expected=action.capability==="payments.execute_refund"?"refund":action.capability==="payments.cancel_subscription"?"subscription":"payment_intent";
    const reference=`stripe:${expected}:${parsed.id}`;
    const mutation=["payments.execute_refund","payments.execute_charge","payments.cancel_subscription"].includes(action.capability);
    const mismatch=parsed.object!==expected||action.capability!=="payments.execute_refund"&&"externalResourceId" in action&&action.externalResourceId&&parsed.id!==action.externalResourceId;
    if(mismatch)return mutation?{outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe returned a resource that does not match the approved mutation; reconcile before any retry.",retryable:false}:this.failed("INVALID_RECORD",false,"Stripe returned an unexpected resource.");
    if((action.capability==="payments.execute_refund"&&(parsed.payment_intent!==action.externalResourceId||parsed.amount!==action.amountMinor||parsed.currency?.toUpperCase()!==action.currency))||(action.capability==="payments.execute_charge"&&(parsed.amount!==action.amountMinor||parsed.currency?.toUpperCase()!==action.currency)))return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:"Stripe amount, currency, or payment evidence did not match the approved mutation.",retryable:false};
    if(action.capability==="payments.read"||action.capability==="payments.prepare_refund")return {outcome:"VERIFIED",externalReferenceId:reference,summary:"Stripe test mode returned the requested read-only resource."};
    return this.classifyStatus(expected,parsed,reference);
  }
  private classifyStatus(kind:string,parsed:z.infer<typeof StripeObjectSchema>,reference:string):BusinessProviderResult{
    if(parsed.status==="succeeded"&&(kind==="refund"||kind==="payment_intent")||parsed.status==="canceled"&&kind==="subscription")return {outcome:"VERIFIED",externalReferenceId:reference,summary:"Stripe test mode confirmed the terminal provider state."};
    if(["requires_payment_method","canceled","failed"].includes(parsed.status??"")&&kind!=="subscription")return {outcome:"FAILED",externalReferenceId:reference,summary:"Stripe test mode reported a failed or canceled transaction.",failureKind:"INVALID_RECORD",retryable:false};
    return {outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:reference,summary:parsed.status==="requires_action"?"Stripe requires an additional action before completion.":"Stripe has not confirmed the terminal provider state.",retryable:false};
  }
  private async request(path:string,key:string,init:RequestInit={method:"GET"},idempotencyKey?:string):Promise<unknown>{let response:Response;try{response=await this.fetcher(`https://api.stripe.com${path}`,{...init,headers:{authorization:`Bearer ${key}`,...(idempotencyKey?{"idempotency-key":idempotencyKey}:{}),...(init.body?{"content-type":"application/x-www-form-urlencoded"}:{}),...init.headers},signal:AbortSignal.timeout(10_000)});}catch(error){if(error instanceof Error&&error.name==="TimeoutError")throw new StripeProviderError("TIMEOUT",true);throw new StripeProviderError("OUTAGE",true);}if(!response.ok){if(response.status===401)throw new StripeProviderError("EXPIRED_CREDENTIAL",false);if(response.status===403)throw new StripeProviderError("PERMISSION_DENIED",false);if(response.status===429)throw new StripeProviderError("RATE_LIMIT",true);if(response.status>=500)throw new StripeProviderError("OUTAGE",true);throw new StripeProviderError("INVALID_RECORD",false);}const body:unknown=await response.json();return body;}
  private failed(kind:NonNullable<BusinessProviderResult["failureKind"]>,retryable:boolean,summary:string):BusinessProviderResult{return {outcome:"FAILED",externalReferenceId:null,summary,failureKind:kind,retryable};}
}
class StripeProviderError extends Error{constructor(readonly kind:NonNullable<BusinessProviderResult["failureKind"]>,readonly retryable:boolean){super(kind);}}
