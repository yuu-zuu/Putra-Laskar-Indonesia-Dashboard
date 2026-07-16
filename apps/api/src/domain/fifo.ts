import { AppError } from "../lib/errors.js";

export interface FifoLayer {
  id: string;
  remainingQty: number;
  unitCost: number;
  unitSellingPrice: number;
}

export interface LayerAllocation {
  layerId: string;
  quantity: number;
  unitCost: number;
  unitSellingPrice: number;
}

export function planFifoAllocation(layers: FifoLayer[], quantity: number): LayerAllocation[] {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(422, "INVALID_QUANTITY", "Kuantitas harus lebih besar dari nol.");
  }
  let remaining = quantity;
  const allocations: LayerAllocation[] = [];
  for (const layer of layers) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, layer.remainingQty);
    if (taken <= 0) continue;
    allocations.push({
      layerId: layer.id,
      quantity: taken,
      unitCost: layer.unitCost,
      unitSellingPrice: layer.unitSellingPrice,
    });
    remaining = roundQuantity(remaining - taken);
  }
  if (remaining > 0) {
    const available = roundQuantity(quantity - remaining);
    throw new AppError(
      422,
      "INSUFFICIENT_FIFO_STOCK",
      `Stock FIFO tidak cukup. Tersedia ${available.toLocaleString("id-ID")} L dari ${quantity.toLocaleString("id-ID")} L.`,
      { quantity: `Maksimum ${available.toLocaleString("id-ID")} L.` },
    );
  }
  return allocations;
}

export function weightedUnitCost(allocations: LayerAllocation[]): number {
  const quantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  if (quantity === 0) return 0;
  return Math.round(
    allocations.reduce((sum, allocation) => sum + allocation.quantity * allocation.unitCost, 0) /
      quantity,
  );
}

function roundQuantity(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
