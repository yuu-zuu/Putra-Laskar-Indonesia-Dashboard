import type { AppLocale, UserProfile, UserRole } from "@spbu/contracts";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { env } from "../config/env.js";
import { pool } from "../db/client.js";
import { inTransaction } from "../db/transaction.js";
import type { Router } from "../http/router.js";
import { readBytes, readJson } from "../http/request.js";
import { sendJson } from "../http/response.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { browserFacingS3Config, presignObjectUrl } from "../lib/s3Signer.js";
import { createUuid } from "../lib/uuid.js";
import {
  booleanField,
  enumField,
  numberField,
  objectBody,
  stringField,
} from "../lib/validation.js";
import { deleteOwnedObject } from "../services/userObjectCleanupService.js";

const locales = ["id", "en", "zh"] as const;
const avatarTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export function registerProfileRoutes(router: Router): void {
  router.add("GET", "/api/v1/profiles", async ({ request, response }) => {
    await requireUser(request);
    const result = await pool.query<ProfileRow>(
      profileSelect +
        `
      WHERE account.active=true AND account.deleted_at IS NULL ORDER BY account.display_name`,
    );
    sendJson(response, 200, {
      items: result.rows.map((row) => mapProfile(row, request.headers.origin)),
    });
  });
  router.add("GET", "/api/v1/profiles/{id}", async ({ request, response, params }) => {
    await requireUser(request);
    const result = await pool.query<ProfileRow>(
      profileSelect +
        `
      WHERE account.id=$1 AND account.active=true AND account.deleted_at IS NULL`,
      [params.id],
    );
    const row = result.rows[0];
    if (row === undefined)
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profil pengguna tidak ditemukan.");
    sendJson(response, 200, mapProfile(row, request.headers.origin));
  });
  router.add("PATCH", "/api/v1/profiles/me", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const locale = enumField<AppLocale>(body, "locale", locales);
    const avatarObjectKey = stringField(body, "avatarObjectKey", {
      nullable: true,
      max: 500,
    });
    const avatarContentType =
      body.avatarContentType === null ? null : enumField(body, "avatarContentType", avatarTypes);
    const avatarSizeBytes =
      body.avatarSizeBytes === null
        ? null
        : numberField(body, "avatarSizeBytes", { min: 1, max: 512000, integer: true });
    if (avatarObjectKey !== null && !avatarObjectKey.startsWith(`avatar/${user.id}/`))
      throw new AppError(422, "INVALID_AVATAR_KEY", "Object avatar bukan milik pengguna ini.");
    if (
      (avatarObjectKey === null) !== (avatarContentType === null) ||
      (avatarObjectKey === null) !== (avatarSizeBytes === null)
    )
      throw new AppError(422, "INVALID_AVATAR_METADATA", "Metadata avatar tidak lengkap.");
    const displayName = stringField(body, "displayName", {
      min: 2,
      max: 120,
    }) as string;
    const completed = booleanField(body, "onboardingCompleted");
    const updated = await inTransaction(async (client) => {
      const result = await client.query<ProfileRow>(
        `WITH updated AS (UPDATE app_user SET display_name=$2,locale=$3,
        avatar_object_key=$4,avatar_content_type=$5,avatar_size_bytes=$6,
        onboarding_completed_at=CASE WHEN $7 THEN COALESCE(onboarding_completed_at,now()) ELSE NULL END,updated_at=now()
        WHERE id=$1 RETURNING *) SELECT updated.id,updated.employee_id,updated.email::text,updated.display_name,
        updated.role,updated.branch_id,branch.name AS branch_name,updated.locale,updated.avatar_object_key,
        updated.avatar_content_type,updated.avatar_size_bytes,
        updated.created_at::text FROM updated LEFT JOIN branch ON branch.id=updated.branch_id`,
        [
          user.id,
          displayName,
          locale,
          avatarObjectKey,
          avatarContentType,
          avatarSizeBytes,
          completed,
        ],
      );
      const profile = result.rows[0];
      if (profile === undefined) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profil tidak ditemukan.");
      }
      if (displayName !== user.displayName || avatarObjectKey !== user.avatarObjectKey) {
        await writeAudit(
          {
            branchId: user.branchId,
            actorId: user.id,
            action: "UPDATE_PROFILE",
            objectType: "app_user",
            objectId: user.id,
            metadata: {
              before: { displayName: user.displayName, avatarObjectKey: user.avatarObjectKey },
              after: { displayName, avatarObjectKey, avatarContentType, avatarSizeBytes },
            },
          },
          client,
        );
      }
      return profile;
    });
    sendJson(response, 200, mapProfile(updated, request.headers.origin));
  });
  router.add("POST", "/api/v1/profiles/me/avatar", async ({ request, response, requestId }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
    if (
      contentType === undefined ||
      !avatarTypes.includes(contentType as (typeof avatarTypes)[number])
    ) {
      throw new AppError(
        415,
        "INVALID_AVATAR_FILE",
        "Avatar harus PNG, JPEG, atau WebP dan maksimal 500 KB.",
      );
    }
    const bytes = await readBytes(request, 512_000);
    if (!hasAvatarSignature(bytes, contentType)) {
      throw new AppError(
        422,
        "INVALID_AVATAR_CONTENT",
        "Isi berkas tidak sesuai dengan tipe gambar yang dipilih.",
      );
    }
    const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const now = new Date();
    const objectKey = [
      "avatar",
      user.id,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      `${createUuid()}.${extension}`,
    ].join("/");
    const putUrl = presignObjectUrl(
      { ...env.s3, endpoint: env.s3.internalEndpoint },
      {
        method: "PUT",
        objectKey,
        expiresInSeconds: env.s3.expiresInSeconds,
        now,
      },
    );
    let stored: Response;
    try {
      stored = await fetch(putUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: Uint8Array.from(bytes).buffer,
        signal: AbortSignal.timeout(env.s3.requestTimeoutMs),
      });
    } catch {
      throw new AppError(
        502,
        "AVATAR_STORAGE_UNAVAILABLE",
        "Penyimpanan foto sedang tidak dapat dijangkau.",
        undefined,
        true,
      );
    }
    if (!stored.ok) {
      throw new AppError(
        502,
        "AVATAR_STORAGE_FAILED",
        "Foto profil gagal disimpan.",
        undefined,
        true,
      );
    }
    let updated: ProfileRow;
    try {
      updated = await inTransaction(async (client) => {
        const result = await client.query<ProfileRow>(
          `WITH updated AS (UPDATE app_user SET avatar_object_key=$2,avatar_content_type=$3,
           avatar_size_bytes=$4,updated_at=now() WHERE id=$1 RETURNING *)
           SELECT updated.id,updated.employee_id,updated.email::text,updated.display_name,
           updated.role,updated.branch_id,branch.name AS branch_name,updated.locale,
           updated.avatar_object_key,updated.avatar_content_type,updated.avatar_size_bytes,
           updated.created_at::text FROM updated LEFT JOIN branch ON branch.id=updated.branch_id`,
          [user.id, objectKey, contentType, bytes.byteLength],
        );
        const row = result.rows[0];
        if (row === undefined)
          throw new AppError(404, "PROFILE_NOT_FOUND", "Profil tidak ditemukan.");
        await writeAudit(
          {
            branchId: user.branchId,
            actorId: user.id,
            action: "UPDATE_PROFILE",
            objectType: "app_user",
            objectId: user.id,
            requestId,
            metadata: {
              changed: "avatar",
              before: { avatarObjectKey: user.avatarObjectKey },
              after: {
                avatarObjectKey: objectKey,
                avatarContentType: contentType,
                avatarSizeBytes: bytes.byteLength,
              },
            },
          },
          client,
        );
        return row;
      });
    } catch (error) {
      await deleteOwnedObject(user.id, objectKey).catch((cleanupError) =>
        logAvatarCleanupFailure(requestId, objectKey, cleanupError),
      );
      throw error;
    }
    if (user.avatarObjectKey !== null && user.avatarObjectKey !== objectKey) {
      await deleteOwnedObject(user.id, user.avatarObjectKey).catch((cleanupError) =>
        logAvatarCleanupFailure(requestId, user.avatarObjectKey ?? "", cleanupError),
      );
    }
    sendJson(response, 200, mapProfile(updated, request.headers.origin));
  });
  router.add("PATCH", "/api/v1/profiles/me/onboarding", async ({ request, response }) => {
    assertTrustedOrigin(request);
    const user = await requireUser(request);
    const body = objectBody(await readJson(request));
    const completed = booleanField(body, "completed");
    await pool.query(
      `UPDATE app_user SET onboarding_completed_at=
      CASE WHEN $2 THEN COALESCE(onboarding_completed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1`,
      [user.id, completed],
    );
    sendJson(response, 200, { completed });
  });
}

