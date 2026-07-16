import assert from "node:assert/strict";
import test from "node:test";
import {
  registrationCode,
  registrationCodeExpiresAt,
  verifyRegistrationCode,
} from "./registrationCode.js";

test("registration code is deterministic within an hour and rotates next hour", () => {
  const first = new Date("2026-07-10T10:15:00.000Z");
  const sameWindow = new Date("2026-07-10T10:59:59.000Z");
  const nextWindow = new Date("2026-07-10T11:00:00.000Z");
  assert.equal(registrationCode("secret", first), registrationCode("secret", sameWindow));
  assert.notEqual(registrationCode("secret", first), registrationCode("secret", nextWindow));
  assert.match(registrationCode("secret", first), /^\d{6}$/);
  assert.equal(verifyRegistrationCode(registrationCode("secret", first), "secret", first), true);
  assert.equal(verifyRegistrationCode("123", "secret", first), false);
  assert.equal(verifyRegistrationCode("000000", "secret", first), false);
  assert.equal(registrationCodeExpiresAt(first), "2026-07-10T11:00:00.000Z");
});
