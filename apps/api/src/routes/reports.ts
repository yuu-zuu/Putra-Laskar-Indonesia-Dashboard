import { pool } from "../db/client.js";
import type { Router } from "../http/router.js";
import { queryParam, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { requireUser } from "../auth/session.js";
import { AppError } from "../lib/errors.js";
import { assertTrustedOrigin } from "../auth/session.js";
import { objectBody, stringField } from "../lib/validation.js";
import { writeAudit } from "../lib/audit.js";

export function registerReportRoutes(router: Router): void {
  router.add("GET", "/api/v1/reports/daily-stock", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const startDate = queryParam(url, "startDate") as string;
    const endDate = queryParam(url, "endDate") as string;
    const result = await pool.query(
      `SELECT daily.*, unit.code AS stock_unit_code, unit.name AS stock_unit_name,
        product.name AS product_name
       FROM daily_stock_view daily
       JOIN stock_unit unit ON unit.id = daily.stock_unit_id
       JOIN product ON product.id = unit.product_id
       WHERE daily.branch_id = $1 AND daily.business_date BETWEEN $2::date AND $3::date
       ORDER BY daily.business_date, unit.name`,
      [branchId, startDate, endDate],
    );
    sendJson(response, 200, { items: result.rows });
  });

  router.add("GET", "/api/v1/reports/meter-reconciliation", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const branchId = queryParam(url, "branchId") as string;
    assertBranch(user.role, user.branchId, branchId);
    const startDate = queryParam(url, "startDate") as string;
    const endDate = queryParam(url, "endDate") as string;
    const result = await pool.query(
      `SELECT * FROM meter_reconciliation_view
       WHERE branch_id = $1 AND business_date BETWEEN $2::date AND $3::date
       ORDER BY business_date, meter_unit_name`,
      [branchId, startDate, endDate],
    );
    sendJson(response, 200, { items: result.rows });
  });
  router.add("POST", "/api/v1/reports/export-events", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const branchId = stringField(body, "branchId", { max: 80 }) as string;
    assertBranch(user.role, user.branchId, branchId);
    const format = stringField(body, "format", { min: 3, max: 8 }) as string;
    const startDate = stringField(body, "startDate", { max: 10 }) as string;
    const endDate = stringField(body, "endDate", { max: 10 }) as string;
    await writeAudit({
      branchId,
      actorId: user.id,
      action: "EXPORT",
      objectType: "operational_report",
      objectId: `${startDate}:${endDate}`,
      metadata: { format, startDate, endDate },
    });
    sendJson(response, 201, { recorded: true });
  });
}

function assertBranch(role: string, assignedBranchId: string | null, targetBranchId: string): void {
  if (role !== "ADMIN" && assignedBranchId !== targetBranchId) {
    throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
  }
}
