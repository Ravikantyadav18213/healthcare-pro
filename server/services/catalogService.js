import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { emitToAdmins } from "../sockets/index.js";

/* ==================================================================
   DEPARTMENTS
================================================================== */

export function listDepartments({ includeInactive = false } = {}) {
  const rows = db
    .prepare(
      `SELECT dep.*,
              (SELECT COUNT(*) FROM doctors d
                WHERE d.department_id = dep.id AND d.status = 'active') AS doctor_count,
              (SELECT COUNT(*) FROM patients p
                WHERE p.department_id = dep.id) AS patient_count
         FROM departments dep
        ${includeInactive ? "" : "WHERE dep.status = 'active'"}
        ORDER BY dep.name COLLATE NOCASE`
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    headDoctor: row.head_doctor,
    status: row.status,
    doctors: row.doctor_count,
    patients: row.patient_count,
  }));
}

export function createDepartment(payload) {
  const name = String(payload.name).trim();

  const exists = db.prepare(`SELECT id FROM departments WHERE name = ?`).get(name);
  if (exists) throw ApiError.conflict("A department with this name already exists.");

  const result = db
    .prepare(
      `INSERT INTO departments (name, description, head_doctor) VALUES (?, ?, ?)`
    )
    .run(
      name,
      payload.description ? String(payload.description).trim() : null,
      payload.headDoctor ? String(payload.headDoctor).trim() : null
    );

  return listDepartments({ includeInactive: true }).find(
    (dept) => dept.id === Number(result.lastInsertRowid)
  );
}

