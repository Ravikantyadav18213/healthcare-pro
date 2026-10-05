import db from "../db.js";
import ApiError from "../utils/ApiError.js";

/* ==================================================================
   PATIENT MEDICAL TIMELINE

   One chronological feed assembled from every clinical table that
   records something dated about a patient: visits, diagnoses,
   prescriptions, lab work, reports, invoices and discharges.

   Each source query shapes its rows into the same envelope
   ({ kind, at, title, summary, meta }) so the client renders one list
   instead of six, and sorting is a single comparison on `at`.

   Access is resolved by resolvePatientScope below — a patient may
   only ever read their own timeline.
================================================================== */

/* Patients are identified two ways in this schema: a `patients` row
   (clinical record) and a `users` row (login). Some tables reference
   one, some the other, so both ids travel together. */
const patientByUser = db.prepare(
  `SELECT id, user_id AS userId, name FROM patients WHERE user_id = ?`
);

const patientById = db.prepare(
  `SELECT id, user_id AS userId, name FROM patients WHERE id = ?`
);

const userById = db.prepare(`SELECT id, name FROM users WHERE id = ?`);

/**
 * Work out which patient the caller is allowed to read.
 *
 * A patient gets their own record and nothing else, regardless of
 * what id they ask for — the requested id is ignored for that role
 * rather than compared, so there is no way to probe other rows.
 */
export async function resolvePatientScope(requester, requestedPatientId) {
  if (requester.role === "user") {
    const record = await patientByUser.get(requester.id);

    return {
      patientId: record?.id ?? null,
      userId: requester.id,
      name: record?.name || (await userById.get(requester.id))?.name || "You",
    };
  }

  /* Clinical and desk staff may look up any patient by id. */
  const id = Number(requestedPatientId);

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest("A patient id is required.");
  }

  const record = await patientById.get(id);

  if (!record) throw ApiError.notFound("Patient not found.");

  return { patientId: record.id, userId: record.userId, name: record.name };
}

/* ---------------------------------------------------------------- */

const appointmentRows = db.prepare(`
  SELECT
    a.id,
    a.appointment_date AS date,
    a.appointment_time AS time,
    a.reason,
    a.status,
    a.mode,
    a.notes,
    d.name             AS doctorName,
    dep.name           AS departmentName
  FROM appointments a
  LEFT JOIN doctors d       ON d.id  = a.doctor_id
  LEFT JOIN departments dep ON dep.id = a.department_id
  WHERE (@patientId IS NOT NULL AND a.patient_id = @patientId)
     OR (@userId    IS NOT NULL AND a.user_id    = @userId)
  ORDER BY a.appointment_date DESC, a.appointment_time DESC
`);

const historyRows = db.prepare(`
  SELECT
    h.id,
    h.diagnosis,
    h.symptoms,
    h.treatment,
    h.notes,
    h.follow_up_date AS followUpDate,
    h.recorded_at    AS recordedAt,
    d.name           AS doctorName
  FROM medical_history h
  LEFT JOIN doctors d ON d.id = h.doctor_id
  WHERE h.patient_id = ?
  ORDER BY h.recorded_at DESC
`);

const prescriptionRows = db.prepare(`
  SELECT
    rx.id,
    rx.medicine,
    rx.dosage,
    rx.frequency,
    rx.duration,
    rx.instructions,
    rx.created_at AS createdAt,
    d.name        AS doctorName
  FROM prescriptions rx
  LEFT JOIN doctors d ON d.id = rx.doctor_id
  WHERE rx.patient_id = ?
  ORDER BY rx.created_at DESC
`);

const reportRows = db.prepare(`
  SELECT
    r.id,
    r.title,
    r.type,
    r.status,
    r.result,
    r.description,
    r.report_date AS reportDate,
    r.file_name   AS fileName
  FROM reports r
  WHERE (@patientId IS NOT NULL AND r.patient_id = @patientId)
     OR (@userId    IS NOT NULL AND r.user_id    = @userId)
  ORDER BY r.report_date DESC
`);

const labRows = db.prepare(`
  SELECT id, test_name AS testName, category, status, result,
         test_date AS testDate, price
    FROM laboratory_tests
   WHERE patient_id = ?
   ORDER BY test_date DESC
`);

const billingRows = db.prepare(`
  SELECT
    b.id,
    b.invoice_no AS invoiceNo,
    b.total,
    b.status,
    b.method,
    b.issued_at  AS issuedAt
  FROM billing_records b
  WHERE (@patientId IS NOT NULL AND b.patient_id = @patientId)
     OR (@userId    IS NOT NULL AND b.user_id    = @userId)
  ORDER BY b.issued_at DESC
`);

