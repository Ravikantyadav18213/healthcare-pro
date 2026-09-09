import { Router } from "express";

import db from "../db.js";
import { config } from "../config/env.js";
import asyncHandler from "../utils/asyncHandler.js";

import { requireAuth, optionalAuth } from "../middleware/auth.js";
import {
  requireAdmin,
  requireDoctor,
  requireUser,
  requireRole,
} from "../middleware/rbac.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { uploadReportFile, uploadChatAttachment } from "../middleware/upload.js";

import * as auth from "../controllers/authController.js";
import * as users from "../controllers/userController.js";
import * as doctors from "../controllers/doctorController.js";
import * as patients from "../controllers/patientController.js";
import * as appointments from "../controllers/appointmentController.js";
import * as reports from "../controllers/reportController.js";
import * as catalog from "../controllers/catalogController.js";
import * as chat from "../controllers/chatController.js";
import * as doctorPortal from "../controllers/doctorPortalController.js";
import * as contact from "../controllers/contactController.js";
import * as clinical from "../controllers/clinicalController.js";

const router = Router();

/* ==================================================================
   HEALTH
================================================================== */

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "HealthCare Pro API",
    env: config.nodeEnv,
    authMode: config.authMode,
    time: new Date().toISOString(),
  });
});

/*
 * Row counts describe the hospital's population, so this is an
 * administrator diagnostic rather than a public liveness probe.
 * /health above stays open for load balancers and uptime checks.
 */
router.get(
  "/health/db",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const check = db.prepare("SELECT 1 AS ok").get();

    const counts = {
      users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      doctors: db.prepare("SELECT COUNT(*) AS n FROM doctors").get().n,
      departments: db.prepare("SELECT COUNT(*) AS n FROM departments").get().n,
      patients: db.prepare("SELECT COUNT(*) AS n FROM patients").get().n,
      appointments: db.prepare("SELECT COUNT(*) AS n FROM appointments").get().n,
      reports: db.prepare("SELECT COUNT(*) AS n FROM reports").get().n,
    };

    res.json({
      success: true,
      status: check?.ok === 1 ? "connected" : "unknown",
      driver: "better-sqlite3",
      counts,
    });
  })
);

/* ==================================================================
   AUTH  /api/auth
================================================================== */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "login",
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyPrefix: "register",
  message: "Too many accounts created from this device. Try again later.",
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyPrefix: "reset",
});

/* Looser than resetLimiter: a code is 6 digits, entered by hand, and a
   mistyped digit should not cost one of only 6 hourly attempts. */
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "reset-otp",
  message: "Too many attempts. Please request a new code.",
});

/* Keyed by IP alone (no account/email involved) — a handful of
   messages an hour from one visitor is plenty. */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: "contact",
  keyBy: "ip",
  message: "Too many messages sent. Please try again later.",
});

router.post("/auth/register", registerLimiter, auth.register);
router.post("/auth/login", loginLimiter, auth.login);

/* Second half of a 2FA login. Rate limited with the same bucket as
   login so code guessing costs an attacker the same as password
   guessing does. */
router.post("/auth/verify-2fa", loginLimiter, auth.verifyTwoFactor);
router.post("/auth/resend-2fa", loginLimiter, auth.resendTwoFactor);
router.patch("/auth/two-factor", requireAuth, auth.updateTwoFactor);
router.patch("/auth/language", requireAuth, auth.updateLanguage);
router.post("/auth/google", loginLimiter, auth.googleAuth);
router.post("/auth/refresh", auth.refresh);
router.post("/auth/logout", optionalAuth, auth.logout);
router.post("/auth/logout-all", requireAuth, auth.logoutAll);
router.get("/auth/me", requireAuth, auth.me);
router.patch("/auth/profile", requireAuth, auth.updateProfile);
/* Throttled like a sign-in: this endpoint checks the CURRENT password,
   so without a cap a stolen access token could be used to brute-force
   it (and each attempt costs the server a full bcrypt comparison). */
router.post(
  "/auth/change-password",
  requireAuth,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: "change-password",
    keyBy: "user",
    message: "Too many attempts. Please wait a few minutes and try again.",
  }),
  auth.changePassword
);
router.post("/auth/forgot-password", resetLimiter, auth.forgotPassword);
router.post("/auth/verify-reset-otp", otpVerifyLimiter, auth.verifyResetOtp);
router.post("/auth/reset-password", otpVerifyLimiter, auth.resetPassword);

