import type { PresignUploadResponse } from "@spbu/contracts";
import { env } from "../config/env.js";
import type { Router } from "../http/router.js";
import { readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { browserFacingS3Config, presignObjectUrl } from "../lib/s3Signer.js";
import { enumField, objectBody, stringField } from "../lib/validation.js";
import { numberField } from "../lib/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { createUuid } from "../lib/uuid.js";

const scopes = ["opname", "supply", "adjustment", "report"] as const;
const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function registerUploadRoutes(router: Router): void {
  router.add("POST", "/api/v1/uploads/presign", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const fileName = stringField(body, "fileName", { max: 180 }) as string;
    const contentType = stringField(body, "contentType", { max: 150 }) as string;
    const fileSize = numberField(body, "fileSize", { min: 1, max: 20_000_000, integer: true });
    const scope = enumField(body, "scope", scopes);
    if (!allowedTypes.has(contentType)) {
      throw new AppError(422, "UNSUPPORTED_FILE_TYPE", "Tipe file tidak diizinkan.");
    }

    const now = new Date();
    const safeName = sanitizeFileName(fileName);
    const objectKey = [
      scope,
      user.id,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      `${createUuid()}-${safeName}`,
    ].join("/");
    const putUrl = presignObjectUrl(browserFacingS3Config(env.s3, request.headers.origin), {
      method: "PUT",
      objectKey,
      expiresInSeconds: env.s3.expiresInSeconds,
      now,
    });
    const result: PresignUploadResponse = {
      objectKey,
      putUrl,
      expiresAt: new Date(now.getTime() + env.s3.expiresInSeconds * 1_000).toISOString(),
      headers: { "content-type": contentType },
    };
    await writeAudit({
      branchId: user.branchId,
      actorId: user.id,
      action: "PRESIGN_UPLOAD",
      objectType: "s3_object",
      objectId: objectKey,
      metadata: { scope, fileName: safeName, contentType, fileSize },
    });
    sendJson(response, 201, result);
  });
}

function sanitizeFileName(fileName: string): string {
  return (
    fileName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "file"
  );
}
