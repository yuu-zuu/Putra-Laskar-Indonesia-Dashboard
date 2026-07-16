import type {
  CreateManagedAccountInput,
  ManagedAccount,
  ResetManagedAccountPasswordInput,
  UpdateManagedAccountInput,
  UserRole,
} from "@spbu/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../app/auth.js";
import { useBranches } from "../app/branches.js";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { PasswordInput } from "../components/PasswordInput.js";
import {
  createManagedAccount,
  deleteManagedAccount,
  getManagedAccounts,
  resetManagedAccountPassword,
  updateManagedAccount,
} from "../data/accountGateway.js";
import { formatDateTime } from "../lib/format.js";
import { HttpError } from "../lib/http.js";

const roles: UserRole[] = ["ADMIN", "MANAGER", "OPERATOR", "FINANCE", "AUDITOR"];
const emptyForm: CreateManagedAccountInput = {
  employeeId: "",
  email: "",
  displayName: "",
  password: "",
  role: "OPERATOR",
  branchId: null,
};
const emptyPasswordReset = { password: "", confirmation: "", reason: "" };

export function AccountsPage() {
  const { user, refresh } = useAuth();
  const { branches } = useBranches();
  const { l } = useI18n();
  const toast = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [form, setForm] = useState<CreateManagedAccountInput>(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ManagedAccount | null>(null);
  const [editing, setEditing] = useState<ManagedAccount | null>(null);
  const [resettingPassword, setResettingPassword] = useState<ManagedAccount | null>(null);
  const [passwordReset, setPasswordReset] = useState(emptyPasswordReset);
  const [editForm, setEditForm] = useState<UpdateManagedAccountInput>({
    role: "OPERATOR",
    branchId: null,
    reason: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [passwordResetErrors, setPasswordResetErrors] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setError(null);
      setAccounts(await getManagedAccounts());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : l("Daftar akun gagal dimuat.", "Could not load accounts.", "无法加载账户列表。"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createManagedAccount(form);
      setAccounts((current) => [...current, created].sort(compareAccount));
      setForm(emptyForm);
      setShowCreate(false);
      toast(l("Akun berhasil dibuat.", "Account created.", "账户已创建。"), "success");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : l("Akun gagal dibuat.", "Could not create the account.", "无法创建账户。"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (deleting === null) return;
    setSaving(true);
    try {
      await deleteManagedAccount(deleting.id);
      setAccounts((current) => current.filter((account) => account.id !== deleting.id));
      setDeleting(null);
      toast(l("Akun berhasil dihapus.", "Account deleted.", "账户已删除。"), "success");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : l("Akun gagal dihapus.", "Could not delete the account.", "无法删除账户。"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (account: ManagedAccount) => {
    setEditing(account);
    setEditErrors({});
    setEditForm({ role: account.role, branchId: account.branchId, reason: "" });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (editing === null) return;
    const reason = editForm.reason.trim();
    if (reason.length < 5) {
      setEditErrors({
        reason: l(
          "Tuliskan alasan minimal 5 karakter.",
          "Enter a reason of at least 5 characters.",
          "请输入至少 5 个字符的原因。",
        ),
      });
      return;
    }
    setEditErrors({});
    setSaving(true);
    try {
      const updated = await updateManagedAccount(editing.id, { ...editForm, reason });
      setAccounts((current) =>
        current.map((account) => (account.id === updated.id ? updated : account)),
      );
      if (editing.id === user?.id) await refresh();
      setEditing(null);
      toast(
        l("Penempatan akun diperbarui.", "Account assignment updated.", "账户分配已更新。"),
        "success",
      );
    } catch (caught) {
      if (caught instanceof HttpError) setEditErrors(caught.fieldErrors);
      toast(
        caught instanceof Error
          ? caught.message
          : l("Akun gagal diperbarui.", "Could not update the account.", "无法更新账户。"),
        "error",
        caught instanceof HttpError ? caught.requestId : null,
      );
    } finally {
      setSaving(false);
    }
  };

  const beginPasswordReset = (account: ManagedAccount) => {
    setResettingPassword(account);
    setPasswordReset(emptyPasswordReset);
    setPasswordResetErrors({});
  };

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (resettingPassword === null) return;
    const reason = passwordReset.reason.trim();
    const validationErrors: Record<string, string> = {};
    if (passwordReset.password !== passwordReset.confirmation) {
      validationErrors.confirmation = l(
        "Konfirmasi password tidak cocok.",
        "The password confirmation does not match.",
        "两次输入的密码不一致。",
      );
    }
    if (reason.length < 5) {
      validationErrors.reason = l(
        "Tuliskan alasan minimal 5 karakter.",
        "Enter a reason of at least 5 characters.",
        "请输入至少 5 个字符的原因。",
      );
    }
    if (Object.keys(validationErrors).length > 0) {
      setPasswordResetErrors(validationErrors);
      return;
    }
    const input: ResetManagedAccountPasswordInput = {
      password: passwordReset.password,
      reason,
    };
    setPasswordResetErrors({});
    setSaving(true);
    try {
      await resetManagedAccountPassword(resettingPassword.id, input);
      setResettingPassword(null);
      setPasswordReset(emptyPasswordReset);
      toast(
        l(
          "Password sementara disimpan dan seluruh sesi pengguna dicabut.",
          "The temporary password was saved and all user sessions were revoked.",
          "临时密码已保存，用户的所有会话均已撤销。",
        ),
        "success",
      );
    } catch (caught) {
      if (caught instanceof HttpError) setPasswordResetErrors(caught.fieldErrors);
      toast(
        caught instanceof Error
          ? caught.message
          : l("Reset password gagal.", "Could not reset the password.", "无法重置密码。"),
        "error",
        caught instanceof HttpError ? caught.requestId : null,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={l("Administrasi", "Administration", "管理")}
        title={l("Kelola akun", "Account management", "账户管理")}
        description={l(
          "Buat akun internal dan cabut akses pengguna tanpa proses registrasi mandiri.",
          "Create internal accounts and revoke user access without self-registration.",
          "无需自助注册即可创建内部账户并撤销用户访问权限。",
        )}
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            + {l("Buat akun", "Create account", "创建账户")}
          </button>
        }
      />
      <Panel
        title={l("Akun aktif", "Active accounts", "活跃账户")}
        eyebrow={loading ? l("Memuat…", "Loading…", "加载中…") : `${accounts.length}`}
      >
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div
          className="table-scroll account-table-wrap"
          tabIndex={0}
          aria-label={l("Tabel akun aktif", "Active accounts table", "活跃账户表")}
        >
          <table className="account-table">
            <thead>
              <tr>
                <th>{l("Pengguna", "User", "用户")}</th>
                <th>{l("Role", "Role", "角色")}</th>
                <th>{l("Cabang", "Branch", "分支")}</th>
                <th>{l("Dibuat", "Created", "创建时间")}</th>
                <th aria-label={l("Tindakan", "Actions", "操作")} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <a className="account-name" href={`#/profiles/${account.id}`}>
                      {account.displayName}
                    </a>
                    <small>
                      {account.employeeId} · {account.email}
                    </small>
                  </td>
                  <td>{account.role}</td>
                  <td>{account.branchName ?? "—"}</td>
                  <td>
                    <time dateTime={account.createdAt}>{formatDateTime(account.createdAt)}</time>
                  </td>
                  <td>
                    <div className="account-actions">
                      <button className="button" type="button" onClick={() => beginEdit(account)}>
                        {l("Edit", "Edit", "编辑")}
                      </button>
                      {account.id === user?.id ? (
                        <small>{l("Akun aktif", "Current account", "当前账户")}</small>
                      ) : (
                        <>
                          <button
                            className="button"
                            type="button"
                            onClick={() => beginPasswordReset(account)}
                          >
                            {l("Reset password", "Reset password", "重置密码")}
                          </button>
                          <button
                            className="button button-danger"
                            type="button"
                            onClick={() => setDeleting(account)}
                          >
                            {l("Hapus", "Delete", "删除")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && accounts.length === 0 ? (
          <p className="empty-state">{l("Belum ada akun.", "No accounts yet.", "暂无账户。")}</p>
        ) : null}
      </Panel>

      {showCreate ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowCreate(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-account-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowCreate(false);
            }}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">
                  {l("Administrasi akun", "Account administration", "账户管理")}
                </p>
                <h2 id="create-account-title">{l("Buat akun", "Create account", "创建账户")}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                autoFocus
                onClick={() => setShowCreate(false)}
                aria-label={l("Tutup", "Close", "关闭")}
              >
                ×
              </button>
            </header>
            <form onSubmit={submitCreate}>
              <div className="field-grid">
                <label className="field">
                  <span>{l("ID karyawan", "Employee ID", "员工编号")}</span>
                  <input
                    required
                    minLength={3}
                    maxLength={32}
                    value={form.employeeId}
                    onChange={(event) =>
                      setForm({ ...form, employeeId: event.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    required
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </label>
                <label className="field field-span-2">
                  <span>{l("Nama", "Name", "姓名")}</span>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.displayName}
                    onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{l("Role", "Role", "角色")}</span>
                  <select
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
                  >
                    {roles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{l("Cabang", "Branch", "分支")}</span>
                  <select
                    value={form.branchId ?? ""}
                    onChange={(event) => setForm({ ...form, branchId: event.target.value || null })}
                  >
                    <option value="">{l("Belum ditetapkan", "Not assigned", "未分配")}</option>
                    {branches.map((branch) => (
                      <option value={branch.id} key={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <PasswordInput
                  fieldClassName="field-span-2"
                  label={l("Password sementara", "Temporary password", "临时密码")}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              <div className="form-actions">
                <button className="button" type="button" onClick={() => setShowCreate(false)}>
                  {l("Batal", "Cancel", "取消")}
                </button>
                <button className="button button-primary" disabled={saving}>
                  {saving
                    ? l("Menyimpan…", "Saving…", "保存中…")
                    : l("Buat akun", "Create account", "创建账户")}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section
            className="modal modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-account-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(null);
            }}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">{l("Mutasi pegawai", "Employee assignment", "员工调动")}</p>
                <h2 id="edit-account-title">{editing.displayName}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                autoFocus
                onClick={() => setEditing(null)}
                aria-label={l("Tutup", "Close", "关闭")}
              >
                ×
              </button>
            </header>
            <form onSubmit={submitEdit}>
              <div className="field-grid">
                <label className="field">
                  <span>{l("Role", "Role", "角色")}</span>
                  <select
                    disabled={editing.id === user?.id}
                    value={editForm.role}
                    aria-invalid={editErrors.role !== undefined}
                    onChange={(event) =>
                      setEditForm({ ...editForm, role: event.target.value as UserRole })
                    }
                  >
                    {roles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                  {editErrors.role === undefined ? null : (
                    <small className="form-error" role="alert">
                      {editErrors.role}
                    </small>
                  )}
                  {editing.id === user?.id ? (
                    <small>
                      {l(
                        "Role akun aktif diubah oleh admin lain.",
                        "Another admin must change the current account's role.",
                        "当前账户的角色必须由其他管理员更改。",
                      )}
                    </small>
                  ) : null}
                </label>
                <label className="field">
                  <span>{l("Cabang penempatan", "Assigned branch", "分配分支")}</span>
                  <select
                    value={editForm.branchId ?? ""}
                    aria-invalid={editErrors.branchId !== undefined}
                    onChange={(event) =>
                      setEditForm({ ...editForm, branchId: event.target.value || null })
                    }
                  >
                    <option value="">{l("Belum ditetapkan", "Not assigned", "未分配")}</option>
                    {branches.map((branch) => (
                      <option value={branch.id} key={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  {editErrors.branchId === undefined ? null : (
                    <small className="form-error" role="alert">
                      {editErrors.branchId}
                    </small>
                  )}
                </label>
                <label className="field field-span-2">
                  <span>{l("Alasan perubahan", "Reason for change", "变更原因")}</span>
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={editForm.reason}
                    onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })}
                    aria-invalid={editErrors.reason !== undefined}
                  />
                  {editErrors.reason === undefined ? null : (
                    <small className="form-error" role="alert">
                      {editErrors.reason}
                    </small>
                  )}
                </label>
              </div>
              <div className="form-actions">
                <button className="button" type="button" onClick={() => setEditing(null)}>
                  {l("Batal", "Cancel", "取消")}
                </button>
                <button className="button button-primary" disabled={saving}>
                  {saving
                    ? l("Menyimpan…", "Saving…", "保存中…")
                    : l("Simpan perubahan", "Save changes", "保存更改")}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {resettingPassword ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setResettingPassword(null)}
        >
          <section
            className="modal modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setResettingPassword(null);
            }}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">{l("Keamanan akun", "Account security", "账户安全")}</p>
                <h2 id="reset-password-title">{resettingPassword.displayName}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setResettingPassword(null)}
                aria-label={l("Tutup", "Close", "关闭")}
              >
                ×
              </button>
            </header>
            <form onSubmit={submitPasswordReset}>
              <div className="field-grid">
                <PasswordInput
                  fieldClassName="field-span-2"
                  label={l("Password sementara baru", "New temporary password", "新的临时密码")}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={passwordReset.password}
                  aria-invalid={passwordResetErrors.password !== undefined}
                  onChange={(event) =>
                    setPasswordReset({ ...passwordReset, password: event.target.value })
                  }
                  hint={
                    passwordResetErrors.password === undefined ? null : (
                      <small className="form-error" role="alert">
                        {passwordResetErrors.password}
                      </small>
                    )
                  }
                />
                <PasswordInput
                  fieldClassName="field-span-2"
                  label={l("Konfirmasi password", "Confirm password", "确认密码")}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={passwordReset.confirmation}
                  aria-invalid={passwordResetErrors.confirmation !== undefined}
                  onChange={(event) =>
                    setPasswordReset({ ...passwordReset, confirmation: event.target.value })
                  }
                  hint={
                    passwordResetErrors.confirmation === undefined ? null : (
                      <small className="form-error" role="alert">
                        {passwordResetErrors.confirmation}
                      </small>
                    )
                  }
                />
                <label className="field field-span-2">
                  <span>{l("Alasan reset", "Reset reason", "重置原因")}</span>
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={passwordReset.reason}
                    aria-invalid={passwordResetErrors.reason !== undefined}
                    onChange={(event) =>
                      setPasswordReset({ ...passwordReset, reason: event.target.value })
                    }
                  />
                  {passwordResetErrors.reason === undefined ? null : (
                    <small className="form-error" role="alert">
                      {passwordResetErrors.reason}
                    </small>
                  )}
                </label>
              </div>
              <div className="form-actions">
                <button className="button" type="button" onClick={() => setResettingPassword(null)}>
                  {l("Batal", "Cancel", "取消")}
                </button>
                <button className="button button-primary" disabled={saving}>
                  {saving
                    ? l("Menyimpan…", "Saving…", "保存中…")
                    : l("Reset password", "Reset password", "重置密码")}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleting ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleting(null)}>
          <section
            className="modal modal-compact"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDeleting(null);
            }}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">{l("Cabut akses", "Revoke access", "撤销访问")}</p>
                <h2 id="delete-account-title">{deleting.displayName}</h2>
              </div>
            </header>
            <p>
              {l(
                "Sesi pengguna akan dicabut dan akun dianonimkan. Histori aktivitas tetap tersimpan.",
                "The user's sessions will be revoked and the account anonymized. Activity history remains available.",
                "用户会话将被撤销，账户将匿名化；活动历史仍会保留。",
              )}
            </p>
            <div className="form-actions">
              <button className="button" type="button" autoFocus onClick={() => setDeleting(null)}>
                {l("Batal", "Cancel", "取消")}
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                {saving
                  ? l("Menghapus…", "Deleting…", "删除中…")
                  : l("Hapus akun", "Delete account", "删除账户")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function compareAccount(left: ManagedAccount, right: ManagedAccount): number {
  return left.displayName.localeCompare(right.displayName);
}
