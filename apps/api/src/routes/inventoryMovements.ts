import type {
  CreateInventoryMovementInput,
  CreateStockTransferInput,
  InventoryMovementItem,
  InventoryMovementKind,
} from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import { lockIdempotencyKey } from "../db/idempotency.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { queryParam, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { dateField, enumField, numberField, objectBody, stringField } from "../lib/validation.js";
import { createUuid } from "../lib/uuid.js";
import { consumeFifoLayers, nextLayerSequence } from "../services/inventoryPostingService.js";

const movementKinds = [
  "OPENING",
  "SUPPLY",
  "SALES_RETURN",
  "SUPPLIER_RETURN",
  "GAIN",
  "LOSS",
] as const;
const receiptKinds = new Set<InventoryMovementKind>(["OPENING", "SUPPLY", "SALES_RETURN", "GAIN"]);

export function registerInventoryMovementRoutes(router: Router): void {
  router.add("GET", "/api/v1/inventory/movements", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const date = queryParam(url, "date", false);
    const result = await pool.query<MovementRow>(
      `SELECT movement.id,movement.business_date::text,movement.stock_unit_id,stock.name AS stock_unit_name,
        movement.movement_type,movement.quantity_delta,movement.source_type,movement.reference,
        movement.posted_at::text,COALESCE(account.display_name,'System') AS actor_name
       FROM inventory_movement movement
       JOIN stock_unit stock ON stock.id=movement.stock_unit_id
       LEFT JOIN app_user account ON account.id=movement.posted_by
       WHERE movement.branch_id=$1 AND movement.posting_status='POSTED'
         AND ($2::date IS NULL OR movement.business_date=$2::date)
       ORDER BY movement.business_date DESC,movement.posted_at DESC,movement.id DESC LIMIT 250`,
      [branchId, date],
    );
    sendJson(response, 200, { items: result.rows.map(mapMovement) });
  });

  router.add("POST", "/api/v1/inventory/movements", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER", "OPERATOR"]);
    const input = parseMovement(await readJson(request));
    assertBranch(user.role, user.branchId, input.branchId);
    const result = await inTransaction(async (client) => {
      await lockIdempotencyKey(
        client,
        `inventory-movement:${input.branchId}`,
        input.idempotencyKey,
      );
      const replay = await client.query<MovementRow>(movementSelectByIdempotency, [
        input.branchId,
        input.idempotencyKey,
      ]);
      const replayed = replay.rows[0];
      if (replayed !== undefined) return { status: 200, movement: mapMovement(replayed) } as const;
      const stock = await lockStockUnit(client, input.stockUnitId, input.branchId);
      if (input.movementType === "OPENING") {
        const prior = await client.query<{ exists: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM inventory_movement
           WHERE stock_unit_id=$1 AND posting_status='POSTED') AS exists`,
          [input.stockUnitId],
        );
        if (prior.rows[0]?.exists === true) {
          throw new AppError(
            409,
            "OPENING_BALANCE_ALREADY_SET",
            "Saldo awal hanya dapat dicatat sebelum mutasi pertama. Gunakan adjustment untuk koreksi berikutnya.",
          );
        }
      }
      const positive = receiptKinds.has(input.movementType);
      const signedQuantity = positive ? input.quantity : -input.quantity;
      await assertCapacity(
        client,
        input.stockUnitId,
        input.businessDate,
        signedQuantity,
        stock.capacity_qty,
      );
      let consumed = [] as Awaited<ReturnType<typeof consumeFifoLayers>>;
      if (!positive)
        consumed = await consumeFifoLayers(
          client,
          input.stockUnitId,
          input.quantity,
          input.businessDate,
        );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO inventory_movement
         (branch_id,stock_unit_id,business_date,movement_type,quantity_delta,source_type,posted_by,
          idempotency_key,reference,reason)
         VALUES($1,$2,$3,$4,$5,'MANUAL',$6,$7,$8,$9) RETURNING id`,
        [
          input.branchId,
          input.stockUnitId,
          input.businessDate,
          input.movementType,
          signedQuantity,
          user.id,
          input.idempotencyKey,
          input.reference,
          input.reason,
        ],
      );
      const movementId = inserted.rows[0]?.id;
      if (movementId === undefined) throw new Error("Inventory movement insert returned no id.");
      if (positive) {
        const unitCost = requiredMoney(
          input.unitCost,
          "unitCost",
          "Biaya per liter wajib untuk mutasi masuk.",
        );
        const sellingPrice = requiredMoney(
          input.unitSellingPrice,
          "unitSellingPrice",
          "Harga jual per liter wajib untuk mutasi masuk.",
        );
        if (sellingPrice < unitCost) {
          throw new AppError(
            422,
            "SELLING_PRICE_BELOW_COST",
            "Harga jual tidak boleh lebih rendah dari biaya FIFO.",
          );
        }
        const sequence = await nextLayerSequence(client, input.stockUnitId);
        await client.query(
          `INSERT INTO stock_layer
           (stock_unit_id,received_at,sequence_no,initial_qty,remaining_qty,unit_cost,unit_selling_price,source_type,source_id)
           VALUES($1,$2::date::timestamptz,$3,$4,$4,$5,$6,$7,$8)`,
          [
            input.stockUnitId,
            input.businessDate,
            sequence,
            input.quantity,
            unitCost,
            sellingPrice,
            input.movementType,
            movementId,
          ],
        );
      }
      await writeAudit(
        {
          branchId: input.branchId,
          actorId: user.id,
          action: "POST",
          objectType: "inventory_movement",
          objectId: movementId,
          reason: input.reason,
          metadata: {
            stockUnitId: input.stockUnitId,
            stockUnitName: stock.name,
            movementType: input.movementType,
            quantityDelta: signedQuantity,
            reference: input.reference,
            unitCost: input.unitCost,
            unitSellingPrice: input.unitSellingPrice,
            consumedLayers: consumed.length,
          },
        },
        client,
      );
      const created = await client.query<MovementRow>(movementSelectById, [movementId]);
      const row = created.rows[0];
      if (row === undefined) throw new Error("Inventory movement query returned no row.");
      return { status: 201, movement: mapMovement(row) } as const;
    });
    sendJson(response, result.status, result.movement);
  });

  router.add("POST", "/api/v1/inventory/transfers", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const input = parseTransfer(await readJson(request));
    assertBranch(user.role, user.branchId, input.branchId);
    if (input.sourceStockUnitId === input.destinationStockUnitId) {
      throw new AppError(422, "TRANSFER_SAME_UNIT", "Unit asal dan tujuan transfer harus berbeda.");
    }
    const result = await inTransaction(async (client) => {
      await lockIdempotencyKey(client, `stock-transfer:${input.branchId}`, input.idempotencyKey);
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM inventory_movement WHERE branch_id=$1 AND idempotency_key=$2",
        [input.branchId, `transfer-out:${input.idempotencyKey}`],
      );
      const replayed = existing.rows[0];
      if (replayed !== undefined)
        return { status: 200, transfer: { id: replayed.id, replayed: true } } as const;
      const orderedIds = [input.sourceStockUnitId, input.destinationStockUnitId].sort();
      const [firstId, secondId] = orderedIds;
      if (firstId === undefined || secondId === undefined) {
        throw new Error("Transfer lock ordering requires two stock units.");
      }
      const first = await lockStockUnit(client, firstId, input.branchId);
      const second = await lockStockUnit(client, secondId, input.branchId);
      const source = firstId === input.sourceStockUnitId ? first : second;
      const destination = firstId === input.destinationStockUnitId ? first : second;
      if (source.product_id !== destination.product_id) {
        throw new AppError(
          422,
          "TRANSFER_PRODUCT_MISMATCH",
          "Transfer hanya dapat dilakukan antarunit dengan produk yang sama.",
        );
      }
      await assertCapacity(
        client,
        input.destinationStockUnitId,
        input.businessDate,
        input.quantity,
        destination.capacity_qty,
      );
      await assertCapacity(
        client,
        input.sourceStockUnitId,
        input.businessDate,
        -input.quantity,
        source.capacity_qty,
      );
      const allocations = await consumeFifoLayers(
        client,
        input.sourceStockUnitId,
        input.quantity,
        input.businessDate,
      );
      const transferId = createUuid();
      const movements = await client.query<{ id: string; movement_type: string }>(
        `INSERT INTO inventory_movement
         (branch_id,stock_unit_id,business_date,movement_type,quantity_delta,source_type,source_id,posted_by,
          idempotency_key,reference,reason)
         VALUES
          ($1,$2,$4,'TRANSFER_OUT',$5,'TRANSFER',$6,$7,$8,$10,$11),
          ($1,$3,$4,'TRANSFER_IN',$9,'TRANSFER',$6,$7,$12,$10,$11)
         RETURNING id,movement_type`,
        [
          input.branchId,
          input.sourceStockUnitId,
          input.destinationStockUnitId,
          input.businessDate,
          -input.quantity,
          transferId,
          user.id,
          `transfer-out:${input.idempotencyKey}`,
          input.quantity,
          input.reference,
          input.reason,
          `transfer-in:${input.idempotencyKey}`,
        ],
      );
      let sequence = await nextLayerSequence(client, input.destinationStockUnitId);
      for (const allocation of allocations) {
        await client.query(
          `INSERT INTO stock_layer
           (stock_unit_id,received_at,sequence_no,initial_qty,remaining_qty,unit_cost,unit_selling_price,source_type,source_id)
           VALUES($1,$2::date::timestamptz,$3,$4,$4,$5,$6,'TRANSFER',$7)`,
          [
            input.destinationStockUnitId,
            input.businessDate,
            sequence++,
            allocation.quantity,
            allocation.unitCost,
            allocation.unitSellingPrice,
            transferId,
          ],
        );
      }
      await writeAudit(
        {
          branchId: input.branchId,
          actorId: user.id,
          action: "POST",
          objectType: "stock_transfer",
          objectId: transferId,
          reason: input.reason,
          metadata: {
            sourceStockUnitId: input.sourceStockUnitId,
            sourceStockUnitName: source.name,
            destinationStockUnitId: input.destinationStockUnitId,
            destinationStockUnitName: destination.name,
            quantity: input.quantity,
            reference: input.reference,
            movementIds: movements.rows.map((row) => row.id),
          },
        },
        client,
      );
      return { status: 201, transfer: { id: transferId, replayed: false } } as const;
    });
    sendJson(response, result.status, result.transfer);
  });
}

