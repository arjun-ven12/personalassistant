import { z } from "zod";
import { companyScope } from "../companies/scope.js";
import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { CommercialWorkflowRecord,IntegrationStore } from "./store.js";

const TemplateSchema=z.enum(["REFUND","ACCOUNTS_RECEIVABLE","INVENTORY","CAMPAIGN_OPTIMIZATION"]);
const StatusSchema=z.enum(["PLANNED","WAITING_APPROVAL","EXECUTING","RECONCILING","COMPLETED","BLOCKED"]);
const StartSchema=z.object({ownerId:z.string().uuid(),companyId:z.string().uuid(),template:TemplateSchema,triggerKey:z.string().trim().min(1).max(200),sourceRefs:z.array(z.string().trim().min(1).max(300)).min(1).max(20)}).strict();
const TransitionSchema=z.object({ownerId:z.string().uuid(),companyId:z.string().uuid(),template:TemplateSchema,triggerKey:z.string().trim().min(1).max(200),expectedStep:z.number().int().min(0).max(30),expectedStatus:StatusSchema,outcome:z.enum(["ADVANCE","WAIT_APPROVAL","DISPATCHED","UNCERTAIN","VERIFIED","BLOCKED"]),evidenceRef:z.string().trim().min(1).max(300).nullable().default(null)}).strict();

export type CommercialWorkflowTemplate=z.infer<typeof TemplateSchema>;
interface Stage {key:string;capability:string|null;guard:string;}

/** Immutable, provider-neutral runbooks. Mutations still execute only through the reviewed business runtime. */
export const COMMERCIAL_WORKFLOW_TEMPLATES:Readonly<Record<CommercialWorkflowTemplate,readonly Stage[]>>={
  REFUND:[
    {key:"LOAD_CANONICAL_PAYMENT",capability:"payments.read",guard:"company_provider_and_remaining_refundable_amount"},
    {key:"PREPARE_REFUND",capability:"payments.prepare_refund",guard:"amount_currency_and_eligibility"},
    {key:"POLICY_AND_AGGREGATE",capability:null,guard:"per_action_and_daily_currency_limit"},
    {key:"WAIT_APPROVAL",capability:null,guard:"exact_action_recent_authentication"},
    {key:"DISPATCH",capability:"payments.execute_refund",guard:"idempotency_lease_fence_and_expected_version"},
    {key:"RECONCILE",capability:"payments.read",guard:"provider_state_before_retry"},
    {key:"RECORD_FACT",capability:null,guard:"canonical_provider_evidence"},
    {key:"NOTIFY",capability:"email.create_draft",guard:"bounded_result_only"},
  ],
  ACCOUNTS_RECEIVABLE:[
    {key:"VERIFY_AGING",capability:"accounting.read_aging",guard:"authoritative_invoice_and_age"},
    {key:"CLASSIFY_STAGE",capability:null,guard:"bounded_reminder_stage"},
    {key:"DRAFT_REMINDER",capability:"email.create_draft",guard:"reviewable_content"},
    {key:"WAIT_APPROVAL",capability:null,guard:"communication_policy"},
    {key:"SEND",capability:"email.send_draft",guard:"one_send_per_invoice_stage"},
    {key:"SCHEDULE_FOLLOW_UP",capability:null,guard:"bounded_attempts_and_due_date"},
    {key:"RECONCILE_PAYMENT",capability:"payments.read",guard:"payment_event_or_authoritative_read"},
  ],
  INVENTORY:[
    {key:"VERIFY_ITEM",capability:"commerce.read_product",guard:"canonical_sku_mapping"},
    {key:"VERIFY_INVENTORY",capability:"commerce.read_inventory",guard:"current_version_and_quantity"},
    {key:"POLICY_AND_LIMITS",capability:null,guard:"non_negative_and_daily_value_limit"},
    {key:"WAIT_APPROVAL",capability:null,guard:"exact_bounded_mutation"},
    {key:"DISPATCH",capability:"commerce.update_inventory",guard:"lease_fence_and_expected_version"},
    {key:"RECONCILE",capability:"commerce.read_inventory",guard:"verify_non_negative_provider_state"},
  ],
  CAMPAIGN_OPTIMIZATION:[
    {key:"VERIFY_REPORTING_WINDOW",capability:"ads.read_performance",guard:"complete_window_and_provider_provenance"},
    {key:"EVALUATE_OBJECTIVE",capability:"analytics.query_metric",guard:"canonical_metric_and_minimum_evidence"},
    {key:"PREPARE_RECOMMENDATION",capability:"ads.prepare_campaign",guard:"one_direction_per_window"},
    {key:"POLICY_LIMITS_COOLDOWN",capability:null,guard:"absolute_percentage_daily_and_cooldown"},
    {key:"WAIT_APPROVAL",capability:null,guard:"exact_action_recent_authentication"},
    {key:"DISPATCH",capability:"ads.adjust_budget",guard:"lease_fence_and_expected_version"},
    {key:"RECONCILE",capability:"ads.read_performance",guard:"provider_state_before_retry"},
    {key:"MEASURE_NEXT_PERIOD",capability:"analytics.query_metric",guard:"next_complete_reporting_window"},
  ],
};

