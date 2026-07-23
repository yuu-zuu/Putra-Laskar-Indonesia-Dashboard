import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";

import { closePool, pool } from "./client.js";
import {
  allocateMeterSale,
  consumeFifoLayers,
  nextLayerSequence,
} from "../services/inventoryPostingService.js";

type MovementType =
  | "OPENING"
  | "SUPPLY"
  | "SALE"
  | "SALES_RETURN"
  | "SUPPLIER_RETURN"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "GAIN"
  | "LOSS"
  | "REVERSAL";

interface SourceRef {
  file: string;
  sheet: string;
  row: number;
}

interface HistoricalMovement {
  type: MovementType;
  quantityDelta: number;
  classification: string;
}

interface HistoricalRow {
  key: string;
  branchCode: string;
  stockUnitCode: string;
  meterUnitCode: string;
  businessDate: string;
  shiftCode: string;
  meterStart: number | null;
  meterEnd: number | null;
  meterSalesQty: number | null;
  salesReturnQty: number;
  cashDepositAmount: number;
  effectiveSellingPrice: number | null;
  closingQty: number;
  physicalQty: number | null;
  varianceQty: number | null;
  note: string | null;
  source: SourceRef;
  movements: HistoricalMovement[];
}

interface ImportWarning {
  code: string;
  severity: "warning" | "blocking";
  source: string;
  message: string;
}

interface HistoricalPayload {
  version: number;
  name: string;
  timezone: string;
  startDate: string;
  throughDate: string;
  sourceFiles: Array<{ name: string; sha256: string }>;
  warnings: ImportWarning[];
  expected: {
    counts: {
      rows: number;
      movements: number;
      meterReadings: number;
      stockOpnames: number;
    };
    finalBalances: Array<{
      branchCode: string;
      stockUnitCode: string;
      quantity: number;
    }>;
    fifoBridge: {
      events: number;
      createdQty: number;
      recoveredQty: number;
    };
  };
  rows: HistoricalRow[];
}

interface CostRule {
  branchCode: string;
  stockUnitCode: string;
  validFrom: string;
  validTo?: string | null;
  unitCost: number | null;
  unitSellingPrice?: number | null;
}

interface CostSchedule {
  version: number;
  rules: CostRule[];
}

interface BootstrapUnitConfig {
  sourceBranchCode: string;
  existingBranchName: string;
  stockUnitCode: string;
  stockUnitName: string;
  meterUnitCode: string;
  meterUnitName: string;
  capacityQty?: number | null;
  lowStockThresholdQty?: number | null;
}

interface MasterBootstrapConfig {
  version: number;
  product: {
    code: string;
    name: string;
    unit: string;
  };
  capacityPolicy: {
    roundingStepQty: number;
    minimumCapacityQty: number;
  };
  defaultLowStockThresholdQty: number;
  units: BootstrapUnitConfig[];
}

interface MasterBootstrapSummary {
  productId: string;
  productCreated: boolean;
  stockUnitsCreated: number;
  metersCreated: number;
  assignmentsCreated: number;
  inferredCapacities: Array<{
    sourceBranchCode: string;
    existingBranchName: string;
    stockUnitCode: string;
    observedMaximumQty: number;
    capacityQty: number;
  }>;
  resolvedBranches: Array<{
    sourceBranchCode: string;
    branchId: string;
    branchCode: string;
    branchName: string;
  }>;
}

interface RequiredMasterTarget {
  branchCode: string;
  stockUnitCode: string;
  meterUnitCode: string;
}

interface Options {
  file: string;
  actorEmail: string;
  costFile?: string;
  apply: boolean;
  allowUncosted: boolean;
  acknowledgeSourceWarnings: boolean;
  bootstrapMaster: boolean;
  bootstrapFile: string;
  acknowledgeInferredCapacity: boolean;
}

interface ImportActual {
  rows: number;
  movements: number;
  meterReadings: number;
  stockOpnames: number;
  fifoDeficitEvents: number;
  fifoDeficitCreatedQty: number;
  fifoDeficitRecoveredQty: number;
}

interface ResolvedUnit {
  branchId: string;
  stockUnitId: string;
  meterUnitId: string | null;
}

interface AllocationResult {
  quantity: number;
  unitCost: number;
}

const IMPORT_LOCK_ID = 704_320_003;
const DEFAULT_FILE = "database/imports/stock-operator-2026-03-to-2026-07-15.json";
const DEFAULT_BOOTSTRAP_FILE = "database/imports/historical-master-bootstrap.json";

const options = parseOptions(process.argv.slice(2));

try {
  await run(options);
} finally {
  await closePool();
}

