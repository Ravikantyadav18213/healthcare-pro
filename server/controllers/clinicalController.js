import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import ApiError from "../utils/ApiError.js";
import { validate, rules } from "../validators/index.js";
import db from "../db.js";

import * as timeline from "../services/timelineService.js";
import * as wards from "../services/wardService.js";
import * as discharge from "../services/dischargeService.js";
import * as video from "../services/videoService.js";
import * as payments from "../services/paymentService.js";
import { buildDischargePdf, buildPrescriptionPdf, buildReportPdf } from "../utils/pdf.js";

/* ==================================================================
   CLINICAL RECORDS

   Timeline, ward/bed board, discharge summaries and the printable
   documents that come out of them.
================================================================== */

/* ------------------------------------------------------------------
   TIMELINE
------------------------------------------------------------------ */

export const patientTimeline = asyncHandler(async (req, res) => {
  const scope = timeline.resolvePatientScope(req.user, req.query.patientId ?? req.params.patientId);

  const kinds = String(req.query.kinds || "")
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);

  const result = timeline.buildTimeline(scope, { kinds });

  res.json({
    success: true,
    patient: { id: scope.patientId, name: scope.name },
    ...result,
  });
});

/* ------------------------------------------------------------------
   WARDS + BEDS
------------------------------------------------------------------ */

export const listWards = asyncHandler(async (req, res) => {
  const assignedWardId = req.user.role === "nurse" ? req.user.assignedWardId : null;

  res.json({
    success: true,
    wards: wards.listWards({ assignedWardId }),
    stats: wards.wardStats({ assignedWardId }),
  });
});

export const listBeds = asyncHandler(async (req, res) => {
  const assignedWardId = req.user.role === "nurse" ? req.user.assignedWardId : null;

  res.json({
    success: true,
    beds: wards.listBeds({ wardId: req.query.wardId, status: req.query.status, assignedWardId }),
  });
});

export const createWard = asyncHandler(async (req, res) => {
  validate(req.body || {}, { name: rules.string({ min: 2, max: 80, label: "Ward name" }) });

  const ward = wards.createWard(req.body);

  audit(req, "ward_created", { entity: "ward", entityId: ward.id, details: ward.name });

  res.status(201).json({ success: true, ward });
});

export const updateWard = asyncHandler(async (req, res) => {
  const ward = wards.updateWard(Number(req.params.id), req.body || {});

  audit(req, "ward_updated", { entity: "ward", entityId: ward.id, details: ward.name });

  res.json({ success: true, ward });
});

export const removeWard = asyncHandler(async (req, res) => {
  const result = wards.removeWard(Number(req.params.id));

  audit(req, "ward_deleted", { entity: "ward", entityId: result.id });

  res.json({ success: true });
});

export const createBed = asyncHandler(async (req, res) => {
  const { wardId, label, from, to, prefix } = req.body || {};

  if (!wardId) throw ApiError.badRequest("A ward is required.");

  /* A range creates many beds at once; a label creates exactly one. */
  if (from != null && to != null) {
    const result = wards.createBedRange({ wardId, prefix, from, to });

    audit(req, "beds_created", {
      entity: "ward",
      entityId: Number(wardId),
      details: `${result.added} bed(s) added`,
    });

    return res.status(201).json({ success: true, ...result });
  }

  validate(req.body || {}, { label: rules.string({ min: 1, max: 40, label: "Bed label" }) });

  const bed = wards.createBed({ wardId, label, status: req.body.status, notes: req.body.notes });

  audit(req, "bed_created", { entity: "bed", entityId: bed.id, details: bed.label });

  res.status(201).json({ success: true, bed });
});

export const updateBed = asyncHandler(async (req, res) => {
  const bed = wards.updateBed(Number(req.params.id), req.body || {});

  audit(req, "bed_updated", { entity: "bed", entityId: bed.id, details: `${bed.label} → ${bed.status}` });

  res.json({ success: true, bed });
});

export const removeBed = asyncHandler(async (req, res) => {
  const result = wards.removeBed(Number(req.params.id));

  audit(req, "bed_deleted", { entity: "bed", entityId: result.id });

  res.json({ success: true });
});

export const assignBed = asyncHandler(async (req, res) => {
  const { patientId } = req.body || {};

  if (!patientId) throw ApiError.badRequest("A patient is required.");

  const bed = wards.assignBed({ bedId: Number(req.params.id), patientId });

  audit(req, "bed_assigned", {
    entity: "bed",
    entityId: bed.id,
    details: `patient ${patientId} → ${bed.label}`,
  });

  res.json({ success: true, bed });
});

