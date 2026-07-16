import type { AuditLogPage } from "@spbu/contracts";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";
export interface AuditQuery {
  branchId?: string | undefined;
  actorId?: string | undefined;
  objectType?: string | undefined;
  action?: string | undefined;
  outcome?: string | undefined;
  search?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}
export async function getAuditLogs(query: AuditQuery): Promise<AuditLogPage> {
  if (isMockMode()) return { items: [], nextCursor: null };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return apiRequest<AuditLogPage>(`/audit-logs?${params}`);
}
