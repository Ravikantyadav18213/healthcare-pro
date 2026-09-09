import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import ApiError from "../utils/ApiError.js";
import { validate, rules } from "../validators/index.js";
import * as portal from "../services/doctorPortalService.js";
import * as doctors from "../services/doctorService.js";

/*
 * Every handler resolves the doctor from the authenticated session
 * (req.user.id -> doctors.user_id), never from a client-supplied id,
 * per the "never trust frontend doctorId/patientId" rule.
 */
function currentDoctor(req) {
  return portal.resolveDoctor(req.user.id);
}

/* ==================================================================
   DASHBOARD
================================================================== */

export const stats = asyncHandler(async (req, res) => {
  res.json({ success: true, stats: portal.dashboardStats(currentDoctor(req)) });
});

/* ==================================================================
   APPOINTMENTS
================================================================== */

export const listAppointments = asyncHandler(async (req, res) => {
  const items = portal.listMyAppointments(currentDoctor(req), {
    scope: req.query.scope || "",
    status: req.query.status || "",
    search: req.query.search || "",
  });

  res.json({ success: true, items });
});

export const todaysAppointments = asyncHandler(async (req, res) => {
  res.json({ success: true, items: portal.todaysAppointments(currentDoctor(req)) });
});

export const upcomingAppointments = asyncHandler(async (req, res) => {
  res.json({ success: true, items: portal.upcomingAppointments(currentDoctor(req)) });
});

export const completeAppointment = asyncHandler(async (req, res) => {
  const appointment = portal.markAppointmentCompleted(currentDoctor(req), req.params.id);

  audit(req, "appointment_viewed", {
    entity: "appointment",
    entityId: appointment.id,
    details: `Marked appointment #${appointment.id} completed.`,
  });

  res.json({ success: true, appointment });
});

/* ==================================================================
   REPORTS + PRESCRIPTIONS  (aggregated across all authorized patients)
================================================================== */

export const listReports = asyncHandler(async (req, res) => {
  res.json({ success: true, items: portal.listMyReports(currentDoctor(req)) });
});

export const listPrescriptions = asyncHandler(async (req, res) => {
  res.json({ success: true, items: portal.listMyPrescriptions(currentDoctor(req)) });
});

/* ==================================================================
   PATIENTS
================================================================== */

export const listPatients = asyncHandler(async (req, res) => {
  const items = portal.listMyPatients(currentDoctor(req), {
    search: req.query.search || "",
    status: req.query.status || "",
  });

  res.json({ success: true, items });
});

export const getPatient = asyncHandler(async (req, res) => {
  const doctor = currentDoctor(req);
  const patient = portal.getPatientForDoctor(doctor, req.params.patientId);

  audit(req, "patient_viewed", {
    entity: "patient",
    entityId: patient.id,
    details: `${doctor.name} viewed patient #${patient.id}.`,
  });

  res.json({ success: true, patient });
});

export const getPatientHistory = asyncHandler(async (req, res) => {
  const items = portal.getPatientHistory(currentDoctor(req), req.params.patientId);
  res.json({ success: true, items });
});

export const getPatientReports = asyncHandler(async (req, res) => {
  const doctor = currentDoctor(req);
  const items = portal.getPatientReports(doctor, req.params.patientId);

  audit(req, "report_viewed", {
    entity: "patient",
    entityId: req.params.patientId,
    details: `${doctor.name} viewed reports for patient #${req.params.patientId}.`,
  });

  res.json({ success: true, items });
});

export const getPatientPrescriptions = asyncHandler(async (req, res) => {
  const items = portal.getPatientPrescriptions(currentDoctor(req), req.params.patientId);
  res.json({ success: true, items });
});

export const getPatientAppointments = asyncHandler(async (req, res) => {
  const items = portal.getPatientAppointments(currentDoctor(req), req.params.patientId);
  res.json({ success: true, items });
});

export const createNote = asyncHandler(async (req, res) => {
  const doctor = currentDoctor(req);
  const entry = portal.createNote(doctor, req.params.patientId, req.body || {});

  audit(req, "patient_notes_created", {
    entity: "patient",
    entityId: req.params.patientId,
    details: `${doctor.name} added a clinical note for patient #${req.params.patientId}.`,
  });

  res.status(201).json({ success: true, entry });
});

export const createPrescription = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    medicine: rules.string({ min: 2, max: 200, label: "Medicine" }),
  });

  const doctor = currentDoctor(req);
  const prescription = portal.createPrescription(doctor, req.params.patientId, req.body || {});

  audit(req, "prescription_created", {
    entity: "patient",
    entityId: req.params.patientId,
    details: `${doctor.name} prescribed ${prescription.medicine} for patient #${req.params.patientId}.`,
  });

  res.status(201).json({ success: true, prescription });
});

/* ==================================================================
   PROFILE
================================================================== */

export const myProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, doctor: portal.getOwnProfile(currentDoctor(req)) });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    phone: rules.phone({ required: false }),
  });

  const doctor = portal.updateOwnProfile(currentDoctor(req), req.body || {});

  audit(req, "profile_updated", {
    entity: "doctor",
    entityId: doctor.id,
    details: "Doctor profile updated.",
  });

  res.json({ success: true, doctor });
});

/* ==================================================================
   MY WEEKLY HOURS

   The clinic timetable a doctor keeps, as opposed to the coarse
   Available / In Surgery status flag. Booking slots are generated
   from these windows, so a doctor editing their own hours is what
   actually changes what patients can book.

   The doctor id comes from the session like every other handler here
   — a doctor cannot edit somebody else's timetable by passing an id.
================================================================== */

export const mySchedule = asyncHandler(async (req, res) => {
  /* currentDoctor resolves the whole doctors row, not just its id. */
  const doctorId = currentDoctor(req).id;

  res.json({ success: true, schedule: doctors.getDoctorSchedule(doctorId) });
});

export const updateMySchedule = asyncHandler(async (req, res) => {
  const doctorId = currentDoctor(req).id;
  const windows = Array.isArray(req.body?.windows) ? req.body.windows : [];

  for (const window of windows) {
    validate(window, {
      weekday: rules.integer({ min: 0, max: 6, label: "Weekday" }),
      startTime: rules.time({ label: "Start time" }),
      endTime: rules.time({ label: "End time" }),
    });

    if (window.endTime <= window.startTime) {
      throw ApiError.badRequest(
        `A shift must end after it starts (${window.startTime}–${window.endTime}).`
      );
    }
  }

  const schedule = doctors.replaceDoctorSchedule(doctorId, windows);

  audit(req, "doctor_schedule_updated", {
    entity: "doctor",
    entityId: doctorId,
    details: `${windows.length} weekly shift window(s)`,
  });

  res.json({ success: true, schedule });
});
