/** Shared by the route and its database regression test to prevent SQL drift. */
export const updateAccountAssignmentSql = `WITH updated AS (
  UPDATE app_user SET role=$2,branch_id=$3,updated_at=now() WHERE id=$1 RETURNING *
) SELECT updated.id,updated.employee_id,updated.email::text,updated.display_name,
  updated.role,updated.branch_id,branch.name AS branch_name,updated.created_at::text
FROM updated LEFT JOIN branch ON branch.id=updated.branch_id`;
