import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("scrypt password hashes are salted and verifiable", async () => {
  const first = await hashPassword("StrongPassword2026");
  const second = await hashPassword("StrongPassword2026");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("StrongPassword2026", first), true);
  assert.equal(await verifyPassword("WrongPassword2026", first), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
  assert.equal(await verifyPassword("anything", "argon2$1$1$1$salt$hash"), false);
  assert.equal(await verifyPassword("anything", "scrypt$bad$8$1$salt$hash"), false);
  assert.equal(await verifyPassword("anything", "scrypt$0$8$1$salt$hash"), false);
});

test("rejects password parameters that exceed the fixed memory safety bound", async () => {
  const unsafe = `scrypt$1048576$8$1$c2FsdA$${Buffer.alloc(64).toString("base64url")}`;
  await assert.rejects(() => verifyPassword("password", unsafe));
});
