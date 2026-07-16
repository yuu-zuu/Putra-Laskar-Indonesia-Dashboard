import assert from "node:assert/strict";
import test from "node:test";
import { updateAccountAssignmentSql } from "./accountAssignment.js";

test("account assignment updates only role, branch, and timestamp", () => {
  assert.match(updateAccountAssignmentSql, /SET role=\$2,branch_id=\$3,updated_at=now\(\)/);
  const setClause = /SET ([\s\S]+?) WHERE/.exec(updateAccountAssignmentSql)?.[1] ?? "";
  assert.doesNotMatch(setClause, /password_hash|employee_id|email|display_name/i);
});