type StockRow = { name: string; product_id: string; capacity_qty: number };
async function lockStockUnit(
  client: import("pg").PoolClient,
  id: string,
  branchId: string,
): Promise<StockRow> {
  const result = await client.query<StockRow>(
    "SELECT name,product_id,capacity_qty FROM stock_unit WHERE id=$1 AND branch_id=$2 AND active=true FOR UPDATE",
    [id, branchId],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new AppError(
      422,
      "INVALID_STOCK_UNIT",
      "Unit stock tidak aktif atau bukan milik cabang.",
    );
  return row;
}

async function assertCapacity(
  client: import("pg").PoolClient,
  stockUnitId: string,
  businessDate: string,
  delta: number,
  capacity: number,
): Promise<void> {
  const balance = await client.query<{ minimum_qty: number; maximum_qty: number }>(
    `WITH opening AS (
       SELECT COALESCE(SUM(quantity_delta),0) AS quantity
       FROM inventory_movement
       WHERE stock_unit_id=$1 AND business_date<$2::date AND posting_status='POSTED'
     ), daily AS (
       SELECT business_date,SUM(quantity_delta) AS quantity_delta
       FROM inventory_movement
       WHERE stock_unit_id=$1 AND business_date>=$2::date AND posting_status='POSTED'
       GROUP BY business_date
     ), points AS (
       SELECT business_date,quantity_delta FROM daily
       UNION ALL
       SELECT $2::date,0 WHERE NOT EXISTS (SELECT 1 FROM daily WHERE business_date=$2::date)
     ), balances AS (
       SELECT opening.quantity + SUM(points.quantity_delta) OVER (ORDER BY points.business_date) AS quantity
       FROM points CROSS JOIN opening
     ) SELECT MIN(quantity) AS minimum_qty,MAX(quantity) AS maximum_qty FROM balances`,
    [stockUnitId, businessDate],
  );
  const minimum = Number(balance.rows[0]?.minimum_qty ?? 0) + delta;
  const maximum = Number(balance.rows[0]?.maximum_qty ?? 0) + delta;
  if (minimum < 0)
    throw new AppError(422, "NEGATIVE_STOCK", "Mutasi akan membuat saldo stock negatif.");
  if (maximum > capacity)
    throw new AppError(422, "STOCK_CAPACITY_EXCEEDED", "Mutasi melebihi kapasitas unit stock.");
}

function parseMovement(value: unknown): CreateInventoryMovementInput {
  const body = objectBody(value);
  const kind = enumField<InventoryMovementKind>(body, "movementType", movementKinds);
  return {
    branchId: stringField(body, "branchId", { max: 80 }) as string,
    stockUnitId: stringField(body, "stockUnitId", { max: 80 }) as string,
    businessDate: dateField(body, "businessDate"),
    movementType: kind,
    quantity: numberField(body, "quantity", { min: 0.001, max: 1_000_000_000, scale: 3 }),
    unitCost: nullableNumber(body, "unitCost"),
    unitSellingPrice: nullableNumber(body, "unitSellingPrice"),
    reference: stringField(body, "reference", { min: 2, max: 120 }) as string,
    reason: stringField(body, "reason", { min: 5, max: 1000 }) as string,
    idempotencyKey: stringField(body, "idempotencyKey", { min: 8, max: 120 }) as string,
  };
}

function parseTransfer(value: unknown): CreateStockTransferInput {
  const body = objectBody(value);
  return {
    branchId: stringField(body, "branchId", { max: 80 }) as string,
    sourceStockUnitId: stringField(body, "sourceStockUnitId", { max: 80 }) as string,
    destinationStockUnitId: stringField(body, "destinationStockUnitId", { max: 80 }) as string,
    businessDate: dateField(body, "businessDate"),
    quantity: numberField(body, "quantity", { min: 0.001, max: 1_000_000_000, scale: 3 }),
    reference: stringField(body, "reference", { min: 2, max: 120 }) as string,
    reason: stringField(body, "reason", { min: 5, max: 1000 }) as string,
    idempotencyKey: stringField(body, "idempotencyKey", { min: 8, max: 120 }) as string,
  };
}

function nullableNumber(body: Record<string, unknown>, key: string): number | null {
  if (body[key] === null || body[key] === undefined || body[key] === "") return null;
  return numberField(body, key, { min: 0, max: 10_000_000_000_000, scale: 2 });
}
function requiredMoney(value: number | null, field: string, message: string): number {
  if (value === null)
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", { [field]: message });
  return value;
}
function assertBranch(role: string, assigned: string | null, target: string): void {
  if (role !== "ADMIN" && assigned !== target)
    throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
}

interface MovementRow {
  id: string;
  business_date: string;
  stock_unit_id: string;
  stock_unit_name: string;
  movement_type: InventoryMovementItem["movementType"];
  quantity_delta: number;
  source_type: string;
  reference: string | null;
  posted_at: string;
  actor_name: string;
}
function mapMovement(row: MovementRow): InventoryMovementItem {
  return {
    id: row.id,
    businessDate: row.business_date,
    stockUnitId: row.stock_unit_id,
    stockUnitName: row.stock_unit_name,
    movementType: row.movement_type,
    quantityDelta: Number(row.quantity_delta),
    sourceType: row.source_type,
    reference: row.reference,
    postedAt: row.posted_at,
    actorName: row.actor_name,
  };
}
const movementColumns = `SELECT movement.id,movement.business_date::text,movement.stock_unit_id,stock.name AS stock_unit_name,
  movement.movement_type,movement.quantity_delta,movement.source_type,movement.reference,movement.posted_at::text,
  COALESCE(account.display_name,'System') AS actor_name FROM inventory_movement movement
  JOIN stock_unit stock ON stock.id=movement.stock_unit_id LEFT JOIN app_user account ON account.id=movement.posted_by`;
const movementSelectById = movementColumns + " WHERE movement.id=$1";
const movementSelectByIdempotency =
  movementColumns + " WHERE movement.branch_id=$1 AND movement.idempotency_key=$2";
