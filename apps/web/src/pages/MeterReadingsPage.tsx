import { calculateMeterQuantity, formulas } from "@spbu/contracts";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useBranches } from "../app/branches.js";
import { useToast } from "../app/toasts.js";
import { useMeterUnits } from "../app/meterUnits.js";
import { FormulaHint } from "../components/FormulaHint.js";
import { Icon } from "../components/Icon.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { StatusPill } from "../components/StatusPill.js";
import { createMeterReading } from "../data/gateway.js";
import { getReadings } from "../data/operationsGateway.js";
import type { ReconciliationRow } from "@spbu/contracts";
import { HttpError } from "../lib/http.js";
import { useI18n } from "../app/i18n.js";
import { formatCurrency, formatLiter } from "../lib/format.js";
import { LoadingState } from "../components/Feedback.js";
import { createClientId } from "../lib/id.js";
import { startSerializedPolling } from "../lib/polling.js";

interface MeterForm {
  meterUnitId: string;
  businessDate: string;
  meterStart: string;
  meterEnd: string;
  meterResetOffset: string;
  unitSellingPrice: string;
  cashDepositAmount: string;
  note: string;
}

const initialForm: MeterForm = {
  meterUnitId: "",
  businessDate: new Date().toISOString().slice(0, 10),
  meterStart: "0",
  meterEnd: "0",
  meterResetOffset: "0",
  unitSellingPrice: "12500",
  cashDepositAmount: "0",
  note: "",
};

