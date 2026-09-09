import api, { unwrap } from "./api.js";

export const doctorService = {
  list: (params = {}) => unwrap(api.get("/doctors", { params })),

  get: (id) => unwrap(api.get(`/doctors/${id}`)),

  /* Real, live slot availability for a doctor on a given date. */
  availability: (id, date) =>
    unwrap(api.get(`/doctors/${id}/availability`, { params: { date } })),

  schedule: (id) => unwrap(api.get(`/doctors/${id}/schedule`)),

  /* --- administrator only --- */
  create: (payload) => unwrap(api.post("/doctors", payload)),

  update: (id, payload) => unwrap(api.put(`/doctors/${id}`, payload)),

  setStatus: (id, status) => unwrap(api.patch(`/doctors/${id}/status`, { status })),

  remove: (id) => unwrap(api.delete(`/doctors/${id}`)),

  setSchedule: (id, windows) =>
    unwrap(api.put(`/doctors/${id}/schedule`, { windows })),
};

export default doctorService;
