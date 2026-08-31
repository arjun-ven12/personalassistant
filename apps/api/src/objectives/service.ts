import {
  CreateObjectiveRequestSchema,
  ExecutiveGoalSchema,
  ExecutiveKpiSchema,
  ExecutivePlanSchema,
  ModifyObjectiveRequestSchema,
  ObjectiveCapabilityLinkSchema,
  ObjectiveDashboardSchema,
  ObjectiveEventSchema,
  ObjectiveExecutionSchema,
  ObjectiveMetricObservationSchema,
  ObjectiveProjectSchema,
  ObserveObjectiveMetricRequestSchema,
  type ExecutiveGoal,
  type ObjectiveReplanTrigger,
  type ObjectiveExecution,
  type ObjectiveProject,
  type ObjectiveWorkflowScore,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";

import type { CapabilityStudioService } from "../capability-studio/service.js";
import type { CrossApplicationWorkflowService } from "../cross-application-workflows/service.js";
import { ExecutionError } from "../execution/errors.js";
import type { ExecutiveStore } from "../executive/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { WorkforceRuntimeService } from "../workforce-runtime/service.js";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"]);
const STAGNATION_MIN_OBSERVATIONS=3;
const STAGNATION_WINDOW_MS=7*24*60*60*1_000;
const STAGNATION_DELTA_RATIO=0.02;
type ObjectiveNotificationSink={dispatch(input:{ownerId:string;eventId:string;category:"OBJECTIVE_AT_RISK"|"OBJECTIVE_BLOCKED"|"BUDGET_WARNING"|"IMPORTANT_OBJECTIVE_COMPLETED"|"WORKFLOW_FAILED"|"WORKFLOW_BLOCKED";severity:"NORMAL"|"HIGH"|"CRITICAL";objectKind:"OBJECTIVE"|"WORKFLOW";objectId:string;stateVersion:string;title:string}):Promise<void>};

export class ObjectiveEngineService {
  #notificationSink?: ObjectiveNotificationSink;
  constructor(
    readonly store: ExecutiveStore,
    readonly workforce: WorkforceRuntimeService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly workflows?: Pick<CrossApplicationWorkflowService,"dashboard"|"compose">,
    readonly capabilityStudio?: Pick<CapabilityStudioService,"createRequest">,
  ) {}

  setNotificationSink(sink: ObjectiveNotificationSink) { this.#notificationSink=sink; }

  async dashboard(ownerId: string) {
    await this.refresh(ownerId);
    const [objectives, goals, projects, metrics, plans, events, capabilityRequests, observations] = await Promise.all([
      this.store.listObjectiveExecutions(ownerId), this.store.listGoals(ownerId),
      this.store.listObjectiveProjects(ownerId), this.store.listKpis(ownerId),
      this.store.listPlans(ownerId), this.store.listObjectiveEvents(ownerId),
      this.store.listObjectiveCapabilityLinks(ownerId), this.store.listObjectiveMetricObservations(ownerId),
    ]);
    return ObjectiveDashboardSchema.parse({
      summary: {
        total: objectives.length,
        active: objectives.filter((item) => item.status === "ACTIVE").length,
        atRisk: objectives.filter((item) => item.status === "AT_RISK").length,
        blocked: objectives.filter((item) => item.status === "BLOCKED").length,
        completed: objectives.filter((item) => item.status === "COMPLETED").length,
      },
      objectives: objectives.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), goals, projects, metrics, plans,
      events: events.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
      capabilityRequests, observations,
      invariants: { objectiveGrantsAuthority: false, creditsGrantAuthority: false, executionUsesWorkforceScheduler: true, planningUsesExecutiveBrain: true },
    });
  }

