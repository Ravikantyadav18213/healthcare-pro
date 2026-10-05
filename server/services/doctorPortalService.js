import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import notify, { notifyAdmins } from "../utils/notify.js";
import {
  publicPatient,
  publicAppointment,
  publicReport,
  publicMedicalHistoryEntry,
  publicPrescription,
} from "../utils/sanitize.js";
import { today, nowTime } from "../utils/time.js";
import { emitToAdmins } from "../utils/realtime.js";

/* ==================================================================
   DOCTOR PORTAL

   Every function here takes the AUTHENTICATED doctor's catalog row
   (never a client-supplied doctorId) and, for anything patient-scoped,
   re-verifies the doctor <-> patient relationship against the
   database before touching a single clinical record. This file is
   the one place that rule is enforced — controllers just call it.
================================================================== */

/**
 * Maps a signed-in doctor's user account to their catalog row.
 * A doctor login with no matching catalog row cannot happen in normal
 * operation (seeding links them), but is treated as a hard failure
 * rather than silently granting broad access.
 */
export async function resolveDoctor(userId) {
  const row = await db
    .prepare(
      `SELECT d.*, dep.name AS department_name
         FROM doctors d
         LEFT JOIN departments dep ON dep.id = d.department_id
        WHERE d.user_id = ?`
    )
    .get(Number(userId));

  if (!row) {
    throw ApiError.forbidden("This account is not linked to a doctor profile.");
  }

  return row;
}

/**
 * The authorization boundary for every patient-scoped doctor route.
 *
 * A doctor may reach a patient's record only through one of three
 * legitimate relationships:
 *   1. explicitly assigned as the patient's attending doctor,
 *   2. holds (or has held) an appointment with that patient,
 *   3. has an admin-approved chat relationship with that patient.
 * Anything else is 403, regardless of what the frontend renders.
 */
async function isAuthorizedForPatient(doctorId, doctorUserId, patientId) {
  const row = await db
    .prepare(
      `SELECT 1
         FROM patients p
        WHERE p.id = @patientId
          AND (
            p.doctor_id = @doctorId
            OR EXISTS (
              SELECT 1 FROM appointments a
               WHERE a.patient_id = p.id AND a.doctor_id = @doctorId
            )
            OR (
              p.user_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM chat_conversations c
                 WHERE c.patient_id = p.user_id
                   AND c.doctor_id = @doctorUserId
                   AND c.type = 'patient_doctor'
                   AND c.status = 'active'
              )
            )
          )`
    )
    .get({ patientId: Number(patientId), doctorId: Number(doctorId), doctorUserId: Number(doctorUserId) });

  return Boolean(row);
}

const SELECT_PATIENT = `
  SELECT p.*, dep.name AS department_name, d.name AS doctor_name
    FROM patients p
    LEFT JOIN departments dep ON dep.id = p.department_id
    LEFT JOIN doctors     d   ON d.id  = p.doctor_id
`;

/** Loads the patient row and throws 403 unless the relationship checks out. */
export async function assertAuthorizedPatient(doctor, patientId) {
  const row = await db.prepare(`${SELECT_PATIENT} WHERE p.id = ?`).get(Number(patientId));
  if (!row) throw ApiError.notFound("Patient not found.");

  if (!(await isAuthorizedForPatient(doctor.id, doctor.user_id, row.id))) {
    throw ApiError.forbidden("Access to this patient is not authorized.");
  }

  return row;
}

/* ==================================================================
   DASHBOARD STATS
================================================================== */