/* ==================================================================
   USERS  /api/users   (administrator only)
================================================================== */

router.get("/users", requireAuth, requireAdmin, users.list);
router.get("/users/stats", requireAuth, requireAdmin, users.stats);
router.get("/users/:id", requireAuth, requireAdmin, users.getOne);
router.get("/users/:id/history", requireAuth, requireAdmin, users.history);
router.patch("/users/:id/status", requireAuth, requireAdmin, users.setStatus);

/* Staff directory. Enable/disable reuses /users/:id/status above —
   a nurse or receptionist account is a users row like any other, so
   there is no second status endpoint to keep in sync with it. */
router.get("/staff", requireAuth, requireAdmin, users.listStaff);
router.post("/staff", requireAuth, requireAdmin, users.createStaff);
router.patch("/staff/:id/department", requireAuth, requireAdmin, users.updateStaffDepartment);
router.patch("/staff/:id/ward", requireAuth, requireAdmin, users.updateStaffWard);
router.patch("/staff/:id/duty", requireAuth, requireAdmin, users.updateStaffDuty);

/* ==================================================================
   DOCTORS  /api/doctors
   Reading is available to any signed-in user so patients can browse
   and book. Writing is administrator only.
================================================================== */

router.get("/doctors", requireAuth, doctors.list);
router.get("/doctors/:id", requireAuth, doctors.getOne);
router.get("/doctors/:id/availability", requireAuth, doctors.availability);
router.get("/doctors/:id/schedule", requireAuth, doctors.schedule);

router.post("/doctors", requireAuth, requireAdmin, doctors.create);
router.put("/doctors/:id", requireAuth, requireAdmin, doctors.update);
router.patch("/doctors/:id/status", requireAuth, requireAdmin, doctors.setStatus);
router.put("/doctors/:id/schedule", requireAuth, requireAdmin, doctors.setSchedule);
router.delete("/doctors/:id", requireAuth, requireAdmin, doctors.remove);

/* ==================================================================
   PATIENTS  /api/patients
================================================================== */

/*
 * The patient's own medical profile. Reading is left open to any
 * signed-in account because it is strictly self-scoped (a doctor or
 * admin who reads it just gets their own, usually empty, row).
 * WRITING is gated to the patient role: without this a doctor could
 * PATCH /patients/me and materialise a patient medical record keyed
 * to their own clinician account — data that should not exist.
 */
router.get("/patients/me", requireAuth, patients.getMine);
router.patch("/patients/me", requireAuth, requireUser, patients.updateMine);

const requirePatientReader = requireRole("admin", "nurse", "receptionist");
const requirePatientWriter = requireRole("admin", "receptionist");

router.get("/patients", requireAuth, requirePatientReader, patients.list);
router.get("/patients/:id", requireAuth, requirePatientReader, patients.getOne);
router.post("/patients", requireAuth, requirePatientWriter, patients.create);
router.put("/patients/:id", requireAuth, requirePatientWriter, patients.update);
router.delete("/patients/:id", requireAuth, requireAdmin, patients.remove);

/* ==================================================================
   APPOINTMENTS  /api/appointments
================================================================== */

router.get("/appointments/me", requireAuth, appointments.listMine);
router.get("/appointments/me/next", requireAuth, appointments.nextForMe);

/*
 * Booking. A patient books for themselves; an administrator may book
 * on a patient's behalf (createAppointment branches on the admin
 * role). A doctor must NOT reach this path — otherwise they fall
 * through the non-admin branch and book an appointment as if they
 * were a patient, auto-creating a patient row for their own account.
 * Doctors act on appointments through the doctor portal instead.
 */
router.post(
  "/appointments",
  requireAuth,
  requireRole("user", "admin"),
  appointments.create
);
router.patch("/appointments/:id/cancel", requireAuth, appointments.cancel);
router.patch("/appointments/:id/reschedule", requireAuth, appointments.reschedule);
router.get("/appointments/:id", requireAuth, appointments.getOne);

/* The Appointments page itself admits nurses and receptionists too
   (front-desk work), so the endpoints it calls need to as well, or
   the page loads for them and every request 403s. Delete stays
   admin-only. */
const requireAppointmentStaff = requireRole("admin", "nurse", "receptionist");

