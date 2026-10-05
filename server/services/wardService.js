import db from "../db.js";
import ApiError from "../utils/ApiError.js";

/* ==================================================================
   WARDS + BEDS

   The ward board answers one question: which beds are free right now,
   and who is in the rest. Occupancy therefore lives on the bed row
   itself (status + patient_id) rather than being derived from a
   separate admissions log — a board that has to reconstruct current
   state from history is a board that goes stale.

   `patients.bed_id` mirrors the link so a patient record can name its
   bed without scanning the whole ward; assign/release keep the two
   sides in step inside one transaction.
================================================================== */

const listWardsStmt = db.prepare(`
  SELECT
    w.id,
    w.name,
    w.kind,
    w.floor,
    w.notes,
    w.department_id AS departmentId,
    d.name          AS departmentName,
    COUNT(b.id)                                                   AS totalBeds,
    SUM(CASE WHEN b.status = 'available'   THEN 1 ELSE 0 END)      AS availableBeds,
    SUM(CASE WHEN b.status = 'occupied'    THEN 1 ELSE 0 END)      AS occupiedBeds,
    SUM(CASE WHEN b.status = 'reserved'    THEN 1 ELSE 0 END)      AS reservedBeds,
    SUM(CASE WHEN b.status = 'maintenance' THEN 1 ELSE 0 END)      AS maintenanceBeds
  FROM wards w
  LEFT JOIN departments d ON d.id = w.department_id
  LEFT JOIN beds b        ON b.ward_id = w.id
  WHERE (@wardId IS NULL OR w.id = @wardId)
  GROUP BY w.id
  ORDER BY w.name
`);

const listBedsStmt = db.prepare(`
  SELECT
    b.id,
    b.ward_id    AS wardId,
    b.label,
    b.status,
    b.patient_id AS patientId,
    b.occupied_at AS occupiedAt,
    b.notes,
    p.name       AS patientName,
    w.name       AS wardName,
    w.kind       AS wardKind
  FROM beds b
  JOIN wards w      ON w.id = b.ward_id
  LEFT JOIN patients p ON p.id = b.patient_id
  WHERE (@wardId IS NULL OR b.ward_id = @wardId)
    AND (@status IS NULL OR b.status  = @status)
  ORDER BY w.name, b.label
`);

const getWard = db.prepare(`SELECT * FROM wards WHERE id = ?`);
const getBed = db.prepare(`SELECT * FROM beds WHERE id = ?`);
const getPatient = db.prepare(`SELECT id, name FROM patients WHERE id = ?`);

/* A nurse with an assigned ward only ever sees that one ward — the
   caller passes it in, we don't ask "which ward do you want" for
   someone who isn't allowed to answer "any of them". */
export async function listWards({ assignedWardId = null } = {}) {
  return listWardsStmt.all({ wardId: assignedWardId ? Number(assignedWardId) : null });
}

export async function listBeds({ wardId = null, status = null, assignedWardId = null } = {}) {
  const effectiveWardId = assignedWardId ? Number(assignedWardId) : wardId ? Number(wardId) : null;

  return listBedsStmt.all({
    wardId: effectiveWardId,
    status: status || null,
  });
}

export async function wardStats({ assignedWardId = null } = {}) {
  const wardId = assignedWardId ? Number(assignedWardId) : null;

  const row = await db
    .prepare(
      `SELECT
         COUNT(*)                                                AS totalBeds,
         SUM(CASE WHEN status = 'available'   THEN 1 ELSE 0 END) AS available,
         SUM(CASE WHEN status = 'occupied'    THEN 1 ELSE 0 END) AS occupied,
         SUM(CASE WHEN status = 'reserved'    THEN 1 ELSE 0 END) AS reserved,
         SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance
       FROM beds
       WHERE (@wardId IS NULL OR ward_id = @wardId)`
    )
    .get({ wardId });

  const wards = (
    await db
      .prepare(`SELECT COUNT(*) AS c FROM wards WHERE (@wardId IS NULL OR id = @wardId)`)
      .get({ wardId })
  ).c;

  const totalBeds = row.totalBeds || 0;

  return {
    wards,
    totalBeds,
    available: row.available || 0,
    occupied: row.occupied || 0,
    reserved: row.reserved || 0,
    maintenance: row.maintenance || 0,
    occupancyRate: totalBeds ? Math.round(((row.occupied || 0) / totalBeds) * 100) : 0,
  };
}