export async function dashboardStats(doctor) {
  const patientCount = (
    await db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS n
           FROM patients p
          WHERE p.doctor_id = @doctorId
             OR EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = @doctorId)
             OR (
               p.user_id IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM chat_conversations c
                  WHERE c.patient_id = p.user_id AND c.doctor_id = @doctorUserId
                    AND c.type = 'patient_doctor' AND c.status = 'active'
               )
             )`
      )
      .get({ doctorId: doctor.id, doctorUserId: doctor.user_id })
  ).n;

  const appt = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN appointment_date = @today
                   AND status IN ('pending','scheduled','confirmed','rescheduled')
                  THEN 1 ELSE 0 END) AS todayCount,
         SUM(CASE WHEN appointment_date > @today
                   AND status IN ('pending','scheduled','confirmed','rescheduled')
                  THEN 1 ELSE 0 END) AS upcoming,
         SUM(CASE WHEN status IN ('pending','scheduled') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM appointments WHERE doctor_id = @doctorId`
    )
    .get({ today: today(), doctorId: doctor.id });

  const unreadMessages = (
    await db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM chat_messages m
           JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE c.type = 'patient_doctor' AND c.doctor_id = ?
            AND m.sender_id != ? AND m.is_read = 0`
      )
      .get(doctor.user_id, doctor.user_id)
  ).n;

  return {
    myPatients: patientCount || 0,
    todayAppointments: appt.todayCount || 0,
    upcomingAppointments: appt.upcoming || 0,
    pendingAppointments: appt.pending || 0,
    completedVisits: appt.completed || 0,
    unreadMessages: unreadMessages || 0,
  };
}

/* ==================================================================
   APPOINTMENTS  (doctor's own only)
================================================================== */

const SELECT_APPOINTMENT = `
  SELECT a.*,
         d.name           AS doctor_name,
         d.specialization AS doctor_specialization,
         d.consultation_fee,
         dep.name         AS department_name,
         COALESCE(p.name, u.name)  AS patient_display_name,
         p.id                       AS patient_record_id,
         u.email                   AS patient_email
    FROM appointments a
    LEFT JOIN doctors     d   ON d.id  = a.doctor_id
    LEFT JOIN departments dep ON dep.id = a.department_id
    LEFT JOIN patients    p   ON p.id  = a.patient_id
    LEFT JOIN users       u   ON u.id  = a.user_id
`;

export async function listMyAppointments(doctor, { scope = "", status = "", search = "" } = {}) {
  const where = ["a.doctor_id = @doctorId"];
  const params = { doctorId: doctor.id, today: today(), now: nowTime() };

  if (scope === "today") {
    where.push("a.appointment_date = @today");
  } else if (scope === "tomorrow") {
    where.push("a.appointment_date = date(@today, '+1 day')");
  } else if (scope === "week") {
    where.push("a.appointment_date BETWEEN @today AND date(@today, '+7 day')");
  } else if (scope === "upcoming") {
    where.push(`a.appointment_date >= @today
                AND a.status IN ('pending','scheduled','confirmed','rescheduled')`);
  }

  if (status && status !== "all") {
    where.push("a.status = @status");
    params.status = status;
  }

  if (search) {
    where.push(`(COALESCE(p.name, u.name) LIKE @search OR a.reason LIKE @search)`);
    params.search = `%${search}%`;
  }

  const rows = await db
    .prepare(
      `${SELECT_APPOINTMENT}
        WHERE ${where.join(" AND ")}
        ORDER BY a.appointment_date ASC, a.appointment_time ASC`
    )
    .all(params);

  return rows.map(publicAppointment);
}

export async function todaysAppointments(doctor) {
  return listMyAppointments(doctor, { scope: "today" });
}

export async function upcomingAppointments(doctor) {
  return listMyAppointments(doctor, { scope: "upcoming" });
}

/** Ownership check reused by the completion/notes endpoints. */
async function getOwnedAppointment(doctor, appointmentId) {
  const row = await db
    .prepare(`${SELECT_APPOINTMENT} WHERE a.id = ?`)
    .get(Number(appointmentId));

  if (!row) throw ApiError.notFound("Appointment not found.");
  if (row.doctor_id !== doctor.id) {
    throw ApiError.forbidden("You can only manage your own appointments.");
  }

  return row;
}

export async function markAppointmentCompleted(doctor, appointmentId) {
  const row = await getOwnedAppointment(doctor, appointmentId);

  if (row.status === "completed") {
    throw ApiError.conflict("This appointment is already marked completed.");
  }
  if (row.status === "cancelled") {
    throw ApiError.conflict("A cancelled appointment cannot be completed.");
  }

  await db.prepare(
    `UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ?`
  ).run(row.id);

  await notify(row.user_id, {
    title: "Visit completed",
    message: `Your visit with ${row.doctor_name} is complete. Any reports will appear under My Reports.`,
    type: "success",
    link: "/my-appointments",
  });

  await emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return publicAppointment(
    await db.prepare(`${SELECT_APPOINTMENT} WHERE a.id = ?`).get(row.id)
  );
}

/* ==================================================================
   PATIENTS
================================================================== */

export async function listMyPatients(doctor, { search = "", status = "" } = {}) {
  const where = [
    `(
      p.doctor_id = @doctorId
      OR EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = @doctorId)
      OR (
        p.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM chat_conversations c
           WHERE c.patient_id = p.user_id AND c.doctor_id = @doctorUserId
             AND c.type = 'patient_doctor' AND c.status = 'active'
        )
      )
    )`,
  ];
  const params = { doctorId: doctor.id, doctorUserId: doctor.user_id };

  if (search) {
    where.push(`(p.name LIKE @search OR p.phone LIKE @search OR CAST(p.id AS TEXT) = @exact)`);
    params.search = `%${search}%`;
    params.exact = search;
  }

  if (status && status !== "All") {
    where.push("p.status = @status");
    params.status = status;
  }

  const rows = await db
    .prepare(
      `${SELECT_PATIENT}
        WHERE ${where.join(" AND ")}
        ORDER BY p.name COLLATE NOCASE ASC`
    )
    .all(params);

  const lastVisitStmt = db.prepare(
    `SELECT MAX(appointment_date) AS d FROM appointments
      WHERE patient_id = ? AND doctor_id = ? AND status = 'completed'`
  );

  const nextApptStmt = db.prepare(
    `SELECT appointment_date, appointment_time FROM appointments
      WHERE patient_id = ? AND doctor_id = ?
        AND status IN ('pending','scheduled','confirmed','rescheduled')
        AND appointment_date >= ?
      ORDER BY appointment_date ASC, appointment_time ASC LIMIT 1`
  );

  return Promise.all(
    rows.map(async (row) => {
      const last = await lastVisitStmt.get(row.id, doctor.id);
      const next = await nextApptStmt.get(row.id, doctor.id, today());

      return {
        ...publicPatient(row),
        lastVisit: last?.d || null,
        nextAppointment: next
          ? { date: next.appointment_date, time: next.appointment_time }
          : null,
      };
    })
  );
}

/** Every report belonging to a patient this doctor is authorized for. */
export async function listMyReports(doctor) {
  const rows = await db
    .prepare(
      `SELECT r.*, u.name AS owner_name, u.email AS owner_email,
              p.name AS patient_display_name
         FROM reports r
         JOIN patients p ON p.id = r.patient_id
         LEFT JOIN users u ON u.id = r.user_id
        WHERE p.doctor_id = @doctorId
           OR EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = @doctorId)
           OR (
             p.user_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM chat_conversations c
                WHERE c.patient_id = p.user_id AND c.doctor_id = @doctorUserId
                  AND c.type = 'patient_doctor' AND c.status = 'active'
             )
           )
        ORDER BY r.report_date DESC, r.id DESC`
    )
    .all({ doctorId: doctor.id, doctorUserId: doctor.user_id });

  return rows.map(publicReport);
}

/** Every prescription this doctor has personally issued. */
export async function listMyPrescriptions(doctor) {
  const rows = await db
    .prepare(
      `SELECT rx.*, d.name AS doctor_name, p.name AS patient_display_name
         FROM prescriptions rx
         LEFT JOIN doctors d ON d.id = rx.doctor_id
         LEFT JOIN patients p ON p.id = rx.patient_id
        WHERE rx.doctor_id = ?
        ORDER BY rx.created_at DESC`
    )
    .all(doctor.id);

  return rows.map((row) => ({
    ...publicPrescription(row),
    patientName: row.patient_display_name || null,
  }));
}

export async function getPatientForDoctor(doctor, patientId) {
  const row = await assertAuthorizedPatient(doctor, patientId);

  /*
   * The admin should know a doctor opened a patient's chart — not just
   * see it buried in the audit log. This is a live notification, same
   * channel as appointment/report alerts. Fires once per page visit
   * (the frontend loads a patient's detail page only on mount), not on
   * every re-render, so this stays useful rather than noisy.
   */
  await notifyAdmins({
    title: "Doctor viewed a patient record",
    message: `${doctor.name} viewed ${row.name}'s patient record (#${row.id}). Review their reports and billing if needed.`,
    type: "info",
    link: "/patients",
  });

  return publicPatient(row);
}