router.get("/appointments", requireAuth, requireAppointmentStaff, appointments.listAll);
router.get(
  "/appointments/admin/stats",
  requireAuth,
  requireAppointmentStaff,
  appointments.stats
);
router.patch(
  "/appointments/:id/status",
  requireAuth,
  requireAppointmentStaff,
  appointments.setStatus
);
router.patch(
  "/appointments/:id/notes",
  requireAuth,
  requireAppointmentStaff,
  appointments.setNotes
);
router.delete("/appointments/:id", requireAuth, requireAdmin, appointments.remove);

/* ==================================================================
   REPORTS  /api/reports
================================================================== */

router.get("/reports/me", requireAuth, reports.listMine);
router.get("/reports/:id", requireAuth, reports.getOne);
router.get("/reports/:id/download", requireAuth, reports.download);

router.get("/reports", requireAuth, requireAdmin, reports.listAll);
router.post("/reports", requireAuth, requireAdmin, uploadReportFile, reports.create);
router.put("/reports/:id", requireAuth, requireAdmin, reports.update);
router.delete("/reports/:id", requireAuth, requireAdmin, reports.remove);

/* ==================================================================
   DEPARTMENTS  /api/departments
================================================================== */

router.get("/departments", requireAuth, catalog.listDepartments);
router.post("/departments", requireAuth, requireAdmin, catalog.createDepartment);
router.put("/departments/:id", requireAuth, requireAdmin, catalog.updateDepartment);
router.delete("/departments/:id", requireAuth, requireAdmin, catalog.removeDepartment);

/* ==================================================================
   PHARMACY / LABORATORY / BILLING / EMERGENCY  (administrator only)
================================================================== */

router.get("/pharmacy", requireAuth, requireAdmin, catalog.listPharmacy);
router.post("/pharmacy", requireAuth, requireAdmin, catalog.createPharmacyItem);
router.put("/pharmacy/:id", requireAuth, requireAdmin, catalog.updatePharmacyItem);
router.delete("/pharmacy/:id", requireAuth, requireAdmin, catalog.removePharmacyItem);

/* The Laboratory page itself admits nurses too, so the endpoints it
   calls need to as well, or the page loads for them and every
   request 403s. Delete stays admin-only. */
const requireLabStaff = requireRole("admin", "nurse");

router.get("/laboratory", requireAuth, requireLabStaff, catalog.listLab);
router.post("/laboratory", requireAuth, requireLabStaff, catalog.createLabTest);
router.put("/laboratory/:id", requireAuth, requireLabStaff, catalog.updateLabTest);
router.delete("/laboratory/:id", requireAuth, requireAdmin, catalog.removeLabTest);

/* The Billing page itself now admits receptionists too (front-desk
   work), so the endpoints it actually calls — list, create, edit —
   need to as well, or the page loads for them and every request on
   it 403s. /status stays admin-only: nothing in the current UI calls
   it any more (Record Payment replaced the old plain "Mark paid"),
   so there is no receptionist flow depending on it. */
const requireBillingStaff = requireRole("admin", "receptionist");

router.get("/billing", requireAuth, requireBillingStaff, catalog.listBilling);
router.post("/billing", requireAuth, requireBillingStaff, catalog.createInvoice);
router.patch("/billing/:id", requireAuth, requireBillingStaff, catalog.updateInvoice);
router.patch("/billing/:id/status", requireAuth, requireAdmin, catalog.updateInvoiceStatus);

/* The Emergency page itself admits nurses too, so the endpoints it
   calls need to as well, or the page loads for them and every
   request 403s. */
const requireEmergencyStaff = requireRole("admin", "nurse");

router.get("/emergency", requireAuth, requireEmergencyStaff, catalog.emergencyOverview);
router.post("/emergency", requireAuth, requireEmergencyStaff, catalog.createEmergencyCase);
router.patch("/emergency/:id", requireAuth, requireEmergencyStaff, catalog.updateEmergencyCase);

/* ==================================================================
   NOTIFICATIONS  /api/notifications
================================================================== */

router.get("/notifications", requireAuth, catalog.listNotifications);
router.patch("/notifications/:id/read", requireAuth, catalog.markNotificationRead);
router.patch("/notifications/read-all", requireAuth, catalog.markAllNotificationsRead);

/* ==================================================================
   CHAT  /api/chat
   /api/chat/doctor-request(s)

   Patient <-> Admin is always allowed. Patient <-> Doctor is gated on
   an explicit administrator approval — every enforcement lives in
   chatService.js, not here; these routes only authenticate.
================================================================== */

