import api, { unwrap } from "./api.js";

export const chatService = {
  listConversations: () => unwrap(api.get("/chat/conversations")),

  getConversation: (id) => unwrap(api.get(`/chat/conversations/${id}`)),

  listMessages: (id, params = {}) =>
    unwrap(api.get(`/chat/conversations/${id}/messages`, { params })),

  sendMessage: (id, message) =>
    unwrap(api.post(`/chat/conversations/${id}/messages`, { message })),

  markMessageRead: (id) => unwrap(api.patch(`/chat/messages/${id}/read`)),

  /*
   * One multipart request carries the file and creates the message —
   * the server decides the stored path, so nothing client-side can
   * point a message at a file it does not own.
   */
  sendAttachment: (id, file, { message = "", duration = null } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (message) form.append("message", message);
    if (duration) form.append("duration", String(Math.round(duration)));

    return unwrap(
      api.post(`/chat/conversations/${id}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      })
    );
  },

  /*
   * Attachments sit behind the authenticated API, not a public folder,
   * so they are fetched as a blob and handed to <img>/<audio> as an
   * object URL. Pointing those tags straight at the API would rely on
   * the auth cookie riding along on a cross-origin subresource
   * request, which only holds while the app and the API are same-site.
   */
  fetchAttachment: (messageId) =>
    api
      .get(`/chat/messages/${messageId}/attachment`, { responseType: "blob" })
      .then((response) => response.data),

  /* Patient <-> Admin — always allowed, creates/reuses the one thread. */
  startAdminChat: () => unwrap(api.post("/chat/admin")),

  /* Patient <-> Doctor — creates a pending approval request only. */
  requestDoctorChat: (payload) => unwrap(api.post("/chat/doctor-request", payload)),

  listDoctorRequests: (status = "all") =>
    unwrap(api.get("/chat/doctor-requests", { params: { status } })),

  approveDoctorRequest: (id) =>
    unwrap(api.patch(`/chat/doctor-requests/${id}/approve`)),

  rejectDoctorRequest: (id, rejectionReason) =>
    unwrap(api.patch(`/chat/doctor-requests/${id}/reject`, { rejectionReason })),

  revokeDoctorRequest: (id) =>
    unwrap(api.patch(`/chat/doctor-requests/${id}/revoke`)),
};

export default chatService;
