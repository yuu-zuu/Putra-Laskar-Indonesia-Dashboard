import type {
  Branch,
  CreateBranchInput,
  CreateMeterUnitInput,
  CreateProductInput,
  CreateStockUnitInput,
  MeterUnit,
  Product,
  StockUnit,
  UpdateBranchInput,
  UpdateMeterUnitInput,
  UpdateStockUnitInput,
} from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { pool } from "../db/client.js";
import type { Router } from "../http/router.js";
import { queryParam } from "../http/request.js";
import { readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { AppError } from "../lib/errors.js";
import {
  booleanField,
  dateField,
  numberField,
  objectBody,
  stringField,
} from "../lib/validation.js";
import { writeAudit } from "../lib/audit.js";
import { inTransaction } from "../db/transaction.js";

export function registerMasterRoutes(router: Router): void {
  router.add("GET", "/api/v1/branches", async ({ request, response }) => {
    const user = await requireUser(request);
    const result = await pool.query<Branch>(
      `SELECT id, code, name, timezone, active FROM branch
       WHERE active = true AND ($1::boolean OR id = $2) ORDER BY name`,
      [user.role === "ADMIN", user.branchId],
    );
    sendJson(response, 200, { items: result.rows });
  });

  router.add("POST", "/api/v1/branches", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN"]);
    const input = parseCreateBranch(await readJson(request));
    const created = await inTransaction(async (client) => {
      const result = await client.query<Branch>(
        `INSERT INTO branch (code,name,timezone) VALUES ($1,$2,$3)
         RETURNING id,code,name,timezone,active`,
        [input.code, input.name, input.timezone],
      );
      const branch = requiredRow(result.rows[0], "Branch insert did not return a row.");
      await writeAudit(
        {
          branchId: branch.id,
          actorId: user.id,
          action: "CREATE",
          objectType: "branch",
          objectId: branch.id,
          metadata: { after: branch },
        },
        client,
      );
      return branch;
    });
    sendJson(response, 201, created);
  });

  router.add("PATCH", "/api/v1/branches/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN"]);
    const input = parseUpdateBranch(await readJson(request));
    const updated = await inTransaction(async (client) => {
      const result = await client.query<Branch & { before_data: Branch }>(
        `WITH previous AS MATERIALIZED (SELECT id,code,name,timezone,active FROM branch WHERE id=$1),
       updated AS (UPDATE branch target SET name=$2,timezone=$3,active=$4,updated_at=now()
         FROM previous WHERE target.id=previous.id
         RETURNING target.id,target.code,target.name,target.timezone,target.active,to_jsonb(previous) AS before_data)
       SELECT * FROM updated`,
        [params.id, input.name, input.timezone, input.active],
      );
      const row = result.rows[0];
      if (row === undefined) throw new AppError(404, "BRANCH_NOT_FOUND", "Cabang tidak ditemukan.");
      const { before_data: before, ...branch } = row;
      await writeAudit(
        {
          branchId: branch.id,
          actorId: user.id,
          action: "UPDATE",
          objectType: "branch",
          objectId: branch.id,
          metadata: { before, after: branch },
        },
        client,
      );
      return branch;
    });
    sendJson(response, 200, updated);
  });

  router.add("GET", "/api/v1/products", async ({ request, response }) => {
    await requireUser(request);
    const result = await pool.query<Product>(
      "SELECT id, code, name, unit, active FROM product WHERE active=true ORDER BY name",
    );
    sendJson(response, 200, { items: result.rows });
  });

  router.add("POST", "/api/v1/products", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN"]);
    const input = parseCreateProduct(await readJson(request));
    try {
      const created = await inTransaction(async (client) => {
        const result = await client.query<Product>(
          `INSERT INTO product (code,name,unit) VALUES($1,$2,$3)
           RETURNING id,code,name,unit,active`,
          [input.code, input.name, input.unit],
        );
        const product = requiredRow(result.rows[0], "Product insert did not return a row.");
        await writeAudit(
          {
            branchId: null,
            actorId: user.id,
            action: "CREATE",
            objectType: "product",
            objectId: product.id,
            metadata: { after: product },
          },
          client,
        );
        return product;
      });
      sendJson(response, 201, created);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new AppError(409, "PRODUCT_CODE_EXISTS", "Kode produk sudah digunakan.");
      }
      throw error;
    }
  });

  router.add("GET", "/api/v1/stock-units", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranchScope(user.role, user.branchId, branchId);
    const result = await pool.query<StockRow>(
      `SELECT unit.id, unit.branch_id, unit.code, unit.name, product.name AS product_name,
        unit.capacity_qty, unit.low_stock_threshold_qty, unit.active
       FROM stock_unit unit JOIN product ON product.id = unit.product_id
       WHERE unit.branch_id = $1 ORDER BY unit.name`,
      [branchId],
    );
    sendJson(response, 200, { items: result.rows.map(mapStock) });
  });

  router.add("GET", "/api/v1/meter-units", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranchScope(user.role, user.branchId, branchId);
    const date = queryParam(url, "date", false) ?? new Date().toISOString().slice(0, 10);
    const result = await pool.query<{
      id: string;
      branch_id: string;
      code: string;
      name: string;
      stock_unit_id: string;
      stock_unit_name: string;
      active: boolean;
    }>(
      `SELECT meter.id,meter.branch_id,meter.code,meter.name,
        assignment.stock_unit_id,stock.name AS stock_unit_name,meter.active
       FROM meter_unit meter
       JOIN meter_stock_assignment assignment ON assignment.meter_unit_id=meter.id
         AND assignment.valid_from<=$2::date
         AND (assignment.valid_to IS NULL OR assignment.valid_to>=$2::date)
       JOIN stock_unit stock ON stock.id=assignment.stock_unit_id
       WHERE meter.branch_id=$1 ORDER BY meter.name`,
      [branchId, date],
    );
    const items: MeterUnit[] = result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      code: row.code,
      name: row.name,
      stockUnitId: row.stock_unit_id,
      stockUnitName: row.stock_unit_name,
      active: row.active,
    }));
    sendJson(response, 200, { items });
  });

  router.add("POST", "/api/v1/stock-units", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const input = parseCreateStock(await readJson(request));
    assertBranchScope(user.role, user.branchId, input.branchId);
    const row = await inTransaction(async (client) => {
      const result = await client.query<StockRow>(
        `INSERT INTO stock_unit (branch_id,product_id,code,name,capacity_qty,low_stock_threshold_qty)
         SELECT $1,product.id,$3,$4,$5,$6 FROM product
         WHERE product.id=$2 AND product.active=true
         RETURNING id,branch_id,code,name,(SELECT name FROM product WHERE id=$2) AS product_name,
           capacity_qty,low_stock_threshold_qty,active`,
        [
          input.branchId,
          input.productId,
          input.code,
          input.name,
          input.capacityQty,
          input.lowStockThresholdQty,
        ],
      );
      const stock = result.rows[0];
      if (stock === undefined)
        throw new AppError(422, "INVALID_PRODUCT", "Produk tidak aktif atau tidak ditemukan.");
      await writeAudit(
        {
          branchId: input.branchId,
          actorId: user.id,
          action: "CREATE",
          objectType: "stock_unit",
          objectId: stock.id,
          metadata: { after: mapStock(stock) },
        },
        client,
      );
      return stock;
    });
    sendJson(response, 201, mapStock(row));
  });

  router.add("PATCH", "/api/v1/stock-units/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const input = parseUpdateStock(await readJson(request));
    const { after } = await inTransaction(async (client) => {
      const result = await client.query<StockRow & { before_data: StockRow }>(
        `WITH previous AS MATERIALIZED (SELECT unit.id,unit.branch_id,unit.code,unit.name,product.name AS product_name,
         unit.capacity_qty,unit.low_stock_threshold_qty,unit.active FROM stock_unit unit JOIN product ON product.id=unit.product_id
         WHERE unit.id=$1 AND ($6::boolean OR unit.branch_id=$7)),
       updated AS (UPDATE stock_unit unit SET name=$2,capacity_qty=$3,low_stock_threshold_qty=$4,active=$5
         FROM previous WHERE unit.id=previous.id RETURNING unit.id,unit.branch_id,unit.code,unit.name,
         previous.product_name,unit.capacity_qty,unit.low_stock_threshold_qty,unit.active,to_jsonb(previous) AS before_data)
       SELECT * FROM updated`,
        [
          params.id,
          input.name,
          input.capacityQty,
          input.lowStockThresholdQty,
          input.active,
          user.role === "ADMIN",
          user.branchId,
        ],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new AppError(404, "STOCK_UNIT_NOT_FOUND", "Unit stock tidak ditemukan.");
      const snapshots = { before: mapStock(row.before_data), after: mapStock(row) };
      await writeAudit(
        {
          branchId: row.branch_id,
          actorId: user.id,
          action: "UPDATE",
          objectType: "stock_unit",
          objectId: row.id,
          metadata: snapshots,
        },
        client,
      );
      return snapshots;
    });
    sendJson(response, 200, after);
  });

  router.add("POST", "/api/v1/meter-units", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const input = parseCreateMeter(await readJson(request));
    assertBranchScope(user.role, user.branchId, input.branchId);
    try {
      const created = await inTransaction(async (client) => {
        const stock = await client.query<{ name: string }>(
          "SELECT name FROM stock_unit WHERE id = $1 AND branch_id = $2 AND active = true",
          [input.stockUnitId, input.branchId],
        );
        const stockUnit = stock.rows[0];
        if (stockUnit === undefined) {
          throw new AppError(
            422,
            "INVALID_STOCK_UNIT",
            "Unit stock tidak aktif atau bukan milik cabang.",
          );
        }
        const meter = await client.query<{ id: string }>(
          `INSERT INTO meter_unit (branch_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
          [input.branchId, input.code, input.name],
        );
        const meterId = meter.rows[0]?.id;
        if (meterId === undefined) throw new Error("Meter insert did not return an id.");
        await client.query(
          `INSERT INTO meter_stock_assignment (meter_unit_id, stock_unit_id, valid_from)
           VALUES ($1, $2, $3)`,
          [meterId, input.stockUnitId, input.validFrom],
        );
        await writeAudit(
          {
            branchId: input.branchId,
            actorId: user.id,
            action: "CREATE",
            objectType: "meter_unit",
            objectId: meterId,
            metadata: {
              after: {
                code: input.code,
                name: input.name,
                stockUnitId: input.stockUnitId,
                validFrom: input.validFrom,
              },
            },
          },
          client,
        );
        return {
          id: meterId,
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          stockUnitId: input.stockUnitId,
          stockUnitName: stockUnit.name,
          active: true,
        } satisfies MeterUnit;
      });
      sendJson(response, 201, created);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new AppError(
          409,
          "METER_CODE_EXISTS",
          "Kode pompa/meter sudah digunakan pada cabang ini.",
        );
      }
      throw error;
    }
  });

  router.add("PATCH", "/api/v1/meter-units/{id}", async ({ request, response, params }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request, ["ADMIN", "MANAGER"]);
    const input = parseUpdateMeter(await readJson(request));
    const meterId = params.id;
    if (meterId === undefined)
      throw new AppError(400, "METER_ID_REQUIRED", "ID pompa/meter wajib diisi.");
    const updated = await inTransaction(async (client) => {
      const result = await client.query<MeterMutationRow>(
        `WITH previous AS MATERIALIZED (
           SELECT meter.id,meter.branch_id,meter.code,meter.name,meter.active,
             assignment.stock_unit_id,stock.name AS stock_unit_name
           FROM meter_unit meter
           JOIN meter_stock_assignment assignment ON assignment.meter_unit_id=meter.id
             AND assignment.valid_to IS NULL
           JOIN stock_unit stock ON stock.id=assignment.stock_unit_id
           WHERE meter.id=$1 AND ($4::boolean OR meter.branch_id=$5)
         ), updated AS (
           UPDATE meter_unit meter SET name=$2,active=$3 FROM previous
           WHERE meter.id=previous.id
           RETURNING meter.id,meter.branch_id,meter.code,meter.name,meter.active,
             previous.stock_unit_id,previous.stock_unit_name,to_jsonb(previous) AS before_data
         ) SELECT * FROM updated`,
        [meterId, input.name, input.active, user.role === "ADMIN", user.branchId],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new AppError(404, "METER_NOT_FOUND", "Pompa/meter tidak ditemukan.");
      const meter = mapMeterMutation(row);
      await writeAudit(
        {
          branchId: row.branch_id,
          actorId: user.id,
          action: "UPDATE",
          objectType: "meter_unit",
          objectId: row.id,
          metadata: {
            before: mapMeterMutation(row.before_data),
            after: meter,
          },
        },
        client,
      );
      return meter;
    });
    sendJson(response, 200, updated);
  });
}

type StockRow = {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  product_name: string;
  capacity_qty: number;
  low_stock_threshold_qty: number;
  active: boolean;
};
type MeterSnapshotRow = {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  active: boolean;
  stock_unit_id: string;
  stock_unit_name: string;
};
type MeterMutationRow = MeterSnapshotRow & { before_data: MeterSnapshotRow };

function mapMeterMutation(row: MeterSnapshotRow): MeterUnit {
  return {
    id: row.id,
    branchId: row.branch_id,
    code: row.code,
    name: row.name,
    active: row.active,
    stockUnitId: row.stock_unit_id,
    stockUnitName: row.stock_unit_name,
  };
}
function mapStock(row: StockRow): StockUnit {
  return {
    id: row.id,
    branchId: row.branch_id,
    code: row.code,
    name: row.name,
    productName: row.product_name,
    capacityQty: row.capacity_qty,
    lowStockThresholdQty: row.low_stock_threshold_qty,
    active: row.active,
  };
}
function masterCode(body: Record<string, unknown>): string {
  const code = (stringField(body, "code", { min: 2, max: 40 }) as string).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
      code: "Gunakan huruf, angka, tanda hubung, atau underscore.",
    });
  return code;
}
function parseCreateBranch(value: unknown): CreateBranchInput {
  const body = objectBody(value);
  return {
    code: masterCode(body),
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    timezone: stringField(body, "timezone", { min: 3, max: 80 }) as string,
  };
}
function parseCreateProduct(value: unknown): CreateProductInput {
  const body = objectBody(value);
  return {
    code: masterCode(body),
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    unit: stringField(body, "unit", { min: 1, max: 24 }) as string,
  };
}
function parseUpdateBranch(value: unknown): UpdateBranchInput {
  const body = objectBody(value);
  return {
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    timezone: stringField(body, "timezone", { min: 3, max: 80 }) as string,
    active: booleanField(body, "active"),
  };
}
function parseCreateStock(value: unknown): CreateStockUnitInput {
  const body = objectBody(value);
  return {
    branchId: stringField(body, "branchId", { max: 80 }) as string,
    productId: stringField(body, "productId", { max: 80 }) as string,
    code: masterCode(body),
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    capacityQty: numberField(body, "capacityQty", {
      min: 0.001,
      max: 1_000_000_000,
      scale: 3,
    }),
    lowStockThresholdQty: numberField(body, "lowStockThresholdQty", {
      min: 0,
      max: 1_000_000_000,
      scale: 3,
    }),
  };
}
function parseUpdateStock(value: unknown): UpdateStockUnitInput {
  const body = objectBody(value);
  return {
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    capacityQty: numberField(body, "capacityQty", {
      min: 0.001,
      max: 1_000_000_000,
      scale: 3,
    }),
    lowStockThresholdQty: numberField(body, "lowStockThresholdQty", {
      min: 0,
      max: 1_000_000_000,
      scale: 3,
    }),
    active: booleanField(body, "active"),
  };
}

function parseCreateMeter(value: unknown): CreateMeterUnitInput {
  const body = objectBody(value);
  const code = (stringField(body, "code", { min: 2, max: 40 }) as string).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
      code: "Gunakan huruf A–Z, angka, tanda hubung, atau underscore.",
    });
  }
  return {
    branchId: stringField(body, "branchId", { max: 80 }) as string,
    code,
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    stockUnitId: stringField(body, "stockUnitId", { max: 80 }) as string,
    validFrom: dateField(body, "validFrom"),
  };
}

function parseUpdateMeter(value: unknown): UpdateMeterUnitInput {
  const body = objectBody(value);
  return {
    name: stringField(body, "name", { min: 2, max: 120 }) as string,
    active: booleanField(body, "active"),
  };
}

function assertBranchScope(
  role: string,
  assignedBranchId: string | null,
  targetBranchId: string,
): void {
  if (role !== "ADMIN" && assignedBranchId !== targetBranchId) {
    throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
  }
}

function databaseCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function requiredRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) throw new Error(message);
  return row;
}
