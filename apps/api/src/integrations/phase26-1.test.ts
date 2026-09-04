import {
  BusinessExternalEventInputSchema,
  CompanyCredentialReferenceSchema,
  CompanyIntegrationBindingSchema,
} from "@alexa-control/shared";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryCompanyDataStore } from "../company-data/store.js";
import { companyScope } from "../companies/scope.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { DeterministicBusinessProvider } from "./business-providers.js";
import { IntegrationRegistryService } from "./service.js";
import { InMemoryIntegrationStore } from "./store.js";
import { StaticReviewedSecretResolver } from "./secret-resolver.js";

const at = "2026-09-03T00:00:00.000Z";
const context = (ownerId:string, companyId:string) => ({ownerId, companyId, role:"OWNER" as const, requestId:crypto.randomUUID()});

const setup = async () => {
  const ownerId=crypto.randomUUID(), companyA=crypto.randomUUID(), companyB=crypto.randomUUID(), sessionId=crypto.randomUUID();
  const auditEvents: Parameters<GovernanceAuditWriter>[0][]=[];
  const audit:GovernanceAuditWriter=(event)=>{auditEvents.push(event);};
  const companyData=new InMemoryCompanyDataStore();
  const approvals=new ApprovalService(new InMemoryGovernanceStore([],false),audit);
  const service=new IntegrationRegistryService(new InMemoryIntegrationStore(),audit,()=>new Date(at),companyData,new StaticReviewedSecretResolver({accessToken:"test-access-token-that-is-long-enough"}));
  service.enableBusinessOperations(approvals);
  service.setAgentBusinessAuthorityVerifier(()=>Promise.resolve(true));
  const capabilities={
    gmail:["email.search","email.read_thread","email.list_attachments","email.create_draft","email.send_draft","email.reply","email.forward"],
    crm:["crm.search_leads","crm.search_contacts","crm.search_companies","crm.read_lead","crm.read_pipeline","crm.read_activity","crm.create_lead","crm.update_stage","crm.add_note","crm.create_follow_up"],
    support:["support.list_tickets","support.search_tickets","support.read_ticket","support.create_draft","support.reply","support.change_status","support.assign","support.add_note","support.escalate"],
    documents:["documents.find","documents.read","documents.create","documents.update","documents.attach_reference"],
    projects:["projects.list","projects.search","projects.read_task","projects.create_task","projects.update_task","projects.assign_task","projects.change_status","projects.comment","projects.set_due_date","projects.set_priority"],
  } as const;
  for(const [provider,actions] of Object.entries(capabilities))service.setBusinessProvider(new DeterministicBusinessProvider(provider as keyof typeof capabilities,new Set(actions)));

  const bind = async (companyId:string, provider:keyof typeof capabilities) => {
    const credentialId=crypto.randomUUID(), bindingId=crypto.randomUUID();
    companyData.saveCredentialReference(CompanyCredentialReferenceSchema.parse({id:credentialId,ownerId,companyId,provider,secretLocator:`vault.${provider}.${companyId}`,status:"READY",lastVerifiedAt:at,createdAt:at,updatedAt:at}));
    companyData.saveIntegrationBinding(CompanyIntegrationBindingSchema.parse({id:bindingId,ownerId,companyId,provider,integrationType:provider,integrationId:provider,credentialRef:credentialId,status:"READY",capabilitiesExposed:[...capabilities[provider]],metadata:{},lastSyncAt:null,createdAt:at,updatedAt:at}));
    await companyScope.run(context(ownerId,companyId),async()=>{
      await service.ensureBuiltIns(ownerId);
      for(const capability of service.capabilities().filter((item)=>item.integrationId===provider))await service.setPermission({ownerId,integrationId:provider,capabilityId:capability.id,grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});
    });
    return {credentialId,bindingId};
  };
  for(const provider of Object.keys(capabilities) as Array<keyof typeof capabilities>)await bind(companyA,provider);
  const request=(companyId:string,body:unknown)=>companyScope.run(context(ownerId,companyId),()=>service.requestBusinessAction({ownerId,body,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));
  const execute=async(body:unknown)=>{
    const waiting=await request(companyA,body);
    if(waiting.status!=="WAITING_APPROVAL")return waiting;
    await companyScope.run(context(ownerId,companyA),()=>approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()}));
    return request(companyA,body);
  };
  return {ownerId,companyA,companyB,service,companyData,auditEvents,request,execute,bind};
};

