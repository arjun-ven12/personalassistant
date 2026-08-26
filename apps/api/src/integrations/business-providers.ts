import type { BusinessActionRequest, BusinessProvider } from "@alexa-control/shared";

export type ProviderHealthState = "HEALTHY" | "DEGRADED" | "REAUTH_REQUIRED" | "UNAVAILABLE";
export interface BusinessProviderResult {
  outcome: "VERIFIED" | "EXTERNAL_RESULT_UNCERTAIN" | "FAILED";
  externalReferenceId: string | null;
  summary: string;
  metric?: { metricId: string; value: number; unit: string; observedAt: string };
  mapping?: { entityType: "LEAD" | "CONTACT" | "EMAIL_THREAD" | "ISSUE"; externalId: string; internalEntityId: string; externalVersion: string | null };
}
export interface ReviewedBusinessProvider {
  readonly providerId: BusinessProvider;
  readonly capabilities: ReadonlySet<BusinessActionRequest["capability"]>;
  health(): Promise<{ state: ProviderHealthState; reasonCode: string; rateLimitRemaining: number | null }>;
  execute(action: BusinessActionRequest): Promise<BusinessProviderResult>;
  reconcile(externalReferenceId: string): Promise<BusinessProviderResult>;
}

export class UnavailableBusinessProvider implements ReviewedBusinessProvider {
  readonly capabilities = new Set<BusinessActionRequest["capability"]>();
  constructor(readonly providerId: BusinessProvider) {}
  health() { return Promise.resolve({ state: "UNAVAILABLE" as const, reasonCode: "PROVIDER_NOT_CONFIGURED", rateLimitRemaining: null }); }
  execute() { return Promise.resolve({ outcome: "FAILED" as const, externalReferenceId: null, summary: "The reviewed provider is not configured." }); }
  reconcile() { return Promise.resolve({ outcome: "FAILED" as const, externalReferenceId: null, summary: "The reviewed provider is not configured." }); }
}

export class DeterministicBusinessProvider implements ReviewedBusinessProvider {
  readonly #results = new Map<string, BusinessProviderResult>();
  readonly #references = new Map<string, BusinessProviderResult>();
  readonly #metrics = new Map<string, { value: number; unit: string }>();
  #health: ProviderHealthState = "HEALTHY";
  #uncertainOnce = false;
  #failuresRemaining = 0;
  executionCount = 0;
  constructor(readonly providerId: BusinessProvider, readonly capabilities: ReadonlySet<BusinessActionRequest["capability"]>) {}
  setHealth(state:ProviderHealthState){this.#health=state;}
  setMetric(metricId:string,value:number,unit:string){this.#metrics.set(metricId,{value,unit});}
  makeNextExecutionUncertain(){this.#uncertainOnce=true;}
  failNextExecutions(count:number){this.#failuresRemaining=Math.max(0,count);}
  health(){return Promise.resolve({state:this.#health,reasonCode:this.#health==="HEALTHY"?"OK":"DETERMINISTIC_PROVIDER_STATE",rateLimitRemaining:100});}
  execute(action:BusinessActionRequest):Promise<BusinessProviderResult>{
    const existing=this.#results.get(action.idempotencyKey);if(existing)return Promise.resolve(structuredClone(existing));
    this.executionCount+=1;
    if(this.#failuresRemaining>0){this.#failuresRemaining-=1;const failed={outcome:"FAILED",externalReferenceId:null,summary:"The deterministic provider returned a retryable failure."} as const;this.#results.set(action.idempotencyKey,failed);return Promise.resolve(structuredClone(failed));}
    if(this.#uncertainOnce){this.#uncertainOnce=false;const uncertain={outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:`${this.providerId}:uncertain:${action.idempotencyKey}`,summary:"The provider may have accepted the side effect; reconciliation is required."} as const;this.#results.set(action.idempotencyKey,uncertain);return Promise.resolve(structuredClone(uncertain));}
    const externalReferenceId=`${this.providerId}:${action.capability}:${this.executionCount}`;
    let metricResult:BusinessProviderResult["metric"];
    if(action.capability==="analytics.read_metric"){const metric=this.#metrics.get(action.metricId);if(metric)metricResult={metricId:action.metricId,value:metric.value,unit:metric.unit,observedAt:action.windowEnd};}
    const result:BusinessProviderResult={outcome:"VERIFIED",externalReferenceId,summary:`${action.capability} completed and was verified by the deterministic provider.`,...(metricResult?{metric:metricResult}:{}),...(action.capability==="crm.create_lead"?{mapping:{entityType:"LEAD",externalId:externalReferenceId,internalEntityId:action.internalEntityId,externalVersion:"1"}}:{})};
    this.#results.set(action.idempotencyKey,result);this.#references.set(externalReferenceId,result);return Promise.resolve(structuredClone(result));
  }
  reconcile(externalReferenceId:string):Promise<BusinessProviderResult>{const result:BusinessProviderResult=this.#references.get(externalReferenceId)??{outcome:"VERIFIED",externalReferenceId,summary:"The deterministic provider confirmed the external effect."};return Promise.resolve(structuredClone(result));}
}