export const releaseBed = asyncHandler(async (req, res) => {
  const bed = wards.releaseBed(Number(req.params.id));

  audit(req, "bed_released", { entity: "bed", entityId: bed.id, details: bed.label });

  res.json({ success: true, bed });
});

/* ------------------------------------------------------------------
   DISCHARGE SUMMARIES
------------------------------------------------------------------ */

export const listDischarges = asyncHandler(async (req, res) => {
  /* A patient sees only their own; staff may filter by patient. */
  const summaries =
    req.user.role === "user"
      ? discharge.listForUser(req.user.id)
      : discharge.listSummaries({ patientId: req.query.patientId });

  res.json({ success: true, summaries });
});

export const createDischarge = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    patientId: rules.integer({ min: 1, label: "Patient" }),
    dischargedOn: rules.date({ label: "Discharge date" }),
  });

  const summary = discharge.createSummary({
    ...req.body,
    createdBy: req.user.id,
  });

  audit(req, "discharge_summary_created", {
    entity: "patient",
    entityId: summary.patientId,
    details: `${summary.patientName} discharged ${summary.dischargedOn}`,
  });

  res.status(201).json({ success: true, summary });
});

export const updateDischarge = asyncHandler(async (req, res) => {
  const summary = discharge.updateSummary(Number(req.params.id), req.body || {});

  audit(req, "discharge_summary_updated", {
    entity: "patient",
    entityId: summary.patientId,
  });

  res.json({ success: true, summary });
});

export const removeDischarge = asyncHandler(async (req, res) => {
  discharge.removeSummary(Number(req.params.id));

  audit(req, "discharge_summary_deleted", { entity: "discharge", entityId: Number(req.params.id) });

  res.json({ success: true });
});

/* ------------------------------------------------------------------
   PDF DOCUMENTS

   Patients may download their own documents; staff may download
   anyone's. The ownership check happens here rather than in the PDF
   builders, which know nothing about who is asking.
------------------------------------------------------------------ */

function assertOwnPatient(req, patientUserId, patientId) {
  if (req.user.role !== "user") return;

  const own = db.prepare(`SELECT id FROM patients WHERE user_id = ?`).get(req.user.id);

  const matchesRecord = own && Number(own.id) === Number(patientId);
  const matchesLogin = patientUserId && Number(patientUserId) === Number(req.user.id);

  if (!matchesRecord && !matchesLogin) {
    throw ApiError.forbidden("You can only download your own documents.");
  }
}

function sendPdf(res, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res;
}

const prescriptionRows = db.prepare(`
  SELECT
    rx.id, rx.medicine, rx.dosage, rx.frequency, rx.duration, rx.instructions,
    rx.created_at AS createdAt,
    p.id   AS patientId, p.name AS patientName, p.gender,
    p.date_of_birth AS dateOfBirth, p.phone AS patientPhone,
    p.blood_group AS bloodGroup, p.user_id AS patientUserId,
    d.name AS doctorName, d.specialization
  FROM prescriptions rx
  JOIN patients p     ON p.id = rx.patient_id
  LEFT JOIN doctors d ON d.id = rx.doctor_id
  WHERE rx.patient_id = ?
  ORDER BY rx.created_at DESC
`);

const onePrescription = db.prepare(`
  SELECT
    rx.id, rx.medicine, rx.dosage, rx.frequency, rx.duration, rx.instructions,
    rx.created_at AS createdAt, rx.patient_id AS patientId,
    p.name AS patientName, p.gender, p.date_of_birth AS dateOfBirth,
    p.phone AS patientPhone, p.blood_group AS bloodGroup, p.user_id AS patientUserId,
    d.name AS doctorName, d.specialization
  FROM prescriptions rx
  JOIN patients p     ON p.id = rx.patient_id
  LEFT JOIN doctors d ON d.id = rx.doctor_id
  WHERE rx.id = ?
`);

export const prescriptionPdf = asyncHandler(async (req, res) => {
  const single = req.query.single === "1" || req.params.id;

  if (single && req.params.id) {
    const row = onePrescription.get(Number(req.params.id));
    if (!row) throw ApiError.notFound("Prescription not found.");

    assertOwnPatient(req, row.patientUserId, row.patientId);

    buildPrescriptionPdf(sendPdf(res, `prescription-${row.id}.pdf`), {
      ...row,
      documentDate: row.createdAt,
      items: [row],
    });

    return;
  }

  const patientId = Number(req.params.patientId || req.query.patientId);
  const rows = prescriptionRows.all(patientId);

  if (rows.length === 0) throw ApiError.notFound("No prescriptions found for this patient.");

  assertOwnPatient(req, rows[0].patientUserId, patientId);

  buildPrescriptionPdf(sendPdf(res, `prescriptions-PT-${patientId}.pdf`), {
    ...rows[0],
    documentDate: rows[0].createdAt,
    items: rows,
  });
});

