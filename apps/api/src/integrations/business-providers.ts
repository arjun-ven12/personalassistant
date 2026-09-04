import type { BusinessActionRequest, BusinessProvider } from "@alexa-control/shared";
import type { ResolvedProviderSecret } from "./secret-resolver.js";

export type ProviderHealthState = "HEALTHY" | "DEGRADED" | "REAUTH_REQUIRED" | "UNAVAILABLE";
export interface BusinessProviderResult {
  outcome: "VERIFIED" | "EXTERNAL_RESULT_UNCERTAIN" | "FAILED";
  externalReferenceId: string | null;
  summary: string;
  failureKind?: "TIMEOUT" | "RATE_LIMIT" | "OUTAGE" | "EXPIRED_CREDENTIAL" | "PERMISSION_DENIED" | "INVALID_RECORD" | null;
  retryable?: boolean;
  metric?: { metricId: string; value: number; unit: string; observedAt: string };
  mapping?: { entityType: "LEAD" | "CONTACT" | "EMAIL_THREAD" | "ISSUE" | "SUPPORT_TICKET" | "DOCUMENT" | "PROJECT_TASK" | "CRM_FOLLOW_UP" | "CUSTOMER" | "ORDER" | "PAYMENT" | "INVOICE" | "CAMPAIGN" | "PRODUCT" | "REFUND"; externalId: string; internalEntityId: string; externalVersion: string | null };
}
export interface ReviewedBusinessProvider {
  readonly providerId: BusinessProvider;
  readonly capabilities: ReadonlySet<BusinessActionRequest["capability"]>;
  readonly supportsIdempotentWrites: boolean;
  readonly requiresCredential?:boolean;
  health(context?:BusinessProviderExecutionContext): Promise<{ state: ProviderHealthState; reasonCode: string; rateLimitRemaining: number | null }>;
  execute(action: BusinessActionRequest, context?:BusinessProviderExecutionContext): Promise<BusinessProviderResult>;
  reconcile(externalReferenceId: string, context?:BusinessProviderExecutionContext): Promise<BusinessProviderResult>;
}
export interface BusinessProviderExecutionContext {companyId:string|null;credentialBindingId:string|null;credential:ResolvedProviderSecret|null;mutationFence?:number;}

export class UnavailableBusinessProvider implements ReviewedBusinessProvider {
  readonly capabilities = new Set<BusinessActionRequest["capability"]>();
  readonly supportsIdempotentWrites = false;
  constructor(readonly providerId: BusinessProvider) {}
  health() { return Promise.resolve({ state: "UNAVAILABLE" as const, reasonCode: "PROVIDER_NOT_CONFIGURED", rateLimitRemaining: null }); }
  execute() { return Promise.resolve({ outcome: "FAILED" as const, externalReferenceId: null, summary: "The reviewed provider is not configured." }); }
  reconcile() { return Promise.resolve({ outcome: "FAILED" as const, externalReferenceId: null, summary: "The reviewed provider is not configured." }); }
}

