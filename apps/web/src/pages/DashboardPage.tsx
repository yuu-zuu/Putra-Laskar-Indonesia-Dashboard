import { formulas } from "@spbu/contracts";
import { useState } from "react";
import { ErrorState, LoadingState } from "../components/Feedback.js";
import { Icon } from "../components/Icon.js";
import { MetricCard } from "../components/MetricCard.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { StatusPill } from "../components/StatusPill.js";
import { StockCapacity } from "../components/StockCapacity.js";
import { StockTrendChart } from "../components/StockTrendChart.js";
import { useBranches } from "../app/branches.js";
import { useI18n } from "../app/i18n.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { formatCurrency, formatDate, formatDateTime, formatLiter, signed } from "../lib/format.js";

export function DashboardPage() {
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [trendDays, setTrendDays] = useState(30);
  const { activeBranch } = useBranches();
  const { t, l } = useI18n();
  const { data, loading, error } = useDashboard(activeBranch?.id ?? "", businessDate, trendDays);

  return (
    <>
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <div className="dashboard-filters">
            <label className="date-filter">
              <span>{l("Tanggal bisnis", "Business date", "营业日期")}</span>
              <input
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
              />
            </label>
            <label className="date-filter">
              <span>{l("Rentang tren", "Trend range", "趋势范围")}</span>
              <select
                value={trendDays}
                onChange={(event) => setTrendDays(Number(event.target.value))}
              >
                {[7, 14, 30, 60, 90].map((days) => (
                  <option value={days} key={days}>
                    {days} {l("hari", "days", "天")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      {loading ? (
        <LoadingState
          label={l(
            "Menyusun ringkasan cabang…",
            "Preparing the branch summary…",
            "正在生成分支摘要…",
          )}
        />
      ) : null}
      {error === null ? null : <ErrorState message={error} />}
      {!loading && error === null && activeBranch === null ? (
        <p className="empty-state">
          {l(
            "Tambahkan cabang dari header untuk memulai.",
            "Add a branch from the header to begin.",
            "请从页眉添加分支以开始。",
          )}
        </p>
      ) : null}
      {data === null ? null : (
        <div className="dashboard-grid">
          <section
            className="metric-grid"
            aria-label={l("Indikator utama", "Key indicators", "关键指标")}
          >
            <MetricCard
              label={l("Stock akhir", "Closing stock", "期末库存")}
              value={formatLiter(data.summary.closingStockQty)}
              detail={`${data.stockUnits.length} ${l("unit stock aktif", "active stock units", "个活动库存单元")}`}
              formula={formulas.closingStock}
            />
            <MetricCard
              label={l("Penjualan", "Sales", "销售")}
              value={formatCurrency(data.summary.salesAmount)}
              detail={`${formatLiter(data.summary.salesQty)} ${l("terposting", "posted", "已过账")}`}
              tone="green"
            />
            <MetricCard
              label={l("Setoran kas", "Cash deposit", "现金存款")}
              value={formatCurrency(data.summary.cashDepositAmount)}
              detail={`${signed(data.summary.cashVariance, formatCurrency)} ${l("terhadap ekspektasi", "against expected", "相对预期")}`}
              tone={data.summary.cashVariance < 0 ? "red" : "mauve"}
              formula={formulas.cashVariance}
            />
            <MetricCard
              label={l("Laba kotor FIFO", "FIFO gross profit", "FIFO 毛利")}
              value={formatCurrency(data.summary.grossProfitAmount)}
              detail={l(
                "Berdasarkan layer biaya aktual",
                "Based on actual cost layers",
                "基于实际成本层",
              )}
              tone="yellow"
            />
            <MetricCard
              label={l("Selisih liter", "Liter variance", "升数差异")}
              value={signed(data.summary.literVariance, formatLiter)}
              detail={
                data.summary.literVariance === 0
                  ? l("Meter dan posting cocok", "Meter and posting match", "仪表与过账一致")
                  : l("Memerlukan rekonsiliasi", "Reconciliation required", "需要对账")
              }
              tone={data.summary.literVariance === 0 ? "green" : "red"}
              formula={formulas.literVariance}
            />
            <MetricCard
              label={l("Pengecualian terbuka", "Open exceptions", "未解决异常")}
              value={String(data.summary.unresolvedCount + data.summary.pendingApprovalCount)}
              detail={`${data.summary.unresolvedCount} ${l("rekonsiliasi", "reconciliations", "项对账")} · ${data.summary.pendingApprovalCount} ${l("persetujuan", "approvals", "项审批")}`}
              tone={data.summary.unresolvedCount > 0 ? "red" : "green"}
              icon={<Icon name="alert" />}
            />
          </section>

          <Panel
            title={l(`Tren ${trendDays} hari`, `${trendDays}-day trend`, `${trendDays} 天趋势`)}
            eyebrow={l("Stock & arus", "Stock & throughput", "库存与流量")}
            className="trend-panel"
            action={
              <span className="muted">
                {l("s.d.", "through", "截至")} {formatDate(businessDate)}
              </span>
            }
          >
            <StockTrendChart data={data.trend} />
          </Panel>

          <Panel
            title={l("Kesehatan unit stock", "Stock-unit health", "库存单元状态")}
            eyebrow={l("Dinamis per cabang", "Dynamic by branch", "按分支动态")}
            className="stock-health-panel"
            action={
              <a className="text-link" href="#/stock-units">
                {l("Kelola unit", "Manage units", "管理单元")} <Icon name="arrow" />
              </a>
            }
          >
            <div className="stock-health-list">
              {data.stockUnits.map((unit) => (
                <article className="stock-health-item" key={unit.id}>
                  <header>
                    <div>
                      <strong>{unit.name}</strong>
                      <small>
                        {unit.code} · {unit.productName}
                      </small>
                    </div>
                    <span
                      className={
                        unit.closingQty <= unit.lowStockThresholdQty ? "risk-label" : "ok-label"
                      }
                    >
                      {unit.closingQty <= unit.lowStockThresholdQty
                        ? l("Stock rendah", "Low stock", "库存偏低")
                        : l("Normal", "Normal", "正常")}
                    </span>
                  </header>
                  <StockCapacity unit={unit} />
                  <footer>
                    {l("Diperbarui", "Updated", "更新时间")} {formatDateTime(unit.updatedAt)}
                  </footer>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title={l("Rekonsiliasi hari ini", "Today's reconciliation", "今日对账")}
            eyebrow={l("Meter vs transaksi", "Meter vs transactions", "仪表与交易")}
            className="reconciliation-panel"
            action={
              <a className="text-link" href="#/reconciliation">
                {l("Lihat semua", "View all", "查看全部")} <Icon name="arrow" />
              </a>
            }
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{l("Meter / sumber", "Meter / source", "仪表 / 来源")}</th>
                    <th>{l("Penjualan meter", "Meter sales", "仪表销售")}</th>
                    <th>{l("Selisih L", "L variance", "升数差异")}</th>
                    <th>{l("Selisih kas", "Cash variance", "现金差异")}</th>
                    <th>{l("Status", "Status", "状态")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reconciliations.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <strong>{row.meterUnitName}</strong>
                        <small>{row.stockUnitName}</small>
                      </th>
                      <td>{formatLiter(row.meterSalesQty)}</td>
                      <td className={row.literVariance === 0 ? "value-ok" : "value-danger"}>
                        {signed(row.literVariance, formatLiter)}
                      </td>
                      <td
                        className={
                          row.cashVariance < 0
                            ? "value-danger"
                            : row.cashVariance > 0
                              ? "value-warning"
                              : "value-ok"
                        }
                      >
                        {signed(row.cashVariance, formatCurrency)}
                      </td>
                      <td>
                        <StatusPill status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title={l("Aktivitas terbaru", "Recent activity", "最近活动")}
            eyebrow={l("Riwayat audit", "Audit trail", "审计轨迹")}
            className="activity-panel"
          >
            <ol className="activity-list">
              {data.activities.map((activity) => (
                <li key={activity.id}>
                  <span className={`activity-icon activity-${activity.kind.toLowerCase()}`}>
                    <Icon name="activity" />
                  </span>
                  <div>
                    <strong>{activity.title}</strong>
                    <p>{activity.detail}</p>
                    <small>
                      {activity.actorName} · {formatDateTime(activity.occurredAt)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      )}
    </>
  );
}
