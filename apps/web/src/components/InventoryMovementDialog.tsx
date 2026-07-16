import type { InventoryMovementKind, StockUnitSnapshot } from "@spbu/contracts";
import { useState, type FormEvent } from "react";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { createInventoryMovement, createStockTransfer } from "../data/inventoryGateway.js";
import { createClientId } from "../lib/id.js";

type Action = InventoryMovementKind | "TRANSFER";
const incoming = new Set<Action>(["OPENING", "SUPPLY", "SALES_RETURN", "GAIN"]);

export function InventoryMovementDialog({
  branchId,
  businessDate,
  units,
  onClose,
  onSaved,
}: {
  branchId: string;
  businessDate: string;
  units: StockUnitSnapshot[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { l, t } = useI18n();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<Action>("SUPPLY");
  const [form, setForm] = useState({
    stockUnitId: units[0]?.id ?? "",
    destinationStockUnitId: units[1]?.id ?? "",
    quantity: "",
    unitCost: "",
    unitSellingPrice: "",
    reference: "",
    reason: "",
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const common = {
        branchId,
        businessDate,
        quantity: Number(form.quantity),
        reference: form.reference.trim(),
        reason: form.reason.trim(),
        idempotencyKey: createClientId(),
      };
      if (action === "TRANSFER") {
        await createStockTransfer({
          ...common,
          sourceStockUnitId: form.stockUnitId,
          destinationStockUnitId: form.destinationStockUnitId,
        });
      } else {
        await createInventoryMovement({
          ...common,
          stockUnitId: form.stockUnitId,
          movementType: action,
          unitCost: incoming.has(action) ? Number(form.unitCost) : null,
          unitSellingPrice: incoming.has(action) ? Number(form.unitSellingPrice) : null,
        });
      }
      toast(
        l(
          "Mutasi berhasil diposting ke ledger.",
          "Movement posted to the ledger.",
          "变动已过账到账本。",
        ),
        "success",
      );
      onSaved();
      onClose();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Mutasi gagal.", "Movement failed.", "变动失败。"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal movement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{l("Ledger stock", "Stock ledger", "库存账本")}</p>
            <h2 id="movement-dialog-title">{l("Posting mutasi", "Post movement", "过账变动")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <form onSubmit={submit} data-tour="stock-movement-form">
          <label className="field">
            <span>{l("Jenis mutasi", "Movement type", "变动类型")}</span>
            <select value={action} onChange={(event) => setAction(event.target.value as Action)}>
              <option value="OPENING">{l("Saldo awal", "Opening balance", "期初余额")}</option>
              <option value="SUPPLY">{l("Supply masuk", "Incoming supply", "入库供应")}</option>
              <option value="SALES_RETURN">
                {l("Retur penjualan", "Sales return", "销售退货")}
              </option>
              <option value="SUPPLIER_RETURN">
                {l("Retur pemasok", "Supplier return", "供应商退货")}
              </option>
              <option value="TRANSFER">
                {l("Transfer antarunit", "Inter-unit transfer", "单元间转移")}
              </option>
              <option value="GAIN">{l("Adjustment gain", "Gain adjustment", "盘盈调整")}</option>
              <option value="LOSS">{l("Adjustment loss", "Loss adjustment", "盘亏调整")}</option>
            </select>
          </label>
          <label className="field">
            <span>
              {action === "TRANSFER"
                ? l("Unit asal", "Source unit", "来源单元")
                : l("Unit stock", "Stock unit", "库存单元")}
            </span>
            <select
              required
              value={form.stockUnitId}
              onChange={(event) => update("stockUnitId", event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} · {unit.productName}
                </option>
              ))}
            </select>
          </label>
          {action === "TRANSFER" ? (
            <label className="field">
              <span>{l("Unit tujuan", "Destination unit", "目标单元")}</span>
              <select
                required
                value={form.destinationStockUnitId}
                onChange={(event) => update("destinationStockUnitId", event.target.value)}
              >
                <option value="">{l("Pilih tujuan", "Select destination", "选择目标")}</option>
                {units
                  .filter((unit) => unit.id !== form.stockUnitId)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} · {unit.productName}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>{l("Kuantitas (L)", "Quantity (L)", "数量（升）")}</span>
            <input
              required
              type="number"
              min="0.001"
              step="0.001"
              value={form.quantity}
              onChange={(event) => update("quantity", event.target.value)}
            />
          </label>
          {incoming.has(action) ? (
            <div className="field-grid">
              <label className="field">
                <span>{l("Biaya FIFO / L", "FIFO cost / L", "FIFO 成本/升")}</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.unitCost}
                  onChange={(event) => update("unitCost", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Harga jual / L", "Selling price / L", "售价/升")}</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.unitSellingPrice}
                  onChange={(event) => update("unitSellingPrice", event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <label className="field">
            <span>{l("Referensi dokumen", "Document reference", "单据参考")}</span>
            <input
              required
              minLength={2}
              maxLength={120}
              value={form.reference}
              placeholder="SUP-20260715-001"
              onChange={(event) => update("reference", event.target.value)}
            />
          </label>
          <label className="field">
            <span>{l("Alasan / keterangan", "Reason / notes", "原因/说明")}</span>
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={3}
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
            />
          </label>
          <footer className="form-actions">
            <button className="button" type="button" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button className="button button-primary" disabled={saving || units.length === 0}>
              {saving
                ? l("Memposting…", "Posting…", "正在过账…")
                : l("Posting mutasi", "Post movement", "过账变动")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