export function MeterReadingsPage() {
  const { activeBranch } = useBranches();
  const toast = useToast();
  const { t, l } = useI18n();
  const { meters, loading: metersLoading, error: metersError } = useMeterUnits();
  const activeMeters = meters.filter((meter) => meter.active);
  const [form, setForm] = useState(initialForm);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [rowsState, setRowsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [rowsError, setRowsError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createClientId);
  const [errorMessage, setErrorMessage] = useState("");
  const quantity = useMemo(
    () =>
      calculateMeterQuantity(
        Number(form.meterStart),
        Number(form.meterEnd),
        Number(form.meterResetOffset),
      ),
    [form.meterStart, form.meterEnd, form.meterResetOffset],
  );
  useEffect(() => {
    if (form.meterUnitId === "" && activeMeters[0] !== undefined) {
      setForm((current) => ({
        ...current,
        meterUnitId: activeMeters[0]?.id ?? "",
      }));
    }
  }, [form.meterUnitId, activeMeters]);
  useEffect(() => {
    if (!activeBranch) {
      setRows([]);
      setRowsState("idle");
      return;
    }
    setRows([]);
    setRowsState("loading");
    const load = async () => {
      await getReadings(activeBranch.id, form.businessDate)
        .then((items) => {
          setRows(items);
          setRowsError("");
          setRowsState("ready");
        })
        .catch((error) => {
          setRowsError(
            error instanceof Error
              ? error.message
              : l("Bacaan gagal dimuat.", "Could not load readings.", "无法加载读数。"),
          );
          setRowsState("error");
        });
    };
    return startSerializedPolling(load, 10_000);
  }, [activeBranch?.id, form.businessDate]);

  const update = (field: keyof MeterForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitState("saving");
    try {
      await createMeterReading({
        branchId: activeBranch?.id ?? "",
        meterUnitId: form.meterUnitId,
        businessDate: form.businessDate,
        meterStart: Number(form.meterStart),
        meterEnd: Number(form.meterEnd),
        meterResetOffset: Number(form.meterResetOffset),
        unitSellingPrice: Number(form.unitSellingPrice),
        cashDepositAmount: Number(form.cashDepositAmount),
        note: form.note.trim() || null,
        idempotencyKey,
      });
      setSubmitState("saved");
      setIdempotencyKey(createClientId());
      toast(
        l(
          "Bacaan dan penjualan berhasil diposting.",
          "Reading and sale posted.",
          "读数和销售已过账。",
        ),
        "success",
      );
      setRows(await getReadings(activeBranch?.id ?? "", form.businessDate));
    } catch (error) {
      setSubmitState("error");
      const message =
        error instanceof Error
          ? error.message
          : l("Gagal menyimpan.", "Save failed.", "保存失败。 ");
      setErrorMessage(message);
      toast(message, "error", error instanceof HttpError ? error.requestId : null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("readings.eyebrow")}
        title={t("readings.title")}
        description={t("readings.description")}
        actions={
          <a className="button" href="#/meter-units">
            {l("Kelola pompa", "Manage pumps", "管理泵")}
          </a>
        }
      />
      <div className="split-layout">
        <Panel
          title={l("Bacaan baru", "New reading", "新读数")}
          eyebrow={l("Draft transaksi", "Transaction draft", "交易草稿")}
          className="form-panel"
        >
          <form className="meter-form" onSubmit={submit}>
            <div className="field-grid">
              <label className="field field-span-2">
                <span>
                  {l("Meter / sumber penjualan", "Meter / sales source", "仪表 / 销售来源")}
                </span>
                <select
                  data-tour="reading-meter"
                  required
                  disabled={metersLoading}
                  value={form.meterUnitId}
                  onChange={(event) => update("meterUnitId", event.target.value)}
                >
                  <option value="">
                    {l("Pilih pompa/meter", "Select pump/meter", "选择泵/仪表")}
                  </option>
                  {activeMeters.map((meter) => (
                    <option key={meter.id} value={meter.id}>
                      {meter.name} — {meter.stockUnitName}
                    </option>
                  ))}
                </select>
                <small>
                  {l(
                    "Pemetaan dan label berasal dari master pompa yang dinamis.",
                    "Mappings and labels come from the dynamic pump master.",
                    "映射和标签来自动态泵主数据。",
                  )}
                </small>
              </label>
              <label className="field">
                <span>
                  {l(
                    "Harga jual per liter (Rp)",
                    "Selling price per liter (IDR)",
                    "每升售价（印尼盾）",
                  )}
                </span>
                <input
                  required
                  min="0.01"
                  step="1"
                  type="number"
                  inputMode="numeric"
                  value={form.unitSellingPrice}
                  onChange={(event) => update("unitSellingPrice", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Tanggal bisnis", "Business date", "营业日期")}</span>
                <input
                  required
                  type="date"
                  value={form.businessDate}
                  onChange={(event) => update("businessDate", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Bacaan awal (L)", "Opening reading (L)", "起始读数（升）")}</span>
                <input
                  required
                  min="0"
                  step="0.001"
                  type="number"
                  inputMode="decimal"
                  value={form.meterStart}
                  onChange={(event) => update("meterStart", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Bacaan akhir (L)", "Closing reading (L)", "结束读数（升）")}</span>
                <input
                  required
                  min="0"
                  step="0.001"
                  type="number"
                  inputMode="decimal"
                  value={form.meterEnd}
                  onChange={(event) => update("meterEnd", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Offset reset (L)", "Reset offset (L)", "重置偏移（升）")}</span>
                <input
                  required
                  step="0.001"
                  type="number"
                  inputMode="decimal"
                  value={form.meterResetOffset}
                  onChange={(event) => update("meterResetOffset", event.target.value)}
                />
                <small>
                  {l(
                    "Isi 0 jika tidak ada reset meter.",
                    "Enter 0 when no meter reset occurred.",
                    "若未重置仪表，请输入 0。",
                  )}
                </small>
              </label>
              <label className="field">
                <span>{l("Setoran kas (Rp)", "Cash deposit (IDR)", "现金存款（印尼盾）")}</span>
                <input
                  required
                  min="0"
                  step="1"
                  type="number"
                  inputMode="numeric"
                  value={form.cashDepositAmount}
                  onChange={(event) => update("cashDepositAmount", event.target.value)}
                />
              </label>
              <label className="field field-span-2">
                <span>{l("Catatan", "Note", "备注")}</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder={l(
                    "Opsional; wajib untuk kondisi tidak normal",
                    "Optional; required for abnormal conditions",
                    "可选；异常情况必须填写",
                  )}
                  value={form.note}
                  onChange={(event) => update("note", event.target.value)}
                />
              </label>
            </div>
            <aside
              className={`calculation-preview ${quantity < 0 ? "calculation-invalid" : ""}`}
              aria-live="polite"
            >
              <div>
                <span>{l("Penjualan terhitung", "Calculated sales", "计算销售量")}</span>
                <strong>{formatLiter(quantity)}</strong>
              </div>
              <FormulaHint formula={formulas.meterQuantity} />
            </aside>
            {quantity < 0 ? (
              <p className="form-error">
                <Icon name="alert" /> Bacaan akhir tidak boleh menghasilkan penjualan negatif.
              </p>
            ) : null}
            {submitState === "saved" ? (
              <p className="form-success">
                <Icon name="check" />{" "}
                {l(
                  "Transaksi diposting ke ledger stock dan FIFO.",
                  "Transaction posted to the stock and FIFO ledgers.",
                  "交易已过账到库存和 FIFO 账本。",
                )}
              </p>
            ) : null}
            {submitState === "error" ? (
              <p className="form-error">
                <Icon name="alert" /> {errorMessage}
              </p>
            ) : null}
            {activeMeters.length === 0 ? (
              <p className="form-error">
                <Icon name="alert" />
                {metersLoading
                  ? l("Memuat pompa…", "Loading pumps…", "正在加载泵…")
                  : l(
                      "Belum ada pompa aktif. Tambahkan dari menu Pompa & meter.",
                      "No active pumps yet. Add one from Pumps & meters.",
                      "暂无活动泵。请从泵和仪表菜单添加。",
                    )}
              </p>
            ) : null}
            {metersError === null ? null : (
              <p className="form-error" role="alert">
                <Icon name="alert" /> {metersError}
              </p>
            )}
            <footer className="form-actions">
              <button
                className="button"
                type="reset"
                onClick={() => {
                  setForm({
                    ...initialForm,
                    meterUnitId: activeMeters[0]?.id ?? "",
                  });
                  setSubmitState("idle");
                  setIdempotencyKey(createClientId());
                }}
              >
                {l("Atur ulang", "Reset", "重置")}
              </button>
              <button
                className="button button-primary"
                data-tour="reading-submit"
                type="submit"
                disabled={
                  quantity < 0 ||
                  submitState === "saving" ||
                  form.meterUnitId === "" ||
                  activeBranch === null
                }
              >
                {submitState === "saving"
                  ? l("Menyimpan…", "Saving…", "保存中…")
                  : l("Posting transaksi", "Post transaction", "过账交易")}
              </button>
            </footer>
          </form>
        </Panel>
        <Panel
          title={l("Kontrol input", "Input controls", "输入控制")}
          eyebrow={l("Sebelum posting", "Before posting", "过账前")}
          className="control-panel"
        >
          <ul className="check-list">
            <li>
              <Icon name="check" />
              <span>
                <strong>{l("Urutan meter", "Meter continuity", "仪表连续性")}</strong>
                {l(
                  "Bacaan awal cocok dengan akhir terkonfirmasi sebelumnya.",
                  "The opening reading matches the prior confirmed closing.",
                  "起始读数与上次确认的结束读数一致。",
                )}
              </span>
            </li>
            <li>
              <Icon name="check" />
              <span>
                <strong>{l("Pemetaan stock", "Stock mapping", "库存映射")}</strong>
                {l(
                  "Meter aktif dan terhubung ke satu unit stock.",
                  "The active meter maps to one stock unit.",
                  "活动仪表映射到一个库存单元。",
                )}
              </span>
            </li>
            <li>
              <Icon name="info" />
              <span>
                <strong>{l("Idempotensi", "Idempotency", "幂等性")}</strong>
                {l(
                  "Pengiriman ulang tidak membuat transaksi ganda.",
                  "Retries do not create duplicate transactions.",
                  "重试不会创建重复交易。",
                )}
              </span>
            </li>
            <li>
              <Icon name="alert" />
              <span>
                <strong>{l("Reset meter", "Meter reset", "仪表重置")}</strong>
                {l(
                  "Offset non-nol memerlukan bukti dan catatan audit.",
                  "A non-zero offset requires evidence and an audit note.",
                  "非零偏移需要证据和审计备注。",
                )}
              </span>
            </li>
          </ul>
        </Panel>
      </div>
      <Panel
        title={l("Bacaan terbaru", "Recent readings", "最近读数")}
        eyebrow={form.businessDate}
        action={
          <a className="text-link" href="#/reconciliation">
            {l("Buka rekonsiliasi", "Open reconciliation", "打开对账")} <Icon name="arrow" />
          </a>
        }
      >
        {rowsState === "loading" ? (
          <LoadingState label={l("Memuat bacaan…", "Loading readings…", "正在加载读数…")} />
        ) : null}
        {rowsState === "error" ? (
          <p className="form-error" role="alert">
            <Icon name="alert" /> {rowsError}
          </p>
        ) : null}
        {rowsState !== "loading" && rowsState !== "error" && rows.length === 0 ? (
          <p className="empty-state">
            {activeBranch === null
              ? l(
                  "Pilih atau tambahkan cabang untuk melihat bacaan.",
                  "Choose or add a branch to view readings.",
                  "请选择或添加分支以查看读数。",
                )
              : l(
                  "Belum ada bacaan pada tanggal ini.",
                  "There are no readings for this date yet.",
                  "该日期暂无读数。",
                )}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <div className="table-scroll reading-table-wrap">
            <table className="reading-table">
              <thead>
                <tr>
                  <th>{l("Meter", "Meter", "仪表")}</th>
                  <th>{l("Awal → akhir", "Opening → closing", "起始 → 结束")}</th>
                  <th>{l("Penjualan", "Sales", "销售")}</th>
                  <th>{l("Setoran", "Deposit", "存款")}</th>
                  <th>{l("Status", "Status", "状态")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <strong>{row.meterUnitName}</strong>
                      <small>{row.stockUnitName}</small>
                    </th>
                    <td data-label={l("Awal → akhir", "Opening → closing", "起始 → 结束")}>
                      {row.meterStart.toLocaleString("id-ID")} →{" "}
                      {row.meterEnd.toLocaleString("id-ID")}
                    </td>
                    <td data-label={l("Penjualan", "Sales", "销售")}>
                      {formatLiter(row.meterSalesQty)}
                    </td>
                    <td data-label={l("Setoran", "Deposit", "存款")}>
                      {formatCurrency(row.cashDepositAmount)}
                    </td>
                    <td data-label={l("Status", "Status", "状态")}>
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
