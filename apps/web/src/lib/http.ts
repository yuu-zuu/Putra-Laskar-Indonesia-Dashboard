import { createRequestAbort } from "./abort.js";
import { safeStorage } from "./storage.js";

const apiBaseUrl = resolveBrowserServiceUrl(import.meta.env.VITE_API_BASE_URL ?? "/api/v1");

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly requestId: string | null = null,
    readonly retryable = false,
  ) {
    super(localizedError(code, status, message));
    this.name = "HttpError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (!headers.has("accept-language")) {
    headers.set("accept-language", safeStorage.getItem("pli-locale") ?? "id");
  }
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const abort = createRequestAbort(signal, 20_000);
  const requestInit: RequestInit = {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
    ...(abort.signal === undefined ? {} : { signal: abort.signal }),
  };
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, requestInit);
    text = response.status === 204 ? "" : await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (abort.didTimeout()) {
      throw new HttpError(
        0,
        "REQUEST_TIMEOUT",
        "API tidak merespons dalam batas waktu.",
        {},
        null,
        true,
      );
    }
    throw new HttpError(
      0,
      "NETWORK_ERROR",
      "API tidak dapat dijangkau. Periksa jaringan, alamat host, dan firewall laptop.",
      {},
      null,
      true,
    );
  } finally {
    abort.cleanup();
  }
  if (response.status === 204) return undefined as T;
  const body = parseResponseBody(text);
  if (!response.ok) {
    const errorBody = isRecord(body) ? body : {};
    throw new HttpError(
      response.status,
      stringValue(errorBody.code) ?? "HTTP_ERROR",
      stringValue(errorBody.message) ?? `Request gagal (${response.status}).`,
      recordOfStrings(errorBody.fieldErrors),
      stringValue(errorBody.requestId) ?? response.headers.get("x-request-id"),
      errorBody.retryable === true,
    );
  }
  if (body === null) {
    throw new HttpError(
      502,
      "INVALID_API_RESPONSE",
      "API mengembalikan respons yang tidak valid.",
      {},
      response.headers.get("x-request-id"),
      true,
    );
  }
  return body as T;
}

