import type {
  CorrectMeterReadingInput,
  CreateBroadcastInput,
  ReconciliationComment,
  ReconciliationRevision,
  ReconciliationRow,
  ReconciliationStatus,
  SystemBroadcast,
} from "@spbu/contracts";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";
import { createClientId } from "../lib/id.js";
export async function getReadings(branchId: string, date: string): Promise<ReconciliationRow[]> {
  if (isMockMode()) return [];
  return (
    await apiRequest<{ items: ReconciliationRow[] }>(
      `/sales/meter-readings?branchId=${encodeURIComponent(branchId)}&date=${date}`,
    )
  ).items;
}
export async function updateReconciliation(
  id: string,
  status: ReconciliationStatus,
  note: string | null,
) {
  if (isMockMode()) return { id, status, note };
  return apiRequest<{ id: string; status: ReconciliationStatus; note: string | null }>(
    `/reconciliations/${id}`,
    { method: "PATCH", body: JSON.stringify({ status, note }) },
  );
}
export async function getBroadcasts(branchId: string): Promise<SystemBroadcast[]> {
  if (isMockMode()) return [];
  return (
    await apiRequest<{ items: SystemBroadcast[] }>(
      `/broadcasts?branchId=${encodeURIComponent(branchId)}`,
    )
  ).items;
}
export async function createBroadcast(input: CreateBroadcastInput): Promise<SystemBroadcast> {
  if (isMockMode())
    return {
      id: createClientId(),
      ...input,
      active: true,
      startsAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByName: "Demo Admin",
    };
  return apiRequest<SystemBroadcast>("/broadcasts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function correctReconciliation(
  id: string,
  input: CorrectMeterReadingInput,
): Promise<ReconciliationRevision> {
  return apiRequest<ReconciliationRevision>(`/reconciliations/${id}/correction`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export async function getReconciliationHistory(id: string): Promise<ReconciliationRevision[]> {
  if (isMockMode()) return [];
  return (await apiRequest<{ items: ReconciliationRevision[] }>(`/reconciliations/${id}/history`))
    .items;
}
export async function getReconciliationComments(id: string): Promise<ReconciliationComment[]> {
  if (isMockMode()) return [];
  return (await apiRequest<{ items: ReconciliationComment[] }>(`/reconciliations/${id}/comments`))
    .items;
}
export async function addReconciliationComment(
  id: string,
  message: string,
  parentId: string | null,
): Promise<ReconciliationComment> {
  if (isMockMode())
    return {
      id: createClientId(),
      readingId: id,
      parentId,
      authorId: "demo",
      authorName: "Demo Admin",
      authorRole: "ADMIN",
      message,
      createdAt: new Date().toISOString(),
    };
  return apiRequest<ReconciliationComment>(`/reconciliations/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ message, parentId }),
  });
}
export async function recordReportExport(
  branchId: string,
  format: "csv" | "xlsx",
  startDate: string,
  endDate: string,
): Promise<void> {
  if (isMockMode()) return;
  await apiRequest("/reports/export-events", {
    method: "POST",
    body: JSON.stringify({ branchId, format, startDate, endDate }),
  });
}
