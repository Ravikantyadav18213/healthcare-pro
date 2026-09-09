import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import notify, { notifyAdmins } from "../utils/notify.js";
import { publicAppointment } from "../utils/sanitize.js";
import { today, nowTime, isValidDate, isValidTime } from "../utils/time.js";
import { isSlotWithinSchedule } from "./doctorService.js";
import { emitToAdmins } from "../sockets/index.js";

/* Statuses that still hold the doctor's slot. */
export const LIVE_STATUSES = [
  "pending",
  "scheduled",
  "confirmed",
  "rescheduled",
];

export const ALL_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
  "scheduled",
];

/* Decisions an administrator may take on a request. */
export const ADMIN_DECISIONS = [
  "pending",
  "confirmed",
  "rejected",
  "completed",
  "cancelled",
  "no_show",
];


const SELECT_APPOINTMENT = `
  SELECT a.*,
         d.name           AS doctor_name,
         d.user_id        AS doctor_user_id,
         d.specialization AS doctor_specialization,
         d.consultation_fee,
         dep.name         AS department_name,
         COALESCE(p.name, u.name)  AS patient_display_name,
         u.email                   AS patient_email
    FROM appointments a
    LEFT JOIN doctors     d   ON d.id  = a.doctor_id
    LEFT JOIN departments dep ON dep.id = a.department_id
    LEFT JOIN patients    p   ON p.id  = a.patient_id
    LEFT JOIN users       u   ON u.id  = a.user_id
`;

const findById = db.prepare(`${SELECT_APPOINTMENT} WHERE a.id = ?`);

/* Readable date for notification text: 2026-08-24 -> 24 Aug 2026 */
function prettyDate(value) {
  if (!value) return "—";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/*
 * Notify the doctor who owns the slot.
 *
 * Doctors have their own login and their own portal, so every
 * appointment event that changes their day has to reach them too —
 * not just the patient and the administrators. Catalog rows that were
 * never linked to a user account simply have no one to notify.
 */
function notifyDoctor(doctorUserId, actor, payload) {
  if (!doctorUserId) return;
  if (actor && Number(actor.id) === Number(doctorUserId)) return;

  notify(doctorUserId, { ...payload, link: "/doctor/appointments" });
}

/* ==================================================================
   LOOKUPS
================================================================== */

export function getAppointment(id) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Appointment not found.");
  return publicAppointment(row);
}

/**
 * Ownership is verified against the row in the database, never
 * against anything the client claimed.
 */
export function getOwnedAppointment(id, user) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Appointment not found.");

  if (user.role !== "admin" && row.user_id !== user.id) {
    throw ApiError.forbidden("You can only manage your own appointments.");
  }

  return row;
}

function buildFilters({ search, status, scope, from, to, doctorId, departmentId, userId }) {
  const where = [];
  const params = {};

  if (userId) {
    where.push("a.user_id = @userId");
    params.userId = Number(userId);
  }

  if (status && status !== "all") {
    if (status === "upcoming") {
      where.push(`a.status IN ('pending','scheduled','confirmed','rescheduled')
                  AND a.appointment_date >= @today`);
      params.today = today();
    } else if (ALL_STATUSES.includes(status)) {
      where.push("a.status = @status");
      params.status = status;
    }
  }

  if (scope === "today") {
    where.push("a.appointment_date = @today");
    params.today = today();
  } else if (scope === "upcoming") {
    where.push(`a.appointment_date >= @today
                AND a.status IN ('pending','scheduled','confirmed','rescheduled')`);
    params.today = today();
  } else if (scope === "past") {
    where.push("a.appointment_date < @today");
    params.today = today();
  }

  if (from) {
    where.push("a.appointment_date >= @from");
    params.from = from;
  }

  if (to) {
    where.push("a.appointment_date <= @to");
    params.to = to;
  }

  if (doctorId) {
    where.push("a.doctor_id = @doctorId");
    params.doctorId = Number(doctorId);
  }

  if (departmentId) {
    where.push("a.department_id = @departmentId");
    params.departmentId = Number(departmentId);
  }

  if (search) {
    where.push(`(
      d.name LIKE @search OR
      dep.name LIKE @search OR
      a.reason LIKE @search OR
      COALESCE(p.name, u.name) LIKE @search OR
      u.email LIKE @search
    )`);
    params.search = `%${search}%`;
  }

  return { where, params };
}

