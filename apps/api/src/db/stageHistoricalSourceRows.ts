import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";

import { closePool, pool } from "./client.js";

interface SourceRef {
  file: string;
  sheet: string;
  row: number;
}

interface SourceRow {
  key: string;
  branchCode: string;
  stockUnitCode: string;
  meterUnitCode: string;
  businessDate: string;
  shiftCode: string;
  status: "INCOMPLETE_SOURCE" | "FUTURE_TEMPLATE";
  blockingReasons: string[];
  raw: Record<string, unknown>;
  sourceFormulas: Record<string, unknown>;
  trustedForPosting: Record<string, boolean>;
  source: SourceRef;
}

interface SourcePayload {
  version: number;
  name: string;
  timezone: string;
  sourceFiles: Array<{ name: string; sha256: string }>;
  counts: {
    rows: number;
    incompleteSource: number;
    futureTemplate: number;
  };
  rows: SourceRow[];
}


interface BranchMapUnit {
  sourceBranchCode: string;
  existingBranchName: string;
  stockUnitCode: string;
}

interface BranchMapConfig {
  version: number;
  units: BranchMapUnit[];
}

interface Options {
  file: string;
  actorEmail: string;
  branchMapFile: string;
  apply: boolean;
}

interface ResolvedTarget {
  branchId: string;
  stockUnitId: string;
  meterUnitId: string | null;
}

const DEFAULT_FILE = "database/imports/historical-source-rows-2026-07-16-to-31.json";
const DEFAULT_BRANCH_MAP_FILE = "database/imports/historical-master-bootstrap.json";
const LOCK_ID = 704_320_004;
const options = parseOptions(process.argv.slice(2));

try {
  await run(options);
} finally {
  await closePool();
}

