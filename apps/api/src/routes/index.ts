import type { Router } from "../http/router.js";
import { registerDashboardRoutes } from "./dashboard.js";
import { registerHealthRoutes } from "./health.js";
import { registerMasterRoutes } from "./masters.js";
import { registerMeterReadingRoutes } from "./meterReadings.js";
import { registerReportRoutes } from "./reports.js";
import { registerUploadRoutes } from "./uploads.js";
import { registerAuthRoutes } from "./auth.js";
import { registerOperationRoutes } from "./operations.js";
import { registerAuditRoutes } from "./audit.js";
import { registerProfileRoutes } from "./profiles.js";
import { registerReconciliationRoutes } from "./reconciliation.js";
import { registerInventoryMovementRoutes } from "./inventoryMovements.js";
import { registerAccountRoutes } from "./accounts.js";

export function registerRoutes(router: Router): void {
  registerAuthRoutes(router);
  registerAccountRoutes(router);
  registerHealthRoutes(router);
  registerDashboardRoutes(router);
  registerMasterRoutes(router);
  registerMeterReadingRoutes(router);
  registerInventoryMovementRoutes(router);
  registerReportRoutes(router);
  registerOperationRoutes(router);
  registerReconciliationRoutes(router);
  registerAuditRoutes(router);
  registerProfileRoutes(router);
  registerUploadRoutes(router);
}
