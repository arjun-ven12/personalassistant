import type { ExecutiveDecision, ExecutiveGoal, ExecutiveKpi, ExecutiveObjective, ExecutivePlan, ExecutiveRisk, ExecutiveRecommendation } from "@alexa-control/shared";

export class ExecutiveContextComposer {
  compose(input: { goals: ExecutiveGoal[]; objectives: ExecutiveObjective[]; kpis: ExecutiveKpi[]; risks: ExecutiveRisk[]; decisions: ExecutiveDecision[]; plans: ExecutivePlan[]; recommendations: ExecutiveRecommendation[]; blockers: string[]; reflectionEvidence?: unknown }) {
    return {
      authority: "CONTEXT_ONLY" as const,
      goals: input.goals.filter((item)=>["ACTIVE","AT_RISK"].includes(item.status)).slice(0,10).map(({id,title,status,priority,targetDate,constraints})=>({id,title,status,priority,targetDate,constraints})),
      objectives: input.objectives.filter((item)=>["ACTIVE","AT_RISK"].includes(item.status)).slice(0,20).map(({id,goalId,title,status,targetDate,progress,confidence})=>({id,goalId,title,status,targetDate,progress,confidence})),
      kpis: input.kpis.slice(0,15).map(({id,goalId,name,unit,target,currentValue,direction,source,confidence,updatedAt})=>({id,goalId,name,unit,target,currentValue,direction,source,confidence,updatedAt})),
      risks: input.risks.filter((item)=>["OPEN","MONITORING","MATERIALIZED"].includes(item.status)).slice(0,15).map(({id,goalId,description,severity,status,source,confidence})=>({id,goalId,description,severity,status,source,confidence})),
      decisions: input.decisions.filter((item)=>item.status==="PROPOSED").slice(0,10).map(({id,question,recommendation,confidence,reversible})=>({id,question,recommendation,confidence,reversible})),
      plans: [...input.plans].sort((a,b)=>b.version-a.version).slice(0,5).map(({id,goalId,version,feasibility,effortMinutes,confidence})=>({id,goalId,version,feasibility,effortMinutes,confidence})),
      recommendations: input.recommendations.slice(0,10), blockers: input.blockers.slice(0,10),
      reflectionEvidence: input.reflectionEvidence ?? null,
    };
  }
}
