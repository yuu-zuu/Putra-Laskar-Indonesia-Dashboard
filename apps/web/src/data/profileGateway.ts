import type { AppLocale, AuthUser, UserProfile } from "@spbu/contracts";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";
import { safeStorage } from "../lib/storage.js";
export async function getProfiles(): Promise<UserProfile[]> {
  if (isMockMode()) return mockProfiles();
  return (await apiRequest<{ items: UserProfile[] }>("/profiles")).items;
}
export async function getProfile(id: string): Promise<UserProfile> {
  if (isMockMode()) {
    const profile = mockProfiles().find((item) => item.id === id);
    if (profile === undefined) throw new Error("Profil demo tidak ditemukan.");
    return profile;
  }
  return apiRequest<UserProfile>(`/profiles/${encodeURIComponent(id)}`);
}
export async function updateProfile(input: {
  displayName: string;
  locale: AppLocale;
  avatarObjectKey: string | null;
  avatarContentType: "image/jpeg" | "image/png" | "image/webp" | null;
  avatarSizeBytes: number | null;
  onboardingCompleted: boolean;
}): Promise<UserProfile> {
  if (isMockMode()) {
    const accounts = mockAccounts();
    const userId = safeStorage.getItem(mockSessionKey);
    const index = accounts.findIndex((item) => item.id === userId);
    if (index < 0) throw new Error("Sesi demo tidak ditemukan.");
    const account = accounts[index];
    if (account === undefined) throw new Error("Sesi demo tidak ditemukan.");
    accounts[index] = {
      ...account,
      displayName: input.displayName,
      locale: input.locale,
      avatarObjectKey: input.avatarObjectKey,
      onboardingCompletedAt: input.onboardingCompleted
        ? (account.onboardingCompletedAt ?? new Date().toISOString())
        : null,
    };
    safeStorage.setItem(mockUsersKey, JSON.stringify(accounts));
    const updated = mockProfiles().find((item) => item.id === userId);
    if (updated === undefined) throw new Error("Profil demo tidak ditemukan.");
    return updated;
  }
  return apiRequest<UserProfile>("/profiles/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  if (isMockMode()) {
    const accounts = mockAccounts();
    const userId = safeStorage.getItem(mockSessionKey);
    const index = accounts.findIndex((item) => item.id === userId);
    const account = accounts[index];
    if (account !== undefined) {
      accounts[index] = {
        ...account,
        onboardingCompletedAt: completed ? new Date().toISOString() : null,
      };
      safeStorage.setItem(mockUsersKey, JSON.stringify(accounts));
    }
    return;
  }
  await apiRequest("/profiles/me/onboarding", {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}
export async function uploadAvatar(file: File): Promise<{
  objectKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
}> {
  const contentType = file.type as "image/jpeg" | "image/png" | "image/webp";
  if (isMockMode()) {
    const userId = safeStorage.getItem(mockSessionKey);
    if (userId === null) throw new Error("Sesi demo tidak ditemukan.");
    safeStorage.setItem(`${mockAvatarPrefix}${userId}`, await readDataUrl(file));
    return { objectKey: `demo-avatar/${userId}`, contentType, size: file.size };
  }
  const profile = await apiRequest<UserProfile>("/profiles/me/avatar", {
    method: "POST",
    headers: { "content-type": contentType },
    body: file,
  });
  return {
    objectKey: profile.avatarObjectKey!,
    contentType: profile.avatarContentType!,
    size: profile.avatarSizeBytes!,
  };
}
const mockUsersKey = "pli-demo-users-v1";
const mockSessionKey = "pli-demo-session-v1";
const mockAvatarPrefix = "pli-demo-avatar-v1-";
interface MockAccount extends AuthUser {
  passwordHash: string;
}
function mockAccounts(): MockAccount[] {
  const raw = safeStorage.getItem(mockUsersKey);
  return raw === null ? [] : (JSON.parse(raw) as MockAccount[]);
}
function mockProfiles(): UserProfile[] {
  return mockAccounts().map((account) => ({
    id: account.id,
    employeeId: account.employeeId,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    branchId: account.branchId,
    branchName: "Pangkalan Balai",
    locale: account.locale,
    avatarUrl: safeStorage.getItem(`${mockAvatarPrefix}${account.id}`),
    avatarObjectKey: account.avatarObjectKey,
    avatarContentType: account.avatarObjectKey === null ? null : "image/webp",
    avatarSizeBytes: null,
    createdAt: new Date(0).toISOString(),
  }));
}
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Foto profil gagal dibaca."));
    reader.readAsDataURL(file);
  });
}