/* ---------------------------------------------------------------- */

export async function createWard({ name, kind, floor, departmentId, notes }) {
  const exists = await db
    .prepare(`SELECT id FROM wards WHERE name = ? COLLATE NOCASE`)
    .get(name);

  if (exists) throw ApiError.conflict("A ward with that name already exists.");

  const info = await db
    .prepare(
      `INSERT INTO wards (name, kind, floor, department_id, notes)
       VALUES (@name, @kind, @floor, @departmentId, @notes)`
    )
    .run({
      name,
      kind: kind || "general",
      floor: floor || null,
      departmentId: departmentId ? Number(departmentId) : null,
      notes: notes || null,
    });

  return getWard.get(info.lastInsertRowid);
}

export async function updateWard(id, { name, kind, floor, departmentId, notes }) {
  const ward = await getWard.get(id);
  if (!ward) throw ApiError.notFound("Ward not found.");

  if (name && name !== ward.name) {
    const clash = await db
      .prepare(`SELECT id FROM wards WHERE name = ? COLLATE NOCASE AND id <> ?`)
      .get(name, id);

    if (clash) throw ApiError.conflict("A ward with that name already exists.");
  }

  await db
    .prepare(
      `UPDATE wards
          SET name = @name, kind = @kind, floor = @floor,
              department_id = @departmentId, notes = @notes,
              updated_at = datetime('now')
        WHERE id = @id`
    )
    .run({
      id,
      name: name ?? ward.name,
      kind: kind ?? ward.kind,
      floor: floor ?? ward.floor,
      departmentId:
        departmentId === undefined ? ward.department_id : departmentId ? Number(departmentId) : null,
      notes: notes ?? ward.notes,
    });

  return getWard.get(id);
}

export async function removeWard(id) {
  const ward = await getWard.get(id);
  if (!ward) throw ApiError.notFound("Ward not found.");

  const occupied = (
    await db
      .prepare(`SELECT COUNT(*) AS c FROM beds WHERE ward_id = ? AND status = 'occupied'`)
      .get(id)
  ).c;

  /* Deleting the ward would cascade its beds away and silently strand
     the patients lying in them. */
  if (occupied > 0) {
    throw ApiError.conflict(
      `This ward still has ${occupied} occupied bed${occupied === 1 ? "" : "s"}. Discharge or move those patients first.`
    );
  }

  await db.prepare(`DELETE FROM wards WHERE id = ?`).run(id);
  return { id };
}

/* ---------------------------------------------------------------- */

export async function createBed({ wardId, label, status, notes }) {
  const ward = await getWard.get(wardId);
  if (!ward) throw ApiError.notFound("Ward not found.");

  const clash = await db
    .prepare(`SELECT id FROM beds WHERE ward_id = ? AND label = ? COLLATE NOCASE`)
    .get(wardId, label);

  if (clash) throw ApiError.conflict(`Bed "${label}" already exists in this ward.`);

  const info = await db
    .prepare(
      `INSERT INTO beds (ward_id, label, status, notes)
       VALUES (@wardId, @label, @status, @notes)`
    )
    .run({
      wardId: Number(wardId),
      label,
      status: status || "available",
      notes: notes || null,
    });

  return getBed.get(info.lastInsertRowid);
}

/**
 * Add several beds at once ("Bed 1".."Bed 12").
 *
 * Labels that already exist are skipped rather than failing the whole
 * batch — re-running to top a ward up is the normal case.
 */
