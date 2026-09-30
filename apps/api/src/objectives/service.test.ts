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
type RuntimeTask=Record<string,unknown>&{id:string;ownerId:string;status:string;actualCost:number;assignedAgentId:string|null;selection:Array<{agentId:string;estimatedCost:number;estimatedDurationMs:number}>;inputs:Record<string,unknown>;evidenceRefs:string[];verifiedLeads?:Array<{companyName:string;website:string;description:string;outreachReason:string;sourceUrls:string[]}>;priority:string;economicBudget:number;reservedCredits:number};
const markExecuted=(task:RuntimeTask)=>{
  task.status="COMPLETED";
  task.completionProvenance={completionType:"EXECUTED",agentSessionId:"50000000-0000-4000-8000-000000000001",modelRequestId:"60000000-0000-4000-8000-000000000001",evidenceRefs:[],artifactRefs:[],recordedAt:"2026-08-26T10:00:00.000Z"};
};
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
  const createTask=vi.fn(({body}:{body:Record<string,unknown>})=>{const priority=typeof body.priority==="string"?body.priority:"NORMAL";const task={...body,id:crypto.randomUUID(),ownerId,status:"QUEUED",actualCost:0,assignedAgentId:null,selection:[],inputs:body.inputs as Record<string,unknown>,evidenceRefs:Array.isArray(body.evidenceRefs)?body.evidenceRefs.filter((item):item is string=>typeof item==="string"):[],priority,economicBudget:Number(body.economicBudget ?? 0),reservedCredits:0} as RuntimeTask;tasks.push(task);return Promise.resolve({task});});
  const schedule=vi.fn((_ownerId:string,taskId:string)=>{const task=tasks.find((item)=>item.id===taskId);if(task)task.status="RUNNING";return Promise.resolve({task});});
  const dispatch=vi.fn(async (_ownerId:string,taskId:string)=>schedule(_ownerId,taskId));
  const dashboard=vi.fn(()=>Promise.resolve({summary:{registered:112},tasks,activeExecutionTaskIds:tasks.filter((task)=>task.status==="RUNNING").map((task)=>task.id)}));
  const cancel=vi.fn((_ownerId:string,taskId:string)=>{const task=tasks.find((item)=>item.id===taskId);if(task){task.status="CANCELLED";task.reservedCredits=0;}return Promise.resolve({tasks});});
  const updateObjectiveBounds=vi.fn((_ownerId:string,taskId:string,patch:Record<string,unknown>)=>{const task=tasks.find((item)=>item.id===taskId);if(task){Object.assign(task,patch);if(patch.objectiveConstraints)task.inputs={...task.inputs,objectiveConstraints:patch.objectiveConstraints};}return Promise.resolve({task});});
  const attachDependencyEvidence=vi.fn((_ownerId:string,taskId:string,completedTask:RuntimeTask)=>{const task=tasks.find((item)=>item.id===taskId);if(task){task.evidenceRefs=[...new Set([...task.evidenceRefs,...completedTask.evidenceRefs])];task.inputs.previousTaskResults=[...((task.inputs.previousTaskResults as Array<{taskId:string}>|undefined)??[]),{taskId:completedTask.id}];}return Promise.resolve(task);});
  const workforce={createTask,schedule,dispatch,dashboard,cancel,updateObjectiveBounds,attachDependencyEvidence} as unknown as WorkforceRuntimeService;
  const audit=vi.fn(()=>Promise.resolve()) as unknown as GovernanceAuditWriter; const library=options.withWorkflows?reusableWorkflows():undefined;
  if(library&&options.capabilityGap)library.compose.mockImplementationOnce(()=>Promise.resolve({graphs:[{id:"55555555-5555-4555-8555-555555555555"}],nodes:[{errorCode:"CAPABILITY_NOT_DECLARED",semanticCapabilityId:"email.send",applicationId:"chatgpt"}]}));
  const createRequest=vi.fn(({body}:{body:{applicationId:string;requestedIntent:string}})=>Promise.resolve({requests:[{id:"66666666-6666-4666-8666-666666666666",applicationId:body.applicationId,requestedIntent:body.requestedIntent}]}));
  const service=new ObjectiveEngineService(store,workforce,audit,()=>new Date("2026-08-26T10:00:00.000Z"),library?({dashboard:library.dashboard,compose:library.compose} as unknown as Pick<CrossApplicationWorkflowService,"dashboard"|"compose">):undefined,{createRequest} as unknown as Pick<CapabilityStudioService,"createRequest">);
  return {store,tasks,createTask,schedule,cancel,updateObjectiveBounds,audit,workforce,library,createRequest,service};
};

