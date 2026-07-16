import type { PoolClient } from "pg";
import { pool } from "../db/client.js";
import { currentRequestId } from "./requestContext.js";

export interface AuditInput {
  branchId: string | null;
  actorId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  outcome?: "SUCCEEDED" | "FAILED" | "DENIED";
  impactScope?: "SHARED" | "LOCAL";
  requestId?: string | null;
}

export async function writeAudit(input: AuditInput, client?: PoolClient): Promise<void> {
  const executor = client ?? pool;
  await executor.query(
    `INSERT INTO audit_log
     (branch_id,actor_id,action,object_type,object_id,reason,metadata,outcome,impact_scope,request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
    [
      input.branchId,
      input.actorId,
      input.action,
      input.objectType,
      input.objectId,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.outcome ?? "SUCCEEDED",
      input.impactScope ?? "SHARED",
      input.requestId ?? currentRequestId(),
    ],
  );
}
