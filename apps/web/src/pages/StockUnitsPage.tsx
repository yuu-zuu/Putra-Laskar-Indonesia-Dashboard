import { formulas, type InventoryMovementItem } from "@spbu/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useBranches } from "../app/branches.js";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { FormulaHint } from "../components/FormulaHint.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { StockCapacity } from "../components/StockCapacity.js";
import { InventoryMovementDialog } from "../components/InventoryMovementDialog.js";
import { ProductDialog } from "../components/ProductDialog.js";
import { useAuth } from "../app/auth.js";
import { createStockUnit, getProducts } from "../data/masterGateway.js";
import { getInventoryMovements } from "../data/inventoryGateway.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { formatDateTime, formatLiter, signed } from "../lib/format.js";
export function StockUnitsPage() {
  const { activeBranch } = useBranches();
  const { user } = useAuth();
  const { t, l } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, error, reload } = useDashboard(activeBranch?.id ?? "", date);
  const [open, setOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [movements, setMovements] = useState<InventoryMovementItem[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    productId: "",
    capacityQty: "",
    lowStockThresholdQty: "",
  });
  useEffect(() => {
    void getProducts().then((items) => {
      setProducts(items);
      setForm((x) => ({ ...x, productId: x.productId || items[0]?.id || "" }));
    });
  }, []);
  useEffect(() => {
    if (!activeBranch) return;
    void getInventoryMovements(activeBranch.id, date)
      .then(setMovements)
      .catch(() => setMovements([]));
  }, [activeBranch?.id, date]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    try {
      await createStockUnit({
        branchId: activeBranch.id,
        productId: form.productId,
        code: form.code.toUpperCase(),
        name: form.name,
        capacityQty: Number(form.capacityQty),
        lowStockThresholdQty: Number(form.lowStockThresholdQty),
      });
      setOpen(false);
      toast(
        l("Unit stock berhasil ditambahkan.", "Stock unit added.", "库存单元已添加。"),
        "success",
      );
      reload();
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : l("Unit gagal ditambahkan.", "Could not add stock unit.", "无法添加库存单元。"),
        "error",
      );
    }
  };
  const units = data?.stockUnits ?? [];
  return (
    <>
      <PageHeader
        eyebrow={t("stock.eyebrow")}
        title={t("stock.title")}
        description={t("stock.description")}
        actions={
          <div className="page-action-cluster" data-tour="stock-actions">
            {user?.role === "ADMIN" ? (
              <button className="button" onClick={() => setProductOpen(true)}>
                {l("Tambah produk", "Add product", "添加产品")}
              </button>
            ) : null}
            <button
              className="button"
              data-tour="post-movement"
              onClick={() => setMovementOpen(true)}
            >
              {l("Posting mutasi", "Post movement", "过账变动")}
            </button>
            <span className="button-with-hint">
              <button
                className="button button-primary"
                onClick={() => (products.length === 0 ? setProductOpen(true) : setOpen(true))}
              >
                {l("Tambah unit", "Add unit", "添加单元")}
              </button>
              <button
                className="info-hint"
                type="button"
                aria-label="Informasi konfigurasi unit stock"
                data-tooltip={l(
                  "Jumlah dan label unit mengikuti konfigurasi cabang.",
                  "Unit counts and labels follow branch configuration.",
                  "单元数量和标签遵循分支配置。",
                )}
              >
                i
              </button>
            </span>
          </div>
        }
      />
      <label className="date-filter stock-date-filter" data-tour="stock-date">
        <span>{l("Tanggal ledger", "Ledger date", "账本日期")}</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      {loading ? (
        <p className="loading-state">
          {l("Memuat unit stock…", "Loading stock units…", "正在加载库存单元…")}
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <section className="unit-card-grid">
        {units.map((unit) => (
          <article className="unit-card" key={unit.id}>
            <header>
              <div>
                <p className="eyebrow">{unit.code}</p>
                <h2>{unit.name}</h2>
                <p>{unit.productName}</p>
              </div>
            </header>
            <StockCapacity unit={unit} />
            <dl className="unit-stats">
              <div>
                <dt>{l("Stock awal", "Opening stock", "期初库存")}</dt>
                <dd>{formatLiter(unit.openingQty)}</dd>
              </div>
              <div>
                <dt>{l("Supply", "Supply", "供应")}</dt>
                <dd>{signed(unit.supplyQty, formatLiter)}</dd>
              </div>
              <div>
                <dt>{l("Penjualan", "Sales", "销售")}</dt>
                <dd>−{formatLiter(unit.salesQty)}</dd>
              </div>
              <div>
                <dt>{l("Adjustment", "Adjustment", "调整")}</dt>
                <dd>{signed(unit.gainQty - unit.lossQty, formatLiter)}</dd>
              </div>
            </dl>
            <footer>
              <span>
                {l("Diperbarui", "Updated", "更新时间")} {formatDateTime(unit.updatedAt)}
              </span>
              <FormulaHint formula={formulas.closingStock} />
            </footer>
          </article>
        ))}
      </section>
      <Panel
        title={l("Rincian mutasi", "Movement details", "变动明细")}
        eyebrow={l("Ledger harian", "Daily ledger", "日记账")}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("Unit", "Unit", "单元")}</th>
                <th>{l("Awal", "Opening", "期初")}</th>
                <th>{l("Supply", "Supply", "供应")}</th>
                <th>{l("Transfer masuk", "Transfer in", "转入")}</th>
                <th>{l("Transfer keluar", "Transfer out", "转出")}</th>
                <th>{l("Retur", "Returns", "退货")}</th>
                <th>{l("Penjualan", "Sales", "销售")}</th>
                <th>{l("Adjustment", "Adjustment", "调整")}</th>
                <th>{l("Akhir", "Closing", "期末")}</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <th>
                    <strong>{unit.name}</strong>
                    <small>{unit.productName}</small>
                  </th>
                  <td>{formatLiter(unit.openingQty)}</td>
                  <td>{formatLiter(unit.supplyQty)}</td>
                  <td>{formatLiter(unit.transferInQty)}</td>
                  <td>{formatLiter(unit.transferOutQty)}</td>
                  <td>{formatLiter(unit.returnQty)}</td>
                  <td>{formatLiter(unit.salesQty)}</td>
                  <td>{signed(unit.gainQty - unit.lossQty, formatLiter)}</td>
                  <td>
                    <strong>{formatLiter(unit.closingQty)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={l("Transaksi ledger", "Ledger transactions", "账本交易")} eyebrow={date}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("Waktu", "Time", "时间")}</th>
                <th>{l("Unit", "Unit", "单元")}</th>
                <th>{l("Jenis", "Type", "类型")}</th>
                <th>{l("Kuantitas", "Quantity", "数量")}</th>
                <th>{l("Referensi", "Reference", "参考")}</th>
                <th>{l("Pelaku", "Actor", "执行人")}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.postedAt)}</td>
                  <th>{movement.stockUnitName}</th>
                  <td>{movement.movementType}</td>
                  <td>{signed(movement.quantityDelta, formatLiter)}</td>
                  <td>{movement.reference ?? "—"}</td>
                  <td>{movement.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 ? (
            <p className="empty-state">
              {l(
                "Belum ada mutasi pada tanggal ini.",
                "No movements on this date.",
                "该日期暂无变动。",
              )}
            </p>
          ) : null}
        </div>
      </Panel>
      {movementOpen && activeBranch ? (
        <InventoryMovementDialog
          branchId={activeBranch.id}
          businessDate={date}
          units={units}
          onClose={() => setMovementOpen(false)}
          onSaved={() => {
            reload();
            void getInventoryMovements(activeBranch.id, date).then(setMovements);
          }}
        />
      ) : null}
      {productOpen ? (
        <ProductDialog
          onClose={() => setProductOpen(false)}
          onSaved={(product) => {
            setProducts((current) => [...current, product]);
            setForm((current) => ({ ...current, productId: product.id }));
          }}
        />
      ) : null}
      {open ? (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>{l("Tambah unit stock", "Add stock unit", "添加库存单元")}</h2>
              <button className="icon-button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <form onSubmit={submit}>
              <label className="field">
                <span>{l("Kode", "Code", "代码")}</span>
                <input
                  required
                  pattern="[A-Za-z0-9_-]+"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{l("Nama unit", "Unit name", "单元名称")}</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{l("Produk", "Product", "产品")}</span>
                <select
                  required
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{l("Kapasitas (L)", "Capacity (L)", "容量（升）")}</span>
                <input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.capacityQty}
                  onChange={(e) => setForm({ ...form, capacityQty: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  {l("Batas stock rendah (L)", "Low-stock threshold (L)", "低库存阈值（升）")}
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.lowStockThresholdQty}
                  onChange={(e) => setForm({ ...form, lowStockThresholdQty: e.target.value })}
                />
              </label>
              <footer className="form-actions">
                <button className="button" type="button" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button className="button button-primary">
                  {l("Simpan unit", "Save unit", "保存单元")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
