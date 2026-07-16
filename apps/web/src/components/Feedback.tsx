import { Icon } from "./Icon.js";
import { useI18n } from "../app/i18n.js";

export function LoadingState({ label }: { label?: string }) {
  const { l } = useI18n();
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      <span>{label ?? l("Memuat data…", "Loading data…", "正在加载数据…")}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { l } = useI18n();
  return (
    <div className="callout callout-danger" role="alert">
      <Icon name="alert" />
      <div>
        <strong>{l("Data belum dapat dimuat", "Data could not be loaded", "无法加载数据")}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
