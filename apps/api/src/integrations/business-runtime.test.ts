import { createHmac } from "node:crypto";
import { BusinessExternalEventInputSchema } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { DeterministicBusinessProvider } from "./business-providers.js";
import type { BusinessProviderResult } from "./business-providers.js";
import { IntegrationRegistryService } from "./service.js";
import { InMemoryIntegrationStore } from "./store.js";

const setup=async()=>{
  const ownerId=crypto.randomUUID(),otherOwnerId=crypto.randomUUID(),sessionId=crypto.randomUUID();const audits:unknown[]=[];const audit:GovernanceAuditWriter=(event)=>{audits.push(event);};
  const governance=new InMemoryGovernanceStore([],false);const approvals=new ApprovalService(governance,audit);const service=new IntegrationRegistryService(new InMemoryIntegrationStore(),audit);service.enableBusinessOperations(approvals);
  service.setAgentBusinessAuthorityVerifier(({agentId,capability})=>Promise.resolve(agentId==="sales_agent"&&capability==="email.send_draft"));
  const gmail=new DeterministicBusinessProvider("gmail",new Set(["email.search","email.read_thread","email.create_draft","email.send_draft"]));
  const crm=new DeterministicBusinessProvider("crm",new Set(["crm.search_leads","crm.read_lead","crm.create_lead","crm.update_stage","crm.add_note"]));
  const analytics=new DeterministicBusinessProvider("analytics",new Set(["analytics.read_metric"]));
  const github=new DeterministicBusinessProvider("github",new Set(["github.read_issue","github.create_issue","github.read_pull_request"]));
  for(const provider of [gmail,crm,analytics,github])service.setBusinessProvider(provider);
  await service.ensureBuiltIns(ownerId);await service.ensureBuiltIns(otherOwnerId);
  const grant=async(integrationId:string,capabilityId:string,owner=ownerId)=>service.setPermission({ownerId:owner,integrationId,capabilityId,grant:true,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});
  return {ownerId,otherOwnerId,sessionId,audits,governance,approvals,service,gmail,crm,analytics,github,grant};
};
const context=(ownerId:string,body:unknown)=>({ownerId,body,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});
const sendAction=(key:string,references:Record<string,unknown>={})=>({capability:"email.send_draft",idempotencyKey:key,reason:"Send the reviewed outreach draft.",references,draftId:"draft-1",recipientCount:1});