export class DeterministicBusinessProvider implements ReviewedBusinessProvider {
  readonly supportsIdempotentWrites = true;
  readonly #results = new Map<string, BusinessProviderResult>();
  readonly #references = new Map<string, BusinessProviderResult>();
  readonly #metrics = new Map<string, { value: number; unit: string }>();
  #health: ProviderHealthState = "HEALTHY";
  #uncertainOnce = false;
  #failuresRemaining = 0;
  #failureKind: NonNullable<BusinessProviderResult["failureKind"]> = "OUTAGE";
  executionCount = 0;
  constructor(readonly providerId: BusinessProvider, readonly capabilities: ReadonlySet<BusinessActionRequest["capability"]>) {}
  setHealth(state:ProviderHealthState){this.#health=state;}
  setMetric(metricId:string,value:number,unit:string){this.#metrics.set(metricId,{value,unit});}
  makeNextExecutionUncertain(){this.#uncertainOnce=true;}
  failNextExecutions(count:number, kind:NonNullable<BusinessProviderResult["failureKind"]>="OUTAGE"){this.#failuresRemaining=Math.max(0,count);this.#failureKind=kind;}
  health(){return Promise.resolve({state:this.#health,reasonCode:this.#health==="HEALTHY"?"OK":"DETERMINISTIC_PROVIDER_STATE",rateLimitRemaining:100});}
  execute(action:BusinessActionRequest):Promise<BusinessProviderResult>{
    const existing=this.#results.get(action.idempotencyKey);if(existing)return Promise.resolve(structuredClone(existing));
    this.executionCount+=1;
    if(this.#failuresRemaining>0){this.#failuresRemaining-=1;const failed={outcome:"FAILED",externalReferenceId:null,summary:`The deterministic provider returned ${this.#failureKind}.`,failureKind:this.#failureKind,retryable:["TIMEOUT","RATE_LIMIT","OUTAGE"].includes(this.#failureKind)} as const;return Promise.resolve(structuredClone(failed));}
    if(this.#uncertainOnce){this.#uncertainOnce=false;const uncertain={outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:`${this.providerId}:uncertain:${action.idempotencyKey}`,summary:"The provider may have accepted the side effect; reconciliation is required."} as const;this.#results.set(action.idempotencyKey,uncertain);return Promise.resolve(structuredClone(uncertain));}
    const externalReferenceId=`${this.providerId}:${action.capability}:${this.executionCount}`;
    let metricResult:BusinessProviderResult["metric"];
    if(action.capability==="analytics.read_metric"){const metric=this.#metrics.get(action.metricId);if(metric)metricResult={metricId:action.metricId,value:metric.value,unit:metric.unit,observedAt:action.windowEnd};}
    if(action.capability==="analytics.query_metric"&&action.metricId){const metric=this.#metrics.get(action.metricId);if(metric)metricResult={metricId:action.metricId,value:metric.value,unit:metric.unit,observedAt:action.periodEnd!};}
    const mapping = action.capability==="crm.create_lead" ? {entityType:"LEAD" as const,externalId:externalReferenceId,internalEntityId:action.internalEntityId,externalVersion:"1"}
      : action.capability==="crm.create_follow_up" ? {entityType:"CRM_FOLLOW_UP" as const,externalId:externalReferenceId,internalEntityId:action.internalTaskId,externalVersion:"1"}
      : action.capability==="documents.create" ? {entityType:"DOCUMENT" as const,externalId:externalReferenceId,internalEntityId:action.internalEntityId,externalVersion:"1"}
      : action.capability==="projects.create_task" ? {entityType:"PROJECT_TASK" as const,externalId:externalReferenceId,internalEntityId:action.internalTaskId,externalVersion:"1"}
      : undefined;
    const result:BusinessProviderResult={outcome:"VERIFIED",externalReferenceId,summary:`${action.capability} completed and was verified by the deterministic provider.`,...(metricResult?{metric:metricResult}:{}),...(mapping?{mapping}:{})};
    this.#results.set(action.idempotencyKey,result);this.#references.set(externalReferenceId,result);return Promise.resolve(structuredClone(result));
  }
  reconcile(externalReferenceId:string):Promise<BusinessProviderResult>{const result:BusinessProviderResult=this.#references.get(externalReferenceId)??{outcome:"VERIFIED",externalReferenceId,summary:"The deterministic provider confirmed the external effect."};return Promise.resolve(structuredClone(result));}
}

/** Domain-specific adapter contracts keep workflows vendor-neutral. */
export interface EmailProvider extends ReviewedBusinessProvider { readonly providerId: "gmail"; }
export interface CrmProvider extends ReviewedBusinessProvider { readonly providerId: "crm"; }
export interface SupportProvider extends ReviewedBusinessProvider { readonly providerId: "support"; }
export interface DocumentProvider extends ReviewedBusinessProvider { readonly providerId: "documents"; }
export interface ProjectManagementProvider extends ReviewedBusinessProvider { readonly providerId: "projects"; }
export interface AccountingProvider extends ReviewedBusinessProvider { readonly providerId: "accounting"; }
export interface PaymentsProvider extends ReviewedBusinessProvider { readonly providerId: "payments"; }
export interface AdsProvider extends ReviewedBusinessProvider { readonly providerId: "ads"; }
export interface AnalyticsProvider extends ReviewedBusinessProvider { readonly providerId: "analytics"; }
export interface CommerceProvider extends ReviewedBusinessProvider { readonly providerId: "commerce"; }
