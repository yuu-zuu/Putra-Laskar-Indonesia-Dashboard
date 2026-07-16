import type { ReconciliationStatus } from "@spbu/contracts";
import { useI18n } from "../app/i18n.js";

export function StatusPill({ status }: { status: ReconciliationStatus }) {
  const { l } = useI18n();
  const labels: Record<ReconciliationStatus, string> = {
    PENDING: l("Perlu tinjau", "Pending review", "待审核"),
    MATCHED: l("Cocok", "Matched", "一致"),
    EXPLAINED: l("Terjelaskan", "Explained", "已说明"),
    ESCALATED: l("Dieskalasi", "Escalated", "已升级"),
    CLOSED: l("Ditutup", "Closed", "已关闭"),
  };
  return <span className={`status status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
