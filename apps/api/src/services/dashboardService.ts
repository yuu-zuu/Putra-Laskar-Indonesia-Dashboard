import type { DashboardResponse } from "@spbu/contracts";
import { AppError } from "../lib/errors.js";
import { DashboardRepository } from "../repositories/dashboardRepository.js";

export class DashboardService {
  constructor(private readonly repository = new DashboardRepository()) {}

  async get(branchId: string, businessDate: string, trendDays = 30): Promise<DashboardResponse> {
    const [branch, stockUnits, reconciliations, trend, metrics, rangeMetrics, activities] = await Promise.all([
      this.repository.branch(branchId),
      this.repository.stockUnits(branchId, businessDate),
      this.repository.reconciliations(branchId, businessDate),
      this.repository.trend(branchId, businessDate, trendDays),
      this.repository.financialMetrics(branchId, businessDate),
      this.repository.rangeMetrics(branchId, businessDate, trendDays),
      this.repository.activities(branchId),
    ]);
    if (branch === null) throw new AppError(404, "BRANCH_NOT_FOUND", "Pangkalan tidak ditemukan.");

    return {
      summary: {
        businessDate,
        branch,
        closingStockQty: sum(stockUnits.map((unit) => unit.closingQty)),
        salesQty: sum(stockUnits.map((unit) => unit.salesQty)),
        salesAmount: metrics.salesAmount,
        cashDepositAmount: sum(reconciliations.map((row) => row.cashDepositAmount)),
        grossProfitAmount: metrics.grossProfitAmount,
        literVariance: sum(reconciliations.map((row) => row.literVariance)),
        cashVariance: sum(reconciliations.map((row) => row.cashVariance)),
        unresolvedCount: reconciliations.filter(
          (row) => row.status === "PENDING" || row.status === "ESCALATED",
        ).length,
        pendingApprovalCount: metrics.pendingApprovalCount,
      },
      rangeSummary: {
        startDate: rangeMetrics.startDate,
        endDate: rangeMetrics.endDate,
        days: trendDays,
        closingStockQty: sum(stockUnits.map((unit) => unit.closingQty)),
        salesQty: rangeMetrics.salesQty,
        salesAmount: rangeMetrics.salesAmount,
        cashDepositAmount: rangeMetrics.cashDepositAmount,
        grossProfitAmount: rangeMetrics.grossProfitAmount,
        literVariance: rangeMetrics.literVariance,
        cashVariance: rangeMetrics.cashVariance,
        unresolvedCount: rangeMetrics.unresolvedCount,
        pendingApprovalCount: rangeMetrics.pendingApprovalCount,
      },
      stockUnits,
      trend,
      reconciliations,
      activities,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