async function run(options: Options): Promise<void> {
  const payloadBytes = await readFile(options.file);
  const payload = parsePayload(payloadBytes.toString("utf8"));
  const fingerprint = createHash("sha256").update(payloadBytes).digest("hex");
  const costs = options.costFile === undefined ? undefined : await readCostSchedule(options.costFile);
  const bootstrapConfig = options.bootstrapMaster
    ? await readMasterBootstrapConfig(options.bootstrapFile)
    : undefined;

  validatePayload(payload);
  validateWarnings(payload, options);

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [IMPORT_LOCK_ID]);
    await ensureTrackingMigration(client);

    const existingBatch = await client.query<{ id: string; applied_at: Date }>(
      "SELECT id,applied_at FROM historical_import_batch WHERE fingerprint=$1",
      [fingerprint],
    );
    if (existingBatch.rows[0] !== undefined) {
      console.info(
        JSON.stringify({
          level: "info",
          event: "historical_import_already_applied",
          batchId: existingBatch.rows[0].id,
          appliedAt: existingBatch.rows[0].applied_at,
          fingerprint,
        }),
      );
      return;
    }

    const actorId = await resolveActor(client, options.actorEmail);

    const missingCosts = collectMissingCosts(payload, costs);
    if (missingCosts.length > 0 && options.apply && !options.allowUncosted) {
      throw new Error(
        `Harga pokok belum lengkap untuk: ${missingCosts.join(", ")}. ` +
          "Lengkapi --cost-file atau gunakan --allow-uncosted secara eksplisit.",
      );
    }

    console.info(
      JSON.stringify({
        level: "info",
        event: "historical_import_preflight",
        mode: options.apply ? "APPLY" : "DRY_RUN",
        file: options.file,
        fingerprint,
        counts: payload.expected.counts,
        sourceWarnings: payload.warnings,
        missingCosts,
        bootstrapMaster: options.bootstrapMaster,
        bootstrapFile: options.bootstrapMaster ? options.bootstrapFile : null,
      }),
    );

    await client.query("BEGIN");
    try {
      let bootstrapSummary: MasterBootstrapSummary | null = null;
      if (bootstrapConfig !== undefined) {
        await assertActorCanBootstrapMaster(client, actorId);
        bootstrapSummary = await bootstrapMasterData({
          client,
          payload,
          config: bootstrapConfig,
          actorId,
          fingerprint,
          apply: options.apply,
          acknowledgeInferredCapacity: options.acknowledgeInferredCapacity,
        });
      }
      const units = await resolveUnits(client, payload, bootstrapConfig);
      await lockOperationalTargets(client, units);
      await assertOperationalTargetsAreEmpty(client, units);

      const batchId = await createBatch(
        client,
        payload,
        fingerprint,
        actorId,
        costs === undefined || missingCosts.length > 0 ? "UNCOSTED" : "SCHEDULED",
      );

      const actual: ImportActual = {
        rows: 0,
        movements: 0,
        meterReadings: 0,
        stockOpnames: 0,
        fifoDeficitEvents: 0,
        fifoDeficitCreatedQty: 0,
        fifoDeficitRecoveredQty: 0,
      };
      const deficitByStockUnit = new Map<string, number>();
      for (const [rowIndex, row] of payload.rows.entries()) {
        const unit = units.get(unitKey(row.branchCode, row.stockUnitCode));
        if (unit === undefined) throw new Error(`Unit tidak ter-resolve untuk ${row.key}.`);
        await importRow({
          client,
          payload,
          row,
          rowIndex,
          unit,
          actorId,
          batchId,
          fingerprint,
          costs,
          allowUncosted: options.allowUncosted || !options.apply,
          actual,
          deficitByStockUnit,
        });
      }

      verifyNoOutstandingDeficits(deficitByStockUnit);
      await verifyCounts(payload, actual);
      await verifyFinalBalances(client, payload, units);

      await client.query(
        `INSERT INTO audit_log
          (actor_id,action,object_type,object_id,reason,metadata,occurred_at,outcome,impact_scope)
         VALUES($1,'IMPORT','historical_import_batch',$2,$3,$4,$5,'SUCCEEDED','SHARED')`,
        [
          actorId,
          batchId,
          "Import historis dari workbook; provenance import dipertahankan dan tidak disamarkan sebagai input manual.",
          JSON.stringify({
            fingerprint,
            importName: payload.name,
            sourceFiles: payload.sourceFiles,
            counts: actual,
            warnings: payload.warnings,
            costMode: costs === undefined || missingCosts.length > 0 ? "UNCOSTED" : "SCHEDULED",
            masterBootstrap: bootstrapSummary,
          }),
          new Date().toISOString(),
        ],
      );

      if (options.apply) {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }

      console.info(
        JSON.stringify({
          level: "info",
          event: options.apply ? "historical_import_committed" : "historical_import_dry_run_complete",
          batchId,
          fingerprint,
          counts: actual,
        }),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [IMPORT_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

async function importRow(args: {
  client: PoolClient;
  payload: HistoricalPayload;
  row: HistoricalRow;
  rowIndex: number;
  unit: ResolvedUnit;
  actorId: string;
  batchId: string;
  fingerprint: string;
  costs: CostSchedule | undefined;
  allowUncosted: boolean;
  actual: ImportActual;
  deficitByStockUnit: Map<string, number>;
}): Promise<void> {
  const {
    client,
    row,
    rowIndex,
    unit,
    actorId,
    batchId,
    fingerprint,
    costs,
    allowUncosted,
    actual,
    deficitByStockUnit,
  } = args;
  const baseSecond = rowIndex % 50;
  const createdAt = historicalTimestamp(row.businessDate, 20, 0, baseSecond);
  let readingId: string | null = null;
  let saleAllocations: AllocationResult[] = [];

  if (row.meterStart !== null && row.meterEnd !== null) {
    if (unit.meterUnitId === null) {
      throw new Error(`Meter ${row.meterUnitCode} tidak ditemukan untuk ${row.key}.`);
    }
    const readingKey = `${fingerprint.slice(0, 16)}:reading:${row.key}`;
    const reading = await client.query<{ id: string }>(
      `INSERT INTO sales_meter_reading
        (branch_id,meter_unit_id,business_date,shift_code,meter_start,meter_end,meter_reset_offset,
         cash_deposit_amount,note,reconciliation_status,posting_status,idempotency_key,created_at,posted_at)
       VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'POSTED',$10,$11,$11)
       RETURNING id`,
      [
        unit.branchId,
        unit.meterUnitId,
        row.businessDate,
        row.shiftCode,
        row.meterStart,
        row.meterEnd,
        row.cashDepositAmount,
        row.note,
        reconciliationStatus(row),
        readingKey,
        createdAt,
      ],
    );
    const insertedReadingId = requiredRow(reading.rows[0], `reading ${row.key}`).id;
    readingId = insertedReadingId;
    await trackItem(client, batchId, `${row.key}:reading`, "METER_READING", insertedReadingId, row, {
      idempotencyKey: readingKey,
    });
    await writeAudit(client, {
      branchId: unit.branchId,
      actorId,
      action: "CREATE",
      objectType: "sales_meter_reading",
      objectId: insertedReadingId,
      reason: "Historical workbook import",
      occurredAt: createdAt,
      metadata: provenance(row, batchId, fingerprint),
    });
    actual.meterReadings += 1;
  }

  for (const [movementIndex, movement] of row.movements.entries()) {
    const movementAt = historicalTimestamp(row.businessDate, 20, 5 + movementIndex, baseSecond);
    const movementKey = `${fingerprint.slice(0, 16)}:movement:${row.key}:${movementIndex}`;
    const movementResult = await client.query<{ id: string }>(
      `INSERT INTO inventory_movement
        (branch_id,stock_unit_id,business_date,movement_type,quantity_delta,source_type,source_id,
         posting_status,posted_at,posted_by,idempotency_key,created_at,reference,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,'POSTED',$8,$9,$10,$8,$11,$12)
       RETURNING id`,
      [
        unit.branchId,
        unit.stockUnitId,
        row.businessDate,
        movement.type,
        movement.quantityDelta,
        movement.type === "SALE" && readingId !== null
          ? "HISTORICAL_METER_IMPORT"
          : "HISTORICAL_WORKBOOK_IMPORT",
        movement.type === "SALE" ? readingId : batchId,
        movementAt,
        actorId,
        movementKey,
        `${row.source.file}#${row.source.sheet}!${row.source.row}`,
        [movement.classification, row.note].filter(Boolean).join(" — "),
      ],
    );
    const movementId = requiredRow(movementResult.rows[0], `movement ${row.key}`).id;

    if (movement.quantityDelta > 0) {
      let unitCost: number;
      let unitSellingPrice: number;
      if (movement.type === "SALES_RETURN" && saleAllocations.length > 0) {
        const totalCost = saleAllocations.reduce(
          (sum, allocation) => sum + allocation.quantity * allocation.unitCost,
          0,
        );
        const totalQty = saleAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        unitCost = totalQty > 0 ? totalCost / totalQty : 0;
        unitSellingPrice = resolveSellingPrice(row, costs, unitCost);
      } else {
        const cost = resolveCost(row, costs, allowUncosted);
        unitCost = cost.unitCost;
        unitSellingPrice = resolveSellingPrice(row, costs, unitCost, cost.unitSellingPrice);
      }
      const layerId = await createLayer(client, {
        stockUnitId: unit.stockUnitId,
        receivedAt: movementAt,
        quantity: movement.quantityDelta,
        unitCost,
        unitSellingPrice,
        sourceType: "HISTORICAL_IMPORT",
        sourceId: movementId,
      });
      await trackItem(
        client,
        batchId,
        `${row.key}:movement:${movementIndex}:layer`,
        "STOCK_LAYER",
        layerId,
        row,
        { movementId, unitCost, unitSellingPrice },
      );
      await recoverFifoDeficit({
        client,
        row,
        movementIndex,
        unit,
        actorId,
        batchId,
        fingerprint,
        layerId,
        receivedQty: movement.quantityDelta,
        actual,
        deficitByStockUnit,
      });
    } else if (movement.quantityDelta < 0) {
      const quantity = Math.abs(movement.quantityDelta);
      await ensureFifoCoverage({
        client,
        row,
        movementIndex,
        unit,
        actorId,
        batchId,
        fingerprint,
        movementAt,
        quantity,
        costs,
        allowUncosted,
        actual,
        deficitByStockUnit,
      });
      if (movement.type === "SALE") {
        if (readingId === null) {
          throw new Error(`SALE tanpa reading pada ${row.key}.`);
        }
        const sellingPrice = resolveSellingPrice(row, costs, 0);
        saleAllocations = await allocateMeterSale(
          client,
          readingId,
          unit.stockUnitId,
          quantity,
          sellingPrice,
          row.businessDate,
        );
      } else {
        await consumeFifoLayers(client, unit.stockUnitId, quantity, row.businessDate);
      }
    }

    await trackItem(
      client,
      batchId,
      `${row.key}:movement:${movementIndex}`,
      "MOVEMENT",
      movementId,
      row,
      { movementType: movement.type, classification: movement.classification, idempotencyKey: movementKey },
    );
    await writeAudit(client, {
      branchId: unit.branchId,
      actorId,
      action: "CREATE",
      objectType: "inventory_movement",
      objectId: movementId,
      reason: "Historical workbook import",
      occurredAt: movementAt,
      metadata: {
        ...provenance(row, batchId, fingerprint),
        movementType: movement.type,
        classification: movement.classification,
      },
    });
    actual.movements += 1;
  }

  if (row.physicalQty !== null) {
    const opnameAt = historicalTimestamp(row.businessDate, 20, 30, baseSecond);
    const opname = await client.query<{ id: string }>(
      `INSERT INTO stock_opname
        (stock_unit_id,business_date,system_qty,physical_qty,posting_status,created_at)
       VALUES($1,$2,$3,$4,'POSTED',$5)
       RETURNING id`,
      [unit.stockUnitId, row.businessDate, row.closingQty, row.physicalQty, opnameAt],
    );
    const opnameId = requiredRow(opname.rows[0], `opname ${row.key}`).id;
    await trackItem(client, batchId, `${row.key}:opname`, "STOCK_OPNAME", opnameId, row, {
      workbookVariance: row.varianceQty,
    });
    await writeAudit(client, {
      branchId: unit.branchId,
      actorId,
      action: "CREATE",
      objectType: "stock_opname",
      objectId: opnameId,
      reason: "Historical workbook import",
      occurredAt: opnameAt,
      metadata: provenance(row, batchId, fingerprint),
    });
    actual.stockOpnames += 1;
  }

  await trackItem(client, batchId, `${row.key}:row`, "ROW", null, row, {
    closingQty: row.closingQty,
    movementCount: row.movements.length,
  });
  actual.rows += 1;
}

async function createLayer(
  client: PoolClient,
  input: {
    stockUnitId: string;
    receivedAt: string;
    quantity: number;
    unitCost: number;
    unitSellingPrice: number;
    sourceType: string;
    sourceId: string;
  },
): Promise<string> {
  const sequence = await nextLayerSequence(client, input.stockUnitId);
  const result = await client.query<{ id: string }>(
    `INSERT INTO stock_layer
      (stock_unit_id,received_at,sequence_no,initial_qty,remaining_qty,unit_cost,
       unit_selling_price,source_type,source_id)
     VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.stockUnitId,
      input.receivedAt,
      sequence,
      input.quantity,
      roundMoney(input.unitCost),
      roundMoney(input.unitSellingPrice),
      input.sourceType,
      input.sourceId,
    ],
  );
  return requiredRow(result.rows[0], "stock layer").id;
}

async function ensureFifoCoverage(args: {
  client: PoolClient;
  row: HistoricalRow;
  movementIndex: number;
  unit: ResolvedUnit;
  actorId: string;
  batchId: string;
  fingerprint: string;
  movementAt: string;
  quantity: number;
  costs: CostSchedule | undefined;
  allowUncosted: boolean;
  actual: ImportActual;
  deficitByStockUnit: Map<string, number>;
}): Promise<void> {
  const {
    client,
    row,
    movementIndex,
    unit,
    actorId,
    batchId,
    fingerprint,
    movementAt,
    quantity,
    costs,
    allowUncosted,
    actual,
    deficitByStockUnit,
  } = args;
  const availableResult = await client.query<{ quantity: number | string }>(
    `SELECT COALESCE(sum(remaining_qty),0)::numeric AS quantity
     FROM stock_layer
     WHERE stock_unit_id=$1 AND remaining_qty>0
       AND received_at < $2::date + interval '1 day'`,
    [unit.stockUnitId, row.businessDate],
  );
  const available = Number(requiredRow(availableResult.rows[0], "available FIFO").quantity);
  const shortfall = roundQuantity(Math.max(0, quantity - available));
  if (shortfall <= 0) return;

  const cost = resolveCost(row, costs, allowUncosted);
  const sellingPrice = resolveSellingPrice(row, costs, cost.unitCost, cost.unitSellingPrice);
  const deficitAt = historicalTimestamp(
    row.businessDate,
    20,
    Math.max(1, 4 + movementIndex),
    row.source.row % 50,
  );
  const layerId = await createLayer(client, {
    stockUnitId: unit.stockUnitId,
    receivedAt: deficitAt,
    quantity: shortfall,
    unitCost: cost.unitCost,
    unitSellingPrice: sellingPrice,
    sourceType: "HISTORICAL_FIFO_DEFICIT",
    sourceId: batchId,
  });
  const outstanding = roundQuantity((deficitByStockUnit.get(unit.stockUnitId) ?? 0) + shortfall);
  deficitByStockUnit.set(unit.stockUnitId, outstanding);
  actual.fifoDeficitEvents += 1;
  actual.fifoDeficitCreatedQty = roundQuantity(actual.fifoDeficitCreatedQty + shortfall);

  await trackItem(
    client,
    batchId,
    `${row.key}:movement:${movementIndex}:fifo-deficit`,
    "STOCK_LAYER",
    layerId,
    row,
    {
      event: "FIFO_DEFICIT_CREATED",
      shortfall,
      outstanding,
      movementAt,
      unitCost: cost.unitCost,
      unitSellingPrice: sellingPrice,
    },
  );
  await writeAudit(client, {
    branchId: unit.branchId,
    actorId,
    action: "CREATE",
    objectType: "stock_layer",
    objectId: layerId,
    reason: "Historical FIFO deficit bridge",
    occurredAt: deficitAt,
    metadata: {
      ...provenance(row, batchId, fingerprint),
      event: "FIFO_DEFICIT_CREATED",
      shortfall,
      outstanding,
    },
  });
}

async function recoverFifoDeficit(args: {
  client: PoolClient;
  row: HistoricalRow;
  movementIndex: number;
  unit: ResolvedUnit;
  actorId: string;
  batchId: string;
  fingerprint: string;
  layerId: string;
  receivedQty: number;
  actual: ImportActual;
  deficitByStockUnit: Map<string, number>;
}): Promise<void> {
  const {
    client,
    row,
    movementIndex,
    unit,
    actorId,
    batchId,
    fingerprint,
    layerId,
    receivedQty,
    actual,
    deficitByStockUnit,
  } = args;
  const outstanding = deficitByStockUnit.get(unit.stockUnitId) ?? 0;
  const recovered = roundQuantity(Math.min(outstanding, receivedQty));
  if (recovered <= 0) return;

  const updated = await client.query<{ remaining_qty: number | string }>(
    `UPDATE stock_layer
     SET remaining_qty=remaining_qty-$2
     WHERE id=$1 AND remaining_qty >= $2
     RETURNING remaining_qty`,
    [layerId, recovered],
  );
  requiredRow(updated.rows[0], `deficit recovery layer ${layerId}`);
  const remainingDeficit = roundQuantity(Math.max(0, outstanding - recovered));
  deficitByStockUnit.set(unit.stockUnitId, remainingDeficit);
  actual.fifoDeficitRecoveredQty = roundQuantity(actual.fifoDeficitRecoveredQty + recovered);

  const occurredAt = historicalTimestamp(row.businessDate, 20, 45, row.source.row % 50);
  await trackItem(
    client,
    batchId,
    `${row.key}:movement:${movementIndex}:fifo-deficit-recovery`,
    "STOCK_LAYER",
    layerId,
    row,
    {
      event: "FIFO_DEFICIT_RECOVERED",
      recovered,
      remainingDeficit,
    },
  );
  await writeAudit(client, {
    branchId: unit.branchId,
    actorId,
    action: "RECONCILE",
    objectType: "stock_layer",
    objectId: layerId,
    reason: "Historical FIFO deficit recovery",
    occurredAt,
    metadata: {
      ...provenance(row, batchId, fingerprint),
      event: "FIFO_DEFICIT_RECOVERED",
      recovered,
      remainingDeficit,
    },
  });
}

async function resolveActor(client: PoolClient, email: string): Promise<string> {
  if (email.trim() === "") throw new Error("--actor-email wajib diisi.");
  const result = await client.query<{ id: string; active: boolean }>(
    "SELECT id,active FROM app_user WHERE email=$1 AND deleted_at IS NULL",
    [email],
  );
  const actor = requiredRow(result.rows[0], `actor ${email}`);
  if (!actor.active) throw new Error(`Actor ${email} tidak aktif.`);
  return actor.id;
}

async function assertActorCanBootstrapMaster(client: PoolClient, actorId: string): Promise<void> {
  const result = await client.query<{ role: string }>(
    "SELECT role::text AS role FROM app_user WHERE id=$1 AND active=true AND deleted_at IS NULL",
    [actorId],
  );
  if (result.rows[0]?.role !== "ADMIN") {
    throw new Error("--bootstrap-master hanya dapat dijalankan menggunakan actor dengan role ADMIN.");
  }
}

async function bootstrapMasterData(args: {
  client: PoolClient;
  payload: HistoricalPayload;
  config: MasterBootstrapConfig;
  actorId: string;
  fingerprint: string;
  apply: boolean;
  acknowledgeInferredCapacity: boolean;
}): Promise<MasterBootstrapSummary> {
  const { client, payload, config, actorId, fingerprint } = args;
  const targets = requiredMasterTargets(payload);
  validateBootstrapCoverage(config, targets);

  const inferredCapacities = targets
    .map((target) => {
      const unitConfig = requiredBootstrapUnit(config, target);
      if (unitConfig.capacityQty !== null && unitConfig.capacityQty !== undefined) return null;
      const observedMaximumQty = observedMaximumQtyForUnit(
        payload,
        target.branchCode,
        target.stockUnitCode,
      );
      return {
        sourceBranchCode: target.branchCode,
        existingBranchName: unitConfig.existingBranchName,
        stockUnitCode: target.stockUnitCode,
        observedMaximumQty,
        capacityQty: inferredCapacityQty(observedMaximumQty, config),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (args.apply && inferredCapacities.length > 0 && !args.acknowledgeInferredCapacity) {
    throw new Error(
      "Sebagian capacityQty masih diinferensikan dari maksimum stock historis. " +
        "Isi capacityQty aktual pada bootstrap file atau tambahkan --acknowledge-inferred-capacity.",
    );
  }

  const product = await resolveOrCreateBootstrapProduct(client, config, actorId, fingerprint);
  const summary: MasterBootstrapSummary = {
    productId: product.id,
    productCreated: product.created,
    stockUnitsCreated: 0,
    metersCreated: 0,
    assignmentsCreated: 0,
    inferredCapacities,
    resolvedBranches: [],
  };

  for (const target of targets.sort((left, right) =>
    `${left.branchCode}/${left.stockUnitCode}`.localeCompare(
      `${right.branchCode}/${right.stockUnitCode}`,
    ),
  )) {
    const unitConfig = requiredBootstrapUnit(config, target);
    const branchRow = await resolveExistingBranchByName(
      client,
      target.branchCode,
      unitConfig.existingBranchName,
      true,
    );
    if (
      !summary.resolvedBranches.some(
        (branch) => branch.sourceBranchCode === target.branchCode,
      )
    ) {
      summary.resolvedBranches.push({
        sourceBranchCode: target.branchCode,
        branchId: branchRow.id,
        branchCode: branchRow.code,
        branchName: branchRow.name,
      });
    }

    const observedMaximumQty = observedMaximumQtyForUnit(
      payload,
      target.branchCode,
      target.stockUnitCode,
    );
    const capacityQty =
      unitConfig.capacityQty ?? inferredCapacityQty(observedMaximumQty, config);
    const lowStockThresholdQty =
      unitConfig.lowStockThresholdQty ?? config.defaultLowStockThresholdQty;
    if (lowStockThresholdQty > capacityQty) {
      throw new Error(
        `Low-stock threshold ${target.branchCode}/${target.stockUnitCode} melebihi capacityQty.`,
      );
    }

    const stock = await resolveOrCreateBootstrapStockUnit({
      client,
      branchId: branchRow.id,
      productId: product.id,
      unitConfig,
      capacityQty,
      lowStockThresholdQty,
      actorId,
      fingerprint,
      inferredCapacity: unitConfig.capacityQty === null || unitConfig.capacityQty === undefined,
      observedMaximumQty,
    });
    if (stock.created) summary.stockUnitsCreated += 1;

    const meter = await resolveOrCreateBootstrapMeter({
      client,
      branchId: branchRow.id,
      unitConfig,
      actorId,
      fingerprint,
    });
    if (meter.created) summary.metersCreated += 1;

    const assignmentCreated = await ensureBootstrapAssignment({
      client,
      meterUnitId: meter.id,
      stockUnitId: stock.id,
      branchId: branchRow.id,
      validFrom: payload.startDate,
      throughDate: payload.throughDate,
      actorId,
      fingerprint,
      meterUnitCode: target.meterUnitCode,
      stockUnitCode: target.stockUnitCode,
    });
    if (assignmentCreated) summary.assignmentsCreated += 1;
  }

  console.info(
    JSON.stringify({
      level: "info",
      event: "historical_master_bootstrap_complete",
      mode: args.apply ? "APPLY" : "DRY_RUN",
      summary,
    }),
  );
  return summary;
}

async function resolveOrCreateBootstrapProduct(
  client: PoolClient,
  config: MasterBootstrapConfig,
  actorId: string,
  fingerprint: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await client.query<{
    id: string;
    name: string;
    unit: string;
    active: boolean;
  }>("SELECT id,name,unit,active FROM product WHERE code=$1 FOR UPDATE", [config.product.code]);
  const row = existing.rows[0];
  if (row !== undefined) {
    if (row.unit !== config.product.unit) {
      throw new Error(
        `Product ${config.product.code} sudah ada dengan unit ${row.unit}, bukan ${config.product.unit}.`,
      );
    }
    if (!row.active) {
      await client.query("UPDATE product SET active=true WHERE id=$1", [row.id]);
      await writeAudit(client, {
        branchId: null,
        actorId,
        action: "UPDATE",
        objectType: "product",
        objectId: row.id,
        reason: "Reactivated by historical master bootstrap",
        metadata: {
          entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
          importFingerprint: fingerprint,
          before: { active: false },
          after: { active: true },
        },
        occurredAt: new Date().toISOString(),
      });
    }
    return { id: row.id, created: false };
  }

  const created = await client.query<{ id: string }>(
    `INSERT INTO product (code,name,unit)
     VALUES($1,$2,$3)
     RETURNING id`,
    [config.product.code, config.product.name, config.product.unit],
  );
  const id = requiredRow(created.rows[0], "bootstrap product").id;
  await writeAudit(client, {
    branchId: null,
    actorId,
    action: "CREATE",
    objectType: "product",
    objectId: id,
    reason: "Created by historical master bootstrap",
    metadata: {
      entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
      importFingerprint: fingerprint,
      after: config.product,
    },
    occurredAt: new Date().toISOString(),
  });
  return { id, created: true };
}

async function resolveOrCreateBootstrapStockUnit(args: {
  client: PoolClient;
  branchId: string;
  productId: string;
  unitConfig: BootstrapUnitConfig;
  capacityQty: number;
  lowStockThresholdQty: number;
  actorId: string;
  fingerprint: string;
  inferredCapacity: boolean;
  observedMaximumQty: number;
}): Promise<{ id: string; created: boolean }> {
  const existing = await args.client.query<{
    id: string;
    product_id: string;
    active: boolean;
  }>(
    "SELECT id,product_id,active FROM stock_unit WHERE branch_id=$1 AND code=$2 FOR UPDATE",
    [args.branchId, args.unitConfig.stockUnitCode],
  );
  const row = existing.rows[0];
  if (row !== undefined) {
    if (row.product_id !== args.productId) {
      throw new Error(
        `Stock unit ${args.unitConfig.sourceBranchCode}/${args.unitConfig.stockUnitCode} ` +
          "sudah terhubung ke product lain.",
      );
    }
    if (!row.active) {
      await args.client.query("UPDATE stock_unit SET active=true WHERE id=$1", [row.id]);
      await writeAudit(args.client, {
        branchId: args.branchId,
        actorId: args.actorId,
        action: "UPDATE",
        objectType: "stock_unit",
        objectId: row.id,
        reason: "Reactivated by historical master bootstrap",
        metadata: {
          entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
          importFingerprint: args.fingerprint,
          before: { active: false },
          after: { active: true },
        },
        occurredAt: new Date().toISOString(),
      });
    }
    return { id: row.id, created: false };
  }

  const created = await args.client.query<{ id: string }>(
    `INSERT INTO stock_unit
      (branch_id,product_id,code,name,capacity_qty,low_stock_threshold_qty)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      args.branchId,
      args.productId,
      args.unitConfig.stockUnitCode,
      args.unitConfig.stockUnitName,
      args.capacityQty,
      args.lowStockThresholdQty,
    ],
  );
  const id = requiredRow(created.rows[0], "bootstrap stock unit").id;
  await writeAudit(args.client, {
    branchId: args.branchId,
    actorId: args.actorId,
    action: "CREATE",
    objectType: "stock_unit",
    objectId: id,
    reason: "Created by historical master bootstrap",
    metadata: {
      entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
      importFingerprint: args.fingerprint,
      after: {
        sourceBranchCode: args.unitConfig.sourceBranchCode,
        existingBranchName: args.unitConfig.existingBranchName,
        code: args.unitConfig.stockUnitCode,
        name: args.unitConfig.stockUnitName,
        capacityQty: args.capacityQty,
        lowStockThresholdQty: args.lowStockThresholdQty,
        capacitySource: args.inferredCapacity
          ? "INFERRED_FROM_HISTORICAL_OBSERVED_MAX"
          : "EXPLICIT_CONFIG",
        observedMaximumQty: args.observedMaximumQty,
      },
    },
    occurredAt: new Date().toISOString(),
  });
  return { id, created: true };
}

async function resolveOrCreateBootstrapMeter(args: {
  client: PoolClient;
  branchId: string;
  unitConfig: BootstrapUnitConfig;
  actorId: string;
  fingerprint: string;
}): Promise<{ id: string; created: boolean }> {
  const existing = await args.client.query<{ id: string; active: boolean }>(
    "SELECT id,active FROM meter_unit WHERE branch_id=$1 AND code=$2 FOR UPDATE",
    [args.branchId, args.unitConfig.meterUnitCode],
  );
  const row = existing.rows[0];
  if (row !== undefined) {
    if (!row.active) {
      await args.client.query("UPDATE meter_unit SET active=true WHERE id=$1", [row.id]);
      await writeAudit(args.client, {
        branchId: args.branchId,
        actorId: args.actorId,
        action: "UPDATE",
        objectType: "meter_unit",
        objectId: row.id,
        reason: "Reactivated by historical master bootstrap",
        metadata: {
          entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
          importFingerprint: args.fingerprint,
          before: { active: false },
          after: { active: true },
        },
        occurredAt: new Date().toISOString(),
      });
    }
    return { id: row.id, created: false };
  }

  const created = await args.client.query<{ id: string }>(
    `INSERT INTO meter_unit (branch_id,code,name)
     VALUES($1,$2,$3)
     RETURNING id`,
    [args.branchId, args.unitConfig.meterUnitCode, args.unitConfig.meterUnitName],
  );
  const id = requiredRow(created.rows[0], "bootstrap meter").id;
  await writeAudit(args.client, {
    branchId: args.branchId,
    actorId: args.actorId,
    action: "CREATE",
    objectType: "meter_unit",
    objectId: id,
    reason: "Created by historical master bootstrap",
    metadata: {
      entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
      importFingerprint: args.fingerprint,
      after: {
        code: args.unitConfig.meterUnitCode,
        name: args.unitConfig.meterUnitName,
      },
    },
    occurredAt: new Date().toISOString(),
  });
  return { id, created: true };
}

async function ensureBootstrapAssignment(args: {
  client: PoolClient;
  meterUnitId: string;
  stockUnitId: string;
  branchId: string;
  validFrom: string;
  throughDate: string;
  actorId: string;
  fingerprint: string;
  meterUnitCode: string;
  stockUnitCode: string;
}): Promise<boolean> {
  const overlapping = await args.client.query<{
    id: string;
    stock_unit_id: string;
    valid_from: string;
    valid_to: string | null;
  }>(
    `SELECT id,stock_unit_id,valid_from::text,valid_to::text
     FROM meter_stock_assignment
     WHERE meter_unit_id=$1
       AND valid_from <= $3::date
       AND (valid_to IS NULL OR valid_to >= $2::date)
     ORDER BY valid_from
     FOR UPDATE`,
    [args.meterUnitId, args.validFrom, args.throughDate],
  );

  const covering = overlapping.rows.find(
    (row) =>
      row.stock_unit_id === args.stockUnitId &&
      row.valid_from <= args.validFrom &&
      (row.valid_to === null || row.valid_to >= args.throughDate),
  );
  if (covering !== undefined && overlapping.rows.length === 1) return false;
  if (overlapping.rows.length > 0) {
    throw new Error(
      `Assignment ${args.meterUnitCode} memiliki pemetaan yang bertabrakan pada periode import.`,
    );
  }

  const future = await args.client.query<{ valid_from: string }>(
    `SELECT valid_from::text
     FROM meter_stock_assignment
     WHERE meter_unit_id=$1 AND valid_from>$2::date
     ORDER BY valid_from LIMIT 1
     FOR UPDATE`,
    [args.meterUnitId, args.throughDate],
  );
  const futureValidFrom = future.rows[0]?.valid_from ?? null;
  const created = await args.client.query<{ id: string; valid_to: string | null }>(
    `INSERT INTO meter_stock_assignment (meter_unit_id,stock_unit_id,valid_from,valid_to)
     VALUES($1,$2,$3::date,
       CASE WHEN $4::date IS NULL THEN NULL ELSE $4::date - 1 END)
     RETURNING id,valid_to::text`,
    [args.meterUnitId, args.stockUnitId, args.validFrom, futureValidFrom],
  );
  const assignment = requiredRow(created.rows[0], "bootstrap meter assignment");
  const id = assignment.id;
  await writeAudit(args.client, {
    branchId: args.branchId,
    actorId: args.actorId,
    action: "CREATE",
    objectType: "meter_stock_assignment",
    objectId: id,
    reason: "Created by historical master bootstrap",
    metadata: {
      entryMode: "HISTORICAL_MASTER_BOOTSTRAP",
      importFingerprint: args.fingerprint,
      after: {
        meterUnitCode: args.meterUnitCode,
        stockUnitCode: args.stockUnitCode,
        validFrom: args.validFrom,
        validTo: assignment.valid_to,
      },
    },
    occurredAt: new Date().toISOString(),
  });
  return true;
}

function requiredMasterTargets(payload: HistoricalPayload): RequiredMasterTarget[] {
  const targets = new Map<string, RequiredMasterTarget>();
  for (const row of payload.rows) {
    const key = unitKey(row.branchCode, row.stockUnitCode);
    const current = targets.get(key);
    if (current !== undefined && current.meterUnitCode !== row.meterUnitCode) {
      throw new Error(`Payload memetakan lebih dari satu meter ke ${key}.`);
    }
    targets.set(key, {
      branchCode: row.branchCode,
      stockUnitCode: row.stockUnitCode,
      meterUnitCode: row.meterUnitCode,
    });
  }
  return [...targets.values()];
}

function validateBootstrapCoverage(
  config: MasterBootstrapConfig,
  targets: RequiredMasterTarget[],
): void {
  const configured = new Map<string, BootstrapUnitConfig>();
  for (const unit of config.units) {
    const key = unitKey(unit.sourceBranchCode, unit.stockUnitCode);
    if (configured.has(key)) throw new Error(`Bootstrap unit duplikat: ${key}.`);
    configured.set(key, unit);
  }
  const branchNamesBySource = new Map<string, string>();
  for (const unit of config.units) {
    const normalizedName = normalizeBranchName(unit.existingBranchName);
    const previous = branchNamesBySource.get(unit.sourceBranchCode);
    if (previous !== undefined && previous !== normalizedName) {
      throw new Error(
        `Source branch ${unit.sourceBranchCode} dipetakan ke lebih dari satu nama branch production.`,
      );
    }
    branchNamesBySource.set(unit.sourceBranchCode, normalizedName);
  }
  for (const target of targets) {
    const unit = configured.get(unitKey(target.branchCode, target.stockUnitCode));
    if (unit === undefined) {
      throw new Error(
        `Bootstrap config belum memuat ${target.branchCode}/${target.stockUnitCode}.`,
      );
    }
    if (unit.meterUnitCode !== target.meterUnitCode) {
      throw new Error(
        `Meter config ${target.branchCode}/${target.stockUnitCode} harus ${target.meterUnitCode}.`,
      );
    }
  }
}

function requiredBootstrapUnit(
  config: MasterBootstrapConfig,
  target: RequiredMasterTarget,
): BootstrapUnitConfig {
  return requiredRow(
    config.units.find(
      (unit) =>
        unit.sourceBranchCode === target.branchCode &&
        unit.stockUnitCode === target.stockUnitCode,
    ),
    `bootstrap config ${target.branchCode}/${target.stockUnitCode}`,
  );
}

function observedMaximumQtyForUnit(
  payload: HistoricalPayload,
  branchCode: string,
  stockUnitCode: string,
): number {
  const values = payload.rows
    .filter(
      (row) => row.branchCode === branchCode && row.stockUnitCode === stockUnitCode,
    )
    .flatMap((row) => [row.closingQty, row.physicalQty])
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const maximum = Math.max(...values);
  if (!Number.isFinite(maximum) || maximum <= 0) {
    throw new Error(`Tidak dapat menginferensikan capacity untuk ${branchCode}/${stockUnitCode}.`);
  }
  return roundQuantity(maximum);
}

function inferredCapacityQty(
  observedMaximumQty: number,
  config: MasterBootstrapConfig,
): number {
  const step = config.capacityPolicy.roundingStepQty;
  return roundQuantity(
    Math.max(config.capacityPolicy.minimumCapacityQty, Math.ceil(observedMaximumQty / step) * step),
  );
}

async function resolveUnits(
  client: PoolClient,
  payload: HistoricalPayload,
  bootstrapConfig?: MasterBootstrapConfig,
): Promise<Map<string, ResolvedUnit>> {
  const result = new Map<string, ResolvedUnit>();
  const required = new Map<
    string,
    { branchCode: string; stockUnitCode: string; meterCodes: Set<string> }
  >();
  for (const row of payload.rows) {
    const key = unitKey(row.branchCode, row.stockUnitCode);
    const current = required.get(key) ?? {
      branchCode: row.branchCode,
      stockUnitCode: row.stockUnitCode,
      meterCodes: new Set<string>(),
    };
    if (row.meterStart !== null && row.meterEnd !== null) current.meterCodes.add(row.meterUnitCode);
    required.set(key, current);
  }

  for (const item of required.values()) {
    const branch =
      bootstrapConfig === undefined
        ? await resolveExistingBranchByCode(client, item.branchCode)
        : await resolveExistingBranchByName(
            client,
            item.branchCode,
            branchNameForSource(bootstrapConfig, item.branchCode),
            false,
          );
    const stock = await client.query<{ id: string }>(
      `SELECT id FROM stock_unit
       WHERE branch_id=$1 AND code=$2 AND active=true`,
      [branch.id, item.stockUnitCode],
    );
    if (stock.rows.length !== 1) {
      throw new Error(
        `Stock unit aktif tidak ditemukan atau ambigu untuk source ${item.branchCode}/${item.stockUnitCode} ` +
          `pada branch production ${branch.name} (${branch.code}).`,
      );
    }
    const stockUnitId = requiredRow(stock.rows[0], `stock unit ${item.stockUnitCode}`).id;

    let meterUnitId: string | null = null;
    if (item.meterCodes.size > 1) {
      throw new Error(`Lebih dari satu meter dipetakan ke ${item.branchCode}/${item.stockUnitCode}.`);
    }
    const meterCode = [...item.meterCodes][0];
    if (meterCode !== undefined) {
      const meter = await client.query<{ id: string }>(
        "SELECT id FROM meter_unit WHERE branch_id=$1 AND code=$2 AND active=true",
        [branch.id, meterCode],
      );
      if (meter.rows.length !== 1) {
        throw new Error(
          `Meter aktif tidak ditemukan atau ambigu untuk source ${item.branchCode}/${meterCode} ` +
            `pada branch production ${branch.name} (${branch.code}).`,
        );
      }
      meterUnitId = requiredRow(meter.rows[0], `meter ${item.branchCode}/${meterCode}`).id;
      const assignment = await client.query<{ stock_unit_id: string }>(
        `SELECT stock_unit_id FROM meter_stock_assignment
         WHERE meter_unit_id=$1 AND valid_from <= $2::date
           AND (valid_to IS NULL OR valid_to >= $3::date)
         ORDER BY valid_from DESC LIMIT 1`,
        [meterUnitId, payload.startDate, payload.throughDate],
      );
      if (assignment.rows[0]?.stock_unit_id !== stockUnitId) {
        throw new Error(
          `Assignment meter ${item.branchCode}/${meterCode} tidak mencakup seluruh periode import ke ${item.stockUnitCode}.`,
        );
      }
    }

    result.set(unitKey(item.branchCode, item.stockUnitCode), {
      branchId: branch.id,
      stockUnitId,
      meterUnitId,
    });
  }
  return result;
}

interface ExistingBranchRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

async function resolveExistingBranchByName(
  client: PoolClient,
  sourceBranchCode: string,
  existingBranchName: string,
  lock: boolean,
): Promise<ExistingBranchRow> {
  const result = await client.query<ExistingBranchRow>(
    `SELECT id,code,name,active FROM branch
     WHERE (
       lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) =
         lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
       OR lower(regexp_replace(btrim(code), '[[:space:]]+', ' ', 'g')) =
         lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
       OR lower(regexp_replace(btrim(name || ' - ' || code), '[[:space:]]+', ' ', 'g')) =
         lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
     )
     ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [existingBranchName],
  );
  if (result.rows.length === 0) {
    throw new Error(
      `Branch production untuk source ${sourceBranchCode} tidak ditemukan dengan nama, kode, atau label: ${existingBranchName}.`,
    );
  }
  if (result.rows.length > 1) {
    throw new Error(
      `Identifier branch production ambigu untuk source ${sourceBranchCode}: ${existingBranchName}. ` +
        "Pastikan hanya ada satu branch yang cocok.",
    );
  }
  const branch = requiredRow(result.rows[0], `branch ${existingBranchName}`);
  if (!branch.active) {
    throw new Error(
      `Branch production ${branch.name} (${branch.code}) untuk source ${sourceBranchCode} tidak aktif.`,
    );
  }
  return branch;
}

async function resolveExistingBranchByCode(
  client: PoolClient,
  branchCode: string,
): Promise<ExistingBranchRow> {
  const result = await client.query<ExistingBranchRow>(
    "SELECT id,code,name,active FROM branch WHERE code=$1",
    [branchCode],
  );
  const branch = requiredRow(result.rows[0], `branch code ${branchCode}`);
  if (!branch.active) throw new Error(`Branch ${branch.name} (${branch.code}) tidak aktif.`);
  return branch;
}

function branchNameForSource(
  config: MasterBootstrapConfig,
  sourceBranchCode: string,
): string {
  const names = new Set(
    config.units
      .filter((unit) => unit.sourceBranchCode === sourceBranchCode)
      .map((unit) => normalizeBranchName(unit.existingBranchName)),
  );
  if (names.size !== 1) {
    throw new Error(
      `Bootstrap config harus memetakan source branch ${sourceBranchCode} ke tepat satu nama branch production.`,
    );
  }
  return requiredRow([...names][0], `branch mapping ${sourceBranchCode}`);
}

function normalizeBranchName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function lockOperationalTargets(
  client: PoolClient,
  units: Map<string, ResolvedUnit>,
): Promise<void> {
  const stockIds = [...new Set([...units.values()].map((unit) => unit.stockUnitId))];
  const meterIds = [
    ...new Set(
      [...units.values()]
        .map((unit) => unit.meterUnitId)
        .filter((id): id is string => id !== null),
    ),
  ];
  await client.query(
    "SELECT id FROM stock_unit WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
    [stockIds],
  );
  if (meterIds.length > 0) {
    await client.query(
      "SELECT id FROM meter_unit WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [meterIds],
    );
  }
}

async function assertOperationalTargetsAreEmpty(
  client: PoolClient,
  units: Map<string, ResolvedUnit>,
): Promise<void> {
  const stockIds = [...units.values()].map((unit) => unit.stockUnitId);
  const meterIds = [...units.values()]
    .map((unit) => unit.meterUnitId)
    .filter((id): id is string => id !== null);
  const result = await client.query<{
    movement_count: number;
    layer_count: number;
    reading_count: number;
    opname_count: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM inventory_movement WHERE stock_unit_id=ANY($1::uuid[])) AS movement_count,
       (SELECT count(*)::int FROM stock_layer WHERE stock_unit_id=ANY($1::uuid[])) AS layer_count,
       (SELECT count(*)::int FROM sales_meter_reading WHERE meter_unit_id=ANY($2::uuid[])) AS reading_count,
       (SELECT count(*)::int FROM stock_opname WHERE stock_unit_id=ANY($1::uuid[])) AS opname_count`,
    [stockIds, meterIds],
  );
  const counts = requiredRow(result.rows[0], "existing activity counts");
  if (
    counts.movement_count > 0 ||
    counts.layer_count > 0 ||
    counts.reading_count > 0 ||
    counts.opname_count > 0
  ) {
    throw new Error(
      "Unit target sudah memiliki aktivitas operasional/FIFO. Import backdated tidak aman karena dapat " +
        `mengubah urutan FIFO. Counts=${JSON.stringify(counts)}. Gunakan clone/staging dan lakukan full replay.`,
    );
  }
}

function verifyNoOutstandingDeficits(deficitByStockUnit: Map<string, number>): void {
  const outstanding = [...deficitByStockUnit.entries()].filter(([, quantity]) => quantity > 0.01);
  if (outstanding.length > 0) {
    throw new Error(`FIFO deficit belum pulih pada akhir payload: ${JSON.stringify(outstanding)}.`);
  }
}

async function verifyFinalBalances(
  client: PoolClient,
  payload: HistoricalPayload,
  units: Map<string, ResolvedUnit>,
): Promise<void> {
  for (const expected of payload.expected.finalBalances) {
    const unit = units.get(unitKey(expected.branchCode, expected.stockUnitCode));
    if (unit === undefined) throw new Error("Expected unit tidak ditemukan.");
    const movement = await client.query<{ quantity: number }>(
      `SELECT COALESCE(sum(quantity_delta),0)::numeric AS quantity
       FROM inventory_movement WHERE stock_unit_id=$1 AND posting_status='POSTED'`,
      [unit.stockUnitId],
    );
    const layers = await client.query<{ quantity: number }>(
      "SELECT COALESCE(sum(remaining_qty),0)::numeric AS quantity FROM stock_layer WHERE stock_unit_id=$1",
      [unit.stockUnitId],
    );
    const ledgerQty = Number(requiredRow(movement.rows[0], "movement balance").quantity);
    const layerQty = Number(requiredRow(layers.rows[0], "layer balance").quantity);
    assertNear(ledgerQty, expected.quantity, `${expected.branchCode}/${expected.stockUnitCode} ledger`);
    assertNear(layerQty, expected.quantity, `${expected.branchCode}/${expected.stockUnitCode} FIFO`);
  }
}

async function verifyCounts(
  payload: HistoricalPayload,
  actual: ImportActual,
): Promise<void> {
  const expected = payload.expected.counts;
  for (const key of ["rows", "movements", "meterReadings", "stockOpnames"] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Count ${key} tidak cocok: expected=${expected[key]}, actual=${actual[key]}.`);
    }
  }
  if (actual.fifoDeficitEvents !== payload.expected.fifoBridge.events) {
    throw new Error(
      `FIFO bridge event count tidak cocok: expected=${payload.expected.fifoBridge.events}, ` +
        `actual=${actual.fifoDeficitEvents}.`,
    );
  }
  assertNear(
    actual.fifoDeficitCreatedQty,
    payload.expected.fifoBridge.createdQty,
    "FIFO bridge created quantity",
  );
  assertNear(
    actual.fifoDeficitRecoveredQty,
    payload.expected.fifoBridge.recoveredQty,
    "FIFO bridge recovered quantity",
  );
}

async function createBatch(
  client: PoolClient,
  payload: HistoricalPayload,
  fingerprint: string,
  actorId: string,
  costMode: "SCHEDULED" | "UNCOSTED",
): Promise<string> {
  const counts = payload.expected.counts;
  const result = await client.query<{ id: string }>(
    `INSERT INTO historical_import_batch
      (fingerprint,import_name,source_files,start_date,through_date,actor_id,row_count,
       movement_count,meter_reading_count,stock_opname_count,cost_mode,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      fingerprint,
      payload.name,
      JSON.stringify(payload.sourceFiles),
      payload.startDate,
      payload.throughDate,
      actorId,
      counts.rows,
      counts.movements,
      counts.meterReadings,
      counts.stockOpnames,
      costMode,
      JSON.stringify({ timezone: payload.timezone, warnings: payload.warnings }),
    ],
  );
  return requiredRow(result.rows[0], "historical import batch").id;
}

async function trackItem(
  client: PoolClient,
  batchId: string,
  itemKey: string,
  itemType: "ROW" | "MOVEMENT" | "METER_READING" | "STOCK_OPNAME" | "STOCK_LAYER",
  objectId: string | null,
  row: HistoricalRow,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO historical_import_item
      (batch_id,item_key,item_type,object_id,source_file,source_sheet,source_row,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      batchId,
      itemKey,
      itemType,
      objectId,
      row.source.file,
      row.source.sheet,
      row.source.row,
      JSON.stringify(metadata),
    ],
  );
}

async function writeAudit(
  client: PoolClient,
  input: {
    branchId: string | null;
    actorId: string;
    action: string;
    objectType: string;
    objectId: string;
    reason: string;
    metadata: Record<string, unknown>;
    occurredAt: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log
      (branch_id,actor_id,action,object_type,object_id,reason,metadata,occurred_at,outcome,impact_scope)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SUCCEEDED','SHARED')`,
    [
      input.branchId,
      input.actorId,
      input.action,
      input.objectType,
      input.objectId,
      input.reason,
      JSON.stringify(input.metadata),
      input.occurredAt,
    ],
  );
}

function resolveCost(
  row: HistoricalRow,
  schedule: CostSchedule | undefined,
  allowUncosted: boolean,
): { unitCost: number; unitSellingPrice: number | undefined } {
  const rule = findCostRule(row, schedule);
  if (rule?.unitCost !== null && rule?.unitCost !== undefined && rule.unitCost >= 0) {
    return {
      unitCost: rule.unitCost,
      unitSellingPrice:
        rule.unitSellingPrice !== null && rule.unitSellingPrice !== undefined
          ? rule.unitSellingPrice
          : undefined,
    };
  }
  if (allowUncosted) return { unitCost: 0, unitSellingPrice: undefined };
  throw new Error(`Harga pokok tidak tersedia untuk ${row.branchCode}/${row.stockUnitCode} ${row.businessDate}.`);
}

function resolveSellingPrice(
  row: HistoricalRow,
  schedule: CostSchedule | undefined,
  unitCost: number,
  ruleSellingPrice?: number,
): number {
  const rule = findCostRule(row, schedule);
  const candidate = row.effectiveSellingPrice ?? ruleSellingPrice ?? rule?.unitSellingPrice ?? unitCost;
  if (!Number.isFinite(candidate) || candidate < unitCost || candidate < 0) {
    throw new Error(
      `Harga jual invalid untuk ${row.branchCode}/${row.stockUnitCode} ${row.businessDate}: ` +
        `selling=${String(candidate)}, cost=${unitCost}.`,
    );
  }
  return candidate;
}

function findCostRule(row: HistoricalRow, schedule: CostSchedule | undefined): CostRule | undefined {
  if (schedule === undefined) return undefined;
  return schedule.rules
    .filter(
      (rule) =>
        rule.branchCode === row.branchCode &&
        (rule.stockUnitCode === row.stockUnitCode || rule.stockUnitCode === "*") &&
        rule.validFrom <= row.businessDate &&
        (rule.validTo === undefined || rule.validTo === null || rule.validTo >= row.businessDate),
    )
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
}

function collectMissingCosts(
  payload: HistoricalPayload,
  schedule: CostSchedule | undefined,
): string[] {
  const missing = new Set<string>();
  for (const row of payload.rows) {
    if (row.movements.length === 0) continue;
    const rule = findCostRule(row, schedule);
    if (rule?.unitCost === null || rule?.unitCost === undefined || !Number.isFinite(rule.unitCost)) {
      missing.add(`${row.branchCode}/${row.stockUnitCode}@${row.businessDate}`);
    }
  }
  return [...missing].slice(0, 20);
}

function validatePayload(payload: HistoricalPayload): void {
  if (payload.version !== 1) throw new Error(`Payload version ${payload.version} tidak didukung.`);
  if (payload.rows.length !== payload.expected.counts.rows) throw new Error("Row count payload tidak cocok.");
  if (payload.rows.some((row) => row.businessDate > payload.throughDate)) {
    throw new Error("Payload memuat tanggal setelah throughDate.");
  }
  const movementCount = payload.rows.reduce((sum, row) => sum + row.movements.length, 0);
  if (movementCount !== payload.expected.counts.movements) throw new Error("Movement count payload tidak cocok.");
  const keys = new Set<string>();
  let previousDate = "";
  for (const row of payload.rows) {
    if (row.businessDate < previousDate) {
      throw new Error(`Payload tidak kronologis pada ${row.key}.`);
    }
    previousDate = row.businessDate;
    if (keys.has(row.key)) throw new Error(`Duplicate row key ${row.key}.`);
    keys.add(row.key);
    const delta = row.movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
    if (!Number.isFinite(delta)) throw new Error(`Non-finite movement pada ${row.key}.`);
  }
}

function validateWarnings(payload: HistoricalPayload, options: Options): void {
  const blocking = payload.warnings.filter((warning) => warning.severity === "blocking");
  if (blocking.length > 0) {
    throw new Error(`Payload memiliki blocking warning: ${JSON.stringify(blocking)}.`);
  }
  if (payload.warnings.length > 0 && options.apply && !options.acknowledgeSourceWarnings) {
    throw new Error(
      `Terdapat ${payload.warnings.length} source warning. Review lalu tambahkan --acknowledge-source-warnings.`,
    );
  }
}

async function ensureTrackingMigration(client: PoolClient): Promise<void> {
  const result = await client.query<{ batch_table: string | null; item_table: string | null }>(
    `SELECT to_regclass('historical_import_batch')::text AS batch_table,
            to_regclass('historical_import_item')::text AS item_table`,
  );
  const row = requiredRow(result.rows[0], "tracking migration check");
  if (row.batch_table === null || row.item_table === null) {
    throw new Error("Migration 007_historical_import_tracking.sql belum dijalankan.");
  }
}

async function readMasterBootstrapConfig(path: string): Promise<MasterBootstrapConfig> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as MasterBootstrapConfig;
  if (
    parsed.version !== 2 ||
    parsed.product === undefined ||
    typeof parsed.product.code !== "string" ||
    typeof parsed.product.name !== "string" ||
    typeof parsed.product.unit !== "string" ||
    parsed.capacityPolicy === undefined ||
    !Number.isFinite(parsed.capacityPolicy.roundingStepQty) ||
    parsed.capacityPolicy.roundingStepQty <= 0 ||
    !Number.isFinite(parsed.capacityPolicy.minimumCapacityQty) ||
    parsed.capacityPolicy.minimumCapacityQty <= 0 ||
    !Number.isFinite(parsed.defaultLowStockThresholdQty) ||
    parsed.defaultLowStockThresholdQty < 0 ||
    !Array.isArray(parsed.units)
  ) {
    throw new Error("Historical master bootstrap config tidak valid.");
  }
  for (const unit of parsed.units) {
    if (
      typeof unit.sourceBranchCode !== "string" ||
      unit.sourceBranchCode.trim() === "" ||
      typeof unit.existingBranchName !== "string" ||
      unit.existingBranchName.trim() === "" ||
      typeof unit.stockUnitCode !== "string" ||
      typeof unit.stockUnitName !== "string" ||
      typeof unit.meterUnitCode !== "string" ||
      typeof unit.meterUnitName !== "string" ||
      (unit.capacityQty !== undefined &&
        unit.capacityQty !== null &&
        (!Number.isFinite(unit.capacityQty) || unit.capacityQty <= 0)) ||
      (unit.lowStockThresholdQty !== undefined &&
        unit.lowStockThresholdQty !== null &&
        (!Number.isFinite(unit.lowStockThresholdQty) || unit.lowStockThresholdQty < 0))
    ) {
      throw new Error(`Bootstrap unit config tidak valid: ${JSON.stringify(unit)}.`);
    }
  }
  return parsed;
}

