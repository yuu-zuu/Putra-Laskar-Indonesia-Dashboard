import { useState, type FormEvent } from "react";
import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { demoAdminPassword } from "../data/authGateway.js";
import { isMockMode } from "../data/gateway.js";
import { HttpError } from "../lib/http.js";
import { PasswordInput } from "../components/PasswordInput.js";

export function AuthPage() {
  const { login, register } = useAuth();
  const { l } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(isMockMode() ? "yudhizz14@gmail.com" : "");
  const [employeeId, setEmployeeId] = useState(isMockMode() ? "ADMIN-001" : "");
  const [identifier, setIdentifier] = useState(isMockMode() ? "ADMIN-001" : "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(isMockMode() ? demoAdminPassword : "");
  const [registrationCode, setRegistrationCode] = useState("");
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState("saving");
    setError("");
    try {
      if (mode === "login") await login({ identifier, password });
      else
        await register({
          employeeId,
          email,
          displayName,
          password,
          registrationCode,
        });
    } catch (caught) {
      setError(
        caught instanceof HttpError || caught instanceof Error
          ? caught.message
          : l("Autentikasi gagal.", "Authentication failed.", "身份验证失败。"),
      );
    } finally {
      setState("idle");
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-brand-title">
        <div className="auth-brand-mark">PLI</div>
        <p className="eyebrow">
          {l("Intelijen operasional", "Operational intelligence", "运营智能")}
        </p>
        <h1 id="auth-brand-title">Putra Laskar Indonesia Dashboard</h1>
        <p>
          {l(
            "Stock, pompa, rekonsiliasi, dan laporan operasional dalam satu sumber data yang dapat diaudit.",
            "Stock, pumps, reconciliation, and operational reports in one auditable source of truth.",
            "在一个可审计的数据源中统一库存、泵、对账和运营报告。",
          )}
        </p>
        <dl className="auth-points">
          <div>
            <dt>{l("Dinamis", "Dynamic", "动态")}</dt>
            <dd>
              {l(
                "Jumlah dan label pompa mengikuti kondisi cabang.",
                "Pump counts and labels follow each branch configuration.",
                "泵的数量和标签随各分支配置而定。",
              )}
            </dd>
          </div>
          <div>
            <dt>{l("Terkontrol", "Controlled", "受控")}</dt>
            <dd>
              {l(
                "Registrasi memerlukan kode internal yang berubah setiap jam.",
                "Registration requires an internal code that rotates hourly.",
                "注册需要每小时更新的内部代码。",
              )}
            </dd>
          </div>
          <div>
            <dt>{l("Terukur", "Traceable", "可追溯")}</dt>
            <dd>
              {l(
                "Rumus selalu dapat ditelusuri dari dashboard hingga laporan.",
                "Formulas remain traceable from dashboard to report.",
                "公式可从仪表盘追溯至报告。",
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <header>
          <p className="eyebrow">{l("Akses sistem", "System access", "系统访问")}</p>
          <h2 id="auth-title">
            {mode === "login"
              ? l("Masuk ke dashboard", "Sign in to dashboard", "登录仪表盘")
              : l("Daftarkan akun", "Register an account", "注册账户")}
          </h2>
          <p>
            {mode === "login"
              ? l(
                  "Gunakan akun operasional Anda.",
                  "Use your operational account.",
                  "使用您的运营账户。",
                )
              : l(
                  "Kode aktif diberikan oleh administrator internal.",
                  "The active code is provided by an internal administrator.",
                  "有效代码由内部管理员提供。",
                )}
          </p>
        </header>
        <div
          className="auth-tabs"
          role="tablist"
          aria-label={l("Pilihan autentikasi", "Authentication options", "身份验证选项")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            {l("Masuk", "Sign in", "登录")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            {l("Daftar", "Register", "注册")}
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <label className="field">
              <span>{l("Nama lengkap", "Full name", "全名")}</span>
              <input
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          ) : null}
          {mode === "login" ? (
            <label className="field">
              <span>{l("Email atau ID karyawan", "Email or employee ID", "邮箱或员工编号")}</span>
              <input
                required
                minLength={3}
                maxLength={254}
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              <small>
                {l(
                  "Cukup gunakan salah satu identitas.",
                  "Use either identifier.",
                  "只需使用其中一种身份标识。",
                )}
              </small>
            </label>
          ) : (
            <>
              <label className="field">
                <span>{l("ID karyawan", "Employee ID", "员工编号")}</span>
                <input
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_-]+"
                  autoComplete="username"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value.toUpperCase())}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </>
          )}
          <PasswordInput
            label={l("Password", "Password", "密码")}
            required
            minLength={10}
            maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint={
              <small>
                {l(
                  "Minimal 10 karakter, huruf besar, kecil, dan angka.",
                  "At least 10 characters with uppercase, lowercase, and a number.",
                  "至少 10 个字符，包含大写、小写字母和数字。",
                )}
              </small>
            }
          />
          {mode === "register" ? (
            <label className="field">
              <span>
                {l("Kode registrasi internal", "Internal registration code", "内部注册码")}
              </span>
              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                autoComplete="one-time-code"
                value={registrationCode}
                onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, ""))}
              />
              <small>
                {l(
                  "Berubah setiap satu jam dan hanya terlihat oleh admin.",
                  "Rotates hourly and is visible only to administrators.",
                  "每小时更新，仅管理员可见。",
                )}
              </small>
            </label>
          ) : null}
          {error === "" ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary auth-submit"
            type="submit"
            disabled={state === "saving"}
          >
            {state === "saving"
              ? l("Memproses…", "Processing…", "处理中…")
              : mode === "login"
                ? l("Masuk", "Sign in", "登录")
                : l("Buat akun", "Create account", "创建账户")}
          </button>
        </form>
        {isMockMode() && mode === "login" ? (
          <aside className="demo-credential">
            <strong>{l("Akun demo admin", "Admin demo account", "管理员演示账户")}</strong>
            <code>ADMIN-001</code>
            <code>yudhizz14@gmail.com</code>
            <code>{demoAdminPassword}</code>
          </aside>
        ) : null}
        <footer>
          Support: <a href="mailto:yudhizz14@gmail.com">Mr.Yudhistira · yudhizz14@gmail.com</a>
        </footer>
      </section>
    </main>
  );
}
