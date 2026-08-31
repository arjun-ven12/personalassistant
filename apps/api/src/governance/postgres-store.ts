import type {
  AllowedApplication,
  AllowedWorkspace,
  ApprovalStatus,
  ToolDefinition,
} from "@alexa-control/shared";
import type pg from "pg";

import { GovernanceError } from "./errors.js";
import type { GovernanceStore } from "./store.js";
import type {
  GovernanceSecurityState,
  StoredApprovalRequest,
  StoredPolicyEvaluation,
} from "./types.js";
import { companyScope } from "../companies/scope.js";

const one = <T>(row: { record: T } | undefined) =>
  row ? structuredClone(row.record) : undefined;

export class PostgresGovernanceStore implements GovernanceStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly builtInTools: ToolDefinition[],
  ) {}

  async initialise() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const tool of this.builtInTools) {
        await client.query(
          `INSERT INTO tool_registry(name,record,updated_at) VALUES ($1,$2,$3)
           ON CONFLICT(name) DO UPDATE SET record=excluded.record, updated_at=excluded.updated_at`,
          [tool.name, tool, new Date().toISOString()],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createApplication(application: AllowedApplication) {
    await this.pool.query(
      `INSERT INTO applications(id,owner_id,enabled,record,created_at,updated_at,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        application.id,
        application.ownerId,
        application.enabled,
        application,
        application.createdAt,
        application.updatedAt,
        companyScope.companyId(application.ownerId) ?? null,
      ],
    );
  }

  async findApplicationById(id: string) {
    const result = await this.pool.query<{ record: AllowedApplication }>(
      "SELECT record FROM applications WHERE id=$1 AND ($2::uuid IS NULL OR company_id=$2)",
      [id, companyScope.companyId() ?? null],
    );
    return one(result.rows[0]);
  }

  async listApplications(ownerId: string) {
    const result = await this.pool.query<{ record: AllowedApplication }>(
      "SELECT record FROM applications WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY created_at",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateApplication(application: AllowedApplication) {
    const result = await this.pool.query(
      `UPDATE applications SET enabled=$2,record=$3,updated_at=$4,version=version+1
       WHERE id=$1 AND owner_id=$5 AND ($6::uuid IS NULL OR company_id=$6)`,
      [
        application.id,
        application.enabled,
        application,
        application.updatedAt,
        application.ownerId,
        companyScope.companyId(application.ownerId) ?? null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Application does not exist.");
  }

  async createWorkspace(workspace: AllowedWorkspace) {
    await this.pool.query(
      `INSERT INTO workspaces(id,owner_id,enabled,record,created_at,updated_at,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        workspace.id,
        workspace.ownerId,
        workspace.enabled,
        workspace,
        workspace.createdAt,
        workspace.updatedAt,
        companyScope.companyId(workspace.ownerId) ?? null,
      ],
    );
  }

  async findWorkspaceById(id: string) {
    const result = await this.pool.query<{ record: AllowedWorkspace }>(
      "SELECT record FROM workspaces WHERE id=$1 AND ($2::uuid IS NULL OR company_id=$2)",
      [id, companyScope.companyId() ?? null],
    );
    return one(result.rows[0]);
  }

  async listWorkspaces(ownerId: string) {
    const result = await this.pool.query<{ record: AllowedWorkspace }>(
      "SELECT record FROM workspaces WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY created_at",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateWorkspace(workspace: AllowedWorkspace) {
    const result = await this.pool.query(
      `UPDATE workspaces SET enabled=$2,record=$3,updated_at=$4,version=version+1
       WHERE id=$1 AND owner_id=$5 AND ($6::uuid IS NULL OR company_id=$6)`,
      [
        workspace.id,
        workspace.enabled,
        workspace,
        workspace.updatedAt,
        workspace.ownerId,
        companyScope.companyId(workspace.ownerId) ?? null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Workspace does not exist.");
  }

  async listTools() {
    const result = await this.pool.query<{ record: ToolDefinition }>(
      "SELECT record FROM tool_registry ORDER BY name",
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async findToolByName(name: string) {
    const result = await this.pool.query<{ record: ToolDefinition }>(
      "SELECT record FROM tool_registry WHERE name=$1",
      [name],
    );
    return one(result.rows[0]);
  }

  async createApproval(approval: StoredApprovalRequest) {
    const result = await this.pool.query<{ record: StoredApprovalRequest }>(
      `INSERT INTO approval_requests(
        id,owner_id,company_id,action_digest,status,record,requested_at,expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(owner_id,company_id,action_digest) WHERE status='PENDING'
      DO UPDATE SET owner_id=excluded.owner_id
      RETURNING record`,
      [
        approval.id,
        approval.ownerId,
        approval.companyId,
        approval.actionDigest,
        approval.status,
        approval,
        approval.requestedAt,
        approval.expiresAt,
      ],
    );
    return structuredClone(result.rows[0]!.record);
  }

  async findApprovalById(id: string) {
    const activeCompanyId = companyScope.companyId();
    const result = await this.pool.query<{ record: StoredApprovalRequest }>(
      `SELECT record FROM approval_requests
       WHERE id=$1 AND ($2::uuid IS NULL OR company_id=$2)`,
      [id, activeCompanyId ?? null],
    );
    return one(result.rows[0]);
  }

  async findApprovalByDigest(
    ownerId: string,
    actionDigest: string,
    statuses: ApprovalStatus[],
  ) {
    const activeCompanyId = companyScope.companyId(ownerId);
    const result = await this.pool.query<{ record: StoredApprovalRequest }>(
      `SELECT record FROM approval_requests
       WHERE owner_id=$1 AND action_digest=$2 AND status=ANY($3::varchar[])
       AND ($4::uuid IS NULL OR company_id=$4)
       ORDER BY requested_at DESC LIMIT 1`,
      [ownerId, actionDigest, statuses, activeCompanyId ?? null],
    );
    return one(result.rows[0]);
  }

  async listApprovals(ownerId: string, status?: ApprovalStatus) {
    const activeCompanyId = companyScope.companyId(ownerId);
    const result = await this.pool.query<{ record: StoredApprovalRequest }>(
      `SELECT record FROM approval_requests
       WHERE owner_id=$1 AND ($2::varchar IS NULL OR status=$2)
       AND ($3::uuid IS NULL OR company_id=$3)
       ORDER BY requested_at DESC`,
      [ownerId, status ?? null, activeCompanyId ?? null],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateApproval(approval: StoredApprovalRequest) {
    const allowedCurrentStatuses: ApprovalStatus[] =
      approval.status === "APPROVED" ||
      approval.status === "REJECTED" ||
      approval.status === "CANCELLED"
        ? ["PENDING"]
        : approval.status === "EXPIRED"
          ? ["PENDING", "APPROVED"]
          : approval.status === "CONSUMED"
            ? ["APPROVED"]
            : ["PENDING"];
    const result = await this.pool.query(
      `UPDATE approval_requests SET status=$2,record=$3,version=version+1
       WHERE id=$1 AND owner_id=$4 AND company_id=$5 AND status=ANY($6::varchar[])`,
      [
        approval.id,
        approval.status,
        approval,
        approval.ownerId,
        approval.companyId,
        allowedCurrentStatuses,
      ],
    );
    if (result.rowCount !== 1) {
      throw new GovernanceError(
        409,
        "APPROVAL_ALREADY_DECIDED",
        "Approval request is already in a terminal state.",
      );
    }
  }

  async cancelApprovalsForDevice(deviceId: string, at: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{
        id: string;
        record: StoredApprovalRequest;
      }>(
        `SELECT id,record FROM approval_requests
         WHERE status='PENDING' AND record->>'requestedByDeviceId'=$1 FOR UPDATE`,
        [deviceId],
      );
      for (const row of selected.rows) {
        const updated = {
          ...row.record,
          status: "CANCELLED" as const,
          decidedAt: at,
        };
        await client.query(
          `UPDATE approval_requests SET status='CANCELLED',record=$2,version=version+1
           WHERE id=$1 AND status='PENDING'`,
          [row.id, updated],
        );
      }
      await client.query("COMMIT");
      return selected.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendPolicyEvaluation(evaluation: StoredPolicyEvaluation) {
    await this.pool.query(
      `INSERT INTO policy_evaluations(id,owner_id,decision,evaluated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        evaluation.id,
        evaluation.ownerId,
        evaluation.decision,
        evaluation.evaluatedAt,
        evaluation,
        companyScope.companyId(evaluation.ownerId) ?? null,
      ],
    );
  }

  async listPolicyEvaluations(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: StoredPolicyEvaluation }>(
      `SELECT record FROM policy_evaluations WHERE owner_id=$1
       AND ($3::uuid IS NULL OR company_id=$3)
       ORDER BY evaluated_at DESC LIMIT $2`,
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async getSecurityState(): Promise<GovernanceSecurityState> {
    const result = await this.pool.query<{
      emergency_stop_active: boolean;
      updated_at: Date;
    }>(`SELECT emergency_stop_active,updated_at FROM security_state WHERE id='global'`);
    const state = result.rows[0];
    if (!state) throw new Error("Required security state is unavailable.");
    return {
      emergencyStopActive: state.emergency_stop_active,
      privilegedExecutionAvailable: false,
      updatedAt: state.updated_at.toISOString(),
    };
  }

  async activateEmergencyStop(at: string) {
    await this.pool.query(
      `UPDATE security_state SET emergency_stop_active=true,
       privileged_execution_available=false,updated_at=$1,version=version+1
       WHERE id='global'`,
      [at],
    );
    return this.getSecurityState();
  }

  async releaseEmergencyStop(at: string) {
    await this.pool.query(
      `UPDATE security_state SET emergency_stop_active=false,
       updated_at=$1,version=version+1 WHERE id='global'`,
      [at],
    );
    return this.getSecurityState();
  }
}
