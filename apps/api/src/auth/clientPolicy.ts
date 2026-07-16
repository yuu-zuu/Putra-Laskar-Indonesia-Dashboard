import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export interface ClientAccessPolicy {
  allowedWebOrigins: readonly string[];
  allowPrivateNetworkOrigins: boolean;
  privateNetworkWebPorts: readonly number[];
  nativeClientKeyHashes: Readonly<Record<string, string>>;
  required: boolean;
}

export type RequestClientKind = "WEB" | "NATIVE" | "LOCAL_TOOL";

export function classifyRequestClient(
  headers: IncomingHttpHeaders,
  policy: ClientAccessPolicy,
): RequestClientKind | null {
  const origin = headerValue(headers.origin);
  if (origin !== undefined) {
    return isAllowedWebOriginForPolicy(origin, policy) ? "WEB" : null;
  }

  if (headerValue(headers["sec-fetch-site"]) === "same-origin") return "WEB";

  const clientId = headerValue(headers["x-pli-client-id"]);
  const clientKey = headerValue(headers["x-pli-client-key"]);
  if (clientId !== undefined || clientKey !== undefined) {
    if (clientId === undefined || clientKey === undefined || clientKey.length > 512) return null;
    const expectedHash = policy.nativeClientKeyHashes[clientId];
    if (expectedHash === undefined) return null;
    return hashMatches(clientKey, expectedHash) ? "NATIVE" : null;
  }

  return policy.required ? null : "LOCAL_TOOL";
}

export function isAllowedWebOriginForPolicy(
  origin: string,
  policy: Pick<
    ClientAccessPolicy,
    "allowedWebOrigins" | "allowPrivateNetworkOrigins" | "privateNetworkWebPorts"
  >,
): boolean {
  const normalized = normalizedOrigin(origin);
  if (normalized === null) return false;
  if (policy.allowedWebOrigins.includes(normalized)) return true;
  return (
    policy.allowPrivateNetworkOrigins &&
    isPrivateNetworkWebOrigin(normalized, policy.privateNetworkWebPorts)
  );
}

export function isPrivateNetworkWebOrigin(
  origin: string,
  allowedPorts: readonly number[],
): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    const port = url.port === "" ? 80 : Number.parseInt(url.port, 10);
    if (!allowedPorts.includes(port)) return false;
    return isPrivateNetworkHost(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateNetworkHost(rawHostname: string): boolean {
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname === "::1") return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(hostname) || /^fe[89ab][0-9a-f]:/i.test(hostname)) return true;
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false;
  const [first, second] = octets as [number, number, number, number];
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 127
  );
}

export function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hashMatches(value: string, expectedHex: string): boolean {
  const actual = createHash("sha256").update(value).digest();
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
