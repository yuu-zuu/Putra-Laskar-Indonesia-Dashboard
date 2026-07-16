import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const cost = 16_384;
const blockSize = 8;
const parallelization = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    cost,
    blockSize,
    parallelization,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] =
    encoded.split("$");
  if (algorithm !== "scrypt" || rawSalt === undefined || rawHash === undefined) return false;
  const parameters = [rawCost, rawBlockSize, rawParallelization].map(Number);
  if (parameters.some((value) => !Number.isSafeInteger(value) || value <= 0)) return false;
  const [storedCost, storedBlockSize, storedParallelization] = parameters as [
    number,
    number,
    number,
  ];
  const expected = Buffer.from(rawHash, "base64url");
  const actual = await derive(password, Buffer.from(rawSalt, "base64url"), expected.length, {
    N: storedCost,
    r: storedBlockSize,
    p: storedParallelization,
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function derive(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derivedKey) => {
      if (error !== null) reject(error);
      else resolve(derivedKey);
    });
  });
}
