import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import * as appointments from "../services/appointmentService.js";

/* ==================================================================
   READ
================================================================== */

/** GET /api/appointments/me — always scoped to the signed-in user. */
export const listMine = asyncHandler(async (req, res) => {
  const result = appointments.listAppointments({
    userId: req.user.id,
    search: req.query.search || "",
    status: req.query.status || "all",
    scope: req.query.scope || "",
    limit: req.query.limit,
    offset: req.query.offset,
  });

  res.json({
    success: true,
    ...result,
    stats: appointments.appointmentStats(req.user.id),
  });
});

/** GET /api/appointments — admin only, hospital-wide. */
export const listAll = asyncHandler(async (req, res) => {
  const result = appointments.listAppointments({
    search: req.query.search || "",
    status: req.query.status || "all",
    scope: req.query.scope || "",
    from: req.query.from || "",
    to: req.query.to || "",
    doctorId: req.query.doctorId || null,
    departmentId: req.query.departmentId || null,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  res.json({
    success: true,
    ...result,
    stats: appointments.appointmentStats(),
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const row = appointments.getOwnedAppointment(req.params.id, req.user);
  res.json({ success: true, appointment: appointments.getAppointment(row.id) });
});

export const nextForMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    appointment: appointments.nextAppointmentFor(req.user.id),
  });
});

/* ==================================================================
   WRITE
================================================================== */

export const create = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    doctorId: rules.integer({ min: 1, label: "Doctor" }),
    date: rules.date({ label: "Appointment date" }),
    time: rules.time({ label: "Appointment time" }),
    reason: rules.string({ min: 3, max: 500, label: "Reason for visit" }),
  });

  const appointment = appointments.createAppointment(req.user, req.body);

  audit(req, "appointment_created", {
    entity: "appointment",
    entityId: appointment.id,
    details: `Appointment with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
  });

  res.status(201).json({ success: true, appointment });
});

export const cancel = asyncHandler(async (req, res) => {
  const appointment = appointments.cancelAppointment(req.user, req.params.id);

  audit(req, "appointment_cancelled", {
    entity: "appointment",
    entityId: appointment.id,
    details: `Cancelled appointment #${appointment.id}.`,
  });

  res.json({ success: true, appointment });
});

export const reschedule = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    date: rules.date({ label: "New date" }),
    time: rules.time({ label: "New time" }),
  });

  const appointment = appointments.rescheduleAppointment(
    req.user,
    req.params.id,
    req.body
  );

  audit(req, "appointment_rescheduled", {
    entity: "appointment",
    entityId: appointment.id,
    details: `Moved to ${appointment.date} ${appointment.time}.`,
  });

  res.json({ success: true, appointment });
});

/**
 * PATCH /api/appointments/:id/status — admin only.
 *
 * This is the approval endpoint: approve (confirmed), reject, keep
 * pending, complete, no-show or cancel. An optional note is passed on
 * to the patient in their notification.
 */
export const setStatus = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    status: rules.oneOf(appointments.ADMIN_DECISIONS, { label: "Decision" }),
    note: rules.string({ min: 0, max: 300, label: "Note" }),
  });

  const appointment = appointments.updateAppointmentStatus(
    req.user,
    req.params.id,
    req.body.status,
    req.body.note
  );

  audit(req, "appointment_status_changed", {
    entity: "appointment",
    entityId: appointment.id,
    details:
      `${appointment.patientName} with ${appointment.doctorName} ` +
      `set to ${appointment.status}` +
      (req.body.note ? ` — "${String(req.body.note).trim()}"` : "."),
  });

  res.json({ success: true, appointment });
});

/** DELETE /api/appointments/:id — admin only. */
export const remove = asyncHandler(async (req, res) => {
  const removed = appointments.deleteAppointment(req.user, req.params.id);

  audit(req, "appointment_deleted", {
    entity: "appointment",
    entityId: removed.id,
    details: `Deleted appointment #${removed.id} (${removed.patientName} with ${removed.doctorName}).`,
  });

  res.json({ success: true, message: "Appointment removed." });
});

export const setNotes = asyncHandler(async (req, res) => {
  const appointment = appointments.updateAppointmentNotes(
    req.params.id,
    req.body?.notes
  );

  audit(req, "appointment_notes_updated", {
    entity: "appointment",
    entityId: appointment.id,
  });

  res.json({ success: true, appointment });
});

export const stats = asyncHandler(async (req, res) => {
  res.json({ success: true, stats: appointments.appointmentStats() });
});
