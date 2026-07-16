import { createHmac, timingSafeEqual } from "node:crypto";

const codeDigits = 6;
const windowMilliseconds = 60 * 60 * 1_000;

export function registrationCode(secret: string, now = new Date()): string {
  const window = Math.floor(now.getTime() / windowMilliseconds);
  const digest = createHmac("sha256", secret).update(`registration:${window}`).digest();
  return String(digest.readUInt32BE(0) % 10 ** codeDigits).padStart(codeDigits, "0");
}

export function verifyRegistrationCode(value: string, secret: string, now = new Date()): boolean {
  if (!/^\d{6}$/.test(value)) return false;
  const expected = Buffer.from(registrationCode(secret, now));
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function registrationCodeExpiresAt(now = new Date()): string {
  const nextWindow = (Math.floor(now.getTime() / windowMilliseconds) + 1) * windowMilliseconds;
  return new Date(nextWindow).toISOString();
}
