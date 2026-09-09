import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { adminUser } from "../utils/sanitize.js";
import { revokeAllSessions } from "./tokenService.js";

/*
 * Every projection here selects explicit columns.
 * password_hash is never included in any admin-facing query.
 */

const BASE_COLUMNS = `
  u.id, u.name, u.email, u.phone, u.role, u.status,
  u.date_of_birth, u.gender, u.last_login, u.login_count,
  u.failed_login_attempts, u.created_at
`;

export function listUsers({ search = "", status = "", role = "" } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(u.name LIKE @search OR u.email LIKE @search OR u.phone LIKE @search)");
    params.search = `%${search}%`;
  }

  if (status && status !== "all") {
    where.push("u.status = @status");
    params.status = status;
  }

  if (role && role !== "all") {
    where.push("u.role = @role");
    params.role = role;
  }

  const sql = `
    SELECT ${BASE_COLUMNS},
           (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) AS appointment_count,
           (SELECT COUNT(*) FROM reports r      WHERE r.user_id = u.id) AS report_count
      FROM users u
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY u.created_at DESC
  `;

  return db.prepare(sql).all(params).map(adminUser);
}

export function getUserById(id) {
  const row = db
    .prepare(
      `SELECT ${BASE_COLUMNS},
              (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) AS appointment_count,
              (SELECT COUNT(*) FROM reports r      WHERE r.user_id = u.id) AS report_count
         FROM users u WHERE u.id = ?`
    )
    .get(Number(id));

  if (!row) throw ApiError.notFound("User not found.");
  return adminUser(row);
}

export function userStats() {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive,
         SUM(CASE WHEN role   = 'admin'    THEN 1 ELSE 0 END) AS admins,
         SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS newThisWeek,
         COALESCE(SUM(login_count), 0)           AS totalLogins,
         COALESCE(SUM(failed_login_attempts), 0) AS failedLogins
       FROM users`
    )
    .get();

  const problems = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_logs
        WHERE action IN ('login_failed','register_failed','access_denied')`
    )
    .get().n;

  return {
    totalUsers: row.total || 0,
    activeUsers: row.active || 0,
    inactiveUsers: row.inactive || 0,
    admins: row.admins || 0,
    newThisWeek: row.newThisWeek || 0,
    totalLogins: row.totalLogins || 0,
    failedLogins: row.failedLogins || 0,
    totalProblems: problems || 0,
  };
}

export function setUserStatus(actor, id, status) {
  if (!["active", "inactive"].includes(status)) {
    throw ApiError.badRequest("Status must be 'active' or 'inactive'.");
  }

  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(id));
  if (!target) throw ApiError.notFound("User not found.");

  if (target.id === actor.id) {
    throw ApiError.badRequest("You cannot change the status of your own account.");
  }

  if (target.role === "admin" && status === "inactive") {
    const otherAdmins = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users
          WHERE role = 'admin' AND status = 'active' AND id != ?`
      )
      .get(target.id).n;

    if (otherAdmins === 0) {
      throw ApiError.conflict("The last active administrator cannot be deactivated.");
    }
  }

  db.prepare(
    `UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, Number(id));

  /* A deactivated account must lose its live sessions immediately. */
  if (status === "inactive") {
    revokeAllSessions(Number(id));
  }

  return getUserById(id);
}

/** Appointment + report history for the admin user drawer. */
export function userHistory(id) {
  const appointments = db
    .prepare(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.status, a.reason,
              d.name AS doctor_name, dep.name AS department_name
         FROM appointments a
         LEFT JOIN doctors     d   ON d.id  = a.doctor_id
         LEFT JOIN departments dep ON dep.id = a.department_id
        WHERE a.user_id = ?
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
        LIMIT 50`
    )
    .all(Number(id));

  const reports = db
    .prepare(
      `SELECT id, title, type, status, report_date
         FROM reports WHERE user_id = ?
        ORDER BY report_date DESC LIMIT 50`
    )
    .all(Number(id));

  return {
    appointments: appointments.map((row) => ({
      id: row.id,
      date: row.appointment_date,
      time: row.appointment_time,
      status: row.status,
      reason: row.reason,
      doctorName: row.doctor_name,
      department: row.department_name,
    })),
    reports: reports.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      reportDate: row.report_date,
    })),
  };
}