export function listAppointments(filters = {}) {
  const { where, params } = buildFilters(filters);

  const limit = Math.min(Number(filters.limit) || 200, 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const sql = `
    ${SELECT_APPOINTMENT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = db.prepare(sql).all(params);

  const countSql = `
    SELECT COUNT(*) AS n
      FROM appointments a
      LEFT JOIN doctors     d   ON d.id  = a.doctor_id
      LEFT JOIN departments dep ON dep.id = a.department_id
      LEFT JOIN patients    p   ON p.id  = a.patient_id
      LEFT JOIN users       u   ON u.id  = a.user_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  `;

  const total = db.prepare(countSql).get(params).n;

  return { items: rows.map(publicAppointment), total };
}

/* ==================================================================
   CREATE
================================================================== */

const insertAppointment = db.prepare(`
  INSERT INTO appointments
    (user_id, patient_id, doctor_id, department_id,
     appointment_date, appointment_time, reason, notes, status)
  VALUES
    (@user_id, @patient_id, @doctor_id, @department_id,
     @appointment_date, @appointment_time, @reason, @notes, @status)
`);

function slotTakenError() {
  return ApiError.conflict("This appointment slot is no longer available.");
}

function assertBookable({ doctorId, date, time }) {
  if (!isValidDate(date)) {
    throw ApiError.validation({ date: "Choose a valid appointment date." });
  }

  if (!isValidTime(time)) {
    throw ApiError.validation({ time: "Choose a valid appointment time." });
  }

  if (date < today()) {
    throw ApiError.validation({
      date: "Appointments cannot be booked in the past.",
    });
  }

  if (date === today() && time <= nowTime()) {
    throw ApiError.validation({
      time: "That time has already passed today.",
    });
  }

  const doctor = db
    .prepare(`SELECT * FROM doctors WHERE id = ?`)
    .get(Number(doctorId));

  if (!doctor) {
    throw ApiError.validation({ doctorId: "Select a valid doctor." });
  }

  if (doctor.status !== "active") {
    throw ApiError.conflict("This doctor is not currently accepting appointments.");
  }

  if (!isSlotWithinSchedule(doctorId, date, time)) {
    throw ApiError.conflict(
      "The selected time is outside this doctor's clinic hours."
    );
  }

  const clash = db
    .prepare(
      `SELECT id FROM appointments
        WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
          AND status IN ('pending','scheduled','confirmed','rescheduled')`
    )
    .get(Number(doctorId), date, time);

  if (clash) throw slotTakenError();

  return doctor;
}

export function createAppointment(actor, payload) {
  const {
    doctorId,
    departmentId,
    date,
    time,
    reason,
    notes,
    userId: requestedUserId,
    patientId: requestedPatientId,
  } = payload;

  /*
   * A normal user can only ever book for themselves. The owning
   * user id is taken from the session, not from the request body.
   */
  const ownerId =
    actor.role === "admin" && requestedUserId
      ? Number(requestedUserId)
      : actor.id;

  const owner = db.prepare(`SELECT * FROM users WHERE id = ?`).get(ownerId);
  if (!owner) throw ApiError.badRequest("The selected account does not exist.");

  const doctor = assertBookable({ doctorId, date, time });

  /* Prefer an explicit patient (admin flow), else the user's own profile. */
  let patientId = null;

  if (actor.role === "admin" && requestedPatientId) {
    patientId = Number(requestedPatientId);
  } else {
    const profile = db
      .prepare(`SELECT id FROM patients WHERE user_id = ? ORDER BY id LIMIT 1`)
      .get(ownerId);
    patientId = profile?.id ?? null;
  }

  /* A missing patient profile should never block booking. */
  if (!patientId) {
    const result = db
      .prepare(
        `INSERT INTO patients (user_id, name, phone, email, status)
         VALUES (?, ?, ?, ?, 'Outpatient')`
      )
      .run(ownerId, owner.name, owner.phone, owner.email);
    patientId = result.lastInsertRowid;
  }

  let created;

  try {
    const result = insertAppointment.run({
      user_id: ownerId,
      patient_id: patientId,
      doctor_id: Number(doctorId),
      department_id: departmentId
        ? Number(departmentId)
        : doctor.department_id ?? null,
      appointment_date: date,
      appointment_time: time,
      reason: reason ? String(reason).trim() : null,
      notes: notes ? String(notes).trim() : null,

      /*
       * A patient request always starts as 'pending' and waits for an
       * explicit administrator decision — it is never auto-confirmed.
       * Only a booking made by an administrator is confirmed outright.
       */
      status: actor.role === "admin" ? "confirmed" : "pending",
    });

    created = findById.get(result.lastInsertRowid);
  } catch (error) {
    /* The partial unique index is the last line of defence against
       two people submitting the same slot at the same moment. */
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      throw slotTakenError();
    }
    throw error;
  }

  /* ---- receipt for the patient (names both people) ---- */
  notify(ownerId, {
    title:
      actor.role === "admin" ? "Appointment booked" : "Request sent for approval",
    message:
      actor.role === "admin"
        ? `${owner.name}, the hospital booked you with ${doctor.name} (${
            doctor.specialization
          }) on ${prettyDate(date)} at ${time}.`
        : `${owner.name}, your request for ${doctor.name} (${
            doctor.specialization
          }) on ${prettyDate(date)} at ${time} has been sent. You will be notified once the hospital reviews it.`,
    type: actor.role === "admin" ? "success" : "info",
    link: "/my-appointments",
  });

  /* ---- alert every administrator so it can be reviewed ---- */
  notifyAdmins({
    title:
      actor.role === "admin"
        ? "Appointment created"
        : "New appointment request",
    message: `${owner.name} booked ${doctor.name} (${
      doctor.specialization
    }) on ${prettyDate(date)} at ${time}.${
      actor.role === "admin" ? "" : " Awaiting your confirmation."
    }`,
    type: actor.role === "admin" ? "info" : "warning",
    link: "/appointments",
    exceptUserId: actor.id,
  });

  /* ---- the doctor whose slot was taken ---- */
  notifyDoctor(doctor.user_id, actor, {
    title:
      actor.role === "admin" ? "New appointment booked" : "New appointment request",
    message: `${owner.name} booked you on ${prettyDate(date)} at ${time}.${
      actor.role === "admin" ? "" : " It is awaiting hospital approval."
    }${reason ? ` Reason: ${String(reason).trim()}` : ""}`,
    type: actor.role === "admin" ? "success" : "info",
  });

  /* Moves Appointments Today, and Total Patients too on the
     no-existing-profile path a few lines up. */
  emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return publicAppointment(created);
}

/* ==================================================================
   STATUS TRANSITIONS
================================================================== */

const setStatus = db.prepare(`
  UPDATE appointments
     SET status = ?, cancelled_by = ?, updated_at = datetime('now')
   WHERE id = ?
`);

export function cancelAppointment(actor, id) {
  const row = getOwnedAppointment(id, actor);

  if (row.status === "cancelled") {
    throw ApiError.conflict("This appointment is already cancelled.");
  }

  if (row.status === "completed") {
    throw ApiError.conflict("A completed appointment cannot be cancelled.");
  }

  setStatus.run("cancelled", actor.role, Number(id));

  const when = `${prettyDate(row.appointment_date)} at ${row.appointment_time}`;

  /* The patient is told only when somebody else cancelled for them. */
  if (row.user_id !== actor.id) {
    notify(row.user_id, {
      title: "Appointment cancelled",
      message: `The hospital cancelled your appointment with ${row.doctor_name} on ${when}.`,
      type: "warning",
      link: "/my-appointments",
    });
  }

  /* Administrators are told when a patient cancels. */
  if (actor.role !== "admin") {
    notifyAdmins({
      title: "Appointment cancelled by patient",
      message: `${row.patient_display_name || "A patient"} cancelled with ${
        row.doctor_name
      } on ${when}. The slot is free again.`,
      type: "warning",
      link: "/appointments",
      exceptUserId: actor.id,
    });
  }

  notifyDoctor(row.doctor_user_id, actor, {
    title: "Appointment cancelled",
    message: `${row.patient_display_name || "A patient"}'s appointment with you on ${when} was cancelled. The slot is free again.`,
    type: "warning",
  });

  emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return publicAppointment(findById.get(Number(id)));
}