  async create(input: { ownerId: string; body: unknown; requestId: string; ipAddress: string }) {
    const body = CreateObjectiveRequestSchema.parse(input.body);
    const clarificationQuestions = this.clarifications(body.outcome, body.metrics.length, body.deadline);
    if (clarificationQuestions.length) return { objective: null, projects: [], clarificationQuestions };
    const at = this.now().toISOString();
    const goalId = crypto.randomUUID();
    const goal = ExecutiveGoalSchema.parse({
      id: goalId, ownerId: input.ownerId, title: body.title, description: body.outcome,
      status: "DRAFT", priority: body.priority, targetDate: body.deadline, startDate: null,
      successCriteria: body.metrics.map((item)=>`${item.name}: ${item.target} ${item.unit}`),
      linkedTaskIds: [], constraints: body.constraints, createdAt: at, updatedAt: at, completedAt: null,
    });
    const objective = ObjectiveExecutionSchema.parse({
      id: crypto.randomUUID(), ownerId: input.ownerId, executiveGoalId: goal.id,
      organizationId: body.organizationId, status: "AWAITING_CONFIRMATION", budgetCredits: body.budgetCredits,
      committedCredits: 0, spentCredits: 0, executionProgress: 0, outcomeProgress: 0,
      strategyVersion: 1, activationKey: null, blockers: [], createdAt: at, updatedAt: at,
      activatedAt: null, completedAt: null,
    });
    const projectSpecs = this.decompose(body.title, body.outcome, body.budgetCredits);
    const workflowSelections = await this.selectWorkflows(input.ownerId, projectSpecs);
    const capabilityReadiness = await this.capabilityReadiness(input.ownerId, projectSpecs.map((spec)=>spec.requiredCapabilities));
    const projects = projectSpecs.map((spec,index)=>ObjectiveProjectSchema.parse({
      id: crypto.randomUUID(), ownerId: input.ownerId, objectiveExecutionId: objective.id,
      title: spec.title, outcome: spec.outcome, status: "PLANNED", sequence: index,
      departmentId: spec.departmentId, requiredSkills: spec.requiredSkills,
      requiredCapabilities: spec.requiredCapabilities, capabilityReadiness: capabilityReadiness[index] ?? [],
      estimatedAiCostCredits: this.estimateAiCost(spec), memoryScopeRefs: [], budgetCredits: spec.budgetCredits,
      workforceTaskId: null, workflowId: null,
      selectedWorkflowTemplateId: workflowSelections[index]?.find((item)=>item.reuseType!=="NEW_CANDIDATE")?.templateId ?? null,
      workflowSelection: workflowSelections[index] ?? [], createdAt: at, updatedAt: at,
    }));
    const plan = ExecutivePlanSchema.parse({
      id: crypto.randomUUID(), ownerId: input.ownerId, goalId: goal.id, version: 1,
      previousVersionId: null, changeReason: null, changedAssumptions: [], tasksAdded: [], tasksRemoved: [], tasksMoved: [],
      deadlineChange: null, constraintChanges: [], expectedCompletionAt: body.deadline,
      expectedKpis: Object.fromEntries(body.metrics.map((item)=>[item.name,item.target])), horizon: body.deadline ? "CUSTOM" : "LONG_TERM",
      status: "ACTIVE", feasibility: "FEASIBLE", assumptions: ["Execution remains subject to policy, capabilities, approvals, and available economic budget."],
      milestones: projects.map((item)=>item.title), taskIds: [], priorityOrder: [], effortMinutes: projects.length*60,
      scheduleSuggestions: [], unscheduledTaskIds: [], risks: [], feasibilityReasons: [],
      checkpoints: ["Owner confirms strategy before activation", "External effects retain existing approval gates"],
      confidence: 0.7, feasible: true, feasibilityReason: "The bounded strategy fits the declared objective budget.", createdAt: at, updatedAt: at,
    });
    await this.store.saveGoal(goal);
    await this.store.saveObjectiveExecution(objective);
    for (const project of projects) await this.store.saveObjectiveProject(project);
    for (const metric of body.metrics) await this.store.saveKpi(ExecutiveKpiSchema.parse({
      id: crypto.randomUUID(), ownerId: input.ownerId, goalId: goal.id, name: metric.name, unit: metric.unit,
      target: metric.target, currentValue: 0, direction: metric.direction, period: "OBJECTIVE", source: "MANUAL", confidence: 1, updatedAt: at,
    }));
    await this.store.savePlan(plan);
    await this.event(input.ownerId, objective.id, "DRAFTED", "Objective draft and reviewable strategy created.", null, { planId: plan.id });
    await this.audit({ eventType:"OBJECTIVE_DRAFTED", ownerId:input.ownerId, outcome:"SUCCESS", reason:"Objective draft created without execution authority.", requestId:input.requestId, ipAddress:input.ipAddress, metadata:{ objectiveId:objective.id, goalId:goal.id } });
    return { objective, projects, clarificationQuestions: [] };
  }