export const dischargePdf = asyncHandler(async (req, res) => {
  const summary = discharge.getSummary(Number(req.params.id));

  const patientUserId = db
    .prepare(`SELECT user_id AS userId FROM patients WHERE id = ?`)
    .get(summary.patientId)?.userId;

  assertOwnPatient(req, patientUserId, summary.patientId);

  buildDischargePdf(sendPdf(res, `discharge-summary-${summary.id}.pdf`), summary);
});

const oneReport = db.prepare(`
  SELECT
    r.id, r.title, r.type, r.status, r.result, r.description,
    r.report_date AS reportDate, r.user_id AS patientUserId,
    r.patient_id  AS patientId,
    COALESCE(p.name, u.name)  AS patientName,
    COALESCE(p.gender, u.gender) AS gender,
    COALESCE(p.date_of_birth, u.date_of_birth) AS dateOfBirth,
    COALESCE(p.phone, u.phone) AS patientPhone,
    p.blood_group AS bloodGroup
  FROM reports r
  LEFT JOIN patients p ON p.id = r.patient_id
  LEFT JOIN users u    ON u.id = r.user_id
  WHERE r.id = ?
`);

export const reportPdf = asyncHandler(async (req, res) => {
  const row = oneReport.get(Number(req.params.id));
  if (!row) throw ApiError.notFound("Report not found.");

  assertOwnPatient(req, row.patientUserId, row.patientId);

  buildReportPdf(sendPdf(res, `report-RPT-${row.id}.pdf`), row);
});

/* ------------------------------------------------------------------
   ONLINE PAYMENTS
------------------------------------------------------------------ */

export const paymentStatus = asyncHandler(async (_req, res) => {
  res.json({ success: true, ...payments.paymentStatus() });
});

export const createPaymentOrder = asyncHandler(async (req, res) => {
  const order = await payments.createOrder(req.params.id, req.user);

  audit(req, "payment_order_created", {
    entity: "invoice",
    entityId: Number(req.params.id),
    details: `order ${order.orderId}`,
  });

  res.json({ success: true, order });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, paymentId, signature } = req.body || {};

  const result = payments.verifyPayment(
    { invoiceId: req.params.id, orderId, paymentId, signature },
    req.user
  );

  if (!result.alreadyPaid) {
    audit(req, "invoice_paid_online", {
      entity: "invoice",
      entityId: Number(req.params.id),
      details: `payment ${paymentId}`,
    });
  }

  res.json({ success: true, ...result });
});

export const collectPaymentAtCounter = asyncHandler(async (req, res) => {
  const invoice = payments.recordCounterPayment(req.params.id, req.body?.method, req.user);

  audit(req, "invoice_paid_counter", {
    entity: "invoice",
    entityId: Number(req.params.id),
    details: `${req.body?.method} — ${invoice.invoiceNo}`,
  });

  res.json({ success: true, invoice });
});

/* ------------------------------------------------------------------
   VIDEO CONSULTATION
------------------------------------------------------------------ */

export const videoJoinInfo = asyncHandler(async (req, res) => {
  res.json({ success: true, call: video.getJoinInfo(req.params.id, req.user) });
});

export const setAppointmentMode = asyncHandler(async (req, res) => {
  const mode = req.body?.mode === "video" ? "video" : "in_person";

  const appointment = video.setAppointmentMode(req.params.id, mode, req.user);

  audit(req, "appointment_mode_changed", {
    entity: "appointment",
    entityId: Number(req.params.id),
    details: `mode → ${mode}`,
  });

  res.json({ success: true, appointment });
});

export default {
  patientTimeline,
  videoJoinInfo,
  setAppointmentMode,
  paymentStatus,
  createPaymentOrder,
  verifyPayment,
  collectPaymentAtCounter,
  listWards,
  listBeds,
  createWard,
  updateWard,
  removeWard,
  createBed,
  updateBed,
  removeBed,
  assignBed,
  releaseBed,
  listDischarges,
  createDischarge,
  updateDischarge,
  removeDischarge,
  prescriptionPdf,
  dischargePdf,
  reportPdf,
};
