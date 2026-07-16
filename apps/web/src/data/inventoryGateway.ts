import type {
  CreateInventoryMovementInput,
  CreateStockTransferInput,
  InventoryMovementItem,
} from "@spbu/contracts";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";

export async function getInventoryMovements(
  branchId: string,
  date: string,
): Promise<InventoryMovementItem[]> {
  if (isMockMode()) return [];
  const response = await apiRequest<{ items: InventoryMovementItem[] }>(
    `/inventory/movements?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`,
  );
  return response.items;
}

export async function createInventoryMovement(
  input: CreateInventoryMovementInput,
): Promise<InventoryMovementItem> {
  if (isMockMode()) throw new Error("Mutasi ledger membutuhkan mode API.");
  return apiRequest<InventoryMovementItem>("/inventory/movements", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createStockTransfer(
  input: CreateStockTransferInput,
): Promise<{ id: string; replayed: boolean }> {
  if (isMockMode()) throw new Error("Transfer stock membutuhkan mode API.");
  return apiRequest<{ id: string; replayed: boolean }>("/inventory/transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