async function readCostSchedule(path: string): Promise<CostSchedule> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as CostSchedule;
  if (parsed.version !== 1 || !Array.isArray(parsed.rules)) {
    throw new Error("Cost schedule tidak valid.");
  }
  return parsed;
}

function parsePayload(value: string): HistoricalPayload {
  return JSON.parse(value) as HistoricalPayload;
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    file: DEFAULT_FILE,
    actorEmail: "",
    apply: false,
    allowUncosted: false,
    acknowledgeSourceWarnings: false,
    bootstrapMaster: false,
    bootstrapFile: DEFAULT_BOOTSTRAP_FILE,
    acknowledgeInferredCapacity: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--allow-uncosted") options.allowUncosted = true;
    else if (arg === "--acknowledge-source-warnings") options.acknowledgeSourceWarnings = true;
    else if (arg === "--bootstrap-master") options.bootstrapMaster = true;
    else if (arg === "--acknowledge-inferred-capacity")
      options.acknowledgeInferredCapacity = true;
    else if (arg === "--file") options.file = requiredArg(args[++index], "--file");
    else if (arg === "--actor-email") options.actorEmail = requiredArg(args[++index], "--actor-email");
    else if (arg === "--cost-file") options.costFile = requiredArg(args[++index], "--cost-file");
    else if (arg === "--bootstrap-file")
      options.bootstrapFile = requiredArg(args[++index], "--bootstrap-file");
    else throw new Error(`Argumen tidak dikenal: ${String(arg)}.`);
  }
  return options;
}

