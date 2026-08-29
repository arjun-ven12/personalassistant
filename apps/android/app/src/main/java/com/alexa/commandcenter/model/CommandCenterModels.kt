package com.alexa.commandcenter.model

import com.google.gson.annotations.SerializedName

data class ObjectiveDashboard(
  val summary: ObjectiveSummary = ObjectiveSummary(),
  val objectives: List<Objective> = emptyList(),
  val goals: List<Goal> = emptyList(),
  val projects: List<ObjectiveProject> = emptyList(),
  val metrics: List<ObjectiveMetric> = emptyList(),
  val events: List<ObjectiveEvent> = emptyList(),
  val capabilityRequests: List<CapabilityRequest> = emptyList(),
)

data class ObjectiveSummary(
  val total: Int = 0,
  val active: Int = 0,
  val atRisk: Int = 0,
  val blocked: Int = 0,
  val completed: Int = 0,
)

data class Objective(
  val id: String,
  val executiveGoalId: String,
  val status: String,
  val budgetCredits: Int,
  val committedCredits: Int,
  val spentCredits: Int,
  val executionProgress: Double,
  val outcomeProgress: Double,
  val strategyVersion: Int,
  val blockers: List<String> = emptyList(),
  val riskReasons: List<String> = emptyList(),
  val deadlineStatus: String = "ON_TRACK",
  val budgetStatus: String = "ON_TRACK",
  val projectedCost: Int = 0,
  val lastReplanTrigger: String? = null,
  val updatedAt: String,
)

data class Goal(
  val id: String,
  val title: String,
  val description: String = "",
  val status: String,
  val priority: String,
  val targetDate: String? = null,
  val successCriteria: List<String> = emptyList(),
)

data class ObjectiveProject(
  val id: String,
  val objectiveExecutionId: String,
  val title: String,
  val outcome: String,
  val status: String,
  val workflowId: String? = null,
  val departmentId: String? = null,
)

data class ObjectiveMetric(
  val id: String,
  val goalId: String? = null,
  val name: String,
  val unit: String,
  val target: Double,
  val currentValue: Double,
  val confidence: Double = 0.0,
)

data class ObjectiveEvent(
  val id: String,
  val objectiveExecutionId: String,
  val type: String,
  val summary: String,
  val createdAt: String,
)

data class CapabilityRequest(
  val id: String,
  val objectiveExecutionId: String,
  val requiredCapability: String,
  val status: String,
  val createdAt: String,
)

data class WorkforceGraph(
  val organization: Organization? = null,
  val departments: List<Department> = emptyList(),
  val nodes: List<WorkforceNode> = emptyList(),
  val edges: List<WorkforceEdge> = emptyList(),
  val summary: WorkforceSummary = WorkforceSummary(),
)

data class Organization(val id: String, val name: String)
data class Department(val id: String, val name: String, val description: String = "")
data class WorkforceNode(
  val id: String,
  val kind: String,
  val label: String,
  val subtitle: String,
  val parentId: String? = null,
  val departmentId: String? = null,
  val status: String,
  val reputation: Double? = null,
  val credits: Int? = null,
  val childCount: Int = 0,
)
data class WorkforceEdge(val id: String, val source: String, val target: String, val type: String)
data class WorkforceSummary(
  val registered: Int = 0,
  val active: Int = 0,
  val dormant: Int = 0,
  val suspended: Int = 0,
  val departments: Int = 0,
  val aggregateCredits: Int = 0,
  val averageReputation: Double = 0.0,
)

data class WorkforceAgentDetail(
  val agent: WorkforceAgent,
  val department: Department? = null,
  val manager: WorkforceAgent? = null,
  val children: List<WorkforceAgent> = emptyList(),
  val economy: EconomyAccount? = null,
  val performance: EconomyPerformance? = null,
  val tasks: List<AgentTask> = emptyList(),
  val events: List<WorkforceEvent> = emptyList(),
)
data class WorkforceAgent(
  val id: String, val displayName: String, val role: String? = null, val status: String? = null, val healthSummary: String? = null,
  val capabilities: List<String> = emptyList(),
  val workforce: AgentWorkforce? = null,
)
data class AgentWorkforce(
  val specialization: String? = null,
  val skills: List<String> = emptyList(),
  val memoryScopeId: String? = null,
  val modelPolicyId: String? = null,
  val activationPolicyId: String? = null,
)
data class AgentTask(val id: String, val title: String, val status: String, val resultSummary: String? = null)
data class WorkforceEvent(val id: String, val type: String, val summary: String, val createdAt: String)

