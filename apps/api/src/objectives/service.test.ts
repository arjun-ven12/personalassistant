import type { WorkforceRuntimeTask } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";
import type { CapabilityStudioService } from "../capability-studio/service.js";
import type { CrossApplicationWorkflowService } from "../cross-application-workflows/service.js";
import { InMemoryExecutiveStore } from "../executive/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { WorkforceRuntimeService } from "../workforce-runtime/service.js";
import { ObjectiveEngineService } from "./service.js";

const ownerId="11111111-1111-4111-8111-111111111111";
const request={ownerId,requestId:"request-1",ipAddress:"127.0.0.1"};
const farDeadline="2026-10-01T00:00:00.000Z";
type RuntimeTask=Record<string,unknown>&{id:string;ownerId:string;status:string;actualCost:number;assignedAgentId:string|null;selection:Array<{agentId:string;estimatedCost:number;estimatedDurationMs:number}>;inputs:Record<string,unknown>;priority:string;economicBudget:number;reservedCredits:number};
type WorkflowComposeResult={graphs:Array<{id:string}>;nodes:Array<{errorCode?:string;semanticCapabilityId?:string;applicationId?:string}>};

const objectiveBody=(title="Launch client portal",priority:"LOW"|"NORMAL"|"HIGH"|"URGENT"="NORMAL")=>({
  title,outcome:`Deliver and verify ${title.toLowerCase()} for ten approved pilot customers.`,deadline:farDeadline,
  budgetCredits:90,priority,organizationId:"alexa-workforce",constraints:["No external effect without approval"],
  metrics:[{name:"Pilot customers",unit:"count",target:10,direction:"HIGHER_IS_BETTER" as const}],
});

const reusableWorkflows=()=>{
  let composed=0;
  const templateId="22222222-2222-4222-8222-222222222222";
  const priorGraphId="33333333-3333-4333-8333-333333333333";
  const dashboard=vi.fn(()=>Promise.resolve({
    templates:[{id:templateId,name:"Verified delivery workflow",description:"Define launch requirements, deliver approved work, and verify customer outcomes.",capabilityIds:["workspace.read"]}],
    graphs:[{id:priorGraphId,templateId,status:"completed",failureCode:null}],metrics:[{graphId:priorGraphId,successRate:.9,durationMs:30_000}],
  }));
  const compose=vi.fn(():Promise<WorkflowComposeResult>=>{composed+=1;return Promise.resolve({graphs:[{id:`44444444-4444-4444-8444-${String(composed).padStart(12,"0")}`}],nodes:[]});});
  return {templateId,dashboard,compose};
};

const harness=(options:{withWorkflows?:boolean;capabilityGap?:boolean}={})=>{
  const store=new InMemoryExecutiveStore(); const tasks:RuntimeTask[]=[];
  const createTask=vi.fn(({body}:{body:Record<string,unknown>})=>{const priority=typeof body.priority==="string"?body.priority:"NORMAL";const task={...body,id:crypto.randomUUID(),ownerId,status:"QUEUED",actualCost:0,assignedAgentId:null,selection:[],inputs:body.inputs as Record<string,unknown>,priority,economicBudget:Number(body.economicBudget ?? 0),reservedCredits:0} as RuntimeTask;tasks.push(task);return Promise.resolve({task});});
  const schedule=vi.fn((_ownerId:string,taskId:string)=>{const task=tasks.find((item)=>item.id===taskId);if(task)task.status="RUNNING";return Promise.resolve({task});});
  const dashboard=vi.fn(()=>Promise.resolve({summary:{registered:112},tasks}));
  const cancel=vi.fn((_ownerId:string,taskId:string)=>{const task=tasks.find((item)=>item.id===taskId);if(task){task.status="CANCELLED";task.reservedCredits=0;}return Promise.resolve({tasks});});
  const updateObjectiveBounds=vi.fn((_ownerId:string,taskId:string,patch:Record<string,unknown>)=>{const task=tasks.find((item)=>item.id===taskId);if(task){Object.assign(task,patch);if(patch.objectiveConstraints)task.inputs={...task.inputs,objectiveConstraints:patch.objectiveConstraints};}return Promise.resolve({task});});
  const workforce={createTask,schedule,dashboard,cancel,updateObjectiveBounds} as unknown as WorkforceRuntimeService;
  const audit=vi.fn(()=>Promise.resolve()) as unknown as GovernanceAuditWriter; const library=options.withWorkflows?reusableWorkflows():undefined;
  if(library&&options.capabilityGap)library.compose.mockImplementationOnce(()=>Promise.resolve({graphs:[{id:"55555555-5555-4555-8555-555555555555"}],nodes:[{errorCode:"CAPABILITY_NOT_DECLARED",semanticCapabilityId:"email.send",applicationId:"chatgpt"}]}));
  const createRequest=vi.fn(({body}:{body:{applicationId:string;requestedIntent:string}})=>Promise.resolve({requests:[{id:"66666666-6666-4666-8666-666666666666",applicationId:body.applicationId,requestedIntent:body.requestedIntent}]}));
  const service=new ObjectiveEngineService(store,workforce,audit,()=>new Date("2026-08-26T10:00:00.000Z"),library?({dashboard:library.dashboard,compose:library.compose} as unknown as Pick<CrossApplicationWorkflowService,"dashboard"|"compose">):undefined,{createRequest} as unknown as Pick<CapabilityStudioService,"createRequest">);
  return {store,tasks,createTask,schedule,cancel,updateObjectiveBounds,audit,workforce,library,createRequest,service};
};