export function rescheduleAppointment(actor, id, { date, time }) {
  const row = getOwnedAppointment(id, actor);

  if (["cancelled", "completed", "no_show"].includes(row.status)) {
    throw ApiError.conflict(
      "Only an active appointment can be rescheduled. Please book a new one."
    );
  }

  if (row.appointment_date === date && row.appointment_time === time) {
    throw ApiError.badRequest("Choose a different date or time to reschedule.");
  }

  assertBookable({ doctorId: row.doctor_id, date, time });

  try {
    db.prepare(
      `UPDATE appointments
          SET appointment_date = ?, appointment_time = ?,
              status = 'rescheduled', updated_at = datetime('now')
        WHERE id = ?`
    ).run(date, time, Number(id));
  } catch (error) {
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      throw slotTakenError();
    }
    throw error;
  }

  if (row.user_id !== actor.id) {
    notify(row.user_id, {
      title: "Appointment rescheduled",
      message: `The hospital moved your appointment with ${
        row.doctor_name
      } to ${prettyDate(date)} at ${time}.`,
      type: "info",
      link: "/my-appointments",
    });
  }

  if (actor.role !== "admin") {
    notifyAdmins({
      title: "Appointment rescheduled by patient",
      message: `${row.patient_display_name || "A patient"} moved their ${
        row.doctor_name
      } appointment from ${prettyDate(row.appointment_date)} ${
        row.appointment_time
      } to ${prettyDate(date)} ${time}.`,
      type: "info",
      link: "/appointments",
      exceptUserId: actor.id,
    });
  }

  notifyDoctor(row.doctor_user_id, actor, {
    title: "Appointment rescheduled",
    message: `${row.patient_display_name || "A patient"} moved their appointment with you from ${prettyDate(
      row.appointment_date
    )} ${row.appointment_time} to ${prettyDate(date)} ${time}.`,
    type: "info",
  });

  /* A moved date can push an appointment in or out of "today". */
  emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return publicAppointment(findById.get(Number(id)));
}

