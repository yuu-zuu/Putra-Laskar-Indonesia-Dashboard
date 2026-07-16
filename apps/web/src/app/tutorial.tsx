import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { setOnboardingCompleted } from "../data/profileGateway.js";
import { useAuth } from "./auth.js";
import { safeStorage } from "../lib/storage.js";
import { useI18n } from "./i18n.js";

export type GuideId =
  | "overview"
  | "stock"
  | "meters"
  | "readings"
  | "reconciliation"
  | "reports"
  | "profile"
  | "accounts"
  | "settings";
type RequiredAction = "click" | "change" | "focus" | "hover";
interface Step {
  title: [string, string, string];
  body: [string, string, string];
  route: string;
  target: string;
  action?: RequiredAction;
}
interface Value {
  start: (guide: GuideId) => void;
  active: boolean;
}
const Context = createContext<Value | null>(null);

const guides: Record<GuideId, Step[]> = {
  overview: [
    {
      title: ["Pilih cabang aktif", "Choose an active branch", "选择当前分支"],
      body: [
        "Buka pilihan ini dan pilih cabang. Semua angka dan master mengikuti cabang aktif.",
        "Open this selector and choose a branch. All figures and masters follow it.",
        "打开此选择器并选择分支。所有数据和主数据都会随之更新。",
      ],
      route: "dashboard",
      target: ".branch-switcher select",
      action: "change",
    },
    {
      title: ["Ringkaskan navigasi", "Compact navigation", "收起导航"],
      body: [
        "Tekan panah ini. Sidebar berubah menjadi ikon dan preferensinya hanya disimpan di browser ini.",
        "Press this arrow. The sidebar becomes icon-only and the preference stays in this browser.",
        "按此箭头。侧栏将仅显示图标，偏好只保存在本浏览器。",
      ],
      route: "dashboard",
      target: "[data-tour='sidebar-toggle']",
      action: "click",
    },
    {
      title: ["Baca grafik realtime", "Read the live chart", "读取实时图表"],
      body: [
        "Arahkan pointer ke batang atau titik. Penjualan dan stok memakai skala terpisah agar keduanya tetap terbaca.",
        "Point at a bar or dot. Sales and stock use separate scales so both remain legible.",
        "将指针移到柱或点上。销售和库存使用独立刻度，确保都清晰可读。",
      ],
      route: "dashboard",
      target: ".trend-chart",
      action: "hover",
    },
  ],
  stock: [
    {
      title: ["Buka unit stock", "Open stock units", "打开库存单元"],
      body: [
        "Gunakan menu ini untuk saldo, kapasitas, dan ledger mutasi.",
        "Use this menu for balances, capacity, and the movement ledger.",
        "使用此菜单查看余额、容量和变动账本。",
      ],
      route: "dashboard",
      target: "a[href='#/stock-units']",
      action: "click",
    },
    {
      title: ["Pilih tanggal ledger", "Choose a ledger date", "选择账本日期"],
      body: [
        "Ubah tanggal untuk melihat saldo awal, mutasi harian, dan saldo akhir historis.",
        "Change the date to inspect historical opening balances, daily movements, and closing balances.",
        "更改日期以查看历史期初余额、每日变动和期末余额。",
      ],
      route: "stock-units",
      target: "[data-tour='stock-date'] input",
      action: "change",
    },
    {
      title: ["Buka posting mutasi", "Open movement posting", "打开变动过账"],
      body: [
        "Klik Posting mutasi untuk supply, saldo awal, retur, transfer, gain, atau loss.",
        "Click Post movement for supply, opening balance, returns, transfers, gains, or losses.",
        "点击“过账变动”以处理供应、期初、退货、转移、盘盈或盘亏。",
      ],
      route: "stock-units",
      target: "[data-tour='post-movement']",
      action: "click",
    },
    {
      title: ["Isi transaksi nyata", "Complete a real transaction", "填写真实交易"],
      body: [
        "Pilih jenis, unit, kuantitas, referensi, dan alasan. Mutasi masuk juga membuat lapisan FIFO.",
        "Choose type, unit, quantity, reference, and reason. Incoming movements also create FIFO layers.",
        "选择类型、单元、数量、参考和原因。入库变动还会创建 FIFO 层。",
      ],
      route: "stock-units",
      target: "[data-tour='stock-movement-form'] select",
      action: "focus",
    },
  ],
  meters: [
    {
      title: ["Buka master pompa", "Open pump master", "打开泵主数据"],
      body: [
        "Jumlah pompa tidak tetap; setiap cabang dapat menambah dan memberi label sendiri.",
        "Pump counts are not fixed; each branch can add and label its own.",
        "泵数量不固定；每个分支都可自行添加和命名。",
      ],
      route: "dashboard",
      target: "a[href='#/meter-units']",
      action: "click",
    },
    {
      title: ["Isi pemetaan", "Complete the mapping", "填写映射"],
      body: [
        "Isi kode, label, sumber unit stock, dan tanggal berlaku. Fokuskan salah satu kolom untuk melanjutkan.",
        "Provide code, label, stock source, and effective date. Focus a field to continue.",
        "填写代码、标签、库存来源和生效日期。聚焦任一字段以继续。",
      ],
      route: "meter-units",
      target: ".pump-form input",
      action: "focus",
    },
    {
      title: ["Kelola status", "Manage status", "管理状态"],
      body: [
        "Gunakan daftar untuk mengganti label atau menonaktifkan pompa tanpa menghapus histori.",
        "Use the list to rename or deactivate a pump without deleting history.",
        "使用列表重命名或停用泵，而不会删除历史记录。",
      ],
      route: "meter-units",
      target: ".pump-list .button",
      action: "click",
    },
  ],
  readings: [
    {
      title: ["Buka bacaan meter", "Open meter readings", "打开仪表读数"],
      body: [
        "Masuk ke ruang input penjualan per meter.",
        "Open the per-meter sales entry workspace.",
        "进入按仪表录入销售的工作区。",
      ],
      route: "dashboard",
      target: "a[href='#/meter-readings']",
      action: "click",
    },
    {
      title: ["Isi bacaan dan harga", "Enter readings and price", "输入读数和价格"],
      body: [
        "Pilih meter, tanggal, bacaan awal/akhir, harga jual, dan setoran. Klik salah satu kolom untuk mencoba.",
        "Choose meter, date, opening/closing readings, selling price, and deposit. Click a field to try it.",
        "选择仪表、日期、起止读数、售价和存款。点击任一字段进行尝试。",
      ],
      route: "meter-readings",
      target: "[data-tour='reading-meter']",
      action: "focus",
    },
    {
      title: ["Posting atomik", "Atomic posting", "原子过账"],
      body: [
        "Tombol ini memposting bacaan, penjualan stock, dan alokasi FIFO dalam satu transaksi. Fokuskan tombol; jangan klik bila datanya belum benar.",
        "This button posts the reading, stock sale, and FIFO allocations in one transaction. Focus it; do not click until data is correct.",
        "此按钮会在一个交易中发布读数、库存销售和 FIFO 分配。先聚焦；数据未确认前不要点击。",
      ],
      route: "meter-readings",
      target: "[data-tour='reading-submit']",
      action: "focus",
    },
  ],
  reconciliation: [
    {
      title: ["Buka rekonsiliasi", "Open reconciliation", "打开对账"],
      body: [
        "Masuk ke ruang audit nilai, koreksi, histori, dan diskusi.",
        "Open the workspace for value audits, corrections, history, and discussion.",
        "进入数值审核、更正、历史和讨论工作区。",
      ],
      route: "dashboard",
      target: "a[href='#/reconciliation']",
      action: "click",
    },
    {
      title: ["Pilih transaksi", "Select a transaction", "选择交易"],
      body: [
        "Centang baris yang akan ditinjau. Checkbox dibuat ringkas agar konsisten dengan tabel.",
        "Select a row for review. The compact checkbox remains consistent with the table.",
        "勾选要审核的行。紧凑复选框与表格保持一致。",
      ],
      route: "reconciliation",
      target: ".row-checkbox",
      action: "click",
    },
    {
      title: ["Buka ruang audit", "Open the audit workspace", "打开审核工作区"],
      body: [
        "Gunakan tombol tindakan pada baris untuk koreksi dengan alasan, revisi immutable, dan diskusi bertingkat.",
        "Use the row action to correct with a reason, inspect immutable revisions, and discuss in threads.",
        "使用行操作填写原因进行更正、查看不可变修订并在线程中讨论。",
      ],
      route: "reconciliation",
      target: "tbody .button",
      action: "click",
    },
  ],
  reports: [
    {
      title: ["Buka laporan", "Open reports", "打开报告"],
      body: [
        "Masuk ke pembuat laporan per cabang dan periode.",
        "Open the branch and period report builder.",
        "打开按分支和期间生成报告的工具。",
      ],
      route: "dashboard",
      target: "a[href='#/reports']",
      action: "click",
    },
    {
      title: ["Atur periode dan format", "Set period and format", "设置期间和格式"],
      body: [
        "Pilih rentang tanggal serta XLSX multi-sheet atau CSV rekonsiliasi.",
        "Choose a date range and either multi-sheet XLSX or reconciliation CSV.",
        "选择日期范围以及多工作表 XLSX 或对账 CSV。",
      ],
      route: "reports",
      target: ".report-builder input",
      action: "focus",
    },
    {
      title: ["Ekspor teraudit", "Audited export", "审计导出"],
      body: [
        "Fokuskan tombol. Ekspor yang benar-benar dibuat dicatat di log aktivitas.",
        "Focus the button. A generated export is recorded in the activity log.",
        "聚焦按钮。实际生成的导出会记录在活动日志中。",
      ],
      route: "reports",
      target: ".report-builder button[type='submit']",
      action: "focus",
    },
  ],
  profile: [
    {
      title: ["Buka profil", "Open profiles", "打开档案"],
      body: [
        "Setiap pengguna dapat melihat identitas dan aktivitas pengguna lain untuk transparansi.",
        "Every user can inspect other users' identity and activity for transparency.",
        "每位用户都可查看其他用户的身份和活动，以提高透明度。",
      ],
      route: "dashboard",
      target: "a[href='#/profiles']",
      action: "click",
    },
    {
      title: ["Pilih pengguna", "Choose a user", "选择用户"],
      body: [
        "Klik nama lain untuk membuka profil dan ledger aktivitasnya.",
        "Click another name to open their profile and activity ledger.",
        "点击其他姓名以打开其档案和活动账本。",
      ],
      route: "profiles",
      target: ".people-list a",
      action: "click",
    },
    {
      title: ["Unggah avatar aman", "Upload a safe avatar", "安全上传头像"],
      body: [
        "Pada profil sendiri, fokuskan pemilih file. Hanya PNG/JPEG/WebP maksimal 500 KB yang diterima.",
        "On your own profile, focus the file picker. Only PNG/JPEG/WebP up to 500 KB is accepted.",
        "在自己的档案中聚焦文件选择器。仅接受最大 500 KB 的 PNG/JPEG/WebP。",
      ],
      route: "profiles",
      target: ".avatar-upload input",
      action: "focus",
    },
    {
      title: ["Telusuri aktivitas", "Inspect activity", "查看活动"],
      body: [
        "Buka setiap baris untuk status berhasil/gagal, pelaku, waktu, request ID, dan metadata perubahan.",
        "Expand a row for outcome, actor, time, request ID, and change metadata.",
        "展开一行以查看结果、执行人、时间、请求 ID 和变更元数据。",
      ],
      route: "profiles",
      target: ".profile-activity-panel .activity-summary",
      action: "click",
    },
  ],
  accounts: [
    {
      title: ["Buka kelola akun", "Open account management", "打开账户管理"],
      body: [
        "Menu ini hanya tersedia untuk administrator dan seluruh tindakan tetap diverifikasi API.",
        "This menu is available only to administrators, and every action is still verified by the API.",
        "此菜单仅供管理员使用，所有操作仍由 API 验证。",
      ],
      route: "settings",
      target: "a[href='#/accounts']",
      action: "click",
    },
    {
      title: ["Buat akun langsung", "Create an account directly", "直接创建账户"],
      body: [
        "Gunakan tombol ini agar personel dapat dibuat tanpa kode registrasi mandiri.",
        "Use this button to create personnel without a self-registration code.",
        "使用此按钮可创建人员账户，无需自助注册码。",
      ],
      route: "accounts",
      target: ".page-actions .button-primary",
      action: "click",
    },
    {
      title: ["Tetapkan akses", "Assign access", "分配访问权限"],
      body: [
        "Isi identitas, role, cabang, dan password sementara. Penghapusan akun mencabut semua sesinya namun mempertahankan histori.",
        "Enter identity, role, branch, and a temporary password. Deleting an account revokes its sessions while preserving history.",
        "填写身份、角色、分支和临时密码。删除账户会撤销其会话，同时保留历史记录。",
      ],
      route: "accounts",
      target: ".modal form input",
      action: "focus",
    },
  ],
  settings: [
    {
      title: ["Buka pengaturan", "Open settings", "打开设置"],
      body: [
        "Preferensi tampilan dan kontrol administrasi tersedia di halaman ini.",
        "Display preferences and administrative controls are available here.",
        "显示偏好和管理控制均可在此页面使用。",
      ],
      route: "dashboard",
      target: "a[href='#/settings']",
      action: "click",
    },
    {
      title: ["Pilih tema lokal", "Choose a local theme", "选择本地主题"],
      body: [
        "Klik tema. Gruvbox adalah default; perubahan lokal ini tidak menambah log aktivitas.",
        "Click a theme. Gruvbox is the default; this local change does not add an activity log.",
        "点击主题。Gruvbox 为默认；此本地更改不会新增活动日志。",
      ],
      route: "settings",
      target: ".theme-choice",
      action: "click",
    },
    {
      title: ["Ganti bahasa penuh", "Switch the full language", "切换完整语言"],
      body: [
        "Ubah pilihan ini. Seluruh label aplikasi mengikuti bahasa lokal tanpa membuat log aktivitas.",
        "Change this selector. All application labels follow the local language without creating activity logs.",
        "更改此选择器。所有应用标签都会使用本地语言，且不会创建活动日志。",
      ],
      route: "settings",
      target: "[data-tour='language-select']",
      action: "change",
    },
    {
      title: ["Jalankan ulang panduan", "Replay a guide", "重新运行指南"],
      body: [
        "Pilih panduan modul kapan pun Anda memerlukan latihan langsung.",
        "Choose any module guide whenever you need hands-on practice.",
        "需要实际练习时，可随时选择任一模块指南。",
      ],
      route: "settings",
      target: ".guide-grid",
    },
  ],
};

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const { l, t } = useI18n();
  const [guide, setGuide] = useState<GuideId | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [actionDone, setActionDone] = useState(false);
  const [actionUnavailable, setActionUnavailable] = useState(false);
  const [cardMinimized, setCardMinimized] = useState(false);
  const steps = guide === null ? [] : guides[guide];
  const step = steps[index];

  useEffect(() => {
    if (
      user !== null &&
      user.onboardingCompletedAt === null &&
      safeStorage.getItem(`pli-tour-shown-${user.id}`) !== "true"
    ) {
      setGuide("overview");
      setIndex(0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (step === undefined) return;
    if (location.hash !== `#/${step.route}`) location.hash = `#/${step.route}`;
    setRect(null);
    setActionDone(step.action === undefined);
    setActionUnavailable(false);
    setCardMinimized(false);
    let element: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    let searchTimer: number | undefined;
    const update = () => setRect(element?.getBoundingClientRect() ?? null);
    const touchOnly =
      typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
    const effectiveAction = step.action === "hover" && touchOnly ? "click" : step.action;
    const eventName =
      effectiveAction === "change"
        ? "change"
        : effectiveAction === "focus"
          ? "focusin"
          : effectiveAction === "hover"
            ? "mouseover"
            : "pointerdown";
    const complete = () => setActionDone(true);
    const findAndBind = (attempt: number) => {
      element = document.querySelector<HTMLElement>(step.target);
      if (element === null) {
        if (attempt < 15) {
          searchTimer = window.setTimeout(() => findAndBind(attempt + 1), 100);
          return;
        }
        setRect(null);
        setActionDone(true);
        setActionUnavailable(true);
        return;
      }
      if (!canPerformAction(element, effectiveAction)) {
        setActionDone(true);
        setActionUnavailable(effectiveAction !== undefined);
      }
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      update();
      if (effectiveAction !== undefined) {
        element.addEventListener(eventName, complete, { capture: true });
      }
      if (typeof window.ResizeObserver === "function") {
        observer = new ResizeObserver(update);
        observer.observe(element);
      }
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
    };
    searchTimer = window.setTimeout(() => findAndBind(0), 120);
    return () => {
      if (searchTimer !== undefined) window.clearTimeout(searchTimer);
      element?.removeEventListener(eventName, complete, { capture: true });
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [guide, index, step?.target]);

  const close = async (completed: boolean) => {
    if (user !== null) safeStorage.setItem(`pli-tour-shown-${user.id}`, "true");
    setGuide(null);
    setIndex(0);
    setRect(null);
    if (completed) {
      await setOnboardingCompleted(true);
      await refresh();
    }
  };
  const start = (id: GuideId) => {
    setGuide(id);
    setIndex(0);
  };
  const value = useMemo(() => ({ start, active: guide !== null }), [guide]);
  const text = (value: [string, string, string]) => l(value[0], value[1], value[2]);
  return (
    <Context value={value}>
      {children}
      {guide !== null && step !== undefined ? (
        <div className="tutorial-layer" role="presentation">
          {rect === null ? null : <TourMasks rect={rect} />}
          {cardMinimized ? (
            <button
              className="tutorial-resume"
              type="button"
              onClick={() => setCardMinimized(false)}
            >
              {l("Buka panduan", "Open guide", "打开指南")} · {index + 1}/{steps.length}
            </button>
          ) : (
            <section
              className={`tutorial-card ${rect === null ? "tutorial-card-centered" : ""}`}
              style={cardStyle(rect)}
              role="dialog"
              aria-modal="false"
              aria-labelledby="tutorial-title"
            >
              <div className="tutorial-card-meta">
                <p className="eyebrow">
                  {index + 1} / {steps.length} ·{" "}
                  {actionUnavailable
                    ? l("Otomatis", "Automatic", "自动")
                    : actionDone
                      ? l("Siap", "Ready", "就绪")
                      : l("Coba sekarang", "Try it now", "立即尝试")}
                </p>
                <button
                  className="tutorial-minimize"
                  type="button"
                  onClick={() => setCardMinimized(true)}
                  aria-label={l("Minimalkan panduan", "Minimize guide", "最小化指南")}
                  title={l("Minimalkan panduan", "Minimize guide", "最小化指南")}
                >
                  —
                </button>
              </div>
              <h2 id="tutorial-title">{text(step.title)}</h2>
              <p>{text(step.body)}</p>
              {actionUnavailable ? (
                <p className="tutorial-notice" role="status">
                  {l(
                    "Kontrol belum tersedia atau tidak memiliki pilihan lain; langkah ini diselesaikan otomatis.",
                    "The control is unavailable or has no alternative choice, so this step was completed automatically.",
                    "该控件不可用或没有其他选项，因此此步骤已自动完成。",
                  )}
                </p>
              ) : null}
              <div className="tutorial-progress">
                {steps.map((_, position) => (
                  <i className={position === index ? "active" : ""} key={position} />
                ))}
              </div>
              <footer>
                <button className="button" onClick={() => void close(true)}>
                  {t("tutorial.skip")}
                </button>
                <span />
                <button
                  className="button"
                  disabled={index === 0}
                  onClick={() => setIndex((current) => current - 1)}
                >
                  {t("tutorial.back")}
                </button>
                {index < steps.length - 1 ? (
                  <button
                    className="button button-primary"
                    disabled={!actionDone}
                    onClick={() => setIndex((current) => current + 1)}
                  >
                    {t("tutorial.next")}
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={!actionDone}
                    onClick={() => void close(true)}
                  >
                    {t("tutorial.finish")}
                  </button>
                )}
              </footer>
            </section>
          )}
        </div>
      ) : null}
    </Context>
  );
}

function TourMasks({ rect }: { rect: DOMRect }) {
  const gap = 8;
  return (
    <>
      <i
        className="tour-mask"
        style={{ left: 0, top: 0, right: 0, height: Math.max(0, rect.top - gap) }}
      />
      <i className="tour-mask" style={{ left: 0, top: rect.bottom + gap, right: 0, bottom: 0 }} />
      <i
        className="tour-mask"
        style={{
          left: 0,
          top: Math.max(0, rect.top - gap),
          width: Math.max(0, rect.left - gap),
          height: rect.height + gap * 2,
        }}
      />
      <i
        className="tour-mask"
        style={{
          left: rect.right + gap,
          top: Math.max(0, rect.top - gap),
          right: 0,
          height: rect.height + gap * 2,
        }}
      />
      <i
        className="tour-accent tour-accent-top"
        style={{
          left: rect.left - gap,
          top: rect.top - gap,
          width: Math.min(72, rect.width + gap * 2),
        }}
      />
      <i
        className="tour-accent tour-accent-left"
        style={{
          left: rect.left - gap,
          top: rect.top - gap,
          height: Math.min(72, rect.height + gap * 2),
        }}
      />
    </>
  );
}
function cardStyle(rect: DOMRect | null): CSSProperties | undefined {
  if (rect === null) return undefined;
  if (window.innerWidth <= 680) {
    const margin = 12;
    const bottomNavigation = 86;
    const width = window.innerWidth - margin * 2;
    const maxHeight = Math.min(320, Math.floor(window.innerHeight * 0.44));
    const viewportBottom = window.innerHeight - bottomNavigation;
    const availableAbove = Math.max(0, rect.top - margin * 2);
    const availableBelow = Math.max(0, viewportBottom - rect.bottom - margin);
    const placeBelow =
      availableBelow >= Math.min(220, maxHeight) || availableBelow >= availableAbove;
    const available = placeBelow ? availableBelow : availableAbove;
    const cardMaxHeight = Math.max(150, Math.min(maxHeight, available));
    const top = placeBelow
      ? Math.min(viewportBottom - cardMaxHeight, rect.bottom + margin)
      : Math.max(margin, rect.top - cardMaxHeight - margin);
    return { left: margin, top, width, maxHeight: cardMaxHeight, position: "fixed" };
  }
  const width = Math.min(440, window.innerWidth - 32);
  const left =
    rect.right + width + 24 < window.innerWidth
      ? rect.right + 16
      : Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
  const top =
    rect.right + width + 24 < window.innerWidth
      ? Math.max(16, Math.min(rect.top, window.innerHeight - 330))
      : Math.max(16, Math.min(rect.bottom + 16, window.innerHeight - 330));
  return { left, top, width, position: "fixed" };
}

function canPerformAction(element: HTMLElement, action: RequiredAction | undefined): boolean {
  if (action === undefined) return true;
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    bounds.width === 0 ||
    bounds.height === 0 ||
    ("disabled" in element && element.disabled === true)
  )
    return false;
  if (action === "change" && element instanceof HTMLSelectElement) {
    return element.options.length > 1;
  }
  if (action === "change" && element instanceof HTMLInputElement) return !element.readOnly;
  return true;
}
export function useTutorial() {
  const value = useContext(Context);
  if (value === null) throw new Error("useTutorial must be inside TutorialProvider");
  return value;
}