export async function createBedRange({ wardId, prefix = "Bed", from, to }) {
  const ward = await getWard.get(wardId);
  if (!ward) throw ApiError.notFound("Ward not found.");

  const start = Number(from);
  const end = Number(to);

  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
    throw ApiError.badRequest("Give a valid bed number range.");
  }

  if (end - start + 1 > 200) {
    throw ApiError.badRequest("Add at most 200 beds at a time.");
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO beds (ward_id, label, status) VALUES (?, ?, 'available')`
  );

  const run = db.transaction(async () => {
    let added = 0;

    for (let n = start; n <= end; n += 1) {
      const info = await insert.run(Number(wardId), `${prefix} ${n}`.trim());
      if (info.changes) added += 1;
    }

    return added;
  });

  const added = await run();

  return { added, skipped: end - start + 1 - added };
}

export async function updateBed(id, { label, status, notes }) {
  const bed = await getBed.get(id);
  if (!bed) throw ApiError.notFound("Bed not found.");

  /* Marking an occupied bed as anything else without going through
     release would leave patients.bed_id pointing at a bed that no
     longer claims them. */
  if (bed.status === "occupied" && status && status !== "occupied") {
    throw ApiError.conflict(
      "This bed is occupied. Release the patient from it before changing its status."
    );
  }

  await db
    .prepare(
      `UPDATE beds
          SET label = @label, status = @status, notes = @notes,
              updated_at = datetime('now')
        WHERE id = @id`
    )
    .run({
      id,
      label: label ?? bed.label,
      status: status ?? bed.status,
      notes: notes ?? bed.notes,
    });

  return getBed.get(id);
}

export async function removeBed(id) {
  const bed = await getBed.get(id);
  if (!bed) throw ApiError.notFound("Bed not found.");

  if (bed.status === "occupied") {
    throw ApiError.conflict("This bed is occupied. Release the patient first.");
  }

  await db.prepare(`DELETE FROM beds WHERE id = ?`).run(id);
  return { id };
}

/* ---------------------------------------------------------------- */

/**
 * Put a patient in a bed.
 *
 * Both sides of the link are written in one transaction, and any bed
 * the patient already held is released first — a patient occupying
 * two beds at once is not a state the board can render honestly.
 */
export const assignBed = db.transaction(async ({ bedId, patientId }) => {
  const bed = await getBed.get(bedId);
  if (!bed) throw ApiError.notFound("Bed not found.");

  if (bed.status === "occupied" && bed.patient_id !== Number(patientId)) {
    throw ApiError.conflict("That bed is already occupied.");
  }

  if (bed.status === "maintenance") {
    throw ApiError.conflict("That bed is out of service.");
  }

  const patient = await getPatient.get(patientId);
  if (!patient) throw ApiError.notFound("Patient not found.");

  await db
    .prepare(
      `UPDATE beds
          SET status = 'available', patient_id = NULL, occupied_at = NULL,
              updated_at = datetime('now')
        WHERE patient_id = ? AND id <> ?`
    )
    .run(Number(patientId), Number(bedId));

  await db
    .prepare(
      `UPDATE beds
          SET status = 'occupied', patient_id = @patientId,
              occupied_at = datetime('now'), updated_at = datetime('now')
        WHERE id = @bedId`
    )
    .run({ bedId: Number(bedId), patientId: Number(patientId) });

  await db
    .prepare(
      `UPDATE patients SET bed_id = @bedId, updated_at = datetime('now') WHERE id = @patientId`
    )
    .run({ bedId: Number(bedId), patientId: Number(patientId) });

  return getBed.get(bedId);
});

export const releaseBed = db.transaction(async (bedId) => {
  const bed = await getBed.get(bedId);
  if (!bed) throw ApiError.notFound("Bed not found.");

  if (bed.patient_id) {
    await db
      .prepare(
        `UPDATE patients SET bed_id = NULL, updated_at = datetime('now') WHERE id = ?`
      )
      .run(bed.patient_id);
  }

  await db
    .prepare(
      `UPDATE beds
          SET status = 'available', patient_id = NULL, occupied_at = NULL,
              updated_at = datetime('now')
        WHERE id = ?`
    )
    .run(bedId);

  return getBed.get(bedId);
});

export default {
  listWards,
  listBeds,
  wardStats,
  createWard,
  updateWard,
  removeWard,
  createBed,
  createBedRange,
  updateBed,
  removeBed,
  assignBed,
  releaseBed,
};
