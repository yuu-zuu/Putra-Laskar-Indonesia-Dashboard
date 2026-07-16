import type { IncomingMessage } from "node:http";
import { AppError } from "../lib/errors.js";

export async function readJson(request: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== "application/json" && !mediaType.endsWith("+json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan Content-Type application/json.");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Payload terlalu besar.");
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_JSON", "Body JSON tidak valid.");
  }
}

export async function readBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const rawLength = request.headers["content-length"];
  const declaredLength = rawLength === undefined ? null : Number(rawLength);
  if (
    declaredLength !== null &&
    (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maxBytes)
  ) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Payload terlalu besar.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Payload terlalu besar.");
    chunks.push(buffer);
  }
  if (size === 0) throw new AppError(422, "EMPTY_FILE", "Berkas avatar kosong.");
  return Buffer.concat(chunks);
}

export function queryParam(url: URL, name: string, required = true): string | null {
  const value = url.searchParams.get(name);
  if (required && (value === null || value.trim() === "")) {
    throw new AppError(422, "MISSING_QUERY_PARAMETER", `Query parameter ${name} wajib diisi.`, {
      [name]: "Wajib diisi.",
    });
  }
  if (value !== null && value.length > 1_000) {
    throw new AppError(
      422,
      "QUERY_PARAMETER_TOO_LONG",
      `Query parameter ${name} terlalu panjang.`,
      {
        [name]: "Maksimal 1.000 karakter.",
      },
    );
  }
  return value;
}
