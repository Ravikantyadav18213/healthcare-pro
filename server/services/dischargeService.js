import db from "../db.js";
import ApiError from "../utils/ApiError.js";

/* ==================================================================
   DISCHARGE SUMMARIES

   Written when a patient leaves. Creating one is the moment the rest
   of the record settles: the patient's status becomes Discharged and
   whatever bed they held goes back into the pool, both in the same
   transaction as the summary itself. Leaving those to a separate
   click is how wards end up with beds that look occupied by people
   who went home last week.
================================================================== */

const baseSelect = `
  SELECT
    s.id,
    s.patient_id             AS patientId,
    s.doctor_id              AS doctorId,
    s.admitted_on            AS admittedOn,
    s.discharged_on          AS dischargedOn,
    s.diagnosis,
    s.treatment_summary      AS treatmentSummary,
    s.medications,
    s.follow_up_instructions AS followUpInstructions,
    s.condition_on_discharge AS conditionOnDischarge,
    s.created_at             AS createdAt,
    p.name                   AS patientName,
    p.gender,
    p.date_of_birth          AS dateOfBirth,
    p.phone                  AS patientPhone,
    p.blood_group            AS bloodGroup,
    d.name                   AS doctorName,
    d.specialization,
    dep.name                 AS departmentName,
    u.name                   AS createdByName
  FROM discharge_summaries s
  JOIN patients p           ON p.id = s.patient_id
  LEFT JOIN doctors d       ON d.id = s.doctor_id
  LEFT JOIN departments dep ON dep.id = d.department_id
  LEFT JOIN users u         ON u.id = s.created_by
`;

const getOne = db.prepare(`${baseSelect} WHERE s.id = ?`);

const listStmt = db.prepare(`
  ${baseSelect}
  WHERE (@patientId IS NULL OR s.patient_id = @patientId)
  ORDER BY s.discharged_on DESC, s.id DESC
  LIMIT @limit
`);

export async function listSummaries({ patientId = null, limit = 100 } = {}) {
  return listStmt.all({
    patientId: patientId ? Number(patientId) : null,
    limit: Number(limit) || 100,
  });
}

export async function getSummary(id) {
  const row = await getOne.get(id);
  if (!row) throw ApiError.notFound("Discharge summary not found.");
  return row;
}

/** Summaries a given patient login may read (their own only). */
export async function listForUser(userId) {
  const patient = await db
    .prepare(`SELECT id FROM patients WHERE user_id = ?`)
    .get(userId);

  if (!patient) return [];

  return listSummaries({ patientId: patient.id });
}

export const createSummary = db.transaction(async (payload) => {
  const {
    patientId,
    doctorId,
    admittedOn,
    dischargedOn,
    diagnosis,
    treatmentSummary,
    medications,
    followUpInstructions,
    conditionOnDischarge,
    createdBy,
  } = payload;

  const patient = await db
    .prepare(`SELECT id, bed_id AS bedId FROM patients WHERE id = ?`)
    .get(patientId);

  if (!patient) throw ApiError.notFound("Patient not found.");

  const info = await db
    .prepare(
      `INSERT INTO discharge_summaries
         (patient_id, doctor_id, admitted_on, discharged_on, diagnosis,
          treatment_summary, medications, follow_up_instructions,
          condition_on_discharge, created_by)
       VALUES
         (@patientId, @doctorId, @admittedOn, @dischargedOn, @diagnosis,
          @treatmentSummary, @medications, @followUpInstructions,
          @conditionOnDischarge, @createdBy)`
    )
    .run({
      patientId: Number(patientId),
      doctorId: doctorId ? Number(doctorId) : null,
      admittedOn: admittedOn || null,
      dischargedOn,
      diagnosis: diagnosis || null,
      treatmentSummary: treatmentSummary || null,
      medications: medications || null,
      followUpInstructions: followUpInstructions || null,
      conditionOnDischarge: conditionOnDischarge || null,
      createdBy: createdBy ? Number(createdBy) : null,
    });

  await db
    .prepare(
      `UPDATE patients
          SET status = 'Discharged', bed_id = NULL, updated_at = datetime('now')
        WHERE id = ?`
    )
    .run(Number(patientId));

  if (patient.bedId) {
    await db
      .prepare(
        `UPDATE beds
            SET status = 'available', patient_id = NULL, occupied_at = NULL,
                updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(patient.bedId);
  }

  return getOne.get(info.lastInsertRowid);
});

export async function updateSummary(id, payload) {
  const existing = await getOne.get(id);
  if (!existing) throw ApiError.notFound("Discharge summary not found.");

  await db
    .prepare(
      `UPDATE discharge_summaries
          SET doctor_id              = @doctorId,
              admitted_on            = @admittedOn,
              discharged_on          = @dischargedOn,
              diagnosis              = @diagnosis,
              treatment_summary      = @treatmentSummary,
              medications            = @medications,
              follow_up_instructions = @followUpInstructions,
              condition_on_discharge = @conditionOnDischarge,
              updated_at             = datetime('now')
        WHERE id = @id`
    )
    .run({
      id,
      doctorId:
        payload.doctorId === undefined
          ? existing.doctorId
          : payload.doctorId
          ? Number(payload.doctorId)
          : null,
      admittedOn: payload.admittedOn ?? existing.admittedOn,
      dischargedOn: payload.dischargedOn ?? existing.dischargedOn,
      diagnosis: payload.diagnosis ?? existing.diagnosis,
      treatmentSummary: payload.treatmentSummary ?? existing.treatmentSummary,
      medications: payload.medications ?? existing.medications,
      followUpInstructions: payload.followUpInstructions ?? existing.followUpInstructions,
      conditionOnDischarge: payload.conditionOnDischarge ?? existing.conditionOnDischarge,
    });

  return getOne.get(id);
}

export async function removeSummary(id) {
  const existing = await getOne.get(id);
  if (!existing) throw ApiError.notFound("Discharge summary not found.");

  await db.prepare(`DELETE FROM discharge_summaries WHERE id = ?`).run(id);
  return { id };
}

export default {
  listSummaries,
  listForUser,
  getSummary,
  createSummary,
  updateSummary,
  removeSummary,
};