data class Approval(
  val id: String,
  val toolName: String,
  val riskLevel: String,
  val approvalRequirement: String,
  val status: String,
  val humanSummary: String,
  val requestedAt: String,
  val expiresAt: String,
)

data class EconomyDashboard(
  val overview: EconomyOverview = EconomyOverview(),
  val accounts: List<EconomyAccount> = emptyList(),
  val performance: List<EconomyPerformance> = emptyList(),
  val ledger: List<EconomyLedgerEntry> = emptyList(),
)
data class EconomyLedgerEntry(val id: String, val agentId: String, val type: String, val amount: Int, val reasonCode: String, val createdAt: String)
data class EconomyOverview(
  val allocatedCredits: Int = 0, val availableCredits: Int = 0, val reservedCredits: Int = 0,
  val spentCredits: Int = 0, val economyEnabledAgents: Int = 0, val activeAgents: Int = 0,
  val dormantAgents: Int = 0, val averageReputation: Double = 0.0, val settledTasks: Int = 0,
)
data class EconomyAccount(
  val agentId: String, val availableCredits: Int, val reservedCredits: Int, val lifetimeEarned: Int,
  val lifetimeSpent: Int, val reputation: Double, val economyStatus: String, val departmentId: String? = null,
)
data class EconomyPerformance(
  val agentId: String, val tasksAttempted: Int, val tasksCompleted: Int, val calibration: Double,
  val costEfficiency: Double, val totalActualCost: Int,
)

data class Workflow(
  val id: String, val goal: String, val status: String, val createdAt: String,
  val updatedAt: String, val currentTaskId: String? = null, val planSummary: String = "", val riskLevel: String = "unknown", val failureCode: String? = null,
)
data class WorkflowDetail(val workflow: Workflow, val tasks: List<WorkflowTask> = emptyList(), val events: List<WorkflowEvent> = emptyList(), val progress: WorkflowProgress = WorkflowProgress())
data class WorkflowTask(val id: String, val title: String, val status: String, val goal: String = "", val failureCode: String? = null)
data class WorkflowEvent(val id: String, val eventType: String, val message: String, val createdAt: String)
data class WorkflowProgress(val totalTasks: Int = 0, val completedTasks: Int = 0, val runningTasks: Int = 0, val blockedTasks: Int = 0, val waitingApprovalTasks: Int = 0, val percentComplete: Double = 0.0)

data class ExperimentDashboard(val experiments: List<Experiment> = emptyList(), val variants: List<ExperimentVariant> = emptyList(), val results: List<ExperimentResult> = emptyList(), val summary: ExperimentSummary = ExperimentSummary())
data class Experiment(val id: String, val objectiveId: String, val title: String, val hypothesis: String, val status: String, val primaryMetric: ExperimentMetric, val explorationBudget: Int, val spentCredits: Int, val startedAt: String? = null, val endedAt: String? = null)
data class ExperimentMetric(val name: String, val direction: String)
data class ExperimentVariant(val id: String, val experimentId: String, val name: String, val status: String, val verdict: String? = null, val actualMetric: Double? = null)
data class ExperimentResult(val id: String, val experimentId: String, val verdict: String, val confidence: Double, val explanation: String, val totalCost: Int)
data class ExperimentSummary(val running: Int = 0, val paused: Int = 0, val completed: Int = 0, val budgetAllocated: Int = 0, val budgetSpent: Int = 0)

data class CommandCenterSnapshot(
  val objectives: ObjectiveDashboard? = null,
  val workforce: WorkforceGraph? = null,
  val approvals: List<Approval> = emptyList(),
  val economy: EconomyDashboard? = null,
  val workflows: List<Workflow> = emptyList(),
  val attention: ExecutiveAttention = ExecutiveAttention(),
)

data class CreateObjectiveRequest(
  val title: String,
  val outcome: String,
  val deadline: String? = null,
  val budgetCredits: Int = 100,
  val priority: String = "NORMAL",
  val constraints: List<String> = emptyList(),
)

data class ObjectiveMutationRequest(val idempotencyKey: String)
data class ModifyObjectiveRequest(
  val idempotencyKey: String,
  val budgetCredits: Int? = null,
  val priority: String? = null,
)
data class ApprovalDecisionRequest(val reason: String? = null)