describe("ObjectiveEngineService",()=>{
  it("asks for bounded clarification instead of guessing a vague objective",async()=>{
    const {service,store}=harness(); const result=await service.create({...request,body:{title:"Growth",outcome:"grow business",deadline:null,budgetCredits:100,priority:"NORMAL",organizationId:null,constraints:[],metrics:[]}});
    expect(result.objective).toBeNull();expect(result.clarificationQuestions).toHaveLength(3);expect(store.listGoals(ownerId)).toHaveLength(0);
  });

  it("creates a conserved strategy and persists structured workflow-reuse scoring",async()=>{
    const {service,store,library}=harness({withWorkflows:true});const result=await service.create({...request,body:objectiveBody()});
    expect(result.objective?.status).toBe("AWAITING_CONFIRMATION");expect(result.projects.reduce((sum,item)=>sum+item.budgetCredits,0)).toBe(90);
    expect(result.projects.every((item)=>item.requiredCapabilities.length===0&&item.memoryScopeRefs.length===0)).toBe(true);
    expect(result.projects.every((item)=>item.selectedWorkflowTemplateId===library?.templateId)).toBe(true);
    expect(result.projects[0]?.workflowSelection[0]).toMatchObject({reuseType:"EXISTING_PROVEN",historicalSuccess:.9,workforceFit:1});expect(store.listPlans(ownerId)[0]?.version).toBe(1);
  });

  it("maps required capabilities and bounded AI estimates into an outreach strategy before activation",async()=>{
    const {service}=harness();
    const result=await service.create({...request,body:objectiveBody("Research leads and draft outreach")});
    expect(result.projects[0]).toMatchObject({requiredCapabilities:["crm.search_leads","crm.read_lead"],estimatedAiCostCredits:12,capabilityReadiness:[{capabilityId:"crm.search_leads",status:"REQUEST_REQUIRED"},{capabilityId:"crm.read_lead",status:"REQUEST_REQUIRED"}]});
    expect(result.projects[1]).toMatchObject({requiredCapabilities:["email.create_draft"],estimatedAiCostCredits:9,capabilityReadiness:[{capabilityId:"email.create_draft",status:"REQUEST_REQUIRED"}]});
  });

  it("activates idempotently through reusable workflows and the workforce scheduler without authority expansion",async()=>{
    const {service,createTask,schedule,library}=harness({withWorkflows:true});const draft=await service.create({...request,body:objectiveBody("Publish verified report")});const id=draft.objective!.id;
    await service.activate({...request,objectiveId:id,idempotencyKey:"activate-objective-1"});await service.activate({...request,objectiveId:id,idempotencyKey:"activate-objective-1"});
    expect(library?.compose).toHaveBeenCalledTimes(3);expect(createTask).toHaveBeenCalledTimes(3);expect(schedule).toHaveBeenCalledTimes(1);
    for(const call of createTask.mock.calls){const body=call[0].body as {requiredCapabilities:string[];memoryScopeRefs:string[];economicBudget:number};expect(body.requiredCapabilities).toEqual([]);expect(body.memoryScopeRefs).toEqual([]);expect(body.economicBudget).toBe(30);}
  });

  it("updates progress from task lifecycle events without polling or cross-objective leakage",async()=>{
    const {service,store,tasks}=harness();const first=await service.create({...request,body:objectiveBody("First launch")});const second=await service.create({...request,body:objectiveBody("Second launch")});
    await service.activate({...request,objectiveId:first.objective!.id,idempotencyKey:"activate-first"});await service.activate({...request,objectiveId:second.objective!.id,idempotencyKey:"activate-second"});
    const task=tasks.find((item)=>item.inputs.objectiveExecutionId===first.objective!.id)!;task.status="COMPLETED";task.actualCost=7;await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,first.objective!.id)?.executionProgress).toBe(33);expect(store.findObjectiveExecution(ownerId,first.objective!.id)?.spentCredits).toBe(7);expect(store.findObjectiveExecution(ownerId,second.objective!.id)?.executionProgress).toBe(0);
  });

  it("creates one evidence-based strategy version after bounded metric stagnation",async()=>{
    const {service,store}=harness();const draft=await service.create({...request,body:objectiveBody("Generate qualified leads")});await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-leads"});const kpi=store.listKpis(ownerId)[0]!;
    for(const value of [1,1.05,1.1,1.1])await service.observeMetric({...request,objectiveId:draft.objective!.id,body:{kpiId:kpi.id,value,source:"WORKFLOW"}});
    const plans=store.listPlans(ownerId).sort((a,b)=>a.version-b.version);expect(plans.map((item)=>item.version)).toEqual([1,2]);expect(store.findObjectiveExecution(ownerId,draft.objective!.id)?.lastReplanTrigger).toBe("METRIC_STAGNATION");expect(store.listObjectiveEvents(ownerId).filter((item)=>item.type==="REPLANNED")).toHaveLength(1);
  });

  it("links a real capability request to only the affected branch while other projects continue",async()=>{
    const {service,store,createRequest,createTask}=harness({withWorkflows:true,capabilityGap:true});const draft=await service.create({...request,body:objectiveBody("Launch outreach")});const result=await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-capability"});
    expect(createRequest).toHaveBeenCalledTimes(1);expect(createTask).toHaveBeenCalledTimes(2);const projects=result.projects.filter((item)=>item.objectiveExecutionId===draft.objective!.id);expect(projects.filter((item)=>item.status==="BLOCKED")).toHaveLength(1);expect(projects.filter((item)=>item.status==="QUEUED")).toHaveLength(2);
    expect(result.capabilityRequests[0]).toMatchObject({objectiveExecutionId:draft.objective!.id,requiredCapability:"email.send",status:"OPEN"});expect(store.listPlans(ownerId).map((item)=>item.version).sort()).toEqual([1,2]);
  });

  it("falls back to workforce matching when workflow reuse fails, preserving the specialist-resolution path",async()=>{
    const {service,createTask,library,store}=harness({withWorkflows:true});
    library?.compose.mockRejectedValueOnce(new Error("workflow service unavailable"));
    const draft=await service.create({...request,body:objectiveBody("Research outreach leads")});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-workflow-fallback"});
    expect(createTask).toHaveBeenCalledTimes(3);
    expect(store.listObjectiveProjects(ownerId).filter((item)=>item.objectiveExecutionId===draft.objective!.id).every((item)=>item.workforceTaskId!==null)).toBe(true);
    expect(store.findObjectiveExecution(ownerId,draft.objective!.id)?.lastReplanTrigger).toBe("WORKFLOW_FAILURE");
  });

  it("ignores ordinary workflow lifecycle events and replans only on workflow failure evidence",async()=>{
    const {service,store}=harness({withWorkflows:true});const draft=await service.create({...request,body:objectiveBody("Workflow recovery")});const active=await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-workflow-events"});const graphId=active.projects.find((item)=>item.objectiveExecutionId===draft.objective!.id)?.workflowId;if(!graphId)throw new Error("Missing workflow graph fixture");
    await service.handleWorkflowChanged(ownerId,graphId,"WORKFLOW_STARTED");expect(store.listPlans(ownerId).map((item)=>item.version)).toEqual([1]);
    await service.handleWorkflowChanged(ownerId,graphId,"NODE_FAILED");expect(store.listPlans(ownerId).map((item)=>item.version).sort()).toEqual([1,2]);expect(store.findObjectiveExecution(ownerId,draft.objective!.id)?.lastReplanTrigger).toBe("WORKFLOW_FAILURE");
  });

  it("propagates owner changes and rejects a budget below existing commitments",async()=>{
    const {service,tasks,updateObjectiveBounds}=harness();const draft=await service.create({...request,body:objectiveBody("Migrate customer data")});await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-modify"});
    const rejected=await service.modify({...request,objectiveId:draft.objective!.id,body:{idempotencyKey:"modify-budget",budgetCredits:40}});expect(rejected.status).toBe("REPLAN_REQUIRED");expect(rejected.rejectedFields).toEqual(["budgetCredits"]);
    const applied=await service.modify({...request,objectiveId:draft.objective!.id,body:{idempotencyKey:"modify-bounds",priority:"URGENT",deadline:"2026-09-15T00:00:00.000Z",constraints:["Keep all data local"]}});expect(applied.status).toBe("APPLIED");expect(updateObjectiveBounds).toHaveBeenCalledTimes(3);
    expect(tasks.every((task)=>task.priority==="urgent"&&task.expiresAt==="2026-09-15T00:00:00.000Z")).toBe(true);expect(tasks.every((task)=>(task.inputs.objectiveConstraints as string[])[0]==="Keep all data local")).toBe(true);
  });

  it("detects projected budget and deadline pressure and preserves owner constraints through replanning",async()=>{
    const {service,store,tasks}=harness();const body={...objectiveBody("Urgent product launch"),deadline:"2026-08-26T10:30:00.000Z",constraints:["No public launch"]};const draft=await service.create({...request,body});await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-risk"});
    for(const task of tasks){task.selection=[{agentId:"agent-1",estimatedCost:40,estimatedDurationMs:3_600_000}];task.assignedAgentId="agent-1";}await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    const objective=store.findObjectiveExecution(ownerId,draft.objective!.id);const goal=store.listGoals(ownerId)[0];expect(objective).toMatchObject({budgetStatus:"BUDGET_AT_RISK",deadlineStatus:"AT_RISK",status:"AT_RISK"});expect(objective?.lastReplanTrigger).toBe("BUDGET_AT_RISK");expect(goal?.constraints).toEqual(["No public launch"]);
  });

  it("raises deadline risk independently when bounded duration exceeds the remaining window",async()=>{
    const {service,store,tasks}=harness();const body={...objectiveBody("Deadline recovery"),deadline:"2026-08-26T10:30:00.000Z",budgetCredits:300};const draft=await service.create({...request,body});await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-deadline"});
    for(const task of tasks){task.selection=[{agentId:"agent-1",estimatedCost:10,estimatedDurationMs:3_600_000}];task.assignedAgentId="agent-1";}await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,draft.objective!.id)).toMatchObject({budgetStatus:"ON_TRACK",deadlineStatus:"AT_RISK",lastReplanTrigger:"DEADLINE_AT_RISK"});
  });

  it("cancels all child work once and releases queued runtime state",async()=>{
    const {service,tasks,cancel}=harness();const draft=await service.create({...request,body:objectiveBody("Cancel test")});await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-cancel"});await service.transition({...request,objectiveId:draft.objective!.id,action:"cancel",idempotencyKey:"cancel-objective"});await service.transition({...request,objectiveId:draft.objective!.id,action:"cancel",idempotencyKey:"cancel-objective"});
    expect(cancel).toHaveBeenCalledTimes(3);expect(tasks.every((item)=>item.status==="CANCELLED"&&item.reservedCredits===0)).toBe(true);
  });

  it("reconstructs activation idempotently after a service restart",async()=>{
    const base=harness();const draft=await base.service.create({...request,body:objectiveBody("Restart recovery")});await base.service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"restart-key"});const restarted=new ObjectiveEngineService(base.store,base.workforce,base.audit,()=>new Date("2026-08-26T10:00:00.000Z"));await restarted.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"restart-key"});expect(base.createTask).toHaveBeenCalledTimes(3);
  });

  it("scales five objectives across 15 projects and 15 workflow runs with dormant workforce metadata only",async()=>{
    const {service,tasks,library}=harness({withWorkflows:true});const objectiveIds:string[]=[];
    for(const [index,priority] of (["HIGH","NORMAL","NORMAL","LOW","LOW"] as const).entries()){const draft=await service.create({...request,body:objectiveBody(`Portfolio objective ${index+1}`,priority)});objectiveIds.push(draft.objective!.id);await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:`scale-activate-${index}`});}
    expect(tasks).toHaveLength(15);expect(library?.compose).toHaveBeenCalledTimes(15);expect(new Set(tasks.map((task)=>task.inputs.objectiveExecutionId))).toEqual(new Set(objectiveIds));expect(tasks.filter((task)=>task.priority==="high")).toHaveLength(3);for(const id of objectiveIds)expect(tasks.filter((task)=>task.inputs.objectiveExecutionId===id).reduce((sum,task)=>sum+task.economicBudget,0)).toBe(90);
  });
});