describe("ObjectiveEngineService",()=>{
  it("keeps comparison scope and success criteria through evidence-gap replanning",async()=>{
    const {service,tasks}=harness();
    const outcome="Research 3 AI coding assistants, compare strengths and weaknesses, and recommend engineering tasks for each.";
    const draft=await service.create({...request,body:{...objectiveBody("Coding assistant comparison"),outcome,metrics:[{name:"Verified assistants",unit:"count",target:3,direction:"HIGHER_IS_BETTER" as const}]}});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"comparison"});
    for (const task of tasks.slice(0,3)) {
      expect(task.inputs.objectiveOutcome).toBe(outcome);
      expect(task.inputs.successCriteria).toEqual([expect.objectContaining({name:"Verified assistants",target:3})]);
      markExecuted(task);
      await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    }
    expect(tasks[3]?.objective).not.toContain("additional current AI companies");
    expect(tasks[3]?.inputs.objectiveOutcome).toBe(outcome);
    expect(tasks[4]?.inputs.successCriteria).toEqual([expect.objectContaining({target:3})]);
  });

  it("records owner observations separately from verified research counts",async()=>{
    const {service,store}=harness();
    const draft=await service.create({...request,body:{...objectiveBody("Research 5 AI companies"),outcome:"Research 5 AI companies and produce a sourced list of verified leads.",metrics:[{name:"Verified leads",unit:"count",target:5,direction:"HIGHER_IS_BETTER" as const}]}});
    const metric=store.listKpis(ownerId)[0]!;
    await service.observeMetric({...request,objectiveId:draft.objective!.id,body:{kpiId:metric.id,value:5,source:"OWNER"}});
    expect(store.listKpis(ownerId)[0]!.currentValue).toBe(0);
    expect(store.listObjectiveMetricObservations(ownerId)).toEqual([expect.objectContaining({value:5,source:"OWNER"})]);
  });

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
    const result=await service.create({...request,body:objectiveBody("Research leads and include a reason to contact")});
    expect(result.projects[0]).toMatchObject({requiredCapabilities:[],estimatedAiCostCredits:6,capabilityReadiness:[]});
    expect(result.projects[1]).toMatchObject({requiredCapabilities:["web.research"],estimatedAiCostCredits:11,capabilityReadiness:[{capabilityId:"web.research",status:"REQUEST_REQUIRED"}]});
  });

  it("does not infer email authority from a research-only outreach list or a negated draft instruction",async()=>{
    const {service}=harness();
    const result=await service.create({...request,body:{...objectiveBody("AI company outreach research"),outcome:"Research 5 current AI companies and create a sourced outreach list with a reason to contact each one. Do not send messages or create outreach drafts."}});
    expect(result.projects[1]?.requiredCapabilities).toEqual(["web.research"]);
  });

  it("does not count source URLs as verified leads without structured records",async()=>{
    const {service,store,tasks}=harness();
    const body={...objectiveBody("Research 5 AI companies"),outcome:"Research 5 AI companies and produce a sourced list of verified leads.",metrics:[{name:"Verified leads",unit:"count",target:5,direction:"HIGHER_IS_BETTER" as const}]};
    const draft=await service.create({...request,body});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-verified-leads"});
    const task=tasks[1]!;
    markExecuted(task);
    task.evidenceRefs=["https://example.test/one","https://example.test/two"];
    await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(0);
    task.verifiedLeads=[{companyName:"Example",website:"https://example.test",description:"AI company",outreachReason:"Relevant",sourceUrls:["https://example.test/one"]}];
    await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(1);
  });

  it("blocks a terminal task without execution provenance instead of unlocking dependent work",async()=>{
    const {service,store,tasks,workforce}=harness();
    const dispatch=vi.spyOn(workforce,"dispatch");
    const draft=await service.create({...request,body:objectiveBody("Autonomous execution provenance")});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-provenance-check"});
    const task=tasks[0]!;
    task.status="COMPLETED";
    task.resultSummary="I completed the work";
    await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,draft.objective!.id)).toMatchObject({status:"BLOCKED",executionProgress:0});
    expect(store.findObjectiveExecution(ownerId,draft.objective!.id)?.blockers[0]).toContain("no verified execution provenance");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(tasks[1]?.status).toBe("QUEUED");
  });

  it("counts two-source records only when the sources are independent HTTPS hosts",async()=>{
    const {service,store,tasks}=harness();
    const body={...objectiveBody("Research AI companies"),outcome:"Research current AI companies with at least two independent HTTPS source URLs per company.",metrics:[{name:"Verified company records with two independent HTTPS sources",unit:"count",target:2,direction:"HIGHER_IS_BETTER" as const}]};
    const draft=await service.create({...request,body});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-two-source-leads"});
    const task=tasks[1]!;
    markExecuted(task);
    task.verifiedLeads=[
      {companyName:"Single Source",website:"https://single.example",description:"AI company",outreachReason:"Relevant",sourceUrls:["https://single.example/about","https://www.single.example/news"]},
      {companyName:"Two Sources",website:"https://two.example",description:"AI company",outreachReason:"Relevant",sourceUrls:["https://two.example/about","https://independent.example/profile"]},
    ];
    await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(1);
  });

  it("offers partial two-source records for evidence completion instead of excluding them",async()=>{
    const {service,tasks}=harness();
    const body={...objectiveBody("Research AI companies"),outcome:"Research AI companies with two independent HTTPS sources each.",metrics:[{name:"Verified company records with two independent HTTPS sources",unit:"count",target:2,direction:"HIGHER_IS_BETTER" as const}]};
    const draft=await service.create({...request,body});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-partial-source-gap"});
    markExecuted(tasks[0]!);
    await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[1]!);
    tasks[1]!.verifiedLeads=[
      {companyName:"Complete",website:"https://complete.example",description:"AI company",outreachReason:"Relevant",sourceUrls:["https://complete.example/about","https://independent.example/profile"]},
      {companyName:"Partial",website:"https://partial.example",description:"AI company",outreachReason:"Relevant",sourceUrls:["https://partial.example/about"]},
    ];
    await service.handleWorkforceTaskChanged(tasks[1] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[2]!);
    await service.handleWorkforceTaskChanged(tasks[2] as unknown as WorkforceRuntimeTask);
    expect(tasks[3]?.objective).toContain("Already qualifying subjects: Complete");
    expect(tasks[3]?.objective).toContain("Partial subjects: Partial");
    expect(tasks[3]?.inputs.objectiveOutcome).toContain("Research");
    expect(tasks[3]?.inputs.successCriteria).toEqual([expect.objectContaining({target:2})]);
  });

  it.each([false,true])("closes a verified-lead shortfall with a bounded pair (failed review: %s)",async(failedReview)=>{
    const {service,store,tasks,createTask,workforce}=harness();
    const attachDependencyEvidence=vi.spyOn(workforce,"attachDependencyEvidence");
    const body={...objectiveBody("Research 5 AI companies"),outcome:"Research 5 AI companies and produce a sourced list of verified leads. Research only; do not send messages or drafts.",metrics:[{name:"Verified leads",unit:"count",target:5,direction:"HIGHER_IS_BETTER" as const}]};
    const draft=await service.create({...request,body});
    const objectiveId=draft.objective!.id;
    await service.activate({...request,objectiveId,idempotencyKey:"activate-evidence-gap"});
    const lead=(name:string)=>({companyName:name,website:`https://${name.toLowerCase()}.example`,description:"AI company",outreachReason:"Relevant",sourceUrls:[`https://${name.toLowerCase()}.example/source`]});
    markExecuted(tasks[0]!);
    await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[1]!);
    tasks[1]!.verifiedLeads=["Alpha","Beta","Gamma","Delta"].map(lead);
    await service.handleWorkforceTaskChanged(tasks[1] as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(4);
    markExecuted(tasks[2]!);
    if(failedReview) {
      tasks[2]!.status="FAILED";
      tasks[2]!.failureCode="OBJECTIVE_VERIFICATION_FAILED";
      tasks[2]!.failureMessage="Only four records qualify.";
    }
    await service.handleWorkforceTaskChanged(tasks[2] as unknown as WorkforceRuntimeTask);
    expect(createTask).toHaveBeenCalledTimes(5);
    expect(tasks[3]).toMatchObject({status:"RUNNING",requiredCapabilities:["web.research"]});
    expect(tasks[4]).toMatchObject({status:"QUEUED",requiredCapabilities:[]});
    expect(attachDependencyEvidence.mock.calls.map(([,taskId])=>taskId)).toContain(tasks[4]!.id);
    markExecuted(tasks[3]!);
    tasks[3]!.verifiedLeads=[lead("Epsilon")];
    await service.handleWorkforceTaskChanged(tasks[3] as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(5);
    expect(tasks[4]?.status).toBe("RUNNING");
    markExecuted(tasks[4]!);
    await service.handleWorkforceTaskChanged(tasks[4] as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,objectiveId)).toMatchObject({status:"COMPLETED",outcomeProgress:100});
    if(failedReview) {
      expect(tasks[2]!.status).toBe("FAILED");
      expect(tasks[4]!.inputs.replacesReviewTaskIds).toContain(tasks[2]!.id);
    }
  });

  it("replaces an executed review that imposed an unrequested comparison without repeating research",async()=>{
    const {service,store,tasks,createTask,workforce}=harness();
    const attachDependencyEvidence=vi.spyOn(workforce,"attachDependencyEvidence");
    const outcome="Research 5 AI companies and create a sourced outreach list with company name, website, activity, and relevance. Research only.";
    const draft=await service.create({...request,body:{...objectiveBody("AI company list"),outcome,metrics:[{name:"Verified leads",unit:"count",target:5,direction:"HIGHER_IS_BETTER" as const}]}});
    const objectiveId=draft.objective!.id;
    await service.activate({...request,objectiveId,idempotencyKey:"activate-review-scope"});
    const lead=(name:string)=>({companyName:name,website:`https://${name.toLowerCase()}.example`,description:"AI company",outreachReason:"Relevant",sourceUrls:[`https://${name.toLowerCase()}.example/source`]});
    markExecuted(tasks[0]!);await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[1]!);tasks[1]!.verifiedLeads=["Alpha","Beta","Gamma","Delta"].map(lead);
    await service.handleWorkforceTaskChanged(tasks[1] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[2]!);tasks[2]!.status="FAILED";tasks[2]!.failureCode="OBJECTIVE_VERIFICATION_FAILED";
    tasks[2]!.failureMessage="Only four records qualify.";
    await service.handleWorkforceTaskChanged(tasks[2] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[3]!);tasks[3]!.verifiedLeads=[lead("Epsilon")];
    await service.handleWorkforceTaskChanged(tasks[3] as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(5);
    const legacyReview=store.listObjectiveProjects(ownerId).find((item)=>item.workforceTaskId===tasks[4]!.id)!;
    store.saveObjectiveProject({...legacyReview,outcome:"Verify the combined source-backed records and deliverable satisfy the ORIGINAL objective, success criteria, and constraints supplied in context. Count alone is insufficient: requested comparisons and recommendations must be present. Fail verification if the subject drifted or required evidence/context is missing."});
    markExecuted(tasks[4]!);tasks[4]!.status="FAILED";tasks[4]!.failureCode="OBJECTIVE_VERIFICATION_FAILED";
    tasks[4]!.failureMessage="An explicit comparison and recommendation are missing.";
    await service.handleWorkforceTaskChanged(tasks[4] as unknown as WorkforceRuntimeTask);
    expect(createTask).toHaveBeenCalledTimes(6);
    expect(tasks[5]).toMatchObject({status:"RUNNING",requiredCapabilities:[],inputs:{objectiveOutcome:outcome,replacesReviewTaskIds:[tasks[4]!.id]}});
    expect(tasks[5]!.objective).toContain("Do not require an unrequested comparison");
    expect(attachDependencyEvidence.mock.calls.some(([,taskId,prior])=>taskId===tasks[5]!.id&&prior.id===tasks[3]!.id)).toBe(true);
    tasks[5]!.inputs.previousTaskResults=[{taskId:tasks[1]!.id}];
    markExecuted(tasks[5]!);tasks[5]!.status="FAILED";tasks[5]!.failureCode="OBJECTIVE_VERIFICATION_FAILED";
    tasks[5]!.failureMessage="Only four company records were supplied to the reviewer.";
    await service.handleWorkforceTaskChanged(tasks[5] as unknown as WorkforceRuntimeTask);
    expect(createTask).toHaveBeenCalledTimes(7);
    expect(tasks[6]).toMatchObject({status:"RUNNING",inputs:{replacesReviewTaskIds:[tasks[5]!.id]}});
    expect(attachDependencyEvidence.mock.calls.some(([,taskId,prior])=>taskId===tasks[6]!.id&&prior.id===tasks[3]!.id)).toBe(true);
    markExecuted(tasks[6]!);await service.handleWorkforceTaskChanged(tasks[6] as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,objectiveId)).toMatchObject({status:"COMPLETED",outcomeProgress:100});
    expect(tasks[2]!.status).toBe("FAILED");
    expect(tasks[4]!.status).toBe("FAILED");
    expect(tasks[5]!.status).toBe("FAILED");
  });

  it("activates idempotently through reusable workflows and the workforce scheduler without authority expansion",async()=>{
    const {service,createTask,schedule,library}=harness({withWorkflows:true});const draft=await service.create({...request,body:objectiveBody("Publish verified report")});const id=draft.objective!.id;
    await service.activate({...request,objectiveId:id,idempotencyKey:"activate-objective-1"});await service.activate({...request,objectiveId:id,idempotencyKey:"activate-objective-1"});
    expect(library?.compose).toHaveBeenCalledTimes(3);expect(createTask).toHaveBeenCalledTimes(3);expect(schedule).toHaveBeenCalledTimes(1);
    for(const call of createTask.mock.calls){const body=call[0].body as {requiredCapabilities:string[];memoryScopeRefs:string[];economicBudget:number};expect(body.requiredCapabilities).toEqual([]);expect(body.memoryScopeRefs).toEqual([]);expect(body.economicBudget).toBe(30);}
  });

  it("recognizes leased session preparation but not an unleased RUNNING label", async () => {
    const { service, tasks, workforce } = harness();
    const draft = await service.create({ ...request, body: objectiveBody("Prepare reviewed report") });
    const id = draft.objective!.id;
    await service.activate({ ...request, objectiveId: id, idempotencyKey: "lease-truth" });
    const first = tasks[0]!;
    first.status = "RESERVED";
    const runtimeDashboard = vi.spyOn(workforce, "dashboard").mockResolvedValue({ summary: { registered: 112 }, tasks, activeExecutionTaskIds: [first.id] } as unknown as Awaited<ReturnType<WorkforceRuntimeService["dashboard"]>>);
    expect((await service.dashboard(ownerId)).objectives.find((objective) => objective.id === id)?.status).toBe("ACTIVE");
    first.status = "RUNNING";
    runtimeDashboard.mockResolvedValue({ summary: { registered: 112 }, tasks, activeExecutionTaskIds: [] } as unknown as Awaited<ReturnType<WorkforceRuntimeService["dashboard"]>>);
    expect((await service.dashboard(ownerId)).objectives.find((objective) => objective.id === id)?.status).toBe("BLOCKED");
  });

  it("repairs a legacy review missing real retrieval context and recalculates assistant counts", async () => {
    const { service, tasks, store, createTask } = harness();
    const draft = await service.create({ ...request, body: { ...objectiveBody("Coding assistant research"), outcome: "Research 3 AI coding assistants and compare their engineering task fit using retrieved sources.", metrics: [{ name: "Verified assistants", unit: "count", target: 3, direction: "HIGHER_IS_BETTER" }] } });
    const id = draft.objective!.id;
    await service.activate({ ...request, objectiveId: id, idempotencyKey: "retrieval-context" });
    markExecuted(tasks[0]!);
    await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[1]!);
    tasks[1]!.verifiedLeads = ["Alpha", "Beta", "Gamma"].map((name) => ({ companyName: name, website: `https://${name.toLowerCase()}.example`, description: "Coding assistant strengths and weaknesses", outreachReason: "Engineering task recommendation", sourceUrls: [`https://${name.toLowerCase()}.example/source`] }));
    tasks[1]!.retrievedSourceEvidence = [{ sourceUrl: "https://alpha.example/source", retrievedAt: "2026-08-26T10:00:00.000Z", providerId: "openai", modelRequestId: "60000000-0000-4000-8000-000000000001", tool: "web.research" }];
    await service.handleWorkforceTaskChanged(tasks[1] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[2]!);
    tasks[2]!.status = "FAILED";
    tasks[2]!.failureCode = "OBJECTIVE_VERIFICATION_FAILED";
    tasks[2]!.failureMessage = "Retrieval provenance was not supplied.";
    await service.handleWorkforceTaskChanged(tasks[2] as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(3);
    expect(createTask).toHaveBeenCalledTimes(4);
    expect(tasks[3]).toMatchObject({ requiredCapabilities: [], requiredSkills: ["review"], inputs: { replacesReviewTaskIds: [tasks[2]!.id], objectiveExecutionId: id } });
    expect((await service.dashboard(ownerId)).objectives.find((objective) => objective.id === id)?.status).not.toBe("COMPLETED");
  });

  it("does not infer assistant downloads from researched assistant records", async () => {
    const { service, tasks, store } = harness();
    const draft = await service.create({ ...request, body: { ...objectiveBody("Assistant adoption research"), outcome: "Research AI coding assistants using retrieved sources.", metrics: [{ name: "Assistant downloads", unit: "count", target: 3, direction: "HIGHER_IS_BETTER" }] } });
    await service.activate({ ...request, objectiveId: draft.objective!.id, idempotencyKey: "assistant-download-metric" });
    markExecuted(tasks[0]!);
    await service.handleWorkforceTaskChanged(tasks[0] as unknown as WorkforceRuntimeTask);
    markExecuted(tasks[1]!);
    tasks[1]!.verifiedLeads = [{ companyName: "Alpha", website: "https://alpha.example", description: "Coding assistant", outreachReason: "Engineering fit", sourceUrls: ["https://alpha.example/source"] }];
    await service.handleWorkforceTaskChanged(tasks[1] as unknown as WorkforceRuntimeTask);
    expect(store.listKpis(ownerId)[0]?.currentValue).toBe(0);
  });

  it("updates progress from task lifecycle events without polling or cross-objective leakage",async()=>{
    const {service,store,tasks}=harness();const first=await service.create({...request,body:objectiveBody("First launch")});const second=await service.create({...request,body:objectiveBody("Second launch")});
    await service.activate({...request,objectiveId:first.objective!.id,idempotencyKey:"activate-first"});await service.activate({...request,objectiveId:second.objective!.id,idempotencyKey:"activate-second"});
    const task=tasks.find((item)=>item.inputs.objectiveExecutionId===first.objective!.id)!;markExecuted(task);task.actualCost=7;await service.handleWorkforceTaskChanged(task as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,first.objective!.id)?.executionProgress).toBe(33);expect(store.findObjectiveExecution(ownerId,first.objective!.id)?.spentCredits).toBe(7);expect(store.findObjectiveExecution(ownerId,second.objective!.id)?.executionProgress).toBe(0);
  });

  it("keeps an objective active when a later project is only queued behind an occupied specialist",async()=>{
    const {service,store,tasks}=harness();
    const draft=await service.create({...request,body:objectiveBody("Sequential specialist work")});
    await service.activate({...request,objectiveId:draft.objective!.id,idempotencyKey:"activate-sequential"});
    const queued=tasks[2]!;
    queued.status="WAITING";
    queued.selection=[{agentId:"agent-1",estimatedCost:10,estimatedDurationMs:60_000,rejectionReasons:["agent unavailable"]},{agentId:"agent-2",estimatedCost:10,estimatedDurationMs:60_000,rejectionReasons:["insufficient economic budget"]}] as unknown as typeof queued.selection;
    await service.handleWorkforceTaskChanged(queued as unknown as WorkforceRuntimeTask);
    expect(store.findObjectiveExecution(ownerId,draft.objective!.id)).toMatchObject({status:"ACTIVE",blockers:[]});
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
