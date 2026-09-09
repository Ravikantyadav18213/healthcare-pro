import api, { unwrap } from "./api.js";

export const appointmentService = {
  /* A user's own appointments. The server scopes this to the session. */
  mine: (params = {}) => unwrap(api.get("/appointments/me", { params })),

  next: () => unwrap(api.get("/appointments/me/next")),

  get: (id) => unwrap(api.get(`/appointments/${id}`)),

  book: (payload) => unwrap(api.post("/appointments", payload)),

  cancel: (id) => unwrap(api.patch(`/appointments/${id}/cancel`)),

  reschedule: (id, date, time) =>
    unwrap(api.patch(`/appointments/${id}/reschedule`, { date, time })),

  /* --- administrator only --- */
  all: (params = {}) => unwrap(api.get("/appointments", { params })),

  stats: () => unwrap(api.get("/appointments/admin/stats")),

  /* The admin decision endpoint; `note` reaches the patient. */
  setStatus: (id, status, note = "") =>
    unwrap(api.patch(`/appointments/${id}/status`, { status, note })),

  setNotes: (id, notes) => unwrap(api.patch(`/appointments/${id}/notes`, { notes })),

  remove: (id) => unwrap(api.delete(`/appointments/${id}`)),
};

export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
];

/* Decisions an administrator can record on a request. */
export const ADMIN_DECISIONS = [
  "confirmed",
  "rejected",
  "pending",
  "completed",
  "no_show",
  "cancelled",
];

export const STATUS_LABELS = {
  pending: "Pending",
  scheduled: "Pending",
  confirmed: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No Show",
};

export const STATUS_STYLES = {
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected:
    "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  completed:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  cancelled:
    "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  rescheduled:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  no_show:
    "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
};

/* A pending request is what the administrator has to act on. */
export const isAwaitingDecision = (status) =>
  status === "pending" || status === "scheduled";

export default appointmentService;
