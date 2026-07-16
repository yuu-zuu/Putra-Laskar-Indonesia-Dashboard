import type { AuditLogItem } from "@spbu/contracts";
import { useEffect, useState } from "react";
import { useI18n } from "../app/i18n.js";
import { getAuditLogs } from "../data/auditGateway.js";
import { formatDateTime } from "../lib/format.js";
import { startSerializedPolling } from "../lib/polling.js";

export function ActivityLog({
  branchId,
  actorId,
}: {
  branchId?: string | undefined;
  actorId?: string | undefined;
}) {
  const { t, l } = useI18n();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ search: "", action: "", outcome: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const load = async (reset: boolean) => {
    setLoading(true);
    try {
      setError(null);
      const page = await getAuditLogs({
        branchId,
        actorId,
        search: appliedFilters.search || undefined,
        action: appliedFilters.action || undefined,
        outcome: appliedFilters.outcome || undefined,
        cursor: reset ? undefined : (cursor ?? undefined),
        limit: 50,
      });
      setItems((current) => (reset ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : l(
              "Log aktivitas gagal dimuat.",
              "Could not load the activity log.",
              "无法加载活动日志。",
            ),
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    return startSerializedPolling(() => load(true), 15_000);
  }, [branchId, actorId, appliedFilters]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <div className="audit-log">
      <form
        className="audit-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters({ search, action, outcome });
        }}
      >
        <label className="field">
          <span>{t("common.search")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={l(
              "ID, alasan, atau detail…",
              "ID, reason, or details…",
              "编号、原因或详情…",
            )}
          />
        </label>
        <label className="field">
          <span>{t("audit.activity")}</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">{t("common.all")}</option>
            {[
              "CREATE",
              "POST",
              "UPDATE",
              "DEACTIVATE",
              "CORRECT",
              "RECONCILE",
              "COMMENT",
              "REGISTER",
              "LOGIN",
              "LOGOUT",
              "DELETE_ACCOUNT",
              "UPDATE_ACCOUNT_ASSIGNMENT",
              "UPDATE_PROFILE",
              "COMPLETE_TUTORIAL",
              "RESET_TUTORIAL",
              "EXPORT",
              "IMPORT",
              "PRESIGN_UPLOAD",
            ].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{l("Hasil", "Outcome", "结果")}</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="">{t("common.all")}</option>
            <option value="SUCCEEDED">{l("Berhasil", "Succeeded", "成功")}</option>
            <option value="FAILED">{l("Gagal", "Failed", "失败")}</option>
            <option value="DENIED">{l("Ditolak", "Denied", "已拒绝")}</option>
          </select>
        </label>
        <button className="button" disabled={loading}>
          {loading ? t("common.loading") : t("common.search")}
        </button>
      </form>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="activity-ledger">
        {items.map((item) => (
          <article className="activity-entry" key={item.id}>
            <button
              className="activity-summary"
              type="button"
              aria-expanded={expanded.has(item.id)}
              onClick={() => toggle(item.id)}
            >
              <span
                className={`activity-mark activity-mark-${item.outcome === "SUCCEEDED" ? tone(item.action) : "danger"}`}
              />
              <span>
                <strong>
                  {item.action} ·{" "}
                  <em className={`audit-outcome audit-outcome-${item.outcome.toLowerCase()}`}>
                    {item.outcome}
                  </em>
                </strong>
                <small>
                  {item.objectType} · {item.objectId}
                </small>
              </span>
              <span>
                <strong>{item.actorName}</strong>
                <small>
                  {item.actorEmployeeId ?? "SYSTEM"} · {item.actorRole ?? "SYSTEM"}
                </small>
              </span>
              <time>{formatDateTime(item.occurredAt)}</time>
              <b>{expanded.has(item.id) ? "−" : "+"}</b>
            </button>
            {expanded.has(item.id) ? (
              <div className="activity-detail">
                <dl>
                  <div>
                    <dt>{t("audit.reason")}</dt>
                    <dd>{item.reason ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("audit.actor")}</dt>
                    <dd>
                      {item.actorId === null ? (
                        item.actorName
                      ) : (
                        <a href={`#/profiles/${item.actorId}`}>{item.actorName}</a>
                      )}{" "}
                      · {item.actorEmployeeId ?? "SYSTEM"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("audit.object")}</dt>
                    <dd>
                      {item.objectType} / {item.objectId}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("audit.time")}</dt>
                    <dd>{formatDateTime(item.occurredAt)}</dd>
                  </div>
                  <div>
                    <dt>Request ID</dt>
                    <dd>{item.requestId ?? "—"}</dd>
                  </div>
                </dl>
                <h3>{t("audit.details")}</h3>
                <pre>{JSON.stringify(item.metadata, null, 2)}</pre>
              </div>
            ) : null}
          </article>
        ))}
        {!loading && items.length === 0 ? <p className="empty-state">{t("audit.empty")}</p> : null}
      </div>
      {cursor !== null ? (
        <button className="button audit-more" disabled={loading} onClick={() => void load(false)}>
          {t("audit.loadMore")}
        </button>
      ) : null}
    </div>
  );
}
function tone(action: string): "info" | "success" | "warning" | "danger" {
  if (action.includes("DELETE") || action.includes("DEACTIVATE")) return "danger";
  if (action === "CORRECT" || action === "RECONCILE") return "warning";
  if (action === "CREATE" || action === "REGISTER") return "success";
  return "info";
}
