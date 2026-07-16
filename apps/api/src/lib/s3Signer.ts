import { createHash, createHmac } from "node:crypto";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export interface PresignRequest {
  method: "DELETE" | "GET" | "PUT";
  objectKey: string;
  expiresInSeconds: number;
  query?: Readonly<Record<string, string>>;
  now?: Date;
}

export function presignObjectUrl(config: S3Config, request: PresignRequest): string {
  const now = request.now ?? new Date();
  const amzDate = isoAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const endpoint = new URL(config.endpoint);
  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const canonicalPath = buildCanonicalPath(endpoint.pathname, config, request.objectKey);
  const query = new URLSearchParams(request.query);
  query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  query.set("X-Amz-Credential", `${config.accessKey}/${scope}`);
  query.set("X-Amz-Date", amzDate);
  query.set("X-Amz-Expires", String(request.expiresInSeconds));
  query.set("X-Amz-SignedHeaders", "host");
  const canonicalQuery = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    request.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = signatureKey(config.secretKey, dateStamp, config.region);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const protocol = endpoint.protocol;
  return `${protocol}//${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function browserFacingS3Config(config: S3Config, browserOrigin?: string): S3Config {
  if (browserOrigin === undefined) return config;
  try {
    const endpoint = new URL(config.endpoint);
    const origin = new URL(browserOrigin);
    if (!isLoopbackHost(endpoint.hostname) || isLoopbackHost(origin.hostname)) return config;
    endpoint.hostname = origin.hostname;
    return { ...config, endpoint: endpoint.toString().replace(/\/$/, "") };
  } catch {
    return config;
  }
}

function buildCanonicalPath(endpointPath: string, config: S3Config, objectKey: string): string {
  const prefix = endpointPath.replace(/\/$/, "");
  const segments = [
    ...prefix.split("/").filter(Boolean),
    ...(config.forcePathStyle ? [config.bucket] : []),
    ...objectKey.split("/").filter(Boolean),
  ];
  return `/${segments.map(rfc3986).join("/")}`;
}

function isoAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function signatureKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
