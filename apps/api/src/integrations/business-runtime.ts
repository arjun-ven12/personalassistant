import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  BusinessActionRequestSchema, BusinessEntityMappingSchema, BusinessExecutionRecordSchema,
  BusinessExternalEventInputSchema, BusinessExternalEventSchema, BusinessOperationsDashboardSchema,
  CommercialCapabilitySchema, CommercialFactSchema, ExternalMetricObservationSchema, IntegrationSyncCheckpointSchema, OutcomeAttributionSchema, ProposedActionSchema,
  type BusinessActionRequest, type BusinessCapability, type BusinessProvider,
} from "@alexa-control/shared";
import type { ApprovalService, GovernanceAuditWriter } from "../governance/approval-service.js";
import { ExecutionError } from "../execution/errors.js";
import type { CommercialActionClass,CommercialAggregateReservation,IntegrationStore } from "./store.js";
import type { CompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import type { BusinessProviderResult,ReviewedBusinessProvider } from "./business-providers.js";
import { UnavailableBusinessProvider } from "./business-providers.js";
import type { ReviewedSecretResolver } from "./secret-resolver.js";

const PROVIDER_BY_CAPABILITY:Record<BusinessCapability,BusinessProvider>={
  "email.search":"gmail","email.read_thread":"gmail","email.list_attachments":"gmail","email.create_draft":"gmail","email.send_draft":"gmail","email.reply":"gmail","email.forward":"gmail",
  "crm.search_leads":"crm","crm.search_contacts":"crm","crm.search_companies":"crm","crm.read_lead":"crm","crm.read_pipeline":"crm","crm.read_activity":"crm","crm.create_lead":"crm","crm.update_stage":"crm","crm.add_note":"crm","crm.create_follow_up":"crm",
  "support.list_tickets":"support","support.search_tickets":"support","support.read_ticket":"support","support.create_draft":"support","support.reply":"support","support.change_status":"support","support.assign":"support","support.add_note":"support","support.escalate":"support",
  "documents.find":"documents","documents.read":"documents","documents.create":"documents","documents.update":"documents","documents.attach_reference":"documents",
  "projects.list":"projects","projects.search":"projects","projects.read_task":"projects","projects.create_task":"projects","projects.update_task":"projects","projects.assign_task":"projects","projects.change_status":"projects","projects.comment":"projects","projects.set_due_date":"projects","projects.set_priority":"projects",
  "analytics.read_metric":"analytics","github.read_issue":"github","github.create_issue":"github","github.read_pull_request":"github",
  ...Object.fromEntries(CommercialCapabilitySchema.options.map((capability)=>[capability,capability.split(".")[0]])) as Record<(typeof CommercialCapabilitySchema.options)[number],BusinessProvider>,
};
const INTEGRATION_CAPABILITY:Record<BusinessCapability,string>={
  "email.search":"gmail.email.read","email.read_thread":"gmail.email.read","email.list_attachments":"gmail.email.read","email.create_draft":"gmail.email.draft","email.send_draft":"gmail.email.send","email.reply":"gmail.email.send","email.forward":"gmail.email.send",
  "crm.search_leads":"crm.lead.read","crm.search_contacts":"crm.lead.read","crm.search_companies":"crm.lead.read","crm.read_lead":"crm.lead.read","crm.read_pipeline":"crm.lead.read","crm.read_activity":"crm.lead.read","crm.create_lead":"crm.lead.write","crm.update_stage":"crm.lead.write","crm.add_note":"crm.lead.write","crm.create_follow_up":"crm.lead.write",
  "support.list_tickets":"support.ticket.read","support.search_tickets":"support.ticket.read","support.read_ticket":"support.ticket.read","support.create_draft":"support.ticket.draft","support.reply":"support.ticket.reply","support.change_status":"support.ticket.write","support.assign":"support.ticket.write","support.add_note":"support.ticket.write","support.escalate":"support.ticket.write",
  "documents.find":"documents.read","documents.read":"documents.read","documents.create":"documents.write","documents.update":"documents.write","documents.attach_reference":"documents.write",
  "projects.list":"projects.task.read","projects.search":"projects.task.read","projects.read_task":"projects.task.read","projects.create_task":"projects.task.write","projects.update_task":"projects.task.write","projects.assign_task":"projects.task.write","projects.change_status":"projects.task.write","projects.comment":"projects.task.write","projects.set_due_date":"projects.task.write","projects.set_priority":"projects.task.write",
  "analytics.read_metric":"analytics.metric.read","github.read_issue":"github.repository.read","github.create_issue":"github.issue.write","github.read_pull_request":"github.repository.read",
  ...Object.fromEntries(CommercialCapabilitySchema.options.map((capability)=>{
    const provider=capability.split(".")[0];
    const operation=capability.split(".")[1]??"";
    const mode=operation.startsWith("prepare_")||operation.includes("draft")?"prepare":operation.startsWith("execute_")||operation==="cancel_subscription"?"execute":["adjust_budget","pause_campaign","resume_campaign","update_inventory","update_product","update_order_note","cancel_order","add_transaction_note","mark_for_review"].includes(operation)?"write":"read";
    return [capability,provider==="analytics"?"analytics.metric.read":`${provider}.${mode}`];
  })) as Record<(typeof CommercialCapabilitySchema.options)[number],string>,
};
const COMMERCIAL_WRITES=CommercialCapabilitySchema.options.filter((capability)=>!INTEGRATION_CAPABILITY[capability].endsWith(".read"));
const SIDE_EFFECTS=new Set<BusinessCapability>(["email.send_draft","email.reply","email.forward","crm.create_lead","crm.update_stage","crm.add_note","crm.create_follow_up","support.reply","support.change_status","support.assign","support.add_note","support.escalate","documents.create","documents.update","documents.attach_reference","projects.create_task","projects.update_task","projects.assign_task","projects.change_status","projects.comment","projects.set_due_date","projects.set_priority","github.create_issue",...COMMERCIAL_WRITES]);
const APPROVALS=new Set<BusinessCapability>(SIDE_EFFECTS);
const HIGH_RISK=new Set<BusinessCapability>(["email.send_draft","email.reply","email.forward","support.reply","payments.execute_charge","payments.execute_refund","payments.cancel_subscription","ads.adjust_budget","ads.resume_campaign","commerce.update_product","commerce.update_inventory","commerce.create_draft_discount","commerce.cancel_order"]);
const STEP_UP_REQUIRED=new Set<BusinessCapability>(["payments.execute_charge","payments.execute_refund","payments.cancel_subscription","ads.adjust_budget","ads.resume_campaign","commerce.update_product","commerce.update_inventory","commerce.create_draft_discount","commerce.cancel_order"]);
const capabilityAuthority=(capability:BusinessCapability)=>capability.startsWith("email.")?(capability==="email.send_draft"?"email.send":capability==="email.create_draft"?"email.draft":"email.read"):undefined;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const summary=(action:BusinessActionRequest)=>{
  switch(action.capability){
    case "email.create_draft":return `Create an email draft for ${action.to.length} recipient${action.to.length===1?"":"s"}.`;
    case "email.send_draft":return `Send reviewed email draft ${action.draftId} to ${action.recipientCount} recipient${action.recipientCount===1?"":"s"}.`;
    case "email.reply":return `Reply to reviewed email thread ${action.threadId}.`;
    case "email.forward":return `Forward reviewed email thread ${action.threadId} to ${action.to.length} recipient${action.to.length===1?"":"s"}.`;
    case "crm.create_lead":return `Create the mapped CRM lead ${action.internalEntityId}.`;
    case "crm.update_stage":return `Update CRM lead ${action.externalLeadId} to ${action.stage}.`;
    case "crm.add_note":return `Append a note to CRM lead ${action.externalLeadId}.`;
    case "crm.create_follow_up":return `Create a mapped CRM follow-up for lead ${action.externalLeadId}.`;
    case "support.reply":return `Send a reviewed reply to support ticket ${action.ticketId}.`;
    case "projects.create_task":return `Create mapped project task ${action.internalTaskId}.`;
    case "documents.create":return `Create mapped document ${action.internalEntityId}.`;
    case "analytics.read_metric":return `Read registered metric ${action.metricId} for the requested window.`;
    case "github.create_issue":return `Create a reviewed issue in ${action.repository}.`;
    default:{
      if("externalResourceId" in action){const impact=action.currency&&action.amountMinor!==null?` for ${action.amountMinor} ${action.currency} minor units`:"";return `Execute bounded ${action.capability}${action.externalResourceId?` on ${action.externalResourceId}`:""}${impact}.`;}
      return `Execute bounded ${action.capability}.`;
    }
  }
};

export interface BusinessOutcomeSinks {
  objectiveMetric?(input:{ownerId:string;objectiveId:string;kpiId:string;value:number}):Promise<void>;
  experimentMetric?(input:{ownerId:string;experimentId:string;variantId:string;subjectId:string;metricId:string;value:number;evidenceRef:string}):Promise<void>;
  verifiedReward?(input:{ownerId:string;agentId:string;taskId:string;evidenceRef:string}):Promise<void>;
  commercialEvent?(input:{ownerId:string;companyId:string;eventType:string;canonicalEventId:string;entityRef:string|null;objectiveId:string|null;amountMinor:number|null;currency:string|null;occurredAt:string;sourceVersion:string|null}):Promise<void>;
}
export type AgentBusinessAuthorityVerifier=(input:{ownerId:string;agentId:string;organizationId:string|null;capability:BusinessCapability})=>Promise<boolean>;

export class BusinessOperationsRuntime {
  readonly #providers=new Map<BusinessProvider,ReviewedBusinessProvider>();
  readonly #recentRequests=new Map<string,number[]>();
  readonly #inFlight=new Map<string,number>();
  readonly #failures=new Map<string,number>();
  readonly #resourceMutations=new Set<string>();
  #sinks:BusinessOutcomeSinks={};
  #agentAuthority?:AgentBusinessAuthorityVerifier;
  constructor(readonly store:IntegrationStore,readonly approvals:ApprovalService,readonly audit:GovernanceAuditWriter,readonly now:()=>Date=()=>new Date(),readonly companyData?:Pick<CompanyDataStore,"listIntegrationBindings"|"findCredentialReference">,readonly secrets?:ReviewedSecretResolver){
    for(const id of ["gmail","crm","support","documents","projects","analytics","github","accounting","payments","ads","commerce"] as const)this.#providers.set(id,new UnavailableBusinessProvider(id));
  }
  setProvider(provider:ReviewedBusinessProvider){this.#providers.set(provider.providerId,provider);}
  setOutcomeSinks(sinks:BusinessOutcomeSinks){this.#sinks=sinks;}
  setAgentAuthorityVerifier(verifier:AgentBusinessAuthorityVerifier){this.#agentAuthority=verifier;}

  async dashboard(ownerId:string){
    const [executions,events,metrics,attributions,mappings,checkpoints,commercialFacts]=await Promise.all([this.store.listBusinessExecutions(ownerId,500),this.store.listExternalEvents(ownerId,500),this.store.listExternalMetrics(ownerId,500),this.store.listAttributions(ownerId,500),this.store.listEntityMappings(ownerId),this.store.listSyncCheckpoints(ownerId),this.store.listCommercialFacts(ownerId,500)]);
    const money=new Map<string,{amount:bigint;count:number}>();for(const fact of commercialFacts){if(fact.sourceRole!=="BOOK_REVENUE"||fact.amountMinor===null||!fact.currency)continue;const current=money.get(fact.currency)??{amount:0n,count:0};current.amount+=BigInt(fact.amountMinor);current.count+=1;money.set(fact.currency,current);}const bookRevenueByCurrency=[...money.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([currency,value])=>{const amountMinor=Number(value.amount);if(!Number.isSafeInteger(amountMinor))throw new ExecutionError(409,"MONETARY_TOTAL_OVERFLOW","The recognized-revenue summary exceeds safe minor-unit bounds.");return {currency,amountMinor,sourceCount:value.count};});
    return BusinessOperationsDashboardSchema.parse({executions,events,metrics,attributions,mappings,checkpoints,commercialFacts,summary:{verifiedActions:executions.filter((item)=>item.status==="VERIFIED").length,waitingApproval:executions.filter((item)=>item.status==="WAITING_APPROVAL").length,uncertainActions:executions.filter((item)=>item.status==="EXTERNAL_RESULT_UNCERTAIN").length,verifiedOutcomes:attributions.filter((item)=>item.confidence!=="LOW").length,bookRevenueByCurrency}});
  }

  async request(input:{ownerId:string;body:unknown;requestId:string;ipAddress:string}){
    const action=BusinessActionRequestSchema.parse(input.body);const providerId=PROVIDER_BY_CAPABILITY[action.capability];const integrationId=providerId;
    if(action.references.agentId&&(!this.#agentAuthority||!await this.#agentAuthority({ownerId:input.ownerId,agentId:action.references.agentId,organizationId:action.references.organizationId,capability:action.capability})))throw new ExecutionError(403,"AGENT_CAPABILITY_DENIED","The receiving agent is not independently eligible for this external capability.");
    const actionDigest=digest(action);const existing=await this.store.findBusinessExecution(input.ownerId,integrationId,action.idempotencyKey);
    if(existing&&existing.actionDigest!==actionDigest)throw new ExecutionError(409,"IDEMPOTENCY_KEY_CONFLICT","The idempotency key is already bound to a different reviewed action.");
    if(existing&&existing.status==="EXECUTING"&&this.now().getTime()-Date.parse(existing.updatedAt)>300_000){const uncertain=BusinessExecutionRecordSchema.parse({...existing,status:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:existing.externalReferenceId??`${providerId}:reconcile:${action.capability}:${action.idempotencyKey}`,resultSummary:"The prior worker lease expired during dispatch; provider reconciliation is required before retry.",verification:"UNCERTAIN",updatedAt:this.now().toISOString()});await this.store.saveBusinessExecution(uncertain);return uncertain;}
    if(existing&&existing.status!=="WAITING_APPROVAL")return existing;
    const integration=await this.store.findIntegration(input.ownerId,integrationId);if(!integration||integration.status==="disabled")throw new ExecutionError(403,"BUSINESS_INTEGRATION_DISABLED","The requested business integration is not enabled for this owner.");
    const capabilityId=INTEGRATION_CAPABILITY[action.capability];const binding=await this.resolveCredentialBinding(input.ownerId,integrationId,providerId,action.capability,capabilityId);this.enforceCommercialPolicy(action,binding.metadata);const permission=await this.store.findPermission(input.ownerId,integrationId,capabilityId);
    if(!permission||permission.state!=="granted")throw new ExecutionError(403,"CAPABILITY_DENIED","The finite integration capability is not granted.");
    const provider=this.#providers.get(providerId)!;if(!provider.capabilities.has(action.capability))throw new ExecutionError(409,"PROVIDER_CAPABILITY_UNAVAILABLE","The reviewed provider does not expose this capability.");
    const providerContext={companyId:binding.companyId,credentialBindingId:binding.id,credential:binding.credential};
    const health=await provider.health(providerContext);await this.store.saveHealth(input.ownerId,{integrationId,state:health.state==="HEALTHY"?"healthy":health.state==="DEGRADED"?"degraded":"unhealthy",checkedAt:this.now().toISOString(),latencyMs:null,reasonCode:health.reasonCode,credentialStatus:health.state==="REAUTH_REQUIRED"?"expired":"configured",rateLimitRemaining:health.rateLimitRemaining});
    if(health.state==="REAUTH_REQUIRED")throw new ExecutionError(409,"PROVIDER_AUTH_FAILED","The provider requires owner reauthentication.");
    const providerScopeKey=`${input.ownerId}:${binding.companyId??"owner-default"}:${providerId}`;if(health.state==="UNAVAILABLE"||this.#failures.get(providerScopeKey)!>=3)throw new ExecutionError(503,"PROVIDER_UNAVAILABLE","The reviewed provider is unavailable or its circuit is open.");
    const id=existing?.id??crypto.randomUUID();const at=this.now().toISOString();const proposed=this.approvalAction(id,providerId,action);
    if(APPROVALS.has(action.capability)){
      const approved=await this.approvals.findMatchingApproved(input.ownerId,proposed);
      if(!approved){const highRisk=HIGH_RISK.has(action.capability),stepUp=STEP_UP_REQUIRED.has(action.capability)||("cooldownOverride" in action&&action.cooldownOverride);const approval=await this.approvals.create({ownerId:input.ownerId,action:proposed,riskLevel:highRisk||stepUp?"high":"medium",approvalRequirement:stepUp?"recent_authentication":"explicit",ipAddress:input.ipAddress,requestId:input.requestId});const waiting=BusinessExecutionRecordSchema.parse({id,ownerId:input.ownerId,companyId:binding.companyId,credentialBindingId:binding.id,provider:providerId,integrationId,capability:action.capability,idempotencyKey:action.idempotencyKey,actionDigest,status:"WAITING_APPROVAL",approvalId:approval.id,externalReferenceId:null,actionSummary:summary(action),resultSummary:`The bounded external action is waiting for ${stepUp?"recent-authenticated ":""}exact-action approval.`,references:action.references,verification:"PENDING",attemptCount:0,requestedAt:existing?.requestedAt??at,updatedAt:at,commercialControl:null});await this.store.saveBusinessExecution(waiting);return waiting;}
    }
    this.guardRateAndConcurrency(input.ownerId,integrationId,permission.rateLimitPerMinute);
    const commercialControl=await this.beginCommercialControl(input.ownerId,providerId,action,binding.metadata,id);const executionContext={...providerContext,...(commercialControl?{mutationFence:commercialControl.lease.fence}:{})};
    const executing=BusinessExecutionRecordSchema.parse({id,ownerId:input.ownerId,companyId:binding.companyId,credentialBindingId:binding.id,provider:providerId,integrationId,capability:action.capability,idempotencyKey:action.idempotencyKey,actionDigest,status:"EXECUTING",approvalId:existing?.approvalId??null,externalReferenceId:existing?.externalReferenceId??null,actionSummary:summary(action),resultSummary:"Execution dispatched through the reviewed provider.",references:action.references,verification:SIDE_EFFECTS.has(action.capability)?"PENDING":"NOT_REQUIRED",attemptCount:(existing?.attemptCount??0)+1,requestedAt:existing?.requestedAt??at,updatedAt:at,commercialControl:commercialControl?{resourceType:commercialControl.resourceType,resourceId:commercialControl.resourceId,leaseFence:commercialControl.lease.fence,reservationId:commercialControl.reservation?.id??null,actionClass:commercialControl.reservation?.actionClass??null,amountMinor:commercialControl.reservation?.amountMinor??null,currency:commercialControl.reservation?.currency??null}:null});await this.store.saveBusinessExecution(executing);
    const key=providerScopeKey;const resourceId="externalResourceId" in action?action.externalResourceId:null;const mutationKey=!commercialControl&&SIDE_EFFECTS.has(action.capability)?`${key}:${resourceId??action.idempotencyKey}`:null;if(mutationKey&&this.#resourceMutations.has(mutationKey))throw new ExecutionError(409,"EXTERNAL_RESOURCE_CONFLICT","Another reviewed mutation is already in flight for this external resource.");if(mutationKey)this.#resourceMutations.add(mutationKey);this.#inFlight.set(key,(this.#inFlight.get(key)??0)+1);
    try{
      let result:BusinessProviderResult;
      try{result=await provider.execute(action,executionContext);}
      catch(error){
        if(!commercialControl)throw error;
        result={outcome:"EXTERNAL_RESULT_UNCERTAIN" as const,externalReferenceId:`${providerId}:reconcile:${action.idempotencyKey}`,summary:"The provider response was interrupted after dispatch; reconciliation is required before any retry."};
      }
      let attempts=1;
      while(result.outcome==="FAILED"&&result.retryable&&result.failureKind!=="RATE_LIMIT"&&provider.supportsIdempotentWrites&&attempts<3&&!commercialControl){attempts+=1;result=await provider.execute(action,executionContext);}
      if(commercialControl&&result.outcome==="FAILED"&&result.retryable)result={outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:result.externalReferenceId??`${providerId}:reconcile:${action.idempotencyKey}`,summary:"The provider returned an indeterminate retryable failure after dispatch; reconciliation is required before any retry."};
      if(commercialControl&&result.outcome==="VERIFIED"&&!await this.store.validateCommercialMutationLease({ownerId:input.ownerId,companyId:commercialControl.companyId,provider:providerId,resourceType:commercialControl.resourceType,resourceId:commercialControl.resourceId,token:commercialControl.lease.token,fence:commercialControl.lease.fence,now:this.now().toISOString()}))result={outcome:"EXTERNAL_RESULT_UNCERTAIN",externalReferenceId:result.externalReferenceId??`${providerId}:reconcile:${action.idempotencyKey}`,summary:"The mutation lease expired or was fenced before completion; reconciliation is required and the stale worker cannot commit canonical state."};
      const status=result.outcome;const finished=BusinessExecutionRecordSchema.parse({...executing,attemptCount:(existing?.attemptCount??0)+attempts,status,externalReferenceId:result.externalReferenceId,resultSummary:result.summary,verification:result.outcome==="VERIFIED"?"VERIFIED":result.outcome==="EXTERNAL_RESULT_UNCERTAIN"?"UNCERTAIN":"FAILED",updatedAt:this.now().toISOString()});await this.store.saveBusinessExecution(finished);
      if(result.outcome==="FAILED")this.#failures.set(key,(this.#failures.get(key)??0)+1);else this.#failures.set(key,0);
      if(commercialControl){if(result.outcome==="VERIFIED"){if(commercialControl.reservation)await this.store.settleCommercialAggregate(commercialControl.reservation.id,"COMMITTED");await this.store.recordCommercialMutation({ownerId:input.ownerId,companyId:commercialControl.companyId,provider:providerId,resourceType:commercialControl.resourceType,resourceId:commercialControl.resourceId,capability:action.capability,idempotencyKey:action.idempotencyKey,succeededAt:finished.updatedAt,fence:commercialControl.lease.fence});}else if(result.outcome==="FAILED"&&commercialControl.reservation)await this.store.settleCommercialAggregate(commercialControl.reservation.id,"RELEASED");}
      if(result.mapping)await this.store.saveEntityMapping(BusinessEntityMappingSchema.parse({id:crypto.randomUUID(),ownerId:input.ownerId,companyId:binding.companyId,integrationId,entityType:result.mapping.entityType,externalId:result.mapping.externalId,internalEntityId:result.mapping.internalEntityId,externalVersion:result.mapping.externalVersion,lastSyncedAt:finished.updatedAt,conflictPolicy:"REVIEW_REQUIRED"}));
      if(result.metric){const metricProvenance="periodStart" in action?{queryPeriodStart:action.periodStart,queryPeriodEnd:action.periodEnd,providerTimezone:action.timezone}:action.capability==="analytics.read_metric"?{queryPeriodStart:action.windowStart,queryPeriodEnd:action.windowEnd,providerTimezone:"UTC"}:undefined;await this.recordMetric(input.ownerId,providerId,action.references,result.metric,result.externalReferenceId,metricProvenance);}
      const commercialAudit="externalResourceId" in action?{externalTarget:action.externalResourceId,amountMinor:action.amountMinor,currency:action.currency,previousAmountMinor:action.currentAmountMinor,proposedAmountMinor:action.proposedAmountMinor,expectedVersion:action.expectedVersion}:{};
      await this.audit({eventType:result.outcome==="VERIFIED"?"INTEGRATION_OPERATION_COMPLETED":"INTEGRATION_OPERATION_FAILED",ownerId:input.ownerId,outcome:result.outcome==="VERIFIED"?"SUCCESS":"FAILURE",reason:result.summary,requestId:input.requestId,ipAddress:input.ipAddress,metadata:{executionId:id,companyId:binding.companyId,credentialBindingId:binding.id,integrationId,provider:providerId,capability:action.capability,idempotencyKey:action.idempotencyKey,agentId:action.references.agentId,approvalId:finished.approvalId,externalReferenceId:result.externalReferenceId,externalOutcome:result.outcome,leaseFence:commercialControl?.lease.fence??null,objectiveId:action.references.objectiveId,...commercialAudit}});
      return finished;
    } finally {if(commercialControl)await this.store.releaseCommercialMutationLease({ownerId:input.ownerId,companyId:commercialControl.companyId,provider:providerId,resourceType:commercialControl.resourceType,resourceId:commercialControl.resourceId,token:commercialControl.lease.token,fence:commercialControl.lease.fence});if(mutationKey)this.#resourceMutations.delete(mutationKey);this.#inFlight.set(key,Math.max(0,(this.#inFlight.get(key)??1)-1));}
  }

  private async resolveCredentialBinding(ownerId:string,integrationId:string,providerId:BusinessProvider,capability:BusinessCapability,capabilityId:string){
    const companyId=companyScope.companyId(ownerId)??null;
    if(!this.companyData)return {id:null,companyId,credential:null,metadata:{}};
    if(!companyId)throw new ExecutionError(403,"COMPANY_CONTEXT_REQUIRED","Business integration execution requires an authenticated company context.");
    const binding=(await this.companyData.listIntegrationBindings(ownerId,companyId)).find((item)=>item.integrationId===integrationId&&item.status==="READY");
    if(!binding||(!binding.capabilitiesExposed.includes(capability)&&!binding.capabilitiesExposed.includes(capabilityId)))throw new ExecutionError(403,"INTEGRATION_BINDING_DENIED","No ready company integration binding exposes this capability.");
    const credential=await this.companyData.findCredentialReference(ownerId,companyId,binding.credentialRef);
    if(!credential||credential.provider!==binding.provider||credential.status!=="READY")throw new ExecutionError(403,credential?.status==="EXPIRED"?"PROVIDER_AUTH_FAILED":"CREDENTIAL_BINDING_DENIED","The company/provider credential binding is missing, revoked, expired, or out of scope.");
    if(!this.#providers.get(providerId)?.requiresCredential)return {id:binding.id,companyId,credential:null,metadata:binding.metadata};
    if(!this.secrets)throw new ExecutionError(503,"CREDENTIAL_RESOLVER_UNAVAILABLE","The reviewed provider secret resolver is not configured.");
    const resolved=await this.secrets.resolve({provider:providerId,secretLocator:credential.secretLocator});
    return {id:binding.id,companyId,credential:resolved,metadata:binding.metadata};
  }

  private enforceCommercialPolicy(action:BusinessActionRequest,metadata:Record<string,unknown>){
    if(!("externalResourceId" in action))return;
    try{new Intl.DateTimeFormat("en",{timeZone:action.timezone}).format(this.now());}catch{throw new ExecutionError(400,"INVALID_TIMEZONE","The commercial action timezone is invalid.");}
    const bounded=(key:string)=>{const value=metadata[key];return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;};
    if(action.capability==="payments.execute_charge"||action.capability==="payments.execute_refund"){
      const cap=bounded("maxPaymentActionMinor");if(cap===null||action.amountMinor===null||action.amountMinor>cap)throw new ExecutionError(403,"FINANCIAL_POLICY_DENIED","The company payment-action cap is missing or exceeded.");
      if(typeof metadata.paymentCurrency==="string"&&action.currency!==metadata.paymentCurrency)throw new ExecutionError(403,"FINANCIAL_POLICY_DENIED","The requested currency is outside company payment policy.");
    }
    if(action.capability==="ads.adjust_budget"){
      const cap=bounded("maxAdBudgetMinor"),percentageCap=typeof metadata.maxAdBudgetIncreasePercent==="number"?metadata.maxAdBudgetIncreasePercent:null;
      const increase=action.proposedAmountMinor!-action.currentAmountMinor!;const percentage=action.currentAmountMinor===0?Infinity:(increase/action.currentAmountMinor!)*100;
      if(cap===null||action.proposedAmountMinor!>cap||increase>0&&(percentageCap===null||percentage>percentageCap))throw new ExecutionError(403,"AD_SPEND_POLICY_DENIED","The proposed ad budget exceeds the company absolute or percentage cap.");
    }
    if(action.capability==="commerce.create_draft_discount"){
      const cap=typeof metadata.maxDiscountPercentage==="number"?metadata.maxDiscountPercentage:null;if(cap===null||action.percentage===null||action.percentage>cap)throw new ExecutionError(403,"PRICING_POLICY_DENIED","The proposed discount exceeds or lacks company pricing policy.");
    }
    if(action.capability==="commerce.update_inventory"){
      const cap=bounded("maxInventoryDelta");if(cap===null||action.quantityDelta===null||Math.abs(action.quantityDelta)>cap)throw new ExecutionError(403,"INVENTORY_POLICY_DENIED","The inventory delta exceeds or lacks company policy.");
    }
  }

  private async beginCommercialControl(ownerId:string,provider:BusinessProvider,action:BusinessActionRequest,metadata:Record<string,unknown>,reservationId:string){
    if(!("externalResourceId" in action)||!SIDE_EFFECTS.has(action.capability)||!action.externalResourceId)return null;
    const companyId=companyScope.companyId(ownerId);if(!companyId)throw new ExecutionError(403,"COMPANY_CONTEXT_REQUIRED","Commercial mutation controls require company scope.");
    const now=this.now(),at=now.toISOString(),leaseSeconds=this.boundedPolicy(metadata,"mutationLeaseSeconds")??30,token=crypto.randomUUID(),resourceType=action.capability.split(".")[1]!.replace(/^(create_|update_|execute_|prepare_|adjust_|cancel_|pause_|resume_)/,"");
    const lease=await this.store.acquireCommercialMutationLease({ownerId,companyId,provider,resourceType,resourceId:action.externalResourceId,token,now:at,expiresAt:new Date(now.getTime()+Math.min(300,Math.max(5,leaseSeconds))*1000).toISOString()});
    if(!lease)throw new ExecutionError(409,"EXTERNAL_RESOURCE_LEASE_HELD","Another instance holds the bounded mutation lease for this external resource.");
    try{
      const cooldownSeconds=this.cooldownSeconds(action,metadata),last=await this.store.findLastCommercialMutation({ownerId,companyId,provider,resourceType,resourceId:action.externalResourceId,capability:action.capability});
      if(last&&cooldownSeconds>0&&now.getTime()-Date.parse(last.succeededAt)<cooldownSeconds*1000&&!action.cooldownOverride)throw new ExecutionError(409,"COMMERCIAL_COOLDOWN_ACTIVE","The configured external-resource cooldown has not elapsed.");
      const aggregate=this.aggregatePolicy(action,metadata);
      let reservation:CommercialAggregateReservation|undefined;
      if(aggregate){const dayKey=this.localDay(now,action.timezone);reservation={id:reservationId,ownerId,companyId,provider,actionClass:aggregate.actionClass,currency:aggregate.currency,dayKey,amountMinor:aggregate.amountMinor,idempotencyKey:action.idempotencyKey,status:"RESERVED",createdAt:at,updatedAt:at};const result=await this.store.reserveCommercialAggregate({reservation,limitMinor:aggregate.limitMinor});if(!result.accepted)throw new ExecutionError(403,"COMMERCIAL_DAILY_LIMIT_EXCEEDED","The atomic per-currency daily commercial limit would be exceeded.");}
      return {companyId,resourceType,resourceId:action.externalResourceId,lease,reservation};
    }catch(error){await this.store.releaseCommercialMutationLease({ownerId,companyId,provider,resourceType,resourceId:action.externalResourceId,token:lease.token,fence:lease.fence});throw error;}
  }

  private boundedPolicy(metadata:Record<string,unknown>,key:string){const value=metadata[key];return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;}
  private cooldownSeconds(action:Extract<BusinessActionRequest,{externalResourceId:unknown}>,metadata:Record<string,unknown>){const scoped=metadata.cooldownSecondsByCapability;if(scoped&&typeof scoped==="object"&&!Array.isArray(scoped)){const value=(scoped as Record<string,unknown>)[action.capability];if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=86_400)return value;}return 0;}
  private aggregatePolicy(action:Extract<BusinessActionRequest,{externalResourceId:unknown}>,metadata:Record<string,unknown>):{actionClass:CommercialActionClass;amountMinor:number;currency:string;limitMinor:number}|null{
    let actionClass:CommercialActionClass|null=null,amountMinor:number|null=null,limitKey="";
    if(action.capability==="payments.execute_charge"){actionClass="PAYMENT_EXECUTION";amountMinor=action.amountMinor;limitKey="dailyPaymentExecutionMinor";}
    else if(action.capability==="payments.execute_refund"){actionClass="REFUND";amountMinor=action.amountMinor;limitKey="dailyRefundMinor";}
    else if(action.capability==="ads.adjust_budget"&&action.proposedAmountMinor!>action.currentAmountMinor!){actionClass="AD_SPEND_INCREASE";amountMinor=action.proposedAmountMinor!-action.currentAmountMinor!;limitKey="dailyAdSpendIncreaseMinor";}
    else if(action.capability==="commerce.create_draft_discount"){actionClass="DISCOUNT_IMPACT";amountMinor=action.amountMinor;limitKey="dailyDiscountImpactMinor";}
    else if(action.capability==="commerce.update_inventory"){actionClass="INVENTORY_VALUE_ADJUSTMENT";amountMinor=action.amountMinor;limitKey="dailyInventoryValueAdjustmentMinor";}
    if(!actionClass)return null;const limitMinor=this.boundedPolicy(metadata,limitKey);if(amountMinor===null||!action.currency||limitMinor===null)throw new ExecutionError(403,"COMMERCIAL_AGGREGATE_POLICY_MISSING","A per-currency daily aggregate ceiling is required for this mutation.");
    const policyCurrency=metadata[`${limitKey}Currency`];if(typeof policyCurrency==="string"&&policyCurrency!==action.currency)throw new ExecutionError(403,"COMMERCIAL_AGGREGATE_CURRENCY_DENIED","The action currency is outside its daily aggregate policy.");return {actionClass,amountMinor,currency:action.currency,limitMinor};
  }
  private localDay(value:Date,timezone:string){const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value),part=(type:string)=>parts.find((item)=>item.type===type)?.value;if(!part("year")||!part("month")||!part("day"))throw new ExecutionError(400,"INVALID_TIMEZONE","The company reporting timezone is invalid.");return `${part("year")}-${part("month")}-${part("day")}`;}

  async reconcile(input:{ownerId:string;executionId:string;requestId:string;ipAddress:string}){
    const record=(await this.store.listBusinessExecutions(input.ownerId,500)).find((item)=>item.id===input.executionId);if(!record)throw new ExecutionError(404,"BUSINESS_EXECUTION_NOT_FOUND","The external execution was not found.");
    if(record.status!=="EXTERNAL_RESULT_UNCERTAIN"||!record.externalReferenceId)throw new ExecutionError(409,"RECONCILIATION_NOT_REQUIRED","Only uncertain external effects require reconciliation.");
    const binding=await this.resolveCredentialBinding(input.ownerId,record.integrationId,record.provider,record.capability,INTEGRATION_CAPABILITY[record.capability]);
    const result=await this.#providers.get(record.provider)!.reconcile(record.externalReferenceId,{companyId:binding.companyId,credentialBindingId:binding.id,credential:binding.credential,...(record.commercialControl?{mutationFence:record.commercialControl.leaseFence}:{})});const updated=BusinessExecutionRecordSchema.parse({...record,status:result.outcome==="VERIFIED"?"VERIFIED":"REVIEW_REQUIRED",verification:result.outcome==="VERIFIED"?"VERIFIED":"FAILED",resultSummary:result.summary,updatedAt:this.now().toISOString()});await this.store.saveBusinessExecution(updated);if(result.outcome==="VERIFIED"&&record.commercialControl&&record.companyId){if(record.commercialControl.reservationId)await this.store.settleCommercialAggregate(record.commercialControl.reservationId,"COMMITTED");await this.store.recordCommercialMutation({ownerId:input.ownerId,companyId:record.companyId,provider:record.provider,resourceType:record.commercialControl.resourceType,resourceId:record.commercialControl.resourceId,capability:record.capability,idempotencyKey:record.idempotencyKey,succeededAt:updated.updatedAt,fence:record.commercialControl.leaseFence});}await this.audit({eventType:result.outcome==="VERIFIED"?"INTEGRATION_OPERATION_COMPLETED":"INTEGRATION_OPERATION_FAILED",ownerId:input.ownerId,outcome:result.outcome==="VERIFIED"?"SUCCESS":"FAILURE",reason:result.summary,requestId:input.requestId,ipAddress:input.ipAddress,metadata:{executionId:record.id,companyId:record.companyId,credentialBindingId:binding.id,provider:record.provider,capability:record.capability,idempotencyKey:record.idempotencyKey,externalReferenceId:result.externalReferenceId,reconciliation:true,leaseFence:record.commercialControl?.leaseFence??null}});return updated;
  }

  async ingestWebhook(input:{ownerId:string;body:unknown;signature:string;timestamp:string;secret:string;requestId:string;ipAddress:string}){
    const event=BusinessExternalEventInputSchema.parse(input.body);const timestamp=Number(input.timestamp);if(!Number.isFinite(timestamp)||Math.abs(this.now().getTime()-timestamp)>300_000)throw new ExecutionError(401,"WEBHOOK_TIMESTAMP_INVALID","The webhook timestamp is outside the accepted replay window.");
    const expected=createHmac("sha256",input.secret).update(`${input.timestamp}.${input.ownerId}.${JSON.stringify(event)}`).digest("hex");const supplied=Buffer.from(input.signature,"hex");const expectedBuffer=Buffer.from(expected,"hex");if(supplied.length!==expectedBuffer.length||!timingSafeEqual(supplied,expectedBuffer))throw new ExecutionError(401,"WEBHOOK_SIGNATURE_INVALID","The external event signature is invalid.");
    const integration=await this.store.findIntegration(input.ownerId,event.integrationId);if(!integration||integration.status==="disabled")throw new ExecutionError(403,"BUSINESS_INTEGRATION_DISABLED","The event integration is not enabled for this owner.");
    const representative:BusinessCapability=event.type.startsWith("EMAIL_")?"email.read_thread":event.type.startsWith("CRM_")||event.type==="LEAD_CREATED"?"crm.read_lead":event.type.startsWith("SUPPORT_")?"support.read_ticket":event.type.startsWith("DOCUMENT_")?"documents.read":event.type.startsWith("PROJECT_")?"projects.read_task":event.type.startsWith("PAYMENT_")||event.type.startsWith("REFUND_")||event.type==="SUBSCRIPTION_CANCELLED"?"payments.read":event.type.startsWith("ORDER_")||event.type==="INVENTORY_LOW"?"commerce.read_order":event.type.startsWith("INVOICE_")?"accounting.read_invoice":event.type.startsWith("CAMPAIGN_")?"ads.read_performance":event.type.startsWith("ANALYTICS_")||event.type==="CONVERSION_RECORDED"?"analytics.read_metric":"github.read_issue";
    const provider=PROVIDER_BY_CAPABILITY[representative];if(event.integrationId!==provider)throw new ExecutionError(400,"WEBHOOK_PROVIDER_MISMATCH","The event type does not match the bound provider.");const binding=await this.resolveCredentialBinding(input.ownerId,event.integrationId,provider,representative,INTEGRATION_CAPABILITY[representative]);if(event.companyId!==null&&event.companyId!==binding.companyId)throw new ExecutionError(403,"WEBHOOK_COMPANY_MISMATCH","The event company does not match the authenticated integration binding.");
    const allowedRole:Partial<Record<BusinessProvider,string>>={commerce:"ORDER",payments:"PAYMENT_STATUS",accounting:"BOOK_REVENUE",analytics:"MARKETING_ATTRIBUTION"};if(event.sourceRole&&allowedRole[provider]!==event.sourceRole)throw new ExecutionError(400,"COMMERCIAL_SOURCE_ROLE_INVALID","The provider is not authoritative for the declared commercial source role.");
    const receivedAt=this.now().toISOString();let record=BusinessExternalEventSchema.parse({...event,id:crypto.randomUUID(),ownerId:input.ownerId,provider,signatureVerified:true,receivedAt,processedAt:null,processingStatus:"RECEIVED"});
    if(!await this.store.saveExternalEvent(record))return {duplicate:true,event:null};
    try{await this.processEvent(record);record=BusinessExternalEventSchema.parse({...record,processedAt:this.now().toISOString(),processingStatus:"PROCESSED"});await this.store.updateExternalEvent(record);await this.audit({eventType:"INTEGRATION_OPERATION_COMPLETED",ownerId:input.ownerId,outcome:"SUCCESS",reason:"Authenticated external business event processed once.",requestId:input.requestId,ipAddress:input.ipAddress,metadata:{integrationId:event.integrationId,eventType:event.type,externalEventId:event.externalEventId}});return {duplicate:false,event:record};}
    catch(error){record=BusinessExternalEventSchema.parse({...record,processedAt:this.now().toISOString(),processingStatus:"FAILED"});await this.store.updateExternalEvent(record);throw error;}
  }

  async checkpoint(ownerId:string,integrationId:string,stream:string,cursor:string,sourceTimestamp:string|null){const value=IntegrationSyncCheckpointSchema.parse({ownerId,integrationId,stream,cursor,sourceTimestamp,updatedAt:this.now().toISOString()});await this.store.saveSyncCheckpoint(value);return value;}

  private approvalAction(actionId:string,provider:BusinessProvider,action:BusinessActionRequest){const authority=capabilityAuthority(action.capability);const commercial="externalResourceId" in action?{target:action.externalResourceId,financialImpact:action.currency?{currency:action.currency,amountMinor:action.amountMinor,currentAmountMinor:action.currentAmountMinor,proposedAmountMinor:action.proposedAmountMinor}:null,expectedVersion:action.expectedVersion}:{};return ProposedActionSchema.parse({actionId,toolName:"business.execute_reviewed_capability",arguments:{provider,capability:action.capability,actionSummary:summary(action),payloadDigest:digest(action),references:action.references,...commercial},...(authority?{requestedCapabilities:[authority]}:{})});}
  private guardRateAndConcurrency(ownerId:string,integrationId:string,limit:number){const key=`${ownerId}:${companyScope.companyId(ownerId)??"owner-default"}:${integrationId}`;if((this.#inFlight.get(key)??0)>=3)throw new ExecutionError(429,"PROVIDER_CONCURRENCY_LIMIT","The provider concurrency limit is reached.");const cutoff=this.now().getTime()-60_000;const recent=(this.#recentRequests.get(key)??[]).filter((value)=>value>=cutoff);if(recent.length>=Math.min(limit,60))throw new ExecutionError(429,"PROVIDER_RATE_LIMITED","The bounded provider rate limit is reached.");recent.push(this.now().getTime());this.#recentRequests.set(key,recent);}
  private async recordMetric(ownerId:string,provider:BusinessProvider,references:BusinessActionRequest["references"],metric:{metricId:string;value:number;unit:string;observedAt:string},externalReferenceId:string|null,provenance?:{queryPeriodStart:string|null;queryPeriodEnd:string|null;providerTimezone:string}){const fetchedAt=this.now().toISOString();const observation=ExternalMetricObservationSchema.parse({id:crypto.randomUUID(),ownerId,companyId:companyScope.companyId(ownerId)??null,objectiveId:references.objectiveId,experimentId:references.experimentId,variantId:references.variantId,metricId:metric.metricId,sourceProvider:provider,externalMetricId:externalReferenceId,value:metric.value,unit:metric.unit,observedAt:metric.observedAt,fetchedAt,queryPeriodStart:provenance?.queryPeriodStart??null,queryPeriodEnd:provenance?.queryPeriodEnd??null,providerTimezone:provenance?.providerTimezone??"UTC",definitionRef:`${provider}:${metric.metricId}`,sourceHealth:"HEALTHY",evidenceRef:externalReferenceId});await this.store.saveExternalMetric(observation);if(references.objectiveId)await this.#sinks.objectiveMetric?.({ownerId,objectiveId:references.objectiveId,kpiId:metric.metricId,value:metric.value});}
  private async processEvent(event:ReturnType<typeof BusinessExternalEventSchema.parse>){
    const matching=(await this.store.listBusinessExecutions(event.ownerId,500)).find((item)=>item.externalReferenceId===event.entityRef);const refs=matching?.references??{organizationId:null,objectiveId:event.objectiveId,projectId:null,workflowRunId:null,taskId:null,experimentId:event.experimentId,variantId:event.variantId,agentId:null};
    let acceptedCommercialFact=true;
    if(event.canonicalEventId&&event.sourceRole){if(!event.companyId)throw new ExecutionError(403,"COMPANY_CONTEXT_REQUIRED","Commercial facts require an explicit company scope.");acceptedCommercialFact=await this.store.saveCommercialFact(CommercialFactSchema.parse({id:crypto.randomUUID(),ownerId:event.ownerId,companyId:event.companyId,canonicalEventId:event.canonicalEventId,provider:event.provider,sourceRole:event.sourceRole,factType:event.factType,eventType:event.type,externalEventId:event.externalEventId,entityRef:event.entityRef,amountMinor:event.amountMinor,currency:event.currency,occurredAt:event.occurredAt,providerTimezone:event.providerTimezone,createdAt:this.now().toISOString()}));}
    if(acceptedCommercialFact&&event.entityType&&event.internalEntityId&&event.entityRef)await this.store.saveEntityMapping(BusinessEntityMappingSchema.parse({id:crypto.randomUUID(),ownerId:event.ownerId,companyId:event.companyId,integrationId:event.integrationId,entityType:event.entityType,externalId:event.entityRef,internalEntityId:event.internalEntityId,externalVersion:event.sourceVersion,lastSyncedAt:this.now().toISOString(),conflictPolicy:"REVIEW_REQUIRED"}));
    const revenueMetric=event.metricId!==null&&["revenue","recognized_revenue","book_revenue"].includes(event.metricId.toLowerCase());const metricAllowed=!revenueMetric||event.sourceRole==="BOOK_REVENUE";
    if(acceptedCommercialFact&&metricAllowed&&event.metricId&&event.metricValue!==null&&event.metricUnit){await this.recordMetric(event.ownerId,event.provider,{...refs,objectiveId:event.objectiveId??refs.objectiveId,experimentId:event.experimentId??refs.experimentId,variantId:event.variantId??refs.variantId},{metricId:event.metricId,value:event.metricValue,unit:event.metricUnit,observedAt:event.occurredAt},event.externalEventId,{queryPeriodStart:null,queryPeriodEnd:null,providerTimezone:event.providerTimezone});}
    const objectiveId=event.objectiveId??refs.objectiveId,experimentId=event.experimentId??refs.experimentId,variantId=event.variantId??refs.variantId;
    if(acceptedCommercialFact&&event.companyId&&event.canonicalEventId&&["PAYMENT_FAILED","REFUND_REQUESTED","ORDER_CREATED","INVOICE_OVERDUE","INVENTORY_LOW","CAMPAIGN_THRESHOLD_BREACHED"].includes(event.type))await this.#sinks.commercialEvent?.({ownerId:event.ownerId,companyId:event.companyId,eventType:event.type,canonicalEventId:event.canonicalEventId,entityRef:event.entityRef,objectiveId,amountMinor:event.amountMinor,currency:event.currency,occurredAt:event.occurredAt,sourceVersion:event.sourceVersion});
    const direct=Boolean(matching&&event.entityRef);const attribution=OutcomeAttributionSchema.parse({id:crypto.randomUUID(),ownerId:event.ownerId,externalOutcomeId:event.externalEventId,objectiveId,projectId:refs.projectId,workflowRunId:refs.workflowRunId,taskId:refs.taskId,experimentId,variantId,agentContributions:refs.agentId?[{agentId:refs.agentId,weight:direct?1:.5}]:[],attributionType:direct?"DIRECT":objectiveId?"CORRELATED":"UNKNOWN",confidence:direct?"HIGH":objectiveId?"MEDIUM":"LOW",evidenceRefs:[event.externalEventId],outcomeType:event.type,numericValue:event.metricValue,unit:event.metricUnit,createdAt:this.now().toISOString()});await this.store.saveAttribution(attribution);
    if(acceptedCommercialFact&&metricAllowed&&experimentId&&variantId&&event.metricId&&event.metricValue!==null)await this.#sinks.experimentMetric?.({ownerId:event.ownerId,experimentId,variantId,subjectId:event.entityRef??event.externalEventId,metricId:event.metricId,value:event.metricValue,evidenceRef:event.externalEventId});
    if(direct&&refs.agentId&&refs.taskId)await this.#sinks.verifiedReward?.({ownerId:event.ownerId,agentId:refs.agentId,taskId:refs.taskId,evidenceRef:event.externalEventId});
  }
}