function provenance(
  row: HistoricalRow,
  batchId: string,
  fingerprint: string,
): Record<string, unknown> {
  return {
    entryMode: "HISTORICAL_IMPORT",
    importBatchId: batchId,
    importFingerprint: fingerprint,
    businessDate: row.businessDate,
    shiftCode: row.shiftCode,
    sourceFile: row.source.file,
    sourceSheet: row.source.sheet,
    sourceRow: row.source.row,
    workbookNote: row.note,
  };
}

function reconciliationStatus(row: HistoricalRow): "MATCHED" | "PENDING" {
  if (row.meterSalesQty === null) return "PENDING";
  if (row.meterSalesQty === 0 && row.cashDepositAmount === 0) return "MATCHED";
  if (row.effectiveSellingPrice === null) return "PENDING";
  const expectedCash = row.meterSalesQty * row.effectiveSellingPrice;
  return Math.abs(row.cashDepositAmount - expectedCash) <= 1 ? "MATCHED" : "PENDING";
}

function historicalTimestamp(
  businessDate: string,
  hour: number,
  minute: number,
  second: number,
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${businessDate}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`;
}

function unitKey(branchCode: string, stockUnitCode: string): string {
  return `${branchCode}/${stockUnitCode}`;
}

function requiredRow<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`${description} tidak ditemukan.`);
  return value;
}

function requiredArg(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${name} membutuhkan nilai.`);
  return value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function assertNear(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${label} tidak cocok: expected=${expected}, actual=${actual}.`);
  }
}