function logAvatarCleanupFailure(requestId: string, objectKey: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "avatar_cleanup_failed",
      requestId,
      objectKey,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

function hasAvatarSignature(bytes: Buffer, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

const profileSelect = `SELECT account.id,account.employee_id,account.email::text,account.display_name,account.role,
  account.branch_id,branch.name AS branch_name,account.locale,account.avatar_object_key,
  account.avatar_content_type,account.avatar_size_bytes,account.created_at::text
  FROM app_user account LEFT JOIN branch ON branch.id=account.branch_id`;
interface ProfileRow {
  id: string;
  employee_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  branch_id: string | null;
  branch_name: string | null;
  locale: AppLocale;
  avatar_object_key: string | null;
  avatar_content_type: "image/jpeg" | "image/png" | "image/webp" | null;
  avatar_size_bytes: number | null;
  created_at: string;
}
function mapProfile(row: ProfileRow, browserOrigin?: string): UserProfile {
  return {
    id: row.id,
    employeeId: row.employee_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    branchId: row.branch_id,
    branchName: row.branch_name,
    locale: row.locale,
    avatarUrl:
      row.avatar_object_key === null
        ? null
        : presignObjectUrl(browserFacingS3Config(env.s3, browserOrigin), {
            method: "GET",
            objectKey: row.avatar_object_key,
            expiresInSeconds: env.s3.expiresInSeconds,
          }),
    avatarObjectKey: row.avatar_object_key,
    avatarContentType: row.avatar_content_type,
    avatarSizeBytes: row.avatar_size_bytes,
    createdAt: row.created_at,
  };
}
