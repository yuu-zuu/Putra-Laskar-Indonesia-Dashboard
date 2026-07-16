import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { presignObjectUrl } from "../lib/s3Signer.js";

const ownedScopes = ["avatar", "opname", "supply", "adjustment", "report"] as const;

export async function deleteUserObjects(userId: string): Promise<number> {
  const counts = await Promise.all(ownedScopes.map((scope) => deletePrefix(`${scope}/${userId}/`)));
  return counts.reduce((total, count) => total + count, 0);
}

export async function deleteOwnedObject(userId: string, objectKey: string): Promise<void> {
  if (!ownedScopes.some((scope) => objectKey.startsWith(`${scope}/${userId}/`))) {
    throw new AppError(422, "INVALID_OBJECT_OWNER", "Object bukan milik pengguna ini.");
  }
  await storageRequest("DELETE", objectKey);
}

async function deletePrefix(prefix: string): Promise<number> {
  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const query: Record<string, string> = { "list-type": "2", prefix };
    if (continuationToken !== undefined) query["continuation-token"] = continuationToken;
    const response = await storageRequest("GET", "", query);
    const xml = await response.text();
    const keys = xmlValues(xml, "Key");
    for (let offset = 0; offset < keys.length; offset += 8) {
      const batch = keys.slice(offset, offset + 8);
      await Promise.all(batch.map((key) => storageRequest("DELETE", key)));
      deleted += batch.length;
    }
    continuationToken =
      xmlValue(xml, "IsTruncated") === "true" ? xmlValue(xml, "NextContinuationToken") : undefined;
    if (xmlValue(xml, "IsTruncated") === "true" && continuationToken === undefined) {
      throw storageError();
    }
  } while (continuationToken !== undefined);
  return deleted;
}

async function storageRequest(
  method: "DELETE" | "GET",
  objectKey: string,
  query?: Readonly<Record<string, string>>,
): Promise<Response> {
  const url = presignObjectUrl(
    { ...env.s3, endpoint: env.s3.internalEndpoint },
    {
      method,
      objectKey,
      expiresInSeconds: env.s3.expiresInSeconds,
      ...(query === undefined ? {} : { query }),
    },
  );
  let response: Response;
  try {
    response = await fetch(url, { method, signal: AbortSignal.timeout(env.s3.requestTimeoutMs) });
  } catch {
    throw storageError();
  }
  if (!response.ok) throw storageError();
  return response;
}

function xmlValues(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1] ?? ""));
}

function xmlValue(xml: string, tag: string): string | undefined {
  return xmlValues(xml, tag)[0];
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function storageError(): AppError {
  return new AppError(
    502,
    "ACCOUNT_STORAGE_CLEANUP_FAILED",
    "Berkas akun belum dapat dibersihkan. Penghapusan akun dibatalkan.",
    undefined,
    true,
  );
}