export async function getPatientHistory(doctor, patientId) {
  await assertAuthorizedPatient(doctor, patientId);

  const rows = await db
    .prepare(
      `SELECT h.*, d.name AS doctor_name
         FROM medical_history h
         LEFT JOIN doctors d ON d.id = h.doctor_id
        WHERE h.patient_id = ?
        ORDER BY h.recorded_at DESC`
    )
    .all(Number(patientId));

  return rows.map(publicMedicalHistoryEntry);
}

export async function getPatientReports(doctor, patientId) {
  const patient = await assertAuthorizedPatient(doctor, patientId);

  const rows = await db
    .prepare(
      `SELECT r.*, u.name AS owner_name, u.email AS owner_email
         FROM reports r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.patient_id = ?
        ORDER BY r.report_date DESC, r.id DESC`
    )
    .all(patient.id);

  return rows.map(publicReport);
}

export async function getPatientPrescriptions(doctor, patientId) {
  await assertAuthorizedPatient(doctor, patientId);

  const rows = await db
    .prepare(
      `SELECT rx.*, d.name AS doctor_name
         FROM prescriptions rx
         LEFT JOIN doctors d ON d.id = rx.doctor_id
        WHERE rx.patient_id = ?
        ORDER BY rx.created_at DESC`
    )
    .all(Number(patientId));

  return rows.map(publicPrescription);
}