const dischargeRows = db.prepare(`
  SELECT
    s.id,
    s.admitted_on            AS admittedOn,
    s.discharged_on          AS dischargedOn,
    s.diagnosis,
    s.treatment_summary      AS treatmentSummary,
    s.condition_on_discharge AS conditionOnDischarge,
    d.name                   AS doctorName
  FROM discharge_summaries s
  LEFT JOIN doctors d ON d.id = s.doctor_id
  WHERE s.patient_id = ?
  ORDER BY s.discharged_on DESC
`);

/* A date-only column still has to sort against datetime columns from
   other tables; giving it midday rather than midnight keeps a visit
   recorded on the same day as a prescription from always sorting to
   the very bottom of that day. */
function dayAt(date, time) {
  if (!date) return null;
  if (time) return `${date} ${time}`;
  return `${date} 12:00`;
}

/**
 * Build the merged, newest-first timeline for one patient.
 *
 * `kinds` optionally narrows which sources are included.
 */
export async function buildTimeline({ patientId, userId }, { kinds } = {}) {
  const wanted = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
  const include = (kind) => !wanted || wanted.has(kind);

  const params = { patientId: patientId ?? null, userId: userId ?? null };
  const events = [];

  if (include("appointment")) {
    for (const row of await appointmentRows.all(params)) {
      events.push({
        kind: "appointment",
        id: row.id,
        at: dayAt(row.date, row.time),
        title: row.doctorName ? `Consultation — ${row.doctorName}` : "Consultation",
        summary: row.reason || null,
        meta: {
          status: row.status,
          department: row.departmentName,
          mode: row.mode || "in_person",
          time: row.time,
          notes: row.notes,
        },
      });
    }
  }

  if (patientId && include("diagnosis")) {
    for (const row of await historyRows.all(patientId)) {
      events.push({
        kind: "diagnosis",
        id: row.id,
        at: row.recordedAt,
        title: row.diagnosis || "Clinical note",
        summary: row.treatment || row.symptoms || row.notes || null,
        meta: {
          doctor: row.doctorName,
          symptoms: row.symptoms,
          treatment: row.treatment,
          notes: row.notes,
          followUpDate: row.followUpDate,
        },
      });
    }
  }

  if (patientId && include("prescription")) {
    for (const row of await prescriptionRows.all(patientId)) {
      events.push({
        kind: "prescription",
        id: row.id,
        at: row.createdAt,
        title: row.medicine,
        summary: [row.dosage, row.frequency, row.duration].filter(Boolean).join(" · ") || null,
        meta: {
          doctor: row.doctorName,
          dosage: row.dosage,
          frequency: row.frequency,
          duration: row.duration,
          instructions: row.instructions,
        },
      });
    }
  }

  if (include("report")) {
    for (const row of await reportRows.all(params)) {
      events.push({
        kind: "report",
        id: row.id,
        at: dayAt(row.reportDate),
        title: row.title,
        summary: row.result || row.description || null,
        meta: {
          type: row.type,
          status: row.status,
          hasFile: Boolean(row.fileName),
        },
      });
    }
  }

  if (patientId && include("lab")) {
    for (const row of await labRows.all(patientId)) {
      events.push({
        kind: "lab",
        id: row.id,
        at: dayAt(row.testDate),
        title: row.testName,
        summary: row.result && row.result !== "Pending" ? row.result : null,
        meta: {
          category: row.category,
          status: row.status,
          result: row.result,
          price: row.price,
        },
      });
    }
  }

  if (include("billing")) {
    for (const row of await billingRows.all(params)) {
      events.push({
        kind: "billing",
        id: row.id,
        at: dayAt(row.issuedAt),
        title: `Invoice ${row.invoiceNo}`,
        summary: null,
        meta: { total: row.total, status: row.status, method: row.method },
      });
    }
  }

  if (patientId && include("discharge")) {
    for (const row of await dischargeRows.all(patientId)) {
      events.push({
        kind: "discharge",
        id: row.id,
        at: dayAt(row.dischargedOn),
        title: "Discharged",
        summary: row.diagnosis || row.treatmentSummary || null,
        meta: {
          doctor: row.doctorName,
          admittedOn: row.admittedOn,
          dischargedOn: row.dischargedOn,
          condition: row.conditionOnDischarge,
        },
      });
    }
  }

  /* Undated rows exist (a lab test with no date, say). They sort last
     rather than being dropped — hiding a record because a field is
     blank would be worse than showing it at the bottom. */
  events.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
  });

  const counts = events.reduce((acc, event) => {
    acc[event.kind] = (acc[event.kind] || 0) + 1;
    return acc;
  }, {});

  return { events, counts, total: events.length };
}

export default { resolvePatientScope, buildTimeline };
