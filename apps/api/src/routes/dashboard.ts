import { DashboardService } from "../services/dashboardService.js";
import type { Router } from "../http/router.js";
import { queryParam } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { requireUser } from "../auth/session.js";
import { AppError } from "../lib/errors.js";

const service = new DashboardService();

export function registerDashboardRoutes(router: Router): void {
  router.add("GET", "/api/v1/dashboard", async ({ request, response, url }) => {
    const user = await requireUser(request);
    const selectedBranch = queryParam(url, "branchId", false) ?? user.branchId;
    if (selectedBranch === null) {
      throw new AppError(422, "BRANCH_REQUIRED", "branchId wajib diberikan melalui query.", {
        branchId: "Pilih cabang aktif.",
      });
    }
    if (user.role !== "ADMIN" && selectedBranch !== user.branchId) {
      throw new AppError(403, "BRANCH_FORBIDDEN", "Akun tidak memiliki akses ke cabang ini.");
    }
    const businessDate = queryParam(url, "date") as string;
    const rawDays = queryParam(url, "days", false) ?? "30";
    const trendDays = Number(rawDays);
    if (!Number.isInteger(trendDays) || trendDays < 7 || trendDays > 90) {
      throw new AppError(422, "INVALID_TREND_RANGE", "Rentang tren harus 7 sampai 90 hari.", {
        days: "Gunakan bilangan bulat 7–90.",
      });
    }
    sendJson(response, 200, await service.get(selectedBranch, businessDate, trendDays));
  });
}