export async function getPatientAppointments(doctor, patientId) {
  await assertAuthorizedPatient(doctor, patientId);

  const rows = await db
    .prepare(
      `${SELECT_APPOINTMENT}
        WHERE a.patient_id = ? AND a.doctor_id = ?
        ORDER BY a.appointment_date DESC, a.appointment_time DESC`
    )
    .all(Number(patientId), doctor.id);

  return rows.map(publicAppointment);
}

/* ==================================================================
   NOTES + PRESCRIPTIONS  (write)
================================================================== */

const insertHistory = db.prepare(`
  INSERT INTO medical_history
    (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment, notes, follow_up_date)
  VALUES
    (@patient_id, @doctor_id, @appointment_id, @diagnosis, @symptoms, @treatment, @notes, @follow_up_date)
`);

export async function createNote(doctor, patientId, payload) {
  const patient = await assertAuthorizedPatient(doctor, patientId);

  const hasContent = [
    payload.diagnosis,
    payload.symptoms,
    payload.treatment,
    payload.notes,
  ].some((value) => String(value || "").trim());

  if (!hasContent) {
    throw ApiError.validation({ notes: "Add at least a diagnosis, symptoms, treatment or note." });
  }

  if (payload.appointmentId) {
    const appt = await db
      .prepare(`SELECT id FROM appointments WHERE id = ? AND patient_id = ? AND doctor_id = ?`)
      .get(Number(payload.appointmentId), patient.id, doctor.id);
    if (!appt) throw ApiError.badRequest("That appointment does not belong to this patient.");
  }

  const result = await insertHistory.run({
    patient_id: patient.id,
    doctor_id: doctor.id,
    appointment_id: payload.appointmentId ? Number(payload.appointmentId) : null,
    diagnosis: payload.diagnosis ? String(payload.diagnosis).trim() : null,
    symptoms: payload.symptoms ? String(payload.symptoms).trim() : null,
    treatment: payload.treatment ? String(payload.treatment).trim() : null,
    notes: payload.notes ? String(payload.notes).trim() : null,
    follow_up_date: payload.followUpDate || null,
  });

  const created = await db
    .prepare(
      `SELECT h.*, d.name AS doctor_name FROM medical_history h
        LEFT JOIN doctors d ON d.id = h.doctor_id WHERE h.id = ?`
    )
    .get(result.lastInsertRowid);

  if (patient.user_id) {
    await notify(patient.user_id, {
      title: "New note from your doctor",
      message: `${doctor.name} added a clinical note to your record.`,
      type: "info",
      link: "/my-reports",
    });
  }

  return publicMedicalHistoryEntry(created);
}

