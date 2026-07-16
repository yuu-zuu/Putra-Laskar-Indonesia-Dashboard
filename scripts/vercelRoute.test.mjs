import assert from "node:assert/strict";
import test from "node:test";
import { restoreApiRequestUrl } from "./vercelRoute.mjs";

test("restores a nested API path routed through the fixed Vercel Function", () => {
  const request = { url: "/api/gateway?__pli_api_path=v1%2Fauth%2Fme" };

  restoreApiRequestUrl(request);

  assert.equal(request.url, "/api/v1/auth/me");
});

test("preserves public query parameters and removes the internal route parameter", () => {
  const request = {
    url: "/api/gateway?branchId=abc&__pli_api_path=v1%2Fdashboard&days=30",
  };

  restoreApiRequestUrl(request);

  assert.equal(request.url, "/api/v1/dashboard?branchId=abc&days=30");
});

test("encodes decoded path segments before forwarding them to the application router", () => {
  const request = { url: "/api/gateway?__pli_api_path=v1%2Fitems%2Fmeter%20A" };

  restoreApiRequestUrl(request);

  assert.equal(request.url, "/api/v1/items/meter%20A");
});

test("leaves direct gateway requests untouched", () => {
  const request = { url: "/api/gateway?probe=true" };

  restoreApiRequestUrl(request);

  assert.equal(request.url, "/api/gateway?probe=true");
});