router.get("/chat/conversations", requireAuth, chat.listConversations);
router.get("/chat/conversations/:id", requireAuth, chat.getConversation);
router.get("/chat/conversations/:id/messages", requireAuth, chat.listMessages);
router.post("/chat/conversations/:id/messages", requireAuth, chat.sendMessage);
router.post(
  "/chat/conversations/:id/attachments",
  requireAuth,
  /* Authorise the conversation BEFORE multer writes anything to disk. */
  chat.authorizeAttachment,
  uploadChatAttachment,
  chat.sendAttachment
);
router.get("/chat/messages/:id/attachment", requireAuth, chat.downloadAttachment);
router.patch("/chat/messages/:id/read", requireAuth, chat.markMessageRead);

router.post("/chat/admin", requireAuth, chat.startAdminChat);

router.post("/chat/doctor-request", requireAuth, chat.createDoctorRequest);
router.get("/chat/doctor-requests", requireAuth, chat.listDoctorRequests);
router.patch(
  "/chat/doctor-requests/:id/approve",
  requireAuth,
  requireAdmin,
  chat.approveDoctorRequest
);
router.patch(
  "/chat/doctor-requests/:id/reject",
  requireAuth,
  requireAdmin,
  chat.rejectDoctorRequest
);
router.patch(
  "/chat/doctor-requests/:id/revoke",
  requireAuth,
  requireAdmin,
  chat.revokeDoctorRequest
);

/* ==================================================================
   DOCTOR PORTAL  /api/doctor
   Every route requires an authenticated doctor session; patient-scoped
   routes are additionally gated on the doctor-patient relationship
   inside doctorPortalService.js (never trust a client-supplied id).
================================================================== */

router.get("/doctor/stats", requireAuth, requireDoctor, doctorPortal.stats);

router.get("/doctor/appointments", requireAuth, requireDoctor, doctorPortal.listAppointments);
router.get(
  "/doctor/appointments/today",
  requireAuth,
  requireDoctor,
  doctorPortal.todaysAppointments
);
router.get(
  "/doctor/appointments/upcoming",
  requireAuth,
  requireDoctor,
  doctorPortal.upcomingAppointments
);
router.patch(
  "/doctor/appointments/:id/complete",
  requireAuth,
  requireDoctor,
  doctorPortal.completeAppointment
);

router.get("/doctor/reports", requireAuth, requireDoctor, doctorPortal.listReports);
router.get(
  "/doctor/prescriptions",
  requireAuth,
  requireDoctor,
  doctorPortal.listPrescriptions
);

router.get("/doctor/patients", requireAuth, requireDoctor, doctorPortal.listPatients);
router.get(
  "/doctor/patients/:patientId",
  requireAuth,
  requireDoctor,
  doctorPortal.getPatient
);
router.get(
  "/doctor/patients/:patientId/history",
  requireAuth,
  requireDoctor,
  doctorPortal.getPatientHistory
);
router.get(
  "/doctor/patients/:patientId/reports",
  requireAuth,
  requireDoctor,
  doctorPortal.getPatientReports
);
router.get(
  "/doctor/patients/:patientId/prescriptions",
  requireAuth,
  requireDoctor,
  doctorPortal.getPatientPrescriptions
);
router.get(
  "/doctor/patients/:patientId/appointments",
  requireAuth,
  requireDoctor,
  doctorPortal.getPatientAppointments
);
router.post(
  "/doctor/patients/:patientId/notes",
  requireAuth,
  requireDoctor,
  doctorPortal.createNote
);
router.post(
  "/doctor/patients/:patientId/prescriptions",
  requireAuth,
  requireDoctor,
  doctorPortal.createPrescription
);

router.get("/doctor/me", requireAuth, requireDoctor, doctorPortal.myProfile);
router.patch("/doctor/me", requireAuth, requireDoctor, doctorPortal.updateMyProfile);
router.get("/doctor/me/schedule", requireAuth, requireDoctor, doctorPortal.mySchedule);
router.put("/doctor/me/schedule", requireAuth, requireDoctor, doctorPortal.updateMySchedule);

/* ==================================================================
   AUDIT + ANALYTICS  (administrator only)
================================================================== */