const insertPrescription = db.prepare(`
  INSERT INTO prescriptions
    (patient_id, doctor_id, medicine, dosage, frequency, duration, instructions)
  VALUES
    (@patient_id, @doctor_id, @medicine, @dosage, @frequency, @duration, @instructions)
`);

export async function createPrescription(doctor, patientId, payload) {
  const patient = await assertAuthorizedPatient(doctor, patientId);

  const medicine = String(payload.medicine || "").trim();
  if (!medicine) {
    throw ApiError.validation({ medicine: "Medicine name is required." });
  }

  const result = await insertPrescription.run({
    patient_id: patient.id,
    doctor_id: doctor.id,
    medicine,
    dosage: payload.dosage ? String(payload.dosage).trim() : null,
    frequency: payload.frequency ? String(payload.frequency).trim() : null,
    duration: payload.duration ? String(payload.duration).trim() : null,
    instructions: payload.instructions ? String(payload.instructions).trim() : null,
  });

  const created = await db
    .prepare(
      `SELECT rx.*, d.name AS doctor_name FROM prescriptions rx
        LEFT JOIN doctors d ON d.id = rx.doctor_id WHERE rx.id = ?`
    )
    .get(result.lastInsertRowid);

  if (patient.user_id) {
    await notify(patient.user_id, {
      title: "New prescription",
      message: `${doctor.name} prescribed ${medicine}. View it under My Reports.`,
      type: "success",
      link: "/my-reports",
    });
  }

  return publicPrescription(created);
}

/* ==================================================================
   PROFILE
================================================================== */

export function getOwnProfile(doctor) {
  return {
    id: doctor.id,
    userId: doctor.user_id,
    name: doctor.name,
    email: doctor.email,
    phone: doctor.phone || null,
    specialization: doctor.specialization,
    departmentId: doctor.department_id || null,
    department: doctor.department_name || null,
    qualification: doctor.qualification || null,
    experienceYears: doctor.experience_years ?? 0,
    consultationFee: doctor.consultation_fee ?? 0,
    bio: doctor.bio || null,
    profileImage: doctor.profile_image || null,
    availability: doctor.availability,
    rating: doctor.rating ?? 4.5,
    status: doctor.status,
  };
}

/**
 * A doctor may only touch their own presentation/contact details —
 * never role, fee, department or account status. Those stay
 * administrator-controlled via the existing /api/doctors endpoints.
 */
export async function updateOwnProfile(doctor, payload) {
  await db.prepare(
    `UPDATE doctors
        SET phone = @phone, bio = @bio, availability = @availability,
            updated_at = datetime('now')
      WHERE id = @id`
  ).run({
    id: doctor.id,
    phone: payload.phone ? String(payload.phone).trim() : doctor.phone,
    bio: payload.bio !== undefined ? String(payload.bio || "").trim() || null : doctor.bio,
    availability: payload.availability || doctor.availability,
  });

  const updated = await db
    .prepare(
      `SELECT d.*, dep.name AS department_name FROM doctors d
        LEFT JOIN departments dep ON dep.id = d.department_id WHERE d.id = ?`
    )
    .get(doctor.id);

  return getOwnProfile(updated);
}