  async activate(input:{ownerId:string;objectiveId:string;idempotencyKey:string;requestId:string;ipAddress:string}) {
    let objective = await this.requireObjective(input.ownerId,input.objectiveId);
    if (objective.activationKey === input.idempotencyKey) return this.dashboard(input.ownerId);
    if (!['AWAITING_CONFIRMATION','PAUSED','BLOCKED'].includes(objective.status)) throw new ExecutionError(409,"OBJECTIVE_NOT_ACTIVATABLE","Only confirmed, paused, or blocked objectives can be activated.");
    const projects=(await this.store.listObjectiveProjects(input.ownerId)).filter((item)=>item.objectiveExecutionId===objective.id).sort((a,b)=>a.sequence-b.sequence);
    const at=this.now().toISOString();
    const taskIds:string[]=[];
    let blocked=false;
    const goal=(await this.store.listGoals(input.ownerId)).find((item)=>item.id===objective.executiveGoalId);
    for (const [projectIndex, originalProject] of projects.entries()) {
      let project=originalProject;
      const predecessor=projects[projectIndex-1];
      const readyForScheduling=!predecessor||predecessor.status==="COMPLETED";
      if(!project.workflowId&&project.selectedWorkflowTemplateId&&this.workflows) {
        const prepared=await this.prepareWorkflow(input,objective,project);
        project=prepared.project;
        if(prepared.blocked) { blocked=true; continue; }
      }
      if (project.workforceTaskId) {
        taskIds.push(project.workforceTaskId);
        if(readyForScheduling&&(project.status==="WAITING"||project.status==="QUEUED")) {
          try { await this.workforce.schedule(input.ownerId,project.workforceTaskId,input.requestId,input.ipAddress); await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...project,status:"RUNNING",updatedAt:at})); }
          catch { blocked=true; }
        }
        continue;
      }
      const created=await this.workforce.createTask({ ownerId:input.ownerId, requestId:input.requestId, ipAddress:input.ipAddress, body:{
        idempotencyKey:`objective:${objective.id}:project:${project.id}`, createdByAgentId:null, assignedAgentId:null,
        type:"WORK", title:project.title, objective:project.outcome,
        inputs:{ objectiveExecutionId:objective.id, executiveGoalId:objective.executiveGoalId, projectId:project.id },
        evidenceRefs:[`objective:${objective.id}`], memoryScopeRefs:project.memoryScopeRefs,
        requiredSkills:project.requiredSkills, requiredCapabilities:project.requiredCapabilities,
        preferredDepartmentId:project.departmentId, priority:this.taskPriority(goal?.priority), riskLevel:"LOW",
        economicBudget:Math.max(1,project.budgetCredits), maxRetries:1, expiresAt:null,
      }});
      taskIds.push(created.task.id);
      let status:ObjectiveProject["status"]="QUEUED";
      if(readyForScheduling) {
        try { await this.workforce.schedule(input.ownerId,created.task.id,input.requestId,input.ipAddress); status="RUNNING"; }
        catch { status="WAITING"; blocked=true; }
      }
      await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...project,workforceTaskId:created.task.id,status,updatedAt:at}));
    }
    objective=await this.requireObjective(input.ownerId,input.objectiveId);
    objective=ObjectiveExecutionSchema.parse({...objective,status:blocked?"BLOCKED":"ACTIVE",activationKey:input.idempotencyKey,committedCredits:projects.reduce((sum,item)=>sum+item.budgetCredits,0),activatedAt:objective.activatedAt??at,updatedAt:at,blockers:blocked?["One or more projects are waiting for a capability or eligible funded specialist."]:[]});
    await this.store.saveObjectiveExecution(objective);
    if(goal) await this.store.saveGoal(ExecutiveGoalSchema.parse({...goal,status:blocked?"AT_RISK":"ACTIVE",startDate:goal.startDate??at,linkedTaskIds:[...new Set([...goal.linkedTaskIds,...taskIds])],updatedAt:at}));
    await this.event(input.ownerId,objective.id,"ACTIVATED",blocked?"Objective activated; projects are waiting for eligible specialists.":"Objective activated through the workforce scheduler.",input.idempotencyKey,{ tasks:taskIds.length });
    await this.audit({eventType:"OBJECTIVE_ACTIVATED",ownerId:input.ownerId,outcome:"SUCCESS",reason:"Confirmed objective dispatched through bounded workforce scheduling; no authority was granted.",requestId:input.requestId,ipAddress:input.ipAddress,metadata:{objectiveId:objective.id,taskCount:taskIds.length,blocked}});
    return this.dashboard(input.ownerId);
  }

  async transition(input:{ownerId:string;objectiveId:string;action:"pause"|"cancel"|"replan";idempotencyKey:string;requestId:string;ipAddress:string}) {
    const current=await this.requireObjective(input.ownerId,input.objectiveId);
    const duplicate=(await this.store.listObjectiveEvents(input.ownerId)).find((item)=>item.objectiveExecutionId===current.id&&item.idempotencyKey===input.idempotencyKey);
    if(duplicate) return this.dashboard(input.ownerId);
    const at=this.now().toISOString();
    let status:ObjectiveExecution["status"]=current.status;
    if(input.action==="pause") status="PAUSED";
    if(input.action==="cancel") status="CANCELLED";
    if(input.action==="pause"||input.action==="cancel") {
      const projects=(await this.store.listObjectiveProjects(input.ownerId)).filter((item)=>item.objectiveExecutionId===current.id);
      for(const project of projects) {
        if(project.workforceTaskId) {
          try { await this.workforce.cancel(input.ownerId,project.workforceTaskId,input.requestId,input.ipAddress); } catch { /* A terminal task needs no further cancellation. */ }
        }
        await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...project,status:input.action==="pause"?"PLANNED":"CANCELLED",workforceTaskId:input.action==="pause"?null:project.workforceTaskId,updatedAt:at}));
      }
    }
    if(input.action==="replan") {
      const plans=(await this.store.listPlans(input.ownerId)).filter((item)=>item.goalId===current.executiveGoalId).sort((a,b)=>b.version-a.version);
      const previous=plans[0];
      if(previous) {
        await this.store.savePlan(ExecutivePlanSchema.parse({...previous,status:"SUPERSEDED",updatedAt:at}));
        await this.store.savePlan(ExecutivePlanSchema.parse({...previous,id:crypto.randomUUID(),version:previous.version+1,previousVersionId:previous.id,changeReason:"Bounded owner-requested replan from current execution evidence.",status:"ACTIVE",createdAt:at,updatedAt:at}));
      }
      status=current.status==="BLOCKED"?"AT_RISK":current.status;
    }
    await this.store.saveObjectiveExecution(ObjectiveExecutionSchema.parse({...current,status,strategyVersion:input.action==="replan"?current.strategyVersion+1:current.strategyVersion,updatedAt:at,completedAt:input.action==="cancel"?at:current.completedAt}));
    await this.event(input.ownerId,current.id,input.action==="pause"?"PAUSED":input.action==="cancel"?"CANCELLED":"REPLANNED",`Objective ${input.action} recorded.`,input.idempotencyKey,{});
    await this.audit({eventType:input.action==="replan"?"OBJECTIVE_REPLANNED":"OBJECTIVE_STATE_CHANGED",ownerId:input.ownerId,outcome:"SUCCESS",reason:`Objective ${input.action} recorded without changing security authority.`,requestId:input.requestId,ipAddress:input.ipAddress,metadata:{objectiveId:current.id}});
    return this.dashboard(input.ownerId);
  }

  async modify(input:{ownerId:string;objectiveId:string;body:unknown;requestId:string;ipAddress:string}) {
    const body=ModifyObjectiveRequestSchema.parse(input.body); const current=await this.requireObjective(input.ownerId,input.objectiveId);
    const prior=(await this.store.listObjectiveEvents(input.ownerId)).find((item)=>item.objectiveExecutionId===current.id&&item.idempotencyKey===body.idempotencyKey);
    if(prior) return {status:"APPLIED" as const,appliedFields:[],rejectedFields:[],reasons:["The idempotent modification was already applied."],dashboard:await this.dashboard(input.ownerId)};
    const goal=(await this.store.listGoals(input.ownerId)).find((item)=>item.id===current.executiveGoalId);
    if(!goal) throw new ExecutionError(409,"OBJECTIVE_GOAL_MISSING","The canonical Executive goal is unavailable.");
    const appliedFields:string[]=[]; const rejectedFields:string[]=[]; const reasons:string[]=[]; const at=this.now().toISOString(); let next=current;
    if(body.budgetCredits!==undefined) {
      if(body.budgetCredits<current.committedCredits) { rejectedFields.push("budgetCredits"); reasons.push(`Budget cannot be reduced below ${current.committedCredits} committed credits.`); }
      else { next=ObjectiveExecutionSchema.parse({...next,budgetCredits:body.budgetCredits,updatedAt:at}); appliedFields.push("budgetCredits"); await this.redistributeDraftBudget(input.ownerId,next); }
    }
    const goalPatch:Partial<ExecutiveGoal>={};
    if(body.deadline!==undefined) { goalPatch.targetDate=body.deadline; appliedFields.push("deadline"); }
    if(body.priority!==undefined) { goalPatch.priority=body.priority; appliedFields.push("priority"); }
    if(body.constraints!==undefined) { goalPatch.constraints=body.constraints; appliedFields.push("constraints"); }
    if(Object.keys(goalPatch).length) await this.store.saveGoal(ExecutiveGoalSchema.parse({...goal,...goalPatch,updatedAt:at}));
    if(body.metrics!==undefined) {
      if(current.status==="COMPLETED") { rejectedFields.push("metrics"); reasons.push("Completed objective success metrics are immutable."); }
      else {
        const existingMetrics=(await this.store.listKpis(input.ownerId)).filter((item)=>item.goalId===goal.id);
        for(const metric of body.metrics) { const existing=existingMetrics.find((item)=>item.name.toLowerCase()===metric.name.toLowerCase()); await this.store.saveKpi(ExecutiveKpiSchema.parse({id:existing?.id??crypto.randomUUID(),ownerId:input.ownerId,goalId:goal.id,name:metric.name,unit:metric.unit,target:metric.target,currentValue:existing?.currentValue??0,direction:metric.direction,period:"OBJECTIVE",source:"MANUAL",confidence:1,updatedAt:at})); }
        await this.store.saveGoal(ExecutiveGoalSchema.parse({...goal,...goalPatch,successCriteria:body.metrics.map((item)=>`${item.name}: ${item.target} ${item.unit}`),updatedAt:at}));
        appliedFields.push("metrics");
      }
    }
    await this.store.saveObjectiveExecution(next);
    if(body.priority!==undefined||body.deadline!==undefined||body.constraints!==undefined) {
      const projects=(await this.store.listObjectiveProjects(input.ownerId)).filter((item)=>item.objectiveExecutionId===current.id&&item.workforceTaskId);
      const taskPatch:{priority?:"low"|"normal"|"high"|"urgent";expiresAt?:string|null;objectiveConstraints?:string[]}={};
      if(body.priority!==undefined) taskPatch.priority=this.taskPriority(body.priority);
      if(body.deadline!==undefined) taskPatch.expiresAt=body.deadline;
      if(body.constraints!==undefined) taskPatch.objectiveConstraints=body.constraints;
      for(const project of projects) await this.workforce.updateObjectiveBounds(input.ownerId,project.workforceTaskId!,taskPatch);
    }
    if(appliedFields.length) await this.event(input.ownerId,current.id,"MODIFIED","Owner-scoped objective constraints were updated.",body.idempotencyKey,{appliedFields,rejectedFields});
    const dashboard=await this.dashboard(input.ownerId);
    const status=rejectedFields.length?(appliedFields.length?"PARTIALLY_APPLIED":"REPLAN_REQUIRED"):"APPLIED";
    await this.audit({eventType:"OBJECTIVE_STATE_CHANGED",ownerId:input.ownerId,outcome:status==="REPLAN_REQUIRED"?"DENIED":"SUCCESS",reason:reasons[0]??"Owner objective modification applied with bounded propagation.",requestId:input.requestId,ipAddress:input.ipAddress,metadata:{objectiveId:current.id,status}});
    return {status,appliedFields,rejectedFields,reasons,dashboard};
  }

  async observeMetric(input:{ownerId:string;objectiveId:string;body:unknown;requestId:string;ipAddress:string}) {
    const body=ObserveObjectiveMetricRequestSchema.parse(input.body); const objective=await this.requireObjective(input.ownerId,input.objectiveId);
    const metric=(await this.store.listKpis(input.ownerId)).find((item)=>item.id===body.kpiId&&item.goalId===objective.executiveGoalId);
    if(!metric) throw new ExecutionError(404,"OBJECTIVE_METRIC_NOT_FOUND","The metric is not linked to this objective.");
    const at=this.now().toISOString(); await this.store.saveKpi(ExecutiveKpiSchema.parse({...metric,currentValue:body.value,source:body.source==="OWNER"?"MANUAL":body.source==="WORKFLOW"?"WORKFLOW":"CALCULATED",updatedAt:at}));
    await this.store.saveObjectiveMetricObservation(ObjectiveMetricObservationSchema.parse({id:crypto.randomUUID(),ownerId:input.ownerId,objectiveExecutionId:objective.id,kpiId:metric.id,value:body.value,observedAt:at,source:body.source}));
    await this.refreshObjective(input.ownerId,objective.id);
    return this.dashboard(input.ownerId);
  }

  async handleWorkforceTaskChanged(task:WorkforceRuntimeTask) {
    const project=(await this.store.listObjectiveProjects(task.ownerId)).find((item)=>item.workforceTaskId===task.id||item.id===task.inputs.projectId);
    if(!project) return;
    await this.refreshObjective(task.ownerId,project.objectiveExecutionId);
    if(task.status==="COMPLETED") await this.scheduleNextProject(task.ownerId,project.objectiveExecutionId,task.id);
  }

  async handleWorkflowChanged(ownerId:string,graphId:string,eventType:string) {
    if (["WORKFLOW_FAILED","NODE_FAILED","WORKFLOW_BLOCKED"].includes(eventType)) await this.#notificationSink?.dispatch({ownerId,eventId:`workflow:${graphId}:${eventType}`,category:eventType.includes("FAILED")?"WORKFLOW_FAILED":"WORKFLOW_BLOCKED",severity:"HIGH",objectKind:"WORKFLOW",objectId:graphId,stateVersion:eventType,title:eventType.includes("FAILED")?"Workflow failed":"Workflow blocked"}).catch(()=>undefined);
    const project=(await this.store.listObjectiveProjects(ownerId)).find((item)=>item.workflowId===graphId);
    if(!project) return;
    const failed=eventType==="WORKFLOW_FAILED"||eventType==="NODE_FAILED";
    await this.refreshObjective(ownerId,project.objectiveExecutionId,failed?"WORKFLOW_FAILURE":undefined);
  }

  async proposeExperimentReplan(input:{ownerId:string;objectiveId:string;experimentId:string;winnerVariantId:string;evidence:Record<string,unknown>}) {
    const objective=await this.requireObjective(input.ownerId,input.objectiveId);
    if(["COMPLETED","FAILED","CANCELLED"].includes(objective.status))return;
    await this.event(input.ownerId,objective.id,"REPLAN_PROPOSED","Verified experiment evidence supports a reviewable strategy update.",null,{experimentId:input.experimentId,winnerVariantId:input.winnerVariantId,evidence:input.evidence});
  }

  private async refresh(ownerId:string) {
    const objectives=await this.store.listObjectiveExecutions(ownerId);
    for(const objective of objectives.filter((item)=>["ACTIVE","AT_RISK","BLOCKED"].includes(item.status))) await this.refreshObjective(ownerId,objective.id);
  }

  private async scheduleNextProject(ownerId:string,objectiveId:string,completedTaskId:string) {
    const projects=(await this.store.listObjectiveProjects(ownerId)).filter((item)=>item.objectiveExecutionId===objectiveId).sort((left,right)=>left.sequence-right.sequence);
    const completedIndex=projects.findIndex((item)=>item.workforceTaskId===completedTaskId);
    const next=completedIndex>=0?projects[completedIndex+1]:undefined;
    if(!next?.workforceTaskId||!["QUEUED","WAITING"].includes(next.status)) return;
    try {
      await this.workforce.schedule(ownerId,next.workforceTaskId,`objective-next:${objectiveId}:${next.id}`,"internal");
      await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...next,status:"RUNNING",updatedAt:this.now().toISOString()}));
    } catch {
      await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...next,status:"WAITING",updatedAt:this.now().toISOString()}));
    }
    await this.refreshObjective(ownerId,objectiveId);
  }

  private async refreshObjective(ownerId:string,objectiveId:string,forcedTrigger?:ObjectiveReplanTrigger) {
      const [objective,allProjects,runtime,metrics,links,observations,goals]=await Promise.all([this.requireObjective(ownerId,objectiveId),this.store.listObjectiveProjects(ownerId),this.workforce.dashboard(ownerId),this.store.listKpis(ownerId),this.store.listObjectiveCapabilityLinks(ownerId),this.store.listObjectiveMetricObservations(ownerId),this.store.listGoals(ownerId)]);
      if(!["ACTIVE","AT_RISK","BLOCKED"].includes(objective.status)) return;
      const owned=allProjects.filter((item)=>item.objectiveExecutionId===objective.id); if(!owned.length) return;
      const tasks=new Map(runtime.tasks.map((item)=>[item.id,item])); const at=this.now().toISOString();
      let completed=0; let spent=0; let failed=false; let waiting=owned.some((item)=>item.status==="BLOCKED"||item.status==="WAITING");
      let projectedCost=0; let remainingDurationMs=0;
      for(const project of owned) { const task=project.workforceTaskId?tasks.get(project.workforceTaskId):undefined; if(!task) continue;
        const status:ObjectiveProject["status"]=task.status==="COMPLETED"?"COMPLETED":task.status==="FAILED"?"FAILED":["ASSIGNED","RESERVED","RUNNING","REVIEW_REQUIRED"].includes(task.status)?"RUNNING":TERMINAL.has(task.status)?"CANCELLED":task.status==="WAITING"?"WAITING":"QUEUED";
        if(status!==project.status) await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...project,status,updatedAt:at}));
        const selected=task.selection.find((item)=>item.agentId===task.assignedAgentId)??task.selection[0];
        completed+=status==="COMPLETED"?1:0; spent+=task.actualCost; failed ||= status==="FAILED"; waiting ||= status==="WAITING";
        if(status!=="COMPLETED"&&status!=="CANCELLED") { projectedCost+=selected?.estimatedCost??project.budgetCredits; remainingDurationMs+=selected?.estimatedDurationMs??60*60*1_000; }
      }
      projectedCost+=spent;
      const executionProgress=Math.round(completed/owned.length*100);
      const kpis=metrics.filter((item)=>item.goalId===objective.executiveGoalId);
      const outcomeProgress=kpis.length?Math.round(kpis.reduce((sum,item)=>sum+this.metricProgress(item),0)/kpis.length*100):0;
      const goal=goals.find((item)=>item.id===objective.executiveGoalId);
      const deadlineStatus=this.deadlineStatus(goal?.targetDate??null,remainingDurationMs,owned.length-completed);
      const budgetStatus=spent>=objective.budgetCredits?"EXHAUSTED" as const:projectedCost>objective.budgetCredits?"BUDGET_AT_RISK" as const:"ON_TRACK" as const;
      const capabilityBlocked=links.some((item)=>item.objectiveExecutionId===objective.id&&item.status==="OPEN");
      const stagnating=this.metricStagnating(kpis,observations.filter((item)=>item.objectiveExecutionId===objective.id));
      const trigger=forcedTrigger??(capabilityBlocked?"CAPABILITY_BLOCK":budgetStatus==="BUDGET_AT_RISK"?"BUDGET_AT_RISK":deadlineStatus==="AT_RISK"||deadlineStatus==="OVERDUE"?"DEADLINE_AT_RISK":stagnating?"METRIC_STAGNATION":failed?"MAJOR_PROJECT_FAILURE":undefined);
      if(trigger&&objective.lastReplanTrigger!==trigger) await this.automaticReplan(ownerId,objective,trigger,{failedProjects:owned.filter((item)=>item.status==="FAILED").map((item)=>item.id),projectedCost,deadlineStatus,metricObservationCount:observations.length});
      const effectiveObjective=trigger&&objective.lastReplanTrigger!==trigger?await this.requireObjective(ownerId,objective.id):objective;
      const blockers=[...(capabilityBlocked?["A required capability request is unresolved."]:[]),...(waiting?["A project is waiting for an eligible specialist or economic reservation."]:[]),...(failed?["A delegated project failed and requires bounded recovery."]:[])];
      const riskReasons=[...(budgetStatus!=="ON_TRACK"?[`Projected cost ${projectedCost} exceeds or exhausts the ${objective.budgetCredits}-credit budget.`]:[]),...(deadlineStatus!=="ON_TRACK"?[deadlineStatus==="OVERDUE"?"The objective deadline is overdue.":"Current bounded duration estimates put the deadline at risk."]:[]),...(stagnating?["The success metric has not moved meaningfully across the configured observation window."]:[])];
      const status:ObjectiveExecution["status"]=completed===owned.length&&outcomeProgress>=100?"COMPLETED":capabilityBlocked||waiting?"BLOCKED":failed||riskReasons.length?"AT_RISK":"ACTIVE";
      const updated=ObjectiveExecutionSchema.parse({...effectiveObjective,status,executionProgress,outcomeProgress,spentCredits:spent,projectedCost,budgetStatus,deadlineStatus,riskReasons,updatedAt:at,completedAt:status==="COMPLETED"?at:null,blockers,lastReplanTrigger:trigger??effectiveObjective.lastReplanTrigger});
      await this.store.saveObjectiveExecution(updated);
      if(status!==objective.status||executionProgress!==objective.executionProgress||outcomeProgress!==objective.outcomeProgress) await this.event(ownerId,objective.id,"MONITORED","Objective state updated from bounded lifecycle evidence.",null,{status,executionProgress,outcomeProgress,budgetStatus,deadlineStatus});
  }

  private async prepareWorkflow(input:{ownerId:string;requestId:string;ipAddress:string},objective:ObjectiveExecution,project:ObjectiveProject) {
    if(!this.workflows||!project.selectedWorkflowTemplateId) return {project,blocked:false};
    try {
      const detail=await this.workflows.compose({ownerId:input.ownerId,requestId:input.requestId,ipAddress:input.ipAddress,body:{goal:project.outcome,templateId:project.selectedWorkflowTemplateId,variables:{objectiveExecutionId:objective.id,projectId:project.id},origin:"planner"}});
      const graph=detail.graphs[0]; if(!graph) return {project,blocked:false};
      let blocked=false;
      for(const node of detail.nodes.filter((item)=>item.errorCode==="CAPABILITY_NOT_DECLARED"&&item.semanticCapabilityId&&item.applicationId)) {
        blocked=true; await this.createCapabilityLink(input,objective,project,graph.id,node.semanticCapabilityId!,node.applicationId!);
      }
      const updated=ObjectiveProjectSchema.parse({...project,workflowId:graph.id,status:blocked?"BLOCKED":project.status,updatedAt:this.now().toISOString()});
      await this.store.saveObjectiveProject(updated); return {project:updated,blocked};
    } catch {
      await this.automaticReplan(input.ownerId,objective,"WORKFLOW_FAILURE",{projectId:project.id,templateId:project.selectedWorkflowTemplateId});
      // Workflow reuse is optional. Keep the project bounded and let workforce matching
      // determine whether an existing or newly approved specialist can perform it.
      const updated=ObjectiveProjectSchema.parse({...project,status:"QUEUED",updatedAt:this.now().toISOString()}); await this.store.saveObjectiveProject(updated); return {project:updated,blocked:false};
    }
  }

  private async createCapabilityLink(input:{ownerId:string;requestId:string;ipAddress:string},objective:ObjectiveExecution,project:ObjectiveProject,workflowId:string,requiredCapability:string,applicationId:string) {
    const existing=(await this.store.listObjectiveCapabilityLinks(input.ownerId)).find((item)=>item.objectiveExecutionId===objective.id&&item.projectId===project.id&&item.requiredCapability===requiredCapability&&item.status==="OPEN");
    if(existing||!this.capabilityStudio) return;
    const dashboard=await this.capabilityStudio.createRequest({ownerId:input.ownerId,requestId:input.requestId,ipAddress:input.ipAddress,body:{applicationId,requestedIntent:`Provide ${requiredCapability}`,desiredOutcome:project.outcome,contextSummary:`Objective project: ${project.title}`,requestedBy:"OWNER",requestingAgentId:null}});
    const request=dashboard.requests.find((item)=>item.applicationId===applicationId&&item.requestedIntent===`Provide ${requiredCapability}`);
    if(!request) throw new ExecutionError(409,"CAPABILITY_REQUEST_NOT_CREATED","Capability Studio did not persist the bounded request.");
    await this.store.saveObjectiveCapabilityLink(ObjectiveCapabilityLinkSchema.parse({id:crypto.randomUUID(),ownerId:input.ownerId,objectiveExecutionId:objective.id,projectId:project.id,workflowId,taskId:project.workforceTaskId,requiredCapability,capabilityRequestId:request.id,status:"OPEN",createdAt:this.now().toISOString(),updatedAt:this.now().toISOString()}));
  }

  private async automaticReplan(ownerId:string,objective:ObjectiveExecution,trigger:ObjectiveReplanTrigger,evidence:Record<string,unknown>) {
    const plans=(await this.store.listPlans(ownerId)).filter((item)=>item.goalId===objective.executiveGoalId).sort((a,b)=>b.version-a.version); const previous=plans[0]; if(!previous) return;
    const prior=(await this.store.listObjectiveEvents(ownerId)).find((item)=>item.objectiveExecutionId===objective.id&&item.type==="REPLANNED"&&item.metadata.trigger===trigger);
    if(prior) return;
    const recovery=this.replanRecovery(trigger); const at=this.now().toISOString(); await this.store.savePlan(ExecutivePlanSchema.parse({...previous,status:"SUPERSEDED",updatedAt:at}));
    const next=ExecutivePlanSchema.parse({...previous,id:crypto.randomUUID(),version:previous.version+1,previousVersionId:previous.id,changeReason:`Automatic bounded ${recovery.scope.toLowerCase()} replan: ${trigger}.`,changedAssumptions:[...previous.changedAssumptions,`Evidence trigger: ${trigger}.`,`Recovery options: ${recovery.options.join(", ")}.`].slice(-30),status:"ACTIVE",createdAt:at,updatedAt:at});
    await this.store.savePlan(next); await this.store.saveObjectiveExecution(ObjectiveExecutionSchema.parse({...objective,strategyVersion:next.version,lastReplanTrigger:trigger,updatedAt:at}));
    await this.event(ownerId,objective.id,"REPLANNED",`Strategy version ${next.version} created from bounded evidence.`, `auto-replan:${objective.id}:${trigger}`,{trigger,evidence,recoveryScope:recovery.scope,recoveryOptions:recovery.options,previousPlanId:previous.id,planId:next.id,ownerConstraintsChanged:false,authorityChanged:false});
  }

  private async redistributeDraftBudget(ownerId:string,objective:ObjectiveExecution) {
    if(objective.committedCredits>0) return;
    const projects=(await this.store.listObjectiveProjects(ownerId)).filter((item)=>item.objectiveExecutionId===objective.id).sort((a,b)=>a.sequence-b.sequence); if(!projects.length) return;
    const base=Math.floor(objective.budgetCredits/projects.length); const remainder=objective.budgetCredits-base*projects.length; const at=this.now().toISOString();
    for(const [index,project] of projects.entries()) await this.store.saveObjectiveProject(ObjectiveProjectSchema.parse({...project,budgetCredits:base+(index===projects.length-1?remainder:0),updatedAt:at}));
  }

  private async selectWorkflows(ownerId:string,projects:Array<{title:string;outcome:string;budgetCredits:number}>) {
    if(!this.workflows) return projects.map(()=>[] as ObjectiveWorkflowScore[]);
    const [library,runtime]=await Promise.all([this.workflows.dashboard(ownerId),this.workforce.dashboard(ownerId)]);
    return projects.map((project)=>library.templates.map((template)=>{
      const text=`${template.name} ${template.description}`.toLowerCase(); const query=`${project.title} ${project.outcome}`.toLowerCase();
      const queryTokens=new Set(query.split(/[^a-z0-9]+/).filter((token)=>token.length>3)); const matches=[...queryTokens].filter((token)=>text.includes(token)).length;
      const objectiveFit=Math.min(1,matches/Math.max(1,Math.min(6,queryTokens.size)));
      const graphs=library.graphs.filter((item)=>item.templateId===template.id); const graphIds=new Set(graphs.map((item)=>item.id)); const history=library.metrics.filter((item)=>graphIds.has(item.graphId));
      const historicalSuccess=history.length?history.reduce((sum,item)=>sum+item.successRate,0)/history.length:0.5;
      const capabilityFit=graphs.some((item)=>item.failureCode==="CAPABILITY_GAP")?0.4:graphs.length?1:0.7;
      const workforceFit=runtime.summary.registered>0?1:0; const costScore=Math.max(0,1-template.capabilityIds.length/20);
      const duration=history.length?history.reduce((sum,item)=>sum+item.durationMs,0)/history.length:template.capabilityIds.length*1_500;
      const durationScore=Math.max(0,1-duration/(60*60*1_000)); const totalScore=Math.round((objectiveFit*.35+historicalSuccess*.2+capabilityFit*.2+workforceFit*.1+costScore*.08+durationScore*.07)*1_000)/1_000;
      const reuseType:ObjectiveWorkflowScore["reuseType"]=history.length&&historicalSuccess>=.7?"EXISTING_PROVEN":objectiveFit>=.4?"ADAPTED_EXISTING":objectiveFit>=.15?"COMPOSED_COMPONENTS":"NEW_CANDIDATE";
      return {templateId:template.id,name:template.name,reuseType,objectiveFit,historicalSuccess,capabilityFit,workforceFit,costScore,durationScore,totalScore,reasons:[`${matches} objective terms matched.`,`${history.length} historical executions informed scoring.`,`${template.capabilityIds.length} declared capabilities.`]};
    }).sort((a,b)=>b.totalScore-a.totalScore||a.name.localeCompare(b.name)).slice(0,10));
  }

  private deadlineStatus(deadline:string|null,remainingDurationMs:number,remainingProjects:number):"ON_TRACK"|"AT_RISK"|"OVERDUE" {
    if(!deadline) return "ON_TRACK"; const remaining=Date.parse(deadline)-this.now().getTime(); if(remaining<=0) return "OVERDUE";
    const boundedEstimate=remainingProjects?remainingDurationMs/Math.max(1,Math.min(6,remainingProjects)):0; return boundedEstimate>remaining*.8?"AT_RISK":"ON_TRACK";
  }

  private metricStagnating(metrics:Array<{id:string;target:number}>,observations:Array<{kpiId:string;value:number;observedAt:string}>) {
    const cutoff=this.now().getTime()-STAGNATION_WINDOW_MS;
    return metrics.some((metric)=>{const values=observations.filter((item)=>item.kpiId===metric.id&&Date.parse(item.observedAt)>=cutoff).sort((a,b)=>a.observedAt.localeCompare(b.observedAt)).slice(-STAGNATION_MIN_OBSERVATIONS); if(values.length<STAGNATION_MIN_OBSERVATIONS) return false; const numbers=values.map((item)=>item.value); return Math.max(...numbers)-Math.min(...numbers)<=Math.max(.01,Math.abs(metric.target)*STAGNATION_DELTA_RATIO);});
  }

  private taskPriority(priority:ExecutiveGoal["priority"]|undefined):"low"|"normal"|"high"|"urgent" {
    if(priority==="LOW") return "low"; if(priority==="HIGH") return "high"; if(priority==="URGENT") return "urgent"; return "normal";
  }
  private replanRecovery(trigger:ObjectiveReplanTrigger) {
    if(trigger==="WORKFLOW_FAILURE") return {scope:"WORKFLOW",options:["alternate_workflow","revise_workflow","owner_escalation"]};
    if(trigger==="MAJOR_PROJECT_FAILURE") return {scope:"PROJECT",options:["retry_task","alternate_agent","project_replan"]};
    if(trigger==="CAPABILITY_BLOCK") return {scope:"PROJECT",options:["capability_request","continue_unaffected_branches"]};
    if(trigger==="BUDGET_AT_RISK") return {scope:"OBJECTIVE",options:["cheaper_workflow","cheaper_agent_policy","pause_optional_branch","request_owner_allocation"]};
    if(trigger==="DEADLINE_AT_RISK") return {scope:"OBJECTIVE",options:["safe_parallelism","faster_eligible_agent","workflow_change","owner_escalation"]};
    if(trigger==="METRIC_STAGNATION") return {scope:"OBJECTIVE",options:["revise_strategy","review_success_metric"]};
    return {scope:"OBJECTIVE",options:["recalculate_commitments","owner_review"]};
  }

  private clarifications(outcome:string,metricCount:number,deadline:string|null) {
    const questions:string[]=[]; const normalized=outcome.trim().toLowerCase();
    if(outcome.trim().length<20||["grow business","make money","improve things","do better"].includes(normalized)) questions.push("What specific, observable outcome should Alexa optimize for?");
    if(metricCount===0) questions.push("What measurable result will determine whether this objective succeeded?");
    if(!deadline) questions.push("What deadline or review horizon should constrain the plan?");
    return questions;
  }
  private metricProgress(metric:{currentValue:number;target:number;direction:"HIGHER_IS_BETTER"|"LOWER_IS_BETTER"|"TARGET_RANGE"|"BINARY"}) {
    if(metric.direction==="BINARY") return metric.currentValue===metric.target?1:0;
    if(metric.direction==="LOWER_IS_BETTER") {
      if(metric.currentValue<=metric.target) return 1;
      return Math.max(0,Math.min(1,metric.target===0?1/(1+metric.currentValue):metric.target/metric.currentValue));
    }
    if(metric.direction==="TARGET_RANGE") return metric.currentValue===metric.target?1:Math.max(0,1-Math.abs(metric.currentValue-metric.target)/Math.max(1,Math.abs(metric.target)));
    return metric.target===0?(metric.currentValue>=0?1:0):Math.max(0,Math.min(1,metric.currentValue/metric.target));
  }
  private decompose(title:string,outcome:string,budget:number) {
    const count=Math.min(3,budget); const base=Math.floor(budget/count); const remainder=budget-base*count;
    const lower=`${title} ${outcome}`.toLowerCase();
    const outreach=lower.includes("lead")||lower.includes("prospect")||lower.includes("outreach")||lower.includes("campaign");
    return [
      {title:`Define ${title}`,outcome:`Establish bounded requirements, evidence, and constraints for: ${outcome}`,departmentId:"research",requiredSkills:["analysis"],requiredCapabilities:outreach?["crm.search_leads","crm.read_lead"]:[]},
      {title:`Deliver ${title}`,outcome:`Produce the reviewed deliverable needed to achieve: ${outcome}`,departmentId:"development",requiredSkills:["planning"],requiredCapabilities:outreach?["email.create_draft"]:[]},
      {title:`Verify ${title}`,outcome:`Verify the deliverable against the declared success metric and constraints.`,departmentId:"quality-review",requiredSkills:["review"],requiredCapabilities:[]},
    ].slice(0,count).map((item,index)=>({...item,budgetCredits:base+(index===count-1?remainder:0)}));
  }
  private async capabilityReadiness(ownerId:string, requirements:string[][]) {
    const agentStore=this.workforce.agentStore;
    const agentFactory=this.workforce.agentFactory;
    const [agents, factoryCapabilities]=await Promise.all([
      agentStore?.listAgents(ownerId)??Promise.resolve([]),
      agentFactory?.capabilities(ownerId)??Promise.resolve([]),
    ]);
    const available=new Set([...agents.flatMap((agent)=>agent.capabilities),...factoryCapabilities.map((capability)=>capability.id)]);
    return requirements.map((capabilities)=>capabilities.map((capability)=>({capabilityId:capability,status:available.has(capability)?"AVAILABLE" as const:"REQUEST_REQUIRED" as const})));
  }
  private estimateAiCost(spec:{requiredSkills:string[];requiredCapabilities:string[];budgetCredits:number}) {
    return Math.max(1,Math.min(spec.budgetCredits,4+spec.requiredSkills.length*2+spec.requiredCapabilities.length*3));
  }
  private async requireObjective(ownerId:string,id:string) { const value=await this.store.findObjectiveExecution(ownerId,id); if(!value) throw new ExecutionError(404,"OBJECTIVE_NOT_FOUND","Objective was not found."); return value; }
  private async event(ownerId:string,objectiveExecutionId:string,type:"DRAFTED"|"PLAN_CREATED"|"ACTIVATED"|"PAUSED"|"RESUMED"|"PROGRESS_UPDATED"|"MONITORED"|"MODIFIED"|"REPLAN_PROPOSED"|"REPLANNED"|"BLOCKED"|"COMPLETED"|"CANCELLED",summary:string,idempotencyKey:string|null,metadata:Record<string,unknown>) { const event=ObjectiveEventSchema.parse({id:crypto.randomUUID(),ownerId,objectiveExecutionId,type,summary,idempotencyKey,metadata,createdAt:this.now().toISOString()}); await this.store.saveObjectiveEvent(event); const status=typeof metadata.status==="string"?metadata.status:type; const budgetStatus=typeof metadata.budgetStatus==="string"?metadata.budgetStatus:null; if(status==="AT_RISK"||status==="BLOCKED"||status==="COMPLETED"||budgetStatus==="BUDGET_AT_RISK") await this.#notificationSink?.dispatch({ownerId,eventId:event.id,category:budgetStatus==="BUDGET_AT_RISK"?"BUDGET_WARNING":status==="BLOCKED"?"OBJECTIVE_BLOCKED":status==="COMPLETED"?"IMPORTANT_OBJECTIVE_COMPLETED":"OBJECTIVE_AT_RISK",severity:status==="BLOCKED"?"CRITICAL":status==="COMPLETED"?"NORMAL":"HIGH",objectKind:"OBJECTIVE",objectId:objectiveExecutionId,stateVersion:`${status}:${budgetStatus??""}`,title:budgetStatus==="BUDGET_AT_RISK"?"Objective budget needs attention":status==="BLOCKED"?"Objective blocked":status==="COMPLETED"?"Objective completed":"Objective at risk"}).catch(()=>undefined); }
}
