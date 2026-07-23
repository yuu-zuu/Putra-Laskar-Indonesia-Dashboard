import {
  formulas,
  type ReconciliationComment,
  type ReconciliationRevision,
  type ReconciliationRow,
  type ReconciliationStatus,
} from "@spbu/contracts";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../app/auth.js";
import { useBranches } from "../app/branches.js";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { FormulaHint } from "../components/FormulaHint.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { StatusPill } from "../components/StatusPill.js";
import {
  addReconciliationComment,
  correctReconciliation,
  getReconciliationComments,
  getReconciliationHistory,
  getReadings,
  updateReconciliation,
} from "../data/operationsGateway.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { formatCurrency, formatDate, formatDateTime, formatLiter, signed } from "../lib/format.js";
type Filter = "ALL" | ReconciliationStatus;
export function ReconciliationPage() {
  const { user } = useAuth();
  const { activeBranch } = useBranches();
  const { t, l } = useI18n();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showAll, setShowAll] = useState(false);
  const { data, reload } = useDashboard(showAll ? "" : (activeBranch?.id ?? ""), date);
  const [allRows, setAllRows] = useState<ReconciliationRow[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);
  const [allRowsError, setAllRowsError] = useState<string | null>(null);
  const [allRowsRevision, setAllRowsRevision] = useState(0);
  const [status, setStatus] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);
  const [detail, setDetail] = useState<ReconciliationRow | null>(null);
  const [nextStatus, setNextStatus] = useState<ReconciliationStatus>("EXPLAINED");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!showAll || !activeBranch?.id) {
      setAllRows([]);
      setAllRowsLoading(false);
      setAllRowsError(null);
      return;
    }
    let cancelled = false;
    setAllRowsLoading(true);
    setAllRowsError(null);
    void getReadings(activeBranch.id, null)
      .then((items) => {
        if (!cancelled) setAllRows(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAllRows([]);
          setAllRowsError(
            error instanceof Error
              ? error.message
              : l("Rekonsiliasi gagal dimuat.", "Could not load reconciliations.", "无法加载对账记录。"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAllRowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranch?.id, allRowsRevision, l, showAll]);
  useEffect(() => {
    setSelected(new Set());
  }, [activeBranch?.id, date, showAll, status]);
  const sourceRows = showAll ? allRows : (data?.reconciliations ?? []);
  const rows = useMemo(
    () => sourceRows.filter((row) => status === "ALL" || row.status === status),
    [sourceRows, status],
  );
  const reloadRows = () => {
    if (showAll) setAllRowsRevision((value) => value + 1);
    else reload();
  };
  const absoluteLiter = rows.reduce((sum, row) => sum + Math.abs(row.literVariance), 0),
    absoluteCash = rows.reduce((sum, row) => sum + Math.abs(row.cashVariance), 0);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const saveReview = async () => {
    const targets = selected.size ? [...selected] : rows.map((row) => row.id);
    if (!targets.length) return;
    try {
      await Promise.all(
        targets.map((id) => updateReconciliation(id, nextStatus, note.trim() || null)),
      );
      toast(
        l(
          `${targets.length} rekonsiliasi diperbarui.`,
          `${targets.length} reconciliation rows updated.`,
          `${targets.length} 条对账记录已更新。`,
        ),
        "success",
      );
      setSelected(new Set());
      setReview(false);
      reloadRows();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Review gagal disimpan.", "Could not save the review.", "无法保存审核。"),
        "error",
      );
    }
  };
  return (
    <>
      <PageHeader
        eyebrow={t("recon.eyebrow")}
        title={t("recon.title")}
        description={t("recon.description")}
        actions={
          <div className="reconciliation-actions">
            <div className="reconciliation-filter-stack">
              <label className="toggle-filter">
                <span>{l("Tampilkan semua", "Show all", "显示全部")}</span>
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => setShowAll(event.target.checked)}
                />
              </label>
              <label className="date-filter">
                <span>{l("Tanggal", "Date", "日期")}</span>
                <input
                  type="date"
                  value={date}
                  disabled={showAll}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button button-primary"
              disabled={!rows.length || (showAll && selected.size === 0)}
              title={
                showAll && selected.size === 0
                  ? l(
                      "Pilih minimal satu baris saat menampilkan semua tanggal.",
                      "Select at least one row when showing all dates.",
                      "显示全部日期时请至少选择一行。",
                    )
                  : undefined
              }
              onClick={() => setReview(true)}
            >
              {l("Tinjau", "Review", "审核")} {selected.size || (showAll ? 0 : "batch")}
            </button>
          </div>
        }
      />
      <section className="mini-metric-grid">
        <article>
          <span>{l("Baris diperiksa", "Rows inspected", "已检查行数")}</span>
          <strong>{rows.length}</strong>
          <small>
            {rows.filter((row) => row.status === "MATCHED").length} {l("cocok", "matched", "一致")}
          </small>
        </article>
        <article>
          <span>{l("Total selisih absolut", "Total absolute variance", "绝对差异总计")}</span>
          <strong>{formatLiter(absoluteLiter)}</strong>
          <FormulaHint formula={formulas.literVariance} />
        </article>
        <article>
          <span>{l("Eksposur kas absolut", "Absolute cash exposure", "绝对现金风险")}</span>
          <strong>{formatCurrency(absoluteCash)}</strong>
          <FormulaHint formula={formulas.cashVariance} />
        </article>
        <article>
          <span>{l("Perlu tindak lanjut", "Requires follow-up", "需要跟进")}</span>
          <strong>
            {rows.filter((row) => row.status === "PENDING" || row.status === "ESCALATED").length}
          </strong>
        </article>
      </section>
      <Panel
        title={l(
          "Perbandingan meter dan posting",
          "Meter and posting comparison",
          "仪表与过账比较",
        )}
        eyebrow={showAll ? l("Semua tanggal", "All dates", "全部日期") : date}
        action={
          <label className="inline-filter">
            <span>{l("Status", "Status", "状态")}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as Filter)}>
              <option value="ALL">{t("common.all")}</option>
              <option value="PENDING">{l("Perlu tinjau", "Pending review", "待审核")}</option>
              <option value="MATCHED">{l("Cocok", "Matched", "一致")}</option>
              <option value="EXPLAINED">{l("Terjelaskan", "Explained", "已说明")}</option>
              <option value="ESCALATED">{l("Dieskalasi", "Escalated", "已升级")}</option>
              <option value="CLOSED">{l("Ditutup", "Closed", "已关闭")}</option>
            </select>
          </label>
        }
      >
        <div className="table-scroll wide-table">
          <table>
            <thead>
              <tr>
                <th className="select-column">
                  <span className="sr-only">{l("Pilih", "Select", "选择")}</span>
                </th>
                {showAll ? <th>{l("Tanggal", "Date", "日期")}</th> : null}
                <th>{l("Meter / unit", "Meter / unit", "仪表 / 单元")}</th>
                <th>{l("Meter", "Meter", "仪表")}</th>
                <th>{l("Posting", "Posting", "过账")}</th>
                <th>{l("Selisih L", "L variance", "升数差异")}</th>
                <th>{l("Seharusnya", "Expected", "应有金额")}</th>
                <th>{l("Setoran", "Deposit", "存款")}</th>
                <th>{l("Selisih kas", "Cash variance", "现金差异")}</th>
                <th>{l("Status", "Status", "状态")}</th>
                <th>{l("Aksi", "Action", "操作")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="select-column">
                    <input
                      className="row-checkbox"
                      aria-label={`Pilih ${row.meterUnitName}`}
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  {showAll ? <td>{formatDate(row.businessDate)}</td> : null}
                  <th>
                    <strong>{row.meterUnitName}</strong>
                    <small>{row.stockUnitName}</small>
                    {row.note ? <em>{row.note}</em> : null}
                  </th>
                  <td>{formatLiter(row.meterSalesQty)}</td>
                  <td>{formatLiter(row.postedSalesQty)}</td>
                  <td className={row.literVariance ? "value-danger" : "value-ok"}>
                    {signed(row.literVariance, formatLiter)}
                  </td>
                  <td>{formatCurrency(row.expectedSalesAmount)}</td>
                  <td>{formatCurrency(row.cashDepositAmount)}</td>
                  <td className={row.cashVariance ? "value-warning" : "value-ok"}>
                    {signed(row.cashVariance, formatCurrency)}
                  </td>
                  <td>
                    <StatusPill status={row.status} />
                  </td>
                  <td>
                    <button className="button button-small" onClick={() => setDetail(row)}>
                      {l("Detail audit", "Audit detail", "审计详情")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showAll && allRowsLoading ? (
          <p className="empty-state">{l("Memuat semua tanggal…", "Loading all dates…", "正在加载全部日期…")}</p>
        ) : null}
        {showAll && allRowsError ? <p className="empty-state value-danger">{allRowsError}</p> : null}
        {!allRowsLoading && !allRowsError && !rows.length ? (
          <p className="empty-state">
            {l(
              showAll
                ? "Belum ada bacaan untuk filter ini."
                : "Belum ada bacaan untuk tanggal dan filter ini.",
              showAll
                ? "No readings match this filter."
                : "No readings match this date and filter.",
              showAll ? "该筛选条件下暂无读数。" : "该日期和筛选条件下暂无读数。",
            )}
          </p>
        ) : null}
      </Panel>
      {review ? (
        <ReviewDialog
          count={selected.size || rows.length}
          status={nextStatus}
          setStatus={setNextStatus}
          note={note}
          setNote={setNote}
          close={() => setReview(false)}
          save={() => void saveReview()}
        />
      ) : null}
      {detail ? (
        <AuditDialog
          row={detail}
          canCorrect={
            user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "FINANCE"
          }
          close={() => setDetail(null)}
          changed={() => {
            reloadRows();
          }}
        />
      ) : null}
    </>
  );
}

