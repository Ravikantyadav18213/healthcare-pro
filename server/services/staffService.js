import bcrypt from "bcryptjs";

import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";

/* ==================================================================
   HOSPITAL STAFF (nurses, receptionists)

   Deliberately a thin layer on top of `users`, not a new table the
   way doctors get one: a nurse or receptionist needs a name, a
   department, and whether they're at the hospital right now — nothing
   like a doctor's qualification/fee/rating. Reusing `users` also means
   staff automatically get everything an account already has for free
   — login, sessions, 2FA, password reset — instead of that being
   rebuilt for a second kind of profile.
================================================================== */

export const STAFF_ROLES = ["nurse", "receptionist"];
export const DUTY_STATUSES = ["On Duty", "Off Duty", "On Leave"];

const findByEmail = db.prepare(`SELECT id FROM users WHERE email = ?`);

const insertStaff = db.prepare(`
  INSERT INTO users
    (name, email, phone, password_hash, role, status, department_id, duty_status)
  VALUES
    (@name, @email, @phone, @password_hash, @role, 'active', @department_id, 'On Duty')
`);

const STAFF_COLUMNS = `
  u.id, u.name, u.email, u.phone, u.role, u.status,
  u.department_id AS departmentId, d.name AS departmentName,
  u.assigned_ward_id AS assignedWardId, w.name AS assignedWardName,
  u.duty_status AS dutyStatus,
  u.last_login AS lastLogin, u.created_at AS createdAt
`;

/**
 * The staff directory. Every nurse and receptionist account, which
 * department, and whether they're on duty — this is the "who is
 * covering what right now" view a front desk actually needs, which
 * the generic admin Users list (built for accounts in general) has
 * no room for.
 */
export async function listStaff({ search = "", role = "", departmentId = "" } = {}) {
  const where = [`u.role IN ('nurse','receptionist')`];
  const params = {};

  if (search) {
    where.push("(u.name LIKE @search OR u.email LIKE @search OR u.phone LIKE @search)");
    params.search = `%${search}%`;
  }

  if (role && STAFF_ROLES.includes(role)) {
    where.push("u.role = @role");
    params.role = role;
  }

  if (departmentId) {
    where.push("u.department_id = @departmentId");
    params.departmentId = Number(departmentId);
  }

  return await db
    .prepare(
      `SELECT ${STAFF_COLUMNS}
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN wards w ON w.id = u.assigned_ward_id
        WHERE ${where.join(" AND ")}
        ORDER BY u.name COLLATE NOCASE`
    )
    .all(params);
}

export async function staffStats() {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN role = 'nurse' THEN 1 ELSE 0 END) AS nurses,
         SUM(CASE WHEN role = 'receptionist' THEN 1 ELSE 0 END) AS receptionists,
         SUM(CASE WHEN duty_status = 'On Duty' THEN 1 ELSE 0 END) AS onDuty,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS disabled
       FROM users
      WHERE role IN ('nurse','receptionist')`
    )
    .get();

  return {
    total: row.total || 0,
    nurses: row.nurses || 0,
    receptionists: row.receptionists || 0,
    onDuty: row.onDuty || 0,
    disabled: row.disabled || 0,
  };
}

async function getStaffOrThrow(id) {
  const row = await db
    .prepare(
      `SELECT ${STAFF_COLUMNS}
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN wards w ON w.id = u.assigned_ward_id
        WHERE u.id = ? AND u.role IN ('nurse','receptionist')`
    )
    .get(Number(id));

  if (!row) throw ApiError.notFound("Staff member not found.");
  return row;
}

/**
 * Create a nurse or receptionist account.
 *
 * Staff sign in the same way a patient or doctor does — this is the
 * admin-side equivalent of /auth/register, just for the two roles a
 * patient can never pick for themselves.
 */
export async function createStaff({ name, email, phone, password, role, departmentId }) {
  if (!STAFF_ROLES.includes(role)) {
    throw ApiError.badRequest(`Role must be one of: ${STAFF_ROLES.join(", ")}.`);
  }

  const cleanEmail = String(email).trim().toLowerCase();

  if (await findByEmail.get(cleanEmail)) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);

  const result = await insertStaff.run({
    name: String(name).trim(),
    email: cleanEmail,
    phone: phone ? String(phone).trim() : null,
    password_hash: passwordHash,
    role,
    department_id: departmentId ? Number(departmentId) : null,
  });

  return await getStaffOrThrow(result.lastInsertRowid);
}

/** Reassign which department a staff member covers, or unassign with null. */
export async function setStaffDepartment(id, departmentId) {
  await getStaffOrThrow(id);

  await db
    .prepare(`UPDATE users SET department_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(departmentId ? Number(departmentId) : null, Number(id));

  return await getStaffOrThrow(id);
}

/** Reassign which ward a nurse is responsible for, or unassign with
    null (an unassigned nurse sees every ward). Receptionists have no
    ward — the front desk isn't attached to one. */
export async function setStaffWard(id, wardId) {
  const staff = await getStaffOrThrow(id);

  if (staff.role !== "nurse") {
    throw ApiError.badRequest("Only nurses can be assigned to a ward.");
  }

  await db
    .prepare(`UPDATE users SET assigned_ward_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(wardId ? Number(wardId) : null, Number(id));

  return await getStaffOrThrow(id);
}

/** On Duty / Off Duty / On Leave — whether they're actually here right now. */
export async function setStaffDuty(id, dutyStatus) {
  if (!DUTY_STATUSES.includes(dutyStatus)) {
    throw ApiError.badRequest(`Duty status must be one of: ${DUTY_STATUSES.join(", ")}.`);
  }

  await getStaffOrThrow(id);

  await db
    .prepare(`UPDATE users SET duty_status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(dutyStatus, Number(id));

  return await getStaffOrThrow(id);
}

export default {
  STAFF_ROLES,
  DUTY_STATUSES,
  listStaff,
  staffStats,
  createStaff,
  setStaffDepartment,
  setStaffWard,
  setStaffDuty,
};
