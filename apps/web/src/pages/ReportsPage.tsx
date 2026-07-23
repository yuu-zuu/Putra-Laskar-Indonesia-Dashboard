import { useState } from "react";
import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { Icon } from "../components/Icon.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { useBranches } from "../app/branches.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { recordReportExport } from "../data/operationsGateway.js";
import { getOperationalReportPackage } from "../data/reportsGateway.js";
import { downloadCsv } from "../lib/download.js";
import { downloadOperationalReportXlsx } from "../lib/operationalReportXlsx.js";
import { formatCurrency, formatLiter } from "../lib/format.js";

const reportSections = [
  {
    name: ["Ringkasan", "Summary", "摘要"],
    description: [
      "Saldo, throughput, pendapatan, dan pengecualian utama.",
      "Balances, throughput, revenue, and key exceptions.",
      "余额、吞吐量、收入和主要异常。",
    ],
    rows: 1,
  },
  {
    name: ["Unit stock", "Stock units", "库存单元"],
    description: [
      "Mutasi dan saldo setiap unit stock dinamis.",
      "Movements and balances for each dynamic stock unit.",
      "每个动态库存单元的变动和余额。",
    ],
    rows: 3,
  },
  {
    name: ["Meter", "Meters", "仪表"],
    description: [
      "Bacaan awal–akhir, reset, dan penjualan terhitung.",
      "Opening/closing readings, resets, and calculated sales.",
      "起止读数、重置和计算销售量。",
    ],
    rows: 3,
  },
  {
    name: ["Rekonsiliasi", "Reconciliation", "对账"],
    description: [
      "Selisih liter dan kas beserta status review.",
      "Liter and cash variances with review status.",
      "升数和现金差异及审核状态。",
    ],
    rows: 3,
  },
  {
    name: ["Log audit", "Audit log", "审计日志"],
    description: [
      "Pelaku, waktu, tindakan, dan objek yang berubah.",
      "Actor, time, action, and changed object.",
      "执行人、时间、操作和变更对象。",
    ],
    rows: 4,
  },
] as const;

export function ReportsPage() {
  const { user } = useAuth();
  const { t, l } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { activeBranch } = useBranches();
  const { data } = useDashboard(activeBranch?.id ?? "", to);
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  const exportReport = async () => {
    if (activeBranch === null) {
      setMessage(
        l(
          "Pilih cabang aktif terlebih dahulu.",
          "Select an active branch first.",
          "请先选择当前分支。",
        ),
      );
      return;
    }
    if (from > to) {
      setMessage(
        l(
          "Tanggal awal tidak boleh setelah tanggal akhir.",
          "The start date cannot be after the end date.",
          "开始日期不能晚于结束日期。",
        ),
      );
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const report = await getOperationalReportPackage(activeBranch.id, from, to);
      if (format === "csv") {
        downloadCsv(
          `rekonsiliasi-${from}-${to}.csv`,
          report.meterReconciliations.map((row) => ({
            tanggal: row.businessDate,
            meter: row.meterUnitName,
            unit_stock: row.stockUnitName,
            meter_awal: row.meterStart,
            meter_akhir: row.meterEnd,
            reset: row.meterResetOffset,
            penjualan_meter_l: row.meterSalesQty,
            penjualan_posting_l: row.postedSalesQty,
            selisih_l: row.literVariance,
            nilai_seharusnya_rp: row.expectedSalesAmount,
            setoran_rp: row.cashDepositAmount,
            selisih_kas_rp: row.cashVariance,
            status: row.reconciliationStatus,
            catatan: row.note ?? "",
          })),
        );
        await recordReportExport(activeBranch.id, "csv", from, to);
        setMessage(
          l(
            "CSV rekonsiliasi seluruh periode dibuat di perangkat Anda.",
            "The full-period reconciliation CSV was created on your device.",
            "全期间对账 CSV 已在您的设备上生成。",
          ),
        );
        return;
      }
      await downloadOperationalReportXlsx(
        `laporan-operasional-lengkap-${from}-${to}.xlsx`,
        report,
        user?.displayName ?? "Unknown user",
      );
      await recordReportExport(activeBranch.id, "xlsx", from, to);
      setMessage(
        l(
          "Laporan XLSX lengkap dan detail dibuat di perangkat Anda.",
          "The complete detailed XLSX report was created on your device.",
          "完整详细的 XLSX 报告已在您的设备上生成。",
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : l("Laporan gagal dibuat.", "The report could not be generated.", "无法生成报告。"),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("reports.eyebrow")}
        title={t("reports.title")}
        description={t("reports.description")}
      />
      <Panel
        title={l("Buat laporan", "Generate report", "生成报告")}
        eyebrow={l("Filter periode", "Period filter", "期间筛选")}
        className="report-builder"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void exportReport();
          }}
        >
          <label className="field">
            <span>{l("Dari tanggal", "From date", "开始日期")}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>{l("Sampai tanggal", "To date", "结束日期")}</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{l("Format", "Format", "格式")}</span>
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as "csv" | "xlsx")}
            >
              <option value="xlsx">XLSX — multi-sheet</option>
              <option value="csv">CSV — reconciliation</option>
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={exporting}>
            {exporting
              ? l("Menyiapkan laporan...", "Preparing report...", "正在准备报告...")
              : l("Buat laporan", "Generate report", "生成报告")}
          </button>
        </form>
        {message === "" ? null : (
          <p className="form-success" role="status">
            <Icon name="check" /> {message}
          </p>
        )}
      </Panel>
      <section className="report-card-grid" aria-label="Isi paket laporan">
        {reportSections.map((section, index) => (
          <article className="report-card" key={section.name[0]}>
            <span className="report-number">0{index + 1}</span>
            <div>
              <h2>{l(section.name[0], section.name[1], section.name[2])}</h2>
              <p>{l(section.description[0], section.description[1], section.description[2])}</p>
              <small>{l("Data cabang aktif", "Active-branch data", "当前分支数据")}</small>
            </div>
            <Icon name="report" />
          </article>
        ))}
      </section>
      <Panel
        title={l("Pratinjau ringkasan", "Summary preview", "摘要预览")}
        eyebrow={`${from} — ${to}`}
      >
        <dl className="report-summary">
          <div>
            <dt>{l("Cabang", "Branch", "分支")}</dt>
            <dd>
              {data?.summary.branch.name ?? "—"} ({data?.summary.branch.code ?? "—"})
            </dd>
          </div>
          <div>
            <dt>{l("Stock akhir", "Closing stock", "期末库存")}</dt>
            <dd>{formatLiter(data?.summary.closingStockQty ?? 0)}</dd>
          </div>
          <div>
            <dt>{l("Penjualan", "Sales", "销售")}</dt>
            <dd>
              {formatLiter(data?.summary.salesQty ?? 0)} ·{" "}
              {formatCurrency(data?.summary.salesAmount ?? 0)}
            </dd>
          </div>
          <div>
            <dt>{l("Laba kotor FIFO", "FIFO gross profit", "FIFO 毛利")}</dt>
            <dd>{formatCurrency(data?.summary.grossProfitAmount ?? 0)}</dd>
          </div>
          <div>
            <dt>{l("Dibuat oleh", "Generated by", "生成人")}</dt>
            <dd>{user?.displayName ?? "—"} · Asia/Jakarta</dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
