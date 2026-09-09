import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { publicDoctor } from "../utils/sanitize.js";
import { buildSlots, weekdayOf, isValidDate, today, nowTime } from "../utils/time.js";
import { revokeAllSessions } from "./tokenService.js";
import { emitToAdmins } from "../sockets/index.js";

const SELECT_DOCTOR = `
  SELECT d.*, dep.name AS department_name
    FROM doctors d
    LEFT JOIN departments dep ON dep.id = d.department_id
`;

const findById = db.prepare(`${SELECT_DOCTOR} WHERE d.id = ?`);
const findByEmail = db.prepare(`SELECT id FROM doctors WHERE email = ?`);

/* ==================================================================
   LIST
================================================================== */

export function listDoctors({
  search = "",
  specialization = "",
  departmentId = null,
  status = "",
  includeInactive = false,
} = {}) {
  const where = [];
  const params = {};

  if (!includeInactive) {
    where.push("d.status = 'active'");
  } else if (status) {
    where.push("d.status = @status");
    params.status = status;
  }

  if (search) {
    where.push(`(
      d.name LIKE @search OR
      d.email LIKE @search OR
      d.specialization LIKE @search OR
      dep.name LIKE @search
    )`);
    params.search = `%${search}%`;
  }

  if (specialization && specialization !== "All") {
    where.push("d.specialization = @specialization");
    params.specialization = specialization;
  }

  if (departmentId) {
    where.push("d.department_id = @departmentId");
    params.departmentId = Number(departmentId);
  }

  const sql = `
    ${SELECT_DOCTOR}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.name COLLATE NOCASE ASC
  `;

  return db.prepare(sql).all(params).map(publicDoctor);
}

export function getDoctor(id) {
  const row = findById.get(Number(id));
  if (!row) throw ApiError.notFound("Doctor not found.");
  return publicDoctor(row);
}

export function listSpecializations() {
  return db
    .prepare(
      `SELECT DISTINCT specialization FROM doctors
        WHERE status = 'active'
        ORDER BY specialization COLLATE NOCASE`
    )
    .all()
    .map((row) => row.specialization);
}

/* ==================================================================
   CREATE / UPDATE / DELETE  (admin)
================================================================== */

const insertDoctor = db.prepare(`
  INSERT INTO doctors
    (name, email, phone, specialization, department_id, qualification,
     experience_years, consultation_fee, bio, availability, slot_minutes, status)
  VALUES
    (@name, @email, @phone, @specialization, @department_id, @qualification,
     @experience_years, @consultation_fee, @bio, @availability, @slot_minutes, @status)
`);

const insertWindow = db.prepare(`
  INSERT OR IGNORE INTO doctor_availability (doctor_id, weekday, start_time, end_time)
  VALUES (?, ?, ?, ?)
`);

const DEFAULT_WINDOWS = [
  { start: "09:00", end: "13:00" },
  { start: "16:00", end: "19:00" },
];

function normalise(payload) {
  return {
    name: String(payload.name).trim(),
    email: String(payload.email).trim().toLowerCase(),
    phone: payload.phone ? String(payload.phone).trim() : null,
    specialization: String(payload.specialization).trim(),
    department_id: payload.departmentId ? Number(payload.departmentId) : null,
    qualification: payload.qualification ? String(payload.qualification).trim() : null,
    experience_years: Number(payload.experienceYears) || 0,
    consultation_fee: Number(payload.consultationFee) || 0,
    bio: payload.bio ? String(payload.bio).trim() : null,
    availability: payload.availability || "Available",
    slot_minutes: Number(payload.slotMinutes) || 30,
    status: payload.status === "inactive" ? "inactive" : "active",
  };
}

export function createDoctor(payload) {
  const data = normalise(payload);

  if (findByEmail.get(data.email)) {
    throw ApiError.conflict("A doctor with this email already exists.");
  }

  if (data.department_id) {
    const dept = db
      .prepare(`SELECT id FROM departments WHERE id = ?`)
      .get(data.department_id);
    if (!dept) throw ApiError.badRequest("Selected department does not exist.");
  }

  const id = db.transaction(() => {
    const result = insertDoctor.run(data);
    const doctorId = result.lastInsertRowid;

    /* Give the new doctor a standard Mon–Sat schedule so they are
       immediately bookable. */
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      for (const window of DEFAULT_WINDOWS) {
        insertWindow.run(doctorId, weekday, window.start, window.end);
      }
    }

    return doctorId;
  })();

  /* Moves the Total Doctors tile on the dashboard. */
  emitToAdmins("dashboard:stats-changed", { source: "doctors" });

  return publicDoctor(findById.get(id));
}

export function updateDoctor(id, payload) {
  const existing = findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Doctor not found.");

  const data = normalise(payload);

  const duplicate = db
    .prepare(`SELECT id FROM doctors WHERE email = ? AND id != ?`)
    .get(data.email, Number(id));

  if (duplicate) {
    throw ApiError.conflict("Another doctor already uses this email.");
  }

  db.prepare(
    `UPDATE doctors
        SET name = @name, email = @email, phone = @phone,
            specialization = @specialization, department_id = @department_id,
            qualification = @qualification, experience_years = @experience_years,
            consultation_fee = @consultation_fee, bio = @bio,
            availability = @availability, slot_minutes = @slot_minutes,
            status = @status, updated_at = datetime('now')
      WHERE id = @id`
  ).run({ ...data, id: Number(id) });

  return publicDoctor(findById.get(Number(id)));
}

