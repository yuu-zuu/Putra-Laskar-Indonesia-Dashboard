import type {
  CreateManagedAccountInput,
  ManagedAccount,
  ResetManagedAccountPasswordInput,
  UpdateManagedAccountInput,
} from "@spbu/contracts";
import { apiRequest, HttpError } from "../lib/http.js";
import { isMockMode } from "./gateway.js";
import { createClientId } from "../lib/id.js";
import { hashMockPassword } from "../lib/mockHash.js";
import { safeStorage } from "../lib/storage.js";

const usersKey = "pli-demo-users-v1";
const sessionKey = "pli-demo-session-v1";

interface StoredMockAccount extends ManagedAccount {
  branchId: string | null;
  locale?: string;
  avatarObjectKey?: string | null;
  onboardingCompletedAt?: string | null;
  passwordHash: string;
}

export async function getManagedAccounts(): Promise<ManagedAccount[]> {
  if (!isMockMode()) {
    return (await apiRequest<{ items: ManagedAccount[] }>("/admin/accounts")).items;
  }
  return readMockAccounts().map(toManagedAccount);
}

export async function createManagedAccount(
  input: CreateManagedAccountInput,
): Promise<ManagedAccount> {
  if (!isMockMode()) {
    return apiRequest<ManagedAccount>("/admin/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  const accounts = readMockAccounts();
  if (
    accounts.some(
      (account) =>
        account.email.toLowerCase() === input.email.toLowerCase() ||
        account.employeeId.toUpperCase() === input.employeeId.toUpperCase(),
    )
  ) {
    throw new HttpError(
      409,
      "ACCOUNT_IDENTIFIER_EXISTS",
      "Email atau ID karyawan sudah digunakan.",
    );
  }
  const created: StoredMockAccount = {
    id: createClientId(),
    employeeId: input.employeeId.toUpperCase(),
    email: input.email.toLowerCase(),
    displayName: input.displayName,
    role: input.role,
    branchId: input.branchId,
    branchName: input.branchId === null ? null : "Pangkalan Balai",
    createdAt: new Date().toISOString(),
    passwordHash: await hashMockPassword(input.password),
    locale: "id",
    avatarObjectKey: null,
    onboardingCompletedAt: null,
  };
  safeStorage.setItem(usersKey, JSON.stringify([...accounts, created]));
  return toManagedAccount(created);
}

export async function deleteManagedAccount(id: string): Promise<void> {
  if (!isMockMode()) {
    await apiRequest<void>(`/admin/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const accounts = readMockAccounts();
  if (safeStorage.getItem(sessionKey) === id) {
    throw new HttpError(
      409,
      "CANNOT_DELETE_CURRENT_ACCOUNT",
      "Akun aktif tidak dapat dihapus dari menu kelola akun.",
    );
  }
  const target = accounts.find((account) => account.id === id);
  if (target === undefined) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
  if (
    target.role === "ADMIN" &&
    accounts.filter((account) => account.role === "ADMIN").length <= 1
  ) {
    throw new HttpError(409, "LAST_ADMIN_REQUIRED", "Admin terakhir tidak dapat dihapus.");
  }
  safeStorage.setItem(usersKey, JSON.stringify(accounts.filter((account) => account.id !== id)));
}

export async function updateManagedAccount(
  id: string,
  input: UpdateManagedAccountInput,
): Promise<ManagedAccount> {
  if (!isMockMode()) {
    return apiRequest<ManagedAccount>(`/admin/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  const accounts = readMockAccounts();
  const index = accounts.findIndex((account) => account.id === id);
  const target = accounts[index];
  if (target === undefined) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
  if (safeStorage.getItem(sessionKey) === id && input.role !== target.role) {
    throw new HttpError(
      409,
      "CANNOT_CHANGE_OWN_ROLE",
      "Role akun aktif harus diubah oleh administrator lain.",
    );
  }
  if (
    target.role === "ADMIN" &&
    input.role !== "ADMIN" &&
    accounts.filter((account) => account.role === "ADMIN").length <= 1
  ) {
    throw new HttpError(409, "LAST_ADMIN_REQUIRED", "Admin terakhir tidak dapat diturunkan.");
  }
  const updated: StoredMockAccount = {
    ...target,
    role: input.role,
    branchId: input.branchId,
    branchName: input.branchId === null ? null : (target.branchName ?? "Pangkalan Balai"),
  };
  accounts[index] = updated;
  safeStorage.setItem(usersKey, JSON.stringify(accounts));
  return toManagedAccount(updated);
}

export async function resetManagedAccountPassword(
  id: string,
  input: ResetManagedAccountPasswordInput,
): Promise<void> {
  if (!isMockMode()) {
    await apiRequest<void>(`/admin/accounts/${encodeURIComponent(id)}/password`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return;
  }
  const accounts = readMockAccounts();
  const index = accounts.findIndex((account) => account.id === id);
  const target = accounts[index];
  if (target === undefined) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Akun tidak ditemukan.");
  if (safeStorage.getItem(sessionKey) === id) {
    throw new HttpError(
      409,
      "USE_SELF_PASSWORD_CHANGE",
      "Gunakan Pengaturan untuk mengganti password akun aktif.",
    );
  }
  accounts[index] = { ...target, passwordHash: await hashMockPassword(input.password) };
  safeStorage.setItem(usersKey, JSON.stringify(accounts));
}

function readMockAccounts(): StoredMockAccount[] {
  const raw = safeStorage.getItem(usersKey);
  return raw === null ? [] : (JSON.parse(raw) as StoredMockAccount[]);
}

function toManagedAccount(account: StoredMockAccount): ManagedAccount {
  return {
    id: account.id,
    employeeId: account.employeeId,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    branchId: account.branchId,
    branchName: account.branchName ?? null,
    createdAt: account.createdAt ?? new Date().toISOString(),
  };
}
