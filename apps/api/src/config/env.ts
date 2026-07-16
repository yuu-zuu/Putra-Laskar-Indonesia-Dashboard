import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if (!isMissingEnvFile(error)) throw error;
}

type NodeEnvironment = "development" | "production" | "test";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === "") {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value.trim();
}

function nodeEnvironment(): NodeEnvironment {
  const value = required("NODE_ENV", "development");
  if (value !== "development" && value !== "production" && value !== "test") {
    throw new Error("Environment variable NODE_ENV must be development, production, or test.");
  }
  return value;
}

function integer(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Environment variable ${name} must be between 1 and ${maximum}.`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Environment variable ${name} must be true or false.`);
}

function portList(name: string, fallback: string): readonly number[] {
  const ports = (process.env[name] ?? fallback)
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10));
  if (
    ports.length === 0 ||
    ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error(`Environment variable ${name} must contain valid comma-separated ports.`);
  }
  return Object.freeze([...new Set(ports)]);
}

function origin(name: string, fallback?: string): string {
  const value = required(name, fallback);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.origin;
  } catch {
    throw new Error(`Environment variable ${name} must contain a valid HTTP(S) origin.`);
  }
}

function httpUrl(name: string, fallback?: string): string {
  const value = required(name, fallback);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Environment variable ${name} must contain a valid HTTP(S) URL.`);
  }
}

function postgresUrl(name: string, fallback?: string): string {
  const value = required(name, fallback);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error();
    if (parsed.hostname === "" || parsed.pathname === "" || parsed.pathname === "/")
      throw new Error();
    return value;
  } catch {
    throw new Error(`Environment variable ${name} must contain a valid PostgreSQL URL.`);
  }
}

function cookieName(name: string, fallback: string): string {
  const value = required(name, fallback);
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new Error(`Environment variable ${name} must contain a valid cookie name.`);
  }
  return value;
}

function originList(name: string, fallback: string): readonly string[] {
  const origins = (process.env[name] ?? fallback)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
        return parsed.origin;
      } catch {
        throw new Error(`Environment variable ${name} contains an invalid HTTP(S) origin.`);
      }
    });
  if (origins.length === 0) throw new Error(`Environment variable ${name} must not be empty.`);
  return Object.freeze([...new Set(origins)]);
}

function sha256Map(name: string): Readonly<Record<string, string>> {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return Object.freeze({});
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Environment variable ${name} must be a JSON object.`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Environment variable ${name} must be a JSON object.`);
  }
  const entries = Object.entries(value);
  for (const [clientId, hash] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(clientId)) {
      throw new Error(`Environment variable ${name} contains an invalid client ID.`);
    }
    if (typeof hash !== "string" || !/^[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error(`Environment variable ${name} must contain SHA-256 hex hashes.`);
    }
  }
  return Object.freeze(Object.fromEntries(entries.map(([id, hash]) => [id, hash.toLowerCase()])));
}

const nodeEnv = nodeEnvironment();
const isProduction = nodeEnv === "production";
const webOrigin = origin("WEB_ORIGIN", "http://localhost:5173");

const configuration = {
  nodeEnv,
  isProduction,
  apiHost: required("API_HOST", "0.0.0.0"),
  apiPort: integer("API_PORT", 8787, 65535),
  webOrigin,
  allowedWebOrigins: originList("ALLOWED_WEB_ORIGINS", webOrigin),
  allowPrivateNetworkOrigins: bool("ALLOW_PRIVATE_NETWORK_ORIGINS", false),
  privateNetworkWebPorts: portList("PRIVATE_NETWORK_WEB_PORTS", "5173,4173"),
  requireClientProvenance: bool("REQUIRE_CLIENT_PROVENANCE", isProduction),
  nativeClientKeyHashes: sha256Map("NATIVE_CLIENT_KEY_HASHES"),
  trustProxy: bool("TRUST_PROXY", process.env.VERCEL === "1"),
  databaseUrl: postgresUrl(
    "DATABASE_URL",
    isProduction ? undefined : "postgres://spbu:spbu@localhost:5432/spbu_ops",
  ),
  databasePoolMax: integer("DB_POOL_MAX", isProduction ? 2 : 10, 50),
  databaseConnectionTimeoutMs: integer("DB_CONNECTION_TIMEOUT_MS", 5_000, 30_000),
  databaseQueryTimeoutMs: integer("DB_QUERY_TIMEOUT_MS", 20_000, 120_000),
  databaseStatementTimeoutMs: integer("DB_STATEMENT_TIMEOUT_MS", 15_000, 120_000),
  registrationCodeSecret: required(
    "REGISTRATION_CODE_SECRET",
    isProduction ? undefined : "local-only-change-registration-secret",
  ),
  sessionTtlHours: integer("SESSION_TTL_HOURS", 12, 24 * 30),
  sessionTouchIntervalMinutes: integer("SESSION_TOUCH_INTERVAL_MINUTES", 5, 60),
  sessionCookieName: cookieName("SESSION_COOKIE_NAME", "pli_session"),
  sessionCookieSecure: bool("SESSION_COOKIE_SECURE", isProduction),
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() ?? "",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Mr.Yudhistira",
  allowLocalSeed: bool("ALLOW_LOCAL_SEED", false),
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.APP_RELEASE ?? "local",
  s3: {
    endpoint: httpUrl("S3_ENDPOINT", isProduction ? undefined : "http://localhost:8333"),
    internalEndpoint: httpUrl(
      "S3_INTERNAL_ENDPOINT",
      process.env.S3_ENDPOINT ?? (isProduction ? undefined : "http://localhost:8333"),
    ),
    region: required("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET", isProduction ? undefined : "pli-documents"),
    accessKey: required("S3_ACCESS_KEY", isProduction ? undefined : "pli-local-access"),
    secretKey: required("S3_SECRET_KEY", isProduction ? undefined : "pli-local-secret-change-me"),
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
    expiresInSeconds: integer("S3_PRESIGN_TTL_SECONDS", 900, 3_600),
    requestTimeoutMs: integer("S3_REQUEST_TIMEOUT_MS", 7_500, 25_000),
  },
};

assertProductionConfiguration(configuration);

export const env = Object.freeze({
  ...configuration,
  s3: Object.freeze(configuration.s3),
});

function assertProductionConfiguration(config: typeof configuration): void {
  if (!config.isProduction) return;
  const errors: string[] = [];
  if (!config.sessionCookieSecure) errors.push("SESSION_COOKIE_SECURE must be true");
  if (!config.requireClientProvenance) errors.push("REQUIRE_CLIENT_PROVENANCE must be true");
  if (config.allowPrivateNetworkOrigins) errors.push("ALLOW_PRIVATE_NETWORK_ORIGINS must be false");
  if (config.allowLocalSeed) errors.push("ALLOW_LOCAL_SEED must be false");
  if (Buffer.byteLength(config.registrationCodeSecret, "utf8") < 32)
    errors.push("REGISTRATION_CODE_SECRET must contain at least 32 bytes");
  if (!config.webOrigin.startsWith("https://")) errors.push("WEB_ORIGIN must use HTTPS");
  if (config.allowedWebOrigins.some((value) => !value.startsWith("https://")))
    errors.push("ALLOWED_WEB_ORIGINS must contain HTTPS origins only");
  if (!config.allowedWebOrigins.includes(config.webOrigin))
    errors.push("ALLOWED_WEB_ORIGINS must include WEB_ORIGIN");
  if (!config.sessionCookieName.startsWith("__Host-"))
    errors.push("SESSION_COOKIE_NAME must use the __Host- prefix");
  if (!config.s3.endpoint.startsWith("https://")) errors.push("S3_ENDPOINT must use HTTPS");
  if (!config.s3.internalEndpoint.startsWith("https://"))
    errors.push("S3_INTERNAL_ENDPOINT must use HTTPS");
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join("; ")}.`);
  }
}

function isMissingEnvFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