router.get("/audit", requireAuth, requireAdmin, catalog.listAudit);
router.get("/stats/dashboard", requireAuth, requireAdmin, catalog.adminDashboard);
router.get("/stats/reports", requireAuth, requireAdmin, catalog.hospitalReports);
router.get("/stats/reports/pdf", requireAuth, requireAdmin, catalog.hospitalReportsPdf);
router.patch("/stats/icu", requireAuth, requireAdmin, catalog.updateIcuStatus);
router.get("/stats/discharged", requireAuth, requireAdmin, catalog.dischargedList);

/* ==================================================================
   CONTACT US
================================================================== */

router.post("/contact", contactLimiter, contact.submit);
router.get("/contact", requireAuth, requireAdmin, contact.list);
router.patch("/contact/:id/read", requireAuth, requireAdmin, contact.markRead);
router.post("/contact/:id/reply", requireAuth, requireAdmin, contact.reply);
router.delete("/contact/:id", requireAuth, requireAdmin, contact.remove);

/* ==================================================================
   CLINICAL RECORDS — timeline, wards/beds, discharge, PDFs
================================================================== */

/* Nurses and receptionists work the ward board; a receptionist can
   see it but not rearrange the beds on it. */
const requireClinicalStaff = requireRole("admin", "doctor", "nurse", "receptionist");
const requireWardEditor = requireRole("admin", "nurse");

/* A patient's own timeline needs no id — resolvePatientScope pins it
   to their account and ignores anything they pass. */
router.get("/clinical/timeline", requireAuth, clinical.patientTimeline);
router.get(
  "/clinical/timeline/:patientId",
  requireAuth,
  requireClinicalStaff,
  clinical.patientTimeline
);

router.get("/wards", requireAuth, requireClinicalStaff, clinical.listWards);
router.post("/wards", requireAuth, requireWardEditor, clinical.createWard);
router.patch("/wards/:id", requireAuth, requireWardEditor, clinical.updateWard);
router.delete("/wards/:id", requireAuth, requireAdmin, clinical.removeWard);

router.get("/beds", requireAuth, requireClinicalStaff, clinical.listBeds);
router.post("/beds", requireAuth, requireWardEditor, clinical.createBed);
router.patch("/beds/:id", requireAuth, requireWardEditor, clinical.updateBed);
router.delete("/beds/:id", requireAuth, requireAdmin, clinical.removeBed);
router.post("/beds/:id/assign", requireAuth, requireWardEditor, clinical.assignBed);
router.post("/beds/:id/release", requireAuth, requireWardEditor, clinical.releaseBed);

router.get("/discharge-summaries", requireAuth, clinical.listDischarges);
router.post(
  "/discharge-summaries",
  requireAuth,
  requireRole("admin", "doctor"),
  clinical.createDischarge
);
router.patch(
  "/discharge-summaries/:id",
  requireAuth,
  requireRole("admin", "doctor"),
  clinical.updateDischarge
);
router.delete("/discharge-summaries/:id", requireAuth, requireAdmin, clinical.removeDischarge);

/* Online payments. The amount comes from the invoice row, never from
   the request, and the confirmation is only accepted with a valid
   Razorpay signature — both enforced inside paymentService. */
router.get("/payments/status", requireAuth, clinical.paymentStatus);
router.post("/payments/invoice/:id/order", requireAuth, clinical.createPaymentOrder);
router.post("/payments/invoice/:id/verify", requireAuth, clinical.verifyPayment);

/* Cash, or a card/UPI machine at the counter — staff-only, since a
   patient recording their own cash payment defeats the point. */
router.post(
  "/payments/invoice/:id/collect",
  requireAuth,
  requireRole("admin", "receptionist"),
  clinical.collectPaymentAtCounter
);

/* Video consultation. Participation is checked inside the service
   from the session, so no role gate is needed here beyond auth. */
router.get("/appointments/:id/video", requireAuth, clinical.videoJoinInfo);
router.patch("/appointments/:id/mode", requireAuth, clinical.setAppointmentMode);

/* PDFs. Each handler checks ownership itself, so a patient hitting
   these with someone else's id gets a 403 rather than a document. */
router.get("/pdf/prescription/:id", requireAuth, clinical.prescriptionPdf);
router.get("/pdf/prescriptions/patient/:patientId", requireAuth, clinical.prescriptionPdf);
router.get("/pdf/discharge/:id", requireAuth, clinical.dischargePdf);
router.get("/pdf/report/:id", requireAuth, clinical.reportPdf);

export default router;