export class CommercialWorkflowCoordinator{
  constructor(readonly store:IntegrationStore,readonly audit:GovernanceAuditWriter,readonly now:()=>Date=()=>new Date()){}

  async start(raw:unknown){
    const input=StartSchema.parse(raw);this.assertScope(input.ownerId,input.companyId);const at=this.now().toISOString(),stages=COMMERCIAL_WORKFLOW_TEMPLATES[input.template];
    const record:CommercialWorkflowRecord={id:crypto.randomUUID(),ownerId:input.ownerId,companyId:input.companyId,template:input.template,triggerKey:input.triggerKey,status:"PLANNED",step:0,state:{templateVersion:1,stages,sourceRefs:input.sourceRefs,maxAttempts:input.template==="ACCOUNTS_RECEIVABLE"?4:1,attempts:0,lastEvidenceRef:null},createdAt:at,updatedAt:at};
    const saved=await this.store.saveCommercialWorkflow(record);await this.writeAudit(saved,"Commercial workflow trigger recorded idempotently.");return saved;
  }

  async find(ownerId:string,companyId:string,template:CommercialWorkflowTemplate,triggerKey:string){this.assertScope(ownerId,companyId);return this.store.findCommercialWorkflow(ownerId,companyId,TemplateSchema.parse(template),z.string().min(1).max(200).parse(triggerKey));}

  async transition(raw:unknown){
    const input=TransitionSchema.parse(raw);this.assertScope(input.ownerId,input.companyId);const current=await this.store.findCommercialWorkflow(input.ownerId,input.companyId,input.template,input.triggerKey);
    if(!current)throw new ExecutionError(404,"COMMERCIAL_WORKFLOW_NOT_FOUND","The company-scoped commercial workflow was not found.");
    if(current.step!==input.expectedStep||current.status!==input.expectedStatus)return current;
    if(current.status==="COMPLETED"||current.status==="BLOCKED")return current;
    const stages=COMMERCIAL_WORKFLOW_TEMPLATES[current.template],nextStep=input.outcome==="BLOCKED"||input.outcome==="WAIT_APPROVAL"||input.outcome==="UNCERTAIN"?current.step:Math.min(current.step+1,stages.length);
    const nextStage=stages[nextStep];let status:CommercialWorkflowRecord["status"];
    if(input.outcome==="BLOCKED")status="BLOCKED";
    else if(input.outcome==="WAIT_APPROVAL")status="WAITING_APPROVAL";
    else if(input.outcome==="UNCERTAIN")status="RECONCILING";
    else if(input.outcome==="DISPATCHED")status="RECONCILING";
    else if(input.outcome==="VERIFIED"&&nextStep>=stages.length)status="COMPLETED";
    else if(nextStep>=stages.length)status="COMPLETED";
    else if(nextStage?.key==="WAIT_APPROVAL")status="WAITING_APPROVAL";
    else if(nextStage?.key==="DISPATCH")status="EXECUTING";
    else if(nextStage?.key.includes("RECONCILE"))status="RECONCILING";
    else status="PLANNED";
    const updated:CommercialWorkflowRecord={...current,status,step:nextStep,state:{...current.state,lastEvidenceRef:input.evidenceRef,lastOutcome:input.outcome},updatedAt:this.now().toISOString()};
    if(!await this.store.transitionCommercialWorkflow(updated,input.expectedStep,input.expectedStatus))return (await this.store.findCommercialWorkflow(input.ownerId,input.companyId,input.template,input.triggerKey))!;
    await this.writeAudit(updated,`Commercial workflow advanced to ${status}.`);return updated;
  }

  private assertScope(ownerId:string,companyId:string){if(companyScope.companyId(ownerId)!==companyId)throw new ExecutionError(403,"COMMERCIAL_WORKFLOW_SCOPE_DENIED","The workflow company does not match the authenticated company context.");}
  private async writeAudit(record:CommercialWorkflowRecord,reason:string){await this.audit({eventType:"INTEGRATION_OPERATION_COMPLETED",ownerId:record.ownerId,ipAddress:"system",outcome:"SUCCESS",reason,requestId:`commercial-workflow:${record.id}`,metadata:{companyId:record.companyId,workflowId:record.id,template:record.template,status:record.status,step:record.step}});}
}
