import { useState, type FormEvent } from "react";
import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { useBranches } from "../app/branches.js";
import { useToast } from "../app/toasts.js";
import { HttpError } from "../lib/http.js";
import { useMeterUnits } from "../app/meterUnits.js";
import { ErrorState, LoadingState } from "../components/Feedback.js";
import { Icon } from "../components/Icon.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";

export function MeterUnitsPage() {
  const { user } = useAuth();
  const { t, l } = useI18n();
  const { activeBranch } = useBranches();
  const toast = useToast();
  const { meters, stockUnits, loading, error, createMeter, updateMeter } = useMeterUnits();
  const [showInactive, setShowInactive] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [stockUnitId, setStockUnitId] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("");
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (activeBranch === null) return;
    try {
      await createMeter({
        branchId: activeBranch.id,
        code: code.toUpperCase(),
        name,
        stockUnitId,
        validFrom,
      });
      setCode("");
      setName("");
      setMessage("");
      toast(
        l("Pompa/meter berhasil ditambahkan.", "Pump/meter added.", "泵/仪表已添加。"),
        "success",
      );
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : l("Gagal menambahkan pompa.", "Could not add the pump.", "无法添加泵。 ");
      setMessage(message);
      toast(message, "error", caught instanceof HttpError ? caught.requestId : null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("meters.eyebrow")}
        title={t("meters.title")}
        description={t("meters.description")}
        actions={
          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />{" "}
            {l("Tampilkan nonaktif", "Show inactive", "显示停用项")}
          </label>
        }
      />
      {loading ? (
        <LoadingState
          label={l("Memuat master pompa…", "Loading pump master…", "正在加载泵主数据…")}
        />
      ) : null}
      {error === null ? null : <ErrorState message={error} />}
      <div className="pump-layout">
        {canManage ? (
          <Panel
            title={l("Tambah pompa/meter", "Add pump/meter", "添加泵/仪表")}
            eyebrow={l("Tidak ada batas jumlah", "No fixed count", "无固定数量限制")}
            className="pump-form-panel"
          >
            <form className="pump-form" onSubmit={submit}>
              <label className="field">
                <span>{l("Kode unik", "Unique code", "唯一代码")}</span>
                <input
                  required
                  minLength={2}
                  maxLength={40}
                  pattern="[A-Za-z0-9_-]+"
                  placeholder="PMP-04"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Label tampilan", "Display label", "显示标签")}</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder={l("Pompa Jalur Timur", "East-lane pump", "东侧泵")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Sumber unit stock", "Stock-unit source", "库存单元来源")}</span>
                <select
                  required
                  value={stockUnitId}
                  onChange={(event) => setStockUnitId(event.target.value)}
                >
                  <option value="">
                    {l("Pilih unit stock", "Select stock unit", "选择库存单元")}
                  </option>
                  {stockUnits.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.name} — {stock.productName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{l("Berlaku mulai", "Effective from", "生效日期")}</span>
                <input
                  required
                  type="date"
                  value={validFrom}
                  onChange={(event) => setValidFrom(event.target.value)}
                />
              </label>
              <button className="button button-primary" type="submit">
                {l("Tambah pompa", "Add pump", "添加泵")}
              </button>
              {message === "" ? null : (
                <p className="setting-help" role="status">
                  {message}
                </p>
              )}
            </form>
          </Panel>
        ) : null}
        <Panel
          title={l("Daftar pompa/meter", "Pump/meter list", "泵/仪表列表")}
          eyebrow={`${meters.filter((meter) => meter.active).length} ${l("aktif", "active", "启用")}`}
          className="pump-list-panel"
        >
          <div className="pump-list">
            {meters
              .filter((meter) => showInactive || meter.active)
              .map((meter) => (
                <article
                  className={`pump-card ${meter.active ? "" : "pump-inactive"}`}
                  key={meter.id}
                >
                  <span className="pump-icon">
                    <Icon name="meter" />
                  </span>
                  <div className="pump-card-body">
                    {editingId === meter.id ? (
                      <input
                        aria-label={`Label baru ${meter.code}`}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                    ) : (
                      <strong>{meter.name}</strong>
                    )}
                    <span>
                      {meter.code} · {meter.stockUnitName}
                    </span>
                  </div>
                  <span className={`status ${meter.active ? "status-matched" : "status-closed"}`}>
                    {meter.active
                      ? l("Aktif", "Active", "启用")
                      : l("Nonaktif", "Inactive", "停用")}
                  </span>
                  {canManage ? (
                    <div className="pump-actions">
                      {editingId === meter.id ? (
                        <button
                          className="button"
                          type="button"
                          onClick={async () => {
                            try {
                              await updateMeter(meter.id, {
                                name: editingName,
                                active: meter.active,
                              });
                              setEditingId(null);
                              toast(
                                l("Label diperbarui.", "Label updated.", "标签已更新。"),
                                "success",
                              );
                            } catch (e) {
                              toast(
                                e instanceof Error
                                  ? e.message
                                  : l("Gagal memperbarui.", "Update failed.", "更新失败。"),
                                "error",
                                e instanceof HttpError ? e.requestId : null,
                              );
                            }
                          }}
                        >
                          {t("common.save")}
                        </button>
                      ) : (
                        <button
                          className="button"
                          type="button"
                          onClick={() => {
                            setEditingId(meter.id);
                            setEditingName(meter.name);
                          }}
                        >
                          {l("Ubah label", "Edit label", "编辑标签")}
                        </button>
                      )}
                      <button
                        className="button"
                        type="button"
                        onClick={async () => {
                          try {
                            await updateMeter(meter.id, {
                              name: meter.name,
                              active: !meter.active,
                            });
                            toast(
                              l(
                                "Status pompa diperbarui.",
                                "Pump status updated.",
                                "泵状态已更新。",
                              ),
                              "success",
                            );
                          } catch (e) {
                            toast(
                              e instanceof Error
                                ? e.message
                                : l("Gagal memperbarui.", "Update failed.", "更新失败。"),
                              "error",
                              e instanceof HttpError ? e.requestId : null,
                            );
                          }
                        }}
                      >
                        {meter.active
                          ? l("Nonaktifkan", "Deactivate", "停用")
                          : l("Aktifkan", "Activate", "启用")}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            {meters.length === 0 ? (
              <p className="empty-state">
                {l(
                  "Belum ada pompa/meter. Tambahkan unit pertama dari form.",
                  "No pumps/meters yet. Add the first one using the form.",
                  "暂无泵/仪表，请使用表单添加第一个。",
                )}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
