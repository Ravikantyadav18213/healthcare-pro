import api, { unwrap, API_URL } from "./api.js";

export const reportService = {
  /* A user's own reports only — enforced server-side. */
  mine: (params = {}) => unwrap(api.get("/reports/me", { params })),

  get: (id) => unwrap(api.get(`/reports/${id}`)),

  /**
   * Streams the stored file through axios so the auth cookie is sent,
   * then hands the browser a blob URL to save.
   */
  async download(id, fallbackName = "report") {
    const response = await api.get(`/reports/${id}/download`, {
      responseType: "blob",
    });

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
  },

  /* --- administrator only --- */
  all: (params = {}) => unwrap(api.get("/reports", { params })),

  create: (payload, file = null) => {
    if (!file) return unwrap(api.post("/reports", payload));

    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, value);
    });
    form.append("file", file);

    return unwrap(
      api.post("/reports", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    );
  },

  update: (id, payload) => unwrap(api.put(`/reports/${id}`, payload)),

  remove: (id) => unwrap(api.delete(`/reports/${id}`)),
};

export const REPORT_TYPES = [
  "Laboratory",
  "Radiology",
  "Consultation",
  "Cardiology",
  "Pathology",
  "Discharge Summary",
];

export { API_URL };
export default reportService;
