import assert from "node:assert/strict";

globalThis.window = {
  crypto: {
    randomUUID() {
      throw new Error("The client ID generator must not call randomUUID.");
    },
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
    },
  },
};
const { createClientId } = await import("../apps/web/src/lib/id.ts");
const cryptoFallbackId = createClientId();
assert.match(
  cryptoFallbackId,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

globalThis.window = {};
const pseudoFallbackId = createClientId();
assert.match(
  pseudoFallbackId,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

globalThis.window = { AbortController: undefined, setTimeout, clearTimeout };
const { createRequestAbort } = await import("../apps/web/src/lib/abort.ts");
const abortFallback = createRequestAbort(undefined, 10);
assert.equal(abortFallback.signal, undefined);
assert.equal(abortFallback.didTimeout(), false);
abortFallback.cleanup();

globalThis.window = {
  get localStorage() {
    throw new DOMException("Blocked", "SecurityError");
  },
};
const { safeStorage } = await import("../apps/web/src/lib/storage.ts");
assert.equal(safeStorage.setItem("compatibility-smoke", "available"), false);
assert.equal(safeStorage.getItem("compatibility-smoke"), "available");
safeStorage.removeItem("compatibility-smoke");
assert.equal(safeStorage.getItem("compatibility-smoke"), null);

console.info("Browser compatibility smoke passed.");