async function run(input: Options): Promise<void> {
  const bytes = await readFile(input.file);
  const payload = JSON.parse(bytes.toString("utf8")) as SourcePayload;
  const branchMap = await readBranchMapConfig(input.branchMapFile);
  validatePayload(payload);
  validateBranchMapCoverage(branchMap, payload.rows);
  const payloadFingerprint = createHash("sha256").update(bytes).digest("hex");
  const sourceFingerprint = payload.sourceFiles[0]?.sha256;
  if (sourceFingerprint === undefined) throw new Error("Payload tidak memiliki fingerprint workbook.");

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await ensureMigration(client);
    const actorId = await resolveActor(client, input.actorEmail);
    const targets = await resolveTargets(client, payload.rows, branchMap);

    await client.query("BEGIN");
    try {
      let inserted = 0;
      let existing = 0;
      for (const row of payload.rows) {
        const target = targets.get(`${row.branchCode}/${row.stockUnitCode}`);
        if (target === undefined) throw new Error(`Target tidak ditemukan untuk ${row.key}.`);
        const result = await client.query(
          `INSERT INTO historical_source_row
            (source_fingerprint,row_key,branch_id,stock_unit_id,meter_unit_id,business_date,shift_code,
             source_status,blocking_reasons,raw_data,source_formulas,trust_metadata,
             source_file,source_sheet,source_row,staged_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
           ON CONFLICT (source_fingerprint,row_key) DO NOTHING
           RETURNING id`,
          [
            sourceFingerprint,
            row.key,
            target.branchId,
            target.stockUnitId,
            target.meterUnitId,
            row.businessDate,
            row.shiftCode,
            row.status,
            row.blockingReasons,
            JSON.stringify(row.raw),
            JSON.stringify(row.sourceFormulas),
            JSON.stringify(row.trustedForPosting),
            row.source.file,
            row.source.sheet,
            row.source.row,
            actorId,
          ],
        );
        if (result.rows[0] === undefined) existing += 1;
        else inserted += 1;
      }

      await client.query(
        `INSERT INTO audit_log
          (actor_id,action,object_type,object_id,reason,metadata,occurred_at,outcome,impact_scope)
         VALUES($1,'IMPORT','historical_source_row',$2,$3,$4::jsonb,now(),'SUCCEEDED','SHARED')`,
        [
          actorId,
          payloadFingerprint,
          "Staging baris workbook yang belum lengkap atau masih berupa template masa depan; tidak ada transaksi yang diposting.",
          JSON.stringify({
            payloadName: payload.name,
            payloadFingerprint,
            sourceFingerprint,
            inserted,
            existing,
            counts: payload.counts,
          }),
        ],
      );

      if (input.apply) await client.query("COMMIT");
      else await client.query("ROLLBACK");

      console.info(
        JSON.stringify({
          event: input.apply ? "historical_source_rows_staged" : "historical_source_rows_dry_run",
          inserted,
          existing,
          payloadFingerprint,
        }),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

async function ensureMigration(client: PoolClient): Promise<void> {
  const result = await client.query<{ source_table: string | null }>(
    "SELECT to_regclass('historical_source_row')::text AS source_table",
  );
  if (result.rows[0]?.source_table === null) {
    throw new Error("Migration 008_historical_source_and_cost_reconciliation.sql belum dijalankan.");
  }
}

async function resolveActor(client: PoolClient, email: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM app_user WHERE lower(email)=lower($1) AND revoked_at IS NULL",
    [email],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`Akun actor aktif tidak ditemukan: ${email}`);
  return id;
}

async function resolveTargets(
  client: PoolClient,
  rows: SourceRow[],
  branchMap: BranchMapConfig,
): Promise<Map<string, ResolvedTarget>> {
  const requirements = new Map<
    string,
    { branchCode: string; stockUnitCode: string; meterCodes: Set<string> }
  >();
  for (const row of rows) {
    const key = `${row.branchCode}/${row.stockUnitCode}`;
    const current = requirements.get(key) ?? {
      branchCode: row.branchCode,
      stockUnitCode: row.stockUnitCode,
      meterCodes: new Set<string>(),
    };
    current.meterCodes.add(row.meterUnitCode);
    requirements.set(key, current);
  }

  const result = new Map<string, ResolvedTarget>();
  for (const [key, requirement] of requirements) {
    const existingBranchName = branchNameForSource(branchMap, requirement.branchCode);
    const branch = await client.query<{ id: string; code: string; name: string }>(
      `SELECT id,code,name FROM branch
       WHERE (
         lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) =
           lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
         OR lower(regexp_replace(btrim(code), '[[:space:]]+', ' ', 'g')) =
           lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
         OR lower(regexp_replace(btrim(name || ' - ' || code), '[[:space:]]+', ' ', 'g')) =
           lower(regexp_replace(btrim($1), '[[:space:]]+', ' ', 'g'))
       )
         AND active=true
       ORDER BY id`,
      [existingBranchName],
    );
    if (branch.rows.length !== 1) {
      throw new Error(
        branch.rows.length === 0
          ? `Branch production untuk source ${requirement.branchCode} tidak ditemukan dengan nama, kode, atau label: ${existingBranchName}.`
          : `Identifier branch production ambigu untuk source ${requirement.branchCode}: ${existingBranchName}.`,
      );
    }
    const branchRow = requiredRow(branch.rows[0], `branch ${existingBranchName}`);
    const stock = await client.query<{ id: string }>(
      `SELECT id FROM stock_unit
       WHERE branch_id=$1 AND code=$2 AND active=true`,
      [branchRow.id, requirement.stockUnitCode],
    );
    if (stock.rows.length !== 1) {
      throw new Error(
        `Master stock unit belum lengkap: source ${key} -> ${branchRow.name} (${branchRow.code})/${requirement.stockUnitCode}.`,
      );
    }
    const stockUnitId = requiredRow(stock.rows[0], `stock unit ${key}`).id;

    if (requirement.meterCodes.size !== 1) {
      throw new Error(`Mapping meter ambigu untuk ${key}: ${[...requirement.meterCodes].join(", ")}`);
    }
    const meterCode = [...requirement.meterCodes][0];
    const meter = await client.query<{ id: string }>(
      "SELECT id FROM meter_unit WHERE branch_id=$1 AND code=$2 AND active=true",
      [branchRow.id, meterCode],
    );
    if (meter.rows.length !== 1) {
      throw new Error(
        `Master meter belum ada atau ambigu: source ${requirement.branchCode}/${meterCode} ` +
          `pada ${branchRow.name} (${branchRow.code}).`,
      );
    }
    result.set(key, {
      branchId: branchRow.id,
      stockUnitId,
      meterUnitId: requiredRow(meter.rows[0], `meter ${key}`).id,
    });
  }
  return result;
}

async function readBranchMapConfig(path: string): Promise<BranchMapConfig> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as BranchMapConfig;
  if (parsed.version !== 2 || !Array.isArray(parsed.units)) {
    throw new Error(
      "Branch map config tidak valid. Gunakan historical-master-bootstrap.json version 2.",
    );
  }
  for (const unit of parsed.units) {
    if (
      typeof unit.sourceBranchCode !== "string" ||
      unit.sourceBranchCode.trim() === "" ||
      typeof unit.existingBranchName !== "string" ||
      unit.existingBranchName.trim() === "" ||
      typeof unit.stockUnitCode !== "string" ||
      unit.stockUnitCode.trim() === ""
    ) {
      throw new Error(`Branch map unit tidak valid: ${JSON.stringify(unit)}.`);
    }
  }
  return parsed;
}

function validateBranchMapCoverage(config: BranchMapConfig, rows: SourceRow[]): void {
  const required = new Set(rows.map((row) => `${row.branchCode}/${row.stockUnitCode}`));
  const configured = new Set(
    config.units.map((unit) => `${unit.sourceBranchCode}/${unit.stockUnitCode}`),
  );
  for (const key of required) {
    if (!configured.has(key)) throw new Error(`Branch map belum memuat ${key}.`);
  }
  const namesBySource = new Map<string, string>();
  for (const unit of config.units) {
    const normalized = normalizeBranchName(unit.existingBranchName);
    const previous = namesBySource.get(unit.sourceBranchCode);
    if (previous !== undefined && previous !== normalized) {
      throw new Error(
        `Source branch ${unit.sourceBranchCode} dipetakan ke lebih dari satu branch production.`,
      );
    }
    namesBySource.set(unit.sourceBranchCode, normalized);
  }
}

function branchNameForSource(config: BranchMapConfig, sourceBranchCode: string): string {
  const names = new Set(
    config.units
      .filter((unit) => unit.sourceBranchCode === sourceBranchCode)
      .map((unit) => normalizeBranchName(unit.existingBranchName)),
  );
  if (names.size !== 1) {
    throw new Error(
      `Source branch ${sourceBranchCode} harus dipetakan ke tepat satu nama branch production.`,
    );
  }
  return requiredRow([...names][0], `branch mapping ${sourceBranchCode}`);
}

function normalizeBranchName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validatePayload(payload: SourcePayload): void {
  if (payload.version !== 1) throw new Error(`Payload version ${payload.version} tidak didukung.`);
  if (payload.rows.length !== payload.counts.rows) throw new Error("Jumlah row payload tidak cocok.");
  const incomplete = payload.rows.filter((row) => row.status === "INCOMPLETE_SOURCE").length;
  const future = payload.rows.filter((row) => row.status === "FUTURE_TEMPLATE").length;
  if (incomplete !== payload.counts.incompleteSource || future !== payload.counts.futureTemplate) {
    throw new Error("Ringkasan status payload tidak cocok.");
  }
  for (const row of payload.rows) {
    if (row.businessDate < "2026-07-16" || row.businessDate > "2026-07-31") {
      throw new Error(`Tanggal di luar cakupan: ${row.key}`);
    }
    if (row.status === "FUTURE_TEMPLATE" && row.businessDate <= "2026-07-23") {
      throw new Error(`Status future tidak konsisten: ${row.key}`);
    }
  }
}

function parseOptions(args: string[]): Options {
  const result: Options = {
    file: DEFAULT_FILE,
    actorEmail: "",
    branchMapFile: DEFAULT_BRANCH_MAP_FILE,
    apply: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--file") result.file = requiredArg(args[++index], "--file");
    else if (arg === "--actor-email") result.actorEmail = requiredArg(args[++index], "--actor-email");
    else if (arg === "--branch-map-file")
      result.branchMapFile = requiredArg(args[++index], "--branch-map-file");
    else throw new Error(`Argumen tidak dikenal: ${arg}`);
  }
  if (result.actorEmail === "") throw new Error("--actor-email wajib diisi.");
  return result;
}

function requiredArg(value: string | undefined, flag: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${flag} membutuhkan nilai.`);
  return value;
}

function requiredRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) throw new Error(message);
  return row;
}
