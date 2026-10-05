import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import * as patients from "../services/patientService.js";

/* ==================================================================
   ADMIN
================================================================== */

export const list = asyncHandler(async (req, res) => {
  const [rows, stats] = await Promise.all([
    patients.listPatients({
      search: req.query.search || "",
      departmentId: req.query.departmentId || null,
      status: req.query.status || "",
      limit: req.query.limit || null,
    }),
    patients.patientStats(),
  ]);

  res.json({ success: true, patients: rows, stats });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, patient: await patients.getPatient(req.params.id) });
});

const patientSchema = {
  name: rules.string({ min: 2, max: 80, label: "Patient name" }),
  phone: rules.phone({ required: false }),
  dateOfBirth: rules.date({ required: false, label: "Date of birth" }),
};

export const create = asyncHandler(async (req, res) => {
  validate(req.body || {}, patientSchema);

  const patient = await patients.createPatient(req.body);

  await audit(req, "patient_created", {
    entity: "patient",
    entityId: patient.id,
    details: `Added patient ${patient.name}.`,
  });

  res.status(201).json({ success: true, patient });
});

export const update = asyncHandler(async (req, res) => {
  validate(req.body || {}, patientSchema);

  const patient = await patients.updatePatient(req.params.id, req.body);

  await audit(req, "patient_updated", {
    entity: "patient",
    entityId: patient.id,
    details: `Updated patient ${patient.name}.`,
  });

  res.json({ success: true, patient });
});

export const remove = asyncHandler(async (req, res) => {
  const removed = await patients.deletePatient(req.params.id);

  await audit(req, "patient_deleted", {
    entity: "patient",
    entityId: removed.id,
    details: `Deleted patient ${removed.name}.`,
  });

  res.json({ success: true, message: `${removed.name} removed.` });
});

/* ==================================================================
   SELF-SERVICE

   A signed-in user can read and edit only the patient profile that
   is linked to their own account.
================================================================== */

export const getMine = asyncHandler(async (req, res) => {
  res.json({ success: true, patient: await patients.getOwnPatient(req.user.id) });
});

export const updateMine = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    phone: rules.phone({ required: false }),
    dateOfBirth: rules.date({ required: false, label: "Date of birth" }),
  });

  const patient = await patients.updateOwnPatient(req.user.id, req.body);

  await audit(req, "patient_updated", {
    entity: "patient",
    entityId: patient.id,
    details: "User updated their own medical profile.",
  });

  res.json({ success: true, patient });
});
