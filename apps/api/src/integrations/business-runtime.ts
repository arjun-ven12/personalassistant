import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  BusinessActionRequestSchema, BusinessEntityMappingSchema, BusinessExecutionRecordSchema,
  BusinessExternalEventInputSchema, BusinessExternalEventSchema, BusinessOperationsDashboardSchema,
  ExternalMetricObservationSchema, IntegrationSyncCheckpointSchema, OutcomeAttributionSchema, ProposedActionSchema,
  type BusinessActionRequest, type BusinessCapability, type BusinessProvider,
} from "@alexa-control/shared";
import type { ApprovalService, GovernanceAuditWriter } from "../governance/approval-service.js";
import { ExecutionError } from "../execution/errors.js";
import type { IntegrationStore } from "./store.js";
import type { ReviewedBusinessProvider } from "./business-providers.js";
import { UnavailableBusinessProvider } from "./business-providers.js";

const PROVIDER_BY_CAPABILITY:Record<BusinessCapability,BusinessProvider>={
  "email.search":"gmail","email.read_thread":"gmail","email.create_draft":"gmail","email.send_draft":"gmail",
  "crm.search_leads":"crm","crm.read_lead":"crm","crm.create_lead":"crm","crm.update_stage":"crm","crm.add_note":"crm",
  "analytics.read_metric":"analytics","github.read_issue":"github","github.create_issue":"github","github.read_pull_request":"github",
};
const INTEGRATION_CAPABILITY:Record<BusinessCapability,string>={
  "email.search":"gmail.email.read","email.read_thread":"gmail.email.read","email.create_draft":"gmail.email.draft","email.send_draft":"gmail.email.send",
  "crm.search_leads":"crm.lead.read","crm.read_lead":"crm.lead.read","crm.create_lead":"crm.lead.write","crm.update_stage":"crm.lead.write","crm.add_note":"crm.lead.write",
  "analytics.read_metric":"analytics.metric.read","github.read_issue":"github.repository.read","github.create_issue":"github.issue.write","github.read_pull_request":"github.repository.read",
};
const SIDE_EFFECTS=new Set<BusinessCapability>(["email.send_draft","crm.create_lead","crm.update_stage","crm.add_note","github.create_issue"]);
const APPROVALS=new Set<BusinessCapability>(["email.send_draft","crm.create_lead","crm.update_stage","crm.add_note","github.create_issue"]);
const capabilityAuthority=(capability:BusinessCapability)=>capability.startsWith("email.")?(capability==="email.send_draft"?"email.send":capability==="email.create_draft"?"email.draft":"email.read"):undefined;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const summary=(action:BusinessActionRequest)=>{
  switch(action.capability){
    case "email.create_draft":return `Create an email draft for ${action.to.length} recipient${action.to.length===1?"":"s"}.`;
    case "email.send_draft":return `Send reviewed email draft ${action.draftId} to ${action.recipientCount} recipient${action.recipientCount===1?"":"s"}.`;
    case "crm.create_lead":return `Create the mapped CRM lead ${action.internalEntityId}.`;
    case "crm.update_stage":return `Update CRM lead ${action.externalLeadId} to ${action.stage}.`;
    case "crm.add_note":return `Append a note to CRM lead ${action.externalLeadId}.`;
    case "analytics.read_metric":return `Read registered metric ${action.metricId} for the requested window.`;
    case "github.create_issue":return `Create a reviewed issue in ${action.repository}.`;
    default:return `Execute bounded ${action.capability}.`;
  }
};

export interface BusinessOutcomeSinks {
  objectiveMetric?(input:{ownerId:string;objectiveId:string;kpiId:string;value:number}):Promise<void>;
  experimentMetric?(input:{ownerId:string;experimentId:string;variantId:string;subjectId:string;metricId:string;value:number;evidenceRef:string}):Promise<void>;
  verifiedReward?(input:{ownerId:string;agentId:string;taskId:string;evidenceRef:string}):Promise<void>;
}
export type AgentBusinessAuthorityVerifier=(input:{ownerId:string;agentId:string;organizationId:string|null;capability:BusinessCapability})=>Promise<boolean>;

