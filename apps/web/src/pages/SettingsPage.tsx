import { useEffect, useState, type FormEvent } from "react";
import { usePreferences } from "../app/preferences.js";
import { useAuth } from "../app/auth.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { getActiveRegistrationCode } from "../data/authGateway.js";
import { formatDateTime } from "../lib/format.js";
import { useBranches } from "../app/branches.js";
import { createBroadcast } from "../data/operationsGateway.js";
import { useToast } from "../app/toasts.js";
import { useI18n } from "../app/i18n.js";
import { useTutorial, type GuideId } from "../app/tutorial.js";
import { ActivityLog } from "../components/ActivityLog.js";
import { InfoHint } from "../components/InfoHint.js";
import { PasswordInput } from "../components/PasswordInput.js";
import type { AppLocale } from "@spbu/contracts";
import { HttpError } from "../lib/http.js";
import { copyText } from "../lib/clipboard.js";

export function SettingsPage() {
  const { theme, setTheme, density, setDensity, showFormulaDetails, setShowFormulaDetails } =
    usePreferences();
  const { user, changePassword, deleteAccount } = useAuth();
  const { locale, setLocale, t, l } = useI18n();
  const { start } = useTutorial();
  const { activeBranch } = useBranches();
  const toast = useToast();
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [severity, setSeverity] = useState<"INFO" | "WARNING" | "CRITICAL">("INFO");
  const [registration, setRegistration] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [changingPassword, setChangingPassword] = useState(false);

  const loadCode = async () => setRegistration(await getActiveRegistrationCode());
  const copyRegistrationCode = async () => {
    if (registration === null) return;
    try {
      await copyText(registration.code);
      toast(l("Kode disalin.", "Code copied.", "代码已复制。"), "success");
    } catch {
      toast(
        l(
          "Clipboard tidak tersedia. Salin kode secara manual.",
          "The clipboard is unavailable. Copy the code manually.",
          "剪贴板不可用，请手动复制代码。",
        ),
        "error",
      );
    }
  };
  useEffect(() => {
    if (user?.role === "ADMIN") void loadCode();
  }, [user?.role]);
  useEffect(() => {
    if (user?.role !== "ADMIN" || registration === null) return;
    const delay = Math.max(1_000, new Date(registration.expiresAt).getTime() - Date.now() + 250);
    const timer = window.setTimeout(() => void loadCode(), delay);
    return () => window.clearTimeout(timer);
  }, [registration?.expiresAt, user?.role]);

  const submitDeletion = async (event: FormEvent) => {
    event.preventDefault();
    setDeleteError("");
    if (confirmation !== "HAPUS") {
      setDeleteError(
        l("Ketik HAPUS untuk mengonfirmasi.", "Type HAPUS to confirm.", "输入 HAPUS 以确认。"),
      );
      return;
    }
    try {
      await deleteAccount(password);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : l("Penghapusan akun gagal.", "Account deletion failed.", "账户删除失败。"),
      );
    }
  };
  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== newPasswordConfirmation) {
      setPasswordErrors({
        confirmation: l(
          "Konfirmasi password tidak cocok.",
          "The password confirmation does not match.",
          "两次输入的密码不一致。",
        ),
      });
      return;
    }
    setPasswordErrors({});
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      toast(
        l(
          "Password diperbarui dan sesi lain telah dicabut.",
          "Password updated and other sessions were revoked.",
          "密码已更新，其他会话已撤销。",
        ),
        "success",
      );
    } catch (error) {
      if (error instanceof HttpError) setPasswordErrors(error.fieldErrors);
      toast(
        error instanceof Error
          ? error.message
          : l("Password gagal diubah.", "Could not change the password.", "无法更改密码。"),
        "error",
        error instanceof HttpError ? error.requestId : null,
      );
    } finally {
      setChangingPassword(false);
    }
  };
  const submitBroadcast = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createBroadcast({
        branchId: activeBranch?.id ?? null,
        title: broadcastTitle,
        message: broadcastMessage,
        severity,
        endsAt: null,
      });
      setBroadcastTitle("");
      setBroadcastMessage("");
      toast(l("Pengumuman ditayangkan.", "Announcement published.", "公告已发布。"), "success");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : l("Pengumuman gagal dikirim.", "Could not publish the announcement.", "无法发布公告。"),
        "error",
      );
    }
  };
  const changeLocale = (next: AppLocale) => {
    setLocale(next);
  };
  const guideIds: GuideId[] = [
    "overview",
    "stock",
    "meters",
    "readings",
    "reconciliation",
    "reports",
    "profile",
    ...(user?.role === "ADMIN" ? (["accounts"] as const) : []),
    "settings",
  ];
  return (
    <>
      <PageHeader
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <div className="settings-layout">
        <Panel
          title={l("Tema warna", "Color theme", "配色主题")}
          eyebrow={l("Aksesibilitas visual", "Visual accessibility", "视觉可访问性")}
        >
          <fieldset className="choice-grid">
            <legend className="sr-only">{l("Pilih tema", "Choose a theme", "选择主题")}</legend>
            <label
              className={`theme-choice theme-mocha-preview ${theme === "mocha" ? "selected" : ""}`}
              title={l(
                "Lembut, dingin, kontras terukur",
                "Soft, cool, measured contrast",
                "柔和冷色，适度对比",
              )}
            >
              <input
                type="radio"
                name="theme"
                value="mocha"
                checked={theme === "mocha"}
                onChange={() => setTheme("mocha")}
              />
              <span className="theme-swatches">
                <i />
                <i />
                <i />
                <i />
              </span>
              <strong>Catppuccin Mocha</strong>
            </label>
            <label
              className={`theme-choice theme-gruvbox-preview ${theme === "gruvbox" ? "selected" : ""}`}
              title={l(
                "Hangat, earthy, nyaman di ruang redup",
                "Warm, earthy, comfortable in dim rooms",
                "温暖自然，适合昏暗环境",
              )}
            >
              <input
                type="radio"
                name="theme"
                value="gruvbox"
                checked={theme === "gruvbox"}
                onChange={() => setTheme("gruvbox")}
              />
              <span className="theme-swatches">
                <i />
                <i />
                <i />
                <i />
              </span>
              <strong>Gruvbox Dark</strong>
            </label>
            <label
              className={`theme-choice theme-miku-preview ${theme === "miku" ? "selected" : ""}`}
              title={l(
                "Turkuois digital dengan aksen merah muda",
                "Digital turquoise with pink accents",
                "数字青绿色与粉色点缀",
              )}
            >
              <input
                type="radio"
                name="theme"
                value="miku"
                checked={theme === "miku"}
                onChange={() => setTheme("miku")}
              />
              <span className="theme-swatches">
                <i />
                <i />
                <i />
                <i />
              </span>
              <strong>Hatsune Miku</strong>
            </label>
          </fieldset>
        </Panel>
        <Panel
          title={l("Kepadatan", "Density", "密度")}
          eyebrow={l("Tabel & panel", "Tables & panels", "表格与面板")}
          action={
            <InfoHint
              text={l(
                "Mode ringkas mengurangi jarak baris tanpa mengecilkan target interaksi utama.",
                "Compact mode reduces row spacing without shrinking primary interaction targets.",
                "紧凑模式减少行距，但不会缩小主要交互目标。",
              )}
            />
          }
        >
          <div className="segmented-control" role="group" aria-label="Kepadatan tampilan">
            <button
              className={density === "comfortable" ? "active" : ""}
              type="button"
              onClick={() => setDensity("comfortable")}
            >
              {l("Nyaman", "Comfortable", "舒适")}
            </button>
            <button
              className={density === "compact" ? "active" : ""}
              type="button"
              onClick={() => setDensity("compact")}
            >
              {l("Ringkas", "Compact", "紧凑")}
            </button>
          </div>
        </Panel>
        <Panel
          title={l("Penjelasan rumus", "Formula explanations", "公式说明")}
          eyebrow={l("Bantuan kontekstual", "Contextual help", "上下文帮助")}
          action={
            <InfoHint
              text={l(
                "Tooltip memuat ekspresi, variabel, uraian, dan satuan.",
                "Tooltips include expressions, variables, explanations, and units.",
                "工具提示包含表达式、变量、说明和单位。",
              )}
            />
          }
        >
          <label className="toggle-row">
            <span>
              <strong>
                {l("Tampilkan tooltip lengkap", "Show complete tooltips", "显示完整工具提示")}
              </strong>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={showFormulaDetails}
              onChange={(event) => setShowFormulaDetails(event.target.checked)}
            />
          </label>
        </Panel>
        <Panel title={t("settings.language")} eyebrow="Indonesia · English · 中文">
          <label className="field">
            <span>{t("settings.language")}</span>
            <select
              data-tour="language-select"
              value={locale}
              onChange={(event) => changeLocale(event.target.value as AppLocale)}
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
              <option value="zh">中文（普通话）</option>
            </select>
          </label>
        </Panel>
        <Panel
          title={t("settings.tutorials")}
          eyebrow={l("Dapat diulang", "Replay anytime", "随时重播")}
          className="settings-wide"
        >
          <div className="guide-grid">
            {guideIds.map((guide) => (
              <button className="guide-card" type="button" key={guide} onClick={() => start(guide)}>
                <strong>
                  {t(
                    `tutorial.${guide}` as
                      | "tutorial.overview"
                      | "tutorial.stock"
                      | "tutorial.meters"
                      | "tutorial.readings"
                      | "tutorial.reconciliation"
                      | "tutorial.reports"
                      | "tutorial.profile"
                      | "tutorial.accounts"
                      | "tutorial.settings",
                  )}
                </strong>
                <span>{t("tutorial.start")} →</span>
              </button>
            ))}
          </div>
        </Panel>
        {user?.role === "ADMIN" ? (
          <Panel
            title={l("Kode registrasi internal", "Internal registration code", "内部注册码")}
            eyebrow={l("Khusus administrator", "Administrators only", "仅管理员")}
            action={
              <InfoHint
                text={l(
                  "Bagikan hanya kepada personel berhak. Kode enam digit berganti setiap jam.",
                  "Share only with authorized personnel. The six-digit code rotates hourly.",
                  "仅与授权人员分享。六位代码每小时轮换。",
                )}
              />
            }
          >
            <div className="registration-code-box">
              <span>{l("Kode aktif", "Active code", "当前代码")}</span>
              <strong>{registration?.code ?? "••••••"}</strong>
              <small>
                {l("Berakhir", "Expires", "到期")}{" "}
                {registration === null ? "—" : formatDateTime(registration.expiresAt)}
              </small>
            </div>
            <div className="inline-actions">
              <button className="button" type="button" onClick={() => void loadCode()}>
                {l("Muat ulang", "Reload", "重新加载")}
              </button>
              <button
                className="button"
                type="button"
                disabled={registration === null}
                onClick={() => void copyRegistrationCode()}
              >
                {l("Salin kode", "Copy code", "复制代码")}
              </button>
            </div>
          </Panel>
        ) : null}
        {user?.role === "ADMIN" || user?.role === "MANAGER" ? (
          <Panel
            title={l("Pengumuman operasional", "Operational announcements", "运营公告")}
            eyebrow={l("Cabang aktif", "Active branch", "当前分支")}
            action={
              <InfoHint
                text={l(
                  "Pengumuman baru muncul otomatis di cabang aktif.",
                  "New announcements appear automatically for the active branch.",
                  "新公告会自动显示在当前分支。",
                )}
              />
            }
          >
            <form className="broadcast-form" onSubmit={submitBroadcast}>
              <label className="field">
                <span>{l("Judul", "Title", "标题")}</span>
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{l("Prioritas", "Priority", "优先级")}</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                >
                  <option value="INFO">{l("Informasi", "Information", "信息")}</option>
                  <option value="WARNING">{l("Peringatan", "Warning", "警告")}</option>
                  <option value="CRITICAL">{l("Kritis", "Critical", "严重")}</option>
                </select>
              </label>
              <label className="field">
                <span>{l("Pesan", "Message", "消息")}</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </label>
              <button className="button button-primary">
                {l("Tayangkan ke cabang aktif", "Publish to active branch", "发布到当前分支")}
              </button>
            </form>
          </Panel>
        ) : null}
        <Panel
          title={l("Ganti password", "Change password", "更改密码")}
          eyebrow={l("Keamanan akun", "Account security", "账户安全")}
          action={
            <InfoHint
              text={l(
                "Perubahan password mencabut seluruh sesi lain yang masih aktif.",
                "Changing the password revokes every other active session.",
                "更改密码会撤销所有其他活动会话。",
              )}
            />
          }
        >
          <form className="password-change-form" onSubmit={submitPasswordChange}>
            <PasswordInput
              label={l("Password saat ini", "Current password", "当前密码")}
              autoComplete="current-password"
              required
              minLength={10}
              maxLength={128}
              value={currentPassword}
              aria-invalid={passwordErrors.currentPassword !== undefined}
              onChange={(event) => setCurrentPassword(event.target.value)}
              hint={
                passwordErrors.currentPassword === undefined ? null : (
                  <small className="form-error" role="alert">
                    {passwordErrors.currentPassword}
                  </small>
                )
              }
            />
            <PasswordInput
              label={l("Password baru", "New password", "新密码")}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={newPassword}
              aria-invalid={passwordErrors.newPassword !== undefined}
              onChange={(event) => setNewPassword(event.target.value)}
              hint={
                passwordErrors.newPassword === undefined ? null : (
                  <small className="form-error" role="alert">
                    {passwordErrors.newPassword}
                  </small>
                )
              }
            />
            <PasswordInput
              label={l("Konfirmasi password baru", "Confirm new password", "确认新密码")}
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={newPasswordConfirmation}
              aria-invalid={passwordErrors.confirmation !== undefined}
              onChange={(event) => setNewPasswordConfirmation(event.target.value)}
              hint={
                passwordErrors.confirmation === undefined ? null : (
                  <small className="form-error" role="alert">
                    {passwordErrors.confirmation}
                  </small>
                )
              }
            />
            <button className="button button-primary" type="submit" disabled={changingPassword}>
              {changingPassword
                ? l("Menyimpan…", "Saving…", "保存中…")
                : l("Ganti password", "Change password", "更改密码")}
            </button>
          </form>
        </Panel>
        <Panel
          title={l("Dukungan", "Support", "支持")}
          eyebrow={l("Kontak aplikasi", "Application contact", "应用联系人")}
        >
          <dl className="environment-list">
            <div>
              <dt>{l("Nama", "Name", "姓名")}</dt>
              <dd>Mr.Yudhistira</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a className="text-link" href="mailto:yudhizz14@gmail.com">
                  yudhizz14@gmail.com
                </a>
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel
          title={l("Hapus akun", "Delete account", "删除账户")}
          eyebrow={l("Zona berbahaya", "Danger zone", "危险区域")}
          className="danger-panel"
          action={
            <InfoHint
              text={l(
                "Sesi dicabut dan akun dinonaktifkan; riwayat operasional tetap dipertahankan.",
                "Sessions are revoked and the account is disabled; operational history is retained.",
                "会话将被撤销，账户被停用；操作历史会保留。",
              )}
            />
          }
        >
          <form className="delete-account-form" onSubmit={submitDeletion}>
            <PasswordInput
              label={l("Password saat ini", "Current password", "当前密码")}
              autoComplete="current-password"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label className="field">
              <span>{l("Ketik HAPUS", "Type HAPUS", "输入 HAPUS")}</span>
              <input
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {deleteError === "" ? null : (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
            <button className="button button-danger" type="submit">
              Hapus akun saya
            </button>
          </form>
        </Panel>
        <Panel
          title={t("settings.audit")}
          eyebrow={l("Riwayat terverifikasi", "Verified history", "可验证历史")}
          className="settings-wide"
        >
          <ActivityLog branchId={activeBranch?.id} />
        </Panel>
      </div>
    </>
  );
}
