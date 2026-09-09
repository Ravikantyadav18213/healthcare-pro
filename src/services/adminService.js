import api, { unwrap } from "./api.js";

/*
 * Everything here hits an administrator-guarded endpoint.
 * A normal user calling any of these receives HTTP 403.
 */

export const adminService = {
  /* ---- users ---- */
  users: (params = {}) => unwrap(api.get("/users", { params })),
  userStats: () => unwrap(api.get("/users/stats")),
  user: (id) => unwrap(api.get(`/users/${id}`)),
  userHistory: (id) => unwrap(api.get(`/users/${id}/history`)),
  setUserStatus: (id, status) =>
    unwrap(api.patch(`/users/${id}/status`, { status })),

  /* ---- analytics ---- */
  dashboard: () => unwrap(api.get("/stats/dashboard")),
  hospitalReports: (params = { days: 14 }) =>
    unwrap(api.get("/stats/reports", { params })),
  setIcuStatus: (total, occupied) =>
    unwrap(api.patch("/stats/icu", { total, occupied })),
  dischargedList: (search = "") =>
    unwrap(api.get("/stats/discharged", { params: { search } })),

  /* ---- audit ---- */
  audit: (params = {}) => unwrap(api.get("/audit", { params })),
};

export const patientService = {
  mine: () => unwrap(api.get("/patients/me")),
  updateMine: (payload) => unwrap(api.patch("/patients/me", payload)),

  list: (params = {}) => unwrap(api.get("/patients", { params })),
  get: (id) => unwrap(api.get(`/patients/${id}`)),
  create: (payload) => unwrap(api.post("/patients", payload)),
  update: (id, payload) => unwrap(api.put(`/patients/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/patients/${id}`)),
};

export const staffService = {
  list: (params = {}) => unwrap(api.get("/staff", { params })),
  create: (payload) => unwrap(api.post("/staff", payload)),
  setDepartment: (id, departmentId) =>
    unwrap(api.patch(`/staff/${id}/department`, { departmentId })),
  setWard: (id, wardId) => unwrap(api.patch(`/staff/${id}/ward`, { wardId })),
  setDuty: (id, dutyStatus) => unwrap(api.patch(`/staff/${id}/duty`, { dutyStatus })),
  /* Enable/disable is the same account-status endpoint every role
     uses — a staff account is a users row, not a separate resource. */
  setStatus: (id, status) => unwrap(api.patch(`/users/${id}/status`, { status })),
};

export const departmentService = {
  list: (params = {}) => unwrap(api.get("/departments", { params })),
  create: (payload) => unwrap(api.post("/departments", payload)),
  update: (id, payload) => unwrap(api.put(`/departments/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/departments/${id}`)),
};

export const pharmacyService = {
  list: (params = {}) => unwrap(api.get("/pharmacy", { params })),
  create: (payload) => unwrap(api.post("/pharmacy", payload)),
  update: (id, payload) => unwrap(api.put(`/pharmacy/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/pharmacy/${id}`)),
};

export const laboratoryService = {
  list: (params = {}) => unwrap(api.get("/laboratory", { params })),
  create: (payload) => unwrap(api.post("/laboratory", payload)),
  update: (id, payload) => unwrap(api.put(`/laboratory/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/laboratory/${id}`)),
};

export const billingService = {
  list: (params = {}) => unwrap(api.get("/billing", { params })),
  create: (payload) => unwrap(api.post("/billing", payload)),

  /* Amount/GST/discount/insurance only, and only while the invoice is
     still Pending — the server refuses anything else. */
  update: (id, payload) => unwrap(api.patch(`/billing/${id}`, payload)),

  setStatus: (id, status) => unwrap(api.patch(`/billing/${id}/status`, { status })),

  /* Cash, or a card/UPI machine at the counter — distinct from
     paymentService's Razorpay flow, which has an amount and a
     signature to verify. Here the staff member holding the money IS
     the verification; this just records who and how. */
  collectAtCounter: (id, method) =>
    unwrap(api.post(`/payments/invoice/${id}/collect`, { method })),
};

export const emergencyService = {
  overview: () => unwrap(api.get("/emergency")),
  create: (payload) => unwrap(api.post("/emergency", payload)),
  update: (id, payload) => unwrap(api.patch(`/emergency/${id}`, payload)),
};

/* Admin-only view of contact-form submissions — see publicService.js
   for the public POST that creates them. */
export const contactService = {
  list: (params = {}) => unwrap(api.get("/contact", { params })),
  markRead: (id) => unwrap(api.patch(`/contact/${id}/read`)),
  reply: (id, message) => unwrap(api.post(`/contact/${id}/reply`, { message })),
  remove: (id) => unwrap(api.delete(`/contact/${id}`)),
};

export default adminService;
