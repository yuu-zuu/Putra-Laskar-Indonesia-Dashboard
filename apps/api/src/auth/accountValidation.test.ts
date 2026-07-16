import assert from "node:assert/strict";
import test from "node:test";
import { emailField, employeeIdField, passwordField } from "./accountValidation.js";

test("normalizes account identifiers", () => {
  assert.equal(employeeIdField({ employeeId: "ops-01" }), "OPS-01");
  assert.equal(emailField({ email: " User@Example.COM " }), "user@example.com");
  assert.throws(() => employeeIdField({ employeeId: "bad id" }));
  assert.throws(() => emailField({ email: "invalid" }));
});

test("preserves exact passwords and enforces bounded complexity", () => {
  const password = " StrongPass1 ";
  assert.equal(passwordField({ password }), password);
  for (const value of ["Short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"])
    assert.throws(() => passwordField({ password: value }));
  assert.throws(() => passwordField({ password: 123 }));
  assert.throws(() => passwordField({ password: `ValidPass1${"x".repeat(130)}` }));
});

test("validates named password fields without remapping the request body", () => {
  assert.equal(
    passwordField({ currentPassword: "CurrentPass1" }, "currentPassword"),
    "CurrentPass1",
  );
  assert.throws(
    () => passwordField({ newPassword: "too-weak" }, "newPassword"),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "fieldErrors" in error &&
      (error.fieldErrors as Record<string, string>).newPassword !== undefined,
  );
});
