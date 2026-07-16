import assert from "node:assert/strict";
import test from "node:test";
import {
  booleanField,
  dateField,
  enumField,
  numberField,
  objectBody,
  stringField,
  uuidField,
} from "./validation.js";

test("validates and normalizes string/object fields", () => {
  assert.deepEqual(objectBody({ name: "value" }), { name: "value" });
  assert.equal(stringField({ name: "  value  " }, "name"), "value");
  assert.equal(stringField({ name: null }, "name", { nullable: true }), null);
  for (const value of [null, [], "text"]) assert.throws(() => objectBody(value));
  assert.throws(() => stringField({ name: 1 }, "name"));
  assert.throws(() => stringField({ name: "a" }, "name", { min: 2 }));
  assert.throws(() => stringField({ name: "abc" }, "name", { max: 2 }));
});

test("enforces finite numeric bounds, integer fields, and database scale", () => {
  assert.equal(numberField({ value: 12.34 }, "value", { min: 1, max: 20, scale: 2 }), 12.34);
  assert.equal(numberField({ value: 12 }, "value", { integer: true }), 12);
  for (const value of ["12", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => numberField({ value }, "value"));
  }
  assert.throws(() => numberField({ value: 0 }, "value", { min: 1 }));
  assert.throws(() => numberField({ value: 21 }, "value", { max: 20 }));
  assert.throws(() => numberField({ value: 1.2 }, "value", { integer: true }));
  assert.throws(() => numberField({ value: 1.234 }, "value", { scale: 2 }));
});

test("rejects normalized or malformed calendar dates", () => {
  assert.equal(dateField({ date: "2024-02-29" }, "date"), "2024-02-29");
  for (const date of ["2023-02-29", "2026-02-31", "1899-12-31", "2026-2-1", null]) {
    assert.throws(() => dateField({ date }, "date"));
  }
});

test("validates boolean and enum fields", () => {
  assert.equal(booleanField({ active: false }, "active"), false);
  assert.equal(enumField({ role: "ADMIN" }, "role", ["ADMIN", "OPERATOR"]), "ADMIN");
  assert.throws(() => booleanField({ active: 0 }, "active"));
  assert.throws(() => enumField({ role: "OTHER" }, "role", ["ADMIN", "OPERATOR"]));
});

test("accepts the complete PostgreSQL UUID domain including deterministic seed IDs", () => {
  assert.equal(
    uuidField({ branchId: "10000000-0000-0000-0000-000000000001" }, "branchId"),
    "10000000-0000-0000-0000-000000000001",
  );
  assert.equal(uuidField({ branchId: null }, "branchId", { nullable: true }), null);
  assert.equal(
    uuidField({ branchId: "A0B1C2D3-E4F5-6789-ABCD-EF0123456789" }, "branchId"),
    "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
  );
  for (const value of ["", "not-a-uuid", "10000000-0000-0000-0000-00000000001z"]) {
    assert.throws(() => uuidField({ branchId: value }, "branchId"));
  }
});
