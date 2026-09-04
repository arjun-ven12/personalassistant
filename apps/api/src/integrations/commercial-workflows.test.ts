import { describe,expect,it } from "vitest";
import { companyScope } from "../companies/scope.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { CommercialWorkflowCoordinator,COMMERCIAL_WORKFLOW_TEMPLATES } from "./commercial-workflows.js";
import { InMemoryIntegrationStore } from "./store.js";

const scope=(ownerId:string,companyId:string)=>({ownerId,companyId,role:"OWNER" as const,requestId:crypto.randomUUID()});
const audit:GovernanceAuditWriter=()=>{};

describe("Phase 26.2B bounded commercial workflows",()=>{
  it("defines finite refund, AR, inventory, and campaign templates with governed capabilities",()=>{
    expect(Object.keys(COMMERCIAL_WORKFLOW_TEMPLATES)).toEqual(["REFUND","ACCOUNTS_RECEIVABLE","INVENTORY","CAMPAIGN_OPTIMIZATION"]);
    expect(COMMERCIAL_WORKFLOW_TEMPLATES.REFUND.map((stage)=>stage.key)).toEqual(expect.arrayContaining(["POLICY_AND_AGGREGATE","WAIT_APPROVAL","DISPATCH","RECONCILE"]));
    expect(COMMERCIAL_WORKFLOW_TEMPLATES.ACCOUNTS_RECEIVABLE.at(-2)).toMatchObject({key:"SCHEDULE_FOLLOW_UP",guard:"bounded_attempts_and_due_date"});
    expect(COMMERCIAL_WORKFLOW_TEMPLATES.INVENTORY.at(-1)).toMatchObject({key:"RECONCILE",guard:"verify_non_negative_provider_state"});
    expect(COMMERCIAL_WORKFLOW_TEMPLATES.CAMPAIGN_OPTIMIZATION).toEqual(expect.arrayContaining([expect.objectContaining({key:"VERIFY_REPORTING_WINDOW"}),expect.objectContaining({key:"POLICY_LIMITS_COOLDOWN"})]));
  });

  it("deduplicates triggers and resumes from durable CAS state after coordinator restart",async()=>{
    const ownerId=crypto.randomUUID(),companyId=crypto.randomUUID(),store=new InMemoryIntegrationStore(),first=new CommercialWorkflowCoordinator(store,audit,()=>new Date("2026-09-04T10:00:00.000Z"));
    await companyScope.run(scope(ownerId,companyId),async()=>{
      const started=await first.start({ownerId,companyId,template:"REFUND",triggerKey:"refund-event-42",sourceRefs:["payment-42"]});
      const duplicate=await first.start({ownerId,companyId,template:"REFUND",triggerKey:"refund-event-42",sourceRefs:["payment-42"]});expect(duplicate.id).toBe(started.id);
      const advanced=await first.transition({ownerId,companyId,template:"REFUND",triggerKey:"refund-event-42",expectedStep:0,expectedStatus:"PLANNED",outcome:"ADVANCE",evidenceRef:"provider:payment-42"});expect(advanced.step).toBe(1);
      const restarted=new CommercialWorkflowCoordinator(store,audit,()=>new Date("2026-09-04T10:01:00.000Z"));const resumed=await restarted.find(ownerId,companyId,"REFUND","refund-event-42");expect(resumed).toMatchObject({id:started.id,step:1,status:"PLANNED"});
      const stale=await restarted.transition({ownerId,companyId,template:"REFUND",triggerKey:"refund-event-42",expectedStep:0,expectedStatus:"PLANNED",outcome:"ADVANCE",evidenceRef:"stale-worker"});expect(stale.step).toBe(1);
    });
  });

  it("fails closed when a sibling company attempts to load a workflow",async()=>{
    const ownerId=crypto.randomUUID(),companyId=crypto.randomUUID(),siblingId=crypto.randomUUID(),coordinator=new CommercialWorkflowCoordinator(new InMemoryIntegrationStore(),audit);
    await companyScope.run(scope(ownerId,companyId),()=>coordinator.start({ownerId,companyId,template:"INVENTORY",triggerKey:"stock-1",sourceRefs:["sku-1"]}));
    await expect(companyScope.run(scope(ownerId,siblingId),()=>coordinator.find(ownerId,companyId,"INVENTORY","stock-1"))).rejects.toMatchObject({code:"COMMERCIAL_WORKFLOW_SCOPE_DENIED"});
  });
});