/*
 * Mirrors the doctor's clinical status onto their LOGIN account.
 *
 * Deactivating a doctor used to touch only the doctors table, so the
 * linked users row kept role='doctor' and status='active' — the
 * "deactivated" clinician's session stayed live and every
 * /api/doctor/* route kept serving other people's patient records.
 * An administrator reasonably reads "deactivate" as "cut access".
 */
function syncDoctorLoginStatus(doctorRow, status) {
  if (!doctorRow?.user_id) return;

  const accountStatus = status === "active" ? "active" : "inactive";

  db.prepare(
    `UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(accountStatus, doctorRow.user_id);

  /* requireAuth rejects a non-active account on the next request, but
     the refresh session would still be sitting there — end it now so
     the sign-out is immediate rather than merely eventual. */
  if (accountStatus === "inactive") {
    revokeAllSessions(doctorRow.user_id);
  }
}

export function setDoctorStatus(id, status) {
  const existing = findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Doctor not found.");

  db.transaction(() => {
    db.prepare(
      `UPDATE doctors SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, Number(id));

    syncDoctorLoginStatus(existing, status);
  })();

  /* active/inactive toggles the Total Doctors count. */
  emitToAdmins("dashboard:stats-changed", { source: "doctors" });

  return publicDoctor(findById.get(Number(id)));
}

export function deleteDoctor(id) {
  const existing = findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Doctor not found.");

  const liveAppointments = db
    .prepare(
      `SELECT COUNT(*) AS n FROM appointments
        WHERE doctor_id = ?
          AND status IN ('pending','scheduled','confirmed','rescheduled')`
    )
    .get(Number(id)).n;

  if (liveAppointments > 0) {
    throw ApiError.conflict(
      `This doctor has ${liveAppointments} active appointment(s). Cancel or reassign them, or deactivate the doctor instead.`
    );
  }

  db.transaction(() => {
    /* doctors.user_id is ON DELETE SET NULL, so removing the profile
       would otherwise leave a still-active role='doctor' login with no
       profile behind it — able to sign in, and refused by the portal
       with a confusing 403 rather than being properly closed. */
    syncDoctorLoginStatus(existing, "inactive");
    db.prepare(`DELETE FROM doctors WHERE id = ?`).run(Number(id));
  })();

  emitToAdmins("dashboard:stats-changed", { source: "doctors" });

  return { id: Number(id), name: existing.name };
}

/* ==================================================================
   AVAILABILITY
================================================================== */

export function getDoctorSchedule(doctorId) {
  return db
    .prepare(
      `SELECT weekday, start_time, end_time
         FROM doctor_availability
        WHERE doctor_id = ?
        ORDER BY weekday, start_time`
    )
    .all(Number(doctorId));
}

export function replaceDoctorSchedule(doctorId, windows) {
  const existing = findById.get(Number(doctorId));
  if (!existing) throw ApiError.notFound("Doctor not found.");

  db.transaction(() => {
    db.prepare(`DELETE FROM doctor_availability WHERE doctor_id = ?`).run(
      Number(doctorId)
    );

    for (const window of windows) {
      insertWindow.run(
        Number(doctorId),
        Number(window.weekday),
        window.startTime,
        window.endTime
      );
    }
  })();

  return getDoctorSchedule(doctorId);
}

/**
 * Real availability for a given doctor and date:
 * working windows expanded into slots, minus slots already held by
 * a live appointment, minus times that have already passed today.
 */
export function getAvailableSlots(doctorId, date) {
  if (!isValidDate(date)) {
    throw ApiError.badRequest("Provide a valid date in YYYY-MM-DD format.");
  }

  const doctor = findById.get(Number(doctorId));
  if (!doctor) throw ApiError.notFound("Doctor not found.");

  if (doctor.status !== "active") {
    return { date, slots: [], reason: "This doctor is not currently accepting appointments." };
  }

  if (date < today()) {
    return { date, slots: [], reason: "Please choose a date from today onwards." };
  }

  const weekday = weekdayOf(date);

  const windows = db
    .prepare(
      `SELECT start_time, end_time FROM doctor_availability
        WHERE doctor_id = ? AND weekday = ?
        ORDER BY start_time`
    )
    .all(Number(doctorId), weekday);

  if (windows.length === 0) {
    return { date, slots: [], reason: "The doctor does not hold clinic on this day." };
  }

  const taken = new Set(
    db
      .prepare(
        `SELECT appointment_time FROM appointments
          WHERE doctor_id = ? AND appointment_date = ?
            AND status IN ('pending','scheduled','confirmed','rescheduled')`
      )
      .all(Number(doctorId), date)
      .map((row) => row.appointment_time)
  );

  const isToday = date === today();
  const currentTime = nowTime();

  const slots = [];

  for (const window of windows) {
    for (const slot of buildSlots(
      window.start_time,
      window.end_time,
      doctor.slot_minutes
    )) {
      if (taken.has(slot)) continue;
      if (isToday && slot <= currentTime) continue;
      slots.push(slot);
    }
  }

  return {
    date,
    slotMinutes: doctor.slot_minutes,
    slots,
    reason: slots.length === 0 ? "All slots for this day are booked." : null,
  };
}

/** Confirms a requested slot actually exists in the doctor's schedule. */
export function isSlotWithinSchedule(doctorId, date, time) {
  const doctor = findById.get(Number(doctorId));
  if (!doctor) return false;

  const weekday = weekdayOf(date);

  const windows = db
    .prepare(
      `SELECT start_time, end_time FROM doctor_availability
        WHERE doctor_id = ? AND weekday = ?`
    )
    .all(Number(doctorId), weekday);

  return windows.some((window) =>
    buildSlots(window.start_time, window.end_time, doctor.slot_minutes).includes(time)
  );
}
