import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "./router.js";

const handler = () => undefined;

test("matches static and decoded parameter routes", () => {
  const router = new Router()
    .add("GET", "/api/v1/items", handler)
    .add("PATCH", "/api/v1/items/{id}", handler);
  assert.deepEqual(router.match("get", "/api/v1/items")?.params, {});
  assert.deepEqual(router.match("PATCH", "/api/v1/items/a%20b")?.params, { id: "a b" });
  assert.equal(router.match("POST", "/api/v1/items"), null);
});

test("reports deterministic methods for an existing path", () => {
  const router = new Router()
    .add("PATCH", "/api/v1/items/{id}", handler)
    .add("GET", "/api/v1/items/{id}", handler)
    .add("DELETE", "/api/v1/items/{id}", handler);
  assert.deepEqual(router.allowedMethods("/api/v1/items/123"), ["DELETE", "GET", "PATCH"]);
  assert.deepEqual(router.allowedMethods("/api/v1/other/123"), []);
});

test("rejects malformed percent encoding instead of silently matching", () => {
  const router = new Router().add("GET", "/items/{id}", handler);
  assert.throws(() => router.match("GET", "/items/%E0%A4%A"), URIError);
});