export function updateDepartment(id, payload) {
  const existing = db.prepare(`SELECT * FROM departments WHERE id = ?`).get(Number(id));
  if (!existing) throw ApiError.notFound("Department not found.");

  db.prepare(
    `UPDATE departments
        SET name = ?, description = ?, head_doctor = ?, status = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  ).run(
    String(payload.name).trim(),
    payload.description ? String(payload.description).trim() : null,
    payload.headDoctor ? String(payload.headDoctor).trim() : null,
    payload.status === "inactive" ? "inactive" : "active",
    Number(id)
  );

  return listDepartments({ includeInactive: true }).find(
    (dept) => dept.id === Number(id)
  );
}

export function deleteDepartment(id) {
  const existing = db.prepare(`SELECT * FROM departments WHERE id = ?`).get(Number(id));
  if (!existing) throw ApiError.notFound("Department not found.");

  const doctors = db
    .prepare(`SELECT COUNT(*) AS n FROM doctors WHERE department_id = ?`)
    .get(Number(id)).n;

  if (doctors > 0) {
    throw ApiError.conflict(
      `${doctors} doctor(s) belong to this department. Reassign them first.`
    );
  }

  db.prepare(`DELETE FROM departments WHERE id = ?`).run(Number(id));
  return { id: Number(id), name: existing.name };
}

/* ==================================================================
   PHARMACY
================================================================== */

const mapPharmacy = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  stock: row.stock,
  price: row.unit_price,
  supplier: row.supplier,
  expiry: row.expiry_date,
  status: row.status,
  lowStock: row.stock <= 50,
});

export function listPharmacy({ search = "", category = "" } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(name LIKE @search OR category LIKE @search OR supplier LIKE @search)");
    params.search = `%${search}%`;
  }

  if (category && category !== "All") {
    where.push("category = @category");
    params.category = category;
  }

  return db
    .prepare(
      `SELECT * FROM pharmacy_items
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY name COLLATE NOCASE`
    )
    .all(params)
    .map(mapPharmacy);
}

export function createPharmacyItem(payload) {
  const result = db
    .prepare(
      `INSERT INTO pharmacy_items
         (name, category, stock, unit_price, supplier, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(payload.name).trim(),
      payload.category ? String(payload.category).trim() : null,
      Number(payload.stock) || 0,
      Number(payload.price) || 0,
      payload.supplier ? String(payload.supplier).trim() : null,
      payload.expiry || null
    );

  const created = mapPharmacy(
    db.prepare(`SELECT * FROM pharmacy_items WHERE id = ?`).get(result.lastInsertRowid)
  );

  /* Moves the Pharmacy Stock tile on the dashboard. */
  emitToAdmins("dashboard:stats-changed", { source: "pharmacy" });

  return created;
}

export function updatePharmacyItem(id, payload) {
  const existing = db
    .prepare(`SELECT * FROM pharmacy_items WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Pharmacy item not found.");

  db.prepare(
    `UPDATE pharmacy_items
        SET name = ?, category = ?, stock = ?, unit_price = ?,
            supplier = ?, expiry_date = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(
    String(payload.name).trim(),
    payload.category ? String(payload.category).trim() : null,
    Number(payload.stock) || 0,
    Number(payload.price) || 0,
    payload.supplier ? String(payload.supplier).trim() : null,
    payload.expiry || null,
    Number(id)
  );

  const updated = mapPharmacy(
    db.prepare(`SELECT * FROM pharmacy_items WHERE id = ?`).get(Number(id))
  );

  emitToAdmins("dashboard:stats-changed", { source: "pharmacy" });

  return updated;
}

export function deletePharmacyItem(id) {
  const existing = db
    .prepare(`SELECT * FROM pharmacy_items WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Pharmacy item not found.");

  db.prepare(`DELETE FROM pharmacy_items WHERE id = ?`).run(Number(id));

  emitToAdmins("dashboard:stats-changed", { source: "pharmacy" });

  return { id: Number(id), name: existing.name };
}

/* ==================================================================
   LABORATORY
================================================================== */

const mapLab = (row) => ({
  id: row.id,
  patientId: row.patient_id,
  patient: row.patient_name,
  test: row.test_name,
  category: row.category,
  price: row.price,
  date: row.test_date,
  status: row.status,
  result: row.result,
});

export function listLabTests({ search = "", status = "" } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(patient_name LIKE @search OR test_name LIKE @search OR category LIKE @search)");
    params.search = `%${search}%`;
  }

  if (status && status !== "All") {
    where.push("status = @status");
    params.status = status;
  }

  return db
    .prepare(
      `SELECT * FROM laboratory_tests
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY test_date DESC, id DESC`
    )
    .all(params)
    .map(mapLab);
}

export function createLabTest(payload) {
  const result = db
    .prepare(
      `INSERT INTO laboratory_tests
         (patient_id, patient_name, test_name, category, price, test_date, status, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.patientId ? Number(payload.patientId) : null,
      String(payload.patient).trim(),
      String(payload.test).trim(),
      payload.category ? String(payload.category).trim() : null,
      Number(payload.price) || 0,
      payload.date || new Date().toISOString().slice(0, 10),
      payload.status || "Scheduled",
      payload.result || "Pending"
    );

  return mapLab(
    db.prepare(`SELECT * FROM laboratory_tests WHERE id = ?`).get(result.lastInsertRowid)
  );
}

export function updateLabTest(id, payload) {
  const existing = db
    .prepare(`SELECT * FROM laboratory_tests WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Laboratory test not found.");

  db.prepare(
    `UPDATE laboratory_tests
        SET test_name = ?, category = ?, price = ?, test_date = ?,
            status = ?, result = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(
    payload.test ? String(payload.test).trim() : existing.test_name,
    payload.category ?? existing.category,
    Number(payload.price ?? existing.price),
    payload.date || existing.test_date,
    payload.status || existing.status,
    payload.result || existing.result,
    Number(id)
  );

  return mapLab(
    db.prepare(`SELECT * FROM laboratory_tests WHERE id = ?`).get(Number(id))
  );
}

export function deleteLabTest(id) {
  const existing = db
    .prepare(`SELECT * FROM laboratory_tests WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Laboratory test not found.");

  db.prepare(`DELETE FROM laboratory_tests WHERE id = ?`).run(Number(id));
  return { id: Number(id), name: existing.test_name };
}

/* ==================================================================
   BILLING
================================================================== */

const mapBilling = (row) => ({
  id: row.id,
  invoiceNo: row.invoice_no,
  patientId: row.patient_id,
  patient: row.patient_name,
  amount: row.amount,
  gst: row.tax,
  discount: row.discount,
  total: row.total,
  insurance: row.insurance,
  method: row.method,
  status: row.status,
  date: row.issued_at,
  paidAt: row.paid_at,
  collectedBy: row.collected_by_name || null,
});

export function listBilling({ search = "", status = "" } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push("(b.invoice_no LIKE @search OR b.patient_name LIKE @search OR b.insurance LIKE @search)");
    params.search = `%${search}%`;
  }

  if (status && status !== "All") {
    where.push("b.status = @status");
    params.status = status;
  }

  const items = db
    .prepare(
      `SELECT b.*, u.name AS collected_by_name
         FROM billing_records b
         LEFT JOIN users u ON u.id = b.collected_by
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY b.issued_at DESC, b.id DESC`
    )
    .all(params)
    .map(mapBilling);

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'Paid'    THEN total ELSE 0 END), 0) AS collected,
              COALESCE(SUM(CASE WHEN status = 'Pending' THEN total ELSE 0 END), 0) AS outstanding,
              COUNT(*) AS count
         FROM billing_records`
    )
    .get();

  return { items, totals };
}

export function createInvoice(payload) {
  const amount = Number(payload.amount) || 0;
  const tax = Number(payload.gst) || 0;
  const discount = Number(payload.discount) || 0;

  const next = db
    .prepare(`SELECT COALESCE(MAX(id), 1041) AS last FROM billing_records`)
    .get().last;

  const invoiceNo = payload.invoiceNo || `INV-${Number(next) + 1}`;

  const result = db
    .prepare(
      `INSERT INTO billing_records
         (invoice_no, patient_id, patient_name, amount, tax, discount,
          total, insurance, method, status, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      invoiceNo,
      payload.patientId ? Number(payload.patientId) : null,
      String(payload.patient).trim(),
      amount,
      tax,
      discount,
      amount + tax - discount,
      payload.insurance || "None",
      payload.method || null,
      payload.status || "Pending",
      payload.date || new Date().toISOString().slice(0, 10)
    );

  const created = mapBilling(
    db.prepare(`SELECT * FROM billing_records WHERE id = ?`).get(result.lastInsertRowid)
  );

  /* Only moves Revenue Today when created straight into 'Paid', but
     that is a real path (payload.status), so check unconditionally
     is cheaper than the branch. */
  emitToAdmins("dashboard:stats-changed", { source: "billing" });

  return created;
}

/**
 * Correct a mistake in an invoice — a typo'd amount, the wrong GST or
 * discount, insurance entered wrong. Only while it is still Pending:
 * once money has actually changed hands (Paid) or the invoice was
 * voided (Cancelled), silently rewriting the numbers would falsify a
 * financial record instead of fixing a draft. A wrong Paid invoice is
 * a refund/credit-note conversation, not a quick edit.
 */
export function updateInvoice(id, payload) {
  const existing = db.prepare(`SELECT * FROM billing_records WHERE id = ?`).get(Number(id));
  if (!existing) throw ApiError.notFound("Invoice not found.");

  if (existing.status !== "Pending") {
    throw ApiError.conflict(
      `A ${existing.status.toLowerCase()} invoice cannot be edited — only a Pending one can.`
    );
  }

  const amount = Number(payload.amount) || 0;
  const tax = Number(payload.gst) || 0;
  const discount = Number(payload.discount) || 0;

  db.prepare(
    `UPDATE billing_records
        SET amount = ?, tax = ?, discount = ?, total = ?,
            insurance = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(amount, tax, discount, amount + tax - discount, payload.insurance || "None", Number(id));

  const updated = mapBilling(
    db.prepare(`SELECT * FROM billing_records WHERE id = ?`).get(Number(id))
  );

  emitToAdmins("dashboard:stats-changed", { source: "billing" });

  return updated;
}

export function updateInvoiceStatus(id, status) {
  const existing = db
    .prepare(`SELECT * FROM billing_records WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Invoice not found.");

  db.prepare(
    `UPDATE billing_records SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, Number(id));

  const updated = mapBilling(
    db.prepare(`SELECT * FROM billing_records WHERE id = ?`).get(Number(id))
  );

  /* This is the "Mark paid" action — the one that actually moves
     Revenue Today. */
  emitToAdmins("dashboard:stats-changed", { source: "billing" });

  return updated;
}

/* ==================================================================
   EMERGENCY
================================================================== */

const mapEmergency = (row) => ({
  id: row.id,
  name: row.patient_name,
  phone: row.phone,
  condition: row.condition,
  severity: row.severity,
  status: row.status,
  doctorId: row.doctor_id,
  arrivedAt: row.arrived_at,
  notes: row.notes,
});

export function emergencyOverview() {
  const cases = db
    .prepare(
      `SELECT * FROM emergency_cases
        WHERE status != 'Discharged'
        ORDER BY
          CASE severity WHEN 'Critical' THEN 0 WHEN 'Serious' THEN 1 ELSE 2 END,
          arrived_at DESC`
    )
    .all()
    .map(mapEmergency);

  const resources = db.prepare(`SELECT * FROM hospital_resources`).all();

  const ambulances = resources
    .filter((row) => row.kind === "ambulance")
    .map((row) => ({ id: row.label, status: row.value, location: row.meta }));

  const bloodBank = resources
    .filter((row) => row.kind === "blood")
    .map((row) => ({ type: row.label, units: Number(row.value) }));

  const icu = {
    total: Number(
      resources.find((r) => r.kind === "icu" && r.label === "total")?.value || 0
    ),
    occupied: Number(
      resources.find((r) => r.kind === "icu" && r.label === "occupied")?.value || 0
    ),
  };

  return { cases, ambulances, bloodBank, icuBeds: icu };
}

export function createEmergencyCase(payload) {
  const result = db
    .prepare(
      `INSERT INTO emergency_cases
         (patient_name, phone, condition, severity, status, doctor_id, arrived_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(payload.name).trim(),
      payload.phone ? String(payload.phone).trim() : null,
      payload.condition ? String(payload.condition).trim() : null,
      payload.severity || "Stable",
      payload.status || "Active",
      payload.doctorId ? Number(payload.doctorId) : null,
      payload.arrivedAt ||
        new Date().toTimeString().slice(0, 5),
      payload.notes ? String(payload.notes).trim() : null
    );

  const created = mapEmergency(
    db.prepare(`SELECT * FROM emergency_cases WHERE id = ?`).get(result.lastInsertRowid)
  );

  /* A new case is usually 'Active', which moves the Emergency Cases
     tile on the dashboard — push it to any admin looking at it right
     now instead of waiting for them to switch tabs or hit refresh. */
  emitToAdmins("dashboard:stats-changed", { source: "emergency", caseId: created.id });

  return created;
}

export function updateEmergencyCase(id, payload) {
  const existing = db
    .prepare(`SELECT * FROM emergency_cases WHERE id = ?`)
    .get(Number(id));

  if (!existing) throw ApiError.notFound("Emergency case not found.");

  db.prepare(
    `UPDATE emergency_cases
        SET severity = ?, status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(
    payload.severity || existing.severity,
    payload.status || existing.status,
    payload.notes ?? existing.notes,
    Number(id)
  );

  const updated = mapEmergency(
    db.prepare(`SELECT * FROM emergency_cases WHERE id = ?`).get(Number(id))
  );

  /* Status change is exactly what moves both Emergency Cases and
     Discharged Today — e.g. Active -> Discharged. */
  emitToAdmins("dashboard:stats-changed", { source: "emergency", caseId: updated.id });

  return updated;
}

/* ==================================================================
   AUDIT
================================================================== */

export function listAuditLogs({ search = "", action = "", limit = 100 } = {}) {
  const where = [];
  const params = { limit: Math.min(Number(limit) || 100, 500) };

  if (search) {
    where.push("(actor_email LIKE @search OR action LIKE @search OR details LIKE @search)");
    params.search = `%${search}%`;
  }

  if (action && action !== "All") {
    where.push("action = @action");
    params.action = action;
  }

  return db
    .prepare(
      `SELECT * FROM audit_logs
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit`
    )
    .all(params)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      details: row.details,
      ip: row.ip,
      createdAt: row.created_at,
    }));
}
