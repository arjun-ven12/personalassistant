import {
  ReadOnlyExecutionRequestSchema,
  ReadOnlyExecutionResultSchema,
  type ReadOnlyExecutionRequest,
  type ReadOnlyExecutionResult,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ExecutionStore } from "./store.js";

const parseRequest = (row: { record: unknown }) =>
  ReadOnlyExecutionRequestSchema.parse(row.record);

export class PostgresExecutionStore implements ExecutionStore {
  constructor(readonly pool: Pool) {}

  async create(request: ReadOnlyExecutionRequest) {
    await this.pool.query(
      `INSERT INTO execution_requests
       (id,owner_id,device_id,workspace_id,policy_evaluation_id,approval_request_id,
        action_digest,tool_name,status,expires_at,created_at,record,
        server_key_fingerprint,workspace_root_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        request.id,
        request.ownerId,
        request.deviceId,
        request.workspaceId,
        request.policyEvaluationId,
        request.approvalRequestId ?? null,
        request.actionDigest,
        request.toolName,
        request.status,
        request.expiresAt,
        request.createdAt,
        request,
        request.serverKeyFingerprint ?? null,
        request.workspaceRootHash ?? null,
      ],
    );
  }

  async find(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM execution_requests WHERE id=$1",
      [id],
    );
    return result.rows[0] ? parseRequest(result.rows[0]) : undefined;
  }

  async list(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM execution_requests WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map(parseRequest);
  }

  async poll(deviceId: string, now: string) {
    await this.pool.query(
      `UPDATE execution_requests SET status='EXPIRED', completed_at=$2,
       record=jsonb_set(jsonb_set(jsonb_set(record,'{status}','"EXPIRED"'),
       '{completedAt}',to_jsonb($2::text)),'{failureCode}','"EXECUTION_REQUEST_EXPIRED"')
       WHERE device_id=$1 AND status='PENDING' AND expires_at <= $2`,
      [deviceId, now],
    );
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM execution_requests
       WHERE device_id=$1 AND status='PENDING' AND expires_at>$2
       ORDER BY created_at ASC LIMIT 1`,
      [deviceId, now],
    );
    return result.rows[0] ? parseRequest(result.rows[0]) : undefined;
  }