const errorMessages: Record<string, [string, string, string]> = {
  NETWORK_ERROR: [
    "API tidak dapat dijangkau. Periksa jaringan, alamat host, dan firewall laptop.",
    "The API could not be reached. Check the network, host address, and laptop firewall.",
    "无法连接 API。请检查网络、主机地址和笔记本电脑防火墙。",
  ],
  REQUEST_TIMEOUT: [
    "API tidak merespons dalam batas waktu.",
    "The API did not respond before the timeout.",
    "API 未在超时前响应。",
  ],
  INVALID_API_RESPONSE: [
    "API mengembalikan respons yang tidak valid.",
    "The API returned an invalid response.",
    "API 返回了无效响应。",
  ],
  SERVICE_UNAVAILABLE: [
    "Layanan sementara tidak tersedia. Coba kembali sesaat lagi.",
    "The service is temporarily unavailable. Try again shortly.",
    "服务暂时不可用，请稍后重试。",
  ],
  INVALID_CREDENTIALS: [
    "Email/ID karyawan atau password tidak cocok.",
    "The email/employee ID or password is incorrect.",
    "邮箱/员工编号或密码不正确。",
  ],
  AUTH_REQUIRED: ["Silakan masuk kembali.", "Please sign in again.", "请重新登录。"],
  INVALID_REGISTRATION_CODE: [
    "Kode registrasi tidak valid atau sudah berganti.",
    "The registration code is invalid or has rotated.",
    "注册码无效或已轮换。",
  ],
  EMAIL_ALREADY_REGISTERED: [
    "Email atau ID karyawan sudah terdaftar.",
    "The email or employee ID is already registered.",
    "邮箱或员工编号已注册。",
  ],
  WEAK_PASSWORD: [
    "Password harus memuat huruf kecil, huruf besar, dan angka.",
    "The password must include lowercase, uppercase, and a number.",
    "密码必须包含小写字母、大写字母和数字。",
  ],
  PASSWORD_CONFIRMATION_FAILED: [
    "Password saat ini tidak cocok.",
    "The current password is incorrect.",
    "当前密码不正确。",
  ],
  PASSWORD_UNCHANGED: [
    "Password baru harus berbeda dari password saat ini.",
    "The new password must differ from the current password.",
    "新密码必须与当前密码不同。",
  ],
  PASSWORD_CHANGED_RETRY: [
    "Password berubah bersamaan. Masukkan kembali password saat ini.",
    "The password changed concurrently. Enter the current password again.",
    "密码已同时发生更改。请重新输入当前密码。",
  ],
  METER_CONTINUITY_ERROR: [
    "Bacaan awal tidak sama dengan akhir sebelumnya.",
    "The opening reading does not match the previous closing reading.",
    "起始读数与上次结束读数不一致。",
  ],
  INSUFFICIENT_FIFO_STOCK: [
    "Stock FIFO tidak cukup untuk transaksi ini.",
    "There is not enough FIFO stock for this transaction.",
    "FIFO 库存不足，无法完成此交易。",
  ],
  SELLING_PRICE_BELOW_COST: [
    "Harga jual lebih rendah daripada biaya FIFO.",
    "The selling price is below FIFO cost.",
    "售价低于 FIFO 成本。",
  ],
  STOCK_CAPACITY_EXCEEDED: [
    "Mutasi akan melebihi kapasitas unit stock.",
    "The movement would exceed stock-unit capacity.",
    "该变动将超过库存单元容量。",
  ],
  NEGATIVE_STOCK: [
    "Mutasi akan membuat saldo stock negatif.",
    "The movement would make the stock balance negative.",
    "该变动会使库存余额为负。",
  ],
  PRODUCT_CODE_EXISTS: [
    "Kode produk sudah digunakan.",
    "The product code is already in use.",
    "产品代码已被使用。",
  ],
  INVALID_TREND_RANGE: [
    "Rentang tren harus 7 sampai 90 hari.",
    "The trend range must be between 7 and 90 days.",
    "趋势范围必须为 7 到 90 天。",
  ],
  CLIENT_NOT_ALLOWED: [
    "Client aplikasi tidak diizinkan.",
    "This application client is not allowed.",
    "不允许此应用客户端。",
  ],
  ACCOUNT_IDENTIFIER_EXISTS: [
    "Email atau ID karyawan sudah digunakan.",
    "The email or employee ID is already in use.",
    "电子邮箱或员工编号已被使用。",
  ],
  CANNOT_DELETE_CURRENT_ACCOUNT: [
    "Akun aktif tidak dapat dihapus dari menu kelola akun.",
    "The current account cannot be deleted from account management.",
    "无法从账户管理中删除当前账户。",
  ],
  CANNOT_CHANGE_OWN_ROLE: [
    "Role akun aktif harus diubah oleh administrator lain.",
    "Another administrator must change the current account's role.",
    "当前账户的角色必须由其他管理员更改。",
  ],
  USE_SELF_PASSWORD_CHANGE: [
    "Gunakan Pengaturan untuk mengganti password akun aktif.",
    "Use Settings to change the current account password.",
    "请在设置中更改当前账户的密码。",
  ],
  ACCOUNT_STORAGE_CLEANUP_FAILED: [
    "Berkas akun belum dapat dibersihkan. Penghapusan akun dibatalkan.",
    "The account files could not be cleaned up, so account deletion was cancelled.",
    "无法清理账户文件，因此已取消删除账户。",
  ],
  LAST_ADMIN_REQUIRED: [
    "Admin terakhir tidak dapat dihapus.",
    "The last administrator cannot be deleted.",
    "无法删除最后一个管理员。",
  ],
  INVALID_AVATAR_FILE: [
    "Avatar harus PNG, JPEG, atau WebP dan maksimal 500 KB.",
    "The avatar must be PNG, JPEG, or WebP and no larger than 500 KB.",
    "头像必须为 PNG、JPEG 或 WebP，且不超过 500 KB。",
  ],
  INVALID_AVATAR_CONTENT: [
    "Isi berkas tidak sesuai dengan tipe gambar yang dipilih.",
    "The file content does not match the selected image type.",
    "文件内容与所选图像类型不匹配。",
  ],
  AVATAR_STORAGE_UNAVAILABLE: [
    "Penyimpanan foto sedang tidak dapat dijangkau.",
    "Photo storage is currently unavailable.",
    "照片存储目前不可用。",
  ],
  AVATAR_STORAGE_FAILED: [
    "Foto profil gagal disimpan.",
    "The profile photo could not be saved.",
    "无法保存个人资料照片。",
  ],
  RESOURCE_CONFLICT: [
    "Data yang sama sudah tersimpan. Muat ulang dan periksa kembali.",
    "The same data is already stored. Reload and review it.",
    "相同数据已保存。请重新加载并检查。",
  ],
  METER_READING_EXISTS: [
    "Bacaan meter pada tanggal ini sudah ada.",
    "A meter reading already exists for this date.",
    "该日期的仪表读数已存在。",
  ],
  INTERNAL_ERROR: [
    "Terjadi kesalahan internal. Gunakan Request ID saat menghubungi support.",
    "An internal error occurred. Include the Request ID when contacting support.",
    "发生内部错误。联系支持时请附上请求 ID。",
  ],
};

function resolveBrowserServiceUrl(configured: string): string {
  const url = new URL(configured, window.location.origin);
  if (isLoopbackHost(url.hostname) && !isLoopbackHost(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  return url.toString().replace(/\/$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function parseResponseBody(value: string): unknown | null {
  if (value.trim() === "") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}
function localizedError(code: string, status: number, fallback: string): string {
  const stored = safeStorage.getItem("pli-locale");
  if (stored === null || stored === "id") return fallback;
  const index = stored === "en" ? 1 : 2;
  const known = errorMessages[code];
  if (known !== undefined) return known[index];
  if (status === 400) return index === 1 ? "The request is not valid." : "请求无效。";
  if (status === 401) return index === 1 ? "Please sign in again." : "请重新登录。";
  if (status === 403)
    return index === 1 ? "You do not have permission for this action." : "您无权执行此操作。";
  if (status === 404)
    return index === 1 ? "The requested data was not found." : "未找到请求的数据。";
  if (status === 405) return index === 1 ? "This action is not supported." : "不支持此操作。";
  if (status === 409)
    return index === 1
      ? "The data changed or conflicts with an existing record."
      : "数据已变更或与现有记录冲突。";
  if (status === 413) return index === 1 ? "The file or request is too large." : "文件或请求过大。";
  if (status === 415)
    return index === 1
      ? "This file or request format is not supported."
      : "不支持此文件或请求格式。";
  if (status === 422)
    return index === 1 ? "Some input is invalid. Review the form." : "部分输入无效，请检查表单。";
  if (status === 429)
    return index === 1 ? "Too many attempts. Try again later." : "尝试次数过多，请稍后再试。";
  if (status >= 500)
    return index === 1
      ? "An internal error occurred. Use the Request ID for support."
      : "发生内部错误。请使用请求 ID 联系支持。";
  return fallback;
}
