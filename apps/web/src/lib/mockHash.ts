export async function hashMockPassword(value: string): Promise<string> {
  if (typeof window.crypto?.subtle?.digest === "function" && window.TextEncoder) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }
  // Demo-only deterministic fallback; production passwords are always hashed by the API.
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `demo-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
