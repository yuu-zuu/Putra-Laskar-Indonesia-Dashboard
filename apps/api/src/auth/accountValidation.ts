import { AppError } from "../lib/errors.js";
import { stringField } from "../lib/validation.js";

export function employeeIdField(body: Record<string, unknown>): string {
  const value = (stringField(body, "employeeId", { min: 3, max: 32 }) as string).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value)) {
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
      employeeId: "Gunakan huruf, angka, tanda hubung, atau underscore.",
    });
  }
  return value;
}

export function emailField(body: Record<string, unknown>): string {
  const email = stringField(body, "email", { min: 5, max: 254 }) as string;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(422, "VALIDATION_ERROR", "Request tidak valid.", {
      email: "Format email tidak valid.",
    });
  }
  return email.toLowerCase();
}

export function passwordField(body: Record<string, unknown>, field = "password"): string {
  const password = body[field];
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new AppError(422, "WEAK_PASSWORD", "Password harus terdiri dari 10–128 karakter.", {
      [field]: "Gunakan 10–128 karakter.",
    });
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(
      422,
      "WEAK_PASSWORD",
      "Password harus memuat huruf kecil, huruf besar, dan angka.",
      { [field]: "Gunakan 10–128 karakter dengan huruf kecil, besar, dan angka." },
    );
  }
  return password;
}
