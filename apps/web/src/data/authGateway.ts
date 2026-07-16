import type { AuthUser, ChangePasswordInput, LoginInput, RegisterInput } from "@spbu/contracts";
import { isMockMode } from "./gateway.js";
import { apiRequest, HttpError } from "../lib/http.js";
import { createClientId } from "../lib/id.js";
import { hashMockPassword } from "../lib/mockHash.js";
import { safeStorage } from "../lib/storage.js";

interface AuthResponse {
  user: AuthUser;
}
interface MockUser extends AuthUser {
  passwordHash: string;
}

const usersKey = "pli-demo-users-v1";
const sessionKey = "pli-demo-session-v1";
const demoAdminEmail = "yudhizz14@gmail.com";
export const demoAdminPassword = "DemoAdmin!2026";

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isMockMode()) {
    try {
      return (await apiRequest<AuthResponse>("/auth/me")).user;
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return null;
      throw error;
    }
  }
  const users = await mockUsers();
  const userId = safeStorage.getItem(sessionKey);
  return users.find((user) => user.id === userId) ?? null;
}

export async function login(input: LoginInput): Promise<AuthUser> {
  if (!isMockMode())
    return (
      await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).user;
  await delay();
  const users = await mockUsers();
  const passwordHash = await hashMockPassword(input.password);
  const normalized = input.identifier.trim().toLowerCase();
  const user = users.find(
    (candidate) =>
      (candidate.employeeId.toLowerCase() === normalized ||
        candidate.email.toLowerCase() === normalized) &&
      candidate.passwordHash === passwordHash,
  );
  if (user === undefined)
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email/ID karyawan atau password tidak cocok.");
  safeStorage.setItem(sessionKey, user.id);
  return stripPassword(user);
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  if (!isMockMode())
    return (
      await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).user;
  await delay();
  if (input.registrationCode !== mockRegistrationCode()) {
    throw new HttpError(
      422,
      "INVALID_REGISTRATION_CODE",
      "Kode registrasi demo tidak valid atau sudah berganti.",
    );
  }
  const users = await mockUsers();
  if (users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
    throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "Email sudah terdaftar.");
  }
  const user: MockUser = {
    id: createClientId(),
    employeeId: input.employeeId.toUpperCase(),
    email: input.email.toLowerCase(),
    displayName: input.displayName,
    role: "OPERATOR",
    branchId: "10000000-0000-0000-0000-000000000001",
    locale: "id",
    avatarObjectKey: null,
    onboardingCompletedAt: null,
    passwordHash: await hashMockPassword(input.password),
  };
  safeStorage.setItem(usersKey, JSON.stringify([...users, user]));
  safeStorage.setItem(sessionKey, user.id);
  return stripPassword(user);
}

export async function logout(): Promise<void> {
  if (!isMockMode()) await apiRequest<void>("/auth/logout", { method: "POST" });
  safeStorage.removeItem(sessionKey);
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  if (!isMockMode()) {
    await apiRequest<void>("/auth/password", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return;
  }
  const users = await mockUsers();
  const index = users.findIndex((user) => user.id === safeStorage.getItem(sessionKey));
  const current = users[index];
  if (
    current === undefined ||
    current.passwordHash !== (await hashMockPassword(input.currentPassword))
  ) {
    throw new HttpError(401, "PASSWORD_CONFIRMATION_FAILED", "Password saat ini tidak cocok.", {
      currentPassword: "Password saat ini tidak cocok.",
    });
  }
  const nextHash = await hashMockPassword(input.newPassword);
  if (nextHash === current.passwordHash) {
    throw new HttpError(
      422,
      "PASSWORD_UNCHANGED",
      "Password baru harus berbeda dari password saat ini.",
      { newPassword: "Gunakan password baru yang berbeda." },
    );
  }
  users[index] = { ...current, passwordHash: nextHash };
  safeStorage.setItem(usersKey, JSON.stringify(users));
}

export async function deleteAccount(password: string): Promise<void> {
  if (!isMockMode()) {
    await apiRequest<void>("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    return;
  }
  const users = await mockUsers();
  const currentId = safeStorage.getItem(sessionKey);
  const current = users.find((user) => user.id === currentId);
  if (current === undefined || current.passwordHash !== (await hashMockPassword(password))) {
    throw new HttpError(401, "PASSWORD_CONFIRMATION_FAILED", "Password konfirmasi tidak cocok.");
  }
  if (current.role === "ADMIN" && users.filter((user) => user.role === "ADMIN").length <= 1) {
    throw new HttpError(
      409,
      "LAST_ADMIN_REQUIRED",
      "Admin terakhir tidak dapat dihapus. Buat admin pengganti terlebih dahulu.",
    );
  }
  safeStorage.setItem(usersKey, JSON.stringify(users.filter((user) => user.id !== currentId)));
  safeStorage.removeItem(sessionKey);
}

export async function getActiveRegistrationCode(): Promise<{ code: string; expiresAt: string }> {
  if (!isMockMode())
    return apiRequest<{ code: string; expiresAt: string }>("/auth/registration-code");
  const expiresAt = new Date((Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000).toISOString();
  return { code: mockRegistrationCode(), expiresAt };
}

async function mockUsers(): Promise<MockUser[]> {
  const stored = safeStorage.getItem(usersKey);
  if (stored !== null) return JSON.parse(stored) as MockUser[];
  const admin: MockUser = {
    id: "90000000-0000-0000-0000-000000000001",
    employeeId: "ADMIN-001",
    email: demoAdminEmail,
    displayName: "Mr.Yudhistira",
    role: "ADMIN",
    branchId: "10000000-0000-0000-0000-000000000001",
    locale: "id",
    avatarObjectKey: null,
    onboardingCompletedAt: null,
    passwordHash: await hashMockPassword(demoAdminPassword),
  };
  safeStorage.setItem(usersKey, JSON.stringify([admin]));
  return [admin];
}

function mockRegistrationCode(): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  return String((hour * 7919 + 104729) % 1_000_000).padStart(6, "0");
}

function stripPassword(user: MockUser): AuthUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function delay(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 180));
}
