import api, { unwrap } from "./api.js";

/* ==================================================================
   CLINICAL SERVICES

   Timeline, ward/bed board, discharge summaries, PDF documents and
   video consultations — the client half of /api/clinical, /api/wards,
   /api/beds and /api/pdf.
================================================================== */

/**
 * Stream a PDF through axios so the auth cookie travels with it, then
 * hand the browser a blob to save.
 *
 * A plain <a href> would drop the cookie on some browsers and, worse,
 * navigate away on failure instead of surfacing the error.
 */
async function downloadPdf(path, fallbackName) {
  const response = await api.get(path, { responseType: "blob" });

  const disposition = response.headers["content-disposition"] || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return filename;
}

export const timelineService = {
  /* No id: the server pins the timeline to the signed-in patient. */
  mine: (params = {}) => unwrap(api.get("/clinical/timeline", { params })),

  forPatient: (patientId, params = {}) =>
    unwrap(api.get(`/clinical/timeline/${patientId}`, { params })),
};

export const wardService = {
  list: () => unwrap(api.get("/wards")),
  create: (payload) => unwrap(api.post("/wards", payload)),
  update: (id, payload) => unwrap(api.patch(`/wards/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/wards/${id}`)),

  beds: (params = {}) => unwrap(api.get("/beds", { params })),
  addBed: (payload) => unwrap(api.post("/beds", payload)),
  updateBed: (id, payload) => unwrap(api.patch(`/beds/${id}`, payload)),
  removeBed: (id) => unwrap(api.delete(`/beds/${id}`)),
  assign: (bedId, patientId) => unwrap(api.post(`/beds/${bedId}/assign`, { patientId })),
  release: (bedId) => unwrap(api.post(`/beds/${bedId}/release`)),
};

export const dischargeService = {
  list: (params = {}) => unwrap(api.get("/discharge-summaries", { params })),
  create: (payload) => unwrap(api.post("/discharge-summaries", payload)),
  update: (id, payload) => unwrap(api.patch(`/discharge-summaries/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/discharge-summaries/${id}`)),

  downloadPdf: (id) => downloadPdf(`/pdf/discharge/${id}`, `discharge-summary-${id}.pdf`),
};

export const documentService = {
  prescriptionPdf: (prescriptionId) =>
    downloadPdf(`/pdf/prescription/${prescriptionId}`, `prescription-${prescriptionId}.pdf`),

  allPrescriptionsPdf: (patientId) =>
    downloadPdf(`/pdf/prescriptions/patient/${patientId}`, `prescriptions-PT-${patientId}.pdf`),

  reportPdf: (reportId) => downloadPdf(`/pdf/report/${reportId}`, `report-RPT-${reportId}.pdf`),
};

export const paymentService = {
  /* Whether the server has gateway keys at all — the Pay button is
     only offered when it does. */
  status: () => unwrap(api.get("/payments/status")),

  createOrder: (invoiceId) => unwrap(api.post(`/payments/invoice/${invoiceId}/order`)),

  verify: (invoiceId, payload) =>
    unwrap(api.post(`/payments/invoice/${invoiceId}/verify`, payload)),
};

export const videoService = {
  join: (appointmentId) => unwrap(api.get(`/appointments/${appointmentId}/video`)),

  setMode: (appointmentId, mode) =>
    unwrap(api.patch(`/appointments/${appointmentId}/mode`, { mode })),
};

export default {
  timelineService,
  wardService,
  dischargeService,
  documentService,
  videoService,
  paymentService,
};
