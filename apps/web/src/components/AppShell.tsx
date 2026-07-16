import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AuthUser } from "@spbu/contracts";
import type { RouteKey } from "../app/routes.js";
import { isMockMode } from "../data/gateway.js";
import { useBranches } from "../app/branches.js";
import { getBroadcasts } from "../data/operationsGateway.js";
import type { SystemBroadcast } from "@spbu/contracts";
import { useToast } from "../app/toasts.js";
import { Icon, type IconName } from "./Icon.js";
import { usePreferences } from "../app/preferences.js";
import { useI18n } from "../app/i18n.js";
import { getProfile } from "../data/profileGateway.js";
import { formatDateTime } from "../lib/format.js";
import { startSerializedPolling } from "../lib/polling.js";
import { safeStorage } from "../lib/storage.js";

const navigation: Array<{
  route: RouteKey;
  labelKey:
    | "nav.dashboard"
    | "nav.stock"
    | "nav.meters"
    | "nav.readings"
    | "nav.reconciliation"
    | "nav.reports"
    | "nav.profile"
    | "nav.accounts"
    | "nav.settings";
  icon: IconName;
}> = [
  { route: "dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { route: "stock-units", labelKey: "nav.stock", icon: "stock" },
  { route: "meter-units", labelKey: "nav.meters", icon: "meter" },
  { route: "meter-readings", labelKey: "nav.readings", icon: "reading" },
  {
    route: "reconciliation",
    labelKey: "nav.reconciliation",
    icon: "reconcile",
  },
  { route: "reports", labelKey: "nav.reports", icon: "report" },
  { route: "profiles", labelKey: "nav.profile", icon: "user" },
  { route: "accounts", labelKey: "nav.accounts", icon: "accounts" },
  { route: "settings", labelKey: "nav.settings", icon: "settings" },
];

export function AppShell({
  route,
  user,
  onLogout,
  children,
}: {
  route: RouteKey;
  user: AuthUser;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const { branches, activeBranch, setActiveBranchId, createBranch } = useBranches();
  const toast = useToast();
  const { sidebarCompact, setSidebarCompact } = usePreferences();
  const { t, l } = useI18n();
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [broadcasts, setBroadcasts] = useState<SystemBroadcast[]>([]);
  const [broadcastOpen, setBroadcastOpen] = useState(
    () => safeStorage.getItem("pli-broadcast-drawer-v1") !== "closed",
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const loadAvatar = async () =>
      getProfile(user.id)
        .then((profile) => {
          if (current) setAvatarUrl(profile.avatarUrl);
        })
        .catch(() => {
          if (current) setAvatarUrl(null);
        });
    const stopPolling = startSerializedPolling(loadAvatar, 10 * 60_000);
    return () => {
      current = false;
      stopPolling();
    };
  }, [user.id, user.avatarObjectKey]);
  useEffect(() => {
    if (!activeBranch) {
      setBroadcasts([]);
      return;
    }
    const load = async () =>
      getBroadcasts(activeBranch.id)
        .then((items) =>
          setBroadcasts(
            [...items].sort(
              (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
            ),
          ),
        )
        .catch(() => undefined);
    return startSerializedPolling(load, 10_000);
  }, [activeBranch?.id]);
  const submitBranch = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createBranch({
        code: code.toUpperCase(),
        name,
        timezone: "Asia/Jakarta",
      });
      setCode("");
      setName("");
      setShowBranchForm(false);
      toast(
        l(
          "Cabang ditambahkan dan diaktifkan.",
          "Branch added and activated.",
          "分支已添加并启用。",
        ),
        "success",
      );
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Cabang gagal ditambahkan.", "Could not add the branch.", "无法添加分支。"),
        "error",
      );
    }
  };
  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const toggleBroadcasts = () => {
    const next = !broadcastOpen;
    setBroadcastOpen(next);
    safeStorage.setItem("pli-broadcast-drawer-v1", next ? "open" : "closed");
  };
  const visibleNavigation = navigation.filter(
    (item) => item.route !== "accounts" || user.role === "ADMIN",
  );
  return (
    <div className={`app-shell ${sidebarCompact ? "sidebar-compact" : ""}`}>
      <a className="skip-link" href="#main-content">
        {l("Langsung ke konten", "Skip to content", "跳到内容")}
      </a>
      <aside
        className="sidebar"
        aria-label={l("Sidebar navigasi", "Navigation sidebar", "导航侧栏")}
      >
        <a
          className="brand"
          href="#/dashboard"
          aria-label="Putra Laskar Indonesia Dashboard — beranda"
        >
          <span className="brand-mark">PLI</span>
          <span>
            <strong>Putra Laskar</strong>
            <small>Indonesia Dashboard</small>
          </span>
        </a>
        <nav aria-label={l("Navigasi utama", "Primary navigation", "主导航")}>
          <ul>
            {visibleNavigation.map((item) => (
              <li key={item.route}>
                <a
                  href={`#/${item.route}`}
                  className={route === item.route ? "active" : ""}
                  aria-current={route === item.route ? "page" : undefined}
                  aria-label={t(item.labelKey)}
                  title={sidebarCompact ? t(item.labelKey) : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{t(item.labelKey)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button
          data-tour="sidebar-toggle"
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarCompact(!sidebarCompact)}
          aria-label={sidebarCompact ? t("shell.expand") : t("shell.compact")}
          title={sidebarCompact ? t("shell.expand") : t("shell.compact")}
        >
          <Icon name="arrow" />
          <span>{sidebarCompact ? t("shell.expand") : t("shell.compact")}</span>
        </button>
        <footer className="sidebar-footer">
          <span className="connection-dot" />
          <span>
            <strong>{isMockMode() ? t("shell.demo") : t("shell.connected")}</strong>
            <small>v1.0.0</small>
          </span>
        </footer>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="branch-switcher">
            <p className="eyebrow">{t("shell.activeBranch")}</p>
            <select
              aria-label={t("shell.activeBranch")}
              value={activeBranch?.id ?? ""}
              onChange={(e) => setActiveBranchId(e.target.value)}
            >
              {branches.length === 0 ? (
                <option value="" disabled>
                  {l("Belum ada cabang", "No branches yet", "暂无分支")}
                </option>
              ) : null}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.code}
                </option>
              ))}
            </select>
            {user.role === "ADMIN" ? (
              <button className="text-button" type="button" onClick={() => setShowBranchForm(true)}>
                + {t("shell.addBranch")}
              </button>
            ) : null}
          </div>
          <a
            className="user-chip"
            aria-label={l("Pengguna aktif", "Active user", "当前用户")}
            href={`#/profiles/${user.id}`}
          >
            <span className="user-chip-avatar">
              {avatarUrl === null ? (
                initials || "U"
              ) : (
                <img src={avatarUrl} alt="" aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.role}</small>
            </span>
          </a>
          <button className="button topbar-logout" type="button" onClick={() => void onLogout()}>
            {t("shell.logout")}
          </button>
        </header>
        {broadcasts.length ? (
          <section
            className={`broadcast-drawer ${broadcastOpen ? "open" : "closed"}`}
            aria-label={l("Pengumuman operasional", "Operational announcements", "运营公告")}
          >
            <button
              className="broadcast-drawer-toggle"
              type="button"
              onClick={toggleBroadcasts}
              aria-expanded={broadcastOpen}
              aria-controls="broadcast-list"
            >
              <span>
                <Icon name="alert" />
                <strong>{l("Pengumuman", "Announcements", "公告")}</strong>
                <small>{broadcasts.length}</small>
              </span>
              <Icon name="arrow" />
            </button>
            {broadcastOpen ? (
              <div className="broadcast-strip" id="broadcast-list">
                {broadcasts.map((item, index) => (
                  <article
                    className={`broadcast-${item.severity.toLowerCase()} ${index === 0 ? "broadcast-latest" : ""}`}
                    key={item.id}
                  >
                    <strong>{item.title}</strong>
                    <span title={item.message}>{item.message}</span>
                    <small>
                      {item.createdByName} ·{" "}
                      <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          Putra Laskar Indonesia Dashboard · Support{" "}
          <a href="mailto:yudhizz14@gmail.com">Mr.Yudhistira — yudhizz14@gmail.com</a>
        </footer>
      </div>
      {showBranchForm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowBranchForm(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-dialog-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">{l("Master cabang", "Branch master", "分支主数据")}</p>
                <h2 id="branch-dialog-title">{t("shell.addBranch")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowBranchForm(false)}
                aria-label={t("common.close")}
              >
                ×
              </button>
            </header>
            <form onSubmit={submitBranch}>
              <label className="field">
                <span>{l("Kode", "Code", "代码")}</span>
                <input
                  required
                  pattern="[A-Za-z0-9_-]+"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Nama cabang", "Branch name", "分支名称")}</span>
                <input
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <footer className="form-actions">
                <button className="button" type="button" onClick={() => setShowBranchForm(false)}>
                  {t("common.cancel")}
                </button>
                <button className="button button-primary">
                  {l("Simpan cabang", "Save branch", "保存分支")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