describe("Phase 23.6 business operations",()=>{
  it("rejects unreviewed or cross-provider capability declarations at registration",async()=>{
    const {service}=await setup();
    expect(()=>service.setBusinessProvider(new DeterministicBusinessProvider("gmail",new Set()))).toThrow();
    expect(()=>service.setBusinessProvider(new DeterministicBusinessProvider("gmail",new Set(["crm.search_leads"])))).toThrow();
  });
  it("blocks external dispatch while emergency stop is active, including after approval",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals,governance}=await setup();await grant("gmail","gmail.email.send");
    const action=sendAction("stop-after-approval");const waiting=await service.requestBusinessAction(context(ownerId,action));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    const originalHealth=gmail.health.bind(gmail);
    vi.spyOn(gmail,"health").mockImplementation(async()=>{const health=await originalHealth();governance.activateEmergencyStop(new Date().toISOString());return health;});
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toMatchObject({code:"EMERGENCY_STOP_ACTIVE"});
    expect(gmail.executionCount).toBe(0);
    await expect(service.requestBusinessAction(context(ownerId,{capability:"email.create_draft",idempotencyKey:"stop-draft-0001",reason:"Create a reviewed draft.",references:{},to:["owner@example.com"],cc:[],subject:"Draft",body:"No external write during emergency stop.",threadId:null}))).rejects.toMatchObject({code:"EMERGENCY_STOP_ACTIVE"});
    expect(gmail.executionCount).toBe(0);
    expect(governance.listPolicyEvaluations(ownerId,10).at(0)).toMatchObject({decision:"deny",reasonCode:"EMERGENCY_STOP_ACTIVE"});
    await expect(service.requestBusinessAction(context(ownerId,sendAction("stop-before-request")))).rejects.toMatchObject({code:"EMERGENCY_STOP_ACTIVE"});
    expect(gmail.executionCount).toBe(0);
  });

  it("rechecks emergency stop before an idempotent retry",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals,governance}=await setup();await grant("gmail","gmail.email.send");
    const action=sendAction("stop-between-retries");const waiting=await service.requestBusinessAction(context(ownerId,action));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    gmail.failNextExecutions(1);const original=gmail.execute.bind(gmail);
    vi.spyOn(gmail,"execute").mockImplementation(async (request)=>{const result=await original(request);governance.activateEmergencyStop(new Date().toISOString());return result;});
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toMatchObject({code:"EMERGENCY_STOP_ACTIVE"});
    expect(gmail.executionCount).toBe(1);
    expect((await service.businessDashboard(ownerId)).executions[0]?.status).toBe("EXTERNAL_RESULT_UNCERTAIN");
  });

  it("retains emergency stop across service reconstruction with the durable governance store",async()=>{
    const {ownerId,service,gmail,grant,approvals,governance,audits}=await setup();await grant("gmail","gmail.email.send");
    governance.activateEmergencyStop(new Date().toISOString());
    const audit:GovernanceAuditWriter=(event)=>{audits.push(event);};
    const restarted=new IntegrationRegistryService(service.store,audit);restarted.enableBusinessOperations(new ApprovalService(governance,audit));restarted.setBusinessProvider(gmail);
    await expect(restarted.requestBusinessAction(context(ownerId,sendAction("stop-after-restart")))).rejects.toMatchObject({code:"EMERGENCY_STOP_ACTIVE"});
    expect(gmail.executionCount).toBe(0);
    expect(governance.getSecurityState().emergencyStopActive).toBe(true);
    expect(approvals.store).toBe(governance);
  });

  it("rejects expired and revoked approvals at dispatch without calling the provider",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals}=await setup();await grant("gmail","gmail.email.send");
    const revoked=sendAction("approval-revoked");const waiting=await service.requestBusinessAction(context(ownerId,revoked));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    await approvals.cancel(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()});
    const again=await service.requestBusinessAction(context(ownerId,revoked));expect(again.status).toBe("WAITING_APPROVAL");expect(again.approvalId).not.toBe(waiting.approvalId);
    vi.useFakeTimers();
    try{
      vi.setSystemTime(new Date("2026-10-13T11:00:00.000Z"));
      const expiring=sendAction("approval-expiring");const pending=await service.requestBusinessAction(context(ownerId,expiring));
      await approvals.approve(ownerId,pending.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
      vi.setSystemTime(new Date("2026-10-13T11:16:00.000Z"));
      const expired=await service.requestBusinessAction(context(ownerId,expiring));expect(expired.status).toBe("WAITING_APPROVAL");expect(expired.approvalId).not.toBe(pending.approvalId);
    }finally{vi.useRealTimers();}
    expect(gmail.executionCount).toBe(0);
  });

  it("blocks a revocation that occurs after policy evaluation and before provider invocation",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals,governance}=await setup();await grant("gmail","gmail.email.send");
    const action=sendAction("approval-revoked-late");const waiting=await service.requestBusinessAction(context(ownerId,action));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    const original=governance.appendPolicyEvaluation.bind(governance);
    vi.spyOn(governance,"appendPolicyEvaluation").mockImplementation((evaluation)=>{
      original(evaluation);
      if(evaluation.decision==="allow"){
        const current=governance.findApprovalById(waiting.approvalId!);
        if(current)governance.updateApproval({...current,status:"CANCELLED",decidedAt:new Date().toISOString()});
      }
    });
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toMatchObject({code:"APPROVAL_NOT_CURRENT"});
    expect(gmail.executionCount).toBe(0);
  });

  it("quarantines malformed provider output after a write and redacts untrusted fields",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals,audits}=await setup();await grant("gmail","gmail.email.send");
    const action=sendAction("malformed-provider-output");const waiting=await service.requestBusinessAction(context(ownerId,action));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    vi.spyOn(gmail,"execute").mockResolvedValue({outcome:"VERIFIED",externalReferenceId:"gmail:forged",summary:"Unverified provider response.",secret:"must-not-leak"} as BusinessProviderResult);
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toBeTruthy();
    expect((await service.businessDashboard(ownerId)).executions[0]?.status).toBe("EXTERNAL_RESULT_UNCERTAIN");
    expect(JSON.stringify(audits)).not.toContain("must-not-leak");
  });
  it("keeps an interrupted external draft uncertain until provider reconciliation",async()=>{
    const {ownerId,service,gmail,grant}=await setup();await grant("gmail","gmail.email.draft");
    const action={capability:"email.create_draft",idempotencyKey:"draft-interrupted-0001",reason:"Prepare a reviewed draft.",references:{},to:["owner@example.com"],cc:[],subject:"Draft",body:"Review this draft.",threadId:null};
    const execute = vi.spyOn(gmail,"execute").mockRejectedValue(new Error("Provider connection ended after request dispatch."));
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toBeTruthy();
    const recorded=(await service.businessDashboard(ownerId)).executions[0];
    expect(recorded).toMatchObject({status:"EXTERNAL_RESULT_UNCERTAIN",verification:"UNCERTAIN"});
    expect(await service.requestBusinessAction(context(ownerId,action))).toMatchObject({id:recorded?.id,status:"EXTERNAL_RESULT_UNCERTAIN"});
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("claims an approved execution exactly once and cannot replace an in-flight record with a waiting record",async()=>{
    const {ownerId,service,grant}=await setup();await grant("gmail","gmail.email.send");
    const waiting=await service.requestBusinessAction(context(ownerId,sendAction("atomic-claim-0001")));
    const executing={...waiting,status:"EXECUTING" as const,attemptCount:1};
    expect(await service.store.claimBusinessExecution(executing)).toBe(true);
    expect(await service.store.claimBusinessExecution(executing)).toBe(false);
    expect(await service.store.saveWaitingBusinessExecution(waiting)).toBe(false);
    expect((await service.businessDashboard(ownerId)).executions[0]?.status).toBe("EXECUTING");
  });
  it("fails closed when provider health is malformed or rate-limited before a send",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals}=await setup();await grant("gmail","gmail.email.send");
    const action=sendAction("provider-health-denied");const waiting=await service.requestBusinessAction(context(ownerId,action));
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    const health=vi.spyOn(gmail,"health").mockResolvedValue({state:"HEALTHY",reasonCode:"LIMIT_EXHAUSTED",rateLimitRemaining:0});
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toMatchObject({code:"PROVIDER_RATE_LIMITED"});
    expect(gmail.executionCount).toBe(0);
    health.mockResolvedValue({state:"UNKNOWN" as "HEALTHY",reasonCode:"MALFORMED",rateLimitRemaining:1});
    await expect(service.requestBusinessAction(context(ownerId,action))).rejects.toBeTruthy();
    expect(gmail.executionCount).toBe(0);
  });
  it("executes reads, maps analytics evidence, and never exposes credentials",async()=>{
    const {ownerId,service,analytics,grant}=await setup();await grant("analytics","analytics.metric.read");
    const objectiveId=crypto.randomUUID(),kpiId=crypto.randomUUID();analytics.setMetric(kpiId,52,"count");const observed:unknown[]=[];service.setBusinessOutcomeSinks({objectiveMetric:(input)=>{observed.push(input);return Promise.resolve();}});
    const result=await service.requestBusinessAction(context(ownerId,{capability:"analytics.read_metric",idempotencyKey:"analytics-read-001",reason:"Refresh objective evidence.",references:{objectiveId},metricId:kpiId,windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-26T00:00:00.000Z",filters:{stage:"QUALIFIED"}}));
    expect(result.status).toBe("VERIFIED");expect(observed).toEqual([{ownerId,objectiveId,kpiId,value:52}]);
    const dashboard=await service.businessDashboard(ownerId);expect(dashboard.metrics[0]).toMatchObject({metricId:kpiId,value:52,sourceProvider:"analytics"});expect(JSON.stringify(dashboard)).not.toMatch(/secretLocator|oauthToken|accessToken/i);
  });

  it("binds send approval to the exact payload and prevents duplicate sends",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals}=await setup();await grant("gmail","gmail.email.send");const action=sendAction("email-send-0001");
    const waiting=await service.requestBusinessAction(context(ownerId,action));expect(waiting.status).toBe("WAITING_APPROVAL");expect(waiting.approvalId).not.toBeNull();
    await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    const sent=await service.requestBusinessAction(context(ownerId,action));expect(sent).toMatchObject({status:"VERIFIED",verification:"VERIFIED"});
    const duplicate=await service.requestBusinessAction(context(ownerId,action));expect(duplicate.id).toBe(sent.id);expect(gmail.executionCount).toBe(1);
    await expect(service.requestBusinessAction(context(ownerId,{...action,recipientCount:2}))).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_CONFLICT"});
  });

  it("reconciles an uncertain send without blindly replaying it",async()=>{
    const {ownerId,sessionId,service,gmail,grant,approvals}=await setup();await grant("gmail","gmail.email.send");gmail.makeNextExecutionUncertain();const action=sendAction("email-send-uncertain");
    const waiting=await service.requestBusinessAction(context(ownerId,action));await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);
    const uncertain=await service.requestBusinessAction(context(ownerId,action));expect(uncertain.status).toBe("EXTERNAL_RESULT_UNCERTAIN");expect(gmail.executionCount).toBe(1);
    const reconciled=await service.reconcileBusinessAction({ownerId,executionId:uncertain.id,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});expect(reconciled.status).toBe("VERIFIED");expect(gmail.executionCount).toBe(1);
  });

  it("creates stable CRM mappings and blocks mutation immediately after revocation",async()=>{
    const {ownerId,sessionId,service,grant,approvals}=await setup();await grant("crm","crm.lead.write");const internalEntityId="lead-internal-1";const action={capability:"crm.create_lead",idempotencyKey:"crm-create-0001",reason:"Create the qualified lead record.",references:{},internalEntityId,displayName:"Example Lead",email:"lead@example.com",company:"Example"};
    const waiting=await service.requestBusinessAction(context(ownerId,action));await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()});await service.requestBusinessAction(context(ownerId,action));
    expect((await service.businessDashboard(ownerId)).mappings[0]).toMatchObject({internalEntityId,conflictPolicy:"REVIEW_REQUIRED"});
    await service.setPermission({ownerId,integrationId:"crm",capabilityId:"crm.lead.write",grant:false,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});
    await expect(service.requestBusinessAction(context(ownerId,{...action,idempotencyKey:"crm-create-0002"}))).rejects.toMatchObject({code:"CAPABILITY_DENIED"});
  });

  it("authenticates and deduplicates external outcomes with direct attribution",async()=>{
    const {ownerId,sessionId,service,grant,approvals}=await setup();await grant("gmail","gmail.email.send");const objectiveId=crypto.randomUUID(),experimentId=crypto.randomUUID(),variantId=crypto.randomUUID();const refs={objectiveId,experimentId,variantId,taskId:"task-1",agentId:"sales_agent"};const action=sendAction("email-attribution-1",refs);
    const waiting=await service.requestBusinessAction(context(ownerId,action));await approvals.approve(ownerId,waiting.approvalId!,sessionId,{ipAddress:"127.0.0.1",requestId:crypto.randomUUID()},true);const sent=await service.requestBusinessAction(context(ownerId,action));
    const outcomes:unknown[]=[];service.setBusinessOutcomeSinks({experimentMetric:(input)=>{outcomes.push(input);return Promise.resolve();},verifiedReward:(input)=>{outcomes.push(input);return Promise.resolve();}});
    const event=BusinessExternalEventInputSchema.parse({integrationId:"gmail",externalEventId:"reply-event-1",type:"EMAIL_REPLIED",occurredAt:"2026-08-26T10:00:00.000Z",entityRef:sent.externalReferenceId,objectiveId,experimentId,variantId,metricId:"qualified_reply_rate",metricValue:1,metricUnit:"rate"});const secret="test-webhook-secret",timestamp=String(Date.now());const signature=createHmac("sha256",secret).update(`${timestamp}.${ownerId}.${JSON.stringify(event)}`).digest("hex");
    const first=await service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});const duplicate=await service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});expect(first.duplicate).toBe(false);expect(duplicate.duplicate).toBe(true);
    const dashboard=await service.businessDashboard(ownerId);expect(dashboard.attributions).toHaveLength(1);expect(dashboard.attributions[0]).toMatchObject({attributionType:"DIRECT",confidence:"HIGH",agentContributions:[{agentId:"sales_agent",weight:1}]});expect(outcomes).toHaveLength(2);
  });

  it("denies forged/cross-owner use and degrades providers independently",async()=>{
    const {ownerId,otherOwnerId,service,crm,grant}=await setup();await grant("gmail","gmail.email.read");await grant("crm","crm.lead.read");await grant("gmail","gmail.email.read",otherOwnerId);crm.setHealth("UNAVAILABLE");
    await expect(service.requestBusinessAction(context(ownerId,{capability:"crm.read_lead",idempotencyKey:"crm-read-fail",reason:"Read lead.",references:{},externalLeadId:"lead-1"}))).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    const gmail=await service.requestBusinessAction(context(ownerId,{capability:"email.search",idempotencyKey:"gmail-read-ok",reason:"Find relevant messages.",references:{},query:"from:example.com",limit:5}));expect(gmail.status).toBe("VERIFIED");
    await expect(service.requestBusinessAction(context(otherOwnerId,{capability:"crm.read_lead",idempotencyKey:"cross-owner-denied",reason:"Read another owner CRM.",references:{},externalLeadId:"lead-1"}))).rejects.toMatchObject({code:"CAPABILITY_DENIED"});
    const event=BusinessExternalEventInputSchema.parse({integrationId:"gmail",externalEventId:"forged",type:"EMAIL_REPLIED",occurredAt:new Date().toISOString()});await expect(service.ingestBusinessWebhook({ownerId,body:event,signature:"0".repeat(64),timestamp:String(Date.now()),secret:"secret",requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"})).rejects.toMatchObject({code:"WEBHOOK_SIGNATURE_INVALID"});
    await expect(service.requestBusinessAction(context(ownerId,{capability:"email.search",idempotencyKey:"authority-laundering",reason:"Delegated read.",references:{agentId:"sales_agent"},query:"subject:test",limit:5}))).rejects.toMatchObject({code:"AGENT_CAPABILITY_DENIED"});
    await expect(service.requestBusinessAction(context(ownerId,{capability:"email.search",idempotencyKey:"credential-leak",reason:"Read mail.",references:{},query:"subject:test",limit:5,providerToken:"secret"}))).rejects.toBeTruthy();
  });

  it("enforces provider rate, auth, and circuit-breaker contracts",async()=>{
    const {ownerId,service,analytics,grant}=await setup();await grant("analytics","analytics.metric.read");
    analytics.setHealth("REAUTH_REQUIRED");await expect(service.requestBusinessAction(context(ownerId,{capability:"analytics.read_metric",idempotencyKey:"reauth-required",reason:"Read metric.",references:{},metricId:"sessions",windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-02T00:00:00.000Z",filters:{}}))).rejects.toMatchObject({code:"PROVIDER_AUTH_FAILED"});
    analytics.setHealth("HEALTHY");analytics.failNextExecutions(9);
    for(let index=0;index<3;index++){const failed=await service.requestBusinessAction(context(ownerId,{capability:"analytics.read_metric",idempotencyKey:`circuit-failure-${index}`,reason:"Read metric.",references:{},metricId:"sessions",windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-02T00:00:00.000Z",filters:{}}));expect(failed.status).toBe("FAILED");}
    await expect(service.requestBusinessAction(context(ownerId,{capability:"analytics.read_metric",idempotencyKey:"circuit-open",reason:"Read metric.",references:{},metricId:"sessions",windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-02T00:00:00.000Z",filters:{}}))).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    const rate=await setup();await rate.grant("analytics","analytics.metric.read");for(let index=0;index<30;index++)await rate.service.requestBusinessAction(context(rate.ownerId,{capability:"analytics.read_metric",idempotencyKey:`rate-read-${index}`,reason:"Read metric.",references:{},metricId:"sessions",windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-02T00:00:00.000Z",filters:{}}));
    await expect(rate.service.requestBusinessAction(context(rate.ownerId,{capability:"analytics.read_metric",idempotencyKey:"rate-read-overflow",reason:"Read metric.",references:{},metricId:"sessions",windowStart:"2026-08-01T00:00:00.000Z",windowEnd:"2026-08-02T00:00:00.000Z",filters:{}}))).rejects.toMatchObject({code:"PROVIDER_RATE_LIMITED"});
  });

  it("processes 500 external events deterministically without provider or agent activation",async()=>{
    const {ownerId,service}=await setup();const secret="scale-secret",objectiveId=crypto.randomUUID();
    for(let index=0;index<500;index++){const event=BusinessExternalEventInputSchema.parse({integrationId:"analytics",externalEventId:`metric-${index}`,type:"ANALYTICS_METRIC_OBSERVED",occurredAt:new Date(1_775_000_000_000+index*1000).toISOString(),objectiveId,metricId:"sessions",metricValue:index,metricUnit:"count"});const timestamp=String(Date.now());const signature=createHmac("sha256",secret).update(`${timestamp}.${ownerId}.${JSON.stringify(event)}`).digest("hex");await service.ingestBusinessWebhook({ownerId,body:event,signature,timestamp,secret,requestId:crypto.randomUUID(),ipAddress:"127.0.0.1"});}
    const dashboard=await service.businessDashboard(ownerId);expect(dashboard.events).toHaveLength(500);expect(dashboard.metrics).toHaveLength(500);expect(dashboard.attributions).toHaveLength(500);expect(dashboard.executions).toHaveLength(0);
  },20_000);
});
