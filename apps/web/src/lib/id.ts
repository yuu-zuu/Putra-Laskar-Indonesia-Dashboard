/** Creates a UUID without relying on secure-context-only browser conveniences. */
export function createClientId(): string {
  const webCrypto = window.crypto;
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    try {
      webCrypto.getRandomValues(bytes);
    } catch {
      fillPseudoRandom(bytes);
    }
  } else {
    fillPseudoRandom(bytes);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fillPseudoRandom(bytes: Uint8Array): void {
  // Only used for correlation/mock IDs. Authentication tokens are generated on the server.
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
}