describe("Phase 26.1 communication and customer operations",()=>{
  it("runs the lead follow-up path through governed provider adapters",async()=>{
    const {ownerId,companyA,service,request,execute}=await setup();
    expect((await request(companyA,{capability:"crm.read_lead",idempotencyKey:"lead-read-0001",reason:"Read the qualified lead.",references:{agentId:"sales"},externalLeadId:"lead-42"})).status).toBe("VERIFIED");
    expect((await request(companyA,{capability:"email.create_draft",idempotencyKey:"lead-draft-001",reason:"Draft lead outreach.",references:{agentId:"sales"},to:["lead@example.com"],cc:[],subject:"Follow up",body:"Thanks for speaking with us.",threadId:null})).status).toBe("VERIFIED");
    expect((await execute({capability:"email.send_draft",idempotencyKey:"lead-send-00001",reason:"Send approved outreach.",references:{agentId:"sales"},draftId:"draft-42",recipientCount:1})).status).toBe("VERIFIED");
    expect((await execute({capability:"crm.add_note",idempotencyKey:"lead-note-00001",reason:"Record approved outreach.",references:{agentId:"sales"},externalLeadId:"lead-42",note:"Approved outreach sent."})).status).toBe("VERIFIED");
    expect((await execute({capability:"crm.create_follow_up",idempotencyKey:"lead-follow-0001",reason:"Create the follow-up task.",references:{agentId:"sales",taskId:"task-follow-42"},externalLeadId:"lead-42",internalTaskId:"task-follow-42",dueAt:"2026-09-05T00:00:00.000Z",description:"Follow up with the lead."})).status).toBe("VERIFIED");
    const dashboard=await companyScope.run(context(ownerId,companyA),()=>service.businessDashboard(ownerId));
    expect(dashboard.mappings).toEqual(expect.arrayContaining([expect.objectContaining({entityType:"CRM_FOLLOW_UP",internalEntityId:"task-follow-42",companyId:companyA})]));
  });

  it("runs support/document and project-task scenarios with durable mappings",async()=>{
    const {ownerId,companyA,service,request,execute}=await setup();
    await request(companyA,{capability:"support.read_ticket",idempotencyKey:"support-read-01",reason:"Read the customer ticket.",references:{agentId:"support"},ticketId:"ticket-9"});
    await request(companyA,{capability:"documents.read",idempotencyKey:"document-read-1",reason:"Read an authorized troubleshooting document.",references:{agentId:"support"},documentId:"doc-3"});
    await request(companyA,{capability:"support.create_draft",idempotencyKey:"support-draft1",reason:"Draft the support response.",references:{agentId:"support"},ticketId:"ticket-9",body:"Please follow the reviewed recovery steps."});
    expect((await execute({capability:"support.reply",idempotencyKey:"support-reply1",reason:"Send the approved support response.",references:{agentId:"support"},ticketId:"ticket-9",body:"Please follow the reviewed recovery steps."})).status).toBe("VERIFIED");
    expect((await execute({capability:"projects.create_task",idempotencyKey:"project-task-01",reason:"Create work derived from the objective.",references:{agentId:"operations",taskId:"alexa-task-9"},internalTaskId:"alexa-task-9",projectId:"project-1",title:"Coordinate launch",description:"Track launch readiness.",assigneeId:"owner-7",dueAt:"2026-09-10T00:00:00.000Z",priority:"HIGH"})).status).toBe("VERIFIED");
    const event=BusinessExternalEventInputSchema.parse({integrationId:"projects",companyId:companyA,externalEventId:"project-status-event-1",type:"PROJECT_TASK_STATUS_CHANGED",occurredAt:at,entityRef:"projects:projects.create_task:1"});
    const secret="project-webhook-test",timestamp=String(new Date(at).getTime());const signature=createHmac("sha256",secret).update(`${timestamp}.${ownerId}.${JSON.stringify(event)}`).digest("hex");
    await companyScope.run(context(ownerId,companyA),()=>service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"}));
    const dashboard=await companyScope.run(context(ownerId,companyA),()=>service.businessDashboard(ownerId));
    expect(dashboard.mappings).toEqual(expect.arrayContaining([expect.objectContaining({entityType:"PROJECT_TASK",internalEntityId:"alexa-task-9",companyId:companyA})]));
    expect(dashboard.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"PROJECT_TASK_STATUS_CHANGED",processingStatus:"PROCESSED",companyId:companyA})]));
  });

  it("denies cross-company/revoked credentials and rejects raw tokens",async()=>{
    const {ownerId,companyA,companyB,companyData,service,request}=await setup();
    await companyScope.run(context(ownerId,companyB),async()=>{await service.ensureBuiltIns(ownerId);await service.setPermission({ownerId,integrationId:"gmail",capabilityId:"gmail.email.read",grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});});
    await expect(request(companyB,{capability:"email.search",idempotencyKey:"cross-company1",reason:"Attempt cross-company email access.",references:{},query:"subject:private",limit:5})).rejects.toMatchObject({code:"INTEGRATION_BINDING_DENIED"});
    const credential=companyData.listCredentialReferences(ownerId,companyA).find((item)=>item.provider==="gmail")!;
    companyData.saveCredentialReference({...credential,status:"REVOKED",updatedAt:"2026-09-03T00:01:00.000Z"});
    await expect(request(companyA,{capability:"email.search",idempotencyKey:"revoked-email01",reason:"Read email after revocation.",references:{},query:"subject:test",limit:5})).rejects.toMatchObject({code:"CREDENTIAL_BINDING_DENIED"});
    await expect(request(companyA,{capability:"email.search",idempotencyKey:"raw-token-deny",reason:"Try to pass a token.",references:{},query:"subject:test",limit:5,oauthToken:"secret"})).rejects.toBeTruthy();
  });

  it("uses bounded idempotent retry and never retries an uncertain write",async()=>{
    const {companyA,service,request,execute}=await setup();
    const support=new DeterministicBusinessProvider("support",new Set(["support.read_ticket","support.reply"]));service.setBusinessProvider(support);
    support.failNextExecutions(2,"TIMEOUT");
    const read=await request(companyA,{capability:"support.read_ticket",idempotencyKey:"retry-ticket-01",reason:"Read after a bounded timeout.",references:{},ticketId:"ticket-1"});
    expect(read).toMatchObject({status:"VERIFIED",attemptCount:3});
    support.makeNextExecutionUncertain();
    const reply=await execute({capability:"support.reply",idempotencyKey:"uncertain-reply1",reason:"Send one approved support reply.",references:{},ticketId:"ticket-1",body:"Resolved."});
    expect(reply.status).toBe("EXTERNAL_RESULT_UNCERTAIN");
    expect(support.executionCount).toBe(4);
  });
});
