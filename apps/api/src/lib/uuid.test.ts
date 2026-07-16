import assert from "node:assert/strict";
import test from "node:test";
import { createUuid } from "./uuid.js";

test("creates unique canonical version-4 UUIDs without randomUUID", () => {
  const ids = Array.from({ length: 1_000 }, createUuid);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});