  async transition(
    id: string,
    deviceId: string,
    from: ReadOnlyExecutionRequest["status"][],
    to: ReadOnlyExecutionRequest["status"],
    at: string,
    failureCode?: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE execution_requests SET status=$4::varchar,
       completed_at=CASE WHEN $4::text = ANY($5::text[]) THEN $3::timestamptz ELSE completed_at END,
       version=version+1,
       record = record || jsonb_build_object(
         'status',$4::text,
         'claimedAt',CASE WHEN $4::text='CLAIMED' THEN $8::text ELSE record->>'claimedAt' END,
         'startedAt',CASE WHEN $4::text='RUNNING' THEN $8::text ELSE record->>'startedAt' END,
         'completedAt',CASE WHEN $4::text = ANY($5::text[]) THEN $8::text ELSE record->>'completedAt' END,
         'attemptCount',CASE WHEN $4::text='CLAIMED' THEN (record->>'attemptCount')::int+1 ELSE (record->>'attemptCount')::int END,
         'failureCode',$6::text)
       WHERE id=$1 AND device_id=$2 AND status = ANY($7::text[])
       RETURNING record`,
      [
        id,
        deviceId,
        at,
        to,
        ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "EXPIRED", "REJECTED"],
        failureCode ?? null,
        from,
        at,
      ],
    );
    return result.rows[0] ? parseRequest(result.rows[0]) : undefined;
  }

  async cancel(id: string, ownerId: string, at: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE execution_requests SET status='CANCELLED',completed_at=$3,version=version+1,
       record=record || jsonb_build_object('status','CANCELLED','completedAt',$3::text,
       'cancellationRequestedAt',$3::text,'failureCode','CAPABILITY_CANCELLED')
       WHERE id=$1 AND owner_id=$2 AND status = ANY($4::text[]) RETURNING record`,
      [id, ownerId, at, ["PENDING", "CLAIMED", "RUNNING"]],
    );
    return result.rows[0] ? parseRequest(result.rows[0]) : undefined;
  }

  async saveResult(
    ownerId: string,
    result: ReadOnlyExecutionResult,
    retentionExpiresAt: string,
  ) {
    const inserted = await this.pool.query(
      `INSERT INTO execution_results
       (execution_request_id,owner_id,device_id,expires_at,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [
        result.executionRequestId,
        ownerId,
        result.deviceId,
        retentionExpiresAt,
        result.completedAt,
        result,
      ],
    );
    return inserted.rowCount === 1;
  }

  async getResult(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM execution_results WHERE execution_request_id=$1",
      [id],
    );
    return result.rows[0]
      ? ReadOnlyExecutionResultSchema.parse(result.rows[0].record)
      : undefined;
  }

  async getResultExpiry(id: string) {
    const result = await this.pool.query<{ expires_at: Date | string }>(
      "SELECT expires_at FROM execution_results WHERE execution_request_id=$1",
      [id],
    );
    const expiresAt = result.rows[0]?.expires_at;
    return expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  }

  async cancelForDevice(deviceId: string, at: string) {
    const result = await this.pool.query(
      `UPDATE execution_requests SET status='CANCELLED',completed_at=$2,version=version+1,
       record=record || jsonb_build_object('status','CANCELLED','completedAt',$2::text,
       'cancellationRequestedAt',$2::text,'failureCode','TRUSTED_DEVICE_REQUIRED')
       WHERE device_id=$1 AND status = ANY($3::text[])`,
      [deviceId, at, ["PENDING", "CLAIMED", "RUNNING"]],
    );
    return result.rowCount ?? 0;
  }

  async cancelAll(at: string) {
    const result = await this.pool.query(
      `UPDATE execution_requests SET status='CANCELLED',completed_at=$1,version=version+1,
       record=record || jsonb_build_object('status','CANCELLED','completedAt',$2::text,
       'cancellationRequestedAt',$2::text,'failureCode','EMERGENCY_STOP_ACTIVE')
       WHERE status = ANY($3::text[])`,
      [at, at, ["PENDING", "CLAIMED", "RUNNING"]],
    );
    return result.rowCount ?? 0;
  }

  async heartbeat(id: string, deviceId: string, at: string) {
    const result = await this.pool.query(
      `UPDATE execution_requests
       SET agent_last_heartbeat_at=$3,
           record=record || jsonb_build_object('agentLastHeartbeatAt',$3::text),
           version=version+1
       WHERE id=$1 AND device_id=$2 AND status = ANY($4::text[])`,
      [id, deviceId, at, ["CLAIMED", "RUNNING"]],
    );
    return result.rowCount === 1;
  }

  async cancellationsForDevice(deviceId: string, since: string, limit: number) {
    const result = await this.pool.query<{
      execution_request_id: string;
      cancelled_at: Date | string;
    }>(
      `SELECT id AS execution_request_id, completed_at AS cancelled_at
       FROM execution_requests
       WHERE device_id=$1 AND status='CANCELLED'
         AND completed_at IS NOT NULL AND completed_at>$2
       ORDER BY completed_at DESC LIMIT $3`,
      [deviceId, since, limit],
    );
    return result.rows.map((row) => ({
      executionRequestId: row.execution_request_id,
      cancelledAt:
        row.cancelled_at instanceof Date
          ? row.cancelled_at.toISOString()
          : row.cancelled_at,
    }));
  }

  async cleanupExpired(now: string) {
    const requests = await this.pool.query(
      `UPDATE execution_requests
       SET status='EXPIRED', completed_at=$1, version=version+1,
           record=record || jsonb_build_object(
             'status','EXPIRED',
             'completedAt',$1::text,
             'failureCode','EXECUTION_REQUEST_EXPIRED')
       WHERE status = ANY($2::text[]) AND expires_at <= $1`,
      [now, ["PENDING", "CLAIMED", "RUNNING"]],
    );
    const results = await this.pool.query(
      "DELETE FROM execution_results WHERE expires_at <= $1",
      [now],
    );
    return {
      expiredRequests: requests.rowCount ?? 0,
      expiredResults: results.rowCount ?? 0,
    };
  }
}
