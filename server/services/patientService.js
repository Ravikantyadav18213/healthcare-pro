import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { publicPatient } from "../utils/sanitize.js";
import { emitToAdmins } from "../sockets/index.js";

const SELECT_PATIENT = `
  SELECT p.*,
         dep.name AS department_name,
         d.name   AS doctor_name
    FROM patients p
    LEFT JOIN departments dep ON dep.id = p.department_id
    LEFT JOIN doctors     d   ON d.id  = p.doctor_id
`;

const findById = db.prepare(`${SELECT_PATIENT} WHERE p.id = ?`);

export function listPatients({ search = "", departmentId = null, status = "", limit = null } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(p.name LIKE @search OR p.phone LIKE @search OR p.email LIKE @search)");
    params.search = `%${search}%`;
  }

  if (departmentId && departmentId !== "All") {
    where.push("p.department_id = @departmentId");
    params.departmentId = Number(departmentId);
  }

  if (status && status !== "All") {
    where.push("p.status = @status");
    params.status = status;
  }

  /* Capped only when a caller actually asks — the admin list page wants
     everything, while a picker like the discharge-summary form wants a
     bounded dropdown. A bogus value (0, negative, non-numeric) is
     treated as "no cap" rather than silently returning zero rows. */
  const capped = Number(limit);
  if (Number.isFinite(capped) && capped > 0) {
    params.limit = Math.floor(capped);
  }

  const sql = `
    ${SELECT_PATIENT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.created_at DESC
    ${params.limit ? "LIMIT @limit" : ""}
  `;

  return db.prepare(sql).all(params).map(publicPatient);
}

export function getPatient(id) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Patient not found.");
  return publicPatient(row);
}

/** The patient profile linked to a signed-in user account. */
export function getOwnPatient(userId) {
  const row = db
    .prepare(`${SELECT_PATIENT} WHERE p.user_id = ? ORDER BY p.id LIMIT 1`)
    .get(Number(userId));

  return row ? publicPatient(row) : null;
}

function normalise(payload) {
  return {
    name: String(payload.name).trim(),
    phone: payload.phone ? String(payload.phone).trim() : null,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    date_of_birth: payload.dateOfBirth || null,
    gender: payload.gender || null,
    blood_group: payload.bloodGroup || null,
    address: payload.address ? String(payload.address).trim() : null,
    emergency_contact: payload.emergencyContact
      ? String(payload.emergencyContact).trim()
      : null,
    department_id: payload.departmentId ? Number(payload.departmentId) : null,
    doctor_id: payload.doctorId ? Number(payload.doctorId) : null,
    room: payload.room ? String(payload.room).trim() : null,
    status: payload.status || "Stable",
    admitted_at: payload.admittedAt || new Date().toISOString().slice(0, 10),
    medical_history: JSON.stringify(
      Array.isArray(payload.medicalHistory) ? payload.medicalHistory : []
    ),
  };
}

export function createPatient(payload) {
  const data = normalise(payload);

  const result = db
    .prepare(
      `INSERT INTO patients
         (user_id, name, phone, email, date_of_birth, gender, blood_group,
          address, emergency_contact, department_id, doctor_id, room,
          status, admitted_at, medical_history)
       VALUES
         (@user_id, @name, @phone, @email, @date_of_birth, @gender, @blood_group,
          @address, @emergency_contact, @department_id, @doctor_id, @room,
          @status, @admitted_at, @medical_history)`
    )
    .run({ ...data, user_id: payload.userId ? Number(payload.userId) : null });

  /* Moves the Total Patients tile on the dashboard. */
  emitToAdmins("dashboard:stats-changed", { source: "patients" });

  return publicPatient(findById.get(result.lastInsertRowid));
}

export function updatePatient(id, payload) {
  const existing = findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Patient not found.");

  const data = normalise(payload);

  db.prepare(
    `UPDATE patients
        SET name = @name, phone = @phone, email = @email,
            date_of_birth = @date_of_birth, gender = @gender,
            blood_group = @blood_group, address = @address,
            emergency_contact = @emergency_contact,
            department_id = @department_id, doctor_id = @doctor_id,
            room = @room, status = @status, admitted_at = @admitted_at,
            medical_history = @medical_history,
            updated_at = datetime('now')
      WHERE id = @id`
  ).run({ ...data, id: Number(id) });

  /* status can move to/from 'Discharged', which moves the Discharged
     Today tile on the dashboard. */
  emitToAdmins("dashboard:stats-changed", { source: "patients" });

  return publicPatient(findById.get(Number(id)));
}

/** A user may edit only their own contact/medical details. */
export function updateOwnPatient(userId, payload) {
  const existing = db
    .prepare(`SELECT * FROM patients WHERE user_id = ? ORDER BY id LIMIT 1`)
    .get(Number(userId));

  if (!existing) throw ApiError.notFound("No patient profile linked to your account.");

  db.prepare(
    `UPDATE patients
        SET phone = @phone, date_of_birth = @date_of_birth, gender = @gender,
            blood_group = @blood_group, address = @address,
            emergency_contact = @emergency_contact,
            updated_at = datetime('now')
      WHERE id = @id`
  ).run({
    id: existing.id,
    phone: payload.phone ? String(payload.phone).trim() : null,
    date_of_birth: payload.dateOfBirth || null,
    gender: payload.gender || null,
    blood_group: payload.bloodGroup || null,
    address: payload.address ? String(payload.address).trim() : null,
    emergency_contact: payload.emergencyContact
      ? String(payload.emergencyContact).trim()
      : null,
  });

  return publicPatient(findById.get(existing.id));
}

export function deletePatient(id) {
  const existing = findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Patient not found.");

  db.prepare(`DELETE FROM patients WHERE id = ?`).run(Number(id));

  emitToAdmins("dashboard:stats-changed", { source: "patients" });

  return { id: Number(id), name: existing.name };
}

export function patientStats() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'Critical' THEN 1 ELSE 0 END) AS critical,
              SUM(CASE WHEN admitted_at = date('now') THEN 1 ELSE 0 END) AS admittedToday
         FROM patients`
    )
    .get();

  return {
    total: row.total || 0,
    critical: row.critical || 0,
    admittedToday: row.admittedToday || 0,
  };
}
