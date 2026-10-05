import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import notify from "../utils/notify.js";
import { publicReport } from "../utils/sanitize.js";
import { deleteFile, readFile } from "../utils/storage.js";

const SELECT_REPORT = `
  SELECT r.*,
         p.name AS patient_display_name,
         u.name AS owner_name,
         u.email AS owner_email
    FROM reports r
    LEFT JOIN patients p ON p.id = r.patient_id
    LEFT JOIN users    u ON u.id = r.user_id
`;

const findById = db.prepare(`${SELECT_REPORT} WHERE r.id = ?`);

export async function listReports({ userId = null, search = "", status = "", type = "" } = {}) {
  const where = [];
  const params = {};

  if (userId) {
    where.push("r.user_id = @userId");
    params.userId = Number(userId);
  }

  if (search) {
    where.push(`(
      r.title LIKE @search OR r.type LIKE @search OR
      r.result LIKE @search OR r.description LIKE @search OR
      u.name LIKE @search OR u.email LIKE @search
    )`);
    params.search = `%${search}%`;
  }

  if (status && status !== "All") {
    where.push("r.status = @status");
    params.status = status;
  }

  if (type && type !== "All") {
    where.push("r.type = @type");
    params.type = type;
  }

  const sql = `
    ${SELECT_REPORT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.report_date DESC, r.id DESC
  `;

  const rows = await db.prepare(sql).all(params);
  return rows.map(publicReport);
}

/**
 * Fetches a report and enforces ownership.
 * A user asking for someone else's report gets 403, never the row.
 */
export async function getOwnedReport(id, user) {
  const row = await findById.get(Number(id));
  if (!row) throw ApiError.notFound("Report not found.");

  if (user.role !== "admin" && row.user_id !== user.id) {
    throw ApiError.forbidden("You can only access your own reports.");
  }

  return row;
}

export async function getReport(id, user) {
  return publicReport(await getOwnedReport(id, user));
}

export async function createReport(actor, payload, file = null) {
  const userId = Number(payload.userId);

  const owner = await db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(userId);
  if (!owner) throw ApiError.validation({ userId: "Select a valid patient account." });

  let patientId = payload.patientId ? Number(payload.patientId) : null;

  if (!patientId) {
    const profile = await db
      .prepare(`SELECT id FROM patients WHERE user_id = ? ORDER BY id LIMIT 1`)
      .get(userId);
    patientId = profile?.id ?? null;
  }

  const result = await db
    .prepare(
      `INSERT INTO reports
         (user_id, patient_id, title, type, description, result, status,
          report_date, file_path, file_name, mime_type, file_size, created_by)
       VALUES
         (@user_id, @patient_id, @title, @type, @description, @result, @status,
          @report_date, @file_path, @file_name, @mime_type, @file_size, @created_by)`
    )
    .run({
      user_id: userId,
      patient_id: patientId,
      title: String(payload.title).trim(),
      type: payload.type || "Laboratory",
      description: payload.description ? String(payload.description).trim() : null,
      result: payload.result ? String(payload.result).trim() : null,
      status: payload.status || "Pending",
      report_date: payload.reportDate,
      file_path: file?.storedName || null,
      file_name: file?.originalName || null,
      mime_type: file?.mimeType || null,
      file_size: file?.size || null,
      created_by: actor.id,
    });

  await notify(userId, {
    title: "New report available",
    message: `"${String(payload.title).trim()}" has been added to your records.`,
    type: "info",
    link: "/my-reports",
  });

  return publicReport(await findById.get(result.lastInsertRowid));
}

export async function updateReport(id, payload) {
  const existing = await findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Report not found.");

  await db.prepare(
    `UPDATE reports
        SET title = @title, type = @type, description = @description,
            result = @result, status = @status, report_date = @report_date,
            updated_at = datetime('now')
      WHERE id = @id`
  ).run({
    id: Number(id),
    title: String(payload.title).trim(),
    type: payload.type || existing.type,
    description: payload.description ? String(payload.description).trim() : null,
    result: payload.result ? String(payload.result).trim() : null,
    status: payload.status || existing.status,
    report_date: payload.reportDate || existing.report_date,
  });

  return publicReport(await findById.get(Number(id)));
}

export async function deleteReport(id) {
  const existing = await findById.get(Number(id));
  if (!existing) throw ApiError.notFound("Report not found.");

  if (existing.file_path) {
    await deleteFile(existing.file_path);
  }

  await db.prepare(`DELETE FROM reports WHERE id = ?`).run(Number(id));
  return { id: Number(id), title: existing.title };
}

/** Reads the stored file back for a download, wherever it lives. */
export async function resolveReportFile(row) {
  if (!row.file_path) {
    throw ApiError.notFound("This report does not have an attached file.");
  }

  const stored = await readFile(row.file_path);
  if (!stored) {
    throw ApiError.notFound("The stored file could not be located.");
  }

  return stored;
}

export async function reportStats(userId = null) {
  const scope = userId ? "WHERE user_id = @userId" : "";
  const params = userId ? { userId: Number(userId) } : {};

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'Pending'   THEN 1 ELSE 0 END) AS pending
         FROM reports ${scope}`
    )
    .get(params);

  return {
    total: row.total || 0,
    completed: row.completed || 0,
    pending: row.pending || 0,
  };
}
