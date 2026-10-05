import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import * as doctors from "../services/doctorService.js";

export const list = asyncHandler(async (req, res) => {
  /* Only an administrator may see deactivated doctors. */
  const includeInactive =
    req.user?.role === "admin" && req.query.includeInactive === "true";

  res.json({
    success: true,
    doctors: await doctors.listDoctors({
      search: req.query.search || "",
      specialization: req.query.specialization || "",
      departmentId: req.query.departmentId || null,
      status: req.query.status || "",
      includeInactive,
    }),
    specializations: await doctors.listSpecializations(),
  });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, doctor: await doctors.getDoctor(req.params.id) });
});

export const availability = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...(await doctors.getAvailableSlots(req.params.id, req.query.date)),
  });
});

export const schedule = asyncHandler(async (req, res) => {
  res.json({ success: true, schedule: await doctors.getDoctorSchedule(req.params.id) });
});

/* ==================================================================
   ADMIN
================================================================== */

const doctorSchema = {
  name: rules.string({ min: 3, max: 80, label: "Doctor name" }),
  email: rules.email,
  phone: rules.phone({ required: false }),
  specialization: rules.string({ min: 2, max: 60, label: "Specialization" }),
  experienceYears: rules.integer({
    min: 0,
    max: 70,
    required: false,
    label: "Experience",
  }),
  consultationFee: rules.integer({
    min: 0,
    max: 1_000_000,
    required: false,
    label: "Consultation fee",
  }),
};

export const create = asyncHandler(async (req, res) => {
  validate(req.body || {}, doctorSchema);

  const doctor = await doctors.createDoctor(req.body);

  await audit(req, "doctor_created", {
    entity: "doctor",
    entityId: doctor.id,
    details: `Added doctor ${doctor.name} (${doctor.specialization}).`,
  });

  res.status(201).json({ success: true, doctor });
});

export const update = asyncHandler(async (req, res) => {
  validate(req.body || {}, doctorSchema);

  const doctor = await doctors.updateDoctor(req.params.id, req.body);

  await audit(req, "doctor_updated", {
    entity: "doctor",
    entityId: doctor.id,
    details: `Updated doctor ${doctor.name}.`,
  });

  res.json({ success: true, doctor });
});

export const setStatus = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    status: rules.oneOf(["active", "inactive"], { label: "Status" }),
  });

  const doctor = await doctors.setDoctorStatus(req.params.id, req.body.status);

  await audit(req, "doctor_status_changed", {
    entity: "doctor",
    entityId: doctor.id,
    details: `${doctor.name} set to ${doctor.status}.`,
  });

  res.json({ success: true, doctor });
});

export const remove = asyncHandler(async (req, res) => {
  const removed = await doctors.deleteDoctor(req.params.id);

  await audit(req, "doctor_deleted", {
    entity: "doctor",
    entityId: removed.id,
    details: `Deleted doctor ${removed.name}.`,
  });

  res.json({ success: true, message: `${removed.name} removed.` });
});

export const setSchedule = asyncHandler(async (req, res) => {
  const windows = Array.isArray(req.body?.windows) ? req.body.windows : [];

  const updated = await doctors.replaceDoctorSchedule(req.params.id, windows);

  await audit(req, "doctor_schedule_updated", {
    entity: "doctor",
    entityId: req.params.id,
    details: `${windows.length} availability window(s) saved.`,
  });

  res.json({ success: true, schedule: updated });
});
