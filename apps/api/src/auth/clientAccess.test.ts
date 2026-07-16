import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequestClient, type ClientAccessPolicy } from "./clientPolicy.js";

const nativeKey = "native-test-key";
const policy: ClientAccessPolicy = {
  allowedWebOrigins: ["https://dashboard.example.com"],
  allowPrivateNetworkOrigins: false,
  privateNetworkWebPorts: [5173, 4173],
  nativeClientKeyHashes: {
    "pli-mobile-v1": createHash("sha256").update(nativeKey).digest("hex"),
  },
  required: true,
};

test("accepts only an allowlisted browser origin", () => {
  assert.equal(classifyRequestClient({ origin: "https://dashboard.example.com" }, policy), "WEB");
  assert.equal(classifyRequestClient({ origin: "https://evil.example" }, policy), null);
  assert.equal(classifyRequestClient({ origin: "not-a-url" }, policy), null);
});

test("optionally accepts only HTTP origins on configured private-network ports", () => {
  const localPolicy = { ...policy, allowPrivateNetworkOrigins: true };
  assert.equal(classifyRequestClient({ origin: "http://192.168.1.25:5173" }, localPolicy), "WEB");
  assert.equal(classifyRequestClient({ origin: "http://10.20.30.40:4173" }, localPolicy), "WEB");
  assert.equal(classifyRequestClient({ origin: "http://172.31.4.8:5173" }, localPolicy), "WEB");
  assert.equal(classifyRequestClient({ origin: "http://192.168.1.25:8080" }, localPolicy), null);
  assert.equal(classifyRequestClient({ origin: "https://192.168.1.25:5173" }, localPolicy), null);
  assert.equal(classifyRequestClient({ origin: "http://8.8.8.8:5173" }, localPolicy), null);
});

test("accepts same-origin fetch metadata without relying on a secret browser header", () => {
  assert.equal(classifyRequestClient({ "sec-fetch-site": "same-origin" }, policy), "WEB");
});

test("validates native client ID and key using the configured SHA-256 hash", () => {
  assert.equal(
    classifyRequestClient(
      { "x-pli-client-id": "pli-mobile-v1", "x-pli-client-key": nativeKey },
      policy,
    ),
    "NATIVE",
  );
  assert.equal(
    classifyRequestClient(
      { "x-pli-client-id": "pli-mobile-v1", "x-pli-client-key": "wrong" },
      policy,
    ),
    null,
  );
  assert.equal(classifyRequestClient({ "x-pli-client-id": "pli-mobile-v1" }, policy), null);
  assert.equal(
    classifyRequestClient({ "x-pli-client-id": "unknown", "x-pli-client-key": nativeKey }, policy),
    null,
  );
});

test("permits headerless local tools only when provenance enforcement is disabled", () => {
  assert.equal(classifyRequestClient({}, policy), null);
  assert.equal(classifyRequestClient({}, { ...policy, required: false }), "LOCAL_TOOL");
});
