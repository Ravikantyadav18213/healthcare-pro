import api, { unwrap } from "./api.js";

/*
 * Every call here hits a doctor-guarded endpoint (/api/doctor/*). The
 * server independently re-derives the signed-in doctor from the
 * session and re-checks the doctor-patient relationship on every
 * patient-scoped call — this file is just the transport.
 */
export const doctorPortalService = {
  stats: () => unwrap(api.get("/doctor/stats")),

  /* ---- appointments ---- */
  appointments: (params = {}) => unwrap(api.get("/doctor/appointments", { params })),
  appointmentsToday: () => unwrap(api.get("/doctor/appointments/today")),
  appointmentsUpcoming: () => unwrap(api.get("/doctor/appointments/upcoming")),
  completeAppointment: (id) =>
    unwrap(api.patch(`/doctor/appointments/${id}/complete`)),

  /* ---- aggregated across all authorized patients ---- */
  myReports: () => unwrap(api.get("/doctor/reports")),
  myPrescriptions: () => unwrap(api.get("/doctor/prescriptions")),

  /* ---- patients ---- */
  patients: (params = {}) => unwrap(api.get("/doctor/patients", { params })),
  patient: (patientId) => unwrap(api.get(`/doctor/patients/${patientId}`)),
  patientHistory: (patientId) =>
    unwrap(api.get(`/doctor/patients/${patientId}/history`)),
  patientReports: (patientId) =>
    unwrap(api.get(`/doctor/patients/${patientId}/reports`)),
  patientPrescriptions: (patientId) =>
    unwrap(api.get(`/doctor/patients/${patientId}/prescriptions`)),
  patientAppointments: (patientId) =>
    unwrap(api.get(`/doctor/patients/${patientId}/appointments`)),

  addNote: (patientId, payload) =>
    unwrap(api.post(`/doctor/patients/${patientId}/notes`, payload)),
  addPrescription: (patientId, payload) =>
    unwrap(api.post(`/doctor/patients/${patientId}/prescriptions`, payload)),

  /* ---- profile ---- */
  profile: () => unwrap(api.get("/doctor/me")),
  updateProfile: (payload) => unwrap(api.patch("/doctor/me", payload)),

  /* The weekly clinic timetable booking slots are generated from —
     distinct from the coarse Available / In Surgery status flag. */
  schedule: () => unwrap(api.get("/doctor/me/schedule")),

  saveSchedule: (windows) => unwrap(api.put("/doctor/me/schedule", { windows })),
};

export default doctorPortalService;
