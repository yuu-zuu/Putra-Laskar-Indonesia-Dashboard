import type { PoolClient } from "pg";
import { planFifoAllocation, type LayerAllocation } from "../domain/fifo.js";
import { AppError } from "../lib/errors.js";

interface LayerRow {
  id: string;
  remaining_qty: number;
  unit_cost: number;
  unit_selling_price: number;
}

export async function assignedStockUnit(
  client: PoolClient,
  branchId: string,
  meterUnitId: string,
  businessDate: string,
): Promise<string> {
  const result = await client.query<{ stock_unit_id: string }>(
    `SELECT assignment.stock_unit_id
     FROM meter_unit meter
     JOIN meter_stock_assignment assignment ON assignment.meter_unit_id=meter.id
       AND assignment.valid_from <= $3::date
       AND (assignment.valid_to IS NULL OR assignment.valid_to >= $3::date)
     JOIN stock_unit stock ON stock.id=assignment.stock_unit_id AND stock.active=true
     WHERE meter.id=$2 AND meter.branch_id=$1 AND meter.active=true
     ORDER BY assignment.valid_from DESC LIMIT 1`,
    [branchId, meterUnitId, businessDate],
  );
  const stockUnitId = result.rows[0]?.stock_unit_id;
  if (stockUnitId === undefined) {
    throw new AppError(
      422,
      "METER_STOCK_ASSIGNMENT_MISSING",
      "Pompa tidak memiliki pemetaan unit stock aktif pada tanggal bisnis ini.",
    );
  }
  return stockUnitId;
}

export async function consumeFifoLayers(
  client: PoolClient,
  stockUnitId: string,
  quantity: number,
  businessDate: string,
): Promise<LayerAllocation[]> {
  const result = await client.query<LayerRow>(
    `SELECT id,remaining_qty,unit_cost,unit_selling_price
     FROM stock_layer
     WHERE stock_unit_id=$1 AND remaining_qty>0 AND received_at < $2::date + interval '1 day'
     ORDER BY received_at,sequence_no,id
     FOR UPDATE`,
    [stockUnitId, businessDate],
  );
  const allocations = planFifoAllocation(
    result.rows.map((layer) => ({
      id: layer.id,
      remainingQty: Number(layer.remaining_qty),
      unitCost: Number(layer.unit_cost),
      unitSellingPrice: Number(layer.unit_selling_price),
    })),
    quantity,
  );
  for (const allocation of allocations) {
    await client.query("UPDATE stock_layer SET remaining_qty=remaining_qty-$2 WHERE id=$1", [
      allocation.layerId,
      allocation.quantity,
    ]);
  }
  return allocations;
}

export async function restoreAllocations(client: PoolClient, readingId: string): Promise<void> {
  const allocations = await client.query<{ stock_layer_id: string; quantity: number }>(
    `SELECT stock_layer_id,quantity FROM fifo_allocation
     WHERE sales_meter_reading_id=$1 FOR UPDATE`,
    [readingId],
  );
  for (const allocation of allocations.rows) {
    await client.query("UPDATE stock_layer SET remaining_qty=remaining_qty+$2 WHERE id=$1", [
      allocation.stock_layer_id,
      allocation.quantity,
    ]);
  }
  await client.query("DELETE FROM fifo_allocation WHERE sales_meter_reading_id=$1", [readingId]);
}

export async function allocateMeterSale(
  client: PoolClient,
  readingId: string,
  stockUnitId: string,
  quantity: number,
  unitSellingPrice: number,
  businessDate: string,
): Promise<LayerAllocation[]> {
  if (!Number.isFinite(unitSellingPrice) || unitSellingPrice <= 0) {
    throw new AppError(
      422,
      "INVALID_SELLING_PRICE",
      "Harga jual per liter harus lebih besar dari nol.",
    );
  }
  const allocations = await consumeFifoLayers(client, stockUnitId, quantity, businessDate);
  for (const allocation of allocations) {
    if (unitSellingPrice < allocation.unitCost) {
      throw new AppError(
        422,
        "SELLING_PRICE_BELOW_COST",
        "Harga jual lebih rendah daripada biaya lapisan FIFO tertua.",
        { unitSellingPrice: `Minimal Rp${allocation.unitCost.toLocaleString("id-ID")}.` },
      );
    }
    await client.query(
      `INSERT INTO fifo_allocation
       (sales_meter_reading_id,stock_layer_id,quantity,unit_cost,unit_selling_price)
       VALUES($1,$2,$3,$4,$5)`,
      [readingId, allocation.layerId, allocation.quantity, allocation.unitCost, unitSellingPrice],
    );
  }
  return allocations;
}

export async function nextLayerSequence(client: PoolClient, stockUnitId: string): Promise<number> {
  const result = await client.query<{ sequence_no: number }>(
    "SELECT COALESCE(MAX(sequence_no),0)::int+1 AS sequence_no FROM stock_layer WHERE stock_unit_id=$1",
    [stockUnitId],
  );
  return result.rows[0]?.sequence_no ?? 1;
}