export class BusinessOperationsRuntime {
  readonly #providers=new Map<BusinessProvider,ReviewedBusinessProvider>();
  readonly #recentRequests=new Map<string,number[]>();
  readonly #inFlight=new Map<string,number>();
  readonly #failures=new Map<string,number>();
  #sinks:BusinessOutcomeSinks={};
  #agentAuthority?:AgentBusinessAuthorityVerifier;
  constructor(readonly store:IntegrationStore,readonly approvals:ApprovalService,readonly audit:GovernanceAuditWriter,readonly now:()=>Date=()=>new Date()){
    for(const id of ["gmail","crm","analytics","github"] as const)this.#providers.set(id,new UnavailableBusinessProvider(id));
  }
  setProvider(provider:ReviewedBusinessProvider){this.#providers.set(provider.providerId,provider);}
  setOutcomeSinks(sinks:BusinessOutcomeSinks){this.#sinks=sinks;}
  setAgentAuthorityVerifier(verifier:AgentBusinessAuthorityVerifier){this.#agentAuthority=verifier;}

  async dashboard(ownerId:string){
    const [executions,events,metrics,attributions,mappings,checkpoints]=await Promise.all([this.store.listBusinessExecutions(ownerId,500),this.store.listExternalEvents(ownerId,500),this.store.listExternalMetrics(ownerId,500),this.store.listAttributions(ownerId,500),this.store.listEntityMappings(ownerId),this.store.listSyncCheckpoints(ownerId)]);
    return BusinessOperationsDashboardSchema.parse({executions,events,metrics,attributions,mappings,checkpoints,summary:{verifiedActions:executions.filter((item)=>item.status==="VERIFIED").length,waitingApproval:executions.filter((item)=>item.status==="WAITING_APPROVAL").length,uncertainActions:executions.filter((item)=>item.status==="EXTERNAL_RESULT_UNCERTAIN").length,verifiedOutcomes:attributions.filter((item)=>item.confidence!=="LOW").length}});
  }

  async request(input:{ownerId:string;body:unknown;requestId:string;ipAddress:string}){
    const action=BusinessActionRequestSchema.parse(input.body);const providerId=PROVIDER_BY_CAPABILITY[action.capability];const integrationId=providerId;
    if(action.references.agentId&&(!this.#agentAuthority||!await this.#agentAuthority({ownerId:input.ownerId,agentId:action.references.agentId,organizationId:action.references.organizationId,capability:action.capability})))throw new ExecutionError(403,"AGENT_CAPABILITY_DENIED","The receiving agent is not independently eligible for this external capability.");
    const actionDigest=digest(action);const existing=await this.store.findBusinessExecution(input.ownerId,integrationId,action.idempotencyKey);
    if(existing&&existing.actionDigest!==actionDigest)throw new ExecutionError(409,"IDEMPOTENCY_KEY_CONFLICT","The idempotency key is already bound to a different reviewed action.");
    if(existing&&!["WAITING_APPROVAL","EXTERNAL_RESULT_UNCERTAIN"].includes(existing.status))return existing;
    const integration=await this.store.findIntegration(input.ownerId,integrationId);if(!integration||integration.status==="disabled")throw new ExecutionError(403,"BUSINESS_INTEGRATION_DISABLED","The requested business integration is not enabled for this owner.");
    const capabilityId=INTEGRATION_CAPABILITY[action.capability];const permission=await this.store.findPermission(input.ownerId,integrationId,capabilityId);
    if(!permission||permission.state!=="granted")throw new ExecutionError(403,"CAPABILITY_DENIED","The finite integration capability is not granted.");
    const provider=this.#providers.get(providerId)!;if(!provider.capabilities.has(action.capability))throw new ExecutionError(409,"PROVIDER_CAPABILITY_UNAVAILABLE","The reviewed provider does not expose this capability.");
    const health=await provider.health();await this.store.saveHealth({integrationId,state:health.state==="HEALTHY"?"healthy":health.state==="DEGRADED"?"degraded":"unhealthy",checkedAt:this.now().toISOString(),latencyMs:null,reasonCode:health.reasonCode,credentialStatus:health.state==="REAUTH_REQUIRED"?"expired":"configured",rateLimitRemaining:health.rateLimitRemaining});
    if(health.state==="REAUTH_REQUIRED")throw new ExecutionError(409,"PROVIDER_AUTH_FAILED","The provider requires owner reauthentication.");
    if(health.state==="UNAVAILABLE"||this.#failures.get(`${input.ownerId}:${providerId}`)!>=3)throw new ExecutionError(503,"PROVIDER_UNAVAILABLE","The reviewed provider is unavailable or its circuit is open.");
    const id=existing?.id??crypto.randomUUID();const at=this.now().toISOString();const proposed=this.approvalAction(id,providerId,action);
    if(APPROVALS.has(action.capability)){
      const approved=await this.approvals.findMatchingApproved(input.ownerId,proposed);
      if(!approved){const approval=await this.approvals.create({ownerId:input.ownerId,action:proposed,riskLevel:action.capability==="email.send_draft"?"high":"medium",approvalRequirement:"explicit",ipAddress:input.ipAddress,requestId:input.requestId});const waiting=BusinessExecutionRecordSchema.parse({id,ownerId:input.ownerId,provider:providerId,integrationId,capability:action.capability,idempotencyKey:action.idempotencyKey,actionDigest,status:"WAITING_APPROVAL",approvalId:approval.id,externalReferenceId:null,actionSummary:summary(action),resultSummary:"The bounded external action is waiting for exact-action approval.",references:action.references,verification:"PENDING",attemptCount:0,requestedAt:existing?.requestedAt??at,updatedAt:at});await this.store.saveBusinessExecution(waiting);return waiting;}
    }
    this.guardRateAndConcurrency(input.ownerId,integrationId,permission.rateLimitPerMinute);
    const executing=BusinessExecutionRecordSchema.parse({id,ownerId:input.ownerId,provider:providerId,integrationId,capability:action.capability,idempotencyKey:action.idempotencyKey,actionDigest,status:"EXECUTING",approvalId:existing?.approvalId??null,externalReferenceId:existing?.externalReferenceId??null,actionSummary:summary(action),resultSummary:"Execution dispatched through the reviewed provider.",references:action.references,verification:SIDE_EFFECTS.has(action.capability)?"PENDING":"NOT_REQUIRED",attemptCount:(existing?.attemptCount??0)+1,requestedAt:existing?.requestedAt??at,updatedAt:at});await this.store.saveBusinessExecution(executing);
    const key=`${input.ownerId}:${integrationId}`;this.#inFlight.set(key,(this.#inFlight.get(key)??0)+1);
    try{
      const result=await provider.execute(action);const status=result.outcome;const finished=BusinessExecutionRecordSchema.parse({...executing,status,externalReferenceId:result.externalReferenceId,resultSummary:result.summary,verification:result.outcome==="VERIFIED"?"VERIFIED":result.outcome==="EXTERNAL_RESULT_UNCERTAIN"?"UNCERTAIN":"FAILED",updatedAt:this.now().toISOString()});await this.store.saveBusinessExecution(finished);
      if(result.outcome==="FAILED")this.#failures.set(key,(this.#failures.get(key)??0)+1);else this.#failures.set(key,0);
      if(result.mapping)await this.store.saveEntityMapping(BusinessEntityMappingSchema.parse({id:crypto.randomUUID(),ownerId:input.ownerId,integrationId,entityType:result.mapping.entityType,externalId:result.mapping.externalId,internalEntityId:result.mapping.internalEntityId,externalVersion:result.mapping.externalVersion,lastSyncedAt:finished.updatedAt,conflictPolicy:"REVIEW_REQUIRED"}));
      if(result.metric)await this.recordMetric(input.ownerId,providerId,action.references,result.metric,result.externalReferenceId);
      await this.audit({eventType:result.outcome==="VERIFIED"?"INTEGRATION_OPERATION_COMPLETED":"INTEGRATION_OPERATION_FAILED",ownerId:input.ownerId,outcome:result.outcome==="VERIFIED"?"SUCCESS":"FAILURE",reason:result.summary,requestId:input.requestId,ipAddress:input.ipAddress,metadata:{executionId:id,integrationId,capability:action.capability,objectiveId:action.references.objectiveId}});
      return finished;
    } finally {this.#inFlight.set(key,Math.max(0,(this.#inFlight.get(key)??1)-1));}
  }

  async reconcile(input:{ownerId:string;executionId:string;requestId:string;ipAddress:string}){
    const record=(await this.store.listBusinessExecutions(input.ownerId,500)).find((item)=>item.id===input.executionId);if(!record)throw new ExecutionError(404,"BUSINESS_EXECUTION_NOT_FOUND","The external execution was not found.");
    if(record.status!=="EXTERNAL_RESULT_UNCERTAIN"||!record.externalReferenceId)throw new ExecutionError(409,"RECONCILIATION_NOT_REQUIRED","Only uncertain external effects require reconciliation.");
    const result=await this.#providers.get(record.provider)!.reconcile(record.externalReferenceId);const updated=BusinessExecutionRecordSchema.parse({...record,status:result.outcome==="VERIFIED"?"VERIFIED":"REVIEW_REQUIRED",verification:result.outcome==="VERIFIED"?"VERIFIED":"FAILED",resultSummary:result.summary,updatedAt:this.now().toISOString()});await this.store.saveBusinessExecution(updated);return updated;
  }

  async ingestWebhook(input:{ownerId:string;body:unknown;signature:string;timestamp:string;secret:string;requestId:string;ipAddress:string}){
    const event=BusinessExternalEventInputSchema.parse(input.body);const timestamp=Number(input.timestamp);if(!Number.isFinite(timestamp)||Math.abs(this.now().getTime()-timestamp)>300_000)throw new ExecutionError(401,"WEBHOOK_TIMESTAMP_INVALID","The webhook timestamp is outside the accepted replay window.");
    const expected=createHmac("sha256",input.secret).update(`${input.timestamp}.${input.ownerId}.${JSON.stringify(event)}`).digest("hex");const supplied=Buffer.from(input.signature,"hex");const expectedBuffer=Buffer.from(expected,"hex");if(supplied.length!==expectedBuffer.length||!timingSafeEqual(supplied,expectedBuffer))throw new ExecutionError(401,"WEBHOOK_SIGNATURE_INVALID","The external event signature is invalid.");
    const integration=await this.store.findIntegration(input.ownerId,event.integrationId);if(!integration||integration.status==="disabled")throw new ExecutionError(403,"BUSINESS_INTEGRATION_DISABLED","The event integration is not enabled for this owner.");
    const provider=PROVIDER_BY_CAPABILITY[event.type.startsWith("EMAIL_")?"email.read_thread":event.type.startsWith("CRM_")?"crm.read_lead":event.type.startsWith("ANALYTICS_")?"analytics.read_metric":"github.read_issue"];
    const receivedAt=this.now().toISOString();let record=BusinessExternalEventSchema.parse({...event,id:crypto.randomUUID(),ownerId:input.ownerId,provider,signatureVerified:true,receivedAt,processedAt:null,processingStatus:"RECEIVED"});
    if(!await this.store.saveExternalEvent(record))return {duplicate:true,event:null};
    try{await this.processEvent(record);record=BusinessExternalEventSchema.parse({...record,processedAt:this.now().toISOString(),processingStatus:"PROCESSED"});await this.store.updateExternalEvent(record);await this.audit({eventType:"INTEGRATION_OPERATION_COMPLETED",ownerId:input.ownerId,outcome:"SUCCESS",reason:"Authenticated external business event processed once.",requestId:input.requestId,ipAddress:input.ipAddress,metadata:{integrationId:event.integrationId,eventType:event.type,externalEventId:event.externalEventId}});return {duplicate:false,event:record};}
    catch(error){record=BusinessExternalEventSchema.parse({...record,processedAt:this.now().toISOString(),processingStatus:"FAILED"});await this.store.updateExternalEvent(record);throw error;}
  }

  async checkpoint(ownerId:string,integrationId:string,stream:string,cursor:string,sourceTimestamp:string|null){const value=IntegrationSyncCheckpointSchema.parse({ownerId,integrationId,stream,cursor,sourceTimestamp,updatedAt:this.now().toISOString()});await this.store.saveSyncCheckpoint(value);return value;}

  private approvalAction(actionId:string,provider:BusinessProvider,action:BusinessActionRequest){const authority=capabilityAuthority(action.capability);return ProposedActionSchema.parse({actionId,toolName:"business.execute_reviewed_capability",arguments:{provider,capability:action.capability,actionSummary:summary(action),payloadDigest:digest(action),references:action.references},...(authority?{requestedCapabilities:[authority]}:{})});}
  private guardRateAndConcurrency(ownerId:string,integrationId:string,limit:number){const key=`${ownerId}:${integrationId}`;if((this.#inFlight.get(key)??0)>=3)throw new ExecutionError(429,"PROVIDER_CONCURRENCY_LIMIT","The provider concurrency limit is reached.");const cutoff=this.now().getTime()-60_000;const recent=(this.#recentRequests.get(key)??[]).filter((value)=>value>=cutoff);if(recent.length>=Math.min(limit,60))throw new ExecutionError(429,"PROVIDER_RATE_LIMITED","The bounded provider rate limit is reached.");recent.push(this.now().getTime());this.#recentRequests.set(key,recent);}
  private async recordMetric(ownerId:string,provider:BusinessProvider,references:BusinessActionRequest["references"],metric:{metricId:string;value:number;unit:string;observedAt:string},externalReferenceId:string|null){const fetchedAt=this.now().toISOString();const observation=ExternalMetricObservationSchema.parse({id:crypto.randomUUID(),ownerId,objectiveId:references.objectiveId,experimentId:references.experimentId,variantId:references.variantId,metricId:metric.metricId,sourceProvider:provider,externalMetricId:externalReferenceId,value:metric.value,unit:metric.unit,observedAt:metric.observedAt,fetchedAt,sourceHealth:"HEALTHY",evidenceRef:externalReferenceId});await this.store.saveExternalMetric(observation);if(references.objectiveId)await this.#sinks.objectiveMetric?.({ownerId,objectiveId:references.objectiveId,kpiId:metric.metricId,value:metric.value});}
  private async processEvent(event:ReturnType<typeof BusinessExternalEventSchema.parse>){
    const matching=(await this.store.listBusinessExecutions(event.ownerId,500)).find((item)=>item.externalReferenceId===event.entityRef);const refs=matching?.references??{organizationId:null,objectiveId:event.objectiveId,projectId:null,workflowRunId:null,taskId:null,experimentId:event.experimentId,variantId:event.variantId,agentId:null};
    if(event.metricId&&event.metricValue!==null&&event.metricUnit){await this.recordMetric(event.ownerId,event.provider,{...refs,objectiveId:event.objectiveId??refs.objectiveId,experimentId:event.experimentId??refs.experimentId,variantId:event.variantId??refs.variantId},{metricId:event.metricId,value:event.metricValue,unit:event.metricUnit,observedAt:event.occurredAt},event.externalEventId);}
    const objectiveId=event.objectiveId??refs.objectiveId,experimentId=event.experimentId??refs.experimentId,variantId=event.variantId??refs.variantId;
    const direct=Boolean(matching&&event.entityRef);const attribution=OutcomeAttributionSchema.parse({id:crypto.randomUUID(),ownerId:event.ownerId,externalOutcomeId:event.externalEventId,objectiveId,projectId:refs.projectId,workflowRunId:refs.workflowRunId,taskId:refs.taskId,experimentId,variantId,agentContributions:refs.agentId?[{agentId:refs.agentId,weight:direct?1:.5}]:[],attributionType:direct?"DIRECT":objectiveId?"CORRELATED":"UNKNOWN",confidence:direct?"HIGH":objectiveId?"MEDIUM":"LOW",evidenceRefs:[event.externalEventId],outcomeType:event.type,numericValue:event.metricValue,unit:event.metricUnit,createdAt:this.now().toISOString()});await this.store.saveAttribution(attribution);
    if(experimentId&&variantId&&event.metricId&&event.metricValue!==null)await this.#sinks.experimentMetric?.({ownerId:event.ownerId,experimentId,variantId,subjectId:event.entityRef??event.externalEventId,metricId:event.metricId,value:event.metricValue,evidenceRef:event.externalEventId});
    if(direct&&refs.agentId&&refs.taskId)await this.#sinks.verifiedReward?.({ownerId:event.ownerId,agentId:refs.agentId,taskId:refs.taskId,evidenceRef:event.externalEventId});
  }
}
