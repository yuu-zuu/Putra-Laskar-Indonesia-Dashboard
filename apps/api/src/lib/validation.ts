import { AppError } from "./errors.js";

export function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(422, "INVALID_BODY", "Request body harus berupa object JSON.");
  }
  return value as Record<string, unknown>;
}

export function stringField(
  object: Record<string, unknown>,
  name: string,
  options: { min?: number; max?: number; nullable?: boolean } = {},
): string | null {
  const value = object[name];
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") {
    throw fieldError(name, "Harus berupa string.");
  }
  const trimmed = value.trim();
  if (trimmed.length < (options.min ?? 1)) throw fieldError(name, "Terlalu pendek.");
  if (trimmed.length > (options.max ?? 500)) throw fieldError(name, "Terlalu panjang.");
  return trimmed;
}

export function numberField(
  object: Record<string, unknown>,
  name: string,
  options: { min?: number; max?: number; scale?: number; integer?: boolean } = {},
): number {
  const value = object[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw fieldError(name, "Harus berupa angka finite.");
  }
  if (options.min !== undefined && value < options.min)
    throw fieldError(name, `Minimum ${options.min}.`);
  if (options.max !== undefined && value > options.max)
    throw fieldError(name, `Maksimum ${options.max}.`);
  if (options.integer && !Number.isSafeInteger(value))
    throw fieldError(name, "Harus bilangan bulat.");
  if (options.scale !== undefined) {
    const factor = 10 ** options.scale;
    const scaled = value * factor;
    if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-7) {
      throw fieldError(name, `Maksimal ${options.scale} angka di belakang desimal.`);
    }
  }
  return value;
}

export function booleanField(object: Record<string, unknown>, name: string): boolean {
  const value = object[name];
  if (typeof value !== "boolean") throw fieldError(name, "Harus berupa boolean.");
  return value;
}

export function dateField(object: Record<string, unknown>, name: string): string {
  const value = stringField(object, name);
  if (value === null || !isCalendarDate(value)) {
    throw fieldError(name, "Gunakan tanggal ISO YYYY-MM-DD.");
  }
  return value;
}

export function uuidField(
  object: Record<string, unknown>,
  name: string,
  options: { nullable?: boolean } = {},
): string | null {
  const value = stringField(object, name, { max: 36, nullable: options.nullable ?? false });
  if (value === null) return null;
  // PostgreSQL accepts every 128-bit UUID value; version and variant bits are not constrained.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw fieldError(name, "UUID tidak valid.");
  }
  return value.toLowerCase();
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function enumField<T extends string>(
  object: Record<string, unknown>,
  name: string,
  allowed: readonly T[],
): T {
  const value = stringField(object, name);
  if (value === null || !allowed.includes(value as T)) {
    throw fieldError(name, `Nilai harus salah satu dari: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function fieldError(name: string, message: string): AppError {
  return new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", { [name]: message });
}