/*
 * Outcome of each administrative decision, as the patient sees it in
 * their notification list.
 */
const STATUS_NOTICE = {
  confirmed: {
    title: "Appointment approved",
    type: "success",
    message: "has been approved. Please arrive 10 minutes early.",
  },
  rejected: {
    title: "Appointment rejected",
    type: "warning",
    message: "was not approved. Please choose another doctor or time slot.",
  },
  pending: {
    title: "Appointment back under review",
    type: "info",
    message: "has been put back under review by the hospital.",
  },
  completed: {
    title: "Visit completed",
    type: "success",
    message: "is complete. Any reports will appear under My Reports.",
  },
  cancelled: {
    title: "Appointment cancelled",
    type: "warning",
    message: "was cancelled by the hospital. Please book another slot.",
  },
  no_show: {
    title: "Marked as absent",
    type: "warning",
    message: "was marked as a no-show because you did not attend.",
  },
  scheduled: {
    title: "Appointment reopened",
    type: "info",
    message: "is awaiting confirmation again.",
  },
  rescheduled: {
    title: "Appointment rescheduled",
    type: "info",
    message: "was rescheduled by the hospital.",
  },
};

/*
 * The same decisions, written from the doctor's side. Statuses the
 * doctor does not need to act on are left out.
 */
const DOCTOR_STATUS_NOTICE = {
  confirmed: {
    title: "Appointment confirmed",
    type: "success",
    message: "was approved by the hospital and is now on your schedule.",
  },
  rejected: {
    title: "Appointment request rejected",
    type: "info",
    message: "was rejected by the hospital. The slot is free again.",
  },
  cancelled: {
    title: "Appointment cancelled",
    type: "warning",
    message: "was cancelled. The slot is free again.",
  },
  completed: {
    title: "Visit marked complete",
    type: "success",
    message: "was marked as completed.",
  },
  no_show: {
    title: "Patient marked absent",
    type: "warning",
    message: "was marked as a no-show.",
  },
  rescheduled: {
    title: "Appointment rescheduled",
    type: "info",
    message: "was rescheduled by the hospital.",
  },
};

const recordDecision = db.prepare(`
  UPDATE appointments
     SET status = @status,
         decision_note = @note,
         decided_at = datetime('now'),
         decided_by = @actorId,
         cancelled_by = @actorRole,
         updated_at = datetime('now')
   WHERE id = @id
`);

/**
 * Records an administrator's decision on a request:
 * approve (confirmed) / reject / keep pending / complete / no-show / cancel.
 *
 * The patient is always notified, and the message names both the
 * patient and the doctor so it reads on its own.
 */
