import assert from "node:assert/strict";
import test from "node:test";
import { AppError, asAppError, databaseCode } from "./errors.js";

test("preserves explicit application errors", () => {
  const source = new AppError(422, "BAD_INPUT", "Invalid");
  assert.equal(asAppError(source), source);
});
test("maps PostgreSQL unique violations to traceable client conflicts", () => {
  for (const code of ["23505", "23P01"]) {
    const error = asAppError({ code });
    assert.equal(error.status, 409);
    assert.equal(error.code, "RESOURCE_CONFLICT");
  }
});
test("marks serialization failures retryable", () => {
  const error = asAppError({ code: "40001" });
  assert.equal(error.status, 409);
  assert.equal(error.retryable, true);
});
test("maps constraint and deadlock failures without leaking database details", () => {
  for (const code of ["22001", "22003", "22007", "22P02", "23502", "23503", "23514"]) {
    assert.equal(asAppError({ code }).code, "DATABASE_VALIDATION_ERROR");
  }
  assert.equal(asAppError({ code: "40P01" }).retryable, true);
  assert.equal(databaseCode(null), null);
  assert.equal(databaseCode({ code: 123 }), null);
  assert.equal(databaseCode({ code: "23505" }), "23505");
});
test("does not disclose unknown server errors", () => {
  const error = asAppError(new Error("database secret"));
  assert.equal(error.status, 500);
  assert.equal(error.message, "Terjadi kesalahan internal.");
});
test("maps malformed paths and transient infrastructure failures", () => {
  assert.equal(asAppError(new URIError("bad path")).code, "INVALID_PATH");
  for (const code of [
    "08000",
    "08001",
    "08003",
    "08004",
    "08006",
    "08P01",
    "53300",
    "57014",
    "57P01",
    "57P02",
    "57P03",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
  ]) {
    const error = asAppError({ code });
    assert.equal(error.status, 503);
    assert.equal(error.retryable, true);
    assert.equal(error.message, "Layanan sementara tidak tersedia.");
  }
});
