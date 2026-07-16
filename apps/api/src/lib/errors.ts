export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;
  readonly retryable: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
    retryable = false,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.status = status;
    this.code = code;
    if (fieldErrors !== undefined) this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }
}

const conflictCodes = new Set(["23505", "23P01"]);
const validationCodes = new Set(["22001", "22003", "22007", "22P02", "23502", "23503", "23514"]);
const retryableTransactionCodes = new Set(["40001", "40P01"]);
const unavailableCodes = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08P01",
  "53300",
  "57014",
  "57P01",
  "57P02",
  "57P03",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof URIError) {
    return new AppError(400, "INVALID_PATH", "Path request tidak valid.", undefined, false, error);
  }
  const code = databaseCode(error);
  if (code !== null && conflictCodes.has(code))
    return new AppError(
      409,
      "RESOURCE_CONFLICT",
      "Data yang sama sudah tersimpan. Muat ulang lalu periksa data terbaru.",
    );
  if (code !== null && validationCodes.has(code))
    return new AppError(
      422,
      "DATABASE_VALIDATION_ERROR",
      "Data tidak memenuhi aturan operasional.",
    );
  if (code !== null && retryableTransactionCodes.has(code))
    return new AppError(
      409,
      "TRANSACTION_RETRY_REQUIRED",
      "Data berubah bersamaan. Silakan kirim ulang.",
      undefined,
      true,
    );
  if (code !== null && unavailableCodes.has(code)) {
    return new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "Layanan sementara tidak tersedia.",
      undefined,
      true,
      error,
    );
  }
  return new AppError(
    500,
    "INTERNAL_ERROR",
    "Terjadi kesalahan internal.",
    undefined,
    false,
    error,
  );
}

export function databaseCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}