export function updateAppointmentStatus(actor, id, status, note = null) {
  if (!ALL_STATUSES.includes(status)) {
    throw ApiError.badRequest("Unknown appointment status.");
  }

  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Appointment not found.");

  if (row.status === status) {
    throw ApiError.conflict(
      `This appointment is already marked as ${status.replace("_", " ")}.`
    );
  }

  const cleanNote = note ? String(note).trim().slice(0, 300) : null;

  recordDecision.run({
    id: Number(id),
    status,
    note: cleanNote,
    actorId: actor.id,
    actorRole: actor.role,
  });

  const notice = STATUS_NOTICE[status];

  if (notice && row.user_id !== actor.id) {
    const patient = row.patient_display_name || "Patient";

    notify(row.user_id, {
      title: notice.title,
      message:
        `${patient}, your appointment with ${row.doctor_name}` +
        `${row.doctor_specialization ? ` (${row.doctor_specialization})` : ""}` +
        ` on ${prettyDate(row.appointment_date)} at ${row.appointment_time} ` +
        notice.message +
        (cleanNote ? ` Hospital note: "${cleanNote}"` : ""),
      type: notice.type,
      link: "/my-appointments",
    });
  }

  const doctorNotice = DOCTOR_STATUS_NOTICE[status];

  if (doctorNotice) {
    notifyDoctor(row.doctor_user_id, actor, {
      title: doctorNotice.title,
      message:
        `${row.patient_display_name || "A patient"}'s appointment with you on ` +
        `${prettyDate(row.appointment_date)} at ${row.appointment_time} ` +
        doctorNotice.message +
        (cleanNote ? ` Hospital note: "${cleanNote}"` : ""),
      type: doctorNotice.type,
    });
  }

  /* completed/cancelled/no_show all move Appointments Today. */
  emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return publicAppointment(findById.get(Number(id)));
}

/**
 * Permanently removes an appointment record (administrator only).
 * The patient is always told, since the row disappears from their list.
 */
export function deleteAppointment(actor, id) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Appointment not found.");

  db.prepare(`DELETE FROM appointments WHERE id = ?`).run(Number(id));

  if (row.user_id !== actor.id) {
    notify(row.user_id, {
      title: "Appointment removed",
      message: `Your appointment with ${row.doctor_name} on ${prettyDate(
        row.appointment_date
      )} at ${row.appointment_time} was removed by the hospital. Contact reception if this was unexpected.`,
      type: "warning",
      link: "/my-appointments",
    });
  }

  notifyDoctor(row.doctor_user_id, actor, {
    title: "Appointment removed",
    message: `${row.patient_display_name || "A patient"}'s appointment with you on ${prettyDate(
      row.appointment_date
    )} at ${row.appointment_time} was removed by the hospital.`,
    type: "warning",
  });

  emitToAdmins("dashboard:stats-changed", { source: "appointments" });

  return {
    id: Number(id),
    patientName: row.patient_display_name,
    doctorName: row.doctor_name,
  };
}

export function updateAppointmentNotes(id, notes) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Appointment not found.");

  db.prepare(
    `UPDATE appointments SET notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(notes ? String(notes).trim() : null, Number(id));

  return publicAppointment(findById.get(Number(id)));
}

/* ==================================================================
   SUMMARIES
================================================================== */

export function appointmentStats(userId = null) {
  const scope = userId ? "WHERE user_id = @userId" : "";
  const params = userId ? { userId: Number(userId), today: today() } : { today: today() };

  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN appointment_date = @today
                   AND status IN ('pending','scheduled','confirmed','rescheduled')
                  THEN 1 ELSE 0 END) AS todayCount,
         SUM(CASE WHEN appointment_date >= @today
                   AND status IN ('pending','scheduled','confirmed','rescheduled')
                  THEN 1 ELSE 0 END) AS upcoming,
         SUM(CASE WHEN status = 'completed'  THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status IN ('pending','scheduled') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'confirmed'  THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN status = 'no_show'    THEN 1 ELSE 0 END) AS noShow
       FROM appointments ${scope}`
    )
    .get(params);

  return {
    total: row.total || 0,
    today: row.todayCount || 0,
    upcoming: row.upcoming || 0,
    completed: row.completed || 0,
    cancelled: row.cancelled || 0,
    pending: row.pending || 0,
    confirmed: row.confirmed || 0,
    noShow: row.noShow || 0,
  };
}

export function nextAppointmentFor(userId) {
  const row = db
    .prepare(
      `${SELECT_APPOINTMENT}
        WHERE a.user_id = @userId
          AND a.status IN ('pending','scheduled','confirmed','rescheduled')
          AND (a.appointment_date > @today
               OR (a.appointment_date = @today AND a.appointment_time >= @now))
        ORDER BY a.appointment_date ASC, a.appointment_time ASC
        LIMIT 1`
    )
    .get({ userId: Number(userId), today: today(), now: nowTime() });

  return row ? publicAppointment(row) : null;
}