function ReviewDialog({
  count,
  status,
  setStatus,
  note,
  setNote,
  close,
  save,
}: {
  count: number;
  status: ReconciliationStatus;
  setStatus: (value: ReconciliationStatus) => void;
  note: string;
  setNote: (value: string) => void;
  close: () => void;
  save: () => void;
}) {
  const { t, l } = useI18n();
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{l("Keputusan tinjauan", "Review decision", "审核决定")}</h2>
          <button className="icon-button" onClick={close}>
            ×
          </button>
        </header>
        <p className="setting-help">
          {count}{" "}
          {l(
            "baris akan diperbarui. Nilai sumber tidak berubah pada tahap keputusan.",
            "rows will be updated. Source values do not change at the decision stage.",
            "行将被更新；在决定阶段不会更改源值。",
          )}
        </p>
        <label className="field">
          <span>{l("Status", "Status", "状态")}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ReconciliationStatus)}
          >
            <option value="MATCHED">{l("Cocok", "Matched", "一致")}</option>
            <option value="EXPLAINED">{l("Terjelaskan", "Explained", "已说明")}</option>
            <option value="ESCALATED">{l("Dieskalasi", "Escalated", "已升级")}</option>
            <option value="CLOSED">{l("Ditutup", "Closed", "已关闭")}</option>
          </select>
        </label>
        <label className="field">
          <span>{l("Catatan keputusan", "Decision note", "决定说明")}</span>
          <textarea
            required={status !== "MATCHED"}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <footer className="form-actions">
          <button className="button" onClick={close}>
            {t("common.cancel")}
          </button>
          <button className="button button-primary" onClick={save}>
            {l("Simpan tinjauan", "Save review", "保存审核")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function AuditDialog({
  row,
  canCorrect,
  close,
  changed,
}: {
  row: ReconciliationRow;
  canCorrect: boolean;
  close: () => void;
  changed: () => void;
}) {
  const toast = useToast();
  const { l } = useI18n();
  const [tab, setTab] = useState<"values" | "history" | "discussion">("values");
  const [history, setHistory] = useState<ReconciliationRevision[]>([]);
  const [comments, setComments] = useState<ReconciliationComment[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [form, setForm] = useState({
    meterStart: String(row.meterStart),
    meterEnd: String(row.meterEnd),
    meterResetOffset: String(row.resetOffset),
    cashDepositAmount: String(row.cashDepositAmount),
    note: row.note ?? "",
    reason: "",
  });
  const load = async () => {
    try {
      setAuditError(null);
      const [nextHistory, nextComments] = await Promise.all([
        getReconciliationHistory(row.id),
        getReconciliationComments(row.id),
      ]);
      setHistory(nextHistory);
      setComments(nextComments);
    } catch (caught) {
      setAuditError(
        caught instanceof Error
          ? caught.message
          : l("Detail audit gagal dimuat.", "Could not load audit details.", "无法加载审核详情。"),
      );
    }
  };
  useEffect(() => {
    void load();
  }, [row.id]);
  const submitCorrection = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await correctReconciliation(row.id, {
        meterStart: Number(form.meterStart),
        meterEnd: Number(form.meterEnd),
        meterResetOffset: Number(form.meterResetOffset),
        cashDepositAmount: Number(form.cashDepositAmount),
        note: form.note.trim() || null,
        reason: form.reason,
      });
      toast(
        l(
          "Koreksi tersimpan sebagai revisi baru.",
          "Correction saved as a new revision.",
          "更正已保存为新修订。",
        ),
        "success",
      );
      setForm((current) => ({ ...current, reason: "" }));
      await load();
      changed();
      setTab("history");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Koreksi gagal.", "Correction failed.", "更正失败。"),
        "error",
      );
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal audit-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">
              {row.businessDate} · {row.stockUnitName}
            </p>
            <h2>{row.meterUnitName}</h2>
          </div>
          <button className="icon-button" onClick={close}>
            ×
          </button>
        </header>
        <nav className="dialog-tabs">
          <button className={tab === "values" ? "active" : ""} onClick={() => setTab("values")}>
            {l("Nilai & koreksi", "Values & correction", "数值与更正")}
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            Revision ledger ({history.length})
          </button>
          <button
            className={tab === "discussion" ? "active" : ""}
            onClick={() => setTab("discussion")}
          >
            {l("Diskusi", "Discussion", "讨论")} ({comments.length})
          </button>
        </nav>
        {auditError === null ? null : (
          <p className="form-error" role="alert">
            {auditError}
          </p>
        )}
        {tab === "values" ? (
          <form className="correction-form" onSubmit={submitCorrection}>
            <div className="field-grid">
              <label className="field">
                <span>{l("Meter awal", "Opening meter", "起始仪表")}</span>
                <input
                  disabled={!canCorrect}
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.meterStart}
                  onChange={(event) => setForm({ ...form, meterStart: event.target.value })}
                />
              </label>
              <label className="field">
                <span>{l("Meter akhir", "Closing meter", "结束仪表")}</span>
                <input
                  disabled={!canCorrect}
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.meterEnd}
                  onChange={(event) => setForm({ ...form, meterEnd: event.target.value })}
                />
              </label>
              <label className="field">
                <span>{l("Offset reset", "Reset offset", "重置偏移")}</span>
                <input
                  disabled={!canCorrect}
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.meterResetOffset}
                  onChange={(event) => setForm({ ...form, meterResetOffset: event.target.value })}
                />
              </label>
              <label className="field">
                <span>{l("Setoran kas", "Cash deposit", "现金存款")}</span>
                <input
                  disabled={!canCorrect}
                  type="number"
                  min="0"
                  step="1"
                  value={form.cashDepositAmount}
                  onChange={(event) => setForm({ ...form, cashDepositAmount: event.target.value })}
                />
              </label>
              <label className="field field-span-2">
                <span>{l("Catatan transaksi", "Transaction note", "交易备注")}</span>
                <textarea
                  disabled={!canCorrect}
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </label>
              <label className="field field-span-2">
                <span>{l("Alasan koreksi", "Correction reason", "更正原因")}</span>
                <textarea
                  disabled={!canCorrect}
                  required
                  minLength={5}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  placeholder={l(
                    "Jelaskan bukti, temuan audit, dan alasan nilai diubah.",
                    "Explain the evidence, audit finding, and reason for changing the value.",
                    "说明证据、审计发现及更改数值的原因。",
                  )}
                />
              </label>
            </div>
            {canCorrect ? (
              <footer className="form-actions">
                <button className="button button-primary">
                  {l("Simpan sebagai revisi baru", "Save as new revision", "保存为新修订")}
                </button>
              </footer>
            ) : (
              <p className="callout callout-muted">
                {l(
                  "Role Anda memiliki akses audit baca dan diskusi, tetapi tidak dapat mengubah nilai transaksi.",
                  "Your role can read audits and join discussions, but cannot change transaction values.",
                  "您的角色可查看审计并参与讨论，但不能更改交易数值。",
                )}
              </p>
            )}
          </form>
        ) : null}
        {tab === "history" ? <RevisionLedger items={history} /> : null}
        {tab === "discussion" ? (
          <Discussion
            readingId={row.id}
            items={comments}
            changed={async () => {
              await load();
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function RevisionLedger({ items }: { items: ReconciliationRevision[] }) {
  const { l } = useI18n();
  return (
    <div className="revision-list">
      {items.map((item) => (
        <article key={item.id}>
          <header>
            <span>
              {l("Revisi", "Revision", "修订")} {item.revisionNo}
            </span>
            <strong>{item.actorName}</strong>
            <time>{formatDateTime(item.createdAt)}</time>
          </header>
          <p>{item.reason}</p>
          <div className="revision-diff">
            {changedFields(item.before, item.after).map((change) => (
              <div key={change.key}>
                <span>{change.key}</span>
                <del>{String(change.before ?? "—")}</del>
                <ins>{String(change.after ?? "—")}</ins>
              </div>
            ))}
          </div>
        </article>
      ))}
      {items.length === 0 ? (
        <p className="empty-state">
          {l(
            "Belum pernah ada koreksi nilai.",
            "No value corrections have been recorded.",
            "尚无数值更正记录。",
          )}
        </p>
      ) : null}
    </div>
  );
}
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}
function Discussion({
  readingId,
  items,
  changed,
}: {
  readingId: string;
  items: ReconciliationComment[];
  changed: () => Promise<void>;
}) {
  const toast = useToast();
  const { l } = useI18n();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const roots = buildTree(items);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await addReconciliationComment(readingId, message, replyTo);
      setMessage("");
      setReplyTo(null);
      await changed();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Komentar gagal disimpan.", "Could not save the comment.", "无法保存评论。"),
        "error",
      );
    }
  };
  return (
    <div className="discussion">
      <div className="comment-tree">
        {roots.map((node) => (
          <CommentNode node={node} reply={setReplyTo} key={node.id} />
        ))}
      </div>
      <form onSubmit={submit}>
        <label className="field">
          <span>
            {replyTo === null
              ? l("Tambahkan temuan / bukti", "Add finding / evidence", "添加发现 / 证据")
              : l("Tulis balasan", "Write a reply", "撰写回复")}
          </span>
          <textarea
            required
            minLength={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <footer className="form-actions">
          {replyTo ? (
            <button className="button" type="button" onClick={() => setReplyTo(null)}>
              {l("Batalkan balasan", "Cancel reply", "取消回复")}
            </button>
          ) : null}
          <button className="button button-primary">
            {l("Kirim ke thread", "Post to thread", "发布到讨论串")}
          </button>
        </footer>
      </form>
    </div>
  );
}
interface CommentTree extends ReconciliationComment {
  children: CommentTree[];
}
function buildTree(items: ReconciliationComment[]): CommentTree[] {
  const map = new Map<string, CommentTree>();
  for (const item of items) map.set(item.id, { ...item, children: [] });
  const roots: CommentTree[] = [];
  for (const node of map.values()) {
    const parent = node.parentId === null ? undefined : map.get(node.parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
}
function CommentNode({ node, reply }: { node: CommentTree; reply: (id: string) => void }) {
  const { l } = useI18n();
  return (
    <article className="comment-node">
      <header>
        <a href={`#/profiles/${node.authorId}`}>{node.authorName}</a>
        <span>{node.authorRole}</span>
        <time>{formatDateTime(node.createdAt)}</time>
      </header>
      <p>{node.message}</p>
      <button className="text-button" onClick={() => reply(node.id)}>
        {l("Balas", "Reply", "回复")}
      </button>
      {node.children.length ? (
        <div className="comment-children">
          {node.children.map((child) => (
            <CommentNode node={child} reply={reply} key={child.id} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
